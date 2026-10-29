import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CANONICAL_HOST = 'b2b.ugurpromilling.com';
const LEGACY_HOSTS = new Set(['ugurpromilling.com.tr', 'www.ugurpromilling.com.tr']);

function isLegacyPortalPath(pathname: string) {
  const path = pathname || '/';
  return (
    path === '/quote' ||
    path.startsWith('/quote/') ||
    path === '/q' ||
    path.startsWith('/q/') ||
    path === '/executive-approval' ||
    path.startsWith('/executive-approval/') ||
    path === '/decision' ||
    path.startsWith('/decision/')
  );
}

/** Yalnızca eski tedarikçi / onay linkleri B2B’ye gider; .com.tr’nin gerisi dokunulmaz. */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  if (!host || !LEGACY_HOSTS.has(host)) return NextResponse.next();
  if (!isLegacyPortalPath(request.nextUrl.pathname)) return NextResponse.next();

  const dest = request.nextUrl.clone();
  dest.hostname = CANONICAL_HOST;
  dest.protocol = 'https:';
  dest.port = '';
  return NextResponse.redirect(dest, 301);
}

export const config = {
  matcher: ['/quote/:path*', '/q', '/q/:path*', '/executive-approval/:path*', '/decision/:path*'],
};
