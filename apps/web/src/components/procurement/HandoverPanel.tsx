'use client';

import { useState, type ComponentType } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { procurementApi } from '@/lib/api';
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

type Viewer = {
  id?: string;
  role?: string;
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
} | null;

type HandoverRow = {
  id: string;
  status?: string;
  direction?: string;
};

type RequestShape = {
  id: string;
  moduleId?: string;
  status?: string;
  purchasingResponsibleModuleId?: string | null;
  handovers?: HandoverRow[];
};

const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'REJECTED']);

const moduleName = (moduleId?: string) =>
  moduleId === 'URETIM_PLANLAMA' ? 'Üretim Planlama' : moduleId === 'YEDEK_PARCA' ? 'Yedek Parça' : 'ilgili departman';

const canAskTakeover = (user: Viewer) =>
  user?.role === 'ADMIN' || (user?.role === 'PURCHASING' && user.moduleId === 'SATIN_ALMA');

const canAskHandoff = (user: Viewer, moduleId?: string) => {
  if (user?.role === 'ADMIN' || user?.isExecutive) return true;
  if (user?.role !== 'PURCHASING' || user.moduleId !== moduleId) return false;
  if (moduleId === 'URETIM_PLANLAMA') return user.subRole === 'MANAGER';
  if (moduleId === 'YEDEK_PARCA') return user.subRole === 'MANAGER' || user.subRole === 'STAFF';
  return false;
};

const canDecide = (user: Viewer, row: HandoverRow | undefined, request: RequestShape) => {
  if (!user || !row || row.status !== 'PENDING') return false;
  if (user.role === 'ADMIN' || user.isExecutive) return true;
  if (row.direction === 'TAKEOVER') {
    return user.role === 'PURCHASING' && user.moduleId === request.moduleId;
  }
  return user.role === 'PURCHASING' && user.moduleId === 'SATIN_ALMA' && user.subRole === 'MANAGER';
};

export function canShowHandoverActions(request: RequestShape | null | undefined, user: Viewer) {
  if (!request?.id) return false;
  if (CLOSED.has(request.status || '')) return false;
  if (request.purchasingResponsibleModuleId === 'SATIN_ALMA') return false;
  if (!['URETIM_PLANLAMA', 'YEDEK_PARCA'].includes(request.moduleId || '')) return false;
  const pending = (request.handovers || []).find((row) => row.status === 'PENDING');
  if (pending) return canDecide(user, pending, request);
  return canAskTakeover(user) || canAskHandoff(user, request.moduleId);
}

type Tone = 'primary' | 'amber' | 'emerald' | 'violet' | 'danger';

/** Simge yuvarlağı satırın tonunu taşır; üzerine gelince düz dolguya döner (iptal kırmızıya, diğerleri altına). */
const TONE_BOX: Record<Tone, string> = {
  primary: 'bg-brand/[0.12] text-brand-ink group-hover:bg-brand group-hover:text-primary-foreground',
  amber: 'bg-amber-400/[0.12] text-amber-300 group-hover:bg-brand group-hover:text-primary-foreground',
  emerald: 'bg-emerald-400/[0.12] text-emerald-300 group-hover:bg-brand group-hover:text-primary-foreground',
  violet: 'bg-violet-400/[0.12] text-violet-300 group-hover:bg-brand group-hover:text-primary-foreground',
  danger: 'bg-destructive/[0.12] text-destructive group-hover:bg-destructive group-hover:text-white',
};

/** Pano satırı gibi: arkada altın dolgu alttan yükselir, yazı hafifçe kayar, ok altına döner. */
export function QuickActionRow({
  icon: Icon,
  title,
  hint,
  onClick,
  disabled,
  tone = 'primary',
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gold-fade gold-fade-x group flex w-full items-center gap-3.5 rounded-[14px] px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-40"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${TONE_BOX[tone]}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 transition-transform duration-300 ease-out group-hover:translate-x-0.5">
        <span className="block text-[14px] font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-[12px] text-white/40">{hint}</span>
      </span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-white/20 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </button>
  );
}

type Mode = 'handoff' | 'takeover' | 'accept' | 'reject';

const COPY: Record<Mode, { title: string; hint: string; description: string; detail: string; note: string; confirm: string }> = {
  handoff: {
    title: 'Satın almayı devret',
    hint: 'Satın Alma yetkilisine istek gider',
    description: 'İstek Satın Alma yetkilisine gider.',
    detail: "Kabul ederse bu talebin satın alması Satın Alma'da devam eder. Kalemler, gelen teklifler ve ek dosyalar aynı kayıtta kalır.",
    note: 'Not isteğe bağlıdır ve istekle birlikte Satın Alma yetkilisine gider.',
    confirm: 'İsteği gönder',
  },
  takeover: {
    title: 'Satın almayı devral',
    hint: 'Departman yetkilisine istek gider',
    description: 'İstek departman yetkilisine gider.',
    detail: "Kabul ederse satın alma Satın Alma'da devam eder. Kalemler, gelen teklifler ve ek dosyalar aynı kayıtta kalır.",
    note: 'Not isteğe bağlıdır ve istekle birlikte departman yetkilisine gider.',
    confirm: 'İsteği gönder',
  },
  accept: {
    title: 'Devri kabul et',
    hint: "Satın alma Satın Alma'da devam eder",
    description: "Satın alma Satın Alma'da devam eder.",
    detail: 'Kalemler, gelen teklifler ve ek dosyalar bu talepte kalır.',
    note: 'Not isteğe bağlıdır ve devir kaydına yazılır.',
    confirm: 'Kabul et',
  },
  reject: {
    title: 'Devri reddet',
    hint: 'İstek kapanır, satın alma burada kalır',
    description: 'İstek kapanır.',
    detail: 'Satın alma bu departmanda kalır. Karşı taraf isterse yeni bir devir isteği gönderebilir.',
    note: 'Gerekçe isteğe bağlıdır ve isteği gönderene iletilir.',
    confirm: 'Reddet',
  },
};

