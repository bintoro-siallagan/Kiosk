@echo off
REM ============================================================
REM  KaryaOS — POS Kiosk Launcher (Windows)
REM  Double-click ini untuk launch POS dalam true fullscreen mode.
REM  Tidak ada URL bar, tab, menu — pure POS interface.
REM  Press Alt+F4 atau Ctrl+W untuk exit.
REM ============================================================

REM URL ke POS production
set URL=https://app.karyaos.tech/?pos

REM Cari Chrome di lokasi standar (64-bit dulu, fallback ke 32-bit, fallback ke Edge)
set CHROME=""
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if %CHROME%=="" (
    REM Fallback ke Edge kalau Chrome tidak ada
    if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set CHROME="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set CHROME="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

if %CHROME%=="" (
    echo [ERROR] Chrome atau Edge tidak ditemukan. Install Chrome dulu dari https://www.google.com/chrome/
    pause
    exit /b 1
)

REM User-data dir terpisah supaya gak konflik dengan Chrome reguler kasir
set USERDIR=%LocalAppData%\KaryaOS-POS-Kiosk

REM Launch flags:
REM   --kiosk              : true fullscreen, no chrome UI
REM   --no-first-run       : skip welcome screen
REM   --disable-features=TranslateUI : disable Translate popup yg ganggu
REM   --noerrdialogs       : suppress error dialogs yg blok screen
REM   --disable-pinch      : disable pinch zoom (touchscreen)
REM   --overscroll-history-navigation=0 : disable swipe-to-go-back
REM   --start-maximized    : kalau --kiosk fail, fallback maximize
REM   --user-data-dir      : profile terpisah untuk POS
%CHROME% --kiosk --no-first-run --disable-features=TranslateUI --noerrdialogs --disable-pinch --overscroll-history-navigation=0 --start-maximized --user-data-dir="%USERDIR%" "%URL%"
