# Bites-Kiosk Wave 2 — Integration Guide

3 modul baru:
1. **Finance** — `/api/finance/*` — P&L, expense, COGS dari BOM, tax
2. **Procurement Gaps** — `/api/procurement/*` (additive) — Purchase Return + Invoice Aging + Advance Purchase + PR Qty Suggestion
3. **Menu Builder** — `/api/master/*` (additive) — Size variants + Packages/Bundles + V2 stock consumption

## File Manifest

| File | Lines | Function |
|---|---|---|
| `server/finance-backend.js` | ~570 | Schema + P&L calc + expense CRUD + tax config |
| `server/procurement-gaps-backend.js` | ~430 | Returns + advances + aging + suggestion |
| `server/master-menu-builder-backend.js` | ~370 | Sizes + packages + consumeStockForOrderV2 |
| `client/src/Admin/AdminFinance.jsx` | ~570 | Dashboard, P&L, expenses, tax UI |
| `WAVE2-INTEGRATION.md` | this | wiring + smoke tests |

## 1. Wiring all 3 modules

Di `server/index.js`, **urutan setup penting** (dependencies):

```js
// ... existing setup ...
const { setupProcurement } = require('./procurement-backend');
const { setupMasterItems } = require('./master-items-backend');
const { setupPhase4B } = require('./pos-phase4b-backend');

// === WAVE 2 ===
const { setupMenuBuilder } = require('./master-menu-builder-backend');
const { setupProcurementGaps } = require('./procurement-gaps-backend');
const { setupFinance } = require('./finance-backend');

const DB = path.join(__dirname, '..', 'data', 'kiosk.db');

// (existing) procurement + master-items + phase4b must be set up first
const procurement = setupProcurement(app, { dbPath: DB, mountPath: '/api/procurement' });
const masterItems = setupMasterItems(app, { dbPath: DB, mountPath: '/api/master' });
const phase4b = setupPhase4B(app, { dbPath: DB, mountPath: '/api/pos' });

// (new wave 2 — additive)
const menuBuilder = setupMenuBuilder(app, { dbPath: DB, mountPath: '/api/master' });
const procurementGaps = setupProcurementGaps(app, { dbPath: DB, mountPath: '/api/procurement' });
const finance = setupFinance(app, { dbPath: DB, mountPath: '/api/finance' });

// Swap to V2 stock consumption (supports size + packages):
global.consumeStockForOrder = menuBuilder.consumeStockForOrderV2;
global.logPosEvent = phase4b.logPosEvent;
global.getMenuPrice = menuBuilder.getMenuPrice;
```

**Penting:** procurement-gaps mount di `/api/procurement` (same as base procurement) → endpoint baru `/returns/*`, `/advances/*`, `/invoice-aging`, `/pr-suggest` keliatan satu kesatuan. Sama untuk menu-builder di `/api/master`.

## 2. Procurement → Finance auto-link

Memory bilang Phase 4A procurement payment auto-create finance_expense. Untuk pastiin tetap jalan:

```js
// di procurement-backend.js (existing), pas payment created — wajib panggil:
finance.createExpense({
  category_id: 'cogs-bahan-baku',
  expense_date: payment.payment_date,
  amount: payment.amount,
  vendor: supplier.name,
  description: `Payment to ${supplier.name} for ${payment.invoice_doc_no}`,
  reference_type: 'procurement_payment',
  reference_id: payment.id,
  payment_method: payment.method,
  created_by: payment.created_by
});
```

Existing `procurement-backend.js` perlu di-update buat ini (atau attach hook via WebSocket / express middleware).

## 3. POS Sale → V2 Consumption hook

Update existing sale handler buat support size + package. Order item shape SEKARANG:

```js
const result = global.consumeStockForOrder([
  { menu_id: 'froyo-strawberry', qty: 1, size_id: 'large', extras: [{ extra_id: 't-granola', qty: 1 }] },
  { menu_id: 'combo-couple',      qty: 1 }  // package — auto-expand
], { order_ref, actor, allow_negative: false });
```

