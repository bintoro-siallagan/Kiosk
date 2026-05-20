# Wave 3 — Customer POS Flow + Receipt + Notifications

Close 3 customer-facing gap:

| File | Lines | Purpose |
|---|---|---|
| `client/src/POS/POSMenuPicker.jsx` | ~550 | Customer menu browser dengan size selector + package picker + cart |
| `client/src/POS/POSReceipt.jsx` | ~280 | Receipt rendering: browser print + ESC/POS thermal + tax breakdown |
| `server/notifications-backend.js` | ~440 | Webhook/email/Telegram alerts: low-stock + aging digest + anomaly + daily summary |
| `WAVE3-INTEGRATION.md` | this | Wiring + complete POS flow integration |

## 1. Complete POS flow setelah Wave 3

```
┌─────────────────────────────────────────────────────────────┐
│ Phone Input (POSPhoneInput - existing)                      │
│   → tap nomor HP customer (untuk poin/customer profile)    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Menu Picker (POSMenuPicker - NEW)                           │
│   → browse menu dengan kategori                            │
│   → klik menu → modal: pilih size + extras                 │
│   → klik package → modal: konfirmasi isi paket             │
│   → cart real-time dengan qty controls                     │
│   → "Lanjut ke Pembayaran" → handoff order ke POSPayment   │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Payment (POSPayment - Wave 1, Phase 4B)                     │
│   → multi-tender (cash/qris/card/points)                   │
│   → finalize → /api/pos/payments POST                      │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend hook setelah payment success:                       │
│   1. consumeStockForOrderV2(items) → potong stock via BOM  │
│   2. logPosEvent('order_completed', ...)                    │
│   3. Notification triggered jika low-stock detected         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Receipt (POSReceipt - NEW)                                  │
│   → preview + browser print + ESC/POS thermal print        │
│   → tax breakdown otomatis dari /api/finance/tax-config    │
└─────────────────────────────────────────────────────────────┘
```

## 2. Wiring — semua di satu parent component

```jsx
// client/src/POS/POSFlow.jsx (atau App.jsx kasir)
import { useState } from 'react';
import POSPhoneInput from './POSPhoneInput';     // existing
import POSMenuPicker from './POSMenuPicker';     // NEW Wave 3
import POSPayment from './POSPayment';            // Wave 1 Phase 4B
import POSReceipt from './POSReceipt';            // NEW Wave 3

export default function POSFlow() {
  const [stage, setStage] = useState('phone');
  const [customer, setCustomer] = useState(null);
  const [order, setOrder] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);

  const startOver = () => {
    setStage('phone'); setCustomer(null); setOrder(null); setPaymentResult(null);
  };

  return (
    <>
      {stage === 'phone' && (
        <POSPhoneInput
          onIdentified={c => { setCustomer(c); setStage('menu'); }}
          onSkip={() => setStage('menu')}
        />
      )}

      {stage === 'menu' && (
        <POSMenuPicker
          onCheckout={({ items, subtotal }) => {
            const orderRef = `ORD-${Date.now()}`;
            setOrder({
              ref: orderRef,
              items,
              subtotal,
              total: subtotal,  // tax dihitung di payment/receipt
              customer,
              cashier: localStorage.getItem('kasir_name') || 'kasir',
            });
            setStage('payment');
          }}
        />
      )}

      {stage === 'payment' && order && (
        <POSPayment
          order={order}
          onComplete={async (result) => {
            setPaymentResult(result);
            // Trigger stock deduction backend-side
            await fetch('/api/master/consume-stock-v2', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: order.items,
                order_ref: order.ref,
                actor: order.cashier
              })
            });
            setStage('receipt');
          }}
          onCancel={() => setStage('menu')}
        />
      )}

      {stage === 'receipt' && order && paymentResult && (
        <POSReceipt
          order={{
            ...order,
            paid_at: Math.floor(Date.now()/1000),
            payments: paymentResult.tenders || paymentResult.payment_ids?.map(id => ({ id })) || []
          }}
          onClose={startOver}
          onPrintDone={(method) => console.log(`Printed via ${method}`)}
        />
      )}
    </>
  );
}
```

