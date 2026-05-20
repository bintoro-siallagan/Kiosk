# POS Phase 4B — Integration Guide

Tiga sub-sistem dalam 1 module: **Split Payments** + **Audit Log Completion** + **Config Endpoint**.

## Files

1. **`server/pos-phase4b-backend.js`** (~600 lines) — schema (3 tables) + endpoints + helpers
2. **`client/src/POS/POSPayment.jsx`** (~330 lines) — split payment UI buat kasir (tablet-optimized)
3. **`INTEGRATION.md`** — this file

## 1. Backend wiring

Di `server/index.js`, deket setup module lain:

```js
const { setupPhase4B } = require('./pos-phase4b-backend');

const phase4b = setupPhase4B(app, {
  dbPath: path.join(__dirname, '..', 'data', 'kiosk.db'),
  mountPath: '/api/pos'
});

// Export untuk dipakai handler lain
global.logPosEvent = phase4b.logPosEvent;
global.getConfig = phase4b.getConfig;
global.finalizeSplitPayment = phase4b.finalizeSplitPayment;
```

Module auto-create `pos_payments`, `pos_config`, `pos_events` tables + seed 16 default config keys.

## 2. Frontend wiring

`POSPayment.jsx` adalah screen baru yang dipanggil setelah `POSConfirm.jsx` (saat customer udah konfirm order, kasir lanjut ke bayar).

```jsx
import POSPayment from './POS/POSPayment';

// di parent (POSFlow.jsx atau App.jsx):
{stage === 'payment' && (
  <POSPayment
    order={{
      ref: currentOrder.order_number,    // e.g. "ORD-202605-0001"
      total: currentOrder.total,
      items: currentOrder.items,
      cashier: currentUser.username,
      customer: currentOrder.customer    // { id, name, points_balance } optional
    }}
    onComplete={(result) => {
      // result = { ok:true, payment_ids:[...], anomalies:[...], change: 5000 }
      console.log('Payment done:', result);
      // Print receipt, broadcast WebSocket, go to next stage
      socket.emit('pos:order-paid', { order_ref: currentOrder.order_number, result });
      setStage('receipt');
    }}
    onCancel={() => setStage('confirm')}
  />
)}
```

UI nya: kiri = order summary + tender lines + finalize, kanan = tender selector + amount input. Touch-friendly buat tablet kasir.

## 3. Migration dari single-payment existing

Memory: POS Phase 1-4A udah punya single-payment di POSConfirm.jsx. **Pilihan migrasi:**

**Opsi A — Replace (recommended):**
- Hapus single-payment logic di POSConfirm
- POSConfirm cuma terima order, lanjut ke POSPayment
- Semua sale yang masuk → wajib lewat POSPayment (bahkan single cash = 1 tender line aja)
- Benefit: 1 source of truth, audit log lengkap, future-proof

**Opsi B — Coexist:**
- Single-payment lama tetap (cash-only fast path)
- POSPayment muncul kalau customer pilih "Bayar Mixed" atau "Pakai Poin"
- Lebih kompleks tapi gak break flow existing

Gw saranin Opsi A. Single cash sale jadi `tenders: [{ tender_type: 'cash', amount: orderTotal }]` — sama aja simpelnya, plus dapet audit benefit.

## 4. Hook ke Master Item (stock deduction)

Setelah `POSPayment.onComplete` fire, lo perlu trigger stock deduction. Best practice:

```js
// di socket handler 'pos:order-paid' atau backend webhook:
onOrderPaid(orderRef) {
  // 1. Get order items
  const items = orderItemsFromDB(orderRef);  // shape: [{menu_id, qty, extras:[{extra_id, qty}]}]

  // 2. Consume stock via BOM (Master Item module)
  const stockResult = global.consumeStockForOrder(items, {
    order_ref: orderRef, actor: 'pos', allow_negative: false
  });

  // 3. Log to audit
  global.logPosEvent({
    event_type: 'order_completed',
    payload: { order_ref: orderRef, stock_result: stockResult },
    order_ref: orderRef,
    actor: 'system',
    severity: stockResult.ok ? 'info' : 'warning'
  });

  // 4. Broadcast stock warnings if any
  if (!stockResult.ok) {
    broadcastPosEvent('stock-warning', { order_ref: orderRef, issues: stockResult.deductions });
  }
}
```

