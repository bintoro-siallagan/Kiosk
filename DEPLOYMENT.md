# 🚀 BINTORO KIOSK — Panduan Deploy ke Production

---

## 📊 Rekomendasi Server & Spesifikasi

### Opsi 1 — VPS (Recommended untuk Production) ✅

| Provider | Paket | Spesifikasi | Harga/bulan | Cocok untuk |
|----------|-------|-------------|-------------|-------------|
| **DigitalOcean** | Droplet Basic | 2 vCPU, 2GB RAM, 50GB SSD | ~$18 | 1-5 kiosk |
| **Vultr** | Cloud Compute | 2 vCPU, 4GB RAM, 80GB SSD | ~$24 | 5-20 kiosk |
| **Hostinger VPS** | KVM 2 | 2 vCPU, 8GB RAM, 100GB SSD | ~Rp 120rb | Budget friendly |
| **IDCloudHost** | VPS L | 4 vCPU, 8GB RAM, 100GB SSD | ~Rp 200rb | Indonesia |
| **Niagahoster VPS** | Medium | 2 vCPU, 4GB RAM, 60GB SSD | ~Rp 160rb | Indonesia |

**Spesifikasi Minimum:**
```
CPU:  2 vCPU
RAM:  2 GB
SSD:  40 GB
OS:   Ubuntu 22.04 LTS
```

**Spesifikasi Recommended:**
```
CPU:  4 vCPU
RAM:  4 GB
SSD:  80 GB
OS:   Ubuntu 22.04 LTS
Bandwidth: Unlimited / 2TB
```

---

### Opsi 2 — PaaS (Paling Mudah, Cocok untuk Mulai) 🟡

| Platform | Free Tier | Berbayar | Catatan |
|----------|-----------|----------|---------|
| **Railway** | 5$/bulan kredit | $5-20/bulan | Deploy via GitHub, mudah |
| **Render** | Ada (lambat) | $7/bulan | Backend + static frontend |
| **Fly.io** | Ada | $3-10/bulan | Global edge, cepat |
| **Vercel** | Free | - | Frontend saja |

---

### Opsi 3 — Dedicated Server (Skala Enterprise) 🔴

```
CPU:  Intel Xeon / AMD EPYC
RAM:  16-32 GB
SSD:  500 GB NVMe
OS:   Ubuntu Server 22.04
Lokasi: Jakarta (latency rendah)
Provider: IDC, DCI, Biznet
Harga: Rp 1-5 juta/bulan
```

---

## 🗺️ Arsitektur Production

```
Internet / WhatsApp
       ↓
  [Cloudflare CDN]  ← SSL, DDoS protection, caching
       ↓
  [Nginx] :80/:443  ← Reverse proxy
    ├── /           → Frontend (React build)
    ├── /api        → Backend Node.js :3001
    └── /track      → Frontend (same)
       ↓
  [Node.js Backend] ← PM2 process manager
       ↓
  [PostgreSQL]      ← Database (replace in-memory)
```

---

## 📋 Langkah Deploy Step-by-Step

### LANGKAH 1 — Setup VPS Baru

```bash
# Login ke VPS via SSH
ssh root@IP_SERVER_ANDA

# Update sistem
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verifikasi
node --version  # harus v20.x
npm --version

# Install tools
apt install -y git nginx certbot python3-certbot-nginx pm2 -g
npm install -g pm2
```

---

### LANGKAH 2 — Clone & Setup Project

```bash
# Buat user khusus (jangan pakai root untuk production)
adduser bintoro
usermod -aG sudo bintoro
su - bintoro

# Clone project (atau upload via SFTP/SCP)
mkdir -p /home/bintoro/app
cd /home/bintoro/app

# Upload project dari local dengan SCP:
# (Jalankan ini dari komputer lokal Anda)
# scp -r bites-kiosk/ bintoro@IP_SERVER:/home/bintoro/app/

cd bites-kiosk
```

---

### LANGKAH 3 — Setup Environment Variables

```bash
# Buat file .env untuk backend
cat > server/.env << 'EOF'
PORT=3001
NODE_ENV=production

# Midtrans (ganti ke key production!)
MIDTRANS_SERVER_KEY=Mid-server-XXXXXXXXXX
MIDTRANS_CLIENT_KEY=Mid-client-XXXXXXXXXX
MIDTRANS_PRODUCTION=true

# ESB
ESB_BASE_URL=https://api.esb.co.id/eso-qs/v1
ESB_API_KEY=your_esb_api_key
ESB_OUTLET_ID=your_outlet_id
ESB_ENABLED=true

# Tracking URL (domain Anda)
WA_TRACKING_BASE=https://kiosk.bintoro.id
EOF

# Buat file .env untuk frontend (Vite)
cat > .env << 'EOF'
VITE_API_URL=https://kiosk.bintoro.id
VITE_ESB_BASE_URL=https://api.esb.co.id/eso-qs/v1
VITE_ESB_API_KEY=your_esb_api_key
VITE_ESB_OUTLET_ID=your_outlet_id
EOF
```

