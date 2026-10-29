@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Run from repository root
cd /d "%~dp0"

set "SRC=apps\api"
set "DEPLOY_DIR=deploy-portal-api"
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyy-MM-dd-HHmm\")"') do set "STAMP=%%i"
set "ZIP_NAME=portal-api-%STAMP%.zip"

echo [1/3] Preparing deploy folder...
if exist "%DEPLOY_DIR%" (
  echo Existing %DEPLOY_DIR% found. Removing...
  rmdir /s /q "%DEPLOY_DIR%"
)
mkdir "%DEPLOY_DIR%"

echo [2/3] Copying API files (excluding node_modules, caches, logs)...
robocopy "%SRC%" "%DEPLOY_DIR%" /E /XD node_modules .git .vs .next dist coverage /XF "*.log" >nul
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo File copy failed with code %RC%.
  exit /b %RC%
)

if exist "%DEPLOY_DIR%\node_modules" rmdir /s /q "%DEPLOY_DIR%\node_modules"
if not exist "%DEPLOY_DIR%\src\modules\auth\auth.routes.js" (
  echo ERROR: Missing copied file "%DEPLOY_DIR%\src\modules\auth\auth.routes.js".
  exit /b 1
)

if exist "%ZIP_NAME%" del /f /q "%ZIP_NAME%"

echo [3/3] Creating ZIP...
set "STAGE=%TEMP%\up-api-staging-%RANDOM%%RANDOM%"
mkdir "%STAGE%" 2>nul
robocopy "%DEPLOY_DIR%" "%STAGE%" /E /COPY:DAT /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS /NP >nul
set "RC2=%ERRORLEVEL%"
if %RC2% GEQ 8 (
  echo ERROR: staging copy to TEMP failed with code %RC2%.
  rmdir /s /q "%STAGE%" 2>nul
  exit /b 1
)

set "ZIP_FULL=%CD%\%ZIP_NAME%"
where tar >nul 2>&1
if errorlevel 1 (
  echo ERROR: tar.exe not found. Install Windows 10+ or add tar to PATH.
  rmdir /s /q "%STAGE%" 2>nul
  exit /b 1
)

tar.exe -a -c -f "%ZIP_FULL%" -C "%STAGE%" .
set "TARERR=%ERRORLEVEL%"
rmdir /s /q "%STAGE%" 2>nul
if not "%TARERR%"=="0" (
  echo ZIP creation failed with code %TARERR%. Aborting.
  exit /b 1
)

echo.
echo Done.
echo ZIP ready: %ZIP_NAME%
echo Upload to API application root, then run:
echo - source /home/ugurprom/nodevenv/enesinAMKAPI/20/bin/activate
echo - npm install --include=dev --ignore-scripts
echo - PRISMA_GENERATE_SKIP_AUTOINSTALL=1 ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma
echo - Restart
exit /b 0