## 5. API endpoints lengkap

### Split Payments — `/api/pos/payments/*`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/payments/validate` | `{ order_total, tenders }` | dry-run validation, returns `{ valid, errors, change, shortfall }` |
| POST | `/payments` | `{ order_ref, order_total, tenders, actor, customer_id? }` | atomic finalize, returns `{ ok, payment_ids, anomalies, change }` |
| GET | `/payments/:order_ref` | — | list tender lines untuk 1 order + totals summary |
| POST | `/payments/:id/void` | `{ reason*, voided_by*, manager_pin }` | void tender line (PIN required by default) |
| POST | `/payments/:id/refund` | `{ amount*, reason*, refunded_by*, manager_pin }` | partial/full refund (PIN required by default) |
| GET | `/payments-stats?from=&to=` | — | breakdown by tender_type + summary |

**Tender shape:**
```js
{
  tender_type: 'cash|qris|card|gopay|ovo|dana|shopeepay|points|voucher|transfer',
  amount: 50000,
  ref_no: '1234',  // last 4 for card, QRIS ref, voucher code, etc. (required for non-cash/non-points)
  metadata: { points_redeemed: 500 }  // hanya buat tender_type='points'
}
```

### Audit Log — `/api/pos/events`

| Method | Path | Notes |
|---|---|---|
| POST | `/events` | append event (untuk non-Node clients) |
| GET | `/events?event_type=&severity=&order_ref=&actor=&from=&to=&limit=&offset=` | filtered query |
| GET | `/events-taxonomy` | breakdown by type+subtype+severity (untuk audit dashboard) |
| GET | `/anomalies?from=&to=&limit=` | hanya event `anomaly_detected` |

### Config — `/api/pos/config/*`

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/config?category=` | — | semua config, optional filter category |
| GET | `/config/:key` | — | single key dengan parsed value |
| PUT | `/config/:key` | `{ value, updated_by, manager_pin? }` | update; manager_pin wajib kalau key category='audit' |
| POST | `/config` | `{ key*, value*, type*, description, category, updated_by }` | tambah key baru |

## 6. Config defaults yang di-seed

16 keys auto-seeded on first run:

| Key | Default | Type | Category |
|---|---|---|---|
| POINT_VALUE_IDR | 100 | number | points |
| POINT_MIN_REDEEM | 10 | number | points |
| ALLOW_PARTIAL_PAYMENT | false | boolean | payment |
| ALLOW_OVERPAYMENT | false | boolean | payment |
| CASH_CHANGE_MAX_RATIO | 0.5 | number | payment |
| TENDER_TYPES | [10 jenis] | json | payment |
| CASH_DRAWER_AUTO_OPEN | true | boolean | payment |
| MANAGER_PIN | "1234" | json | audit |
| VOID_REQUIRES_PIN | true | boolean | audit |
| REFUND_REQUIRES_PIN | true | boolean | audit |
| MAX_VOIDS_PER_HOUR_PER_KASIR | 5 | number | audit |
| MAX_REFUNDS_PER_DAY_PER_KASIR | 10 | number | audit |
| CARD_REUSE_WINDOW_MIN | 15 | number | audit |
| LOW_STOCK_THRESHOLD | 5 | number | audit |
| KIOSK_NAME | "Bites Kiosk" | json | ui |
| CURRENCY_SYMBOL | "Rp" | json | ui |

**⚠️ WAJIB ganti `MANAGER_PIN` dari default `1234` setelah deploy:**

```bash
curl -X PUT http://localhost:3001/api/pos/config/MANAGER_PIN \
  -H 'Content-Type: application/json' \
  -d '{"value":"YOUR_REAL_PIN","updated_by":"admin","manager_pin":"1234"}'