## 3. POSMenuPicker — features

**Size variants:**
- Auto-detect dari `menu.size_variants` (dari `/api/master/menu-full`)
- Default size dari `is_default` flag (atau first variant)
- Price preview live update saat pilih size lain
- Card menu show "mulai Rp X" kalau ada multiple size dengan price beda

**Package handling:**
- Card berbeda warna (purple gradient) buat package
- Modal show items inside package + savings calculation
- Klik "Tambah" → masuk cart sebagai 1 line item dengan `is_package: true`

**Allowed extras:**
- Fetch `menu.allowed_extras` per menu (dari `/api/master/menus/:id`)
- Kalau ada → only show extras yang allowed
- Kalau kosong (null) → show semua extras

**Cart logic:**
- Each cart entry punya unique `uid` (untuk multi-add menu sama dengan size beda)
- Qty controls per cart line
- Subtotal real-time

**TODO yang sengaja simplified** (boleh patch nanti):
- Free extras discount calc — current implementation flat-charge semua extras
- Pencarian fuzzy match — current pakai includes() literal

## 4. POSReceipt — output 3 mode

### A. Browser print (paling reliable)

```jsx
<POSReceipt order={...} />
```
Klik "🖨️ Print Browser" → buka window baru dengan CSS print khusus 80mm thermal layout → trigger `window.print()`. User pilih printer (bisa save as PDF). Works on any device.

### B. ESC/POS thermal (untuk printer Bluetooth 58/80mm cheap)

Klik "🧾 Thermal Printer" → 3-tier fallback:
1. **Web Bluetooth API** (Chrome desktop/Android) — connect via Bluetooth printer service UUID
2. **Backend network printer** — POST ke `/api/pos/print-receipt` dengan ESC/POS blob (kalau lo wire backend ke USB/network printer via `escpos` npm package)
3. **Clipboard copy** — last resort, user paste manual ke printer utility

ESC/POS command generation include: init printer, center align, double-size header, bold totals, dashed separators, paper cut at end.

### C. PDF download
Sama dengan browser print → user pilih "Save as PDF" di dialog. Tax breakdown otomatis appear sesuai active config.

### Tax breakdown source

Receipt baca `/api/finance/tax-config` → display semua tax dengan `is_active=1` dan `display_separately=1`. Default config Wave 2:
- PPN 11% (separately, exclusive)
- PB1 10% (separately, exclusive)

Total = subtotal + PPN + PB1. Kalau `inclusive=1`, gak ditambah ke total (cuma display info).

## 5. Notifications module

### Setup

```js
// server/index.js
const { setupNotifications } = require('./notifications-backend');

const notifications = setupNotifications(app, {
  dbPath: DB,
  mountPath: '/api/notifications',
  // optional: tweak scheduler
  scheduler: {
    low_stock_interval_ms: 5 * 60 * 1000,   // 5 min
    anomaly_interval_ms: 60 * 1000,         // 1 min
    aging_hour: 9,                          // 9am
    summary_hour: 21,                       // 9pm
  }
});

// Optional: setup nodemailer transport untuk email
// const nodemailer = require('nodemailer');
// global.nodemailerTransport = nodemailer.createTransport({ ... SMTP config ... });

// Set TELEGRAM_BOT_TOKEN env var if pakai Telegram channel.
```

### Subscribe ke channel — WhatsApp via Wablas/Fonnte

```bash
# Subscribe webhook untuk anomaly + low-stock — pakai WhatsApp via Fonnte
curl -X POST http://localhost:3001/api/notifications/subscriptions \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "webhook",
    "target": "https://api.fonnte.com/send",
    "event_types": "anomaly,low_stock,daily_summary,aging_digest",
    "min_severity": "warning",
    "label": "Owner Fonnte WA",
    "headers": { "Authorization": "YOUR_FONNTE_TOKEN" }
  }'

# Fonnte expects body { target, message } — implement intermediary kalau perlu transform
```

### Subscribe Telegram

