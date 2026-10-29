'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { internalRequestsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { playNotifyChime, unlockNotifyAudio } from '@/lib/notifySound';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PasteRichInput, packInline, type PasteImage } from '@/components/PasteRichInput';
import { RichBody } from '@/components/RichBody';
import { MessageMedia, PendingFiles } from '@/components/ChatMedia';
import { htmlToPlain } from '@/lib/richHtml';

type SeenBy = {
  id: string;
  name: string;
  readAt: string;
};

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole?: string | null;
  files?: { id: string; originalName: string; size: number; mimeType?: string }[];
  seenBy?: SeenBy[];
};

type ChatParticipant = {
  id: string;
  name: string;
  email?: string | null;
  roleLabel: string;
  unit?: string | null;
};

type ThreadEvent = {
  id: string;
  action: string;
  createdAt: string;
  actorId?: string | null;
  actorName?: string | null;
  payload?: {
    assignedToIds?: string[];
    assigneeNames?: string[];
    note?: string | null;
    itemNames?: string[];
    rfqTitle?: string | null;
  };
};

function joinNames(names: string[]) {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} ile ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} ve ${clean[clean.length - 1]}`;
}

function formatEventText(event: ThreadEvent) {
  const actor = event.actorName || 'Sistem';
  const names = joinNames(event.payload?.assigneeNames || []);
  const note = String(event.payload?.note || '').trim();
  switch (event.action) {
    case 'INTERNAL_REQUEST_CREATED':
      return `${actor} talebi oluşturdu.`;
    case 'INTERNAL_REQUEST_UPDATED':
      return `${actor} talebi düzenledi.`;
    case 'INTERNAL_REQUEST_SUBMITTED':
      return `${actor} talebi satın alma incelemesine gönderdi.`;
    case 'INTERNAL_REQUEST_APPROVED':
      if (names) return `${actor} talebi onayladı ve satın alma işlemi için ${names} görevlendirdi.`;
      return `${actor} talebi onayladı.`;
    case 'INTERNAL_REQUEST_REJECTED':
      return note ? `${actor} talebi reddetti: "${note}"` : `${actor} talebi reddetti.`;
    case 'INTERNAL_REQUEST_CONVERTED': {
      const taken = joinNames(event.payload?.itemNames || []);
      const rfq = String(event.payload?.rfqTitle || '').trim();
      if (taken && rfq) return `${actor}, «${rfq}» tedarik talebine ${taken} kalemlerini aldı.`;
      if (taken) return `${actor} şu kalemler için tedarik talebi açtı: ${taken}.`;
      return `${actor} teklif talebi oluşturdu.`;
    }
    default:
      return `${actor} işlem kaydı oluşturdu.`;
  }
}

function emailMark(email?: string | null, fallbackName?: string | null) {
  const fromLocal = (raw: string) => {
    const local = String(raw || '')
      .trim()
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase();
    return '';
  };

  const fromEmail = fromLocal(email || '');
  if (fromEmail) return fromEmail;

  if (String(fallbackName || '').includes('@')) {
    const fromNameEmail = fromLocal(fallbackName || '');
    if (fromNameEmail) return fromNameEmail;
  }

  // Tek parça takma ad (mcorlu) — isim soyisimden MA üretme
  const parts = String(fallbackName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 1) {
    const one = fromLocal(parts[0]);
    if (one) return one;
  }

  return '?';
}

function PersonPhoto({ email, name }: { email?: string | null; name: string }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase tracking-tight text-primary-foreground ring-1 ring-white/15">
      {emailMark(email, name)}
    </span>
  );
}

function seenTitle(seen: SeenBy[]) {
  return seen
    .map((s) => `${s.name} tarafından ${format(new Date(s.readAt), 'HH:mm')}’da görüldü`)
    .join('\n');
}

export function ReviewNote({
  note,
  author,
  at,
}: {
  note?: string | null;
  author?: string | null;
  at?: string | null;
}) {
  if (!note) return null;
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="bg-black/20 px-3 py-2 text-sm text-muted-foreground">Birim yöneticisi notu</div>
      <div className="p-3">
        <p className="text-sm whitespace-pre-wrap">{note}</p>
        {(author || at) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {[author, at ? format(new Date(at), 'd MMM yyyy HH:mm', { locale: tr }) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

export function RequestThread({ requestId }: { requestId: string }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const didInit = useRef(false);
  const lastHeardId = useRef<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; images: PasteImage[] }>({ text: '', images: [] });
  const [chatFiles, setChatFiles] = useState<File[]>([]);
  const [editorKey, setEditorKey] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['request-chat', requestId],
    queryFn: async () =>
      (await internalRequestsApi.listMessages(requestId)).data as {
        title?: string;
        participants?: ChatParticipant[];
        items: ChatMessage[];
        events?: ThreadEvent[];
      },
    refetchInterval: 3000,
  });

  const items = data?.items || [];
  const events = data?.events || [];
  const participants = data?.participants || [];
  const requestTitle = data?.title || '';

  const timeline = useMemo(() => {
    const mixed = [
      ...events.map((event) => ({
        kind: 'event' as const,
        at: new Date(event.createdAt).getTime(),
        event,
      })),
      ...items.map((msg) => ({
        kind: 'msg' as const,
        at: new Date(msg.createdAt).getTime(),
        msg,
      })),
    ].sort((a, b) => a.at - b.at);

    const rows: Array<
      | { kind: 'day'; key: string; label: string }
      | { kind: 'event'; at: number; event: ThreadEvent }
      | { kind: 'msg'; at: number; msg: ChatMessage }
    > = [];
    let lastDay = '';
    for (const row of mixed) {
      const day = format(new Date(row.at), 'yyyy-MM-dd');
      if (day !== lastDay) {
        rows.push({
          kind: 'day',
          key: day,
          label: format(new Date(row.at), 'd MMMM yyyy', { locale: tr }),
        });
        lastDay = day;
      }
      rows.push(row);
    }
    return rows;
  }, [events, items]);

  useEffect(() => {
    const last = items[items.length - 1];
    if (!last) {
      lastHeardId.current = null;
      return;
    }
    if (lastHeardId.current == null) {
      lastHeardId.current = last.id;
      return;
    }
    if (last.id !== lastHeardId.current && last.authorId !== user?.id) {
      playNotifyChime();
    }
    lastHeardId.current = last.id;
  }, [items, user?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!didInit.current) {
      el.scrollTop = el.scrollHeight;
      didInit.current = true;
      stickBottom.current = true;
      return;
    }
    if (stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [timeline.length]);

  const sendMut = useMutation({
    mutationFn: () => {
      const packed = packInline(draft.text, draft.images);
      const fd = new FormData();
      fd.append('body', packed.text);
      packed.files.forEach((f) => fd.append('inlineImages', f));
      chatFiles.forEach((f) => fd.append('files', f));
      return internalRequestsApi.postMessage(requestId, fd);
    },
    onSuccess: () => {
      setDraft({ text: '', images: [] });
      setChatFiles([]);
      setEditorKey((k) => k + 1);
      stickBottom.current = true;
      qc.invalidateQueries({ queryKey: ['request-chat', requestId] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e: unknown) => {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Mesaj gönderilemedi');
    },
  });

  const canSend = Boolean(draft.text.trim() || draft.images.length || chatFiles.length);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend || sendMut.isPending) return;
    stickBottom.current = true;
    sendMut.mutate();
  };

  const empty = !isLoading && !isError && timeline.length === 0;

  return (
    <section className="flex max-h-[min(36rem,70vh)] flex-col overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <header className="border-b border-white/10 px-3 py-2.5">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="truncate font-semibold">{requestTitle || 'Talep'}</span>
          <span className="text-muted-foreground">//</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Talep yazışması
          </span>
        </h2>
        {participants.length > 0 && (
          <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
            {participants.map((person) => {
              const me = person.id === user?.id;
              const subtitle = person.unit || person.roleLabel;
              return (
                <div
                  key={person.id}
                  title={person.email || person.name}
                  className={cn(
                    'flex min-w-[168px] max-w-[210px] shrink-0 items-center gap-2.5 rounded-xl border px-2 py-1.5',
                    me ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-black/30'
                  )}
                >
                  <PersonPhoto email={person.email} name={person.name} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold leading-tight">
                      {me ? 'Siz' : person.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{subtitle}</span>
                    {person.email ? (
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/70">
                        {person.email}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
        }}
      >
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        )}
        {isError && <p className="py-4 text-center text-xs text-destructive">Yazışma yüklenemedi.</p>}
        {empty && (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">Henüz mesaj yok</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">Bu talep hakkındaki yazışmalar burada görüntülenecek.</p>
          </div>
        )}
        {timeline.map((row) => {
          if (row.kind === 'day') {
            return (
              <div key={`day-${row.key}`} className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] text-muted-foreground">{row.label}</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
            );
          }
          if (row.kind === 'event') {
            const at = new Date(row.event.createdAt);
            return (
              <p key={`evt-${row.event.id}`} className="px-2 py-1 text-center text-[11px] leading-snug text-muted-foreground/80">
                {format(at, 'd MMM yyyy', { locale: tr })} · {format(at, 'HH:mm')} — {formatEventText(row.event)}
              </p>
            );
          }
          const msg = row.msg;
          const mine = msg.authorId === user?.id;
          const seen = (msg.seenBy || []).filter((s) => s.id !== user?.id);
          const at = new Date(msg.createdAt);
          const files = msg.files || [];
          const hasText = Boolean(htmlToPlain(msg.body) || /\[\[img:/.test(msg.body || ''));
          const mediaOnly = files.length > 0 && !hasText;
          return (
            <div key={msg.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] text-sm sm:max-w-[70%]',
                  mine
                    ? 'rounded-[18px] rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-[18px] rounded-bl-md bg-[#2a3138]',
                  mediaOnly ? 'px-2.5 py-2' : 'px-3 py-1.5'
                )}
              >
                {!mine && (
                  <p className="mb-0.5 text-[11px] font-semibold text-primary">{msg.authorName || 'Kullanıcı'}</p>
                )}
                {hasText && <RichBody text={msg.body} requestId={requestId} className="text-[13.5px] leading-snug" />}
                {files.length > 0 && (
                  <div className={cn(hasText ? 'mt-1.5' : null)}>
                    <MessageMedia requestId={requestId} files={files} mine={mine} />
                  </div>
                )}
                <p
                  className={cn(
                    '-mb-0.5 mt-1 flex items-center justify-end gap-1 text-[10px] leading-none',
                    mine ? 'text-primary-foreground/70' : 'text-white/45'
                  )}
                  title={mine && seen.length ? seenTitle(seen) : undefined}
                >
                  <span>{format(at, 'HH:mm')}</span>
                  {mine && <span aria-label={seen.length ? 'Görüldü' : 'Gönderildi'}>{seen.length ? '✓✓' : '✓'}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="border-t border-white/10 px-2.5 py-2" onFocus={unlockNotifyAudio}>
        <PendingFiles files={chatFiles} onRemove={(idx) => setChatFiles((prev) => prev.filter((_, i) => i !== idx))} />
        <div className="flex items-end gap-1.5">
          <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-white/5">
            <Paperclip className="h-5 w-5" />
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
              className="hidden"
              onChange={(e) => {
                const next = [...chatFiles, ...Array.from(e.target.files || [])];
                setChatFiles(next.slice(0, 8));
                e.target.value = '';
              }}
            />
          </label>
          <PasteRichInput
            key={editorKey}
            resetKey={editorKey}
            plain
            submitOnEnter
            onSubmit={() => submit()}
            onChange={setDraft}
            placeholder="Mesaj"
            className="min-h-10 max-h-24 py-2.5"
          />
          <button
            type="submit"
            disabled={!canSend || sendMut.isPending}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Gönder"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}
