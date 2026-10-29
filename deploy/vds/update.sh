#!/bin/bash
# Test sunucusu (VDS) güncelleyici. systemd zamanlayıcısı her dakika çalıştırır.
# GitHub'daki "tester-latest" sürümünün manifest.json'una bakar; yeni commit varsa çeker:
#   - hızlı yol: web chunk'ları + API kodu değişir, container yeniden başlar (~15 sn)
#   - yavaş yol: bağımlılık/Dockerfile/Prisma şeması değiştiyse imaj yeniden kurulur (~7 dk)
# Hata olursa önceki sürüm çalışmaya devam eder (web-next.prev'den geri dönülür).
set -uo pipefail

REPO="${UPDATE_REPO:-gokaygulustan/BarmaksanUpdate}"
TAG="${UPDATE_TAG:-tester-latest}"
DIR="${APP_DIR:-/opt/up-satinalim}"
BASE="https://github.com/${REPO}/releases/download/${TAG}"
LOG="$DIR/update.log"

exec 9>/tmp/up-satinalim-update.lock
flock -n 9 || exit 0   # önceki güncelleme sürüyorsa çık

log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" "$2"; }

cd "$DIR" || exit 1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Sürüm yoksa / ağ yoksa sessizce çık (bir sonraki dakikada tekrar bakılır).
curl -fsSL --max-time 20 "$BASE/manifest.json" -o "$tmp/manifest.json" || exit 0

sha=$(field sha "$tmp/manifest.json")
img=$(field image "$tmp/manifest.json")
[ -n "$sha" ] || exit 0
[ "$sha" = "$(cat .deployed-sha 2>/dev/null || true)" ] && exit 0

log "yeni sürüm ${sha:0:7} (imaj ${img})"
for f in web-next.tar.gz api-src.tar.gz; do
  curl -fsSL --max-time 180 "$BASE/$f" -o "$tmp/$f" || { log "HATA: $f indirilemedi"; exit 1; }
done

if [ "$img" != "$(cat .image-hash 2>/dev/null || true)" ]; then
  log "imaj değişti: kaynak çekiliyor, docker build başlıyor"
  curl -fsSL --max-time 180 "$BASE/source.tar.gz" -o "$tmp/source.tar.gz" || { log "HATA: source.tar.gz indirilemedi"; exit 1; }
  tar -xzf "$tmp/source.tar.gz" -C "$DIR" 2>/dev/null
  # Yardımcı script'ler de depodaki hâline güncellenir (çalışan dosya yerinde değil, yeniden adlandırarak).
  [ -f deploy/vds/run.sh ] && cp deploy/vds/run.sh run.sh.new && mv run.sh.new run.sh
  [ -f deploy/vds/update.sh ] && cp deploy/vds/update.sh update.sh.new && mv update.sh.new update.sh
  if ! docker build -t up-satinalim:latest . >"$tmp/build.log" 2>&1; then
    log "HATA: docker build başarısız (önceki sürüm çalışıyor):"; tail -n 15 "$tmp/build.log" | tee -a "$LOG"; exit 1
  fi
  echo "$img" > .image-hash
fi

# Web chunk'ları: önceki sürüm web-next.prev'de kalır.
rm -rf web-next.new && mkdir web-next.new
tar -xzf "$tmp/web-next.tar.gz" -C web-next.new 2>/dev/null
rm -rf web-next.prev
[ -d web-next ] && mv web-next web-next.prev
mv web-next.new web-next

# API kodu
rm -rf apps/api/src.new && mkdir -p apps/api/src.new
tar -xzf "$tmp/api-src.tar.gz" -C apps/api/src.new 2>/dev/null
rm -rf apps/api/src && mv apps/api/src.new apps/api/src

# Container'ı (yeni imajla / yeni dosyalarla) yeniden kur.
if ! bash "$DIR/run.sh" >"$tmp/run.log" 2>&1; then
  log "HATA: container ayağa kalkmadı, önceki web çıktısına dönülüyor:"; tail -n 10 "$tmp/run.log" | tee -a "$LOG"
  if [ -d web-next.prev ]; then rm -rf web-next && mv web-next.prev web-next && bash "$DIR/run.sh" >/dev/null 2>&1; fi
  exit 1
fi

echo "$sha" > .deployed-sha
log "tamam: ${sha:0:7} yayında"
