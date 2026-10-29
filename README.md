# Tedarik Portalı (UP-SatinAlim)

Uğur Promilling satın alma / tedarik portalı. Monorepo: `apps/api` (Express + Prisma/PostgreSQL), `apps/web` (Next.js).

## Yerelde çalıştırma

```bash
npm install
cp apps/api/.env.example apps/api/.env   # DATABASE_URL ve JWT_SECRET'ı doldurun
npm run db:generate --workspace=apps/api
npm run dev                               # web :3000, API :4000
```

Şifresiz yerel giriş için `apps/api/.env` içine `DEV_LOGIN_BYPASS=true` (yalnızca yerel/test; canlı adreste kod bunu zaten reddeder).

## Test paneline yayın

`main`'e push yeter; test sunucusu kendini günceller. Ayrıntı: [deploy/README.md](deploy/README.md).

## Canlı (cPanel)

`deploy-web.bat` / `deploy-api.bat` ZIP üretir (ayrıntılar kurum içi notlarda).
