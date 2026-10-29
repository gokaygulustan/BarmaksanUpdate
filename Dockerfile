## UP-SatinAlim — tek imaj, apps/api + apps/web birlikte (scripts/start-prod.mjs iki süreci aynı anda başlatır).
FROM node:20-bookworm-slim

# Prisma binary engine (rhel/debian openssl 3) çalışma zamanında libssl ister.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Önce yalnızca manifestler: bağımlılık katmanı kaynak değişince yeniden kurulmaz.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Kaynak + prod build (prisma generate + next build).
COPY . .
RUN npm run build:prod

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
