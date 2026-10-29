/**
 * Ekran kilidi: sayfa yenilense de kilitli kalır (oturum çerezi, tarayıcı kapanınca silinir).
 */
const COOKIE_NAME = 'up_dash_lock';

function cookieAttrs(): string {
  if (typeof window === 'undefined') return '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  return `; path=/; SameSite=Lax${secure}`;
}

export function isDashboardLockCookieSet(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${COOKIE_NAME}=1`));
}

export function setDashboardLockCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=1${cookieAttrs()}`;
}

export function clearDashboardLockCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; max-age=0${cookieAttrs()}`;
}
