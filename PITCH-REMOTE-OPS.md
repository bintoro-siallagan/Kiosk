# 🎯 karyaOS Remote Outlet Command (KROC)
## Sales Pitch Deck — Untuk Calon Customer Multi-Outlet

> **Tagline:** *"Kelola 20 outlet tanpa naik pesawat. Bayar 1× setup, hemat Rp 480jt/tahun."*

---

## 1️⃣ THE PAIN — Apa yang Bocor di Bisnis Multi-Outlet

### Realitas Operations Head F&B / Cinema Indonesia:

| Aktivitas | Frekuensi | Cost per Visit | Annual Cost (10 outlet) |
|---|---|---|---|
| Flight + hotel Jakarta-Surabaya | 2×/bulan | Rp 5.000.000 | Rp 120.000.000 |
| Perjalanan darat antar-outlet | 8×/bulan | Rp 800.000 | Rp 76.800.000 |
| Per-diem + meal allowance | 10 hari/bln | Rp 500.000/hari | Rp 60.000.000 |
| Opportunity cost (waktu OP Head) | 12 hari/bln | Rp 1.500.000/hari | Rp 216.000.000 |
| **TOTAL per OP Head per tahun** | | | **Rp 472.800.000** |

### Worse: visit itu sering **show-case**, bukan realita:
- Staff dapat info "Pak X datang besok" → semalam langsung beresin
- OP Head datang → semua tampak rapi
- OP Head pulang → kembali kacau
- **Anda bayar mahal untuk teater, bukan inspeksi.**

---

## 2️⃣ THE SOLUTION — Karya Remote Outlet Command

> **Pindahkan "mata Owner" ke layar laptop, bukan di lapangan.**

### 4 Pilar KROC:

```
┌─────────────────────────────────────────────────────────────┐
│  PILAR 1     │ PILAR 2     │ PILAR 3      │ PILAR 4         │
│  DAILY SELF  │ HEALTH      │ ANOMALY      │ REMOTE          │
│  AUDIT       │ SCORE       │ DETECTOR     │ EYES (CCTV)     │
│              │             │              │                 │
│  Manager     │ Composite   │ Auto-push    │ Embed feed      │
│  foto subuh  │ 0-100 per   │ ke WA OP     │ realtime ke     │
│  GPS+stamp   │ outlet      │ Head saat    │ dashboard       │
│              │             │ anomali      │                 │
└─────────────────────────────────────────────────────────────┘
                         ▼
        ┌────────────────────────────────────┐
        │  COMMAND CENTER 1 LAYAR            │
        │  20 outlet, color-coded,           │
        │  drill-down ke foto + CCTV + KPI   │
        └────────────────────────────────────┘
```

### Pilar 1 — Daily Self-Audit (Anti-Show-Case)

Outlet manager **wajib submit** checklist setiap pagi sebelum buka:
- 📸 Foto Lobby/Entrance — bersih?
- 📸 Foto Kitchen — higienitas?
- 📸 Foto Restroom — terurus?
- 📸 Foto Staff — grooming sesuai?
- 📸 Foto Display Makanan / Stok Concession
- 📸 Foto APAR + P3K + CCTV indicator
- 📸 (Cinema) Foto Studio + Projector + Kursi

**Anti-fraud:**
- GPS auto-tagged → harus di-tag dari **lokasi outlet** (radius 200m)
- Timestamp embed → tidak bisa pakai foto kemarin
- PIN manager → tidak bisa di-submit orang lain
- Photo hash → tidak bisa di-edit
- Deadline 10:00 → telat = anomaly auto-push ke OP Head

**Result:** OP Head bangun pagi, buka HP, lihat 20 outlet sudah submit foto. Mata Owner di setiap sudut, tanpa terbang.

---

### Pilar 2 — Outlet Health Score (0-100)

Setiap 30 menit, sistem auto-hitung score per outlet:

| Komponen | Bobot | Sumber Data |
|---|---|---|
| 💰 **Sales** vs avg 7 hari | 30% | POS transactions |
| ⭐ **Customer Rating** | 25% | Cashier rating + film rating |
| 🚨 **Open Incident** | 20% | Incident log |
| ✅ **Audit Completion** | 15% | Daily self-audit |
| 🚫 **Void Rate** | 10% | Refund + cancel data |

**Color-coded grid:**
- 🟢 **A (90-100)** — Sehat, no action needed
- 🟡 **B (75-89)** — Good, light monitoring
- 🟠 **C (60-74)** — Warning, perlu follow-up
- 🔴 **D (<60)** — Kritis, visit/call sekarang

