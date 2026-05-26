# 🚀 karyaOS Outlet Launch Readiness (KOLR)
## Sales Pitch Deck — Untuk Calon Customer Multi-Outlet

> **Tagline:** *"Outlet baru gagal launch = hilang Rp 2 Miliar. Pakai KOLR, semua dept tanggung jawab, GO LIVE tanpa drama."*

---

## 1️⃣ THE PAIN — Saat Outlet Baru "Salah Menyalahkan"

### Cerita Real F&B / Cinema Indonesia:

**D-Day pagi, outlet baru di Jakarta Selatan opening.**
- Antrian customer sudah panjang sejak 10:00
- Tapi POS belum bisa menerima order — IT bilang "kemarin masih jalan, gak tau kenapa rusak"
- Stock concession kurang — Supply Chain bilang "harusnya kemarin sudah datang, supplier alasan macet"
- 3 dari 8 kasir gak hadir — HR bilang "saya sudah brief, mungkin mereka lupa"
- Sertifikat halal masih nunggu MUI — Legal bilang "kontak ke MUI lambat respond"
- Investor + media sudah datang untuk ribbon cutting
- **GM stress, OP Head marah, Owner kehilangan muka.**

### Kerugian per outlet gagal launch:
| Komponen | Cost |
|---|---|
| Investasi outlet (sewa+fit-out+equipment) | Rp 1.5 - 3 Miliar |
| Marketing pre-opening (event, ads, influencer) | Rp 50 - 200 juta |
| Opportunity cost penundaan 1 minggu | Rp 100 - 500 juta |
| Reputation damage (viral di sosmed) | Tidak ternilai |
| Tim resign karena disalahin | Talent hilang |

### Yang aneh: **tidak ada satupun yang bisa di-pinpoint siapa salah.**
Karena tidak ada single source of truth. Semua dept punya checklist sendiri (kalau ada). WA group sudah jutaan pesan. Excel tracker terakhir di-update H-7. Drive folder bercabang-cabang.

> **Pre-opening adalah blackbox. Saat ada masalah, semua merasa "sudah selesai bagian saya".**

---

## 2️⃣ THE SOLUTION — Karya Outlet Launch Readiness (KOLR)

> **Satu platform, 9 departemen, 6 stage, 80 checklist task, 9 PIN sign-off. GO LIVE diblokir sampai semua dept resmi tandatangan.**

### Arsitektur akuntabilitas:

```
┌────────────────────────────────────────────────────────────────┐
│  T-30 ──── T-14 ──── T-7 ──── T-3 ──── T-1 ──── D-DAY          │
│   │         │         │        │        │        │             │
│   ▼         ▼         ▼        ▼        ▼        ▼             │
│  ┌──────────────────────────────────────────────────┐          │
│  │ 9 DEPARTEMEN (parallel track):                   │          │
│  │ 1. 🏗️ Construction & Fit-Out      → 10 task     │          │
│  │ 2. 💻 IT & Tech (POS, Network)    → 10 task     │          │
│  │ 3. 👥 HR & Training               → 10 task     │          │
│  │ 4. ⚙️ Operations & SOP           → 10 task     │          │
│  │ 5. 📦 Supply Chain & Stock        →  8 task     │          │
│  │ 6. 📢 Marketing & Promo           →  9 task     │          │
│  │ 7. 💰 Finance & Cash Float        →  8 task     │          │
│  │ 8. ⚖️ Compliance & Legal          →  9 task     │          │
│  │ 9. 🔍 Quality Assurance           →  8 task     │          │
│  │                                                  │          │
│  │ → 80 task total, deadline auto-calc dari D-Day  │          │
│  └──────────────────────────────────────────────────┘          │
│                          ▼                                     │
│           ╔═══════════════════════════════╗                    │
│           ║ 9× SIGN-OFF PIN DEPT LEAD     ║                    │
│           ║ ↓                              ║                    │
│           ║ ┌───────────────────────────┐ ║                    │
│           ║ │ 🚀 GO LIVE button enabled  │ ║                    │
│           ║ │ (LOCKED jika belum 9/9)   │ ║                    │
│           ║ └───────────────────────────┘ ║                    │
│           ╚═══════════════════════════════╝                    │
└────────────────────────────────────────────────────────────────┘
```

### 4 Pilar KOLR:

#### Pilar 1 — Auto-Generated Checklist (anti reinvent-wheel)