V2 backward-compatible — kalau `size_id` gak ada, treat as base price/BOM. Kalau `menu_id` adalah package, auto-expand ke items.

## 4. Master Menu Builder — usage flow

### A. Set up sizes per menu

```bash
# 1. Default 3 size sudah di-seed (small/medium/large)
curl http://localhost:3001/api/master/menu-sizes

# 2. Set size variants buat menu 'froyo-original':
curl -X PUT http://localhost:3001/api/master/menus/froyo-original/sizes \
  -H 'Content-Type: application/json' \
  -d '{
    "variants": [
      { "size_id": "small",  "price_adjustment": -5000, "bom_multiplier": 0.7, "is_default": false },
      { "size_id": "medium", "price_adjustment": 0,     "bom_multiplier": 1.0, "is_default": true  },
      { "size_id": "large",  "price_adjustment": 10000, "bom_multiplier": 1.4, "is_default": false }
    ]
  }'

# 3. Pas dijual size 'large':
#    - Display price = base 25000 + 10000 = 35000
#    - BOM consumes 150gr × 1.4 = 210gr froyo base, etc.
```

### B. Create package/bundle

```bash
curl -X POST http://localhost:3001/api/master/packages \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "combo-couple",
    "name": "Combo Couple",
    "emoji": "💑",
    "description": "2 froyo medium + 1 granola sharing",
    "package_price": 55000,
    "items": [
      { "menu_id": "froyo-original",  "size_id": "medium", "qty": 2 },
      { "menu_id": "froyo-strawberry","size_id": "medium", "qty": 0 }
    ]
  }'

# Cek package detail (dengan savings calc):
curl http://localhost:3001/api/master/packages/combo-couple
# → returns: package_price 55000, individual_total 56000, savings 1000, savings_pct 1.8%
```

### C. POS confirm dengan package

```bash
# Dry-run V2 preview:
curl -X POST http://localhost:3001/api/master/consume-stock-v2 \
  -H 'Content-Type: application/json' \
  -d '{
    "items": [
      { "menu_id": "combo-couple", "qty": 1 }
    ],
    "order_ref": "TEST-PKG-001",
    "actor": "kasir-1"
  }'
# V2 akan auto-expand package → consume BOM 2 froyo-original medium
```

## 5. Procurement Gaps — usage flow

### A. Purchase Return

```bash
# 1. Create return draft (GR receive ada item rusak)
curl -X POST http://localhost:3001/api/procurement/returns \
  -H 'Content-Type: application/json' \
  -d '{
    "gr_id": 1,
    "supplier_id": 1,
    "reason": "damaged",
    "notes": "5 cup pecah pas terima",
    "items": [
      { "sku": "CUP-MEDIUM", "qty": 5, "unit": "pcs", "unit_price": 500, "item_reason": "pecah" }
    ],
    "created_by": "admin"
  }'
# Returns { ok, id, doc_no: "PR-RTN-202605-0001" }

# 2. Finalize → reverse stock + log audit
curl -X POST http://localhost:3001/api/procurement/returns/1/finalize \
  -H 'Content-Type: application/json' \
  -d '{
    "finalized_by": "admin",
    "credit_note_ref": "CN-SUPPLIER-001",
    "refund_method": "credit_note"
  }'
# Returns { ok: true, stock_adjustments: [{sku, status:'ok', qty_returned, new_stock}] }
```

### B. Invoice Aging Report

```bash
curl http://localhost:3001/api/procurement/invoice-aging
# Returns buckets:
# - current (belum jatuh tempo)
# - b1 (0-30 hari overdue)
# - b2 (31-60 hari overdue)
# - b3 (61-90 hari overdue)
# - b4 (90+ hari kritis)
# Plus by_supplier breakdown sorted desc by total.
```

### C. Advance Purchase (DP supplier)

