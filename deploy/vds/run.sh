#!/bin/bash
# Test container'ı: imaj yalnızca node + bağımlılıklar; web çıktısı ve API kodu sunucudaki klasörlerden okunur.
set -euo pipefail
cd /opt/up-satinalim
mkdir -p uploads
docker rm -f up-satinalim >/dev/null 2>&1 || true
docker run -d --name up-satinalim --restart unless-stopped \
  --env-file /opt/up-satinalim/app.env \
  -e PORT=3000 -e API_PORT=4000 -e API_INTERNAL_ORIGIN=http://127.0.0.1:4000 \
  -v /opt/up-satinalim/web-next:/app/apps/web/.next \
  -v /opt/up-satinalim/apps/api/src:/app/apps/api/src:ro \
  -v /opt/up-satinalim/uploads:/app/apps/api/uploads \
  -p 127.0.0.1:8098:3000 \
  up-satinalim:latest >/dev/null
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8098/login || true)
  [ "$code" = "200" ] && { echo "hazir (${i} sn)"; exit 0; }
  sleep 1
done
echo 'HATA: 60 sn icinde ayaga kalkmadi'; docker logs --tail 30 up-satinalim; exit 1
