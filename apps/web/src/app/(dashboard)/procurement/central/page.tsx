'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ArrowLeftRight, Check, ChevronDown, ListFilter, Loader2, Search, SearchX, X } from 'lucide-react';
import { toast } from 'sonner';
import { procurementApi } from '@/lib/api';
import { PROCUREMENT_STATUS_LABELS, procurementStatusLabel } from '@/lib/procurementStatus';
import { DocumentTitle } from '@/components/DocumentTitle';
import { SkeletonRows, Swap } from '@/components/page/Skeleton';
import { StatusGlyph, statusTone } from '@/components/StatusGlyph';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/useAuthStore';

const MODULE_LABEL: Record<string, string> = {
  SATIN_ALMA: 'Satın Alma',
  URETIM_PLANLAMA: 'Üretim Planlama',
  YEDEK_PARCA: 'Yedek Parça',
};

const MODULES = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'SATIN_ALMA', label: 'Satın Alma' },
  { id: 'URETIM_PLANLAMA', label: 'Üretim Planlama' },
  { id: 'YEDEK_PARCA', label: 'Yedek Parça' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tüm durumlar' },
  ...Object.entries(PROCUREMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'REJECTED']);

// Geniş ekranda liste sütunları: talep · departman · kalem · durum · işlem. Daha darda satır iki
// katlı tek kutu olur (departman ve kalem başlığın altına iner).
const COLS = 'xl:grid xl:grid-cols-[minmax(0,1fr)_140px_64px_200px_168px] xl:items-center xl:gap-5';

type CentralRow = {
  id: string;
  title: string;
  status: string;
  moduleId?: string;
  createdAt: string;
  createdBy?: { name?: string };
  items?: unknown[];
  purchasingResponsibleModuleId?: string | null;
  handovers?: { id: string; status?: string }[];
};

function Dot({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`size-[3px] shrink-0 rounded-full bg-white/25 ${className}`} />;
}

/** Durumun kendi ikonu, rengindeki ince halkalı yuvarlak içinde ("Tüm durumlar" için süzgeç). */
function StatusMark({ status, large = false }: { status: string; large?: boolean }) {
  const box = large ? 'size-8' : 'size-7';
  const glyph = large ? 'size-[18px]' : 'size-4';
  if (status === 'ALL') {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/60`}>
        <ListFilter className="size-[15px]" strokeWidth={1.8} />
      </span>
    );
  }
  const tone = statusTone(status);
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full`}
      style={{ color: tone, background: `${tone}17`, boxShadow: `inset 0 0 0 1px ${tone}33` }}
    >
      <StatusGlyph status={status} className={glyph} />
    </span>
  );
}

/**
 * Bölümlü departman seçici. Altın kapsül seçilen bölüme kayar; kapsülün içinde koyu yazılı bir
 * kopya ters yönde aynı eğriyle kayar, böylece yazı rengi tam altının kapladığı yerde döner.
 */
