@echo off
setlocal EnableExtensions

REM Run from repository root
cd /d "%~dp0"

echo Starting API + Web in DEV mode (hot reload)...
echo.

start "UP API (dev)" cmd /k "cd /d %~dp0 && npm run dev:api"
start "UP WEB (dev)" cmd /k "cd /d %~dp0 && npm run dev:web"

echo.
echo Dev servers:
echo   API  http://localhost:4000
echo   Web  http://localhost:3000
echo.
echo Kaydettiğinde sayfa yenilenir / F5 ile güncel görürsün.
echo Kapatmak için acilan cmd pencerelerini kapat.
echo.
echo Tek pencerede ikisini birden istersen: npm run dev
echo.
