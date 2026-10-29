'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, internalRequestsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react';
import { PURCHASING_MANAGER_BOARD_STEPS, PURCHASING_STAFF_BOARD_STEPS } from '@/lib/requestPipeline';
import { isUnitRequestManager } from '@/lib/access';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  BoardHero,
  PrimaryLink,
  RequestKanban,
  type BoardPage,
  type RequestRow,
} from '@/components/requests/RequestBoard';

type Department = { id: string; name: string; requestCount?: number };

/** Arama ve birim düğmesinin ortak kutusu: formdaki alanlarla aynı dil. */
const box =
  'h-11 rounded-[12px] border border-white/[0.08] bg-white/[0.03] text-[14px] text-white outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-brand/35';

/**
 * Birim seçici: kalabalık birim listesinde düğme şeridi yerine aranabilir, çoklu seçimli açılır
 * liste. Talebi olan birimler üstte; satıra basmak seçimi değiştirir, liste açık kalır.
 */
function UnitPicker({
  departments,
  selected,
  onChange,
  loading,
}: {
  departments: Department[];
  selected: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const list = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase('tr-TR');
    return [...departments]
      .filter((d) => !needle || d.name.toLocaleLowerCase('tr-TR').includes(needle))
      .sort((a, b) => (b.requestCount ?? 0) - (a.requestCount ?? 0) || a.name.localeCompare(b.name, 'tr'));
  }, [departments, filter]);

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  const summary = !selected.length ? 'Tüm birimler' : selected.length === 1 ? selected[0] : `${selected.length} birim`;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          box,
          'flex w-full items-center gap-2.5 px-3.5 sm:w-[260px] focus-visible:border-brand/60',
          open && 'border-brand/50 bg-white/[0.05]',
        )}
      >
        <span className="shrink-0 text-[13px] text-white/45">Birim</span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{summary}</span>
        {selected.length ? (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11.5px] font-semibold tabular-nums text-primary-foreground">
            {selected.length}
          </span>
        ) : null}
        <ChevronDown className={cn('size-4 shrink-0 text-white/40 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="status-menu absolute right-0 top-[calc(100%+8px)] z-40 flex w-[min(360px,calc(100vw-32px))] flex-col rounded-[16px] border border-white/[0.08] bg-[#1b1b1e] p-1.5 shadow-[var(--shadow-float)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Birim ara"
              aria-label="Birim ara"
              className="h-10 w-full rounded-[10px] bg-white/[0.04] pl-9 pr-3 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:bg-white/[0.06]"
            />
          </div>
          <ul role="listbox" aria-multiselectable aria-label="Birimler" className="mt-1.5 max-h-[320px] overflow-y-auto">
            {loading ? (
              <li className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin text-white/40" />
              </li>
            ) : list.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-white/40">Birim bulunamadı</li>
            ) : (
              list.map((d) => {
                const on = selected.includes(d.name);
                const n = d.requestCount ?? 0;
                return (
                  <li
                    key={d.id}
                    role="option"
                    aria-selected={on}
                    tabIndex={0}
                    onClick={() => toggle(d.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(d.name);
                      }
                    }}
                    className="flex h-10 cursor-pointer select-none items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] outline-none transition-colors duration-100 hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150',
                        on ? 'border-brand bg-brand text-primary-foreground' : 'border-white/25',
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate', n || on ? 'text-white' : 'text-white/45')}>{d.name}</span>
                    <span className="text-[12px] tabular-nums text-white/35">{n}</span>
                  </li>
                );
              })
            )}
          </ul>
          <div className="mt-1.5 flex items-center justify-between border-t border-hairline px-1 pt-1.5">
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => onChange([])}
              className="h-9 rounded-[9px] px-3 text-[13px] font-medium text-white/60 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-35"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press h-9 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-[#e4c43c]"
            >
              Tamam
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function InternalRequestsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const canDeleteAny = user?.role === 'ADMIN' || Boolean(user?.isExecutive);
  const isManager = isUnitRequestManager(user);
  const boardSteps = isManager ? PURCHASING_MANAGER_BOARD_STEPS : PURCHASING_STAFF_BOARD_STEPS;
  const [selected, setSelected] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RequestRow | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => internalRequestsApi.remove(id),
    onSuccess: () => {
      toast.success('Talep silindi');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['sa-inbox-board'] });
      qc.invalidateQueries({ queryKey: ['sa-inbox-counts'] });
      qc.invalidateQueries({ queryKey: ['internal-requests'] });
      qc.invalidateQueries({ queryKey: ['org-departments'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Silme işlemi başarısız');
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // "/" ile aramaya geçilir (bir alana yazarken değil).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const departmentsQuery = useQuery({
    queryKey: ['org-departments'],
    queryFn: async () => (await departmentsApi.getAll()).data as Department[],
  });
  const departments = departmentsQuery.data || [];

  const countsQuery = useQuery({
    queryKey: ['sa-inbox-counts', selected.join('|'), q],
    retry: 1,
    queryFn: async () => (await internalRequestsApi.boardCounts(selected, q || undefined)).data as Record<string, number>,
  });
  const counts = countsQuery.data || {};

  return (
    <div className="mx-auto flex h-[calc(100dvh-10.5rem)] min-h-[560px] max-w-[1600px] flex-col">
      <BoardHero
        title="Birim tedarik talepleri"
        action={
          <PrimaryLink
            href={isManager ? '/taleplerim/yeni' : '/procurement/new'}
            tour="inbox-new"
            icon={<Plus className="size-[18px]" strokeWidth={1.9} />}
          >
            {isManager ? 'Yeni birim talebi' : 'Yetkiliye talep'}
          </PrimaryLink>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Süzgeç: geniş arama ve aranabilir birim seçici; seçilen birimler altta etiket. */}
        <div data-tour="inbox-filters" className="shrink-0 space-y-2.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchInput('');
                }}
                placeholder="Başlık, birim, e-posta veya ürün ara"
                aria-label="Talep ara"
                className={cn(box, 'w-full pl-10 pr-10 placeholder:text-white/30 focus:border-brand/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-brand/15')}
              />
              {searchInput ? (
                <button
                  type="button"
                  aria-label="Aramayı temizle"
                  onClick={() => {
                    setSearchInput('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-[6px] border border-white/10 px-1.5 py-px text-[11px] text-white/35 sm:block">
                  /
                </kbd>
              )}
            </div>
            <UnitPicker
              departments={departments}
              selected={selected}
              onChange={setSelected}
              loading={departmentsQuery.isLoading}
            />
          </div>

          {selected.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelected((prev) => prev.filter((n) => n !== name))}
                  title="Süzgeçten çıkar"
                  className="press group/chip flex max-w-full items-center gap-1.5 rounded-full bg-brand py-1 pl-3 pr-1.5 text-[12.5px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-[#e4c43c]"
                >
                  <span className="truncate">{name}</span>
                  <span className="flex size-5 items-center justify-center rounded-full bg-black/10 transition-colors group-hover/chip:bg-black/20">
                    <X className="size-3" />
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected([])}
                className="h-7 rounded-full px-2.5 text-[12.5px] font-medium text-white/50 transition-colors duration-150 hover:text-brand"
              >
                Temizle
              </button>
            </div>
          ) : null}

          {!departments.length && !departmentsQuery.isLoading && isAdmin ? (
            <p className="text-[12.5px] text-white/40">
              Henüz birim yok ·{' '}
              <Link href="/settings/departments" className="text-brand hover:text-[#e4c43c]">
                Ayarlardan ekleyin
              </Link>
            </p>
          ) : null}
        </div>

        {countsQuery.isError ? (
          <p className="shrink-0 rounded-[14px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
            Pano yüklenemedi. Sayfayı yenileyin; sürerse API&apos;yi yeniden başlatın.
          </p>
        ) : null}

        <RequestKanban
          tour="inbox-board"
          steps={boardSteps}
          counts={counts}
          loading={countsQuery.isLoading}
          queryKeyFor={(stage) => ['sa-inbox-board', stage, selected.join('|'), q]}
          fetchPage={async (stage, cursor) =>
            (await internalRequestsApi.boardColumn(stage, cursor, selected, q || undefined)).data as BoardPage
          }
          hrefFor={(row) => `/internal-requests/${row.id}`}
          canDelete={canDeleteAny}
          onDelete={setDeleteTarget}
        />
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !deleteMut.isPending && !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Talebi sil</DialogTitle>
            <DialogDescription className="leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{deleteTarget?.title}</span> kalıcı olarak
              silinecek. Yazışmalar ve ekler de kaldırılır. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Siliniyor…
                </>
              ) : (
                'Evet, sil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
