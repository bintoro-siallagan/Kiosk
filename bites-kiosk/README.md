# 🍽️ Bites & Co. — Self Order Kiosk

Aplikasi self-order kiosk untuk restoran berbasis React + Vite. Mendukung:
- Pilih Makan di Sini / Bawa Pulang
- Menu lengkap 6 kategori (Burgers, Pizza, Salads, Sides, Drinks, Desserts)
- Add-ons & pilihan tambahan per menu
- Catatan khusus per item
- Keranjang belanja dengan PPN 11%
- Harga dalam Rupiah (IDR)

## 🚀 Cara Deploy ke GitHub Pages

### 1. Clone / Download repo ini
```bash
git clone https://github.com/USERNAME/bites-kiosk.git
cd bites-kiosk
```

### 2. Install dependencies
```bash
npm install
```

### 3. Jalankan lokal
```bash
npm run dev
```

### 4. Sesuaikan nama repo di `vite.config.js`
Ubah `base` sesuai nama repo GitHub Anda:
```js
base: '/nama-repo-anda/',
```

### 5. Push ke GitHub
```bash
git init
git add .
git commit -m "🍽️ Initial commit - Bites & Co. Kiosk"
git branch -M main
git remote add origin https://github.com/USERNAME/bites-kiosk.git
git push -u origin main
```

### 6. Aktifkan GitHub Pages
Buka repo di GitHub → **Settings** → **Pages** → Source: **GitHub Actions**

Setelah push, GitHub Actions akan otomatis build & deploy. Akses di:
```
https://USERNAME.github.io/bites-kiosk/
```

## 🛠️ Tech Stack
- React 18
- Vite 5
- Google Fonts (Bebas Neue + DM Sans)
- GitHub Actions (CI/CD)
- GitHub Pages (hosting)
