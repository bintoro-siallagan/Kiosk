# 🚀 karyaOS — Panduan Deploy ke VPS

Panduan deploy **karyaOS** (kiosk F&B + admin + cinema) ke satu VPS.
Diperbarui 2026-05 untuk kondisi kode terkini.

---

## 📦 Arsitektur & Stack

```
Internet
   ↓
[Nginx]  :80 / :443        ← reverse proxy + SSL
   ├── /bites-kiosk/   → Frontend (React build statis, folder dist/)
   ├── /api            → Backend Node.js  :3011
   └── /ws, /api/.../ws → WebSocket → backend :3011
   ↓
[Node.js + PM2]            ← server/index.js
   ↓
[SQLite]  server/data.db   ← database file-based (persist di disk VPS)
```

- **Frontend** — React + Vite. `npm run build` → folder `dist/` (statis).
- **Backend** — Node.js + Express, `server/index.js`, port `3011`.
- **Database** — **SQLite** (`server/data.db`), file di disk. **Bukan in-memory**,
  **tidak perlu** migrasi ke PostgreSQL — di VPS file ini persist apa adanya.
  Cukup di-backup berkala (lihat bagian Maintenance).

> Catatan: `vite.config.js` memakai `base: '/bites-kiosk/'`, jadi aplikasi
> disajikan di **`https://domain-anda/bites-kiosk/`**. Mau di root domain?
> ubah `base` jadi `'/'` lalu sesuaikan blok `location` Nginx di bawah.

---

## 🖥️ Spesifikasi VPS

| | Minimum | Disarankan |
|---|---|---|
| CPU | 2 vCPU | 2–4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 30 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

Provider: DigitalOcean / Vultr / Hostinger / IDCloudHost (~Rp 80–200rb/bln).

> VPS **2 GB RAM / 30 GB disk** cukup untuk 1 outlet / trafik modest.
> Wajib pasang **swap** (langkah 1) dan rotasi backup/log agar disk lega.
> Untuk banyak outlet & trafik tinggi, naikkan RAM ke 4 GB.

---

## 1 — Setup server

```bash
ssh root@IP_VPS
apt update && apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx certbot python3-certbot-nginx build-essential
npm install -g pm2

node --version   # harus v20.x

# user non-root
adduser karyaos && usermod -aG sudo karyaos
su - karyaos
```

> `build-essential` wajib — `better-sqlite3` adalah native module yang
> di-compile saat `npm install`.

**Swap — wajib untuk VPS RAM 2 GB.** Tanpa swap, `npm install` +
`npm run build` (compile native module + bundling Vite) bisa gagal OOM:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h        # pastikan baris Swap terisi
```

---

## 2 — Ambil kode

```bash
mkdir -p ~/app && cd ~/app
git clone https://github.com/bintoro-siallagan/Kiosk.git bites-kiosk
cd bites-kiosk
```

---

## 3 — Environment variables

```bash
# Backend — server/.env
cat > server/.env << 'EOF'
PORT=3011
NODE_ENV=production

# Midtrans (ganti ke key PRODUCTION untuk transaksi nyata)
MIDTRANS_SERVER_KEY=Mid-server-XXXXXXXX
MIDTRANS_CLIENT_KEY=Mid-client-XXXXXXXX
MIDTRANS_PRODUCTION=true

# WhatsApp tracking base (domain Anda)
WA_TRACKING_BASE=https://domain-anda.com/bites-kiosk
EOF

# Frontend — .env (dipakai SAAT BUILD)
cat > .env << 'EOF'
VITE_API_URL=https://domain-anda.com
EOF
```

> **Penting:** `VITE_API_URL` ditanam ke bundle saat `npm run build`.
> Harus di-set ke URL publik backend (biasanya domain yang sama).
> Kalau salah/kosong, frontend akan menembak `localhost` dan gagal.

---

## 4 — Install & build

```bash
cd ~/app/bites-kiosk
npm install --legacy-peer-deps      # frontend deps
npm run build                       # → folder dist/

cd server && npm install --omit=dev && cd ..   # backend deps
```

---

## 5 — Jalankan backend (PM2)

`ecosystem.config.js` sudah ada di repo.

```bash
cd ~/app/bites-kiosk
pm2 start ecosystem.config.js
pm2 status
pm2 save
pm2 startup        # jalankan perintah yang muncul
```

Cek: `curl http://localhost:3011/api/cinema/summary` → harus JSON.

---

## 6 — Nginx

```bash
sudo nano /etc/nginx/sites-available/karyaos
```

```nginx
server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    # Frontend (React build) — disajikan di /bites-kiosk/
    location /bites-kiosk/ {
        alias /home/karyaos/app/bites-kiosk/dist/;
        try_files $uri $uri/ /bites-kiosk/index.html;
    }
    location = / { return 302 /bites-kiosk/; }

    # Backend API
    location /api {
        proxy_pass         http://localhost:3011;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/karyaos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Akses: `http://domain-anda.com/bites-kiosk/`

---

## 7 — SSL (HTTPS)

Pastikan DNS domain sudah mengarah ke IP VPS, lalu:

```bash
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com
sudo certbot renew --dry-run
```

---

## 8 — Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
# Port 3011 jangan diekspos — hanya diakses via Nginx /api.
```

---

## 🔗 Route penting (setelah live)

| URL | Layar |
|---|---|
| `…/bites-kiosk/` | Kiosk self-order |
| `…/bites-kiosk/?flow` | QR Order (order dari HP customer) |
| `…/bites-kiosk/?cinema` | Cinema — beli tiket |
| `…/bites-kiosk/?admin` | Login admin |
| `…/bites-kiosk/?pos=1` | POS kasir |
| `…/bites-kiosk/?kds=1` | KDS dapur · `?cds=1` layar pelanggan |

QR meja (FlowQRGen di admin) meng-encode `…/bites-kiosk/?flow&table=<kode>`.

---

## 🔄 Deploy update (setelah ada perubahan)

```bash
cd ~/app/bites-kiosk
git pull
npm install --legacy-peer-deps && npm run build
cd server && npm install --omit=dev && cd ..
pm2 restart karyaos-backend
```

---

## 📊 Maintenance

```bash
pm2 status / pm2 logs karyaos-backend / pm2 monit

# Backup SQLite — jadwalkan via crontab -e
0 2 * * * cp /home/karyaos/app/bites-kiosk/server/data.db \
  /home/karyaos/backups/data-$(date +\%Y\%m\%d).db
```

---

## 🆘 Troubleshooting

| Masalah | Solusi |
|---|---|
| Nginx 502 | Backend mati — `pm2 status`, `pm2 restart karyaos-backend` |
| Aset 404 / layar putih | `VITE_API_URL` salah saat build, atau `base` Nginx tak cocok — rebuild |
| `better-sqlite3` gagal install | `build-essential` belum terpasang |
| QRIS/pembayaran error | Cek Midtrans key di `server/.env` + `MIDTRANS_PRODUCTION` |
| Port 3011 tak bisa diakses | Normal — harus lewat Nginx `/api` |

---

*karyaOS — F&B Kiosk · POS · KDS · Cinema · Admin*
