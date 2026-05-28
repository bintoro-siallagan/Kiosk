@echo off
REM ============================================================
REM  karyaOS POS Print Bridge — Windows Launcher
REM  Double-click untuk start bridge di localhost:9101
REM  Pre-req: Node.js sudah terinstall (https://nodejs.org)
REM ============================================================

cd /d "%~dp0"

REM Cek Node.js installed
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js belum terinstall.
    echo.
    echo Download + install dari: https://nodejs.org/en/download
    echo Pilih versi LTS, Windows Installer ^(.msi^), 64-bit.
    echo Setelah install, double-click file ini lagi.
    echo.
    pause
    exit /b 1
)

REM Tampilkan info
echo.
echo Starting karyaOS Print Bridge...
echo Listening on: http://localhost:9101
echo.
echo JANGAN tutup jendela ini — biarin kebuka selama kasir kerja.
echo Untuk stop: tekan Ctrl+C.
echo.

REM Run print bridge
node print-bridge.js

pause
