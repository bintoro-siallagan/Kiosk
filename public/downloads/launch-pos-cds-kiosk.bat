@echo off
REM ============================================================
REM  KaryaOS — Customer Display (CDS) Kiosk Launcher (Windows)
REM  Untuk SECOND DISPLAY yang hadap customer — auto-launch ke
REM  display kedua dalam true fullscreen.
REM
REM  Cara pakai:
REM   1. Sambungkan second monitor (HDMI/VGA)
REM   2. Extend display di Windows Settings → System → Display
REM   3. Double-click file ini → Chrome akan launch ke layar utama
REM   4. Drag window ke second display → tekan F11 (atau biarkan kiosk mode)
REM ============================================================

set URL=https://app.karyaos.tech/?cds=1

set CHROME=""
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if %CHROME%=="" (
    if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set CHROME="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set CHROME="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

if %CHROME%=="" (
    echo [ERROR] Chrome / Edge tidak ditemukan.
    pause
    exit /b 1
)

REM User-data terpisah dari POS supaya bisa jalan bareng (POS di display 1, CDS di display 2)
set USERDIR=%LocalAppData%\KaryaOS-CDS-Kiosk

REM --window-position=X,Y bisa di-tune untuk auto-place di second display.
REM Asumsi second display di sebelah kanan layar utama dengan offset 1920 (full HD).
REM Adjust kalau pakai resolusi lain.
%CHROME% --kiosk --no-first-run --disable-features=TranslateUI --noerrdialogs --disable-pinch --overscroll-history-navigation=0 --window-position=1920,0 --user-data-dir="%USERDIR%" "%URL%"