function ModuleSegments({
  value,
  onChange,
  counts,
  loading,
}: {
  value: string;
  onChange: (id: string) => void;
  counts: Record<string, number>;
  loading: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLElement>(`[data-seg="${value}"]`);
      if (btn) setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  // Hover önizlemesi, kenar çubuğundakinin aynısı: imleci izleyip bölümden bölüme kayar, ilk girişte
  // kaymadan yalnızca solarak belirir; seçili bölümde görünmez, basılınca anında kaybolur.
  const ghostRef = useRef<HTMLSpanElement>(null);
  const moveGhost = (el: HTMLElement | null) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    if (!el || el.getAttribute('aria-pressed') === 'true') {
      ghost.style.opacity = '0';
      return;
    }
    const wasHidden = ghost.style.opacity !== '1';
    if (wasHidden) ghost.style.transition = 'opacity 120ms ease';
    ghost.style.width = `${el.offsetWidth}px`;
    ghost.style.transform = `translateX(${el.offsetLeft}px)`;
    ghost.style.opacity = '1';
    if (wasHidden) {
      requestAnimationFrame(() => {
        if (ghostRef.current) ghostRef.current.style.transition = '';
      });
    }
  };
  const dropGhost = () => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.transition = 'none';
    ghost.style.opacity = '0';
  };

  // 12 px köşe: kutunun 16 px köşesi ve 4 px iç boşluğuyla eşmerkezli; uçtaki bölüm kutunun
  // yuvarlak ucuna tam oturur.
  const segment = 'flex h-10 shrink-0 items-center gap-2 rounded-[12px] px-3.5 text-[13px] font-medium';
  const count = (id: string) => (loading ? '·' : counts[id] || 0);

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Departman"
      onPointerLeave={() => moveGhost(null)}
      className="relative flex h-10 min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none] xl:flex-none xl:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      <span
        ref={ghostRef}
        aria-hidden
        className="seg-ghost pointer-events-none absolute inset-y-0 left-0 rounded-[12px] bg-white/[0.05] opacity-0"
      />
      {MODULES.map((m) => (
        <button
          key={m.id}
          type="button"
          data-seg={m.id}
          aria-pressed={value === m.id}
          onPointerEnter={(e) => moveGhost(e.currentTarget)}
          onPointerDown={dropGhost}
          onClick={() => onChange(m.id)}
          className={`press group/seg relative ${segment} text-white/60 outline-none transition-colors duration-150 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30`}
        >
          {m.label}
          <span className="text-[12px] tabular-nums text-white/35 transition-colors duration-150 group-hover/seg:text-white/60">
            {count(m.id)}
          </span>
        </button>
      ))}
      {pill ? (
        <span
          aria-hidden
          className="seg-pill pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-[12px] bg-brand"
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
        >
          <span
            className="seg-pill-ink absolute inset-y-0 left-0 flex gap-0.5 text-primary-foreground"
            style={{ transform: `translateX(${-pill.x}px)` }}
          >
            {MODULES.map((m) => (
              <span key={m.id} className={segment}>
                {m.label}
                <span className="text-[12px] tabular-nums text-primary-foreground/65">{count(m.id)}</span>
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Durum süzgeci: ikonlu, sayılı, klavyeyle kullanılabilen açılır liste. */
function StatusMenu({
  value,
  onChange,
  counts,
  total,
}: {
  value: string;
  onChange: (value: string) => void;
  counts: Record<string, number>;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    STATUS_OPTIONS.findIndex((o) => o.value === value),
  );
  const selected = STATUS_OPTIONS[selectedIndex];
  const countOf = (v: string) => (v === 'ALL' ? total : counts[v] || 0);

  const openMenu = () => {
    setActive(selectedIndex);
    setOpen(true);
  };
  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };
  const choose = (i: number) => {
    onChange(STATUS_OPTIONS[i].value);
    close();
  };

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = STATUS_OPTIONS.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(last, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(last);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Durum: ${selected.label}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openMenu();
          }
        }}
        className={`sg-rest flex h-10 w-[148px] items-center gap-2.5 rounded-[12px] pl-1.5 pr-2.5 text-[13.5px] text-white outline-none transition-colors duration-150 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/30 sm:w-[228px] ${
          open ? 'bg-white/[0.06]' : ''
        }`}
      >
        <StatusMark status={selected.value} />
        <span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
        <span className="text-[12px] tabular-nums text-white/35">{countOf(selected.value)}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label="Durum"
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className="status-menu absolute right-0 top-[calc(100%+8px)] z-40 max-h-[min(460px,60vh)] w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-[16px] border border-white/[0.08] bg-[#1b1b1e] p-1.5 shadow-[var(--shadow-float)] outline-none"
        >
          {STATUS_OPTIONS.map((o, i) => {
            const isSelected = o.value === value;
            const n = countOf(o.value);
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex h-10 cursor-pointer select-none items-center gap-3 rounded-[10px] pl-1.5 pr-2.5 text-[13.5px] ${
                  i === active ? 'bg-white/[0.06]' : 'sg-rest'
                } ${n === 0 && !isSelected ? 'text-white/40' : 'text-white'} ${i === 0 ? 'mb-1' : ''}`}
              >
                <StatusMark status={o.value} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="text-[12px] tabular-nums text-white/35">{n}</span>
                <Check className={`size-4 shrink-0 text-brand ${isSelected ? '' : 'invisible'}`} strokeWidth={2.2} />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default function CentralProcurementPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [takeoverId, setTakeoverId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ['procurement-central'],
    queryFn: async () => {
      const res = await procurementApi.listCentral();
      return (res.data || []) as CentralRow[];
    },
  });

  const all = useMemo(() => query.data || [], [query.data]);
  const q = searchTerm.trim().toLocaleLowerCase('tr');
  const matchesSearch = (row: CentralRow) => !q || String(row.title || '').toLocaleLowerCase('tr').includes(q);

  // Her süzgecin sayıları, diğer süzgeçler uygulanmış liste üstünden sayılır: departman sayıları
  // arama + durumu, durum sayıları arama + departmanı hesaba katar.
  const moduleCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    for (const row of all) {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) continue;
      if (!matchesSearch(row)) continue;
      counts.ALL += 1;
      if (row.moduleId) counts[row.moduleId] = (counts[row.moduleId] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, statusFilter, q]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of all) {
      if (moduleFilter !== 'ALL' && row.moduleId !== moduleFilter) continue;
      if (!matchesSearch(row)) continue;
      counts[row.status] = (counts[row.status] || 0) + 1;
      total += 1;
    }
    return { counts, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, moduleFilter, q]);

  const rows = useMemo(
    () =>
      all.filter(
        (row) =>
          (moduleFilter === 'ALL' || row.moduleId === moduleFilter) &&
          (statusFilter === 'ALL' || row.status === statusFilter) &&
          matchesSearch(row),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, moduleFilter, statusFilter, q],
  );

  const openCount = all.filter((row) => !CLOSED.has(row.status)).length;
  const filtersActive = moduleFilter !== 'ALL' || statusFilter !== 'ALL' || q !== '';

  // "/" ile aramaya geç (bir alana yazarken değil).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const takeover = useMutation({
    mutationFn: () => procurementApi.requestHandover(takeoverId!, { direction: 'TAKEOVER', note: note.trim() || null }),
    onSuccess: async () => {
      toast.success('Devralma isteği gönderildi.');
      setTakeoverId(null);
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['procurement-central'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Devralma isteği gönderilemedi.');
    },
  });

  const canTakeover =
    user?.role === 'ADMIN' || (user?.role === 'PURCHASING' && user.moduleId === 'SATIN_ALMA');

  const target = rows.find((row) => row.id === takeoverId) || all.find((row) => row.id === takeoverId);

  const clearFilters = () => {
    setModuleFilter('ALL');
    setStatusFilter('ALL');
    setSearchTerm('');
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      <DocumentTitle topic="Merkezi tedarik takibi" />

      {/* ── Başlık; sağda iki sade sayı ── */}
      <section className="flex flex-col gap-6 pt-1 sm:pt-2 md:flex-row md:items-end md:justify-between lg:pt-3">
        <div className="max-w-2xl">
          <h1 className="text-[32px] font-medium leading-[1.06] tracking-[-0.035em] text-white sm:text-[40px] lg:text-[46px]">
            <SmokeText text="Merkezi tedarik takibi" />
          </h1>
          <p className="fx-rise mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/55">
            Satın alma, üretim planlama ve yedek parça talepleri tek listede.
          </p>
        </div>
        <div className="flex shrink-0 gap-10 md:text-right">
          <div>
            <p className="text-[44px] font-[200] leading-[0.85] tracking-[-0.05em] text-white tabular-nums">
              {query.isLoading ? '—' : openCount}
            </p>
            <p className="mt-2.5 text-[13px] text-white/55">açık talep</p>
          </div>
          <div>
            <p className="text-[44px] font-[200] leading-[0.85] tracking-[-0.05em] text-white/45 tabular-nums">
              {query.isLoading ? '—' : all.length}
            </p>
            <p className="mt-2.5 text-[13px] text-white/40">toplam</p>
          </div>
        </div>
      </section>

      {/* ── Araç çubuğu: üç kutu, aralarında 8 px. Departman bölümleri solda, arama ortada boş alanı
       * doldurur, durum sağda. Hepsi aynı boy ve köşe. Dar ekranda bölümler üstte, arama ve durum altta. ── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="flex min-w-0 rounded-[16px] border border-white/[0.07] bg-card p-1 xl:shrink-0">
            <ModuleSegments
              value={moduleFilter}
              onChange={setModuleFilter}
              counts={moduleCounts}
              loading={query.isLoading}
            />
          </div>
          <div className="flex min-w-0 flex-1 gap-2">
            <label className="relative flex min-w-0 flex-1 items-center rounded-[16px] border border-white/[0.07] bg-card p-1 transition-colors duration-150 focus-within:border-white/[0.16] hover:border-white/[0.11]">
              <span className="sr-only">Talep başlığında ara</span>
              <Search className="pointer-events-none absolute left-4 size-4 text-white/35" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                placeholder="Talep başlığında ara"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchTerm) {
                    e.preventDefault();
                    setSearchTerm('');
                  }
                }}
                className="peer h-10 w-full rounded-[12px] bg-transparent pl-9 pr-10 text-[13.5px] text-white outline-none placeholder:text-white/35"
              />
              {searchTerm ? (
                <button
                  type="button"
                  aria-label="Aramayı temizle"
                  onClick={() => {
                    setSearchTerm('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-2.5 flex size-7 items-center justify-center rounded-[8px] text-white/45 transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-4 flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-white/10 px-1 font-sans text-[11px] text-white/35 transition-opacity duration-150 peer-focus:opacity-0">
                  /
                </kbd>
              )}
            </label>
            <div className="shrink-0 rounded-[16px] border border-white/[0.07] bg-card p-1">
              <StatusMenu
                value={statusFilter}
                onChange={setStatusFilter}
                counts={statusCounts.counts}
                total={statusCounts.total}
              />
            </div>
          </div>
        </div>

        {filtersActive && !query.isLoading ? (
          <div className="flex items-center gap-3 px-1 text-[12.5px] text-white/45">
            <span>
              <span className="tabular-nums text-white/75">{rows.length}</span> sonuç
            </span>
            <Dot />
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-brand transition-colors duration-150 hover:text-[#e4c43c]"
            >
              Filtreleri temizle
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Liste. overflow-clip (hidden değil): sütun başlığı kayarken üstte yapışık kalabilsin. ── */}
      <section className="texture-host relative overflow-clip rounded-[22px] border border-white/[0.07] bg-card">
        {/* Üstteki özet kutusunun dokusu buraya da iner: yukarıda belirgin, aşağı doğru söner (degrade yok). */}
        <span aria-hidden className="tile-texture tile-texture-down" />
        <div
          aria-hidden
          className={`sticky top-0 z-[3] hidden border-b border-hairline bg-card/75 px-6 py-3 text-[12px] font-medium text-white/40 backdrop-blur-md ${COLS}`}
        >
          <span>Talep</span>
          <span>Departman</span>
          <span className="text-right">Kalem</span>
          <span>Durum</span>
          <span />
        </div>

        <Swap loading={query.isLoading} skeleton={<SkeletonRows rows={7} />}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-white/10">
              <SearchX className="h-5 w-5 text-white/35" strokeWidth={1.7} />
            </div>
            <p className="text-[15px] font-medium text-white">Kayıt bulunamadı</p>
            <p className="mt-1 text-[13.5px] text-white/45">Arama kriterlerinize uygun talep yok.</p>
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="press mt-5 h-10 rounded-[11px] border border-white/12 px-4 text-[13.5px] font-medium text-white/80 transition-colors duration-150 hover:border-white/25 hover:text-white"
              >
                Filtreleri temizle
              </button>
            ) : null}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {rows.map((row) => {
              const handed =
                row.purchasingResponsibleModuleId === 'SATIN_ALMA' && row.moduleId !== 'SATIN_ALMA';
              const pending = (row.handovers || []).some((item) => item.status === 'PENDING');
              const offerTakeover =
                canTakeover &&
                !handed &&
                !pending &&
                !CLOSED.has(row.status) &&
                (row.moduleId === 'URETIM_PLANLAMA' || row.moduleId === 'YEDEK_PARCA');
              const moduleName = row.moduleId ? MODULE_LABEL[row.moduleId] || 'Departman' : '—';
              const itemCount = row.items?.length || 0;
              return (
                <div
                  key={row.id}
                  className={`sg-rest group/row relative flex flex-col gap-2.5 px-6 py-3 transition-colors duration-150 hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${COLS}`}
                >
                  {/* Satırın tamamı bağlantı; devral düğmesi bunun üstünde ayrı durur. */}
                  <Link
                    href={`/procurement/${row.id}`}
                    aria-label={`${row.title} talebini aç`}
                    className="absolute inset-0 z-[1] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-y-2.5 left-0 w-[2px] origin-center scale-y-0 rounded-r-full bg-brand transition-transform duration-200 ease-out group-hover/row:scale-y-100"
                  />

                  {/* Talep: başlık + künye */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-white">{row.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/40">
                      <span className="text-white/60 xl:hidden">{moduleName}</span>
                      <Dot className="xl:hidden" />
                      {row.createdBy?.name ? (
                        <>
                          <span>{row.createdBy.name}</span>
                          <Dot />
                        </>
                      ) : null}
                      {row.createdAt ? (
                        <span className="tabular-nums">
                          {format(new Date(row.createdAt), 'dd MMM yyyy', { locale: tr })}
                        </span>
                      ) : null}
                      <Dot className="xl:hidden" />
                      <span className="xl:hidden">
                        <span className="tabular-nums text-white/60">{itemCount}</span> kalem
                      </span>
                      {handed ? (
                        <>
                          <Dot />
                          <span className="font-medium text-[#5cc98f]">Satın Alma&apos;da</span>
                        </>
                      ) : null}
                      {pending ? (
                        <>
                          <Dot />
                          <span className="font-medium text-[#f2a93b]">Devir isteği bekliyor</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <span className="hidden truncate text-[13px] text-white/70 xl:block">{moduleName}</span>
                  <span className="hidden text-right text-[13px] tabular-nums text-white/70 xl:block">{itemCount}</span>

                  {/* Durum + işlem: dar ekranda sağda bir grup, genişte kendi sütunları */}
                  <div className="flex shrink-0 items-center gap-4 xl:contents">
                    <span
                      className="inline-flex min-w-0 items-center gap-2.5 text-[12.5px] font-medium"
                      style={{ color: statusTone(row.status) }}
                    >
                      <span className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/row:scale-110">
                        <StatusMark status={row.status} large />
                      </span>
                      <span className="truncate">{procurementStatusLabel(row.status)}</span>
                    </span>
                    {offerTakeover ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNote('');
                          setTakeoverId(row.id);
                        }}
                        className="press relative z-[2] inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border border-brand/45 px-3 text-[12.5px] font-medium text-brand transition-colors duration-150 hover:border-transparent hover:bg-brand hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 xl:justify-self-end"
                      >
                        <ArrowLeftRight className="size-3.5" />
                        Satın almayı devral
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </Swap>
      </section>

      <Dialog
        open={takeoverId !== null}
        onOpenChange={(open) => {
          if (!open && !takeover.isPending) {
            setTakeoverId(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="max-w-md rounded-[22px] border border-white/[0.07] bg-card p-6 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-[17px] font-medium tracking-[-0.012em] text-white">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-brand text-primary-foreground">
                <ArrowLeftRight className="size-4" />
              </span>
              Satın almayı devral
            </DialogTitle>
            <DialogDescription className="pt-1 text-[13px] leading-relaxed text-white/55">
              {target?.title
                ? `«${target.title}» için istek departman yetkilisine gider.`
                : 'İstek departman yetkilisine gider.'}
            </DialogDescription>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-white/70">
            Kabul ederse satın alma Satın Alma'da devam eder. Kalemler, gelen teklifler ve ek dosyalar aynı kayıtta kalır.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Not (isteğe bağlı)"
            className="min-h-[88px] resize-none rounded-[11px] border-white/[0.08] bg-white/[0.03] text-[13.5px] placeholder:text-white/35 focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/25"
          />
          <p className="text-[12px] leading-relaxed text-white/40">
            Not isteğe bağlıdır ve istekle birlikte departman yetkilisine gider.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={takeover.isPending}
              onClick={() => {
                setTakeoverId(null);
                setNote('');
              }}
              className="press h-10 rounded-[11px] border-white/12 bg-transparent px-4 text-[13.5px] font-medium text-white/80 hover:border-white/25 hover:bg-transparent hover:text-white"
            >
              İptal
            </Button>
            <Button
              disabled={takeover.isPending || !takeoverId}
              onClick={() => takeover.mutate()}
              className="press h-10 rounded-[11px] bg-brand px-4 text-[13.5px] font-medium text-primary-foreground hover:bg-[#e4c43c]"
            >
              {takeover.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              İsteği gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
