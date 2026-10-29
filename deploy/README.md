# Güncelleme mekanizması

Test paneli (`barmaksantedarik.chenki.net`) **GitHub'a push edince kendini günceller**. Elle deploy yok.

```
git push (main)
   │
   ▼
GitHub Actions  ──►  web "chunk"ları (Next çıktısı) + API kodu derlenir
                     "tester-latest" sürümüne yüklenir          (~2-3 dk)
   │
   ▼
VDS zamanlayıcısı (dakikada bir)  ──►  manifest.json'daki commit yeni mi?
   │                                    evet → chunk'ları indir, container'ı yeniden kur   (~15 sn)
   ▼                                    imaj parmak izi değiştiyse → docker build (~7 dk, nadir)
Canlı: https://barmaksantedarik.chenki.net
```

Toplam: push'tan yayına **~3-4 dakika**. Eskiden her değişiklik ~7 dakikalık Docker build'di.

## Hızlı yol / yavaş yol

| Ne değişti | Ne olur |
| --- | --- |
| Web kodu (sayfa, bileşen, CSS) | Yeni chunk'lar indirilir, container yeniden başlar (~15 sn) |
| API kodu (`apps/api/src`) | Aynı: kod sunucuya kopyalanır, container yeniden başlar |
| `package-lock.json`, `Dockerfile`, `apps/api/prisma/**` | İmaj yeniden kurulur (migration'lar container açılırken uygulanır) |

İmaj parmak izi `manifest.json` içindeki `image` alanıdır (CI hesaplar, sunucu `.image-hash` ile karşılaştırır).

## Sunucuda ne var

`/opt/up-satinalim/` altında:

- `update.sh`: güncelleyici (depodaki `deploy/vds/update.sh`)
- `run.sh`: container'ı kurar (`deploy/vds/run.sh`)
- `app.env`: gizli ortam değişkenleri (depoda **yok**, yalnızca sunucuda)
- `web-next/` (web çıktısı), `web-next.prev/` (önceki sürüm; geri dönüş), `uploads/`, `update.log`
- systemd: `up-satinalim-update.timer` + `.service` (dosyaları `deploy/vds/` içinde)

Bakmak için:

```bash
systemctl list-timers up-satinalim-update.timer
tail -n 30 /opt/up-satinalim/update.log
docker logs --tail 50 up-satinalim
```

Elle hemen çektirmek: `systemctl start up-satinalim-update.service`

Geri dönmek: `cd /opt/up-satinalim && rm -rf web-next && mv web-next.prev web-next && bash run.sh`

## Güvenlik notları

- Depo **herkese açık**. `.env` dosyaları `.gitignore`'dadır; gizli bilgi yalnızca sunucudaki `app.env`'dedir.
- `DEV_LOGIN_BYPASS=true` (şifresiz giriş) yalnızca test panelinde ve yerelde açıktır. Kodda ek bir kilit vardır:
  ön yüz adresi `b2b.ugurpromilling.com` (ya da eski canlı adresler) ise bayrak ne olursa olsun kapalıdır.
- Test paneli **kopya veritabanı** (`vendor_test`) kullanır; canlı `vendor` veritabanına dokunmaz.

## Coolify ile (isteğe bağlı, ikinci yol)

Aynı depo Coolify için hazırdır (kökte `Dockerfile`, port 3000, `.env.example`). Coolify arayüzünde
(giriş sizde olduğu için bunu elle yapmanız gerekir):

1. **Projects → Add → New Resource → Public Repository**
   - URL: `https://github.com/gokaygulustan/BarmaksanUpdate`, branch: `main`
2. **Build Pack: Dockerfile**, **Ports Exposes: 3000**
3. **Domain**: mevcut test adresi nginx'te tanımlı olduğu için ya başka bir alt alan adı verin
   ya da nginx'teki `90-barmaksantedarik` sitesini kaldırıp bu adresi Coolify'a bırakın
4. **Environment Variables** (`apps/api/.env.example`'a bakın): `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`,
   `SMTP_*`. Test paneliyse `DEV_LOGIN_BYPASS=true`; **canlı için asla**.
5. **Webhooks → GitHub**: Coolify'ın verdiği webhook adresini ve gizli anahtarı GitHub'da
   *Settings → Webhooks*'a ekleyin; her push'ta Coolify tam imajı yeniden kurar (~7 dk).

Not: Coolify yolu her seferinde tam Docker build yapar. Hızlı yol (yukarıdaki chunk akışı) bunun yerine
~15 sn sürer; ikisi aynı alan adına aynı anda bakamaz, birini seçin.
