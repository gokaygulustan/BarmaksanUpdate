'use client';

// Talep panoları (Taleplerim, Birim tedarik talepleri): aşamalar yan yana sütunlar, talepler
// sütunlarda sade kart. Boş aşama dar kalır; dolu sütunlar kalan genişliği paylaşır. Süs yok:
// ince kenar, beyaz tonları; kırmızı yalnızca ret ve geciken tarih için.

import Link from 'next/link';
import { SmokeText } from '@/components/SmokeText';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Skeleton } from '@/components/page/Skeleton';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { format, isBefore, startOfDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ArrowRight, CalendarClock, Loader2, Trash2 } from 'lucide-react';
import { isPurchasingDraft, resolvePipeline } from '@/lib/requestPipeline';
import { cn } from '@/lib/utils';

export type RequestRow = {
  id: string;
  title: string;
  status: string;
  procurementStatus?: string | null;
  requesterUnit?: string | null;
  neededBy?: string | null;
  createdAt?: string;
  sourcedItemCount?: number;
  openItemCount?: number;
};

export type BoardPage = {
  items: RequestRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

type Step = { key: string; label: string };

/** Panodaki ana eylem (bağlantı): altın, yazı yukarı yuvarlanır, ok çipi döner. */
export function PrimaryLink({
  href,
  children,
  icon,
  tour,
}: {
  href: string;
  children: string;
  icon?: ReactNode;
  tour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={tour}
      className="press group/cta inline-flex h-11 shrink-0 items-center gap-2.5 rounded-[11px] bg-brand pl-4 pr-2 text-[14px] font-medium text-primary-foreground outline-none transition-colors duration-200 hover:bg-[#e4c43c] focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {icon}
      <span className="roll">
        <span>{children}</span>
        <span aria-hidden>{children}</span>
      </span>
      <span className="ml-1 flex size-7 items-center justify-center rounded-[7px] bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/cta:translate-x-0.5 group-hover/cta:-rotate-45">
        <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}

/** Sayfa başlığı: kutusuz; sağda eylem. Pano ekranı doldurduğu için başlık panodakinden küçük. */
export function BoardHero({ title, action }: { title: string; action: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-[30px] font-medium leading-[1.06] tracking-[-0.035em] text-white sm:text-[36px] lg:text-[40px]">
        <SmokeText text={title} />
      </h1>
      {action}
    </header>
  );
}

const shortDay = (iso?: string | null) => (iso ? format(new Date(iso), 'd MMM', { locale: tr }) : '');

/**
 * Kart: başlık, durum cümlesi ve tek bilgi satırı (birim · tarih; varsa gerekli tarih, kalem
 * sayısı, "hazırlanıyor"). Üzerine gelince yalnızca kenar belirginleşir.
 */
function RequestCard({
  row,
  href,
  canDelete,
  onDelete,
}: {
  row: RequestRow;
  href: string;
  canDelete?: boolean;
  onDelete?: (row: RequestRow) => void;
}) {
  const pipeline = resolvePipeline(row.status, row.procurementStatus);
  const rejected = pipeline.failed != null;
  const draft = isPurchasingDraft(row.status, row.procurementStatus);
  const late = Boolean(row.neededBy) && !pipeline.doneAll && isBefore(new Date(row.neededBy!), startOfDay(new Date()));
  const sourced = row.sourcedItemCount || 0;
  const open = row.openItemCount || 0;
  const partial = sourced > 0 && open > 0;

  return (
    <Link
      href={href}
      className="skel-in texture-host group/card relative block overflow-hidden rounded-[16px] border border-white/[0.08] bg-card px-4 py-3.5 outline-none transition-[border-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-brand/40 focus-visible:border-brand/60 active:translate-y-0 active:duration-100"
    >
      {/* Kartın içinde: marka dokusu (üstte belirgin, aşağı doğru söner) ve hafif sarımtırak degrade.
          Kartların arkası (sayfa zemini) boş kalır. İmleç kartın üstündeyken doku yavaşça kayar. */}
      <span aria-hidden className="tile-texture tile-texture-down" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(217,182,37,0.12),rgba(217,182,37,0.03)_52%,transparent_78%)] transition-opacity duration-300 group-hover/card:opacity-100"
      />
      {/* Soldan altın çizgi: üzerine gelince ortadan açılır. */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[2px] origin-center scale-y-0 rounded-r-full bg-brand transition-transform duration-300 ease-out group-hover/card:scale-y-100"
      />
      <p className="relative line-clamp-2 text-[14.5px] font-medium leading-snug tracking-[-0.008em] text-white">{row.title}</p>
      <p className={cn('relative mt-1 text-[12.5px] leading-snug', rejected ? 'text-[#f2705e]' : 'text-white/55')}>
        {pipeline.caption}
      </p>

      <div className="relative mt-3 flex h-6 items-center gap-2 text-[12px] text-white/45">
        <span className="flex min-w-0 gap-1">
          <span className="min-w-0 truncate">{row.requesterUnit || 'Birim belirtilmemiş'}</span>
          {row.createdAt ? <span className="shrink-0 tabular-nums">· {shortDay(row.createdAt)}</span> : null}
        </span>
        {draft ? <span className="shrink-0">· Hazırlanıyor</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          {partial ? (
            <span className="tabular-nums" title="Temin edilen kalem">
              {sourced}/{sourced + open}
            </span>
          ) : null}
          {row.neededBy ? (
            <span
              className={cn('flex items-center gap-1 tabular-nums', late && 'text-[#f2705e]')}
              title={late ? 'Gerekli tarih geçti' : 'Gerekli tarih'}
            >
              <CalendarClock className="size-3.5" strokeWidth={1.8} />
              {shortDay(row.neededBy)}
            </span>
          ) : null}
          {/* Silme: üzerine gelince; dokunmatikte hep görünür. */}
          {canDelete ? (
            <button
              type="button"
              aria-label="Talebi sil"
              title="Sil"
              className="-mr-1.5 flex size-6 items-center justify-center rounded-[6px] text-white/40 opacity-0 transition-[opacity,color] duration-150 hover:text-destructive focus-visible:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.(row);
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>
    </Link>
  );
}

type CardProps = {
  hrefFor: (row: RequestRow) => string;
  canDelete?: boolean;
  onDelete?: (row: RequestRow) => void;
};

/** Sütun başlığı: ad ve yanında sayı. */
function ColumnHeader({ label, count }: { label: string; count: number }) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-1 pb-2.5">
      <h2 className="min-w-0 truncate text-[13px] font-medium text-white/80">{label}</h2>
      <span className="text-[13px] tabular-nums text-white/35">{count}</span>
    </header>
  );
}

/** Boş aşama: başlığı kadar dar sütun; sırası görünür kalır, panoyu genişletmez. */
function EmptyColumn({ label }: { label: string }) {
  return (
    <section className="flex w-max min-w-[120px] shrink-0 flex-col max-md:snap-start">
      <ColumnHeader label={label} count={0} />
      <p className="rounded-[12px] border border-dashed border-white/[0.07] py-6 text-center text-[12.5px] text-white/30">
        Talep yok
      </p>
    </section>
  );
}

/** Sütun: başlık, altında kendi içinde kayan kart listesi. */
function Column({
  label,
  count,
  rows,
  loading,
  error,
  footer,
  hrefFor,
  canDelete,
  onDelete,
}: {
  label: string;
  count: number;
  rows: RequestRow[];
  loading?: boolean;
  error?: boolean;
  footer?: ReactNode;
} & CardProps) {
  return (
    <section className="flex min-w-[220px] flex-1 flex-col max-md:min-w-[80vw] max-md:snap-start">
      <ColumnHeader label={label} count={count} />
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-2 [scrollbar-width:thin]">
        {loading ? (
          <div aria-hidden className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[16px] border border-white/[0.07] bg-card px-4 py-3.5">
                <Skeleton className="h-3.5 rounded-full" style={{ '--i': i, width: `${78 - i * 12}%` } as CSSProperties} />
                <Skeleton className="mt-2.5 h-3 w-2/5 rounded-full opacity-70" style={{ '--i': i + 1 } as CSSProperties} />
                <Skeleton className="mt-3 h-3 w-1/3 rounded-full opacity-60" style={{ '--i': i + 2 } as CSSProperties} />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="px-1 py-10 text-center text-[12.5px] text-destructive">Yüklenemedi</p>
        ) : rows.length === 0 ? (
          <p className="px-1 py-10 text-center text-[12.5px] text-white/30">Talep yok</p>
        ) : (
          rows.map((row) => (
            <RequestCard key={row.id} row={row} href={hrefFor(row)} canDelete={canDelete} onDelete={onDelete} />
          ))
        )}
        {footer}
      </div>
    </section>
  );
}

/** Aşamanın kartları sayfa sayfa gelir; sütunun sonuna yaklaşınca sıradaki sayfa yüklenir. */
function InfiniteColumn({
  queryKey,
  fetchPage,
  ...column
}: {
  queryKey: QueryKey;
  fetchPage: (cursor: string | null) => Promise<BoardPage>;
  label: string;
  count: number;
} & CardProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    retry: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
  });
  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { root: el.parentElement, rootMargin: '160px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, rows.length]);

  return (
    <Column
      {...column}
      rows={rows}
      loading={isLoading}
      error={isError}
      footer={
        <>
          <div ref={sentinelRef} className="h-px" />
          {isFetchingNextPage ? (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-white/40" />
            </div>
          ) : null}
        </>
      }
    />
  );
}

/**
 * Pano: her aşama bir sütun, hepsi sırayla yan yana. Talebi olmayan aşama dar boş sütun olur.
 * Sütunlar ekranın kalan yüksekliğini doldurur ve kendi içinde kayar; sığmazsa pano yana kayar
 * (telefonda sütun sütun oturarak). Sayaç uç noktası çalışmazsa (staticRows) sütunlar elde hazır
 * listeyle kurulur.
 */
export function RequestKanban({
  steps,
  counts,
  loading,
  queryKeyFor,
  fetchPage,
  staticRows,
  tour,
  ...card
}: {
  steps: readonly Step[];
  counts: Record<string, number>;
  loading?: boolean;
  queryKeyFor: (stage: string) => QueryKey;
  fetchPage: (stage: string, cursor: string | null) => Promise<BoardPage>;
  staticRows?: Record<string, RequestRow[]> | null;
  tour?: string;
} & CardProps) {
  const countOf = (key: string) => (staticRows ? (staticRows[key]?.length ?? 0) : (counts[key] ?? 0));

  return (
    <div
      data-tour={tour}
      className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin] max-md:snap-x max-md:snap-mandatory"
    >
      <div className="flex h-full min-h-[420px] gap-3">
        {steps.map((step) => {
          if (!loading && countOf(step.key) === 0) {
            return <EmptyColumn key={step.key} label={step.label} />;
          }
          return staticRows ? (
            <Column
              key={step.key}
              label={step.label}
              count={countOf(step.key)}
              rows={staticRows[step.key] || []}
              loading={loading}
              {...card}
            />
          ) : (
            <InfiniteColumn
              key={`${step.key}|${JSON.stringify(queryKeyFor(step.key))}`}
              queryKey={queryKeyFor(step.key)}
              fetchPage={(cursor) => fetchPage(step.key, cursor)}
              label={step.label}
              count={countOf(step.key)}
              {...card}
            />
          );
        })}
      </div>
    </div>
  );
}