```bash
# 1. Bayar DP sebelum PO complete:
curl -X POST http://localhost:3001/api/procurement/advances \
  -H 'Content-Type: application/json' \
  -d '{
    "supplier_id": 1,
    "po_id": 5,
    "amount": 1000000,
    "payment_method": "transfer",
    "reference": "BCA-TRX-12345",
    "notes": "DP 50% bahan baku April"
  }'

# 2. Apply DP ke purchase invoice later:
curl -X POST http://localhost:3001/api/procurement/advances/1/apply \
  -H 'Content-Type: application/json' \
  -d '{ "amount": 800000, "invoice_id": 10, "applied_by": "admin" }'
# Sisa: 200000 (status: partial)
```

### D. PR Qty Suggestion (auto-suggest dari consumption)

```bash
curl http://localhost:3001/api/procurement/pr-suggest
# Returns sorted by urgency (high → low):
# [
#   { sku: 'FROYO-BASE-PLAIN', current_stock: 2, avg_daily_consumption: 0.5,
#     suggested_qty: 11, urgency: 'high', reasoning: 'Akan habis sebelum 14 hari' },
#   ...
# ]

# Auto-generate draft PR dari urgent items:
curl -X POST http://localhost:3001/api/procurement/pr-suggest/generate-draft \
  -H 'Content-Type: application/json' \
  -d '{ "urgency_filter": ["high"], "supplier_id": 1, "created_by": "system" }'
# Returns draft_pr shape ready buat POST ke /api/procurement/pr
```

### E. Wave 2 Dashboard

```bash
curl http://localhost:3001/api/procurement/wave2-dashboard
# Returns: aging_summary + recent_returns + pending_advances + urgent_pr_suggestions
```

## 6. Finance — usage flow

### A. Frontend wiring

```jsx
// di AdminTools.jsx, tambah tab Finance:
import AdminFinance from './AdminFinance';

const tabs = [/* existing 7 tabs */, { key: 'finance', label: 'Finance' }];

{activeTab === 'finance' && <AdminFinance />}
```

### B. P&L Report — accuracy depends on:

1. **Revenue** — auto dari `pos_payments` (Phase 4B). Pastikan semua sale lewat split payment endpoint.
2. **COGS** — auto dari `pos_events` event_type=`stock_consumption` × `audit_warehouse.last_cost`. Pastikan:
    - Master Item BOM udah di-set per menu (Wave 1)
    - `audit_warehouse.last_cost` ke-update pas procurement GR (perlu enhance — see "Things to add")
3. **OPEX** — manual input via Expense form di Finance tab
4. **Tax** — auto-calc dari `tax_config` (default PPN 11% + PB1 10%)

### C. Quick smoke test

```bash
# 1. Dashboard
curl http://localhost:3001/api/finance/dashboard

# 2. P&L 30 hari
curl 'http://localhost:3001/api/finance/pl?from=$(date -v-30d +%s)&to=$(date +%s)'

# 3. Input expense manual
curl -X POST http://localhost:3001/api/finance/expenses \
  -H 'Content-Type: application/json' \
  -d '{
    "category_id": "opex-sewa",
    "expense_date": '$(date +%s)',
    "amount": 5000000,
    "vendor": "Pak Joko",
    "description": "Sewa bulan Mei 2026",
    "payment_method": "transfer"
  }'

# 4. Export CSV
curl -o expenses.csv 'http://localhost:3001/api/finance/export/expenses.csv?from=...'

# 5. COGS detail (drill into stock consumption)
curl 'http://localhost:3001/api/finance/cogs-detail?from=...&to=...'
```

## 7. Things to add manually (out of scope this wave)

### Critical
- **Update `audit_warehouse.last_cost` on procurement GR** — currently last_cost gak auto-update. Tambah di procurement-backend.js GR handler:
  ```js
  // saat GR diterima, weighted-avg update last_cost:
  const wh = db.prepare(`SELECT current_stock, last_cost FROM audit_warehouse WHERE sku=?`).get(sku);
  const oldValue = (wh.current_stock || 0) * (wh.last_cost || 0);
  const newValue = qty_received * po_unit_price;
  const newTotalStock = (wh.current_stock || 0) + qty_received;
  const newAvgCost = newTotalStock > 0 ? (oldValue + newValue) / newTotalStock : po_unit_price;
  db.prepare(`UPDATE audit_warehouse SET last_cost=? WHERE sku=?`).run(newAvgCost, sku);
  ```