```bash
# Tambah TELEGRAM_BOT_TOKEN env, get chat_id via @userinfobot di Telegram
curl -X POST http://localhost:3001/api/notifications/subscriptions \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "telegram",
    "target": "123456789",
    "event_types": "*",
    "min_severity": "info",
    "label": "Owner TG"
  }'

# Test
curl -X POST http://localhost:3001/api/notifications/subscriptions/1/test
```

### In-app inbox (untuk admin tab notifications)

```bash
# List unread
curl 'http://localhost:3001/api/notifications/inbox?unread=true&limit=50'

# Mark all read
curl -X POST http://localhost:3001/api/notifications/inbox/mark-all-read

# Manual trigger aging digest (untuk testing)
curl -X POST http://localhost:3001/api/notifications/trigger/aging-digest
```

### Event types yang ditangkap otomatis

| event_type | Trigger | Default severity |
|---|---|---|
| `low_stock` | audit_warehouse.current_stock ≤ threshold | warning (critical kalau 0) |
| `anomaly` | pos_events event_type='anomaly_detected' (Phase 4B rules) | sama dengan source event |
| `aging_digest` | Daily 9am — invoice aging summary | info / warning / critical based on 90+ |
| `daily_summary` | Daily 9pm — revenue + orders + anomalies count | info |

Custom event dispatch:

```bash
curl -X POST http://localhost:3001/api/notifications/dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "manual_alert",
    "severity": "warning",
    "title": "AC mati di kios cabang utara",
    "body": "Suhu freezer naik. Tolong cek sekarang.",
    "payload": { "location": "north-1" }
  }'
```

### Dedupe

- **Low stock**: skip kalau alert sama SKU dalam 1 jam terakhir
- **Anomaly**: skip kalau event_id udah pernah di-notif
- **Daily digest**: skip kalau today udah ada digest record

## 6. Complete deployment checklist (Wave 1 + 2 + 2B + 3)

```bash
# Smoke test setiap module
curl -s http://localhost:3001/api/master/menu-full | jq '.menus | length, .packages | length'
curl -s http://localhost:3001/api/procurement/wave2-dashboard | jq .aging_summary
curl -s http://localhost:3001/api/finance/dashboard | jq .today.revenue.net
curl -s http://localhost:3001/api/pos/payments-stats | jq .summary
curl -s http://localhost:3001/api/bridge/last-cost-coverage | jq .coverage_pct
curl -s http://localhost:3001/api/notifications/inbox | jq .unread_count

# Setup notifications (minimum 1 channel)
curl -X POST http://localhost:3001/api/notifications/subscriptions \
  -d '{"channel":"telegram","target":"YOUR_CHAT_ID","event_types":"*"}'

# Verify scheduler running (check server logs):
# [notifications] scheduler started — low-stock every 300s, anomalies every 60s, aging at 9:00, summary at 21:00
```

## 7. Total bites-kiosk after Wave 3

| Wave | Files | Lines | Modules |
|---|---|---|---|
| Procurement W1 | 3 | 2116 | suppliers + PR/PO/GR/Inv/Pay |
| Master Item W1 | 3 | 1840 | BOM + auto-deduct on sale |
| POS Phase 4B | 3 | 1343 | split pay + audit + config |
| Wave 2 | 5 | 2473 | Finance + Proc Gaps + Menu Builder |
| Wave 2B | 4 | 1518 | Bridge + 2 admin UIs |
| **Wave 3** | **4** | **~1270** | **POS customer flow + Receipt + Notifications** |
| **TOTAL** | **22** | **~10560** | **~95 endpoints, 9 modules** |

System udah feature-complete buat F&B kiosk single-outlet. Sisanya enterprise-level (multi-branch, GL, supplier portal).

## 8. Yang masih bisa di-add (sangat optional)

- **POSPhoneInput** — kalau memory bilang udah ada, gak perlu. Kalau belum, gw bisa bikin (~150 lines).
- **AdminNotifications.jsx** — UI buat manage subscriptions + view inbox + manual triggers (~300 lines)
- **Customer Portal** — customer lihat history transaction + points balance lewat HP (~500 lines)
- **Inventory Forecast Chart** — visual chart prediksi stock habis kapan (~200 lines, integrate dengan PR Suggest)

Ping kalau ada yang mau.
