#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  BINTORO KIOSK — Auto Server Setup Script
#  Target: Ubuntu 22.04 LTS
#  Jalankan: sudo bash setup-server.sh
# ═══════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo -e "${CYAN}"
echo "  ██████╗ ██╗███╗   ██╗████████╗ ██████╗ ██████╗  ██████╗"
echo "  ██╔══██╗██║████╗  ██║╚══██╔══╝██╔═══██╗██╔══██╗██╔═══██╗"
echo "  ██████╔╝██║██╔██╗ ██║   ██║   ██║   ██║██████╔╝██║   ██║"
echo "  ██╔══██╗██║██║╚██╗██║   ██║   ██║   ██║██╔══██╗██║   ██║"
echo "  ██████╔╝██║██║ ╚████║   ██║   ╚██████╔╝██║  ██║╚██████╔╝"
echo "  ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝"
echo -e "${NC}"
echo -e "${YELLOW}  Self Order Kiosk — Server Setup Script${NC}"
echo "  ────────────────────────────────────────"
echo ""

# Check root
[ "$EUID" -eq 0 ] || err "Jalankan dengan sudo: sudo bash setup-server.sh"

# Prompt for config
read -p "  Domain (misal: kiosk.bintoro.id): " DOMAIN
read -p "  Email untuk SSL cert: " SSL_EMAIL
read -p "  Midtrans Server Key: " MT_SERVER_KEY
read -p "  Midtrans Client Key: " MT_CLIENT_KEY
read -p "  Mode Production Midtrans? (y/n): " MT_PROD
read -p "  ESB API Key (kosongkan jika belum): " ESB_KEY
read -p "  ESB Outlet ID (kosongkan jika belum): " ESB_OUTLET

MT_PRODUCTION="false"
[[ "$MT_PROD" == "y" || "$MT_PROD" == "Y" ]] && MT_PRODUCTION="true"

APP_USER="bintoro"
APP_DIR="/home/${APP_USER}/app/bites-kiosk"

echo ""
echo "  ┌─────────────────────────────────────┐"
echo "  │  Domain   : $DOMAIN"
echo "  │  App Dir  : $APP_DIR"
echo "  │  User     : $APP_USER"
echo "  └─────────────────────────────────────┘"
echo ""
read -p "  Lanjutkan? (y/n): " CONFIRM
[[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || exit 0

echo ""

# ── STEP 1: System Update ────────────────────────────────────────
info "Step 1/10: Update sistem..."
apt update -qq && apt upgrade -y -qq
log "Sistem updated"

# ── STEP 2: Install Dependencies ─────────────────────────────────
info "Step 2/10: Install Node.js 20, Nginx, PM2..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt install -y nodejs nginx certbot python3-certbot-nginx git ufw > /dev/null 2>&1
npm install -g pm2 > /dev/null 2>&1
log "Node.js $(node -v), Nginx, PM2 installed"

# ── STEP 3: Create App User ───────────────────────────────────────
info "Step 3/10: Setup user & direktori..."
if ! id "$APP_USER" &>/dev/null; then
    adduser --disabled-password --gecos "" $APP_USER
    usermod -aG sudo $APP_USER
fi
mkdir -p /home/$APP_USER/app /home/$APP_USER/logs /home/$APP_USER/backups
chown -R $APP_USER:$APP_USER /home/$APP_USER
log "User $APP_USER ready"

# ── STEP 4: Write Environment Files ──────────────────────────────
info "Step 4/10: Setup environment variables..."

# Backend .env
mkdir -p $APP_DIR/server
cat > $APP_DIR/server/.env << EOF
PORT=3001
NODE_ENV=production
MIDTRANS_SERVER_KEY=${MT_SERVER_KEY}
MIDTRANS_CLIENT_KEY=${MT_CLIENT_KEY}
MIDTRANS_PRODUCTION=${MT_PRODUCTION}
ESB_BASE_URL=https://api.esb.co.id/eso-qs/v1
ESB_API_KEY=${ESB_KEY}
ESB_OUTLET_ID=${ESB_OUTLET}
ESB_ENABLED=${ESB_KEY:+true}
WA_TRACKING_BASE=https://${DOMAIN}
EOF

# Frontend .env
cat > $APP_DIR/.env << EOF
VITE_API_URL=https://${DOMAIN}
VITE_ESB_BASE_URL=https://api.esb.co.id/eso-qs/v1
VITE_ESB_API_KEY=${ESB_KEY}
VITE_ESB_OUTLET_ID=${ESB_OUTLET}
EOF

chown -R $APP_USER:$APP_USER $APP_DIR
log "Environment files created"

# ── STEP 5: PM2 Ecosystem ────────────────────────────────────────
info "Step 5/10: Setup PM2 config..."
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name:        'bintoro-backend',
    script:      'server/index.js',
    cwd:         '${APP_DIR}',
    env: {
      NODE_ENV:  'production',
      PORT:      3001,
    },
    instances:         1,
    autorestart:       true,
    watch:             false,
    max_memory_restart: '400M',
    log_date_format:   'YYYY-MM-DD HH:mm:ss',
    out_file:          '/home/${APP_USER}/logs/backend.log',
    error_file:        '/home/${APP_USER}/logs/error.log',
  }]
};
EOF
chown $APP_USER:$APP_USER $APP_DIR/ecosystem.config.js
log "PM2 ecosystem config created"