- **Procurement payment → finance_expense auto-link** — see section 2 above

### Nice to have
- React UI for procurement gaps (extend existing AdminProcurement.jsx)
- React UI for menu builder (extend existing AdminMasterItem.jsx — add Sizes tab + Packages tab)
- PDF receipt with tax breakdown
- Journal entries (GL) — out of scope kiosk
- Multi-branch / multi-outlet — bites-kiosk single outlet

## 8. Schema migration notes

Semua module auto-create tables via `CREATE TABLE IF NOT EXISTS`. Safe to re-run. Default data (sizes, expense categories, tax) di-seed kalau table kosong.

**Conflict potensial:**
- `pos_events` table — Wave 1 Master Item dan Phase 4B sama-sama bisa CREATE. Schema-nya kompatibel (Phase 4B add `event_subtype`, `severity`, `order_ref`, `related_event_id` via `CREATE TABLE IF NOT EXISTS`). Kalau lo udah punya `pos_events` lama dari Phase 1-4A audit system, **mungkin perlu ALTER**:
  ```sql
  ALTER TABLE pos_events ADD COLUMN event_subtype TEXT;
  ALTER TABLE pos_events ADD COLUMN severity TEXT DEFAULT 'info';
  ALTER TABLE pos_events ADD COLUMN order_ref TEXT;
  ALTER TABLE pos_events ADD COLUMN related_event_id INTEGER;
  ```
  Atau drop & re-create (kalau gak ada data penting).

- `audit_warehouse` — Finance COGS calc baca `last_cost` / `unit_cost` / `cogs` columns. Pastikan minimal salah satu ada. Kalau kosong, COGS report bakal 0.

## 9. Total endpoints summary (wave 1 + wave 2)

```
POS Phase 1-4A + 4B (existing):
  /api/pos/payments/*       (split payment, void, refund, stats)
  /api/pos/events*          (audit log query + taxonomy + anomalies)
  /api/pos/config/*         (16 runtime configs)
  /api/pos/broadcast        (existing WebSocket bridge)

Master Item (Wave 1 + builder):
  /api/master/menu          (legacy shape — drop-in for hardcoded array)
  /api/master/menu-full     (V2 with sizes + packages)
  /api/master/categories/*
  /api/master/menus/*       + /menus/:id/sizes (variants)
  /api/master/extras/*
  /api/master/bom/*
  /api/master/units
  /api/master/menu-sizes
  /api/master/packages/*
  /api/master/consume-stock + /preview (V1)
  /api/master/consume-stock-v2          (V2 — size + package aware)
  /api/master/cogs-report
  /api/master/seed

Procurement (Wave 1 + gaps):
  /api/procurement/suppliers/*
  /api/procurement/pr/* (+ submit, approve, convert)
  /api/procurement/po/*
  /api/procurement/gr/*
  /api/procurement/invoices/*
  /api/procurement/payments/*
  /api/procurement/returns/*            ← NEW
  /api/procurement/advances/*           ← NEW
  /api/procurement/invoice-aging        ← NEW
  /api/procurement/pr-suggest           ← NEW
  /api/procurement/wave2-dashboard      ← NEW
  /api/procurement/dashboard

Finance (NEW):
  /api/finance/dashboard
  /api/finance/pl + /pl/by-period
  /api/finance/revenue-by-tender
  /api/finance/cogs-detail
  /api/finance/expenses/* + /:id/void
  /api/finance/expense-categories/*
  /api/finance/tax-config/*
  /api/finance/export/expenses.csv
```

Total estimate: ~80 endpoints across 7 modules. Bites-kiosk hampir feature-parity sama ESB Core basics (kecuali multi-branch).