Saat admin create project outlet baru: **80 task otomatis di-seed** dari template best-practice (F&B + Cinema). Tidak perlu mikir checklist dari nol.

Setiap task punya:
- Deadline otomatis (T-X hari sebelum opening)
- Status: Pending → In Progress → Done / Blocked / N/A
- Owner (siapa PIC)
- Note (kondisi terkini, alasan blocked, dll)
- **Photo evidence wajib** untuk task fisik (lobby clean, kitchen ready, etc)

Template bisa di-customize per brand (Anda bisa edit / tambah / hapus item, save sebagai template brand sendiri).

#### Pilar 2 — Multi-Dept Sign-off PIN (anti-saling-tuduh)

Saat semua task departemen Anda **DONE / N/A** + photo evidence lengkap:

```
┌─────────────────────────────────────┐
│ 💻 IT & Tech                        │
│ ─────────────────────────────────── │
│   ✅ Internet provider order       │
│   ✅ Kabel LAN + power point       │
│   ✅ Internet speed test ≥50Mbps   │
│       📸 [foto NetSpeedTest.jpg]    │
│   ✅ POS hardware terkirim         │
│       📸 [foto delivery_check.jpg] │
│   ✅ POS terinstall + login test   │
│   ✅ CCTV ter-install              │
│   ✅ WiFi customer aktif           │
│   ✅ KDS / CDS / kiosk integration  │
│   ✅ Backup printer + UPS          │
│   ✅ Standby IT support D-Day      │
│                                     │
│       ┌─────────────────────────┐   │
│       │ 🔏 SIGN-OFF PIN         │   │
│       │                          │   │
│       │ Nama: Andi Wijaya (IT)  │   │
│       │ PIN:  ••••              │   │
│       │ Komentar: 'Speed avg 78Mbps' │
│       │                          │   │
│       │     [ KONFIRMASI ]      │   │
│       └─────────────────────────┘   │
└─────────────────────────────────────┘
```

Setelah sign-off:
- Task departemen ini **TERKUNCI** (tidak bisa di-edit lagi tanpa revoke signoff)
- PIN di-hash SHA-256 (tidak ada plain text di database)
- Timestamp + nama + IP terekam di audit log
- **Dept lead BERTANGGUNG JAWAB** atas kondisi semua task — kalau D-Day ada masalah di area IT, jelas Andi yang harus jawab

#### Pilar 3 — GO LIVE Strict-Lock (anti-paksa-buka)

GO LIVE button **abu-abu / disabled** sampai 9 dari 9 dept sign-off:

```
🚀 OVERALL READINESS: 78%
   • Construction ✓  • Operations ✓  • Finance ✓
   • IT ✓            • Supply Chain ✓ • Compliance ✓
   • Marketing ⏳    • HR ⏳          • QA ⏳

   ┌────────────────────────────────────┐
   │ 🚀 GO LIVE  (button disabled)     │
   │   3 dept belum sign-off:          │
   │   Marketing, HR, QA               │
   └────────────────────────────────────┘

   [ ⚠ GM Waiver Override ] (only super-admin)
```

Bahkan kalau dipaksa pakai **GM Waiver**, sistem catat:
- Siapa GM yang waive
- Alasan waiver
- **Daftar dept yang di-skip**
- Status outlet jadi `waived_live` (bukan `live` murni) — terbaca jelas di analytics

Setelah outlet beneran live, kalau ada insiden P0:
- Buka audit trail → langsung kelihatan dept mana yang waived → akar masalahnya
- Tidak ada lagi "saya sudah selesai bagian saya kok"

#### Pilar 4 — Anti-Fraud Camera & Evidence

Photo evidence untuk task fisik **WAJIB pakai kamera langsung**:
- Pakai browser MediaDevices API (live camera stream)
- **Galeri / Photo Library TIDAK BISA dipilih** — gak bisa upload foto kemarin
- Front cam untuk selfie kerja, rear cam untuk kondisi area
- Timestamp embed otomatis
- Multi-foto per task (sebelum + sesudah, atau angle berbeda)

Manager tidak bisa ngakali. Semua foto otentik.

---

## 3️⃣ THE ROI — Bukti Investasi Worth It

### Skenario: Brand F&B yang buka 6 outlet baru per tahun