> **OP Head scan 20 outlet dalam 10 detik.** Yang merah = action. Yang hijau = trust the system.

---

### Pilar 3 — Anomaly Auto-Alert ke WhatsApp

Sistem cron 15 menit detect 5 jenis anomali:

| Tipe | Trigger | Severity |
|---|---|---|
| 📉 Sales Drop | Hari ini <70% avg 7d (setelah jam 14:00) | Warning / Critical (>50%) |
| ⭐ Low Rating | Avg 5 rating terakhir <3.5★ | Warning |
| 🚨 Incident Open | Insiden status `open` >1 jam | Critical |
| 📋 No Audit | Belum submit jam 10:00 | Warning |
| 🚫 Void Spike | Void rate >10% (min 10 transaksi) | Warning |

Push langsung ke WhatsApp OP Head — **bukan email yang ke-delete**:

```
🚨 *CRITICAL* — KEMANG_01
Insiden "ac_studio_off" open >1 jam — Studio 2 AC mati
sejak 14:23, belum ada update.

_karyaOS Remote Ops_
```

OP Head terima → buka KROC → lihat CCTV + audit photo + langsung video call manager outlet. **Tidak perlu terbang.**

---

### Pilar 4 — Live CCTV Embed (Remote Eyes)

Embed feed IP camera outlet ke dashboard admin:
- **Hikvision / Dahua** — via HTTP MJPEG atau HLS
- **iframe** — embed NVR web UI langsung
- **Per-outlet camera grid** — Lobby / Kitchen / Cashier / Studio

OP Head di Jakarta lihat antrian Kemang realtime. Manager outlet sadar **selalu di-watch**, perilaku konsisten 24/7, bukan cuma saat visit.

---

### Bonus Pilar — Scheduled Visit dengan GPS Proof

Kalau memang harus visit (audit mendalam / training / opening), schedule + check-in dengan:
- 📍 GPS check-in (validasi radius 200m dari outlet pin)
- 📸 Selfie arrival photo (anti-absen palsu)
- ⏱️ Timestamp + duration tracking
- 📝 Notes wajib sebelum checkout

**Insight buat HR:** OP Head visit produktif vs visit kosong, jelas datanya.

---

## 3️⃣ THE ROI — Bukti Bahwa Ini Hemat

### Skenario: Brand F&B 10 outlet (Jakarta + Bandung + Surabaya)

| Item | Sebelum KROC | Sesudah KROC | Hemat |
|---|---|---|---|
| Frekuensi visit OP Head | 10×/bulan | 2×/bulan (yang merah saja) | 8 visit |
| Cost visit | Rp 47jt/bulan | Rp 10jt/bulan | **Rp 37jt/bulan** |
| Setahun | Rp 564jt | Rp 120jt | **Rp 444jt** |
| Subscribe KROC | — | Rp 36jt/tahun | — |
| **NET SAVING** | | | **Rp 408 juta/tahun** |

**Plus intangible:**
- ✅ Issue ke-detect dalam 15 menit, bukan 2 minggu
- ✅ Manager outlet 24/7 perform (selalu di-watch)
- ✅ Data-driven coaching (rating + audit photo arsip)
- ✅ Brand consistency naik (audit standar enforced)
- ✅ OP Head bisa handle **20-30 outlet** vs sebelumnya cuma 10 (skalabilitas)

---

## 4️⃣ DEMO FLOW — 5 Menit Wow Customer

### Setup demo (saya yang bawa laptop):

1. **Buka KROC Command Center** → tampil grid 5 outlet demo
   - 3 hijau, 1 kuning, 1 merah
2. **Click outlet merah (Kemang)** → drill-down:
   - Tampil 6 foto audit pagi tadi (lobby kotor, kitchen ok, dst)
   - Tampil CCTV embed live (atau replay)
   - Tampil 3 anomali aktif (sales drop, incident open, void spike)
   - Tampil health score breakdown: Sales 35% / Rating 65% / dst
3. **Pukul submit "Daily Audit" dari HP demo** → score outlet langsung naik realtime
4. **Trigger anomaly manual** → WhatsApp masuk ke HP customer dalam 5 detik
5. **Scheduled visit GPS check-in** → tunjukkan radius validation
6. **Closing:** "Bayangkan 1 layar ini menggantikan 8 flight per bulan."

### Yang harus dibawa untuk demo:
- ✅ Laptop dengan KROC pre-loaded
- ✅ HP demo dengan akses audit page
- ✅ Slide ROI calculator (Excel) — masukan jumlah outlet customer, auto-hitung saving
- ✅ Sample WhatsApp alert screenshot
- ✅ Surat referensi (kalau ada existing customer)

