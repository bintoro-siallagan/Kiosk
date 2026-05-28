@echo off
REM ============================================================
REM  karyaOS Print Bridge — Uninstall Windows Service
REM  Right-click → Run as administrator.
REM ============================================================

setlocal EnableDelayedExpansion

REM Self-elevate kalau bukan admin
net session >nul 2>&1
if errorlevel 1 (
    echo [INFO] Butuh admin. Relaunching as administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

set SVC_NAME=KaryaOSPrintBridge

if not exist "%~dp0nssm.exe" (
    echo [ERROR] nssm.exe tidak ditemukan. Service mungkin belum diinstall via script ini.
    echo Manual uninstall via Services.msc atau sc.exe delete %SVC_NAME%
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   karyaOS Print Bridge — Uninstall Service
echo ============================================================
echo.

REM Stop + remove service
echo [INFO] Stopping service %SVC_NAME%...
"%~dp0nssm.exe" stop %SVC_NAME% 2>nul
timeout /t 2 /nobreak >nul

echo [INFO] Removing service %SVC_NAME%...
"%~dp0nssm.exe" remove %SVC_NAME% confirm

echo.
echo [OK] Service %SVC_NAME% uninstalled.
echo.
echo Note: file print-bridge.js, nssm.exe, dan print-bridge.log masih ada di folder ini.
echo       Hapus folder manual kalau mau bersihkan total.
echo.
pause
