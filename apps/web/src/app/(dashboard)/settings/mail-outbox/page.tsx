'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ChevronLeft, Loader2, Mail, MailWarning, Settings2, Sparkles, Trash2 } from 'lucide-react';
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
  RowBar,
  rowClass,
  SearchField,
  SecondaryButton,
  SecondaryLink,
  SelectMenu,
  StatusChip,
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

const STATUS_FILTERS = [
  { key: '', label: 'Tümü' },
  { key: 'SENT', label: 'Gönderildi' },
  { key: 'SKIPPED', label: 'Atlandı' },
  { key: 'FAILED', label: 'Hata' },
  { key: 'PREVIEW', label: 'Önizleme' },
] as const;

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

/** Kenar listesindeki süzgeç satırı: varsa durum ikonu, ad ve sayı; seçiliyken altın dolu. */
function NavRow({
  active,
  label,
  count,
  glyph,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  glyph?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'press group/nav flex h-10 w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[11px] px-3 text-left text-[13.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 max-lg:w-auto',
        active
          ? 'bg-brand font-medium text-primary-foreground'
          : 'text-white/65 hover:bg-brand hover:text-primary-foreground',
      )}
    >
      {glyph ? (
        <StatusChip
          status={glyph}
          size="sm"
          className={cn(active && '[&>span]:bg-black/10 [&>span]:shadow-none')}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && count > 0 ? (
        <span
          className={cn(
            'text-[12px] tabular-nums',
            active ? 'text-primary-foreground/60' : 'text-white/35 group-hover/nav:text-primary-foreground/60',
          )}
        >
          {count.toLocaleString('tr-TR')}
        </span>
      ) : null}
    </button>
  );
}

