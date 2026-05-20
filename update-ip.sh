#!/bin/bash
# Update LAN IP in .env files after switching networks.
# Replaces the IP in any http://<ipv4>:<port> URL, keeping the port intact
# (handles :5184, :3001, :3011, etc.). localhost URLs are left untouched.

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then
  echo "❌ Gak bisa detect IP (cek en0/en1)"
  exit 1
fi
echo "🌐 IP: $IP"

DIR="$(cd "$(dirname "$0")" && pwd)"
for f in "$DIR/.env" "$DIR/server/.env"; do
  if [ -f "$f" ]; then
    sed -i '' -E "s#http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:#http://$IP:#g" "$f"
    echo "  ✓ $f"
  fi
done

echo "✅ IP updated ke $IP di .env files"
echo "⚠️  Restart server + Vite buat apply"
