'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { procurementApi } from '@/lib/api';
import { ArrowRight, BarChart3, Building2, Layers } from 'lucide-react';
import { StatusGlyph, statusTone } from '@/components/StatusGlyph';
import { Windmill } from '@/components/brand/Windmill';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuthStore } from '@/stores/useAuthStore';
import { showsProductionItemMeta } from '@/lib/access';
import { procurementStatusLabel } from '@/lib/procurementStatus';
import {
  EmptyState,
  LoadingState,
  PageHeader,
  SearchField,
  SecondaryButton,
  Segmented,
  SkeletonCards,
  Swap,
  Tile,
} from '@/components/page/Page';
import { cn } from '@/lib/utils';

interface VendorAssignment {
  vendor: { name: string };
}

interface ProcurementRequest {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  items?: unknown[];
  assignments?: VendorAssignment[];
}

type Scope = 'ALL' | 'READY' | 'ARCHIVE';

const isReady = (r: ProcurementRequest) => r.status === 'VENDOR_QUOTED';

export default function AnalysisReportsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState<Scope>('ALL');

  const canAccess =
    user?.role === 'ADMIN' ||
    user?.isExecutive ||
    (user?.role === 'PURCHASING' && showsProductionItemMeta(user?.moduleId));

  useEffect(() => {
    if (user && !canAccess) router.replace('/dashboard');
  }, [user, canAccess, router]);

  const { data: requests = [], isLoading } = useQuery<ProcurementRequest[]>({
    queryKey: ['procurement-analysis'],
    queryFn: async () => {
      const { data } = await procurementApi.getAll();
      return data.filter(
        (r: ProcurementRequest) =>
          r.status === 'VENDOR_QUOTED' || r.status === 'VENDOR_APPROVED' || r.status === 'COMPLETED'
      );
    },
    enabled: Boolean(canAccess),
  });

  const searched = useMemo(
    () => requests.filter((r) => r.title.toLowerCase().includes(searchTerm.toLowerCase())),
    [requests, searchTerm],
  );

  const summary = useMemo(() => {
    const ready = searched.filter(isReady).length;
    const vendors = new Set(searched.flatMap((r) => (r.assignments || []).map((a) => a.vendor.name)));
    return {
      total: searched.length,
      ready,
      archive: searched.length - ready,
      items: searched.reduce((sum, r) => sum + (r.items?.length || 0), 0),
      vendors: vendors.size,
    };
  }, [searched]);

  /** Analize hazır olanlar önde; kendi içinde sıra API'deki gibi kalır. */
  const visible = useMemo(() => {
    const list = searched.filter((r) => scope === 'ALL' || (scope === 'READY' ? isReady(r) : !isReady(r)));
    return [...list.filter(isReady), ...list.filter((r) => !isReady(r))];
  }, [searched, scope]);

  /** En yeni analize hazır talep: özetin üçüncü sütununda doğrudan açılır. */
  const latestReady = useMemo(
    () =>
      searched
        .filter(isReady)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null,
    [searched],
  );

  if (!canAccess) {
    return <LoadingState />;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] pb-8">
      <PageHeader
        tour="analysis-head"
        title="Analiz raporları"
        description="Fiyatları gelmiş talepleri açın, tedarikçi tekliflerini kalem kalem karşılaştırın."
      />

      {/* Özet: sayı kutuları yerine okunur bir cümle ve kutusuz üç sütun (ikisi süzgeç, biri en yeni rapor). */}
      <Tile className="texture-host mb-4 p-5 sm:p-7">
        <span aria-hidden className="tile-texture" />
        <span aria-hidden className="tile-texture tile-texture-bottom" />
        <div className="relative">
          <p className="text-[12.5px] font-medium text-white/45">Karşılaştırma masası</p>
          <h2 key={isLoading ? 'l' : 'r'} className="fx-rise mt-2 max-w-[760px] text-[24px] font-[300] leading-[1.2] tracking-[-0.025em] text-white/55 sm:text-[30px]">
            {isLoading ? (
              'Raporlar hazırlanıyor…'
            ) : summary.ready ? (
              <>
                <span className="text-brand-ink">{summary.ready} rapor</span> analize hazır.
              </>
            ) : (
              'Şu an analiz bekleyen rapor yok.'
            )}
          </h2>
          {!isLoading ? (
            <p className="mt-2.5 text-[13.5px] text-white/40">
              {summary.items.toLocaleString('tr-TR')} kalemde {summary.vendors.toLocaleString('tr-TR')} firmanın teklifi
              karşılaştırılabilir.
            </p>
          ) : null}

          <div className="mt-8 grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
            <ScopeColumn
              edge="start"
              icon={<StatusGlyph status="VENDOR_QUOTED" />}
              label="Analize hazır"
              value={summary.ready}
              sub="Teklifler geldi, karar bekliyor."
              active={scope === 'READY'}
              onClick={() => setScope((s) => (s === 'READY' ? 'ALL' : 'READY'))}
            />
            <ScopeColumn
              icon={<StatusGlyph status="COMPLETED" color="#8e8e93" />}
              label="Arşiv"
              value={summary.archive}
              sub="Onaylanan ya da tamamlanan talepler."
              active={scope === 'ARCHIVE'}
              onClick={() => setScope((s) => (s === 'ARCHIVE' ? 'ALL' : 'ARCHIVE'))}
            />
            {latestReady ? (
              <Link
                href={`/procurement/${latestReady.id}/analysis`}
                className="group/latest min-w-0 pt-5 outline-none focus-visible:ring-2 focus-visible:ring-brand/40 md:pl-7 md:pt-0"
              >
                <span className="flex items-center gap-2 text-[12.5px] font-medium text-white/40">
                  <Layers className="size-[15px] text-white/45" strokeWidth={1.8} />
                  En yeni
                  <ArrowRight className="ml-auto size-3.5 text-white/25 transition-[color,transform] duration-200 group-hover/latest:translate-x-0.5 group-hover/latest:text-brand" />
                </span>
                <span className="mt-3 block truncate text-[17px] font-medium leading-[1.35] text-white transition-colors duration-200 group-hover/latest:text-brand-ink">
                  {latestReady.title}
                </span>
                <span className="mt-1.5 block text-[12.5px] text-white/40">
                  {format(new Date(latestReady.createdAt), 'd MMMM', { locale: tr })} ·{' '}
                  {(latestReady.items?.length || 0).toLocaleString('tr-TR')} kalem ·{' '}
                  {(latestReady.assignments || []).length} firma
                </span>
              </Link>
            ) : (
              <div className="min-w-0 pt-5 md:pl-7 md:pt-0">
                <span className="flex items-center gap-2 text-[12.5px] font-medium text-white/40">
                  <Building2 className="size-[15px] text-white/45" strokeWidth={1.8} />
                  Tedarikçi
                </span>
                <span className="mt-3 block text-[17px] text-white/50">
                  <b className="font-medium text-white">{summary.vendors.toLocaleString('tr-TR')} firma</b> teklif verdi.
                </span>
              </div>
            )}
          </div>
        </div>
      </Tile>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row" data-tour="analysis-search">
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Talep adına göre ara"
          label="Analiz raporu ara"
          className="flex-1"
        />
        <Segmented
          label="Rapor durumu"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'ALL', label: 'Tümü', count: summary.total },
            { value: 'READY', label: 'Analize hazır', count: summary.ready },
            { value: 'ARCHIVE', label: 'Arşiv', count: summary.archive },
          ]}
        />
      </div>

      <div data-tour="analysis-list">
        <Swap
          loading={isLoading}
          skeleton={<SkeletonCards count={6} className="gap-3 md:grid-cols-2 lg:gap-4 xl:grid-cols-3" />}
        >
        {visible.length === 0 ? (
          <Tile>
            <EmptyState
              icon={<BarChart3 />}
              title={searchTerm || scope !== 'ALL' ? 'Eşleşen rapor yok' : 'Henüz analiz edilecek talep yok'}
              body={
                searchTerm || scope !== 'ALL'
                  ? 'Aramayı veya durum seçimini değiştirip yeniden deneyin.'
                  : 'Teklif toplama aşaması bitmiş ve fiyatlandırılmış talepler burada listelenir.'
              }
              action={
                searchTerm || scope !== 'ALL' ? (
                  <SecondaryButton
                    onClick={() => {
                      setSearchTerm('');
                      setScope('ALL');
                    }}
                  >
                    Süzgeçleri temizle
                  </SecondaryButton>
                ) : null
              }
            />
          </Tile>
        ) : (
          <div className="stagger grid gap-3 md:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {visible.map((req) => {
              const ready = isReady(req);
              const vendors = req.assignments || [];
              const itemCount = req.items?.length || 0;
              return (
                <Link
                  key={req.id}
                  href={`/procurement/${req.id}/analysis`}
                  className="bento-tile gold-fade group/card relative flex min-h-[132px] flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 outline-none focus-visible:border-brand/60 sm:p-5"
                >
                  {/* Düz kutu, doku yok. Üzerine gelince panodaki gibi alttan sarı degrade yükselir; köşedeki
                   * soluk değirmen çeyrek tur döner. */}
                  <Windmill
                    spinning={false}
                    className="pointer-events-none absolute -bottom-16 -right-14 size-[150px] text-brand opacity-[0.06] transition-[opacity,rotate,transform] duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:rotate-90 group-hover/card:opacity-[0.16]"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-x-5 bottom-0 h-[2px] origin-left scale-x-0 rounded-full bg-brand transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-x-100"
                  />

                  <div className="relative flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex min-w-0 items-center gap-2 font-medium" style={{ color: statusTone(req.status) }}>
                      <span className="size-1.5 shrink-0 rounded-full bg-current" />
                      <span className="truncate">{ready ? 'Analize hazır' : procurementStatusLabel(req.status) || 'Arşiv'}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-white/35">
                      {format(new Date(req.createdAt), 'd MMM yyyy', { locale: tr })}
                    </span>
                  </div>

                  <h3 className="relative mt-3 line-clamp-2 text-[15.5px] font-medium leading-snug tracking-[-0.01em] text-white [overflow-wrap:anywhere] transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/card:-translate-y-0.5">
                    {req.title}
                  </h3>

                  <div className="relative mt-auto flex items-center justify-between gap-3 pt-4">
                    <span className="text-[12.5px] tabular-nums text-white/45">
                      {itemCount} kalem · {vendors.length} tedarikçi
                    </span>
                    <ArrowRight
                      aria-label={ready ? 'Analizi başlat' : 'Raporu aç'}
                      className="size-4 shrink-0 -translate-x-1.5 text-brand opacity-0 transition-[opacity,transform] duration-300 group-hover/card:translate-x-0 group-hover/card:opacity-100"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        </Swap>
      </div>
    </div>
  );
}

/** Özet sütunu: soluk etiket, altında sayı cümlesi; basınca süzgeç olur, seçiliyken sayı altına döner. */
function ScopeColumn({
  icon,
  label,
  value,
  sub,
  active,
  onClick,
  edge,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  active: boolean;
  onClick: () => void;
  edge?: 'start';
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group/sc min-w-0 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 md:px-7 md:py-0',
        edge === 'start' && 'pt-0 md:pl-0',
      )}
    >
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-white/40 [&_svg]:size-[15px]">
        {icon}
        {label}
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[11px] transition-colors duration-150 md:ml-1',
            active ? 'bg-brand text-primary-foreground' : 'text-transparent group-hover/sc:text-white/40',
          )}
        >
          {active ? 'Süzülüyor' : 'Süz'}
        </span>
      </span>
      <span className="mt-3 block text-[17px] leading-[1.35] text-white/50">
        <b
          className={cn(
            'font-medium transition-colors duration-200',
            active ? 'text-brand-ink' : 'text-white group-hover/sc:text-brand-ink',
          )}
        >
          {value.toLocaleString('tr-TR')} rapor
        </b>
      </span>
      <span className="mt-1.5 block text-[12.5px] text-white/40">{sub}</span>
    </button>
  );
}
