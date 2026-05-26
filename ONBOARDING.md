# 🎬 Karya Cinema — Project Checklist & Quick Links

Master reference untuk semua surface, admin tab, signage URL, dan test scenario Karya Cinema.

**Production**: https://kiosk.karys.tech

---

## 🔐 Login Credentials

| Role | PIN | Akses |
|---|---|---|
| 🎬 Cinema Owner | `200200` | Karya Cinema (company_id=2) |
| 🍔 F&B Manager | `123456` | Karya Bites (company_id=1) |
| 🛰️ Karys Super-Admin | `999999` | Platform-wide (semua company) |

**Login URL**: https://kiosk.karys.tech/?admin

---

## 📊 Dashboard

- **Cinema Owner Dashboard** (purple/onyx, sparkline 7-day, WoW delta): auto-load after PIN 200200 login
- **Karys Platform View** (super-admin): Sidebar Security & Admin → 🛰️ Karys Platform → drill per company

---

## 🏛️ Outlet Cinema (8 admin shortcuts)

| Item | Admin tab |
|---|---|
| 🎬 Films & Showtimes | `cinema_ops` |
| 🎟️ Ticketing / Box Office | `cinema_ticketing` |
| 🍿 Menu F&B (Combo Bundles) | `cinema_bundles` |
| 💲 Harga Tiket | `cinema_price_list` |
| 💺 Studios & Seat Editor | `cinema_seat_types` |
| 📅 Holiday Calendar | `cinema_holidays` |
| 🏛️ Outlet Master | `outlet_master` |
| ⚙️ Pengaturan | `admin/settings` |

---

## 🎬 Customer-facing Surfaces

| Surface | URL |
|---|---|
| 🎟️ POS Cinema (kasir tiket) | https://kiosk.karys.tech/?pos-cinema&fresh=1 |
| 🎬 Cinema Kiosk (customer self-order) | https://kiosk.karys.tech/?cinema |
| 🎬 Cinema Kiosk per outlet | https://kiosk.karys.tech/?cinema&outlet=CMX-JKT01 |
| 👨‍🍳 Cinema KDS (F&B staff) | https://kiosk.karys.tech/?cinema-kds |
| 📺 Cinema CDS (kasir companion) | https://kiosk.karys.tech/?cinema-cds |
| 🍿 In-Studio QR Order | https://kiosk.karys.tech/?cinema-snack |
| 📺 Lobby Board (legacy TV) | https://kiosk.karys.tech/?cinema-board |

---

## 📺 25 Digital Signage Device URLs (Cinema)

URL pattern: `https://kiosk.karys.tech/?signage&device=TV-<OUTLET>-<ZONE>`

### CMX-JKT01 (Jakarta)
- 🏛️ Lobby: https://kiosk.karys.tech/?signage&device=TV-CMX-JKT01-LOBBY
- 🎟️ Box Office: https://kiosk.karys.tech/?signage&device=TV-CMX-JKT01-BOX_OFFICE
- 🍿 F&B Counter: https://kiosk.karys.tech/?signage&device=TV-CMX-JKT01-FNB_COUNTER
- 🚪 Studio Entrance: https://kiosk.karys.tech/?signage&device=TV-CMX-JKT01-STUDIO_ENTRANCE
- 🪟 Window: https://kiosk.karys.tech/?signage&device=TV-CMX-JKT01-WINDOW

### CMX-BDG01 (Bandung)
- 🏛️ https://kiosk.karys.tech/?signage&device=TV-CMX-BDG01-LOBBY
- 🎟️ https://kiosk.karys.tech/?signage&device=TV-CMX-BDG01-BOX_OFFICE
- 🍿 https://kiosk.karys.tech/?signage&device=TV-CMX-BDG01-FNB_COUNTER
- 🚪 https://kiosk.karys.tech/?signage&device=TV-CMX-BDG01-STUDIO_ENTRANCE
- 🪟 https://kiosk.karys.tech/?signage&device=TV-CMX-BDG01-WINDOW

### CMX-SBY01 (Surabaya)
- 🏛️ https://kiosk.karys.tech/?signage&device=TV-CMX-SBY01-LOBBY
- 🎟️ https://kiosk.karys.tech/?signage&device=TV-CMX-SBY01-BOX_OFFICE
- 🍿 https://kiosk.karys.tech/?signage&device=TV-CMX-SBY01-FNB_COUNTER
- 🚪 https://kiosk.karys.tech/?signage&device=TV-CMX-SBY01-STUDIO_ENTRANCE
- 🪟 https://kiosk.karys.tech/?signage&device=TV-CMX-SBY01-WINDOW

### CMX-MDN01 (Medan)
- 🏛️ https://kiosk.karys.tech/?signage&device=TV-CMX-MDN01-LOBBY
- 🎟️ https://kiosk.karys.tech/?signage&device=TV-CMX-MDN01-BOX_OFFICE
- 🍿 https://kiosk.karys.tech/?signage&device=TV-CMX-MDN01-FNB_COUNTER
- 🚪 https://kiosk.karys.tech/?signage&device=TV-CMX-MDN01-STUDIO_ENTRANCE
- 🪟 https://kiosk.karys.tech/?signage&device=TV-CMX-MDN01-WINDOW

### CMX-DPS01 (Bali)
- 🏛️ https://kiosk.karys.tech/?signage&device=TV-CMX-DPS01-LOBBY
- 🎟️ https://kiosk.karys.tech/?signage&device=TV-CMX-DPS01-BOX_OFFICE
- 🍿 https://kiosk.karys.tech/?signage&device=TV-CMX-DPS01-FNB_COUNTER
- 🚪 https://kiosk.karys.tech/?signage&device=TV-CMX-DPS01-STUDIO_ENTRANCE
- 🪟 https://kiosk.karys.tech/?signage&device=TV-CMX-DPS01-WINDOW