---

### LANGKAH 4 — Install & Build

```bash
# Install frontend dependencies
cd /home/bintoro/app/bites-kiosk
npm install --legacy-peer-deps

# Build frontend untuk production
npm run build
# → Menghasilkan folder /dist

# Install backend dependencies
cd server
npm install --production
cd ..
```

---

### LANGKAH 5 — Setup PM2 (Process Manager)

```bash
# Buat PM2 ecosystem config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name:         'bintoro-backend',
      script:       'server/index.js',
      cwd:          '/home/bintoro/app/bites-kiosk',
      env: {
        NODE_ENV:   'production',
        PORT:       3001,
      },
      instances:    1,
      autorestart:  true,
      watch:        false,
      max_memory_restart: '500M',
      log_file:     '/home/bintoro/logs/backend.log',
      error_file:   '/home/bintoro/logs/error.log',
      time:         true,
    }
  ]
};
EOF

# Buat folder logs
mkdir -p /home/bintoro/logs

# Jalankan backend dengan PM2
pm2 start ecosystem.config.js

# Cek status
pm2 status

# Auto-start saat server reboot
pm2 save
pm2 startup
# Jalankan perintah yang muncul dari pm2 startup
```

---

### LANGKAH 6 — Setup Nginx

```bash
# Buat konfigurasi Nginx
sudo nano /etc/nginx/sites-available/bintoro

# Isi dengan konfigurasi berikut:
```

```nginx
server {
    listen 80;
    server_name kiosk.bintoro.id www.kiosk.bintoro.id;

    # Frontend (React build)
    root /home/bintoro/app/bites-kiosk/dist;
    index index.html;

    # SPA routing — semua path ke index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /ws {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host $host;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # Security headers
    add_header X-Frame-Options      "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy      "strict-origin-when-cross-origin";
}
```

```bash
# Aktifkan site
sudo ln -s /etc/nginx/sites-available/bintoro /etc/nginx/sites-enabled/
sudo nginx -t          # Cek konfigurasi
sudo systemctl reload nginx
```

---

### LANGKAH 7 — SSL Certificate (HTTPS)

```bash
# Install SSL gratis dari Let's Encrypt
# Pastikan domain sudah pointing ke IP server

sudo certbot --nginx -d kiosk.bintoro.id -d www.kiosk.bintoro.id

# Ikuti instruksi (masukkan email, setuju terms)
# Certbot otomatis update konfigurasi Nginx

# Test auto-renewal
sudo certbot renew --dry-run

# Cek SSL berjalan
curl https://kiosk.bintoro.id/api/health
```

---

### LANGKAH 8 — Setup Domain DNS

Di panel domain Anda (Niaga, GoDaddy, Cloudflare, dll):

```
Type    Name              Value               TTL
A       kiosk             IP_SERVER_ANDA      Auto
A       www.kiosk         IP_SERVER_ANDA      Auto
CNAME   www               kiosk.bintoro.id    Auto
```

**Gunakan Cloudflare (gratis)** untuk:
- SSL otomatis
- DDoS protection
- CDN caching
- Analytics

---

### LANGKAH 9 — Firewall

```bash
# Setup UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh        # Port 22
sudo ufw allow 'Nginx Full' # Port 80 & 443
sudo ufw enable

# Jangan expose port 3001 langsung ke internet
# Backend hanya diakses via Nginx proxy
```

---

### LANGKAH 10 — Setup Midtrans Webhook Production

Di dashboard Midtrans Production:
```
Settings → Configuration → Payment Notification URL:
https://kiosk.bintoro.id/api/payment/webhook
```

---

## 🔄 Deploy Update (Setelah Perubahan Code)

```bash
# Di komputer lokal — upload file baru
scp -r src/ bintoro@IP_SERVER:/home/bintoro/app/bites-kiosk/

# Di server
cd /home/bintoro/app/bites-kiosk

# Rebuild frontend
npm run build

# Restart backend jika ada perubahan server
pm2 restart bintoro-backend

# Nginx tidak perlu direstart kecuali ada perubahan config
```

---

## 🗄️ Upgrade ke Database PostgreSQL (Production)

