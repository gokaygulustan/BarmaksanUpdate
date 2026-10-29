'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  Search,
  Trash2,
} from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DocumentTitle } from '@/components/DocumentTitle';
import { SkeletonRows } from '@/components/page/Skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Note = {
  id: string;
  kind?: string | null;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
};

type NoteList = {
  items: Note[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
};

type KindFilter = '' | 'ALERT' | 'MESSAGE';
type StatusFilter = '' | 'unread' | 'read';

const PAGE_SIZE = 25;

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: '', label: 'Tümü' },
  { key: 'ALERT', label: 'Bildirimler' },
  { key: 'MESSAGE', label: 'Mesajlar' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: '', label: 'Hepsi' },
  { key: 'unread', label: 'Okunmamış' },
  { key: 'read', label: 'Okunmuş' },
];

function FilterChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border/60 bg-background/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.key || 'all'}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            value === o.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<KindFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [kind, status, qDebounced]);

  const listQuery = useQuery({
    queryKey: ['notifications-list', kind, status, qDebounced, page],
    queryFn: async () => {
      const { data } = await notificationsApi.list({
        page,
        pageSize: PAGE_SIZE,
        kind: kind || undefined,
        status: status || undefined,
        q: qDebounced || undefined,
      });
      return data as NoteList;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const unreadCount = listQuery.data?.unreadCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPageSelected = items.length > 0 && items.every((n) => selected.has(n.id));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications-list'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const onError = (e: any) => toast.error(e?.response?.data?.message || 'İşlem yapılamadı.');

  const toggleRead = useMutation({
    mutationFn: (n: Note) => (n.isRead ? notificationsApi.markAsUnread(n.id) : notificationsApi.markAsRead(n.id)),
    onSuccess: refresh,
    onError,
  });

  const removeOne = useMutation({
    mutationFn: (id: string) => notificationsApi.remove(id),
    onSuccess: (_r, id) => {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    },
    onError,
  });

  const bulkRead = useMutation({
    mutationFn: (isRead: boolean) => notificationsApi.markMany([...selected], isRead),
    onSuccess: () => {
      setSelected(new Set());
      refresh();
    },
    onError,
  });

  const bulkRemove = useMutation({
    mutationFn: () => notificationsApi.removeMany([...selected]),
    onSuccess: (res) => {
      toast.success(`${res.data?.count ?? selected.size} bildirim silindi.`);
      setSelected(new Set());
      refresh();
    },
    onError,
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(kind || undefined),
    onSuccess: refresh,
    onError,
  });

  const openNote = async (n: Note) => {
    if (!n.link) return;
    if (!n.isRead) {
      try {
        await notificationsApi.markAsRead(n.id);
      } catch {
        /* ignore */
      }
      refresh();
    }
    router.push(n.link);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) items.forEach((n) => next.delete(n.id));
      else items.forEach((n) => next.add(n.id));
      return next;
    });

  const bulkBusy = bulkRead.isPending || bulkRemove.isPending;

  return (
    <div className="space-y-4">
      <DocumentTitle topic="Tüm bildirimler" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground"><SmokeText text="Tüm bildirimler" /></h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : 'Okunmamış bildirim yok'} · toplam{' '}
            {total} kayıt (filtreye göre)
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={markAll.isPending || unreadCount === 0}
          onClick={() => markAll.mutate()}
        >
          {markAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          Tümünü okundu say
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card/60 shadow-lg">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
          <FilterChips value={kind} options={KIND_FILTERS} onChange={setKind} />
          <FilterChips value={status} options={STATUS_FILTERS} onChange={setStatus} />
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Bildirim metninde ara…"
              className="border-border bg-background/40 pl-9"
            />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-semibold text-foreground">{selected.size} seçili</span>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => bulkRead.mutate(true)}>
              <MailOpen className="h-3.5 w-3.5" /> Okundu yap
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => bulkRead.mutate(false)}>
              <Mail className="h-3.5 w-3.5" /> Okunmadı yap
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={bulkBusy}
              onClick={() => bulkRemove.mutate()}
            >
              <Trash2 className="h-3.5 w-3.5" /> Sil
            </Button>
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(new Set())}
            >
              Seçimi temizle
            </button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  aria-label="Sayfadakileri seç"
                  className="h-4 w-4 accent-[hsl(48,71%,50%)]"
                  checked={allOnPageSelected}
                  onChange={toggleSelectPage}
                />
              </TableHead>
              <TableHead className="w-36 text-muted-foreground">Tarih</TableHead>
              <TableHead className="w-28 text-muted-foreground">Tür</TableHead>
              <TableHead className="text-muted-foreground">Bildirim</TableHead>
              <TableHead className="w-24 text-muted-foreground">Durum</TableHead>
              <TableHead className="w-32 pr-4 text-right text-muted-foreground">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <SkeletonRows rows={6} />
                </TableCell>
              </TableRow>
            )}
            {!listQuery.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  Bu filtrede bildirim yok.
                </TableCell>
              </TableRow>
            )}
            {items.map((n) => {
              const isMessage = n.kind === 'MESSAGE';
              const Icon = isMessage ? MessageSquare : Bell;
              const created = new Date(n.createdAt);
              return (
                <TableRow
                  key={n.id}
                  className={cn('skel-in border-border/40', !n.isRead && 'bg-primary/[0.06]')}
                >
                  <TableCell className="pl-4">
                    <input
                      type="checkbox"
                      aria-label="Seç"
                      className="h-4 w-4 accent-[hsl(48,71%,50%)]"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="tabular-nums text-foreground/85">
                      {format(created, 'd MMM yyyy HH:mm', { locale: tr })}
                    </div>
                    <div>{formatDistanceToNow(created, { addSuffix: true, locale: tr })}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {isMessage ? 'Mesaj' : 'Bildirim'}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <button
                      type="button"
                      disabled={!n.link}
                      onClick={() => openNote(n)}
                      className={cn(
                        'text-left text-sm leading-snug',
                        n.isRead ? 'text-foreground/80' : 'font-semibold text-foreground',
                        n.link ? 'hover:text-primary' : 'cursor-default',
                      )}
                    >
                      {n.message}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        n.isRead
                          ? 'border-border text-muted-foreground'
                          : 'border-primary/40 bg-primary/15 text-primary',
                      )}
                    >
                      {n.isRead ? 'Okundu' : 'Yeni'}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Aç"
                        disabled={!n.link}
                        onClick={() => openNote(n)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={n.isRead ? 'Okunmadı yap' : 'Okundu yap'}
                        disabled={toggleRead.isPending}
                        onClick={() => toggleRead.mutate(n)}
                      >
                        {n.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Sil"
                        disabled={removeOne.isPending}
                        onClick={() => removeOne.mutate(n.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Sayfa {page} / {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Önceki
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Sonraki <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
