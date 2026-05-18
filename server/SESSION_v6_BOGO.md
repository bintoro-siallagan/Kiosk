# Session v6 BOGO — End State

## ✅ COMPLETED (this session)

### Z-Report enhancements
- **Date range picker** with 6 presets (Hari Ini, Kemarin, 7 Hari, 30 Hari, Bulan Ini, Bulan Lalu) + manual range
- Backend `/api/reports/z?from=&to=` accepts range, auto-swap if to<from
- **Print** to dedicated window with A4 paper preview (210×297mm), light theme, header (BINTORO + timestamp + admin name+role), footer (Kasir/Supervisor sign + dashed border), padding 16mm
- **Excel export** via SheetJS CDN — 6 sheets (Ringkasan, Pembayaran, Jenis Order, Top Items, Promo, Rekonsiliasi Kas)
- **Email Z-Report** modal with multi-recipient + auto-attach xlsx (base64 → backend SMTP)

### Email/SMTP (backend ready, UI tested, live SMTP not configured)
- `server/email.js` module with nodemailer
- `email-config.json` (smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromEmail, fromName, recipients[])
- Endpoints: GET/PATCH `/api/admin/email-config`, POST `/api/admin/email-test`, POST `/api/reports/z/email`
- Admin UI card "📧 Email/SMTP Configuration" in Pengaturan
- Password masked with bullets in API responses, preserve on PATCH if bullets

### BOGO promo system (4 modes)
- **DB schema migration**: added `bogo_config TEXT` column to `promos` table (idempotent ALTER TABLE)
- `db.js` promoToRow/rowToPromo serialize/deserialize JSON
- **Backend `calcBogoDetails(promo, cart)`** returns `{discount, freeItems[{name, qty, unitPrice, totalPrice}]}`
- 4 modes: **universal** (cheapest free), **same** (item triggers itself), **cross** (item A → item B free), **category** (cheapest from category)
- Each mode respects buyQty + getQty + maxFreeQty
- Validate endpoint accepts `cart` param, returns `freeItems` for BOGO type
- Seed: P006 BUY1GET1 (universal buy1get1 max3), P007 B2G1 (universal buy2get1 max2)

### Admin PromoManager BOGO support
- TYPE_CFG: added `bogo: { label:"BOGO 🎁", icon:"🎁" }`
- BOGO_MODES constant: universal/same/cross/category
- EMPTY_FORM extended with bogoMode, bogoBuyQty, bogoGetQty, bogoMaxFreeQty, bogoTriggerItemId, bogoFreeItemId, bogoCategoryId
- Fetch menu items + extract categories on load
- openEdit populates BOGO fields from p.bogoConfig
- handleSave includes bogoConfig payload
- Validation: skip `value` check for BOGO, require triggerItemId/freeItemId/categoryId based on mode
- UI: Type dropdown extended, conditional BOGO CONFIG card (purple) with mode select + buy/get/max inputs + conditional item/category dropdowns + help text
- Card badge: "🎁 BOGO" label instead of "Rp 0"
- POST /api/promo accepts bogoConfig

### Receipt polish (BOGO GRATIS display)
- **Kiosk cart promo card**: "🎁 GRATIS: 1× Yogurt Strawberry Smoothie" line below desc
- **Kiosk bill summary**: "🎁 1× Yogurt Strawberry Smoothie gratis" italic green below promo row
- **CashPayment.jsx**: GRATIS line under promo
- **DigitalReceipt.jsx**: GRATIS line under promo (regex-injected)
- **escpos.js buildCustomerReceipt**: lines "  + GRATIS Nx ItemName" after promo line
- **PromoInput modal preview**: GRATIS line after "Hemat Rp X"

### Shift management fix
- Backend `/api/shifts` returns `normalizeShift(s)` mapping SQLite snake_case ↔ frontend camelCase
- Frontend `ShiftManager.jsx` null-safe fTime/fDate
- POST `/api/shifts/force-close` emergency endpoint
- `window.__forceCloseShift("reason")` exposed via DevTools

## 🐛 BUGS FIXED (cumulative)
1-22: prior sessions
23. db.js patch regex broken `null?1:0,` → fixed to `null,` and rowToPromo trailing comma misplaced
24. index.js orphan `return Math.min(promo.value, subtotal);` from old calcDiscount left after regex partial match — removed
25. validate response wasn't including freeItems — re-applied patch

## 📋 PENDING (in progress)
- **Order persistence**: pass `promoFreeItems` from frontend to backend, store in order, render in ESC/POS receipt (frontend Kiosk.jsx + backend insertOrder might need explicit field; check if alt pattern match worked)
- Test GRATIS line shows in live cart after apply
- Test mode same/cross/category via Admin UI

## 🚀 NEXT TASKS
1. Verify GRATIS line shows in cart after PAKAI DISKON
2. Test mode same: create BSGRATIS via admin (mode=same, triggerItem=Black Sakura Regular, buy 1 get 1)
3. Test mode cross: create BUNDLE1 (mode=cross, trigger=White Skim Large, free=Cookie Dough)
4. Test mode category: create SMOOTHIE2 (mode=category, categoryId=Smoothie)
5. Confirm `order.promoFreeItems` persists and prints in thermal receipt
6. (Optional) Configure live Gmail SMTP for email test

## 🔑 KEY FILE PATHS (this session)
- `~/bites-kiosk/server/index.js` — calcBogoDetails ~line 940, validate endpoint ~line 1039, seed promos P006/P007
- `~/bites-kiosk/server/db.js` — promos table + bogo_config col + promoToRow/rowToPromo JSON handlers
- `~/bites-kiosk/server/escpos.js` — buildCustomerReceipt with order.promoFreeItems support
- `~/bites-kiosk/server/email.js` — nodemailer SMTP module
- `~/bites-kiosk/server/email-config.json` — SMTP config
- `~/bites-kiosk/src/PromoManager.jsx` — BOGO admin UI (TYPE_CFG, BOGO_MODES, conditional form)
- `~/bites-kiosk/src/PromoInput.jsx` — cart prop, freeItems preview
- `~/bites-kiosk/src/Kiosk.jsx` — promo card + bill row GRATIS display
- `~/bites-kiosk/src/CashPayment.jsx` — promo+freeItems display
- `~/bites-kiosk/src/DigitalReceipt.jsx` — promo+freeItems display
- `~/bites-kiosk/src/ZReport.jsx` — date range + print (A4 window) + Excel + Email modal
- `~/bites-kiosk/src/Admin.jsx` — Email/SMTP config card in Pengaturan
- `~/bites-kiosk/src/ShiftManager.jsx` — null-safe + force close
- `~/bites-kiosk/src/api.js` — getEmailConfig, setEmailConfig, testEmail, emailZReport, getZReport({from,to})

## 🛠 ENV
- macOS, node v24, zsh
- Backend port 3001, Vite dev 5174 (sometimes 5173)
- Active shift SH001
- Active BOGO seed promos: BUY1GET1 (universal, max 3 free), B2G1 (buy 2 get 1, max 2)
- nodemailer installed
