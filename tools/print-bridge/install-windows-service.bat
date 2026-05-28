@echo off
REM ============================================================
REM  karyaOS Print Bridge — Windows Service Installer (One-Click)
REM
REM  Right-click → Run as administrator. Itu aja.
REM  - Auto-elevate kalau bukan admin
REM  - Auto-download NSSM kalau belum ada
REM  - Auto-detect Node.js path
REM  - Install + start service KaryaOSPrintBridge (auto-start saat boot)
REM  - Verify localhost:9101 reachable
REM ============================================================

setlocal EnableDelayedExpansion

REM ── Self-elevate kalau bukan admin ──
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo [INFO] Butuh admin rights. Relaunching as administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo.
echo ============================================================
echo   karyaOS Print Bridge — Windows Service Installer
echo ============================================================
echo.

REM ── 1. Cek Node.js installed ──
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_PATH=%%i
if "%NODE_PATH%"=="" (
    echo [ERROR] Node.js belum terinstall.
    echo.
    echo Install dulu dari: https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
    echo Setelah install, restart komputer, lalu jalankan file ini lagi sebagai admin.
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js detected: %NODE_PATH%

REM ── 2. Auto-download NSSM kalau belum ada ──
if not exist "%~dp0nssm.exe" (
    echo.
    echo [INFO] NSSM not found. Downloading from nssm.cc...
    powershell -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip' -UseBasicParsing; Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force; Copy-Item -Path '%TEMP%\nssm\nssm-2.24\win64\nssm.exe' -Destination '%~dp0nssm.exe'; Remove-Item -Path '%TEMP%\nssm.zip','%TEMP%\nssm' -Recurse -Force -ErrorAction SilentlyContinue } catch { Write-Host '[ERROR] Download failed:' $_.Exception.Message; exit 1 }"
    if not exist "%~dp0nssm.exe" (
        echo [ERROR] Gagal download NSSM.
        echo.
        echo Manual fallback:
        echo   1. Download https://nssm.cc/release/nssm-2.24.zip
        echo   2. Extract win64\nssm.exe ke folder ini
        echo   3. Run file ini lagi
        pause
        exit /b 1
    )
    echo [OK] NSSM downloaded.
) else (
    echo [OK] NSSM already present.
)

REM ── 3. Cek script ada ──
if not exist "%~dp0print-bridge.js" (
    echo [ERROR] print-bridge.js tidak ditemukan di folder ini.
    echo Pastikan extract zip lengkap.
    pause
    exit /b 1
)
echo [OK] Script found: %~dp0print-bridge.js

set SVC_NAME=KaryaOSPrintBridge

REM ── 4. Remove existing service kalau ada ──
echo.
echo [INFO] Cleaning up existing service (kalau ada)...
"%~dp0nssm.exe" stop %SVC_NAME% >nul 2>&1
"%~dp0nssm.exe" remove %SVC_NAME% confirm >nul 2>&1
timeout /t 2 /nobreak >nul

REM ── 5. Install service ──
echo [INFO] Installing service "%SVC_NAME%"...
"%~dp0nssm.exe" install %SVC_NAME% "%NODE_PATH%" "%~dp0print-bridge.js"
if errorlevel 1 (
    echo [ERROR] Gagal install service. Mungkin nama service sudah dipakai atau permissions issue.
    pause
    exit /b 1
)

"%~dp0nssm.exe" set %SVC_NAME% AppDirectory "%~dp0"
"%~dp0nssm.exe" set %SVC_NAME% DisplayName "karyaOS POS Print Bridge"
"%~dp0nssm.exe" set %SVC_NAME% Description "Print bridge untuk forward POS order ke printer thermal LAN. Listen di localhost:9101."
"%~dp0nssm.exe" set %SVC_NAME% Start SERVICE_AUTO_START
"%~dp0nssm.exe" set %SVC_NAME% AppStdout "%~dp0print-bridge.log"
"%~dp0nssm.exe" set %SVC_NAME% AppStderr "%~dp0print-bridge.log"
"%~dp0nssm.exe" set %SVC_NAME% AppRotateFiles 1
"%~dp0nssm.exe" set %SVC_NAME% AppRotateOnline 1
"%~dp0nssm.exe" set %SVC_NAME% AppRotateBytes 1048576
"%~dp0nssm.exe" set %SVC_NAME% AppExit Default Restart
"%~dp0nssm.exe" set %SVC_NAME% AppRestartDelay 5000

REM ── 6. Start service ──
echo [INFO] Starting service...
"%~dp0nssm.exe" start %SVC_NAME%
timeout /t 3 /nobreak >nul

REM ── 7. Verify health ──
echo.
echo [INFO] Verifying bridge running at http://localhost:9101 ...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:9101/' -TimeoutSec 5; if ($r.ok) { Write-Host '[OK] Bridge responding: version' $r.version } else { Write-Host '[WARN] Bridge respond but unexpected:' $r } } catch { Write-Host '[ERROR] Bridge tidak respond di localhost:9101. Cek log:' '%~dp0print-bridge.log' }"

echo.
echo ============================================================
echo   INSTALLATION DONE
echo ============================================================
echo.
echo   Service Name : %SVC_NAME%
echo   Status       : Auto-start saat Windows boot
echo   Log file     : %~dp0print-bridge.log
echo   Bridge URL   : http://localhost:9101
echo.
echo   Management commands (run di CMD admin):
echo     Stop      : nssm stop %SVC_NAME%
echo     Start     : nssm start %SVC_NAME%
echo     Status    : nssm status %SVC_NAME%
echo     Uninstall : nssm remove %SVC_NAME% confirm
echo.
echo   Atau pakai Services.msc dari Windows Search.
echo.
pause
