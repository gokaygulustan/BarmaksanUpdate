'use client';

import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type ActivityLog = {
  id: string;
  action?: string;
  message?: string | null;
  createdAt: string | Date;
  vendor?: { name?: string | null } | null;
};

type SystemComment = {
  id: string;
  content: string;
  createdAt: string | Date;
  targetVendor?: { name?: string | null } | null;
};

type UnifiedLog = {
  id: string;
  createdAt: string | Date;
  message?: string | null;
  vendorName: string;
  action: string;
  kind: 'activity' | 'system';
};

type ParsedItem = { label: string; details: string[] };

const MONEY_RE = /^(-?\d+(?:[.,]\d+)?)\s*(TRY|TL|USD|EUR|CHF)?$/i;

function moneySymbol(code: string) {
  const c = code.toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  if (c === 'CHF') return 'CHF';
  return '₺';
}

function prettyMoney(raw: string) {
  const m = String(raw || '')
    .trim()
    .match(MONEY_RE);
  if (!m) return String(raw || '').trim();
  const n = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(n)) return String(raw).trim();
  const formatted = n.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${moneySymbol(m[2] || 'TRY')}`;
}

function beautifyBit(bit: string): string {
  const s = String(bit || '').trim();
  if (!s) return '';

  const priceChange = s.match(/^birim fiyat\s+(.+?)\s+→\s+(.+)$/i);
  if (priceChange) return `${prettyMoney(priceChange[1])} → ${prettyMoney(priceChange[2])}`;

  const price = s.match(/^birim fiyat\s+(.+)$/i);
  if (price) return prettyMoney(price[1]);

  const iskChange = s.match(/^kalem isk\.\s+(.+)$/i);
  if (iskChange) return `İskonto ${iskChange[1]}`;

  if (/^yeni teklif\s*\(/i.test(s)) {
    const inner = s.replace(/^yeni teklif\s*\(/i, '').replace(/\)\s*$/, '');
    const bits = inner
      .split(/,\s*/)
      .map(beautifyBit)
      .filter(Boolean);
    return ['Yeni teklif', ...bits].join(' · ');
  }

  if (s === 'not eklendi') return 'Not eklendi';
  if (s === 'tedarikçi notu güncellendi') return 'Not güncellendi';
  if (s === 'tedarikçi notu kaldırıldı') return 'Not kaldırıldı';
  return s;
}

function parseQuoteBody(rest: string): ParsedItem[] {
  return rest
    .split(/\s*\|\s*/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const idx = chunk.indexOf(': ');
      if (idx === -1) return { label: chunk, details: [] as string[] };
      const label = chunk.slice(0, idx).trim();
      const detailStr = chunk.slice(idx + 2).trim();
      const yeni = detailStr.match(/^yeni teklif\s*\((.*)\)\s*$/i);
      if (yeni) {
        const bits = (yeni[1] || '')
          .split(/,\s*/)
          .map(beautifyBit)
          .filter(Boolean);
        return { label, details: ['Yeni teklif', ...bits] };
      }
      const details = detailStr
        .split(/;\s*/)
        .map(beautifyBit)
        .filter(Boolean);
      return { label, details };
    });
}

export function parseVendorLogMessage(message: string | null | undefined): {
  headline: string;
  items: ParsedItem[];
  phone?: string;
} {
  const raw = String(message || '').trim();
  if (!raw) return { headline: '', items: [] };

  const phoneMatch = raw.match(/\[\[admin-phone:([^\]]+)\]\]/);
  const phone = phoneMatch?.[1]?.trim();
  const text = raw.replace(/\s*\[\[admin-phone:[^\]]+\]\]/, '').trim();

  const prefixes = ['Teklif güncellendi (dış bağlantı):', 'Teklif güncellendi:'];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      const rest = text.slice(prefix.length).trim();
      return {
        headline: prefix.endsWith('(dış bağlantı):') ? 'Teklif güncellendi (dış bağlantı)' : 'Teklif güncellendi',
        items: parseQuoteBody(rest),
        phone,
      };
    }
  }

  if (text === 'Teklif iletildi (kayıtlı değerlerde değişiklik yok).') {
    return { headline: 'Teklif iletildi', items: [{ label: 'Değişiklik yok', details: [] }], phone };
  }
  if (text === 'Teklif iletildi — dış bağlantı (kayıtlı değerlerde değişiklik yok).') {
    return { headline: 'Teklif iletildi (dış bağlantı)', items: [{ label: 'Değişiklik yok', details: [] }], phone };
  }

  return { headline: text, items: [], phone };
}

function ArrowText({ text }: { text: string }) {
  const parts = text.split(/\s*→\s*/);
  if (parts.length !== 2) return <span>{text}</span>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-muted-foreground">{parts[0]}</span>
      <span aria-hidden className="text-muted-foreground/50">
        →
      </span>
      <span className="font-semibold text-foreground">{parts[1]}</span>
    </span>
  );
}

function actionMeta(log: UnifiedLog) {
  if (log.kind === 'system') {
    return { label: 'Bilgi', tone: 'bg-white/10 text-white/80' };
  }
  switch (log.action) {
    case 'VIEW':
      return { label: 'Görüntüledi', tone: 'bg-sky-500/15 text-sky-200' };
    case 'RESEND_EMAIL':
      return { label: 'E-posta', tone: 'bg-emerald-500/15 text-emerald-300' };
    case 'RESEND_SMS':
      return { label: 'SMS', tone: 'bg-emerald-500/15 text-emerald-300' };
    case 'UPLOAD':
      return { label: 'Dosya', tone: 'bg-violet-500/15 text-violet-200' };
    case 'STAFF_DELETE':
      return { label: 'Teklif silindi', tone: 'bg-red-500/15 text-red-300' };
    default:
      return { label: 'Teklif', tone: 'bg-amber-500/15 text-amber-200' };
  }
}

export function VendorActivityLogs({
  activityLogs,
  comments,
}: {
  activityLogs?: ActivityLog[] | null;
  comments?: SystemComment[] | null;
}) {
  const unifiedLogs: UnifiedLog[] = [
    ...(activityLogs || []).map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      message: l.message,
      vendorName: l.vendor?.name || 'Tedarikçi',
      action: l.action || 'SUBMIT',
      kind: 'activity' as const,
    })),
    ...(comments || [])
      .filter((c) => String(c.content || '').startsWith('📌 Sistem Bilgisi:'))
      .map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        message: String(c.content).replace('📌 Sistem Bilgisi: ', ''),
        vendorName: c.targetVendor?.name || 'Sistem',
        action: 'INFO',
        kind: 'system' as const,
      })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    // Onay geçmişiyle aynı dil: kutusuz zaman çizelgesi; her kayıt kendi renginde bir noktada, noktaları ince çizgi bağlar.
    <section className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card">
      <div className="px-5 pb-3 pt-5">
        <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Tedarikçi logları</h3>
        <p className="mt-0.5 text-[12.5px] text-white/40">Erişim ve teklif kayıtları, en yenisi üstte</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5 [scrollbar-width:thin]" style={{ maxHeight: '460px' }}>
        {unifiedLogs.length === 0 ? (
          <div className="py-4">
            <p className="text-[13.5px] text-white/75">Henüz kayıt yok</p>
            <p className="mt-1 text-[12.5px] text-white/40">Tedarikçi teklif formunu açınca ya da fiyat girince burada görünür.</p>
          </div>
        ) : (
          <ul>
            {unifiedLogs.map((log) => {
              const meta = actionMeta(log);
              const parsed = parseVendorLogMessage(log.message);
              const noChangeOnly =
                parsed.items.length === 1 &&
                parsed.items[0].label === 'Değişiklik yok' &&
                parsed.items[0].details.length === 0;
              const showHeadline =
                Boolean(parsed.headline) &&
                parsed.headline !== 'Teklif güncellendi' &&
                parsed.headline !== 'Teklif güncellendi (dış bağlantı)' &&
                !noChangeOnly;
              const hasItems = parsed.items.length > 0 && !noChangeOnly;

              return (
                <li key={log.id} className="group/log relative pb-5 pl-6 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[5px] top-4 w-px bg-white/[0.08] group-last/log:hidden"
                  />
                  <span
                    aria-hidden
                    className={cn('absolute left-0 top-[5px] size-[11px] rounded-full ring-4 ring-card', meta.tone, 'bg-current')}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[13.5px] font-medium leading-snug text-white">
                      {log.vendorName}
                      <span className={cn('ml-2 text-[12px] font-normal', meta.tone, 'bg-transparent px-0')}>{meta.label}</span>
                    </p>
                    <time className="shrink-0 text-[12px] tabular-nums text-white/35">
                      {format(new Date(log.createdAt), 'd MMM HH:mm', { locale: tr })}
                    </time>
                  </div>

                  {noChangeOnly ? (
                    <p className="mt-1 text-[13px] leading-6 text-white/60">Kayıtlı fiyatlarda değişiklik yok.</p>
                  ) : null}

                  {showHeadline && !hasItems ? (
                    <p className="mt-1 text-[13px] leading-6 text-white/70">{parsed.headline}</p>
                  ) : null}

                  {showHeadline && hasItems ? (
                    <p className="mt-1 text-[12px] text-white/40">{parsed.headline}</p>
                  ) : null}

                  {hasItems ? (
                    <ul className="mt-2 space-y-2.5">
                      {parsed.items.map((item, i) => (
                        <li key={`${log.id}-${i}`} className="border-l border-white/[0.08] pl-3">
                          <p className="text-[13px] leading-snug text-white/85">{item.label}</p>
                          {item.details.length > 0 ? (
                            <ul className="mt-0.5 space-y-0.5">
                              {item.details.map((d, j) => (
                                <li key={j} className="text-[12.5px] leading-6 tabular-nums text-white/55">
                                  <ArrowText text={d} />
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {parsed.phone ? (
                    <p className="mt-2 text-[12px] text-white/40">Tel: {parsed.phone}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
