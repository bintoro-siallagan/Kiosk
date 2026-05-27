# Outlet City Photos

Letakkan foto outlet per kota di folder ini. Frontend otomatis pakai file lokal
kalau ada — kalau gak ada, fallback ke Unsplash stock photo.

## Naming convention

Nama file = slug kota (lowercase, tanpa spasi). Format: `.jpg` recommended.

| Slug | Kota | Filename |
|---|---|---|
| jakarta | Jakarta | `jakarta.jpg` |
| bandung | Bandung | `bandung.jpg` |
| bali | Bali / Denpasar | `bali.jpg` |
| medan | Medan | `medan.jpg` |
| surabaya | Surabaya | `surabaya.jpg` |
| yogyakarta | Yogyakarta / Jogja | `yogyakarta.jpg` |
| semarang | Semarang | `semarang.jpg` |
| makassar | Makassar | `makassar.jpg` |
| denpasar | Denpasar (alias Bali) | `denpasar.jpg` |

## Spec foto

- **Aspek rasio**: landscape, idealnya 16:9 atau 16:10
- **Resolusi**: minimal 1200×675px (HD), max 2400×1350px
- **Format**: `.jpg` (lebih ringan), `.png` kalau perlu transparency
- **Size**: < 500KB per file (compress dulu via TinyJPG/Squoosh)
- **Konten**: interior bioskop outlet asli, atau exterior landmark dengan branding karyaOS

## Cara kerja fallback

```
1. /img/cities/{slug}.jpg     ← prioritas tertinggi (kalau ada)
2. Unsplash stock cinema      ← fallback otomatis kalau (1) 404
3. Dark gradient + emoji      ← last resort kalau (2) juga gagal
```

Cukup drop file ke folder ini → hard refresh browser → muncul. Gak perlu touch code.
