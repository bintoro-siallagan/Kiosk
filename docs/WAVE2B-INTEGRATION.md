# Wave 2B — Bridge + Missing UIs

Patch 3 file untuk closing gaps Wave 2:

| File | Lines | Purpose |
|---|---|---|
| `server/procurement-finance-bridge.js` | ~330 | **2 hook kritis**: weighted-avg `last_cost` on GR + payment → finance_expense auto-link |
| `client/src/Admin/AdminProcurementGaps.jsx` | ~470 | UI buat Returns/Advances/Aging/PR-Suggest |
| `client/src/Admin/AdminMenuBuilder.jsx` | ~310 | UI buat Size Variants + Packages |

## 1. Bridge — wajib di-wire biar data akurat

### A. Setup

```js
// server/index.js
const { setupBridge } = require('./procurement-finance-bridge');

const bridge = setupBridge(app, {
  dbPath: path.join(__dirname, '..', 'data', 'kiosk.db'),
  mountPath: '/api/bridge'
});

// expose hooks globally biar procurement-backend bisa panggil
global.onGoodsReceived = bridge.onGoodsReceived;
global.onPaymentRecorded = bridge.onPaymentRecorded;
```

### B. Hook ke existing procurement-backend.js — **2 tempat saja**

**Tempat 1: GR finalize handler** (cari `POST /api/procurement/gr` di procurement-backend.js):

```js
// di akhir handler GR creation/finalize, SETELAH stock di-increment:
const bridgeResult = global.onGoodsReceived?.(info.lastInsertRowid);
if (bridgeResult && !bridgeResult.ok) {
  console.warn('[bridge] last_cost update issues:', bridgeResult.errors);
}
// res.json({ ... bridge: bridgeResult });
```

**Tempat 2: Payment create handler** (cari `POST /api/procurement/payments`):

```js
// setelah payment row di-create:
const expense = global.onPaymentRecorded?.(info.lastInsertRowid);
if (expense?.ok) {
  console.log(`[bridge] linked finance_expense ${expense.doc_no}`);
}
// optionally include in response: res.json({ ..., expense_link: expense });
```

Total: **2 baris tambahan** di existing procurement-backend.js, gak edit logic lain.

### C. Backfill — kalau udah ada data historis

Pas first deploy Wave 2 ke production yang udah jalan beberapa bulan:

```bash
# 1. Cek coverage current:
curl http://localhost:3001/api/bridge/last-cost-coverage
# Output: { total_skus: 17, with_cost: 0, coverage_pct: 0, ... }

# 2. Backfill last_cost dari semua GR historis:
curl -X POST http://localhost:3001/api/bridge/backfill-last-costs \
  -H 'Content-Type: application/json' -d '{}'
# Output: { processed: 50, updates: 47, errors: 3 }

# 3. Backfill finance_expenses dari semua procurement payments:
curl -X POST http://localhost:3001/api/bridge/backfill-expenses \
  -H 'Content-Type: application/json' -d '{}'
# Output: { processed: 20, linked: 20, skipped: 0, errors: 0 }

# 4. Verify
curl http://localhost:3001/api/bridge/last-cost-coverage
curl http://localhost:3001/api/bridge/expense-link-coverage
```

Setelah backfill: **COGS report sekarang akurat** (gak lagi 0), **Finance P&L include cost bahan baku** (gak under-report).

### D. Endpoint summary `/api/bridge/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/on-goods-received/:gr_id` | manual trigger weighted-avg untuk 1 GR |
| POST | `/on-payment-recorded/:payment_id` | manual link payment → expense |
| POST | `/backfill-last-costs` | retro-apply ke semua GR |
| POST | `/backfill-expenses` | retro-link semua payments |
| GET | `/last-cost-coverage` | % SKU yang udah punya last_cost |
| GET | `/expense-link-coverage` | % payment yang udah ke-link expense |

## 2. AdminProcurementGaps.jsx — wiring

### Pasangkan ke AdminProcurement.jsx existing (recommended)

Asumsi memory: AdminProcurement.jsx udah punya 7 sub-tabs (Dashboard, Suppliers, PR, PO, GR, Invoices, Payments). Tambahin 4 tab baru:

```jsx
// AdminProcurement.jsx
import AdminProcurementGaps from './AdminProcurementGaps';

const tabs = [
  /* existing 7 */,
  { k: 'returns', l: 'Returns' },
  { k: 'advances', l: 'Advances' },
  { k: 'aging', l: 'Aging' },
  { k: 'suggest', l: 'PR Suggest' },
];

{['returns','advances','aging','suggest'].includes(subTab) && <AdminProcurementGaps initialTab={subTab} />}
```

Atau simplest: bikin sub-tab "Wave 2" yang nge-render full AdminProcurementGaps:

```jsx
{ k: 'wave2', l: 'Wave 2 (Returns/Advances/...)' }

{subTab === 'wave2' && <AdminProcurementGaps />}
```

### Standalone — tambah tab Procurement2 di AdminTools.jsx

```jsx
// AdminTools.jsx
{ key: 'procurement_wave2', label: 'Procurement+' }

{activeTab === 'procurement_wave2' && <AdminProcurementGaps />}
```

### Smoke test setelah wiring

1. Buka tab → cek Dashboard (Aging summary, Urgent PR Suggestions, Recent Returns, Pending Advances)
2. Returns tab → "+ Return" → fill GR ID + supplier + items → Save Draft → klik Finalize
3. Advances tab → "+ DP" → fill amount + supplier → klik Apply nanti dengan invoice ID
4. Aging tab → otomatis show per-supplier outstanding bucket
5. PR Suggest tab → adjust parameters → "Gen Draft (High)" → copy shape ke /api/procurement/pr POST