| Item | Tanpa KOLR | Dengan KOLR | Saving |
|---|---|---|---|
| Failed opening (avg 1×/tahun, kerugian Rp 500jt) | 1 ev | 0 ev | **Rp 500.000.000** |
| Late opening (avg 2×, masing-masing tunda 1 mgg) | Rp 200jt | Rp 50jt | **Rp 150.000.000** |
| Coordination overhead (overtime + WA) | Rp 60jt | Rp 10jt | **Rp 50.000.000** |
| Talent attrition (1 GM resign disalahin) | Rp 80jt | Rp 0 | **Rp 80.000.000** |
| Repair/rework post-opening (defect tertinggal) | Rp 120jt | Rp 30jt | **Rp 90.000.000** |
| **TOTAL SAVING PER TAHUN** | | | **Rp 870.000.000** |
| Investasi KOLR (setup + setahun subscribe) | | | Rp 60.000.000 |
| **NET ROI** | | | **Rp 810.000.000 (14× ROI)** |

### Manfaat intangible:
- ✅ GM tidur nyenyak — readiness % real-time di HP
- ✅ Investor confidence — tunjukkan dashboard "78% ready, GO LIVE locked sampai 100%"
- ✅ Vendor accountability — kontraktor / supplier bisa diberi akses ke task mereka
- ✅ Best practice transfer — outlet ke-7 lebih cepat ready karena pakai template ke-6
- ✅ Compliance audit — semua sertifikat ada foto + timestamp, BPOM/halal check gampang

---

## 4️⃣ DEMO FLOW — 5 Menit Wow Customer

### Setup demo (Anda bawa laptop + HP):

1. **Buka KOLR Tracker** → tunjukkan 2 project demo (Kemang Plaza 2 + BSD Cineplex)
2. **Click Kemang Plaza 2** → drill-down:
   - Tunjukkan dept tabs dengan progress berbeda
   - **HR tab** → ada 1 task BLOCKED ("Vendor training cancel mendadak") — "lihat, langsung kelihatan siapa stuck di mana, gak nunggu D-Day baru ribut"
   - **Finance tab** → 4/8 done, "kalau saya selaku Finance lead lihat ini di HP, saya tau besok harus selesaiin EDC sama tax config"
3. **Tap GO LIVE button** → tampil error: "3 dept belum sign-off". "Kalau brand Anda sering buka outlet dengan teriak-teriakan di WA group, ini cara enforce-nya."
4. **Switch ke HP demo**, buka `/?launch` → pilih dept IT → tap task "Internet speed test" → status=Done → **"📸 Ambil Foto Bukti"** → tap → **live camera fullscreen** → snap foto layar speedtest.net → "Pakai Foto Ini" → upload selesai
5. **Tunjukkan audit trail** → "Sandra Lim, 14:32, upload foto bukti internet speed Kemang Plaza 2" — tercatat permanent
6. **Closing:**

> *"Bayangkan setiap outlet baru Anda punya jejak audit selengkap ini. Saat outlet ke-7 launch, IT cuma tinggal duplicate template Kemang. Saat outlet ke-15, brand Anda jadi waralaba yang sistematis."*

### Yang harus dibawa:
- ✅ Laptop dengan KOLR + KROC pre-loaded
- ✅ HP untuk demo field worker
- ✅ ROI calculator Excel (input jumlah outlet baru/tahun, auto-hitung saving)
- ✅ Screenshot audit trail outlet hipotetis

---

## 5️⃣ COMPETITIVE EDGE

| Aspek | KOLR karyaOS | Asana / Trello / Monday | Excel + WA |
|---|---|---|---|
| Template 80 task ready (F&B + Cinema) | ✅ | ❌ Bangun dari nol | ❌ Manual |
| Multi-dept sign-off PIN | ✅ | ❌ | ❌ |
| Live camera evidence (anti-fraud) | ✅ | ❌ | ❌ |
| GO LIVE strict-lock | ✅ | ❌ | ❌ |
| Auto-deadline per stage T-X | ✅ | ⚠️ Manual | ❌ |
| Audit trail permanent | ✅ | ⚠️ Limited | ❌ |
| Integrated dengan POS/Operations | ✅ | ❌ | ❌ |
| Mobile PWA field worker | ✅ | ⚠️ App install | ❌ |
| Time to deploy | **3 hari** | 2-4 minggu | "Sudah ada" tapi gak jalan |
| Total cost (1 brand, 10 outlet/tahun) | Rp 60jt/tahun | Rp 100-300jt | Rp 0 (tapi failed launch Rp 500jt+) |

