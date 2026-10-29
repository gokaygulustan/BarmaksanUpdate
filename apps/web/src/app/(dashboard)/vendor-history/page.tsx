'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { vendorsApi } from '@/lib/api';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  History,
  Star,
} from 'lucide-react';
import { format, formatDistanceToNow, subMonths } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { isYedekParcaUser, moduleLabel } from '@/lib/access';
import { useAuthStore } from '@/stores/useAuthStore';
import { CountUp } from '@/components/CountUp';
import { StatusGlyph } from '@/components/StatusGlyph';
import {
  Dot,
  EmptyState,
  IconButton,
  PageHeader,
  RowArrow,
  RowBar,
  rowClass,
  SearchField,
  SecondaryButton,
  Segmented,
  SelectMenu,
  Skeleton,
  SkeletonRows,
  StatusChip,
  Swap,
  Tile,
  TileHeader,
} from '@/components/page/Page';

const PAGE_SIZE = 50;

type HistoryItem = {
  assignmentId: string;
  requestId: string;
  requestTitle: string;
  requestCreatedAt: string;
  requestModuleId?: string | null;
  vendorId: string;
  vendorName: string;
  itemId: string;
  productName: string;
  category?: string | null;
  unit: string;
  quantity: number;
  quotedPrice: number | string;
  currency: string;
  discountRate?: number | null;
  isShippingIncluded?: boolean;
  isVatIncluded?: boolean;
  vatRate?: number | null;
  hasMaturity?: boolean;
  maturityDays?: number | null;
  isPicked: boolean;
};

type SortKey = 'vendorName' | 'productName' | 'quotedPrice' | 'requestCreatedAt' | 'isPicked';
type StatusFilter = 'ALL' | 'PICKED' | 'NOT_PICKED';

const SORT_OPTIONS = [
  { value: 'requestCreatedAt:desc', label: 'Yeniden eskiye' },
  { value: 'requestCreatedAt:asc', label: 'Eskiden yeniye' },
  { value: 'quotedPrice:desc', label: 'Fiyat: yüksekten düşüğe' },
  { value: 'quotedPrice:asc', label: 'Fiyat: düşükten yükseğe' },
  { value: 'vendorName:asc', label: 'Tedarikçi: A–Z' },
  { value: 'productName:asc', label: 'Ürün: A–Z' },
  { value: 'isPicked:desc', label: 'Önce kabul edilenler' },
];

function money(value: number | string, currency: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && n - prev > 1) out.push('gap');
    out.push(n);
  }
  return out;
}

const monthTitle = (iso: string) => {
  const s = format(new Date(iso), 'LLLL yyyy', { locale: tr });
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
};

const num = (value: number) => value.toLocaleString('tr-TR');

/** Cümlenin içindeki asıl bilgi: beyaz ve biraz kalın; çevresi soluk kalır. */
function Em({ children, className }: { children: ReactNode; className?: string }) {
  return <b className={cn('font-medium text-white', className)}>{children}</b>;
}

/**
 * Öne çıkan bilgi (Sağlık'taki "Öne Çıkanlar" gibi): kutusu yok. Komşularından yalnızca
 * ince bir çizgiyle ayrılır (App Store'daki bilgi şeridi gibi); bağlantıysa üzerine gelince başlık altına döner.
 */