## 3. AdminMenuBuilder.jsx — wiring

### Pasangkan ke AdminMasterItem.jsx existing

AdminMasterItem.jsx existing punya 7 sub-tab (Menus, Extras, Categories, Groups, Units, COGS, Seed). Tambahin 2 tab baru:

```jsx
// AdminMasterItem.jsx
import AdminMenuBuilder from './AdminMenuBuilder';

const tabs = [
  /* existing 7 */,
  { k: 'builder', l: 'Builder (Sizes + Packages)' },
];

{subTab === 'builder' && <AdminMenuBuilder />}
```

### Smoke test

1. **Sizes tab**:
   - Verify 3 default sizes ada (small/medium/large)
   - Select menu "froyo-original" → click "+ Small" → set price_adjustment=-5000, bom_multiplier=0.7 → Add "+ Medium" (default), "+ Large" (price+10000, mult 1.4) → Save Variants
   - Cek di POS apakah size selector muncul

2. **Packages tab**:
   - "+ Package" → ID "combo-2", Nama "Combo Berdua", price=55000
   - Add 2 items: froyo-original + froyo-strawberry, qty 1 each
   - Lihat Pricing Analysis box (savings calc real-time)
   - Save
   - Cek POS apakah combo muncul di menu (call `/api/master/menu-full` to verify)

## 4. POS sale flow — order item shape baru

Pas customer pilih size atau package, order item shape harus include `size_id`:

```js
// Sale dengan size
{
  menu_id: 'froyo-original',
  qty: 1,
  size_id: 'large',           // NEW
  extras: [{ extra_id: 't-granola', qty: 1 }]
}

// Sale package — V2 auto-expand
{
  menu_id: 'combo-2',         // package ID
  qty: 1
  // size_id, extras tidak relevan — package items have their own size_id
}

// Submit ke V2 endpoint:
fetch('/api/master/consume-stock-v2', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ items: [...], order_ref, actor })
});
```

POSConfirm.jsx existing perlu di-update buat:
1. Display size selector kalau menu punya variants (cek `menu.size_variants` dari `/api/master/menu-full`)
2. Update price calc berdasarkan size selected
3. Treat package items differently (gak show extras selector buat package, atau pakai bundled selection)

Karena ini ngubah POS UI yang udah jalan, **opsional di awal** — bisa rollout sizes/packages bertahap sambil POS Phase 5 di-build.

## 5. Order of operations buat first deploy Wave 2

Recommended urutan:

```
1. Deploy backend (all wave 1 + 2 + 2b modules)
   ↓
2. Hook bridge ke procurement (2 baris edit di existing)
   ↓
3. Restart server, verify [bridge] mounted at /api/bridge
   ↓
4. Run backfill (cost + expenses) — one-shot
   ↓
5. Verify P&L Finance dashboard show non-zero numbers
   ↓
6. Deploy frontend (AdminFinance, AdminProcurementGaps, AdminMenuBuilder)
   ↓
7. Train manager: input expenses manual via Finance tab, review Aging weekly,
   set BOM untuk semua menu via Master Item, set size variants per menu
   ↓
8. Optional: gradually enable size variants + packages in POS UI
```

## 6. Yang sengaja di-skip Wave 2B (future)

- **POS UI integration buat sizes + packages** — POSConfirm.jsx perlu refactor; out of scope karena memory bilang POS Phase 1-4A udah jalan. Phase 5 nanti.
- **Receipt printing dengan tax breakdown** — hardware varies (escpos / browser print / PDF), bikin separately
- **Multi-branch / multi-outlet** — bites-kiosk single outlet, gak relevan
- **GL / Journal entries** — bukan ERP, kasir cukup
- **Supplier portal** (supplier login lihat PO/invoice mereka) — feature ESB Core enterprise
- **Email/WhatsApp notification untuk aging overdue** — bisa nge-tap webhook eksisting

Ping kalau salah satu di atas perlu di-buildkan.

## 7. Verification checklist after full Wave 1 + 2 + 2B deploy

```bash
# Modul ter-mount?
curl -s http://localhost:3001/api/master/units && echo "✓ master-items"
curl -s http://localhost:3001/api/procurement/wave2-dashboard && echo "✓ procurement"
curl -s http://localhost:3001/api/finance/dashboard && echo "✓ finance"
curl -s http://localhost:3001/api/pos/config && echo "✓ phase4b"
curl -s http://localhost:3001/api/master/packages && echo "✓ menu-builder"
curl -s http://localhost:3001/api/bridge/last-cost-coverage && echo "✓ bridge"

# Data integrity check
curl -s http://localhost:3001/api/bridge/last-cost-coverage | jq .coverage_pct
# Idealnya >80% (sisanya SKU yang belum pernah masuk via GR)

curl -s http://localhost:3001/api/bridge/expense-link-coverage | jq .coverage_pct
# Idealnya 100% (semua payment ke-link expense)

# COGS BOM availability
curl -s http://localhost:3001/api/master/cogs-report | jq '[.[] | .bom_complete] | (length - (map(select(.)) | length))'
# Idealnya 0 (semua menu punya BOM lengkap)
```

Kalau 3 metric di atas ✓, sistem lo udah produksi-ready buat F&B kiosk.