export default function MailOutboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
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

  if (user && user.role !== 'ADMIN') return null;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
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

      {/* Üç bölme: süzgeçler · liste · okuma. Dar ekranda liste ve okuma yer değiştirir. */}
      <Tile className="flex flex-col lg:h-[calc(100dvh-17.5rem)] lg:min-h-[560px] lg:flex-row">
        <aside className="shrink-0 border-b border-hairline p-3 lg:w-56 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-0.5" role="group" aria-label="Durum">
            {STATUS_FILTERS.map((f) => (
              <NavRow
                key={f.key || 'all'}
                active={status === f.key && !channel}
                label={f.label}
                glyph={f.key ? statusGlyph(f.key) : undefined}
                count={f.key === '' ? counts.all : counts[f.key as 'SENT' | 'SKIPPED' | 'FAILED' | 'PREVIEW'] || 0}
                onClick={() => {
                  setStatus(f.key);
                  setChannel('');
                }}
              />
            ))}
          </div>

          {channelEntries.length ? (
            <>
              <p className="mb-1.5 mt-6 hidden px-3 text-[12px] font-medium text-white/40 lg:block">Kanallar</p>
              <div className="hidden flex-col gap-0.5 lg:flex" role="group" aria-label="Kanal">
                {channelEntries.map((c) => (
                  <NavRow
                    key={c.key}
                    active={channel === c.key}
                    label={c.label}
                    count={c.count}
                    onClick={() => {
                      setChannel(channel === c.key ? '' : c.key);
                      setStatus('');
                    }}
                  />
                ))}
              </div>
              <SelectMenu
                label="Kanal"
                value={channel}
                onChange={(next) => {
                  setChannel(next);
                  setStatus('');
                }}
                active={Boolean(channel)}
                className="mt-2 lg:hidden"
                options={[
                  { value: '', label: 'Tüm kanallar' },
                  ...channelEntries.map((c) => ({
                    value: c.key,
                    label: c.label,
                    hint: c.count ? c.count.toLocaleString('tr-TR') : undefined,
                  })),
                ]}
              />
            </>
          ) : null}
        </aside>

        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-col border-hairline',
            activeId ? 'hidden lg:flex lg:w-[380px] lg:shrink-0 lg:border-r xl:w-[420px]' : 'flex flex-1',
          )}
        >
          <div className="border-b border-hairline p-3">
            <SearchField value={q} onChange={setQ} placeholder="Alıcı veya konu ara" label="Mail ara" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto max-lg:max-h-[70dvh]">
            {listQuery.isPending ? (
              <div className="flex flex-1 items-center justify-center gap-2 py-16 text-[13px] text-white/40">
                <Loader2 className="size-4 animate-spin" />
                Yükleniyor
              </div>
            ) : null}
            {listQuery.isError ? (
              <EmptyState icon={<MailWarning />} title="Liste alınamadı" body="Sayfayı yenileyin; sürerse API'yi yeniden başlatın." />
            ) : null}
            {!listQuery.isPending && !listQuery.isError && items.length === 0 ? (
              <EmptyState
                icon={<Mail />}
                title="Kayıt yok"
                body="Sistem mail ürettiğinde, gönderilse de atlansa da, burada görünür."
              />
            ) : null}

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
                        rowClass,
                        'flex w-full items-start gap-3 py-3.5 pl-4 pr-12 text-left outline-none',
                        active && 'bg-white/[0.05]',
                      )}
                    >
                      <RowBar active={active} />
                      <StatusChip status={statusGlyph(item.status)} className="mt-0.5" />
                      <span className="min-w-0 flex-1 transition-transform duration-300 ease-out group-hover/row:translate-x-0.5">
                        <span className="flex items-baseline gap-3">
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">{shortTo(item.to)}</span>
                          <span className="shrink-0 text-[12px] tabular-nums text-white/40">
                            {format(new Date(item.createdAt), 'd MMM HH:mm', { locale: tr })}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-white/75">{item.subject}</span>
                        {item.plainSnippet ? (
                          <span className="mt-0.5 block truncate text-[12.5px] text-white/35">{item.plainSnippet}</span>
                        ) : null}
                        <span className="mt-1.5 block truncate text-[12px] text-white/35">
                          {statusLabel(item.status)} · {channelName(item.channel)}
                        </span>
                      </span>
                    </button>
                    <IconButton
                      label="Sil"
                      tone="danger"
                      disabled={deleteMutation.isPending}
                      className={cn('absolute right-2.5 top-3', revealClass)}
                      onClick={() => askDelete(item.id, item.subject)}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2.5">
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
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {detailQuery.isPending && !detailQuery.isError ? (
              <div className="flex flex-1 items-center justify-center gap-2 py-16 text-[13px] text-white/40">
                <Loader2 className="size-4 animate-spin" />
                Açılıyor
              </div>
            ) : null}

            {detailQuery.isError && !detailQuery.isPending ? (
              <EmptyState
                icon={<MailWarning />}
                title="Bu kayıt açılamadı"
                action={<SecondaryButton onClick={() => detailQuery.refetch()}>Yeniden dene</SecondaryButton>}
              />
            ) : null}

            {detail && !detailQuery.isError ? (
              <>
                <div className="flex items-start gap-3 border-b border-hairline px-5 py-4">
                  <IconButton label="Listeye dön" className="-ml-2 lg:hidden" onClick={() => setSelectedId('')}>
                    <ChevronLeft className="size-5" />
                  </IconButton>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[18px] font-medium leading-snug tracking-[-0.015em] text-white">{detail.subject}</h2>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-white/45">
                      <StatusChip status={statusGlyph(detail.status)} label={statusLabel(detail.status)} />
                      <span className="tabular-nums">
                        {format(new Date(detail.createdAt), 'd MMMM yyyy, HH:mm', { locale: tr })}
                      </span>
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

                <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-hairline px-5 py-3.5 text-[12.5px]">
                  <dt className="text-white/40">Kime</dt>
                  <dd className="break-all text-white/85">{detail.to}</dd>
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
                      <dd className="break-all font-mono text-[11.5px] text-white/45">{detail.messageId}</dd>
                    </>
                  ) : null}
                  {detail.skipReason ? (
                    <>
                      <dt className="text-white/40">Sebep</dt>
                      <dd className="text-brand-ink">{skipReasonLabel(detail.skipReason)}</dd>
                    </>
                  ) : null}
                  {detail.errorMessage ? (
                    <>
                      <dt className="text-white/40">Hata</dt>
                      <dd className="break-all text-[#f2705e]">{detail.errorMessage}</dd>
                    </>
                  ) : null}
                </dl>

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
          </section>
        ) : null}
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
