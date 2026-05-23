# 🚀 karyaOS — Skrip Demo Presentasi Owner

Panduan urutan demo + narasi. Total ~10-12 menit.

---

## 0. Persiapan (sebelum owner masuk)

| Hal | Aksi |
|---|---|
| Backend | pastikan jalan di port `3001` |
| Frontend | Vite jalan di port `5184` |
| Login admin | buka browser → login **PIN Manager `123456`** |
| Layar utama | buka **Command Center**: `…/bites-kiosk/?command=1` |
| Layar kedua (POS) | tab terpisah: `…/bites-kiosk/?pos=1` |

Routes lain: `?tools=1` (AdminTools), `?kds=1` (dapur), `?kiosk` (kiosk customer).

---

## 1. EXECUTIVE — "Owner buka, 10 detik ngerti" (2 menit)

Buka tab **👔 Executive**.

> *"Ini halaman pertama owner. Gak perlu baca laporan — langsung kelihatan outlet sehat atau enggak."*

- **🏆 Outlet Health Score 🟢 83** — tunjuk gauge-nya. "Skor gabungan 6 hal: SOP, Sales, Feedback, Stock, Issue, Staff. Hijau = sehat."
- "Lihat — Issue masih ⚠ kuning. Dashboard ini **jujur**, bukan hiasan. Dia kasih tau ada yang perlu dibereskan."
- **Summary**: Revenue 2,85jt · Growth **+14%** · Target 95% · Issue Open 17.
- **🕐 Incident Timeline** — "kayak ruang kontrol bandara. Semua kejadian penting tercatat kronologis, real-time."

---

## 2. CUSTOMER EXPERIENCE — hero feature (2 menit)

Tab **😊 Customer**.

> *"Pembeda karyaOS: customer yang ngawasin kualitas pelayanan."*

- Satisfaction **4,15★** · Repeat Customer 90%.
- **Rating per Sales Channel** — POS / Kiosk / QR dipisah. "Tau persis channel mana yang pelayanannya kurang."
- **Leaderboard kasir** — "Kasir 2 rating-nya jeblok (2-an) → otomatis ke-flag buat HRD."
- **Feedback Trend 7 hari** — grafik kepuasan.

> *"Kasir tau dinilai customer → otomatis kasih pelayanan terbaik."*

---

## 3. OPERATION HEALTH — pembeda (1,5 menit)

Tab **🟢 Operation**.

- **Opening & Closing checklist** 🟢 — "kasir WAJIB checklist buka/tutup toko. Gak bisa transaksi kalau belum."
- Tunjuk **mood kasir** + **target harian** di kartu Opening.
- SOP Compliance 100%.

---

## 4. HRIS & WORKFORCE (1 menit)

Tab **👥 HRIS**.

- Roster absensi — siapa hadir, **siapa telat** (Kasir 2 telat 23 menit), lembur, produktivitas.
- Staffing Level 80% · Payroll status.

---

## 5. RISK & ALERT + 🔥 TRIK WOW (2 menit)

Tab **🚨 Anomali**.

- "17 anomali ke-deteksi otomatis — refund mencurigakan, selisih kas, void abnormal, dll. Semua tipe."
- Tunjuk filter per kategori.

### 🔥 Trik live (paling ngefek):
1. Di tab Anomali, **resolve beberapa anomali** (klik anomali → resolve).
2. Balik ke tab **Executive**.
3. **Outlet Health Score naik** — di depan mata owner.

> *"Begitu masalah dibereskan, skor kesehatan langsung naik. Real-time. Ini dashboard yang HIDUP."*

---

## 6. POS — sisi kasir (2 menit)

Tab POS (`?pos=1`) → login kasir.

- **Opening checklist** muncul — "kasir isi checklist + mood + target penjualan hari ini sebelum mulai."
- Quick Order → pilih menu → bayar → **struk**.
- Setelah struk → **popup kepuasan customer** (bintang 1-5) — "inilah yang ngisi data Customer Experience tadi."

---

## 7. Penutup — pitch (1 menit)

> *"karyaOS bukan dashboard chart cantik. Ini sistem yang kasih:*
> - *✅ Operational visibility — tau kondisi outlet real-time*
> - *✅ Anomaly detection — curang & error ke-tangkap otomatis*
> - *✅ Realtime action — masalah ke-flag, bukan ketahuan pas tutup buku*
> - *✅ Business awareness — owner ngerti tanpa baca laporan"*

**7 Core Indicator** ke-cover: Business · Operation · Customer · Sales · Stock · HRIS · Risk.

---

## ⚠️ Catatan teknis
- Tab **Anomali** & **Executive** butuh **login admin dulu** (PIN `123456`) — kalau belum login, data gak muncul.
- Health Score 🟢 83 — Issue masih ⚠ (17 anomali open) itu **disengaja jujur**. Justru bagus buat trik #5.
- Semua data sudah ter-seed buat demo — gak perlu input manual.
