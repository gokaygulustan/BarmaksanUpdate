/**
 * E-posta, SMS ve CORS için kanonik ön yüz (sonunda / yok).
 *
 * Coolify ortam değişkeni:
 *   FRONTEND_URL=https://b2b.ugurpromilling.com
 *
 * Yerelde FRONTEND_URL=http://localhost:3000 kalabilir.
 * Üretim imajına kopyalanan localhost satırı, Coolify FQDN varken yok sayılır.
 */
const LOCAL_FALLBACK = 'http://localhost:3000';
export const PRODUCTION_PORTAL_URL = 'https://b2b.ugurpromilling.com';
export const LEGACY_PORTAL_HOSTS = ['ugurpromilling.com.tr', 'www.ugurpromilling.com.tr'];
export const LEGACY_PORTAL_ORIGINS = LEGACY_PORTAL_HOSTS.map((h) => `https://${h}`);

function normalizeOrigin(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function isLoopbackOrigin(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}

function envOriginCandidates() {
  return [
    process.env.FRONTEND_URL,
    process.env.APP_PUBLIC_URL,
    process.env.PUBLIC_APP_URL,
    process.env.COOLIFY_URL,
    process.env.COOLIFY_FQDN,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);
}

function runningOnCoolify() {
  return Boolean(
    process.env.COOLIFY_FQDN ||
      process.env.COOLIFY_URL ||
      process.env.COOLIFY ||
      process.env.SOURCE_COMMIT
  );
}

export function getFrontendBaseUrl() {
  const fromEnv = envOriginCandidates();
  const publicUrl = fromEnv.find((u) => !isLoopbackOrigin(u));
  if (publicUrl) return publicUrl;
  if (runningOnCoolify()) return PRODUCTION_PORTAL_URL;
  return fromEnv[0] || LOCAL_FALLBACK;
}

/** CORS: yerel + kanonik B2B. Origin yoksa (proxy / sunucu) izin verilir. */
export function getAllowedCorsOrigins() {
  const origins = new Set([
    getFrontendBaseUrl(),
    PRODUCTION_PORTAL_URL,
    ...LEGACY_PORTAL_ORIGINS,
    LOCAL_FALLBACK,
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]);
  for (const extra of String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const n = normalizeOrigin(extra);
    if (n) origins.add(n);
  }
  return [...origins];
}

export function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  const allowed = getAllowedCorsOrigins();
  if (allowed.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'b2b.ugurpromilling.com' || LEGACY_PORTAL_HOSTS.includes(host);
  } catch {
    return false;
  }
}
