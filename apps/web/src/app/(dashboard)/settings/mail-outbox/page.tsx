'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, Loader2, Mail, MailWarning, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { mailOutboxApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DocumentTitle } from '@/components/DocumentTitle';
import { toast } from 'sonner';
import {
  EmptyState,
  IconButton,
  PageHeader,
  revealClass,
  SearchField,
  SecondaryButton,
  SecondaryLink,
  Segmented,
  SelectMenu,
  Skeleton,
  StatusChip,
  Swap,
  Tile,
} from '@/components/page/Page';

/**
 * Chromium, srcDoc iframe'deki <title> ile sekme başlığını çalıyor; bazı kayıtlarda
 * sayfa da yeniden bağlanıp "Açılıyor…"da kalıyor. Gövdeyi alıp boş başlıklı
 * sarmalayıcıya koyuyoruz.
 */
function iframePreviewHtml(html: string) {
  const raw = String(html || '');
  const body = raw.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const inner = (body ? body[1] : raw)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/cid:up-logo@ugurpromilling/g, '/logo.png');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title> </title></head><body style="margin:0">${inner}</body></html>`;
}

type OutboxItem = {
  id: string;
  channel: string | null;
  status: string;
  skipReason: string | null;
  to: string;
  cc: string | null;
  subject: string;
  plainSnippet: string | null;
  messageId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type OutboxList = {
  items: OutboxItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; SENT: number; SKIPPED: number; FAILED: number; PREVIEW: number };
  channelCounts: Record<string, number>;
  channelLabels: Record<string, string>;
};

type OutboxDetail = OutboxItem & {
  htmlBody: string | null;
  textBody: string | null;
  bcc: string | null;
  channelLabel?: string;
  meta?: { preview?: boolean; replyTo?: string } | null;
};

type StatusKey = '' | 'SENT' | 'SKIPPED' | 'FAILED' | 'PREVIEW';

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: '', label: 'Tümü' },
  { key: 'SENT', label: 'Gönderildi' },
  { key: 'SKIPPED', label: 'Atlandı' },
  { key: 'FAILED', label: 'Hata' },
  { key: 'PREVIEW', label: 'Önizleme' },
];

/** StatusGlyph anahtarı: gönderildi kâğıt uçak, atlandı geri ok, hata uyarı, önizleme taslak. */
function statusGlyph(status: string) {
  if (status === 'SENT') return 'MAIL_SENT';
  if (status === 'SKIPPED') return 'MAIL_SKIPPED';
  if (status === 'FAILED') return 'MAIL_FAILED';
  return 'MAIL_PREVIEW';
}

function statusLabel(status: string) {
  if (status === 'SENT') return 'Gönderildi';
  if (status === 'SKIPPED') return 'Atlandı';
  if (status === 'FAILED') return 'Hata';
  if (status === 'PREVIEW') return 'Önizleme';
  return status;
}

function skipReasonLabel(reason: string) {
  if (reason === 'channel_off') return 'Kanal kapalı, SMTP’ye gönderilmedi';
  if (reason === 'missing_channel') return 'Kanal belirtilmedi';
  if (reason === 'preview_only') return 'Önizleme, SMTP’ye gönderilmedi';
  return reason;
}

function shortTo(to: string) {
  const first = String(to || '')
    .split(',')[0]
    ?.trim();
  if (!first) return '—';
  const m = first.match(/<([^>]+)>/);
  return m ? m[1] : first;
}

/** Liste yüklenirken: gerçek satırlarla aynı yoğunlukta iskelet. */
function ListSkeleton() {
  return (
    <div aria-hidden className="divide-y divide-hairline">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="mt-0.5 size-6 rounded-full" style={{ '--i': i } as React.CSSProperties} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 rounded-full" style={{ '--i': i, width: `${56 - (i % 4) * 8}%` } as React.CSSProperties} />
            <Skeleton className="h-2.5 w-4/5 rounded-full opacity-70" style={{ '--i': i + 1 } as React.CSSProperties} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mail açılırken: başlık, künye ve gövde iskeleti. */
function ReaderSkeleton() {
  return (
    <div aria-hidden className="space-y-5 p-5">
      <div className="space-y-3">
        <Skeleton className="h-5 w-3/5 rounded-full" />
        <Skeleton className="h-3 w-2/5 rounded-full opacity-70" style={{ '--i': 1 } as React.CSSProperties} />
      </div>
      <Skeleton className="h-[46dvh] w-full rounded-[14px]" style={{ '--i': 2 } as React.CSSProperties} />
    </div>
  );
}

export default function MailOutboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<StatusKey>('');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; subject: string } | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, router]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [status, channel, qDebounced]);

  const listQuery = useQuery({
    queryKey: ['mail-outbox', status, channel, qDebounced, page],
    queryFn: async () => {
      const { data } = await mailOutboxApi.list({
        status: status || undefined,
        channel: channel || undefined,
        q: qDebounced || undefined,
        page,
        pageSize: 40,
      });
      return data as OutboxList;
    },
    enabled: Boolean(user && user.role === 'ADMIN'),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const data = listQuery.data;
  const items = data?.items ?? [];
  // '' = kullanıcı listeye döndü (mobil); null = henüz seçilmedi, ilk kayıt açılır.
  const activeId =
    selectedId === ''
      ? null
      : selectedId && items.some((i) => i.id === selectedId)
        ? selectedId
        : items[0]?.id || null;

  const detailQuery = useQuery({
    queryKey: ['mail-outbox-detail', activeId],
    queryFn: async () => {
      const { data: d } = await mailOutboxApi.getById(activeId!);
      return d as OutboxDetail;
    },
    enabled: Boolean(user && user.role === 'ADMIN' && activeId),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Başka bir maile geçince ayrıntılar yeniden kapanır.
  useEffect(() => {
    setShowDetails(false);
  }, [activeId]);

  const counts = data?.counts || { all: 0, SENT: 0, SKIPPED: 0, FAILED: 0, PREVIEW: 0 };
  const channelLabels = data?.channelLabels || {};
  const channelCounts = data?.channelCounts || {};

  const seedMutation = useMutation({
    mutationFn: () => mailOutboxApi.seedPreviews(),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Örnek şablonlar eklendi.');
      setStatus('PREVIEW');
      setChannel('');
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['mail-outbox'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Önizlemeler yazılamadı.');
    },
  });

  const clearPreviewsMutation = useMutation({
    mutationFn: () => mailOutboxApi.clearPreviews(),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Örnek şablonlar silindi.');
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['mail-outbox'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Örnek şablonlar silinemedi.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mailOutboxApi.remove(id),
    onSuccess: (_res, id) => {
      toast.success('Kayıt silindi.');
      setDeleteTarget(null);
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        return items.find((i) => i.id !== id)?.id ?? null;
      });
      queryClient.invalidateQueries({ queryKey: ['mail-outbox'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Silinemedi.');
    },
  });

  const askDelete = (id: string, subject?: string) => {
    setDeleteTarget({ id, subject: subject || 'Bu kayıt' });
  };

  const channelEntries = useMemo(() => {
    const keys = Object.keys(channelLabels);
    const extras = Object.keys(channelCounts).filter((k) => !keys.includes(k));
    return [...keys, ...extras].map((key) => ({
      key,
      label: channelLabels[key] || key,
      count: channelCounts[key] || 0,
    }));
  }, [channelLabels, channelCounts]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 40)));
  const detail = detailQuery.data;
  const channelName = (key: string | null) => channelLabels[key || ''] || key || 'Sistem';

  /** Ok tuşlarıyla listede gezinme (e-posta uygulamalarındaki gibi). */
  const stepSelection = (delta: number) => {
    if (!items.length) return;
    const idx = Math.max(0, items.findIndex((i) => i.id === activeId));
    const next = items[Math.min(items.length - 1, Math.max(0, idx + delta))];
    if (next) setSelectedId(next.id);
  };

  if (user && user.role !== 'ADMIN') return null;

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <DocumentTitle topic="Mail günlüğü" />
      <PageHeader
        title="Mail günlüğü"
        description="Sistemin ürettiği e-postalar: gönderilen, atlanan ve hata verenler."
        actions={
          <>
            <SecondaryButton
              icon={
                seedMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" strokeWidth={1.8} />
              }
              disabled={seedMutation.isPending}
              onClick={() => seedMutation.mutate()}
            >
              Örnek şablonlar
            </SecondaryButton>
            <IconButton
              label="Örnek şablonları kaldır"
              tone="danger"
              className="size-11 rounded-[11px] border border-white/[0.1]"
              disabled={clearPreviewsMutation.isPending || seedMutation.isPending}
              onClick={() => clearPreviewsMutation.mutate()}
            >
              {clearPreviewsMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </IconButton>
            <SecondaryLink href="/settings/mail" icon={<Settings2 className="size-4" strokeWidth={1.8} />}>
              SMTP ayarları
            </SecondaryLink>
          </>
        }
      />

      {/* Süzgeç tek satırda: durum (kapsül), kanal (menü), arama. Eskiden bir kenar sütunuydu. */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
          <Segmented<StatusKey>
            label="Durum"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTERS.map((f) => ({
              value: f.key,
              label: f.label,
              count: f.key === '' ? counts.all : counts[f.key] || 0,
            }))}
          />
        </div>
        {channelEntries.length ? (
          <SelectMenu
            label="Kanal"
            value={channel}
            onChange={setChannel}
            active={Boolean(channel)}
            className="lg:w-52"
            options={[
              { value: '', label: 'Tüm kanallar' },
              ...channelEntries.map((c) => ({
                value: c.key,
                label: c.label,
                hint: c.count ? c.count.toLocaleString('tr-TR') : undefined,
              })),
            ]}
          />
        ) : null}
        <SearchField value={q} onChange={setQ} placeholder="Alıcı veya konu ara" label="Mail ara" className="lg:ml-auto lg:w-[320px]" />
      </div>

      {/* İki bölme: liste · okuma. Dar ekranda ikisi yer değiştirir. */}
      <Tile className="texture-host flex flex-col lg:h-[calc(100dvh-16.5rem)] lg:min-h-[520px] lg:flex-row">
        <span aria-hidden className="tile-texture tile-texture-down" />
        <section
          className={cn(
            'relative flex min-h-0 min-w-0 flex-col border-hairline',
            activeId ? 'hidden lg:flex lg:w-[390px] lg:shrink-0 lg:border-r xl:w-[430px]' : 'flex flex-1',
          )}
        >
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto max-lg:max-h-[70dvh]"
            tabIndex={0}
            aria-label="Mail listesi"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                stepSelection(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                stepSelection(-1);
              }
            }}
          >
            {listQuery.isError ? (
              <EmptyState icon={<MailWarning />} title="Liste alınamadı" body="Sayfayı yenileyin; sürerse API'yi yeniden başlatın." />
            ) : (
              <Swap loading={listQuery.isPending} skeleton={<ListSkeleton />} className="flex-1">
                {items.length === 0 ? (
                  <EmptyState
                    icon={<Mail />}
                    title="Kayıt yok"
                    body="Sistem mail ürettiğinde, gönderilse de atlansa da, burada görünür."
                  />
                ) : (
                  <ul className="divide-y divide-hairline">
                    {items.map((item) => {
                      const active = activeId === item.id;
                      return (
                        <li key={item.id} className="group/row relative">
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            aria-current={active ? 'true' : undefined}
                            className={cn(
                              'relative flex w-full items-start gap-3 py-3 pl-4 pr-11 text-left outline-none transition-colors duration-150 hover:bg-white/[0.035] focus-visible:bg-white/[0.05]',
                              active && 'bg-white/[0.06] hover:bg-white/[0.06]',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'absolute inset-y-2.5 left-0 w-[2px] origin-center rounded-r-full bg-brand transition-transform duration-300 ease-out',
                                active ? 'scale-y-100' : 'scale-y-0 group-hover/row:scale-y-100',
                              )}
                            />
                            <StatusChip status={statusGlyph(item.status)} size="sm" className="mt-0.5" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white">{shortTo(item.to)}</span>
                                <span className="shrink-0 text-[11.5px] tabular-nums text-white/38">
                                  {format(new Date(item.createdAt), 'd MMM HH:mm', { locale: tr })}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[12.5px] text-white/60">{item.subject}</span>
                            </span>
                          </button>
                          <IconButton
                            label="Sil"
                            tone="danger"
                            disabled={deleteMutation.isPending}
                            className={cn('absolute right-2 top-2.5 size-7', revealClass)}
                            onClick={() => askDelete(item.id, item.subject)}
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Swap>
            )}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
              <SecondaryButton className="h-8 rounded-[9px] px-3 text-[13px]" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Önceki
              </SecondaryButton>
              <span className="text-[12.5px] tabular-nums text-white/45">
                {page} / {totalPages}
              </span>
              <SecondaryButton className="h-8 rounded-[9px] px-3 text-[13px]" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sonraki
              </SecondaryButton>
            </div>
          ) : null}
        </section>

        {activeId ? (
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {detailQuery.isError && !detailQuery.isPending ? (
              <EmptyState
                icon={<MailWarning />}
                title="Bu kayıt açılamadı"
                action={<SecondaryButton onClick={() => detailQuery.refetch()}>Yeniden dene</SecondaryButton>}
              />
            ) : (
              <Swap loading={detailQuery.isPending || !detail} skeleton={<ReaderSkeleton />} className="flex min-h-0 flex-1 flex-col" innerClassName="flex min-h-0 flex-1 flex-col">
                {detail ? (
                  <>
                    <div className="flex items-start gap-3 px-5 pb-3 pt-4">
                      <IconButton label="Listeye dön" className="-ml-2 lg:hidden" onClick={() => setSelectedId('')}>
                        <ChevronLeft className="size-5" />
                      </IconButton>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[16.5px] font-medium leading-snug tracking-[-0.012em] text-white">{detail.subject}</h2>
                        <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-white/45">
                          <StatusChip status={statusGlyph(detail.status)} label={statusLabel(detail.status)} />
                          <span className="tabular-nums">{format(new Date(detail.createdAt), 'd MMMM yyyy, HH:mm', { locale: tr })}</span>
                          <span aria-hidden className="text-white/20">
                            ·
                          </span>
                          <span>{detail.channelLabel || channelName(detail.channel)}</span>
                        </p>
                      </div>
                      <IconButton
                        label="Kaydı sil"
                        tone="danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => askDelete(detail.id, detail.subject)}
                      >
                        {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </IconButton>
                    </div>

                    {/* Önemli durumlar hep görünür: neden atlandı, ne hata verdi. */}
                    {detail.skipReason || detail.errorMessage ? (
                      <div className="mx-5 mb-3 space-y-1 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] leading-relaxed">
                        {detail.skipReason ? <p className="text-brand-ink">{skipReasonLabel(detail.skipReason)}</p> : null}
                        {detail.errorMessage ? <p className="break-all text-[#f2705e]">{detail.errorMessage}</p> : null}
                      </div>
                    ) : null}

                    {/* Künye: bir satır özet; ayrıntılar isteyene açılır. */}
                    <div className="border-y border-hairline px-5 py-2.5">
                      <button
                        type="button"
                        onClick={() => setShowDetails((v) => !v)}
                        aria-expanded={showDetails}
                        className="group/det flex w-full items-center gap-2 text-left text-[12.5px] outline-none"
                      >
                        <span className="shrink-0 text-white/40">Kime</span>
                        <span className="min-w-0 flex-1 truncate text-white/85">{detail.to}</span>
                        <span className="flex shrink-0 items-center gap-1 text-white/40 transition-colors duration-150 group-hover/det:text-white">
                          Ayrıntılar
                          <ChevronDown className={cn('size-3.5 transition-transform duration-300', showDetails && 'rotate-180')} />
                        </span>
                      </button>
                      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', showDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                        <dl className="grid min-h-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 overflow-hidden text-[12.5px]">
                          <dt className="pt-2 text-white/40">Kime</dt>
                          <dd className="break-all pt-2 text-white/85">{detail.to}</dd>
                          {detail.cc ? (
                            <>
                              <dt className="text-white/40">Cc</dt>
                              <dd className="break-all text-white/85">{detail.cc}</dd>
                            </>
                          ) : null}
                          {typeof detail.meta?.replyTo === 'string' && detail.meta.replyTo ? (
                            <>
                              <dt className="text-white/40">Yanıtla</dt>
                              <dd className="break-all text-white/85">{detail.meta.replyTo}</dd>
                            </>
                          ) : null}
                          {detail.messageId ? (
                            <>
                              <dt className="text-white/40">Msg-ID</dt>
                              <dd className="break-all pb-1 font-mono text-[11.5px] text-white/45">{detail.messageId}</dd>
                            </>
                          ) : null}
                        </dl>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col p-4">
                      {detail.htmlBody ? (
                        <iframe
                          key={detail.id}
                          title="Mail önizleme"
                          sandbox=""
                          srcDoc={iframePreviewHtml(detail.htmlBody)}
                          className="min-h-[60dvh] w-full flex-1 overflow-auto rounded-[12px] bg-white lg:min-h-0"
                        />
                      ) : (
                        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-[12px] border border-white/[0.07] bg-white/[0.02] p-4 font-sans text-[13.5px] leading-relaxed text-white/85">
                          {detail.textBody || detail.plainSnippet || '(Gövde yok)'}
                        </pre>
                      )}
                    </div>
                  </>
                ) : null}
              </Swap>
            )}
          </section>
        ) : (
          <section className="relative hidden flex-1 items-center justify-center lg:flex">
            <p className="text-[13.5px] text-white/35">Okumak için bir mail seçin.</p>
          </section>
        )}
      </Tile>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[400px] bg-card border-border/50 text-foreground shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Kaydı sil</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-2">
              {deleteTarget?.subject
                ? `"${deleteTarget.subject}" kalıcı olarak silinecek.`
                : 'Bu kayıt kalıcı olarak silinecek.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Button
              type="button"
              variant="ghost"
              className="font-semibold"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              className="bg-destructive text-white hover:bg-destructive/90 font-semibold"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
