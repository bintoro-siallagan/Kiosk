#!/bin/bash
# BINTORO Kiosk — Daily Startup Script
# Usage: bash ~/start-bintoro.sh
# Versi: 1.1 — 15 May 2026
# Changelog v1.1: auto-update .env kalau Mac LAN IP berubah (pindah wifi)

set -u

echo "🚀 BINTORO Kiosk — booting up..."
echo ""

# ─── Step 0: Detect Mac LAN IP ─────────────────────────────────
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -z "$LAN_IP" ] && LAN_IP=$(ipconfig getifaddr en1 2>/dev/null)

if [ -z "$LAN_IP" ]; then
  echo "❌ Gak bisa detect LAN IP. Cek wifi konek dulu."
  echo "   Coba: ifconfig | grep 'inet '"
  exit 1
fi

echo "📡 Mac LAN IP: $LAN_IP"

# ─── Step 0.5: Auto-update .env kalau IP beda ──────────────────
ENV_FRONTEND=~/bites-kiosk/.env
ENV_BACKEND=~/bites-kiosk/server/.env

# Extract current IP dari .env (yg ada di TRACKING_BASE_URL)
ENV_IP=$(grep -oE 'TRACKING_BASE_URL=http://([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)' "$ENV_FRONTEND" 2>/dev/null \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ -z "$ENV_IP" ]; then
  echo "⚠  .env gak punya VITE_TRACKING_BASE_URL — skip auto-update."
elif [ "$LAN_IP" != "$ENV_IP" ]; then
  echo "🔄 IP berubah: $ENV_IP → $LAN_IP. Updating .env files..."
  sed -i.bak "s|$ENV_IP|$LAN_IP|g" "$ENV_FRONTEND" "$ENV_BACKEND"
  echo "   ✓ ~/bites-kiosk/.env updated"
  echo "   ✓ ~/bites-kiosk/server/.env updated"
  echo "   (backup di .env.bak — bisa restore kalau perlu)"
else
  echo "✓ .env IP cocok dengan Mac IP ($LAN_IP). No update needed."
fi

echo ""

# ─── Step 1: Kill zombie processes ─────────────────────────────
echo "🧹 Clearing zombie processes..."
lsof -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null
sleep 2

# ─── Step 2: Start backend ─────────────────────────────────────
echo "🔧 Starting backend (:3001)..."
cd ~/bites-kiosk/server || { echo "❌ ~/bites-kiosk/server gak ada"; exit 1; }
nohup node -r dotenv/config index.js > /tmp/bintoro.log 2>&1 &
disown
sleep 3

# ─── Step 3: Start Vite ────────────────────────────────────────
echo "⚡ Starting Vite dev (:5174)..."
cd ~/bites-kiosk || { echo "❌ ~/bites-kiosk gak ada"; exit 1; }
nohup npm run dev > /tmp/vite.log 2>&1 &
disown
sleep 5

# ─── Step 4: Verify ────────────────────────────────────────────
echo ""
echo "🔍 Verification:"

BACKEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/orders)
VITE_LOCAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/bites-kiosk/)
VITE_LAN_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$LAN_IP:5174/bites-kiosk/")

[ "$BACKEND_CODE" = "200" ]    && echo "  ✅ Backend :3001     → $BACKEND_CODE"    || echo "  ❌ Backend :3001     → $BACKEND_CODE (cek /tmp/bintoro.log)"
[ "$VITE_LOCAL_CODE" = "200" ] && echo "  ✅ Vite local        → $VITE_LOCAL_CODE" || echo "  ❌ Vite local        → $VITE_LOCAL_CODE (cek /tmp/vite.log)"
[ "$VITE_LAN_CODE" = "200" ]   && echo "  ✅ Vite LAN          → $VITE_LAN_CODE"   || echo "  ❌ Vite LAN          → $VITE_LAN_CODE (firewall? host:true config?)"

echo ""
echo "📜 Vite log URLs:"
grep -E "Local|Network" /tmp/vite.log | head -3 | sed 's/^/  /'

# ─── Step 5: Final URLs ────────────────────────────────────────
echo ""
echo "🎯 URLs:"
echo "  📍 Kiosk      : http://localhost:5174/bites-kiosk/"
echo "  📍 Admin      : http://localhost:5174/bites-kiosk/?admin=1"
echo "  📍 Track (HP) : http://$LAN_IP:5174/bites-kiosk/?trackorder=<orderId>"
echo ""

if [ "$BACKEND_CODE" = "200" ] && [ "$VITE_LOCAL_CODE" = "200" ] && [ "$VITE_LAN_CODE" = "200" ]; then
  echo "✨ All systems go. Selamat berjualan! ☕"
  echo ""
  echo "💡 TIP: kalau pindah wifi nanti, cukup re-run script ini."
  echo "       IP baru bakal auto-detect & .env auto-update."
  exit 0
else
  echo "⚠  Ada masalah. Cek log files:"
  echo "   tail -50 /tmp/bintoro.log"
  echo "   tail -50 /tmp/vite.log"
  exit 1
fi