---

## 5️⃣ COMPETITIVE EDGE — Kenapa KROC, Bukan Yang Lain?

| Aspek | KROC karyaOS | Solusi Lain (Generic ERP) |
|---|---|---|
| Self-audit dengan photo + GPS | ✅ Built-in, vertical-specific | ⚠️ Custom dev |
| Health score composite per outlet | ✅ Auto + tunable bobot | ❌ Manual report |
| WA push anomaly | ✅ Realtime | ⚠️ Email (delayed) |
| CCTV embed di dashboard | ✅ Multi-vendor (Hikvision, Dahua, iframe) | ❌ Separate app |
| F&B + Cinema dual vertical | ✅ Native | ❌ Pisah modul |
| Integrasi POS native (sales realtime) | ✅ 1 stack | ⚠️ API sync delay |
| Visit GPS proof | ✅ Built-in | ❌ Tidak ada |
| Time to deploy | **1 minggu** | 3-6 bulan |
| Cost setup | Rp 5jt | Rp 50-100jt |

---

## 6️⃣ PRICING (Saran)

### Paket Subscription per Outlet per Bulan:

| Tier | Harga/outlet/bln | Fitur |
|---|---|---|
| **Starter** | Rp 250.000 | Self-audit + health score + 1 user OP |
| **Pro** | Rp 500.000 | + Anomaly WA + CCTV embed + 3 user |
| **Enterprise** | Rp 1.000.000 | + Visit GPS + custom alert + unlimited user + dedicated CS |

### Setup Fee: Rp 5.000.000 one-time (training manager, CCTV config, customization)

### Sample Quote:
**10 outlet × Pro × 12 bulan = Rp 60jt/tahun + setup Rp 5jt = Rp 65jt**
**Customer hemat: Rp 444jt - Rp 65jt = Rp 379jt NET → ROI 5.8×**

---

## 7️⃣ OBJECTION HANDLING

**❓ "Manager outlet kita tidak melek tech, gimana?"**
> PWA mobile web — buka di HP biasa, no install. Onboarding 15 menit. Plus PIN sederhana 4 digit. Kami training day-1.

**❓ "Kalau internet outlet down?"**
> PWA cache offline → audit tetap bisa diisi, auto-sync pas online. CCTV pakai NVR lokal, dashboard cuma proxy.

**❓ "Privasi karyawan?"**
> CCTV embed dari NVR existing customer — KROC cuma display, tidak record/store. Audit photo disimpan internal, bukan cloud publik.

**❓ "Bisa custom checklist per brand?"**
> 100%. Default ada 19 template (F&B + Cinema), tambah/edit kapan saja via admin. Setiap brand bisa beda.

**❓ "Vendor lock-in?"**
> Export data CSV/JSON kapan saja. Selfhost option tersedia untuk Enterprise (deploy di server customer).

**❓ "Kompetitor saya pakai Zoho/Odoo, ngapain ganti?"**
> Zoho/Odoo tidak punya: audit photo workflow, CCTV embed, WA push realtime, vertical-specific (cinema/F&B). Kami complement, bukan replace seluruh ERP — fokus di **operations layer outlet**.

---

## 8️⃣ NEXT STEP UNTUK CALON CUSTOMER

1. **Diskusi 30 menit** — pahami pain mereka, jumlah outlet, current process
2. **Demo 1 jam** — di kantor mereka atau Zoom, bawa laptop demo
3. **Trial 14 hari** — 1 outlet pilot, free
4. **Onboarding paid** — kalau cocok, kontrak + setup

**Target customer profile:**
- 5+ outlet (di bawah 5 belum worth subscribe)
- Multi-kota / multi-region
- Brand dengan SOP standar yang ingin di-enforce
- Owner yang sudah lelah "blind spot" outlet jauh

---

## 9️⃣ ONE-LINER (Pakai di WA / Email Pertama)

> *"Pak/Bu, kami punya cara kurangi cost visit OP Head 80% — manager outlet auto-laporan setiap pagi dengan foto + GPS, sistem auto-alert kalau ada anomali. Bisa demo 30 menit minggu ini?"*

---

**🎯 KEY MESSAGE — INGAT INI SAAT PITCH:**

> **"Kami tidak menjual software. Kami menjual hak Anda untuk berlibur tanpa khawatir 20 outlet bermasalah."**

---

_Dokumen ini dibuat untuk internal sales karyaOS — boleh disesuaikan dengan brand calon customer._
_Version 1.0 — Mei 2026_
