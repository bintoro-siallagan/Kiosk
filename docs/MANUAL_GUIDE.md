# 📘 karyaOS Manual Guide

Panduan operasional lengkap untuk **install**, **setup**, dan **operasi harian** sistem karyaOS di outlet F&B dan Cinema.

---

## 📑 Daftar Isi

1. [Quick Start — Install POS di Outlet Baru](#1-quick-start--install-pos-di-outlet-baru)
2. [Setup Print Bridge (Optional — kalau mau auto-print)](#2-setup-print-bridge-optional)
3. [Daily Operations — Kasir](#3-daily-operations--kasir)
4. [Manager Operations](#4-manager-operations)
5. [Admin Operations](#5-admin-operations)
6. [Customer Cinema Web](#6-customer-cinema-web)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Quick Start — Install POS di Outlet Baru

### A. Admin: Buat outlet + generate setup URL

1. Login admin di **https://admin.karyaos.tech**
2. Buka tab **Outlet Master**
3. Klik **+ Outlet** → isi data outlet (nama, alamat, area, manager, dll) → Save
4. Cari outlet yang baru dibuat di list → klik **📲 Setup URL**
5. Modal akan tampil dengan:
   - **QR Code** (140×140 px) — siap di-scan dari tablet
   - **URL text** — bisa di-copy dan dikirim via WA/email ke staff outlet
   - 2 sections (F&B + Cinema) kalau outlet hybrid

### B. Kasir/IT outlet: Setup tablet/PC POS

1. **Install Chrome** di tablet/PC kasir (download dari https://google.com/chrome)
2. Buka Chrome → **scan QR** atau **paste URL** yang dikirim admin
3. Browser load → device otomatis bind ke outlet (lihat console log "📍 Device bound to outlet: XXX")
4. Tunggu sebentar — POS load
5. **Layar Login muncul** dengan keypad PIN

### C. (Optional) Permanent install via launcher

Untuk POS yang **selalu aktif fullscreen** tanpa URL bar:

1. Download `launch-pos-kiosk.bat` (F&B) atau `launch-pos-cds-kiosk.bat` (CDS second display):
   - https://app.karyaos.tech/downloads/launch-pos-kiosk.bat
   - https://app.karyaos.tech/downloads/launch-pos-cds-kiosk.bat
2. Edit file pakai Notepad → ganti URL sesuai outlet code (mis. `?pos&outletSetup=CMX-BDG01`)
3. Save ke Desktop → double-click → Chrome launch kiosk mode permanent
4. Untuk auto-start saat boot: copy ke folder `shell:startup` (tekan Win+R → ketik `shell:startup`)

✅ **Done — POS siap dipakai**

---

## 2. Setup Print Bridge (Optional)

> Skip section ini kalau **gak pakai thermal printer** (cuma jualan digital tanpa struk fisik).

### Kenapa perlu print bridge?

Backend karyaOS jalan di internet (`api.karyaos.tech`). Printer thermal outlet ada di LAN private. Bridge jalan di PC kasir sebagai perantara — terima print job dari browser → forward via TCP ke printer.

### Install bridge

1. **Install Node.js LTS** di PC kasir:
   - Download: https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi (Windows 64-bit)
   - Install dgn default settings
2. **Download bridge zip**: https://app.karyaos.tech/downloads/print-bridge.zip
3. Extract ke `C:\karyaos\print-bridge\`
4. Pilih mode:
   - **Testing mode**: double-click `start-bridge.bat` → jendela CMD kebuka, biarkan terbuka
   - **Production mode**: right-click `install-windows-service.bat` → Run as administrator → service `KaryaOSPrintBridge` auto-start saat Windows boot

### Setup printer di Admin panel

1. Login admin → tab **Config** → cari section **🖨 Printer Thermal ESC/POS**
2. Status pill harus tampil 🟢 **BRIDGE ONLINE**
3. Klik **🔍 Scan LAN** → bridge cari printer di network → list muncul
4. Klik **"Use →"** pada printer yang detect → IP otomatis ke-set
5. Klik **🖨 Test** → printer cetak test page

### Cek update bridge

Banner cyan akan muncul di printer panel kalau ada update tersedia:
- "🔔 Bridge update tersedia: v1.0.0 → v1.1.0"
- Klik **⬇ Download Update** → zip baru
- Stop service lama → replace folder → install service baru

---

## 3. Daily Operations — Kasir

### A. Login

1. Buka POS (sudah pre-configured ke outlet ini)
2. **Layar Login**:
   - Top bar: status WiFi / Printer / Sync
   - KPI today: Revenue / Orders / Anomali
   - **Numeric keypad** untuk input PIN
3. Input PIN 6 digit (sistem auto-submit saat digit terakhir)
4. Sistem verify:
   - ✅ PIN match + outlet match → login OK
   - ❌ PIN salah → "⚠ PIN salah" + dots reset
   - ❌ User terikat outlet lain → "⚠ User ini terikat ke outlet X, bukan Y"

### B. Opening Checklist

Muncul **otomatis** setelah login pertama hari ini:

1. **Ceklis 5 item** (F&B example):
   - Kas dihitung & cocok dengan sistem
   - Mesin froyo OFF / mode malam
   - Sampah dibuang
   - Area & lantai bersih
   - Pintu & gembok terkunci
2. **🎯 Target penjualan today** (input Rp, mis. 3.000.000)
3. **😊 Mood today** (Lelah / Biasa / Oke / Senang / Semangat)
4. Tap **Mulai Shift →** kalau semua sudah dicentang

### C. Opening Cash Modal

Setelah checklist submit:

1. Input **Modal Awal** (uang tunai di kas saat buka shift)
2. Tap **Buka Shift** → POS unlock, siap transaksi

### D. Transaksi (F&B)

1. POS Home → tap **+ New Order**
2. Pilih **Dine In** (pilih meja) atau **Take Away**
3. Pilih menu — tile auto-tambah ke cart
4. Cart sidebar → review → **Pay**
5. **Pilih metode**: Cash / QRIS / Split / Open Tab
6. Confirm → printer auto-cetak struk

### E. Transaksi (Cinema)

1. Cinema POS Home → list showtime hari ini di outlet ini
2. Pilih showtime → seat picker muncul
3. Pilih kursi (tap kursi gold = pilih, tap lagi = batal)
4. (Optional) tambah F&B Combo
5. Input nama + phone customer → **Bayar**
6. Pilih payment → confirm → tiket cetak (printer thermal otomatis kalau bridge online)

### F. Close Shift (akhir shift)

1. POS Home → klik **🔒 Close Shift** (tombol orange di header)
2. **Opening Closing Checklist** muncul (5 item)
3. Centang semua → **Close Shift**
4. Modal Closing Cash → input total kas akhir → submit
5. Sistem hitung **variance** (selisih expected vs actual):
   - Variance ≤ Rp 5.000 → OK
   - Variance > Rp 5.000 → log ke audit, manager akan review

### G. Close Day (cuma Manager/Owner)

Tutup operasional outlet. **Cuma Manager+** yang punya akses:

1. POS Home → klik **🌙 Close Day** (tombol ungu, hanya tampil untuk role manager+)
2. Konfirmasi "TUTUP HARI?" → shift aktif ikut ditutup
3. Sistem cetak Z-report (omzet hari ini) + email ke owner kalau email aktif
4. POS lock — customer gak bisa beli sampai "Open Day" lagi besok pagi

---

## 4. Manager Operations

### A. Login sebagai Manager

Sama dengan kasir — input PIN di keypad. Manager role akan unlock tombol tambahan:
- **🌙 Close Day** di POS Home
- **Reset Outlet** di outlet badge (klik 🔒 → modal "Manager PIN Required" → input PIN)

### B. Reset device outlet

Kalau device kasir perlu pindah ke outlet lain:

1. Login Manager di POS
2. Klik **🔒 outlet badge** di header
3. Modal "Device Locked — Manager PIN Required" muncul
4. Input Manager PIN → validasi
5. ✅ Pass — picker dropdown unlocked **selama 60 detik**
6. Pilih outlet baru → reload → device rebind

### C. Audit dispute kasir

1. Buka **Admin Tools** → tab **Audit / Anomalies**
2. Filter by tanggal / kasir
3. Lihat events: void berlebihan, promo abuse, variance kas, dll
4. Manager review → tindakan kalau perlu

### D. Force-close shift (emergency)

Kalau kasir hilang/bypass close shift normal:

```
POST /api/shifts/force-close?vertical=fnb  (atau cinema)
Authorization: Bearer <manager-token>
```

Atau lewat admin panel: **Shift Management** → klik shift aktif → **Force Close**.

---

## 5. Admin Operations

### A. Manage Users

**Admin → Users**:

| Action | Path |
|---|---|
| **Create user baru** | "+ New User" → isi nama, role, PIN, outlet_code |
| **Edit user** | klik ✏️ Edit → ganti role / outlet / PIN |
| **Reset PIN** | klik 🔑 Password → set PIN baru |
| **Lock/Unlock** | klik 🔓 Unlock kalau locked |
| **Deactivate** | klik ✕ Deactivate (user gak bisa login) |
| **Delete** | klik 🗑️ Delete permanent |

**Outlet Access (penting!):**
- **🌐 SEMUA OUTLET (HQ Access)** — default. User lihat data semua outlet. Cocok untuk Owner / Regional Manager / Auditor.
- **📍 Outlet Spesifik** — pilih outlet code. User hanya lihat data outlet itu. Cocok untuk Outlet Manager / Cashier.

### B. Manage Outlets

**Admin → Outlet Master**:

| Action | Path |
|---|---|
| **+ Outlet** baru | isi nama, area, address, manager, vertical (fnb/cinema/hybrid) |
| **✏️ Edit** outlet | ganti data + GPS lock (geofence) |
| **📲 Setup URL** | generate QR/URL untuk install POS di outlet ini |
| **Status** | toggle Active / Renovation / Onboarding / Closed |
| **🗑️ Delete** | hapus outlet (hati-hati — data orders & tickets tetap ada) |

### C. Manage Checklist

**Admin → Tools → Checklist**:
- **🌅 Opening** — checklist sebelum buka shift
- **🌙 Closing** — checklist sebelum tutup shift
- Item per item dgn **vertical badge**:
  - 🍦 F&B — cuma tampil di POS F&B
  - 🎬 Cinema — cuma tampil di POS Cinema
  - 🌐 Universal — tampil di semua POS
- **Filter view** by vertical
- **Quick ganti vertical** klik badge → dropdown
- ✏️ Edit / 🗑 Hapus per item

### D. Receipt Template

**Admin → Config → 🧾 Receipt Template**:
- Edit nama outlet, alamat, footer (thank-you, note)
- Paper width toggle: **80mm** (48 char) / **58mm** (32 char)
- QR Order Tracking ON/OFF
- **Live ASCII Preview** real-time
- Subtitle auto dari source: "Kasir POS" / "Self Order Kiosk" / "QR Order"

### E. Printer Config

**Admin → Config → 🖨 Printer Thermal ESC/POS**:
- Bridge status pill (Online / Offline / Update available)
- Print Bridge URL (default `http://localhost:9101`)
- 🔍 **Scan LAN** untuk auto-detect printer
- 🖨 **Test** per printer
- Debug mode ON/OFF (debug = save .bin file, gak cetak fisik)

### F. RBAC — Permissions

Backend pakai 3-tier RBAC:
- **Super-admin** — akses semua, lintas tenant
- **Admin / Owner** — akses semua di company
- **Manager** — akses operasional + outlet bound kalau di-set
- **Kasir** — akses POS doang

108 endpoint protected — anonymous access ditolak otomatis.

---

## 6. Customer Cinema Web

Customer-facing booking website: **https://app.karyaos.tech/?cinema**

### Flow customer
1. Pick outlet → list lokasi cinema
2. Pick film → detail + trailer + showtimes
3. Pick showtime → kursi picker
4. (Optional) tambah F&B Combo
5. Input nama + phone → checkout
6. Pilih payment (counter / QRIS) → tiket digital

### Tiket digital
- QR code untuk scan di counter atau pintu studio
- E-tiket dikirim via WA + email
- Bisa di-print thermal kalau ambil di counter

### Loyalty
- Customer login pakai phone + OTP WA
- Earn points per booking
- Redeem points sebagai diskon next booking

---

## 7. Troubleshooting

### POS gak bisa login: "PIN salah"
- Pastikan PIN 6 digit angka
- Cek di Admin → Users — pastikan user active, pin sesuai
- Kalau lupa PIN: Admin → Edit user → Reset PIN

### POS gak bisa login: "User terikat ke outlet X"
- User di-bind ke outlet lain (di Admin)
- Solusi: Admin edit user → ganti outlet binding ke outlet ini
- Atau pakai user lain yang HQ Access

### Outlet badge tampil "⚠ PILIH OUTLET"
- Device belum di-bind ke outlet
- Solusi:
  - Pakai Setup URL dari Admin (cara recommended)
  - Atau klik badge → dropdown picker → pilih outlet

### Outlet badge tampil 🔒 lock — gak bisa diganti
- Device locked (working as designed — anti-fraud)
- Solusi: klik badge → input Manager PIN → unlock 60 detik

### Printer gak cetak
1. Cek **Bridge status** di Admin → 🖨 Printer config — harus Online
2. Cek jendela CMD bridge masih terbuka (kalau pakai testing mode)
3. Cek printer power on + paper ready
4. Klik **🖨 Test** di Admin — kalau gagal:
   - Network printer offline → check kabel/IP
   - Bridge gak detect → re-scan LAN
   - Wrong IP → set manual

### Showtimes Cinema gak muncul
- Cek outlet badge — harus match showtime outlet
- Cek di Admin → Cinema Films / Showtimes — pastikan ada showtime untuk outlet ini today
- Hard refresh (Ctrl+Shift+R) — kalau cached

### Order POST gak masuk (403 forbidden)
- "Kasir X terikat ke outlet Y, tapi order dari Z" — Admin set outlet binding salah
- Solusi: Admin → Edit user → fix outlet_code

### Close shift gak bisa: "X item belum di-ceklis"
- Closing checklist belum complete
- Solusi: complete semua item closing dulu

### Day closed: "Hari sudah ditutup. Manager harus Buka Hari dulu"
- Manager kemarin lupa "Open Day" pagi-pagi
- Solusi: login sebagai Manager → POS Home → **☀️ Open Day**

### Bridge offline tapi printer masih nyala
- Bridge CMD window ketutup
- Solusi: double-click `start-bridge.bat` lagi (testing mode)
- Atau cek service: `nssm status KaryaOSPrintBridge` (production mode)

### Manager PIN unlock gagal: "Role X tidak punya akses"
- User yang Anda input PIN-nya bukan Manager/Admin/Owner
- Solusi: pakai PIN Manager beneran, atau Admin upgrade role user

### Customer Cinema Web "Gagal memuat lokasi"
- Backend down atau outlet list endpoint gated
- Sudah fixed di production — kalau muncul lagi, hard refresh + clear cache

---

## 📞 Support

- **Bugs / issues**: report via GitHub Issues (https://github.com/bintoro-siallagan/Kiosk/issues)
- **Quick help**: tap tombol **? Help** di kanan bawah setiap surface (kalau tersedia)
- **Emergency**: hubungi tim Karya OS lewat WA/email

---

## 📜 Changelog Major

| Date | Version | Highlights |
|---|---|---|
| 2026-05-29 | v1.4 | PIN-only login, outlet setup URL, device lock, outlet-scoped visibility |
| 2026-05-28 | v1.3 | Print bridge ecosystem, fullscreen, Cinema OS polish, RBAC sweep |
| 2026-05-27 | v1.2 | KaryaOS domain migration (app/admin/api split) |
| 2026-05-22 | v1.1 | Sales advance ticket (pre-order + refund) |
| 2026-05-15 | v1.0 | Multi-tenant base release |

---

**🤖 Dokumen di-generate dengan Claude Code · karyaOS Team**