```

(Yes, perlu PIN lama buat ganti PIN — chicken-and-egg pas first deploy, makanya wajib ganti hari-1.)

## 7. Anomaly rules baru (Phase 4B)

5 rule baru di-append ke 12 rule existing dari Audit System:

| Rule | Severity | Trigger |
|---|---|---|
| **A4B-1** | warning | Change > `CASH_CHANGE_MAX_RATIO` × order total (default 50%) |
| **A4B-2** | critical | Same card ref_no dipakai >= 2x dalam `CARD_REUSE_WINDOW_MIN` menit (default 15 min) |
| **A4B-3** | warning | Multiple cash lines untuk 1 order (suspicious — biasanya cukup 1) |
| **A4B-4** | critical | Kasir void > `MAX_VOIDS_PER_HOUR_PER_KASIR` payments / jam (default 5) |
| **A4B-5** | critical | Points redemption mismatch: `points_redeemed × POINT_VALUE_IDR != amount_applied` |

Semua anomalies di-log ke `pos_events` (event_type=`anomaly_detected`, event_subtype=rule ID). Manager review via `GET /api/pos/anomalies`.

## 8. Event taxonomy

Event types yang sekarang ke-log via Phase 4B (di-append ke existing):

| event_type | severity | source |
|---|---|---|
| `payment_finalized` | info / warning | tiap order completed |
| `payment_void` | warning | manual void via UI |
| `payment_refund` | warning | manual refund |
| `cash_drawer_open` | info | auto pas cash tender (configurable) |
| `anomaly_detected` | warning / critical | A4B-1 s/d A4B-5 |
| `auth_failed` | warning | invalid manager PIN (void/refund/config) |
| `config_change` | info / warning | runtime config update (warning kalau category='audit') |

## 9. Smoke test

```bash
# 1. Cek config seeded
curl http://localhost:3001/api/pos/config

# 2. Validate split payment (dry-run, gak persist)
curl -X POST http://localhost:3001/api/pos/payments/validate \
  -H 'Content-Type: application/json' \
  -d '{
    "order_total": 75000,
    "tenders": [
      { "tender_type": "cash", "amount": 50000 },
      { "tender_type": "qris", "amount": 30000, "ref_no": "QRIS-ABC123" }
    ]
  }'
# Expect: { "valid": true, "change": 5000, ... }

# 3. Actual payment
curl -X POST http://localhost:3001/api/pos/payments \
  -H 'Content-Type: application/json' \
  -d '{
    "order_ref": "TEST-001",
    "order_total": 75000,
    "actor": "kasir-1",
    "tenders": [
      { "tender_type": "cash", "amount": 50000 },
      { "tender_type": "qris", "amount": 30000, "ref_no": "QRIS-ABC123" }
    ]
  }'
# Expect: { "ok": true, "payment_ids": [1, 2], "anomalies": [], "change": 5000 }

# 4. List payments untuk order itu
curl http://localhost:3001/api/pos/payments/TEST-001

# 5. Cek event log
curl 'http://localhost:3001/api/pos/events?order_ref=TEST-001'

# 6. Stats per tender type
curl http://localhost:3001/api/pos/payments-stats
```

## 10. Yang SENGAJA di-skip

- **Per-payment installment** (cicilan tender berkala) — out of scope retail kiosk
- **Currency conversion** (multi-currency) — IDR only
- **EMV/NFC integration** — UI tanggap masukin ref_no manual aja
- **QR code generator buat dynamic QRIS** — POS biasanya pakai static QR atau payment gateway integration; di sini kasir input ref hasil scan customer
- **Receipt printing** — gak ada hardware integration di scope ini; tinggal hook `onComplete` ke driver printer lo (escpos, dll)
- **Refund yang trigger stock-return** — refund pos_payments doesn't automatically reverse BOM stock consumption. Kalau perlu, tambah logic di refund handler buat call invers `consumeStockForOrder` (atau buat helper `restoreStockForOrder`)

Ping kalau salah satu di atas perlu di-buildkan.
