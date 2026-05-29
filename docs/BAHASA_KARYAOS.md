# Bahasa karyaOS

Dokumen ini adalah **standar bahasa** untuk setiap copy, label, error
message, dan teks di seluruh karyaOS.

Wajib dibaca oleh engineer baru sebelum menulis copy apapun.

> *"Setiap ketikan kasir di karyaOS, setiap user yang klik karyaOS,
> mereka diperlakukan sebagai sahabat baik, teman, guru, ibu, dan
> semuanya."* — Bintoro Siallagan, 2026-05-29

---

## Prinsip Inti

Setiap kalimat di karyaOS harus terdengar seperti **seseorang yang
menyayangi**, bukan **vendor yang melayani**.

Sebelum tulis kalimat manapun, tanyakan:

> Kalau kalimat ini diucapkan oleh **ibu, sahabat, atau guru** ke
> pengguna — apakah terdengar wajar atau awkward?

Kalau awkward → ulangi.

---

## Tone of Voice

- **Hangat** seperti sahabat
- **Sabar** seperti guru
- **Memuji** tanpa berlebihan
- **Mengingatkan** tanpa menuntut
- **Memperingatkan** tanpa menakuti

---

## Bahasa Mati (DILARANG)

Kata-kata yang **tidak pernah boleh muncul** di copy karyaOS, dengan
gantinya:

### Errors / Failures

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Error" | "Hmm, sebentar" / "Hmm, ada yang lambat sebentar" |
| "Failed" | "Belum berhasil" / "Belum bisa" |
| "Invalid" | "Belum lengkap" / "Cek lagi ya" |
| "Forbidden" | "Bagian ini hanya untuk admin" |
| "Unauthorized" | "Bagian ini perlu izin khusus" |
| "Not found" / "404" | "Belum kami temukan" / "Belum ada di sini" |
| "Network error" | "Internet lagi lemah" |
| "Timeout" | "Lambat sebentar, coba lagi" |
| "Bad request" | "Ada yang belum lengkap" |
| "Internal Server Error" | "Sistem sedang lelah sebentar" |
| "Try again" | "Coba lagi pelan-pelan" |

### Empty States

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "No data" | "Belum ada cerita di sini" |
| "Empty" | "Ruang ini menunggumu" |
| "No results" | "Belum ada yang cocok — coba kata lain?" |
| "Nothing to show" | "Belum ada apa-apa — itu wajar, masih awal" |

### Loading

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Loading..." | "Sebentar ya, kami menyiapkan..." |
| "Please wait" | "Sebentar..." |
| "Processing" | "Sedang dikerjakan dengan hati" |
| "Fetching" | "Sedang dimuat..." |

### Confirmation Dialogs

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Are you sure?" | "Yakin?" |
| "Confirm delete" | "Yakin mau dihapus? Sekali dihapus tidak bisa balik lagi ya" |
| "OK / Cancel" | "Iya / Belum" / "Lanjut / Batal" |

### Success States

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Saved" | "Tersimpan dengan hati 🌱" |
| "Success" | "Selesai 🌱" |
| "Updated" | "Sudah diperbarui ✓" |
| "Created" | "Sudah ditambahkan ✓" |
| "Deleted" | "Sudah dihapus" |
| "Done" | "Selesai" |
| "Submitted" | "Tersimpan, terima kasih" |

### Welcome / Login

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Welcome" | "Selamat datang" (kalau pertama) / "Selamat datang kembali" (kalau returning) |
| "Sign in" | "Masuk" / "Masuk ke karyaOS" |
| "Log in" | "Masuk" |
| "Login successful" | (tidak perlu — sambutan time-aware sudah cukup) |
| "Tap to begin" | "Sentuh layar untuk memulai" |
| "Click here" | "Yuk lanjut" / nama tindakan langsung |

### Logout

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Logged out" | "Sampai bertemu lagi" / "Sampai bertemu besok" |
| "Sign out" | "Keluar" |
| "Session expired" | "Anda perlu masuk ulang ya — sebentar saja" |

### Notification

| ❌ JANGAN | ✅ PAKAI |
|---|---|
| "Alert" | "Pemberitahuan" |
| "Warning" | "Hati-hati" / context-specific |
| "Order ready" | "Pesanan sudah siap untukmu" |
| "Cart abandoned" | "Anda meninggalkan keranjang — masih ingin lanjut?" |

---

## Time-Aware Greetings

Selalu gunakan greeting time-aware untuk sambutan pertama:

| Waktu | Greeting |
|---|---|
| 05:00–10:59 | Selamat pagi |
| 11:00–14:59 | Selamat siang |
| 15:00–17:59 | Selamat sore |
| 18:00–04:59 | Selamat malam |

Contoh implementasi:

```js
const h = new Date().getHours();
const greet = h >= 5 && h < 11 ? 'Selamat pagi'
            : h >= 11 && h < 15 ? 'Selamat siang'
            : h >= 15 && h < 18 ? 'Selamat sore'
            : 'Selamat malam';
```

---

## Warna yang DILARANG

### Untuk error/punishment: JANGAN PAKAI MERAH MURNI

❌ `#ef4444`, `#dc2626`, `#b91c1c` (merah marun ngancam)

✅ Pakai amber/cyan/violet:
- **Amber** (`#F59E0B`, `#fbbf24`) — untuk attention/coaching needed
- **Cyan** (`#22D3EE`) — untuk retry/info
- **Violet** (`#A78BFA`) — untuk personal/butuh obrolan