---

## 6️⃣ PRICING

| Tier | Harga | Untuk |
|---|---|---|
| **Starter** | Rp 25.000.000 / project outlet | 1-3 outlet baru/tahun. Setup + 6 bulan support per project. |
| **Pro Subscription** | Rp 5.000.000 / bulan unlimited projects | 4-15 outlet baru/tahun. Akses Launch Tracker + Field Worker PWA + audit trail. |
| **Enterprise** | Custom (mulai Rp 60jt/tahun) | 15+ outlet/tahun. Tambahan: custom template per brand, white-label, integrasi ERP. |

### Setup fee one-time: Rp 5jt
- Onboarding workshop (4 jam, training PM + dept leads)
- Customize template brand
- Setup PIN + WA number per dept lead

### Bundling with KROC:
- KOLR + KROC bundle: Rp 50jt/tahun (10 outlet) — hemat 30%
- "Open well, run well" — pakai KOLR untuk launch, pakai KROC untuk daily ops setelah live

---

## 7️⃣ OBJECTION HANDLING

**❓ "Tim saya gak biasa pakai checklist digital, mereka maunya WA aja"**
> Justru itu masalahnya — WA gak punya audit trail, gak punya enforcement, gak bisa di-search saat investigasi. KOLR PWA buka di HP biasa, 4-step max per task: pilih dept, tick status, foto bukti, sign-off PIN. Lebih cepat dari ngetik WA panjang.

**❓ "Kalau saya skip 1-2 task gimana?"**
> Anda bisa set status "N/A" — tidak counted sebagai outstanding, tapi tercatat keputusan. Atau "Blocked" dengan alasan — dept lain bisa lihat dan bantu unblock. Tidak ada hidden skip.

**❓ "Bagaimana kalau outlet kecil yang gak butuh 9 dept?"**
> Saat create project, Anda bisa centang dept mana yang aktif. Cinema mungkin gak butuh Quality Assurance sebesar outlet flagship. Default 9 dept tapi flexible.

**❓ "Saya khawatir GM Waiver disalahgunakan"**
> Waiver action butuh PIN GM/Owner khusus, **dan auto-log** dept mana yang di-skip. Saat outlet bermasalah, owner langsung tau "waiver Sept 2026 — Marketing & QA skipped". Anda jadi audit-able.

**❓ "Kalau ada task baru di tengah jalan?"**
> Admin bisa tambah task ad-hoc kapan saja. Dept yang sudah sign-off otomatis perlu "re-signoff" karena ada task baru → enforced re-review.

**❓ "Brand kompetitor saya gak pakai kayak gini, kenapa saya harus?"**
> Brand yang scale-up dari 5 → 50 outlet biasanya stuck di outlet 10-15 karena coordination chaos. KOLR adalah moat. Saat customer Anda buka outlet ke-20, brand kompetitor masih ribet di outlet ke-8.

---

## 8️⃣ NEXT STEP CALON CUSTOMER

1. **Diskusi 30 menit** — kasus failed/late opening yang pernah terjadi
2. **Demo 1 jam** — full flow dengan project mereka sebagai contoh
3. **Pilot 1 outlet** — track outlet baru terdekat mereka pakai KOLR (sama-sama belajar template)
4. **Subscribe** — kalau pilot smooth, lanjut full subscription

**Target customer profile:**
- Brand F&B / Cinema yang lagi ekspansi (3+ outlet baru/tahun)
- Sudah pernah punya 1-2 failed/late opening
- Owner yang udah lelah jadi "supir tengah" antar dept
- Brand yang punya investor / target pertumbuhan agresif

---

## 9️⃣ ONE-LINER (WA / Email Pertama)

> *"Pak/Bu, ada cara biar outlet baru gak gagal launch lagi. Sistem checklist 9 dept × 6 stage, GO LIVE diblokir sampai semua dept sign-off PIN. Failed launch 1× = Rp 500jt — KOLR Rp 60jt/tahun. Mau demo 30 menit?"*

---

## 🔟 KEY MESSAGE

> **"KOLR tidak mengatur outlet Anda untuk berhasil — KOLR membuat ketidakberhasilan jadi tidak mungkin disembunyikan."**

---

_Pasangan dari [PITCH-REMOTE-OPS.md](./PITCH-REMOTE-OPS.md) (KROC — daily ops setelah outlet live)._
_Version 1.0 — Mei 2026_
