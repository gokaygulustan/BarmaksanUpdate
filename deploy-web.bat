@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Always run from this script's directory (repo root)
cd /d "%~dp0"

set "SRC=apps\web"
set "DEPLOY_DIR=deploy-portal-web"

if not exist "%SRC%\package.json" (
  echo ERROR: "%SRC%" not found or missing package.json.
  echo Run this .bat from the monorepo root ^(same folder as package.json workspaces^).
  pause
  exit /b 1
)

REM Timestamp without nested quotes ^(avoids cmd parsing issues^)
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd-HHmm'"`) do set "STAMP=%%i"
if not defined STAMP (
  echo ERROR: Could not get timestamp from PowerShell.
  pause
  exit /b 1
)
set "ZIP_NAME=portal-web-!STAMP!.zip"

echo [1/3] Preparing deploy folder...
if exist "%DEPLOY_DIR%" (
  echo Removing old %DEPLOY_DIR%...
  rmdir /s /q "%DEPLOY_DIR%" 2>nul
)
mkdir "%DEPLOY_DIR%" 2>nul
if not exist "%DEPLOY_DIR%\" (
  echo ERROR: Could not create "%DEPLOY_DIR%".
  pause
  exit /b 1
)

echo [2/3] Copying source files ^(excluding node_modules, .next, ...^)...
robocopy "%SRC%" "%DEPLOY_DIR%" /E /NFL /NDL /NJH /NJS /NC /NS /NP ^
  /XD node_modules .git .vs .next out dist coverage
set "RC=!ERRORLEVEL!"
if !RC! GEQ 8 (
  echo ERROR: robocopy failed with code !RC!.
  pause
  exit /b !RC!
)

if exist "%DEPLOY_DIR%\node_modules" rmdir /s /q "%DEPLOY_DIR%\node_modules"
if exist "%DEPLOY_DIR%\.next" rmdir /s /q "%DEPLOY_DIR%\.next"

if exist "%ZIP_NAME%" del /f /q "%ZIP_NAME%"

echo [3/3] Creating ZIP...
REM OneDrive / IDE locks files under the repo; Compress-Archive then fails.
REM Stage to %%TEMP%% (local disk), then zip with built-in tar.exe.
set "STAGE=%TEMP%\up-web-staging-%RANDOM%%RANDOM%"
mkdir "%STAGE%" 2>nul
robocopy "%DEPLOY_DIR%" "%STAGE%" /E /COPY:DAT /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS /NP
set "RC2=!ERRORLEVEL!"
if !RC2! GEQ 8 (
  echo ERROR: staging copy to TEMP failed ^(code !RC2!^).
  rmdir /s /q "%STAGE%" 2>nul
  pause
  exit /b 1
)

set "ZIP_FULL=%CD%\!ZIP_NAME!"
where tar >nul 2>&1
if errorlevel 1 (
  echo ERROR: tar.exe not found. Install Windows 10+ or add tar to PATH.
  rmdir /s /q "%STAGE%" 2>nul
  pause
  exit /b 1
)

tar.exe -a -c -f "!ZIP_FULL!" -C "%STAGE%" .
set "TARERR=!ERRORLEVEL!"
rmdir /s /q "%STAGE%" 2>nul
if not "!TARERR!"=="0" (
  echo ERROR: tar zip failed with code !TARERR!.
  pause
  exit /b 1
)

if not exist "!ZIP_NAME!" (
  echo ERROR: ZIP was not created: !ZIP_NAME!
  pause
  exit /b 1
)

echo.
echo Done.
echo ZIP: %CD%\%ZIP_NAME%
echo.
echo On server: extract into app root, then:
echo   Stop Node app in cPanel first
echo   source /home/ugurprom/nodevenv/enesinAMK/20/bin/activate
echo   npm install --include=dev --ignore-scripts --legacy-peer-deps
echo   node scripts/disable-tailwind-node-module-register.cjs
echo   npm run build
echo   Restart Node app
echo.
exit /b 0