---

## 💼 Manajemen & Data Cinema-specific

| Item | Tab |
|---|---|
| Member & Customer | `members` |
| Cinema Promotion (auto-promo milestone) | `cinema_promotion` |
| Daily Closing Cinema | `cinema_closing` |
| Cinema Analytics | `cinema_analytics` |
| ESB Sync | `esb-sync` |
| Push Notif | `esb-notif` |

---

## 🎯 Test Scenarios Checklist

### Scheduler
- [ ] Form baru showtime → conflict detection: 2x same studio same time = 409 reject dengan pesan jelas
- [ ] Auto-suggest slots: pick film+studio+date → pills green/red muncul otomatis
- [ ] Multi-select pills → tombol "🚀 Buat N Jam Tayang Sekaligus" muncul
- [ ] Bulk push 5 outlet (Section ungu "PUSH KE BANYAK OUTLET"):
  - Form atas: Film + Tanggal + Jam (Harga **kosongkan**)
  - Centang outlet → klik "🔍 Preview Harga" → tabel breakdown per outlet
  - Klik "🚀 PUSH KE 5 OUTLET" → result table (OUTLET / STUDIO / TYPE / PRICE / SOURCE)
- [ ] Template recurring: bikin template price=0 → klik "🚀 Generate 14d" → per-date pricing (weekday/weekend rate beda)

### Customer flow
- [ ] Buka kiosk per-outlet: `?cinema&outlet=CMX-JKT01`
- [ ] Filter film: hanya yang punya jadwal aktif tampil
- [ ] Seat picker: anti-double-book per showtime
- [ ] F&B Bundle upsell muncul setelah seat
- [ ] QRIS payment (Midtrans sandbox)
- [ ] Auto-print thermal (kalau `pos_config.CINEMA_PRINTER_HOST_DEFAULT` di-set)
- [ ] Rating film 5-star → Sultan celebration popup muncul
- [ ] Done step: digital ticket QR display
- [ ] Email + WhatsApp share ticket

### Multi-tenant isolation
- [ ] Cinema owner (PIN 200200) sidebar **TIDAK** ada modul F&B
- [ ] F&B Manager (PIN 123456) sidebar **TIDAK** ada modul cinema
- [ ] Super-admin (PIN 999999) lihat semua + tab "🛰️ Karys Platform"
- [ ] Karys Platform → Drill ke Karya Cinema → banner ungu "🎯 IMPERSONATING"
- [ ] Exit Impersonation → balik ke super-admin view

### Signage
- [ ] Buka 5 zone URL Cinema JKT01 → konten beda-beda otomatis
- [ ] Lobby → film posters carousel
- [ ] Box Office → showtimes today grid
- [ ] F&B Counter → bundle menu
- [ ] Studio Entrance → next show countdown
- [ ] Window → YouTube trailer autoplay

---

## 📊 Live Data State (per 2026-05-26)

```
2 Companies (Karya Bites + Karya Cinema)
5 Cinema Outlets (CMX-JKT01/BDG01/SBY01/MDN01/DPS01)
20 Cinema Studios (4 per outlet, mix Regular/IMAX/Deluxe/Premiere)
20 Pricing Entries (per outlet × studio_type × weekday/weekend/holiday)
5 Films (Avatar, Spider-Man, Si Kancil, Sang Penjaga Rimba, AAdC)
29 Showtimes Active
5 F&B Combo Bundles
2 Auto-Promos (5-tiket → 10% / 500k → Rp 5k off)
1 Recurring Template (Avatar Daily 14:00 JKT)
25 Cinema Signage Devices live
30 F&B Signage Devices live
0 F&B/Cinema Data Leakage ✅
```

---

## 🛠️ Cinema Submodules (Cinema Modules dropdown)

| Tab key | Label |
|---|---|
| `cinema_command_center` | Cinema Command Center |
| `cinema_box_office` | Box Office |
| `cinema_validate` | Validasi Tiket |
| `cinema_refund` | Refund Tiket |
| `cinema_distribution` | Film Distribution & Settlement |
| `cinema_in_studio_queue` | In-Studio Order Queue |
| `cinema_event_booking` | Studio Event Booking |
| `cinema_inventory` | Cinema F&B Inventory |
| `cinema_crm` | Cinema CRM |
| `cinema_campaign` | Cinema Campaign |
| `cinema_emergency` | Emergency Ops |
| `cinema_cashier_kpi` | Cashier KPI Rating |
| `cinema_bundle_redeem` | F&B Redemption Counter |

---

## 🔍 Backend Audit Endpoints (Developer)

```bash
# Cinema owner data:
curl https://kiosk.karys.tech/api/cinema/films -H "x-company-id: 2"
curl https://kiosk.karys.tech/api/cinema/studios -H "x-company-id: 2"   # 20
curl https://kiosk.karys.tech/api/outlet-master -H "x-company-id: 2"    # 5
curl https://kiosk.karys.tech/api/signage/devices -H "x-company-id: 2"  # 25
curl https://kiosk.karys.tech/api/promos -H "x-company-id: 2"           # 0 (no F&B leakage)

# Super-admin platform view:
curl https://kiosk.karys.tech/api/companies/platform/summary -H "x-super-admin: true"
```

---

*Karya Cinema · karyaOS Multi-Tenant · Built 2026-05-26*
