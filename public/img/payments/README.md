# Payment Logos

Drop logo file di sini untuk override text wordmark fallback.

## Naming convention

| Slug | Brand | Filename |
|---|---|---|
| midtrans | Midtrans | `midtrans.png` atau `midtrans.svg` |
| xendit | Xendit | `xendit.png` atau `xendit.svg` |
| gopay | GoPay | `gopay.png` atau `gopay.svg` |
| qris | QRIS | `qris.png` atau `qris.svg` |

## Spec logo

- **Format**: `.svg` (recommended — scalable) atau `.png` (transparent background)
- **Aspek**: landscape, idealnya rasio 3:1 atau 4:1
- **Height target**: 36px (rendering size di footer)
- **Background**: transparent (logo akan ditaruh di kontainer putih)
- **Resolusi PNG**: minimal 200×60px (high-DPI ready)

## Fallback chain

```
1. /img/payments/{slug}.png   ← coba dulu
2. /img/payments/{slug}.svg   ← kalau PNG 404
3. Text wordmark pill (brand color)  ← kalau keduanya gagal
```

## Sumber logo official

- Midtrans: https://midtrans.com/press-kit
- Xendit: https://www.xendit.co/en/brand-assets
- GoPay: https://www.gopay.co.id/asset-brand (perlu register/request)
- QRIS: https://www.bi.go.id/QRIS (Bank Indonesia official)

## Catatan

Logo brand bersifat trademark — pastikan compliance dengan brand guideline mereka
sebelum publish. Untuk Karya Cinema sebagai merchant dari payment partner, biasanya
penggunaan logo sebagai "Accepted Payment" sudah covered oleh merchant agreement.