Untuk data customer & order yang persist:

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Buat database
sudo -u postgres psql << 'SQL'
CREATE DATABASE bintoro_db;
CREATE USER bintoro_user WITH PASSWORD 'password_kuat_disini';
GRANT ALL PRIVILEGES ON DATABASE bintoro_db TO bintoro_user;
SQL

# Install pg di backend
cd /home/bintoro/app/bites-kiosk/server
npm install pg

# Tambah ke .env
echo "DATABASE_URL=postgresql://bintoro_user:password@localhost:5432/bintoro_db" >> .env
```

---

## 📊 Monitoring & Maintenance

```bash
# Cek status semua service
pm2 status
sudo systemctl status nginx
sudo systemctl status postgresql

# Lihat logs real-time
pm2 logs bintoro-backend
pm2 logs bintoro-backend --lines 100

# Monitor CPU & Memory
pm2 monit

# Cek disk usage
df -h

# Restart service jika bermasalah
pm2 restart bintoro-backend
sudo systemctl restart nginx
```

---

## 🔒 Security Checklist Production

```bash
# 1. Disable root SSH login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
# Set: PasswordAuthentication no  (pakai SSH key)
sudo systemctl restart sshd

# 2. Setup SSH key authentication
# Di komputer lokal:
ssh-keygen -t ed25519 -C "bintoro-server"
ssh-copy-id bintoro@IP_SERVER

# 3. Auto security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# 4. Rate limiting di Nginx (tambahkan ke nginx.conf)
# limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
# location /api { limit_req zone=api burst=10; ... }

# 5. Backup otomatis database
crontab -e
# Tambahkan:
# 0 2 * * * pg_dump bintoro_db > /home/bintoro/backups/$(date +%Y%m%d).sql
```

---

## 💰 Estimasi Biaya Bulanan

### Setup Minimal (1 outlet, <100 transaksi/hari)
```
VPS Hostinger KVM 1      : Rp  80.000
Domain (.id)             : Rp  15.000
SSL (Let's Encrypt)      : GRATIS
Cloudflare CDN           : GRATIS
Midtrans (0.7% MDR)      : ~Rp 50.000 (estimasi)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL                    : ~Rp 145.000/bulan
```

### Setup Standard (1-5 outlet, <500 transaksi/hari)
```
VPS Hostinger KVM 2      : Rp 120.000
Domain                   : Rp  15.000
Cloudflare Pro (opsional): Rp 350.000
Midtrans MDR             : ~Rp 200.000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL                    : ~Rp 685.000/bulan
```

### Setup Enterprise (5+ outlet)
```
Dedicated Server         : Rp 2.000.000
Domain + SSL             : Rp   100.000
Cloudflare Business      : Rp   750.000
DB Managed (RDS)         : Rp   500.000
Monitoring (Grafana)     : GRATIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL                    : ~Rp 3.350.000/bulan
```

---

## ⚡ Quick Deploy dengan Script Otomatis

Simpan sebagai `deploy.sh` di server:

```bash
#!/bin/bash
set -e

echo "🚀 BINTORO KIOSK — Auto Deploy"
APP_DIR="/home/bintoro/app/bites-kiosk"

cd $APP_DIR

echo "📦 Installing dependencies..."
npm install --legacy-peer-deps --silent

echo "🏗️  Building frontend..."
npm run build

echo "🔄 Restarting backend..."
pm2 restart bintoro-backend

echo "✅ Deploy selesai!"
echo "🌐 Live di: https://kiosk.bintoro.id"

pm2 status
```

```bash
# Beri izin eksekusi
chmod +x deploy.sh

# Jalankan setiap deploy
./deploy.sh
```

---

## 🆘 Troubleshooting Umum

| Masalah | Solusi |
|---------|--------|
| Backend tidak jalan | `pm2 restart bintoro-backend && pm2 logs` |
| Nginx 502 Bad Gateway | Backend mati, cek `pm2 status` |
| SSL expired | `sudo certbot renew` |
| Frontend tidak update | Clear browser cache + `npm run build` ulang |
| WA tidak terkirim | Cek `WA_TRACKING_BASE` di `.env` |
| QRIS tidak muncul | Cek Midtrans key + `NODE_ENV=production` |
| Port 3001 tidak bisa diakses | Normal — harus lewat Nginx `/api` |

---

## 📞 Support

- **Midtrans**: support@midtrans.com | 021-2910-3881
- **ESB**: care@esb.co.id | 150358
- **DigitalOcean**: digitalocean.com/support
- **Hostinger**: live chat 24/7

---

*Dokumen ini dibuat untuk BINTORO Self Order Kiosk v1.0*
*Last updated: 2025*
