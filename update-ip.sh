#!/bin/bash
IP=$(ipconfig getifaddr en0)
if [ -z "$IP" ]; then
  echo "❌ Gak bisa detect IP"
  exit 1
fi
echo "🌐 IP: $IP"
sed -i '' "s|http://[0-9.]*:5184|http://$IP:5184|g" ~/bites-kiosk/.env
sed -i '' "s|http://[0-9.]*:3011|http://$IP:3011|g" ~/bites-kiosk/.env
sed -i '' "s|http://[0-9.]*:5184|http://$IP:5184|g" ~/bites-kiosk/server/.env
sed -i '' "s|http://[0-9.]*:3011|http://$IP:3011|g" ~/bites-kiosk/server/.env
echo "✅ IP updated ke $IP di .env files"
echo "⚠️  Restart server + Vite buat apply"