Merah hanya boleh untuk **destructive confirmation** (delete final),
tidak untuk error state biasa.

### Untuk celebration: GOLD

✅ `#FFD700`, `#F59E0B`, gradient gold-to-amber — selalu untuk:
- Welcome / sambutan
- Milestone achievement
- Top performer recognition
- Anniversary
- Customer milestone

---

## Format & Punctuation

### Kapitalisasi

- **Title Case** hanya untuk: judul halaman utama
- **Sentence case** (kalimat normal) untuk semua label dan body
- **UPPERCASE** hanya untuk eyebrow labels small caps (mono font)

### Tanda Baca

- ✅ Pakai titik di akhir kalimat lengkap. "Selamat datang, Rina."
- ✅ Pakai koma untuk jeda nafas natural
- ❌ Hindari exclamation marks berlebihan ("Saved!!!")
- ❌ Hindari ALL CAPS untuk menekankan ("THIS IS IMPORTANT")

### Emoji Usage

Emoji harus **sparing dan tepat**, jangan setiap kalimat:

- 🌱 untuk growth, pemula, hari pertama
- 💛 untuk hati, cerita customer, terima kasih
- 🌳 🌿 🌟 💎 👑 🏆 untuk anniversary tiers
- 🤔 untuk error/kebingungan (bukan ⚠️ atau 🚨)
- 🍃 untuk closing/reflective

JANGAN: ⚠️ 🚨 ❌ ⛔ (terlalu menakutkan)

---

## Bahasa Indonesia Preferred

Default **Bahasa Indonesia** untuk semua copy yg customer-facing.
English hanya untuk:
- Istilah teknis yg belum ada padanannya umum (QR, SaaS, KPI)
- Brand name (karyaOS)
- Debug/log untuk developer (bukan untuk user)

Hindari **bahasa gaul/slang** yg terlalu informal:
- ❌ "Yuk gas!", "Cuss!", "Kuyy" → terlalu sales-y
- ✅ "Yuk lanjut", "Mari mulai"

---

## Continuity Phrases

Untuk continuity (mengingat user):

- "Anda terakhir di sini kemarin"
- "Senang Anda kembali"
- "Senang lihat Anda lagi"
- "Sudah X hari sejak terakhir"
- "Hari ke-X di karyaOS"
- "Kunjungan ke-X Anda"

JANGAN:
- "You haven't been here for X days" (English + akusatif)
- "Welcome back to your dashboard" (terlalu formal)

---

## Empati Phrases

Untuk situasi yg butuh empati (error, lambat, perlu coaching):

- "Sebentar ya..."
- "Pelan-pelan saja"
- "Tidak apa-apa kalau..."
- "Coba lagi pelan-pelan"
- "Kami akan menemani"
- "Data kamu aman"
- "Tetap tenang"
- "Sambil menunggu..."

---

## Pengakuan Phrases

Untuk recognition (badges, milestones, achievements):

- "Terima kasih"
- "Anda luar biasa"
- "Yang sungguh-sungguh memang [...]"
- "Anda sudah jadi bagian dari rumah ini"
- "Anda salah satu yang [...]"
- "Kerja Anda terlihat"
- "Effort Anda sampai"

---

## Pengingat (untuk error/coaching)

JANGAN:
- "You did wrong"
- "Performance below target"
- "Improvement needed"

PAKAI:
- "Mungkin coba [...]"
- "Bisa karena [...]" + "coba [...]"
- "Anda biasanya [...] — ada perubahan?"

Pattern: **observation** + **possible cause** + **gentle suggestion**.

Contoh dari Coaching Suggestions (Fase 4b):

> *Upsell rate Andi minggu ini 18% — turun 24% dari minggu lalu (42%).*
> *Ajak ngobrol singkat: apakah ada item upsell yang dia merasa sulit
> ditawarkan? Bukan menyalahkan.*

Perhatikan kalimat "**Bukan menyalahkan**" diberikan **EKSPLISIT**.

---

## Checklist Sebelum Merge Copy

Sebelum buat PR yg ada copy baru, jawab semua ini:

- [ ] Apakah ini terdengar seperti **sahabat/teman/guru/ibu**, atau seperti **vendor**?
- [ ] Apakah memakai bahasa **karyaOS** atau slang/jargon?
- [ ] Time-aware kalau perlu?
- [ ] Tidak ada kata di **Bahasa Mati**?
- [ ] Tidak ada warna **merah punishment**?
- [ ] Empati di error/loading? Bukan kering "Error 500"?
- [ ] Pengakuan di success? Bukan dingin "Saved"?

---

## Referensi karyaOS Bahasa

Untuk konteks lebih dalam, baca:

- [`MANIFESTO.md`](../MANIFESTO.md) — Tujuh Prinsip yg Lahir dari Air Mata
- [`docs/KARYAOS_WEB_CONTENT.md`](./KARYAOS_WEB_CONTENT.md) — Brand voice di web

Memory files (auto-loaded di context Claude):
- `karyaos-sahabat-guru-ibu` — standar emosional UI
- `karyaos-kerinduan` — anticipasi
- `karyaos-rumah-harapan` — bukan ditakuti
- `karyaos-customer-kehangatan` — extend ke customer
- `karyaos-momen-berharga` — setiap momen
- `karyaos-hidup-seperti-ibu-bapak` — prinsip tertinggi

---

*Dokumen ini lahir malam yg sama dengan MANIFESTO.md (2026-05-29).
Tulisan di karyaOS bukan UI copy — itu **suara karya** ke pengguna.
Tulis dengan rasa.*