# ── STEP 6: Deploy Script ─────────────────────────────────────────
info "Step 6/10: Buat deploy script..."
cat > $APP_DIR/deploy.sh << 'EOF'
#!/bin/bash
set -e
APP_DIR="/home/bintoro/app/bites-kiosk"
cd $APP_DIR
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps --silent
cd server && npm install --production --silent && cd ..
echo "🏗️  Building frontend..."
npm run build
echo "🔄 Restarting backend..."
pm2 restart bintoro-backend 2>/dev/null || pm2 start ecosystem.config.js
echo "✅ Deploy selesai!"
pm2 status
EOF
chmod +x $APP_DIR/deploy.sh
chown $APP_USER:$APP_USER $APP_DIR/deploy.sh
log "Deploy script ready"

# ── STEP 7: Nginx Config ──────────────────────────────────────────
info "Step 7/10: Konfigurasi Nginx..."
cat > /etc/nginx/sites-available/bintoro << EOF
# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=60r/m;

server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${APP_DIR}/dist;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Frontend SPA
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # Static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Backend API
    location /api {
        limit_req zone=api burst=20 nodelay;
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # WebSocket
    location ~* ^/(ws|socket) {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 86400s;
    }
}
EOF

# Enable site
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/bintoro /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
log "Nginx configured & running"

# ── STEP 8: Firewall ──────────────────────────────────────────────
info "Step 8/10: Setup firewall UFW..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh > /dev/null
ufw allow 'Nginx Full' > /dev/null
ufw --force enable > /dev/null
log "Firewall active (SSH + HTTP/HTTPS only)"

# ── STEP 9: SSL Certificate ───────────────────────────────────────
info "Step 9/10: Setup SSL (Let's Encrypt)..."
warn "Pastikan domain ${DOMAIN} sudah pointing ke IP server ini!"
read -p "  Domain sudah pointing? (y/n): " DNS_READY
if [[ "$DNS_READY" == "y" || "$DNS_READY" == "Y" ]]; then
    certbot --nginx -d $DOMAIN --email $SSL_EMAIL --agree-tos --non-interactive --redirect
    # Auto renewal
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -
    log "SSL certificate installed & auto-renewal set"
else
    warn "Skip SSL — jalankan manual: sudo certbot --nginx -d $DOMAIN"
fi

# ── STEP 10: Backup Cron ──────────────────────────────────────────
info "Step 10/10: Setup backup otomatis..."
(crontab -l 2>/dev/null; echo "0 2 * * * find /home/${APP_USER}/logs -name '*.log' -size +50M -delete") | crontab -
log "Cron jobs set"

# ── Final Status ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ SERVER SETUP SELESAI!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "  📋 Next Steps:"
echo ""
echo "  1. Upload project ke server:"
echo "     scp -r bites-kiosk/ ${APP_USER}@$(hostname -I | awk '{print $1}'):${APP_DIR}/../"
echo ""
echo "  2. Login sebagai user bintoro dan deploy:"
echo "     su - ${APP_USER}"
echo "     cd ${APP_DIR}"
echo "     bash deploy.sh"
echo ""
echo "  3. Set Midtrans webhook di dashboard:"
echo "     https://${DOMAIN}/api/payment/webhook"
echo ""
echo "  4. Akses aplikasi:"
echo "     🌐 Kiosk  : https://${DOMAIN}"
echo "     🖥️  Admin  : https://${DOMAIN}/?admin"
echo "     📊 Report  : https://${DOMAIN}/?report"
echo "     🔍 Tracking: https://${DOMAIN}/?track&order=A01"
echo ""
echo -e "${YELLOW}  ⚠️  PENTING: Hapus .env dari git commit!${NC}"
echo "     echo '.env' >> .gitignore"
echo ""
