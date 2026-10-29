'use client';

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useGenie } from '@/lib/useGenie';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { playNotifyChime, unlockNotifyAudio } from '@/lib/notifySound';
import { Bell, MessageSquare, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type NoteKind = 'ALERT' | 'MESSAGE';

type Note = {
  id: string;
  kind?: string | null;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
};

const KNOWN_IDS_KEY = 'up_notify_known_ids';
const BOOTED_KEY = 'up_notify_booted';
const SUMMARY_KEY = 'up_notify_summary_shown';

function loadKnownIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(KNOWN_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveKnownIds(ids: Set<string>) {
  try {
    const list = [...ids];
    sessionStorage.setItem(KNOWN_IDS_KEY, JSON.stringify(list.slice(-400)));
  } catch {
    /* ignore */
  }
}

function noteKind(note: Note): NoteKind {
  if (note.kind === 'MESSAGE' || note.kind === 'ALERT') return note.kind;
  return note.message === 'Yeni mesajınız var' || note.message.includes('için yeni mesaj')
    ? 'MESSAGE'
    : 'ALERT';
}

/** Talep adı, tutar ve benzeri parçaları kalın göster */
function formatNotifyMessage(message: string): ReactNode {
  const text = String(message || '');
  if (!text) return null;

  const re =
    /("[^"]+"|«[^»]+»|\([^)]*(?:TL|₺)[^)]*\)|(?:\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,]\d+)?\s*(?:TL|₺))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    nodes.push(
      <strong key={`b-${key++}`} className="font-semibold text-foreground">
        {m[0]}
      </strong>,
    );
    last = m.index + m[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  if (!nodes.length) return text;
  return nodes;
}

function pushLiveToast(note: Note, kind: NoteKind, onOpen: (note: Note) => void) {
  const Icon = kind === 'MESSAGE' ? MessageSquare : Bell;
  const title = kind === 'MESSAGE' ? 'Yeni mesaj' : 'Yeni bildirim';
  toast.custom(
    (t) => (
      <div className="relative flex w-[min(100vw-2rem,22rem)] items-start gap-3 rounded-xl border border-white/12 bg-[hsl(0,0%,11%)] p-3.5 pr-9 text-left text-white shadow-2xl">
        <button
          type="button"
          aria-label="Bildirimi kapat"
          title="Kapat"
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t);
          }}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => {
            toast.dismiss(t);
            onOpen(note);
          }}
          className="flex min-w-0 flex-1 items-start gap-3 text-left transition-colors"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary/90">
              {title}
            </span>
            <span className="mt-1 block text-sm leading-snug text-white/80 line-clamp-3 [&_strong]:text-white">
              {formatNotifyMessage(note.message)}
            </span>
            {note.link ? (
              <span className="mt-2 block text-[11px] font-medium text-white/45">
                Açmak için tıklayın
              </span>
            ) : null}
          </span>
        </button>
      </div>
    ),
    {
      id: `live-note-${note.id}`,
      duration: 12_000,
      position: 'top-right',
      unstyled: true,
      className: 'sonner-notify-bare',
    },
  );
}

function pushSessionSummary(alertCount: number, messageCount: number) {
  const parts: string[] = [];
  if (alertCount > 0) parts.push(`${alertCount} bildirim`);
  if (messageCount > 0) parts.push(`${messageCount} mesaj`);
  if (!parts.length) return;

  toast.custom(
    (t) => (
      <div className="relative flex w-[min(100vw-2rem,22rem)] items-start gap-3 rounded-xl border border-white/12 bg-[hsl(0,0%,11%)] p-3.5 pr-9 text-left text-white shadow-2xl">
        <button
          type="button"
          aria-label="Kapat"
          onClick={() => toast.dismiss(t)}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bell className="h-[1.125rem] w-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary/90">
            Okunmamış
          </span>
          <span className="mt-1 block text-sm leading-snug text-white/80">
            {parts.join(', ')} bekliyor. Üstteki çan veya mesaj kutusundan açabilirsiniz.
          </span>
        </span>
      </div>
    ),
    {
      id: 'session-notify-summary',
      duration: 8_000,
      position: 'top-right',
      unstyled: true,
      className: 'sonner-notify-bare',
    },
  );
}

function InboxMenu({
  title,
  empty,
  notes,
  unreadCount,
  kind,
  onClose,
  onMarkAll,
}: {
  title: string;
  empty: string;
  notes: Note[];
  unreadCount: number;
  kind: NoteKind;
  onClose: () => void;
  onMarkAll: () => void;
}) {
  const qc = useQueryClient();
  const Icon = kind === 'MESSAGE' ? MessageSquare : Bell;
  return (
      <div
        id="header-inbox"
        role="region"
        aria-label={title}
        data-genie-target
        className="absolute right-0 top-12 z-50 w-[22rem] overflow-hidden rounded-2xl border border-white/[0.08] bg-popover shadow-[var(--shadow-float)] sm:w-[26rem]"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/12 text-primary">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-medium tracking-[-0.01em]">{title}</p>
            <p className="text-[12px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} okunmamış` : 'Hepsi okundu'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
              onClick={onMarkAll}
            >
              Tümünü okundu say
            </button>
          )}
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          {notes.length === 0 && (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
                <Icon className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">{empty}</p>
            </div>
          )}
          {notes.slice(0, 20).map((note) => (
            <Link
              key={note.id}
              href={note.link || '#'}
              onClick={async () => {
                onClose();
                if (!note.isRead) await notificationsApi.markAsRead(note.id);
                qc.invalidateQueries({ queryKey: ['notifications'] });
              }}
              className={cn(
                'flex items-start gap-3 border-b border-white/5 px-4 py-3 hover:bg-white/5',
                !note.isRead && 'bg-primary/10'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  note.isRead ? 'bg-white/8 text-muted-foreground' : 'bg-primary/15 text-primary'
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <p className={cn('text-sm leading-snug', note.isRead ? 'text-foreground/85' : 'font-medium')}>
                  {formatNotifyMessage(note.message)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true, locale: tr })}
                </p>
              </span>
              {!note.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
            </Link>
          ))}
        </div>
        <Link
          href="/notifications"
          onClick={onClose}
          className="block border-t border-white/10 px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-white/5"
        >
          {kind === 'MESSAGE' ? 'Tüm mesajları gör' : 'Tüm bildirimleri gör'}
        </Link>
      </div>
  );
}

