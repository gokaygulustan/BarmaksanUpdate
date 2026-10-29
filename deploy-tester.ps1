# Tester (test paneli) hızlı elle deploy: web bu bilgisayarda derlenir (.next-deploy, dev sunucusunun
# .next'ine dokunmaz), sunucuya yalnızca derlenmiş çıktı ve API kodu gider, container yeniden başlar.
# Normalde buna gerek yok: GitHub'a push edince sunucu kendi çeker (bkz. deploy/README.md). Bu script
# acil / GitHub'sız durumlar içindir. Bağımlılık (package.json) ya da Prisma şeması değiştiyse yetmez.
#
# Sunucu adresi depoda tutulmaz: deploy-tester.local.txt (git'e girmez) ilk satırına  kullanici@sunucu  yazın.
$root = $PSScriptRoot
$localCfg = Join-Path $root 'deploy-tester.local.txt'
$server = if ($env:TESTER_SERVER) { $env:TESTER_SERVER } elseif (Test-Path $localCfg) { (Get-Content $localCfg -TotalCount 1).Trim() } else { '' }
if (-not $server) { Write-Host 'Sunucu tanımlı değil: deploy-tester.local.txt dosyasına kullanici@sunucu yazın.' -ForegroundColor Red; exit 1 }
$sw = [Diagnostics.Stopwatch]::StartNew()

Push-Location "$root\apps\web"
$env:NEXT_DIST_DIR = '.next-deploy'
$env:NEXT_BUILD_CPUS = $env:NUMBER_OF_PROCESSORS
$env:NEXT_TELEMETRY_DISABLED = '1'
& node ..\..\node_modules\next\dist\bin\next build --webpack
$buildExit = $LASTEXITCODE
Remove-Item Env:NEXT_DIST_DIR, Env:NEXT_BUILD_CPUS -ErrorAction SilentlyContinue
Pop-Location
if ($buildExit -ne 0) { Write-Host 'next build basarisiz, deploy yapilmadi.' -ForegroundColor Red; exit 1 }
$buildSec = [int]$sw.Elapsed.TotalSeconds

tar --exclude=cache -czf "$env:TEMP\web-next.tar.gz" -C "$root\apps\web\.next-deploy" .
tar -czf "$env:TEMP\api-src.tar.gz" -C "$root\apps\api\src" .
scp -q "$env:TEMP\web-next.tar.gz" "$env:TEMP\api-src.tar.gz" "${server}:/opt/up-satinalim/"
if ($LASTEXITCODE -ne 0) { Write-Host 'Yukleme basarisiz.' -ForegroundColor Red; exit 1 }

ssh $server 'bash /opt/up-satinalim/deploy-web.sh'
if ($LASTEXITCODE -ne 0) { Write-Host 'Sunucuda yeniden baslatma basarisiz.' -ForegroundColor Red; exit 1 }

Write-Host "Deploy tamam: toplam $([int]$sw.Elapsed.TotalSeconds) sn (build $buildSec sn)" -ForegroundColor Green
