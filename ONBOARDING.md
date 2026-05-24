# karyaOS Cinema — Manual Guide

> Panduan lengkap operasional cinema vertical karyaOS. Untuk **Admin**, **Kasir**, **F&B Staff**, dan **Customer self-service**.
> Versi: 2026-05-24 · Production: https://kiosk.karys.tech/

---

## 📑 Daftar Isi

1. [Overview Sistem](#1-overview-sistem)
2. [Setup Outlet Baru (Admin)](#2-setup-outlet-baru-admin)
3. [SOP Harian Kasir](#3-sop-harian-kasir)
4. [F&B Staff — Kitchen Display](#4-fb-staff--kitchen-display)
5. [Customer Self-Service Flow](#5-customer-self-service-flow)
6. [In-Studio QR Order](#6-in-studio-qr-order)
7. [Mobile Rating Feedback](#7-mobile-rating-feedback)
8. [Troubleshooting](#8-troubleshooting)
9. [Quick Reference URL](#9-quick-reference-url)
10. [Deploy & Maintenance](#10-deploy--maintenance)

---

## 1. Overview Sistem

karyaOS Cinema adalah platform terintegrasi end-to-end untuk operasional bioskop dengan **6 surface** yang saling terhubung real-time via WebSocket:

```
┌────────────────────────────────────────────────────────────────┐
│  CUSTOMER FACING                                                │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │ Cinema Kiosk │  │ In-Studio QR   │  │ Mobile Rating    │    │
│  │ /?cinema     │  │ /?cinema-snack │  │ /?cinema-feedback│    │
│  └──────────────┘  └────────────────┘  └──────────────────┘    │
├────────────────────────────────────────────────────────────────┤
│  STAFF FACING                                                   │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │ POS Cinema   │  │ CDS (TV)       │  │ KDS (F&B)        │    │
│  │ /?pos-cinema │  │ /?cinema-cds   │  │ /?cinema-kds     │    │
│  └──────────────┘  └────────────────┘  └──────────────────┘    │
├────────────────────────────────────────────────────────────────┤
│  ADMIN                                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ AdminHome → Cinema Ops → Film/Studio/Showtime/Branding   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**Multi-outlet support**: setiap surface terima `?outlet=KODE` (mis. `?outlet=JKT01`) untuk filter & branding per cabang.

---

## 2. Setup Outlet Baru (Admin)

### Step 1 — Buat Outlet di Master

1. Login Admin: `https://kiosk.karys.tech/?admin`
2. Sidebar → **Outlet Master** → klik **+ Add Outlet**
3. Isi:
   - **Code**: `JKT01` (unique, 3-6 char, dipakai di URL `?outlet=JKT01`)
   - **Name**: `Cinema XXI Plaza Indonesia`
   - **Area**: `Jakarta Pusat`
   - **Status**: `active`
4. Save

### Step 2 — Tambah Studio

1. Cinema Ops → tab **🏛️ Studio** → form atas
2. Isi: nama studio (mis. `Studio 1`), tipe (`Regular`/`IMAX`/`Premiere`/`4DX`), baris (`8`), kolom (`12`), outlet (`JKT01`)
3. **+ Tambah**

### Step 3 — Custom Layout Kursi

1. Di list studio, klik tombol **🪑 Layout**
2. Editor visual muncul:
   - **Palette atas**: pilih tipe seat (Regular/Premium/Couple/Disabled/VIP/Void)
   - **Click cell** → paint dengan tipe terpilih
   - **Drag mouse** → paint banyak cell sekaligus
   - **Klik kanan cell** → hapus jadi void (gang/aisle)
   - **Input ungu kiri** baris → ubah label (mis. `A` → `PRM`)
   - **✕** baris/kolom → hapus seluruh baris/kolom
3. **💰 HARGA PER KATEGORI**: isi harga tiap tipe (Regular Rp 50k, Premium 75k, Couple 90k, VIP 150k, Disabled 50k)
4. **💾 Simpan Layout**

> Tip: Row A = back row (cinema standard). Editor pakai column-reverse, jadi tampil kebawah = depan layar.

### Step 4 — Import Film via TMDB

1. Cinema Ops → tab **🎬 Film** → klik **+ Tambah** atau **Edit** existing
2. Ketik judul film (mis. "Inception")
3. Klik tombol **🎥 TMDB** → modal hasil
4. Pilih kartu yang sesuai → poster + trailer + sinopsis + durasi + genre **auto-fill**
5. Set rating LSF (SU/13+/17+/D21), status (Tayang/Segera/Arsip)
6. **Save**

> Manual fallback: klik **📤 Upload Background Image** untuk poster custom (max 50MB JPG/PNG). Sama untuk trailer (MP4/WebM).

### Step 5 — Bulk Push Schedule ke Banyak Outlet

1. Cinema Ops → tab **🗓️ Jadwal Tayang**
2. Form atas: pilih film + tanggal + jam + format (2D/3D/IMAX/4DX) + harga (opsional, fallback outlet pricing)
3. Scroll ke panel ungu **🌐 PUSH KE BANYAK OUTLET SEKALIGUS**
4. Centang outlet target (atau klik **Semua**)
5. Klik **🚀 PUSH KE N OUTLET**
6. Backend auto-create showtime di studio default tiap outlet
7. Result: `✓ Sukses N · Skipped M (alasan: no active studio)`

### Step 6 — Custom Branding CDS Per Outlet

1. Cinema Ops → tab **🎨 Branding CDS**
2. Pilih outlet di dropdown (`DEFAULT` untuk fallback semua)
3. **📤 Upload Background Image** → poster lobby bioskop (1920×1080 ideal)
4. **IDLE MESSAGE** → custom welcome text (mis. "Selamat menonton di Cinema XXI Jakarta!")
5. **🎟️ BRANDING TIKET PRINT**:
   - **HEADER BRAND**: `🎬 CINEMA XXI · Plaza Indonesia` (muncul di tiap tiket print)
   - **FOOTER**: `Datang 15 menit sebelum tayang · No refund`
6. Save per field (tombol 💾 sebelah input)

---

## 3. SOP Harian Kasir

### A. Buka Shift (Pagi)

1. Buka browser di laptop kasir → URL: `https://kiosk.karys.tech/?pos-cinema&outlet=JKT01&fresh=1`
2. **Login**: pilih kartu staff diri sendiri → klik
3. Jika prompt PIN (untuk role Manager) → masukkan PIN
4. Tahap **ShiftGate**:
   - "BELUM SIAP MELAYANI" muncul → klik **🚀 START DAY · BUKA SHIFT**
   - Form **MULAI SHIFT**:
     - Opening Cash: isi modal kas laci (mis. `200000`)
     - Klik **✓ MULAI SHIFT**
5. Masuk **Home POS Cinema** (showtime grid hari ini)

### B. Buka Customer Display (TV Second Screen)

1. Sambungkan kabel HDMI ke TV second screen (extend display mode di OS)
2. Di Home POS Cinema, scroll ke bawah → klik tombol ungu **📺 Buka Layar Pelanggan**
3. Browser permission **Window Management** → **Allow** (sekali aja)
4. Window CDS auto-open di second screen → klik F11 untuk full-screen
5. CDS otomatis sync dengan POS via WebSocket — perubahan di POS muncul real-time di TV

> Alternatif manual: buka tab terpisah di browser TV → URL `https://kiosk.karys.tech/?cinema-cds&outlet=JKT01`

### C. Jual Tiket

1. **Home** → klik kartu showtime yang mau dijual
2. **Sell stage**:
   - Klik kursi yang ingin dipilih (max 6 per anti double-sell)
   - Customer di **CDS lihat seat map real-time** dengan kursi pilihan blink amber
   - Sub-total per kategori update otomatis
3. (Opsional) Tambah **F&B Bundle**: combo popcorn/drinks → CDS show breakdown
4. Klik **Lanjut Bayar →**
5. **Pay stage**:
   - Pilih method: Cash / QRIS / Debit / Voucher
   - **Cash**: input received → otomatis hitung kembalian
   - **QRIS** (paling cepat):
     - Klik **📲 Generate QRIS** → QR muncul di POS DAN di CDS gede 360×360
     - Customer scan QR pakai e-wallet (GoPay/OVO/DANA/ShopeePay)
     - Sistem auto-detect bayar tiap 3 detik
     - Saat detected → otomatis confirm + issue tiket
   - **Debit**: input ref kartu/approval → manual confirm
   - **Voucher**: input kode voucher
6. **Success stage**: muncul kartu per tiket dengan QR code

### D. Cetak Tiket

1. Di Success page → klik **🖨️ Cetak Tiket**
2. Browser print dialog:
   - **Thermal printer cinema** (Epson TM-T20 / Star TSP143): auto-cut tiap tiket
   - **A4 printer biasa**: tiap tiket di halaman terpisah, gunting per halaman
3. Tiap tiket fisik berisi:
   - Brand header (custom per outlet)
   - Judul film + studio + tanggal + jam + format
   - QR code 120×120 untuk validasi di pintu
   - Kursi pill amber + kode tiket monospace
   - Footer instruction custom
   - Nomor urut "Tiket #1 dari 3"

### E. Walk-in Late Entry (Customer Telat)

- Film mulai jam 19:00, customer datang 19:15 (15 menit telat)
- Showtime card masih clickable (status "running")
- Backend approve sale kalau ≤ 60 menit dari start time (configurable via `pos_config WALK_IN_GRACE_MIN`)
- Lewat 60 menit → reject dengan pesan: `Film sudah jalan X menit (lewat batas walk-in Y menit)`

### F. Tutup Shift (Closing)

1. Klik **Logout** di topbar (merah)
2. Sistem buka closing checklist
3. Hitung cash drawer real → input ke form closing
4. Submit → shift closed, laporan EOD ter-generate

---

## 4. F&B Staff — Kitchen Display

### Setup

Tablet F&B station → buka: `https://kiosk.karys.tech/?cinema-kds`

(Tambah `?studio_id=N` kalau mau filter cuma 1 studio)

### Layout

```
┌──────────────────────────────────────────────────┐
│ 👨‍🍳 Cinema KDS    [Studio▾] ● LIVE 5s [↻]      │
├──────────────────────────────────────────────────┤
│ [Concession: 3] [QR Pending: 2] [Disiapkan: 1]  │
├─────────────────────────┬────────────────────────┤
│ 🍿 CONCESSION COUNTER   │ 🎬 IN-STUDIO QR ORDER  │
│ Bundle dari tiket       │ Customer scan kursi    │
│                         │                        │
│ [Order card]            │ [Order card]           │
│  Film + studio + seat   │  Seat + studio + items │
│  Items list             │  Notes (jika ada)      │
│  [✓ AMBIL]              │  [🍳 Siapkan]          │
│                         │  [🚶 Diantar] [✕]     │
└─────────────────────────┴────────────────────────┘
```

### Color-coded Age (urgency)

- 🟩 **Green** `<5 menit` — fresh, santai
- 🟧 **Amber** `5-15 menit` — perhatian
- 🟥 **Red** `≥15 menit` — urgent, dahulukan

Border kiri warna sesuai age, scan visual cepat: yang merah duluan.

### Workflow Concession

1. Customer beli tiket + bundle popcorn di POS Cinema/Cinema Kiosk
2. Card muncul di kolom **🍿 CONCESSION** kiri
3. Staff siapkan combo di counter
4. Customer datang ambil → staff klik **[✓ AMBIL]**
5. Card hilang dari queue (status redeemed)

### Workflow In-Studio QR

1. Customer di kursi scan QR di seat → buka `?cinema-snack` → pesan + bayar QRIS
2. Setelah bayar sukses, card muncul di kolom kanan dengan status **PENDING**
3. Staff klik **[🍳 Mulai Siapkan]** → status → `preparing`
4. Customer di HP nya lihat timeline geser ke "Disiapkan"
5. Staff antar ke kursi → klik **[🚶 Sudah Diantar]** → status → `delivered`
6. Customer lihat "Pesanan sudah diantar 🍿"

---

## 5. Customer Self-Service Flow

### Cinema Kiosk (`/?cinema&outlet=JKT01`)

1. **Step Films**: grid film "Now Showing" → klik poster
2. **Modal Trailer Preview**: trailer YouTube auto-play + sinopsis + tombol **🎟️ Pesan Tiket Sekarang**
3. **Step Showtimes**: pilih jadwal (kartu showtime yang sellable)
4. **Step Seats**: visual seat map dengan kategori warna
   - 🟩 Available · 🟨 Selected · 🟥 Sold · 🟡 Held by other
   - Max 6 kursi (anti double-sell hold 5 menit)
   - Harga legend di bawah: 💺 Regular Rp 50rb · 👑 Premium Rp 75rb · ...
5. **Step Bundles**: opsional F&B combo (popcorn/drinks)
6. **Email/Phone** (opsional) — untuk e-ticket WA
7. **Submit** → backend issue tiket
8. **Done stage**: QR per tiket + rating block + share WhatsApp
9. **Auto-reset 20 detik** → balik ke home (siap untuk customer berikutnya)

### Age Verification Gate

Untuk film rating `17+` / `D21`:
- Modal muncul: "Konfirmasi Usia"
- Customer harus klik confirm sudah cukup umur
- Klik X → cancel pembelian

---

## 6. In-Studio QR Order

### Setup QR per Kursi

Print QR code link untuk tiap kursi di studio. Format URL:
```
https://kiosk.karys.tech/?cinema-snack&seat=A1&studio_id=1
```

Tempel sticker QR di lengan kursi. Customer scan saat film jalan.

### Flow

1. Customer scan QR di kursi A1 → buka halaman snack-order
2. Browse menu F&B (popcorn, drinks, nachos, dll dari `cinema_bundles`)
3. Tambah ke cart, isi catatan (mis. "tanpa garam")
4. Klik **📱 Bayar QRIS →**
5. Halaman QRIS muncul → scan dengan e-wallet → bayar
6. Auto-detect payment → order auto-submit ke staff
7. **Live tracking timeline**: Dibayar → Disiapkan → Diantar (poll backend tiap 5 detik)
8. Staff antar ke kursi A1 → customer lihat "✓ Pesanan sudah diantar"

### Penting

- **Customer in-studio WAJIB bayar QRIS dulu** sebelum order masuk antrian staff (server-enforce)
- Server reject 402 Payment Required kalau tidak ada `payment_ref` + `paid:true`
- Audit trail lengkap: `payment_ref`, `payment_status`, `paid_at`, `payment_method` di `cinema_in_studio_orders`

---

## 7. Mobile Rating Feedback

### Flow

1. Customer beli tiket di counter → kasir POS Cinema sale complete
2. CDS done stage tampil QR code "📱 RATE FILM INI"
3. Customer scan QR pakai HP
4. HP buka: `https://kiosk.karys.tech/?cinema-feedback&film=42&title=Spiderman&p=CP-AB12`
5. Mobile page tap-friendly muncul:
   - 5 bintang besar (52px font)
   - Label dynamic: 1=Sangat Buruk → 5=Sangat Bagus
   - Input nama (opsional) + komentar (opsional)
6. Klik **Kirim Rating X★**
7. Backend simpan dengan `source: "mobile"`
8. Customer dapet ✨ confirmation + bonus tease "1× voucher F&B gratis"

### Backend

Endpoint: `POST /api/cinema/films/:id/rate`

Body: `{ rating, comment, customer_name, ticket_code, source: "mobile" | "cds" | "kiosk" }`

Aggregate: `films.avg_rating` dan `films.ratings_count` ter-update otomatis.

---

## 8. Troubleshooting

### POS Cinema

| Masalah | Solusi |
|---------|--------|
| Login screen gak muncul, langsung ke ticket | URL gak include `&fresh=1` → buka `/?pos-cinema&fresh=1` |
| Cashier session inherited dari tab lain | Tambah `&fresh=1` → force clear session |
| ShiftGate stuck "BELUM SIAP" | Klik **🚀 START DAY · BUKA SHIFT** |
| Jadwal jam 19 gak bisa diklik (running) | Walk-in grace expired (>60 menit) — buat showtime baru |
| Showtime "sold_out" | Capacity penuh — gak bisa jual lagi |
| Confirm button gak kelihatan di Pay | Sticky bottom bar — selalu visible di bawah viewport |

### CDS Second Display

| Masalah | Solusi |
|---------|--------|
| CDS blank / disconnect | Refresh tab `?cinema-cds` — WebSocket auto-reconnect 2 detik |
| CDS gak sync dengan POS | Cek WS connection di DevTools Network → WS → harus `wss://kiosk.karys.tech/ws` connected |
| Background image gak muncul | Cek Admin → Cinema Ops → Branding CDS → upload ulang |
| QR code tidak muncul saat QRIS | Kasir belum klik "Generate QRIS" di POS |

### KDS

| Masalah | Solusi |
|---------|--------|
| Order baru gak muncul | Polling 5 detik — tunggu atau klik **↻ Refresh** manual |
| Status update gak ke CDS customer | Cek WS connection — restart pm2 backend kalau perlu |

### Customer Kiosk

| Masalah | Solusi |
|---------|--------|
| Trailer gak play | Film belum di-set trailer_url di admin → kasir input manual |
| Seat di-hold customer lain | Tunggu 5 menit (hold expire) atau pilih kursi lain |
| Setelah bayar gak balik ke home | Auto-reset 20 detik — atau klik **← Kembali ke Home** |

### Admin

| Masalah | Solusi |
|---------|--------|
| Cinema Ops blank putih | Error boundary catch — refresh halaman, cek console error |
| TMDB lookup return 503 | `TMDB_API_KEY` env belum di-set di VPS — lihat memory `tmdb-api-key` |
| Bulk push skip outlet | Outlet tidak punya studio aktif — tambah studio dulu |

### Backend / Server

| Masalah | Solusi |
|---------|--------|
| Bad Gateway 502 | pm2 backend crash — `ssh root@VPS 'pm2 logs karyaos-backend --lines 50'` |
| Endpoint POST return 200 tapi state gak update | Body parser middleware order issue — endpoint registered sebelum `app.use(express.json())` |
| WS disconnect tiap 60s | nginx config missing `/ws` upgrade headers — lihat memory `nginx-ws-upgrade` |

### Emergency Logout (Kasir)

Buka DevTools (F12) → Console → ketik:
```js
posLogout()
```
→ Clear session + reload dengan login screen fresh.

---

## 9. Quick Reference URL

| Surface | URL Pattern | Audience |
|---------|-------------|----------|
| Admin | `/?admin` | Manager / HQ |
| POS Cinema kasir | `/?pos-cinema&outlet=XXX&fresh=1` | Kasir |
| CDS second display | `/?cinema-cds&outlet=XXX` | TV (customer view) |
| KDS kitchen | `/?cinema-kds` | F&B staff |
| Cinema Kiosk customer | `/?cinema&outlet=XXX` | Customer self-service |
| In-Studio snack order | `/?cinema-snack&seat=A1&studio_id=N` | Customer di kursi |
| Mobile rating | `/?cinema-feedback&film=ID` | Customer HP |
| Lobby TV signage | `/?cinema-board&outlet=XXX` | Lobby TV |

### Keyboard Shortcuts

- **F11** — Full-screen browser (untuk CDS, KDS, Kiosk)
- **Cmd+Shift+R** / **Ctrl+Shift+R** — Hard refresh (skip cache)
- **F12** — DevTools (untuk emergency logout)

---

## 🖨️ Printer Setup (Thermal Silent Print)

karyaOS support **Epson TM-T82** + brand China compatible (ESC/POS protocol) — USB atau LAN.

### Option A — LAN Printer (Recommended) + ESC/POS Direct

Tiap outlet config printer URL via Admin → pos_config:

```bash
# Per outlet
curl -X PUT https://kiosk.karys.tech/api/pos/config/CINEMA_PRINTER_URL:JKT01 \
  -H "Content-Type: application/json" \
  -d '{"value":"http://192.168.1.100:8008"}'

# Default fallback
curl -X PUT https://kiosk.karys.tech/api/pos/config/CINEMA_PRINTER_URL_DEFAULT \
  -H "Content-Type: application/json" \
  -d '{"value":"http://192.168.1.100:8008"}'
```

Kasir klik **🖨️ Print Thermal** → backend kirim ESC/POS commands langsung ke printer IP → **NO preview dialog**.

### Option B — Browser Silent Print (Chrome `--kiosk-printing` flag)

Setup Chrome shortcut di laptop kasir dengan flag:

**Windows**: edit shortcut Chrome → Target field:
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --kiosk https://kiosk.karys.tech/?pos-cinema&outlet=JKT01&fresh=1
```

**Mac/Linux**:
```
google-chrome --kiosk-printing --kiosk "https://kiosk.karys.tech/?pos-cinema&outlet=JKT01&fresh=1"
```

Dengan flag ini, klik **🖨️ Print** → langsung print tanpa preview popup.

### Option C — Fallback: Kirim WA

Kalau printer benar-benar mati & ga ada tindakan recovery:
1. Kasir klik **📱 Kirim WA** di Success page
2. Input nomor WA customer
3. Auto-build link `wa.me/...` dengan tiket digital
4. Customer terima link → buka di HP → tunjukkan QR ke usher

### Auto-fallback Behavior

POS Cinema **🖨️ Print Thermal** button:
1. Coba ESC/POS direct ke printer LAN (silent, no preview)
2. Kalau gagal (printer offline / URL gak set) → fallback browser print thermal mode

---

## 10. Deploy & Maintenance

### Deploy Update Code ke VPS

```bash
ssh root@202.155.94.202 "cd /home/karyaos/app/bites-kiosk && git pull && npm run build && pm2 restart karyaos-backend && echo DEPLOY_OK"
```

Sudah passwordless SSH dari `bintorosiallagan@Mac` ke VPS (key configured 2026-05-23).

### Cek Backend Status

```bash
ssh root@202.155.94.202 "pm2 list && pm2 logs karyaos-backend --lines 30 --nostream"
```

### Backup Database

```bash
ssh root@202.155.94.202 "cp /home/karyaos/app/bites-kiosk/server/data.db /home/karyaos/backups/data-$(date +%Y%m%d).db"
```

Database file: `server/data.db` (SQLite, single file)

### Restart Backend

```bash
ssh root@202.155.94.202 "pm2 restart karyaos-backend --update-env"
```

`--update-env` perlu kalau ubah `.env` (mis. rotate TMDB key, midtrans key, dll).

### Set Environment Variable

```bash
ssh root@202.155.94.202 "echo 'TMDB_API_KEY=xxx' >> /home/karyaos/app/bites-kiosk/server/.env && pm2 restart karyaos-backend --update-env"
```

### Reset Walk-in Grace Period

```bash
curl -X PUT https://kiosk.karys.tech/api/pos/config/WALK_IN_GRACE_MIN \
  -H "Content-Type: application/json" \
  -d '{"value":"30"}'
```

Default 60 menit. Set 30 untuk lebih strict, 90 untuk lebih lenient.

---

## 📞 Support & Contact

- Production: https://kiosk.karys.tech/
- VPS: Nevacloud Ubuntu 26.04 (`root@202.155.94.202`)
- Repo: https://github.com/bintoro-siallagan/Kiosk
- Tech Owner: Bintoro Siallagan (`bintoro.siallagan@mysoursally.com`)

---

> 🎬 **karyaOS Cinema** — Built with React + Vite + Express + SQLite + WebSocket + Midtrans/Xendit QRIS.
> Last updated: 2026-05-24
