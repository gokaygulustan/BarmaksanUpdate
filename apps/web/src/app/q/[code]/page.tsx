import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { tabMeta } from '@/lib/tabMetadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = tabMeta('Fiyat teklif talebi');

function apiBase(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) return pub.replace(/\/+$/, '');
  const internal = (process.env.API_INTERNAL_ORIGIN || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  return `${internal}/api`;
}

type PageProps = { params: Promise<{ code: string }> };

/** SMS kısa link: /q/Ab12Cd34 → /quote/{uzunToken} */
export default async function QuoteShortRedirectPage({ params }: PageProps) {
  const { code } = await params;
  const normalized = String(code || '').trim();
  if (!normalized) notFound();

  let token: string | null = null;
  try {
    const res = await fetch(`${apiBase()}/procurement/short/${encodeURIComponent(normalized)}`, {
      cache: 'no-store',
    });
    if (!res.ok) notFound();
    const data = (await res.json()) as { quoteToken?: string };
    token = data.quoteToken || null;
  } catch {
    notFound();
  }

  if (!token) notFound();
  redirect(`/quote/${token}`);
}