function InboxButton({
  title,
  unreadCount,
  open,
  onToggle,
  buttonRef,
  icon,
}: {
  title: string;
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  buttonRef: Ref<HTMLButtonElement>;
  icon: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          unlockNotifyAudio();
          onToggle();
        }}
        className="wave-btn flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] text-white/65"
        data-open={open || undefined}
        aria-expanded={open}
        aria-controls={open ? 'header-inbox' : undefined}
        title={title}
        aria-label={title}
      >
        <span className={cn('inline-flex', unreadCount > 0 && 'animate-notify-shake')}>{icon}</span>
      </button>
      {unreadCount > 0 && (
        <span
          key={unreadCount}
          className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold tabular-nums text-[#141416] ring-2 ring-chrome animate-in zoom-in-50 duration-300"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}

export function NotificationBell() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState<null | NoteKind>(null);
  const [activeKind, setActiveKind] = useState<NoteKind>('ALERT');
  const wrapRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLButtonElement>(null);
  // İki düğme tek paneli paylaşır; menü değiştirirken ikinci bir sheet oluşmaz.
  const present = useGenie({
    open: open !== null,
    getTarget: () => wrapRef.current?.querySelector<HTMLElement>('[data-genie-target]'),
    getSource: () => activeKind === 'MESSAGE' ? messageRef.current : alertRef.current,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (kind: NoteKind) => {
    setActiveKind(kind);
    setOpen((current) => current === kind ? null : kind);
  };
  const { data = [], isSuccess } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await notificationsApi.getAll()).data as Note[],
    refetchInterval: 15_000,
  });

  const alerts = data.filter((n) => noteKind(n) === 'ALERT');
  const messages = data.filter((n) => noteKind(n) === 'MESSAGE');
  const unreadAlerts = alerts.filter((n) => !n.isRead);
  const unreadMessages = messages.filter((n) => !n.isRead);

  const openNote = async (note: Note) => {
    if (!note.isRead) {
      try {
        await notificationsApi.markAsRead(note.id);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (note.link) router.push(note.link);
  };

  useEffect(() => {
    if (!isSuccess) return;

    const known = loadKnownIds();
    const unread = [...unreadAlerts, ...unreadMessages];
    const booted = sessionStorage.getItem(BOOTED_KEY) === '1';

    if (!booted) {
      for (const n of unread) known.add(n.id);
      saveKnownIds(known);
      sessionStorage.setItem(BOOTED_KEY, '1');

      if (unread.length > 0 && sessionStorage.getItem(SUMMARY_KEY) !== '1') {
        sessionStorage.setItem(SUMMARY_KEY, '1');
        pushSessionSummary(unreadAlerts.length, unreadMessages.length);
      }
      return;
    }

    const fresh = unread.filter((n) => !known.has(n.id) && n.link !== pathname);
    if (!fresh.length) return;

    playNotifyChime();
    const batch = fresh.slice(0, 5);
    for (const note of batch) {
      known.add(note.id);
      pushLiveToast(note, noteKind(note), openNote);
    }
    for (const n of unread) known.add(n.id);
    saveKnownIds(known);
    // openNote / arrays intentionally omitted — only react to fetched snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, data, pathname]);

  const markAll = async (kind: NoteKind) => {
    await notificationsApi.markAllAsRead(kind);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="relative flex items-center gap-2" ref={wrapRef}>
      <InboxButton
        title="Mesajlar"
        unreadCount={unreadMessages.length}
        open={open === 'MESSAGE'}
        onToggle={() => toggle('MESSAGE')}
        buttonRef={messageRef}
        icon={<MessageSquare className="h-5 w-5" />}
      />
      <InboxButton
        title="Bildirimler"
        unreadCount={unreadAlerts.length}
        open={open === 'ALERT'}
        onToggle={() => toggle('ALERT')}
        buttonRef={alertRef}
        icon={<Bell className="h-5 w-5" />}
      />
      {present && (
        <InboxMenu
          title={activeKind === 'MESSAGE' ? 'Mesajlar' : 'Bildirimler'}
          empty={activeKind === 'MESSAGE' ? 'Henüz mesaj yok' : 'Henüz bildirim yok'}
          notes={activeKind === 'MESSAGE' ? messages : alerts}
          unreadCount={activeKind === 'MESSAGE' ? unreadMessages.length : unreadAlerts.length}
          kind={activeKind}
          onClose={() => setOpen(null)}
          onMarkAll={() => markAll(activeKind)}
        />
      )}
    </div>
  );
}