export function HandoverPanel({ request, user }: { request: RequestShape; user: Viewer }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState('');
  const pending = (request.handovers || []).find((row) => row.status === 'PENDING');
  const visible = canShowHandoverActions(request, user);
  const askHandoff = !pending && canAskHandoff(user, request.moduleId);
  const askTakeover = !pending && canAskTakeover(user) && user?.moduleId !== request.moduleId;
  const decide = Boolean(pending && canDecide(user, pending, request));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['procurement', request.id] });
    await queryClient.invalidateQueries({ queryKey: ['procurement-central'] });
  };

  const fail = (err: { response?: { data?: { message?: string } } }, fallback: string) => {
    toast.error(err?.response?.data?.message || fallback);
  };

  const requestHandover = useMutation({
    mutationFn: (direction: 'HANDOFF' | 'TAKEOVER') =>
      procurementApi.requestHandover(request.id, { direction, note: note.trim() || null }),
    onSuccess: async (_res, direction) => {
      toast.success(direction === 'TAKEOVER' ? 'Devralma isteği gönderildi.' : 'Devretme isteği gönderildi.');
      setMode(null);
      setNote('');
      await refresh();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => fail(err, 'Devir isteği gönderilemedi.'),
  });

  const accept = useMutation({
    mutationFn: () => procurementApi.acceptHandover(request.id, pending!.id, note.trim() || null),
    onSuccess: async () => {
      toast.success('Devir isteği kabul edildi.');
      setMode(null);
      setNote('');
      await refresh();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => fail(err, 'Devir isteği kabul edilemedi.'),
  });

  const reject = useMutation({
    mutationFn: () => procurementApi.rejectHandover(request.id, pending!.id, note.trim() || null),
    onSuccess: async () => {
      toast.success('Devir isteği reddedildi.');
      setMode(null);
      setNote('');
      await refresh();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => fail(err, 'Devir isteği reddedilemedi.'),
  });

  if (!visible) return null;

  const busy = requestHandover.isPending || accept.isPending || reject.isPending;
  const copy = mode ? COPY[mode] : null;
  const takeoverCopy = {
    ...COPY.takeover,
    description: `İstek ${moduleName(request.moduleId)} yetkilisine gider.`,
    note: `Not isteğe bağlıdır ve istekle birlikte ${moduleName(request.moduleId)} yetkilisine gider.`,
  };
  const activeCopy = mode === 'takeover' ? takeoverCopy : copy;

  const submit = () => {
    if (mode === 'handoff') requestHandover.mutate('HANDOFF');
    else if (mode === 'takeover') requestHandover.mutate('TAKEOVER');
    else if (mode === 'accept') accept.mutate();
    else if (mode === 'reject') reject.mutate();
  };

  return (
    <>
      {askHandoff && (
        <QuickActionRow
          icon={ArrowLeftRight}
          title={COPY.handoff.title}
          hint={COPY.handoff.hint}
          tone="amber"
          onClick={() => {
            setNote('');
            setMode('handoff');
          }}
        />
      )}
      {askTakeover && (
        <QuickActionRow
          icon={ArrowLeftRight}
          title={COPY.takeover.title}
          hint={COPY.takeover.hint}
          tone="amber"
          onClick={() => {
            setNote('');
            setMode('takeover');
          }}
        />
      )}
      {decide && (
        <>
          <QuickActionRow
            icon={ArrowLeftRight}
            title={COPY.accept.title}
            hint={COPY.accept.hint}
            tone="amber"
            onClick={() => {
              setNote('');
              setMode('accept');
            }}
          />
          <QuickActionRow
            icon={ArrowLeftRight}
            title={COPY.reject.title}
            hint={COPY.reject.hint}
            tone="danger"
            onClick={() => {
              setNote('');
              setMode('reject');
            }}
          />
        </>
      )}

      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setMode(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="bg-[#1a1a1a] border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#D9B625]">
              <ArrowLeftRight className="w-5 h-5" />
              {activeCopy?.title}
            </DialogTitle>
            <DialogDescription className="text-xs text-white/60 leading-relaxed">
              {activeCopy?.description}
            </DialogDescription>
          </DialogHeader>
          {activeCopy?.detail ? (
            <p className="text-xs leading-relaxed text-white/75">{activeCopy.detail}</p>
          ) : null}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'reject' ? 'Gerekçe (isteğe bağlı)' : 'Not (isteğe bağlı)'}
            className="min-h-[72px] bg-background/50 resize-none text-sm"
          />
          {activeCopy?.note ? <p className="text-[11px] leading-relaxed text-white/45">{activeCopy.note}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMode(null);
                setNote('');
              }}
              disabled={busy}
            >
              İptal
            </Button>
            <Button
              disabled={busy}
              onClick={submit}
              className="bg-[#D9B625] text-black font-bold hover:brightness-110"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {activeCopy?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