function Highlight({
  icon,
  label,
  href,
  sub,
  footer,
  edge,
  children,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  sub?: ReactNode;
  footer?: ReactNode;
  /** Şeritteki yeri: baştaki sütun kutunun sol alt köşesine taşar, altın dolgu kutunun dibinden yükselsin diye. */
  edge?: 'start' | 'end';
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-white/40">
        <span aria-hidden className="flex shrink-0 [&_svg]:size-[15px]">
          {icon}
        </span>
        <span className="min-w-0 truncate">{label}</span>
        {href ? (
          <ArrowRight
            aria-hidden
            className="ml-auto size-3.5 shrink-0 text-white/25 transition-[color,transform] duration-200 group-hover/h:translate-x-0.5 group-hover/h:text-brand"
          />
        ) : null}
      </span>
      <span className="mt-3 block text-[17px] leading-[1.35] tracking-[-0.012em] text-white/50 transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/h:-translate-y-0.5">
        {children}
      </span>
      {sub ? (
        <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-white/38">{sub}</span>
      ) : null}
      {footer ? <span className="mt-4 block">{footer}</span> : null}
    </>
  );
  const cls = cn(
    'min-w-0 py-5 md:px-7 md:py-0',
    edge === 'start' && 'pt-0 md:pl-0',
    edge === 'start' && href && 'md:-mb-7 md:-ml-7 md:pb-7 md:pl-7',
    edge === 'end' && 'pb-0 md:pr-0'
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        cls,
        'gold-fade group/h block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40'
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

type VendorStat = { vendorId: string; name: string; offers: number; picked: number };

/**
 * Hiç seçilmeyen firmalar. Satırlar kendi rengini yakıp söndürmez; tek bir altın kapsül satırlar arasında kayar
 * (bölümlü seçicideki gibi). Böylece iki satır birden yanmaz, satır sınırında titreme olmaz. Kapsül en çok teklif
 * veren (yıldızlı) firmada durur; imleç başka satıra gelince hızla oraya kayar, kendi satırındayken biraz daha
 * parlar. İmleç listeden çıkınca kısa bir beklemeden sonra yavaşça yerine döner.
 */
function NeverPickedList({ rows, onPick }: { rows: VendorStat[]; onPick: (vendorId: string) => void }) {
  // Kapsülün yeri ve yazı renkleri globals.css'te (.np-*): CSS :hover'dan gelir, JS durumu tutulmaz.
  return (
    <span className="np-list relative -mx-2 block">
      <span aria-hidden className="np-pill pointer-events-none absolute inset-x-0 top-0 h-8 rounded-[8px] bg-brand" />
      {rows.map((v, i) => (
        <button
          key={v.vendorId}
          type="button"
          onClick={() => onPick(v.vendorId)}
          aria-label={`${v.name} firmasının tekliflerini göster`}
          className="np-row relative flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {i === 0 ? <Star aria-hidden strokeWidth={0} className="np-star size-3 shrink-0 fill-current" /> : null}
          <span className="min-w-0 flex-1 truncate">{v.name}</span>
          <span className="shrink-0 tabular-nums opacity-55">{num(v.offers)} teklif</span>
        </button>
      ))}
    </span>
  );
}

export default function VendorHistoryPage() {
  const user = useAuthStore((s) => s.user);
  /** Yedek parça tüm hatların geçmişini görür; diğer hatların talep sayfası kapalı. */
  const showsAllModules = isYedekParcaUser(user);
  const canOpenRequest = (item: HistoryItem) =>
    !showsAllModules || !item.requestModuleId || item.requestModuleId === user?.moduleId;
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      root: el.closest('main'),
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /** Durum seçilince asıl iş aşağıda: liste görünmüyorsa oraya yumuşakça iner. */
  const changeStatus = (next: StatusFilter) => {
    setStatusFilter(next);
    requestAnimationFrame(() => {
      const el = listRef.current;
      const top = el?.getBoundingClientRect().top ?? 0;
      if (!el || (top >= 0 && top < 120)) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  };
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('requestCreatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data } = await vendorsApi.getAll();
      return data;
    },
  });

  const { data: historyItems = [], isLoading } = useQuery<HistoryItem[]>({
    queryKey: ['vendor-purchase-history', selectedVendorId],
    queryFn: async () => {
      const { data } = await vendorsApi.getPurchaseHistory(selectedVendorId || undefined);
      return data;
    },
  });

  /** Arama uygulanmış, durum süzgeci uygulanmamış liste: özet, grafik ve öne çıkanlar buradan. */
  const searchedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return historyItems;
    return historyItems.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.vendorName.toLowerCase().includes(q) ||
        item.requestTitle.toLowerCase().includes(q) ||
        String(item.category || '')
          .toLowerCase()
          .includes(q)
    );
  }, [historyItems, searchQuery]);

  const filteredItems = useMemo(
    () =>
      searchedItems.filter(
        (item) =>
          statusFilter === 'ALL' ||
          (statusFilter === 'PICKED' && item.isPicked) ||
          (statusFilter === 'NOT_PICKED' && !item.isPicked)
      ),
    [searchedItems, statusFilter]
  );

  const summary = useMemo(() => {
    const picked = searchedItems.filter((i) => i.isPicked).length;
    return {
      total: searchedItems.length,
      picked,
      rate: searchedItems.length ? Math.round((picked / searchedItems.length) * 100) : 0,
      vendors: new Set(searchedItems.map((i) => i.vendorId)).size,
      requests: new Set(searchedItems.map((i) => i.requestId)).size,
    };
  }, [searchedItems]);

  /** Firma başına teklif ve kabul sayısı. */
  const vendorStats = useMemo(() => {
    const map = new Map<
      string,
      { vendorId: string; name: string; offers: number; picked: number }
    >();
    for (const item of searchedItems) {
      const row = map.get(item.vendorId) || {
        vendorId: item.vendorId,
        name: item.vendorName,
        offers: 0,
        picked: 0,
      };
      row.offers += 1;
      if (item.isPicked) row.picked += 1;
      map.set(item.vendorId, row);
    }
    return [...map.values()];
  }, [searchedItems]);

  /** En çok teklifi kabul edilen tedarikçiler. */
  const leaders = useMemo(
    () =>
      vendorStats
        .filter((r) => r.picked > 0)
        .sort((a, b) => b.picked - a.picked || b.offers - a.offers)
        .slice(0, 8),
    [vendorStats]
  );

  /** Teklif verip hiç seçilmeyen firmalar, en çok teklif verenden başlayarak. */
  const neverPicked = useMemo(
    () => vendorStats.filter((r) => r.picked === 0).sort((a, b) => b.offers - a.offers),
    [vendorStats]
  );

  /** Öne çıkanlar: son kabul, ilk teklif, bu ay ve geçen ay. */
  const highlights = useMemo(() => {
    const now = new Date();
    const thisKey = format(now, 'yyyy-MM');
    const lastKey = format(subMonths(now, 1), 'yyyy-MM');
    const month = { offers: 0, picked: 0 };
    const prev = { offers: 0, picked: 0 };
    let lastPicked: HistoryItem | null = null;
    let first: HistoryItem | null = null;
    for (const item of searchedItems) {
      const time = new Date(item.requestCreatedAt).getTime();
      const key = format(time, 'yyyy-MM');
      const bucket = key === thisKey ? month : key === lastKey ? prev : null;
      if (bucket) {
        bucket.offers += 1;
        if (item.isPicked) bucket.picked += 1;
      }
      if (item.isPicked && (!lastPicked || time > new Date(lastPicked.requestCreatedAt).getTime()))
        lastPicked = item;
      if (!first || time < new Date(first.requestCreatedAt).getTime()) first = item;
    }
    const name = format(now, 'LLLL', { locale: tr });
    return {
      month,
      prev,
      lastPicked,
      first,
      monthName: name.charAt(0).toLocaleUpperCase('tr-TR') + name.slice(1),
    };
  }, [searchedItems]);

  const selectedVendorName = selectedVendorId
    ? vendors.find((v: { id: string; name: string }) => v.id === selectedVendorId)?.name ||
      historyItems[0]?.vendorName
    : '';
  const scopeLabel = [
    selectedVendorName || 'Tüm teklifler',
    searchQuery.trim() ? `“${searchQuery.trim()}” araması` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const sortedItems = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredItems].sort((a, b) => {
      if (sortKey === 'quotedPrice') return (Number(a.quotedPrice) - Number(b.quotedPrice)) * dir;
      if (sortKey === 'isPicked') return (Number(a.isPicked) - Number(b.isPicked)) * dir;
      if (sortKey === 'requestCreatedAt') {
        return (
          (new Date(a.requestCreatedAt).getTime() - new Date(b.requestCreatedAt).getTime()) * dir
        );
      }
      return String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'tr') * dir;
    });
  }, [filteredItems, sortKey, sortDir]);

  const total = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, selectedVendorId]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = sortedItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, total);

  /** Tarihe göre sıralıyken sayfadaki teklifler aylara bölünür (Cüzdan'daki gibi); değilse tek kutu. */
  const sections = useMemo(() => {
    if (sortKey !== 'requestCreatedAt')
      return [{ key: 'all', title: 'Teklifler', items: pageItems }];
    const out: { key: string; title: string; items: HistoryItem[] }[] = [];
    for (const item of pageItems) {
      const key = format(new Date(item.requestCreatedAt), 'yyyy-MM');
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(item);
      else out.push({ key, title: monthTitle(item.requestCreatedAt), items: [item] });
    }
    return out;
  }, [pageItems, sortKey]);

  const exportToCsv = () => {
    if (!sortedItems.length) return;
    const headers = [
      'Tedarikçi',
      'Ürün Adı',
      'Kategori',
      'Miktar',
      'Birim',
      'Teklif Fiyatı',
      'Para Birimi',
      'İskonto (%)',
      'Kabul Durumu',
      'Nakliye Dahil',
      'KDV Dahil',
      'KDV Oranı',
      'Vade (Gün)',
      'Talep Başlığı',
      'Tarih',
    ];

    const rows = sortedItems.map((item) => [
      `"${item.vendorName}"`,
      `"${item.productName}"`,
      `"${item.category || ''}"`,
      item.quantity,
      `"${item.unit}"`,
      item.quotedPrice,
      item.currency,
      item.discountRate || 0,
      item.isPicked ? 'Kabul Edildi' : 'Seçilmedi',
      item.isShippingIncluded ? 'Evet' : 'Hayır',
      item.isVatIncluded ? 'Evet' : 'Hayır',
      item.vatRate || '-',
      item.hasMaturity ? `${item.maturityDays} Gün` : 'Peşin',
      `"${item.requestTitle}"`,
      format(new Date(item.requestCreatedAt), 'dd.MM.yyyy HH:mm'),
    ]);

    const csvContent = '﻿' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cari_Satin_Alma_Gecmisi_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Teklif satırı (Cüzdan hareketi gibi): solda durum ikonu, ortada ürün ve bilgi, sağda tutar. */
  const renderRow = (item: HistoryItem, idx: number) => {
    const open = canOpenRequest(item);
    const discount = Number(item.discountRate) > 0 ? item.discountRate : null;
    const body: ReactNode = (
      <>
        <RowBar />
        <StatusChip status={item.isPicked ? 'OFFER_PICKED' : 'OFFER_NOT_PICKED'} />
        <div className="min-w-0 flex-1 transition-transform duration-300 ease-out group-hover/row:translate-x-1">
          <p className="truncate text-[14.5px] font-medium leading-snug text-white">
            {item.productName}
          </p>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-white/40">
            <span className="shrink-0 font-medium text-white/65">{item.vendorName}</span>
            <Dot />
            <span className="shrink-0 tabular-nums">
              {item.quantity} {item.unit}
            </span>
            <Dot />
            <span className="min-w-0 truncate">{item.requestTitle}</span>
          </div>
          <div className="mt-0.5 hidden items-center gap-2 text-[12px] text-white/30 sm:flex">
            <span className="tabular-nums">
              {format(new Date(item.requestCreatedAt), 'd MMM', { locale: tr })}
            </span>
            <Dot />
            <span>Nakliye {item.isShippingIncluded ? 'dahil' : 'hariç'}</span>
            <Dot />
            <span>KDV {item.isVatIncluded ? 'dahil' : `hariç %${item.vatRate || 20}`}</span>
            <Dot />
            <span>{item.hasMaturity ? `${item.maturityDays} gün vade` : 'Peşin'}</span>
            {showsAllModules ? (
              <>
                <Dot />
                <span>{moduleLabel(item.requestModuleId)}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-medium tabular-nums text-white">
            {money(item.quotedPrice, item.currency)}
          </p>
          <p
            className={cn(
              'mt-0.5 text-[12px] tabular-nums',
              item.isPicked ? 'text-[#3fbf7f]' : 'text-white/35'
            )}
          >
            {item.isPicked ? 'Kabul edildi' : 'Seçilmedi'}
            {discount ? <span className="text-brand-ink"> · %{discount} isk.</span> : null}
          </p>
        </div>
        {open ? <RowArrow /> : <span className="size-4 shrink-0" />}
      </>
    );
    const cls = cn(rowClass, 'flex items-center gap-4 px-5 py-3.5 outline-none sm:px-6');
    const key = `${item.itemId}-${item.vendorId}-${idx}`;
    return open ? (
      <Link key={key} href={`/procurement/${item.requestId}`} className={cls}>
        {body}
      </Link>
    ) : (
      <div key={key} className={cls}>
        {body}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-8">
      <PageHeader
        title="Cari tedarik geçmişi"
        description="Tedarikçilerin verdiği teklifler ve kabul edilen fiyatlar."
        actions={
          <SecondaryButton
            icon={<Download className="size-4" strokeWidth={1.8} />}
            onClick={exportToCsv}
            disabled={!sortedItems.length}
          >
            CSV indir
          </SecondaryButton>
        }
      />

      {/* Araç çubuğu geniş ekranda yapışır: aşağıdaki listede gezerken süzgeçler elinin altında kalır. Yapışınca
       * arkasına koyu, bulanık bir zemin gelir; altından geçen satırlarla karışmaz. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        className={cn(
          '-mx-2 -mt-2 mb-2 flex flex-col gap-2 rounded-b-[20px] px-2 py-2 transition-[background-color,box-shadow] duration-300 lg:sticky lg:top-0 lg:z-20 lg:flex-row',
          stuck && 'lg:bg-[#141416]/80 lg:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.9)] lg:backdrop-blur-xl'
        )}
      >
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Ürün, tedarikçi veya talep ara"
          label="Geçmişte ara"
          className="flex-1"
        />
        <SelectMenu
          label="Tedarikçi"
          value={selectedVendorId}
          onChange={setSelectedVendorId}
          active={Boolean(selectedVendorId)}
          searchable
          menuWidth={300}
          className="lg:w-64"
          options={[
            { value: '', label: 'Tüm tedarikçiler' },
            ...vendors.map((v: { id: string; name: string }) => ({ value: v.id, label: v.name })),
          ]}
        />
        <Segmented
          label="Teklif durumu"
          value={statusFilter}
          onChange={changeStatus}
          options={[
            { value: 'ALL', label: 'Tümü', count: summary.total },
            { value: 'PICKED', label: 'Kabul', count: summary.picked },
            { value: 'NOT_PICKED', label: 'Seçilmeyen', count: summary.total - summary.picked },
          ]}
        />
        <SelectMenu
          label="Sırala"
          value={`${sortKey}:${sortDir}`}
          onChange={(next) => {
            const [key, dir] = next.split(':') as [SortKey, 'asc' | 'desc'];
            setSortKey(key);
            setSortDir(dir);
            setPage(1);
          }}
          align="end"
          className="lg:w-56"
          options={SORT_OPTIONS}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          {/* Özet: grafik yerine okunur cümleler (Sağlık'taki Öne Çıkanlar gibi). */}
          <Tile className="texture-host p-5 sm:p-7">
            <span aria-hidden className="tile-texture" />
            <span aria-hidden className="tile-texture tile-texture-bottom" />
            <div className="relative">
              {isLoading ? (
                <div aria-hidden className="space-y-3">
                  <Skeleton className="h-3 w-28 rounded-full" />
                  <Skeleton className="h-8 w-3/4 rounded-full" style={{ '--i': 1 } as React.CSSProperties} />
                  <Skeleton className="h-3 w-1/2 rounded-full" style={{ '--i': 2 } as React.CSSProperties} />
                </div>
              ) : (
                <>
                  <p className="truncate text-[12.5px] font-medium text-white/45">{scopeLabel}</p>
                  <h2 className="mt-2 max-w-[680px] text-[24px] font-[300] leading-[1.2] tracking-[-0.025em] text-white/55 sm:text-[30px]">
                    {summary.total === 0 ? (
                      'Bu seçimde teklif yok.'
                    ) : summary.picked === 0 ? (
                      <>
                        <span className="text-white">{num(summary.total)} teklif kalemi</span> var,
                        henüz hiçbiri kabul edilmedi.
                      </>
                    ) : (
                      <>
                        <span className="text-white">{num(summary.total)} teklif kaleminden</span>{' '}
                        <span className="text-brand-ink">{num(summary.picked)} tanesi</span> kabul
                        edildi.
                      </>
                    )}
                  </h2>
                  {summary.total > 0 ? (
                    <p className="mt-2.5 text-[13.5px] text-white/40">
                      {selectedVendorId
                        ? `${num(summary.requests)} talebe teklif verdi.`
                        : `${num(summary.requests)} talepte ${num(summary.vendors)} firmadan teklif alındı.`}
                    </p>
                  ) : null}

                  {summary.total > 0 ? (
                    <div className="mt-9 grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
                      {highlights.lastPicked ? (
                        <Highlight
                          edge="start"
                          icon={<StatusGlyph status="OFFER_PICKED" color="#8e8e93" />}
                          label="Son kabul edilen"
                          href={
                            canOpenRequest(highlights.lastPicked)
                              ? `/procurement/${highlights.lastPicked.requestId}`
                              : undefined
                          }
                          sub={
                            <span className="block truncate">
                              {highlights.lastPicked.vendorName}
                            </span>
                          }
                          footer={
                            <span className="text-[12px] text-white/35">
                              <span className="font-medium tabular-nums text-white/75">
                                {money(
                                  highlights.lastPicked.quotedPrice,
                                  highlights.lastPicked.currency
                                )}
                              </span>
                              {' · '}
                              {formatDistanceToNow(
                                new Date(highlights.lastPicked.requestCreatedAt),
                                {
                                  addSuffix: true,
                                  locale: tr,
                                }
                              )}
                            </span>
                          }
                        >
                          <Em className="line-clamp-2 transition-colors duration-200 group-hover/h:text-brand-ink">
                            {highlights.lastPicked.productName}
                          </Em>
                        </Highlight>
                      ) : (
                        <Highlight
                          edge="start"
                          icon={<StatusGlyph status="OFFER_PICKED" color="#8e8e93" />}
                          label="Son kabul edilen"
                        >
                          Henüz kabul edilen teklif yok.
                        </Highlight>
                      )}

                      <Highlight
                        icon={<CalendarDays className="text-white/45" strokeWidth={1.7} />}
                        label={`Bu ay · ${highlights.monthName}`}
                        sub={(() => {
                          const { month, prev } = highlights;
                          const diff = month.offers - prev.offers;
                          if (prev.offers === 0) return 'Geçen ay hiç teklif gelmemişti.';
                          if (diff === 0) return 'Geçen ayla aynı sayıda teklif.';
                          return `Geçen aya göre ${num(Math.abs(diff))} teklif ${diff > 0 ? 'fazla' : 'az'}.`;
                        })()}
                        footer={
                          highlights.prev.offers > 0 ? (
                            <span className="text-[12px] text-white/35">
                              Geçen ay {num(highlights.prev.offers)} teklif,{' '}
                              {num(highlights.prev.picked)} kabul
                            </span>
                          ) : null
                        }
                      >
                        {highlights.month.offers === 0 ? (
                          'Henüz teklif gelmedi.'
                        ) : (
                          <>
                            <Em>{num(highlights.month.offers)} teklif</Em> geldi,{' '}
                            {highlights.month.picked ? (
                              <>
                                <Em>{num(highlights.month.picked)} tanesi</Em> kabul edildi.
                              </>
                            ) : (
                              'henüz kabul yok.'
                            )}
                          </>
                        )}
                      </Highlight>

                      {selectedVendorId ? (
                        <Highlight
                          edge="end"
                          icon={<History className="text-white/45" strokeWidth={1.7} />}
                          label="İlk teklif"
                          sub={`O günden beri ${num(summary.requests)} talebe teklif verdi.`}
                        >
                          <Em>
                            {highlights.first
                              ? format(new Date(highlights.first.requestCreatedAt), 'd MMMM yyyy', {
                                  locale: tr,
                                })
                              : '—'}
                          </Em>
                        </Highlight>
                      ) : (
                        <Highlight
                          edge="end"
                          icon={<StatusGlyph status="OFFER_NOT_PICKED" color="#8e8e93" />}
                          label="Hiç seçilmeyenler"
                          sub={
                            neverPicked.length
                              ? 'Teklif verdiler, hiçbir kalemde seçilmediler.'
                              : undefined
                          }
                          footer={
                            neverPicked.length ? (
                              <NeverPickedList rows={neverPicked.slice(0, 3)} onPick={setSelectedVendorId} />
                            ) : null
                          }
                        >
                          {neverPicked.length ? (
                            <>
                              <Em>{num(neverPicked.length)} firma</Em> hiç seçilmedi.
                            </>
                          ) : (
                            'Teklif veren her firma en az bir kez seçildi.'
                          )}
                        </Highlight>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Tile>

          <div ref={listRef} className="scroll-mt-24 space-y-4">
          <Swap
            loading={isLoading}
            skeleton={
              <Tile>
                <SkeletonRows rows={6} />
              </Tile>
            }
          >
          {total === 0 ? (
            <Tile>
              <EmptyState
                icon={<History />}
                title="Eşleşen kayıt yok"
                body="Tedarikçiyi, durumu veya aramayı değiştirip yeniden deneyin."
              />
            </Tile>
          ) : (
            <>
              {sections.map((section) => (
                <Tile key={section.key}>
                  <TileHeader
                    title={section.title}
                    aside={`${section.items.length} teklif · ${section.items.filter((i) => i.isPicked).length} kabul`}
                  />
                  <div className="divide-y divide-white/[0.05]">{section.items.map(renderRow)}</div>
                </Tile>
              ))}

              <Tile className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <p className="text-[12.5px] tabular-nums text-white/40">
                  {from.toLocaleString('tr-TR')}–{to.toLocaleString('tr-TR')} /{' '}
                  {total.toLocaleString('tr-TR')} kayıt
                </p>
                {totalPages > 1 ? (
                  <nav aria-label="Sayfalar" className="flex items-center gap-0.5">
                    <IconButton
                      label="İlk sayfa"
                      disabled={safePage <= 1}
                      onClick={() => setPage(1)}
                    >
                      <ChevronsLeft className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Önceki sayfa"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </IconButton>
                    {pageWindow(safePage, totalPages).map((n, i) =>
                      n === 'gap' ? (
                        <span key={`gap-${i}`} className="px-1 text-[13px] text-white/30">
                          …
                        </span>
                      ) : (
                        <button
                          key={n}
                          type="button"
                          aria-current={n === safePage ? 'page' : undefined}
                          onClick={() => setPage(n)}
                          className={cn(
                            'press h-8 min-w-8 rounded-[9px] px-2 text-[13px] font-medium tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40',
                            n === safePage
                              ? 'bg-brand text-primary-foreground'
                              : 'text-white/50 hover:bg-brand hover:text-primary-foreground'
                          )}
                        >
                          {n}
                        </button>
                      )
                    )}
                    <IconButton
                      label="Sonraki sayfa"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Son sayfa"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(totalPages)}
                    >
                      <ChevronsRight className="size-4" />
                    </IconButton>
                  </nav>
                ) : null}
              </Tile>
            </>
          )}
          </Swap>
          </div>
        </div>

        {/* Öne çıkan tedarikçiler: sıra, ad, kabul oranı çubuğu, kabul sayısı. Basınca süzer. */}
        <Tile className="lg:sticky lg:top-[76px] lg:col-span-4">
          <TileHeader title="Öne çıkan tedarikçiler" aside="kabul sayısına göre" />
          {leaders.length === 0 ? (
            <EmptyState
              icon={<History />}
              title="Henüz kabul edilen teklif yok"
              body="Kabul edilen teklifler burada firmalara göre sıralanır."
              className="py-12"
            />
          ) : (
            <ul className="space-y-0.5 p-2">
              {leaders.map((r, i) => {
                const on = selectedVendorId === r.vendorId;
                const pct = Math.round((r.picked / r.offers) * 100);
                return (
                  <li key={r.vendorId}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelectedVendorId(on ? '' : r.vendorId)}
                      className={cn(
                        'press group/l flex w-full items-center gap-3.5 rounded-[14px] px-3 py-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40',
                        on ? 'bg-brand text-primary-foreground' : 'hover:bg-white/[0.04]'
                      )}
                    >
                      <span
                        className={cn(
                          'w-4 shrink-0 text-center text-[13px] tabular-nums',
                          on ? 'text-primary-foreground/60' : 'text-white/30'
                        )}
                      >
                        {i + 1}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-medium transition-colors',
                          on
                            ? 'bg-black/15'
                            : 'bg-[#26262a] text-white/75 group-hover/l:bg-brand group-hover/l:text-primary-foreground'
                        )}
                      >
                        {r.name.trim().charAt(0).toLocaleUpperCase('tr-TR')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-[14px] font-medium',
                            on ? 'text-primary-foreground' : 'text-white'
                          )}
                        >
                          {r.name}
                        </span>
                        <span
                          className={cn(
                            'mt-1.5 block h-1 overflow-hidden rounded-full',
                            on ? 'bg-black/15' : 'bg-white/[0.08]'
                          )}
                        >
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              on ? 'bg-primary-foreground/70' : 'bg-brand'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span
                          className={cn(
                            'mt-1 block text-[11.5px] tabular-nums',
                            on ? 'text-primary-foreground/65' : 'text-white/40'
                          )}
                        >
                          {r.offers} teklif · %{pct} kabul
                        </span>
                      </span>
                      <CountUp
                        value={r.picked}
                        className={cn(
                          'shrink-0 text-[24px] font-[250] leading-none tracking-[-0.04em] tabular-nums',
                          on ? 'text-primary-foreground' : 'text-brand-ink'
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Tile>
      </div>
    </div>
  );
}
