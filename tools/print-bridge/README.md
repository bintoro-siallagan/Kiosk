# karyaOS POS Print Bridge

Local agent yang jalan di PC kasir, jembatan antara POS browser dan printer thermal LAN.

## Kenapa perlu bridge ini?

Backend karyaOS jalan di VPS internet (`api.karyaos.tech`). Printer thermal outlet ada di LAN private (mis. `192.168.100.7`). Backend gak bisa reach printer LAN. Browser yang buka POS bisa reach localhost + LAN. Bridge berperan sebagai perantara: terima print job dari POS browser, forward ke printer via raw TCP.

## Install (Windows) — Pilih salah satu mode

### 🚀 PRODUCTION MODE (Recommended) — Auto-start saat boot
**Best untuk PC kasir yang dipakai harian — gak perlu manual open CMD tiap pagi.**

1. **Install Node.js** dari https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi (LTS Windows 64-bit)
2. **Download + extract zip ini** ke folder permanent, misal `C:\karyaos\print-bridge\`
3. **Right-click `install-windows-service.bat` → Run as administrator**
   - Auto-elevate kalau lupa right-click
   - Auto-download NSSM dari nssm.cc (gak perlu manual download)
   - Auto-detect Node.js path
   - Install + start service `KaryaOSPrintBridge`
   - Verify localhost:9101 reachable
4. **Done** — service running di background, auto-restart kalau crash, auto-start saat Windows boot
5. Verify: buka http://localhost:9101 di browser — harus tampil JSON `{"ok":true,...}`

**Uninstall** kapan saja: right-click `uninstall-windows-service.bat` → Run as administrator.

### 🛠️ TESTING MODE — Manual launch (gampang debug)
Untuk testing atau debug. **Kalau bridge gagal di production mode, coba ini dulu untuk lihat error log live.**

1. Install Node.js (sama seperti di atas)
2. Extract zip
3. **Double-click `start-bridge.bat`** — jendela CMD kebuka, tampil log live
4. **Jangan tutup jendela** selama kasir kerja
5. Verify: http://localhost:9101

Stop kapan saja: tekan Ctrl+C di jendela CMD atau tutup window.

## Test setelah install

```bash
# Health check
curl http://localhost:9101/

# Scan printer di LAN (cari semua device port 9100)
curl http://localhost:9101/scan

# Test print ke printer specific
curl -X POST http://localhost:9101/print/test \
     -H "Content-Type: application/json" \
     -d "{\"ip\":\"192.168.100.7\",\"port\":9100}"
```

Atau pakai PowerShell:

```powershell
Invoke-RestMethod -Uri "http://localhost:9101/print/test" -Method POST -Body '{"ip":"192.168.100.7","port":9100}' -ContentType "application/json"
```

Kalau berhasil, printer akan beep + cetak test page + auto-cut.

## Endpoints

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET    | `/` | — | Health + info bridge |
| POST   | `/print` | `{ip, port, data: [bytes]}` | Cetak ESC/POS bytes ke printer |
| POST   | `/print/test` | `{ip, port}` | Test page + beep + cut |
| GET    | `/scan` | `?port=9100` | Scan LAN cari printer aktif |

## Troubleshooting

**Port 9101 already in use** — Bridge sudah jalan (mode service + mode manual collision). Stop salah satu. Service: `nssm stop KaryaOSPrintBridge`. Manual: tutup CMD window.

**`ERR_CONNECTION_REFUSED` di browser POS** — Bridge gak listening. Cek:
- Production mode: `nssm status KaryaOSPrintBridge` → kalau "SERVICE_STOPPED", restart pakai `nssm start KaryaOSPrintBridge`
- Testing mode: jendela CMD ketutup → relaunch `start-bridge.bat`

**Print timeout setelah 5000ms** — Printer offline atau IP salah. Run `/scan` untuk lihat printer apa yg detect di LAN. Atau ganti IP di admin panel karyaOS.

**Multi-device kiosk (tablet → printer)** — Tablet customer gak bisa reach `localhost` PC kasir. Set bridgeUrl di tablet ke LAN IP cashier PC:
- Di browser tablet: F12 → Console → `localStorage.setItem("printBridgeUrl", "http://192.168.100.50:9101"); location.reload();`
- Ganti `192.168.100.50` dengan IP LAN PC kasir (cek pakai `ipconfig`)
- Atau set via admin panel: https://admin.karyaos.tech → Receipt section → "PRINT BRIDGE URL"

**Service mode butuh log debug** — `nssm` log auto-rotate di folder bridge: `print-bridge.log`. Cek isi untuk error.

## File summary

| File | Purpose |
|------|---------|
| `print-bridge.js` | Node.js script utama — bridge HTTP ↔ TCP |
| `start-bridge.bat` | Manual launch (testing mode) |
| `install-windows-service.bat` | Install as Windows service (production) |
| `uninstall-windows-service.bat` | Uninstall service |
| `README.md` | This file |
| `nssm.exe` | Auto-downloaded oleh installer (skip kalau pakai testing mode) |
| `print-bridge.log` | Auto-generated saat service running |
