'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationCcContactsApi, procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Mail, AlertTriangle } from 'lucide-react';
import { QuickActionRow } from '@/components/procurement/HandoverPanel';
import { toast } from 'sonner';
import {
  ExecutiveCopyRecipients,
  splitExecutiveRecipients,
  type ExecutiveCopyContact,
} from '@/components/ExecutiveCopyRecipients';

const REVOKE_SECONDS = 60;

function shortTitle(raw: string) {
  if (!raw) return '';
  return raw
    .replace(/\s*SEED\s*[-–]\s*Kategorili Rapor\s*\(ID bağımsız\)\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

type Phase = 'inform' | 'confirm' | 'sent';

type InviteState = 'idle' | 'pendingMail' | 'queued';

type Props = {
  requestId: string;
  requestTitle: string;
  variant?: 'toolbar' | 'card' | 'row';
  className?: string;
  /** idle = ilk gönderim; pendingMail = 1 dk pencere; queued = kuyrukta, tekrar gönderilebilir */
  inviteState?: InviteState;
};

export function DecisionInviteDialog({
  requestId,
  requestTitle,
  variant = 'card',
  className,
  inviteState = 'idle',
}: Props) {
  const queryClient = useQueryClient();
  const dispatchAnnouncedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('inform');
  const [secondsLeft, setSecondsLeft] = useState(REVOKE_SECONDS);
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const seededCanonicalRef = useRef(false);

  const displayTitle = shortTitle(requestTitle) || requestTitle;

  const { data: ccContacts = [], isPending: ccLoading } = useQuery({
    queryKey: ['notification-cc-contacts'],
    queryFn: async () => {
      const { data } = await notificationCcContactsApi.getAll();
      return data as ExecutiveCopyContact[];
    },
    enabled: open,
  });

  const { data: approvalLimit } = useQuery({
    queryKey: ['approval-limit'],
    queryFn: async () => {
      const { data } = await procurementApi.getApprovalLimit();
      return data as { executiveEmail?: string | null };
    },
    enabled: open,
  });

  const canonicalEmail = (approvalLimit?.executiveEmail || '').trim().toLowerCase();
  const canonicalContact: ExecutiveCopyContact | null = canonicalEmail
    ? {
        id: 'canonical-executive',
        name:
          ccContacts.find((c) => c.email.trim().toLowerCase() === canonicalEmail)?.name ||
          'Üst yönetim',
        email: approvalLimit?.executiveEmail?.trim() || canonicalEmail,
      }
    : null;

  const { extraEmails: extrasOnly, includeCanonical } = splitExecutiveRecipients(
    extraEmails,
    canonicalEmail,
  );

  useEffect(() => {
    if (!open) {
      seededCanonicalRef.current = false;
      return;
    }
    if (seededCanonicalRef.current || !canonicalEmail) return;
    seededCanonicalRef.current = true;
    setExtraEmails((prev) => (prev.length ? prev : [canonicalEmail]));
  }, [open, canonicalEmail]);

  const resetAndClose = () => {
    setOpen(false);
    setPhase('inform');
    setSecondsLeft(REVOKE_SECONDS);
    setExtraEmails([]);
    dispatchAnnouncedRef.current = false;
    seededCanonicalRef.current = false;
  };

  const isResend = inviteState === 'queued';
  const isPendingMail = inviteState === 'pendingMail';

  const mutation = useMutation({
    mutationFn: () =>
      procurementApi.sendDecisionInvite(requestId, {
        extraEmails: extrasOnly,
        includeCanonical,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['procurement', requestId] });
      const resent = Boolean((res.data as { resent?: boolean })?.resent);
      if (resent || isResend) {
        toast.success('E-posta tekrar gönderildi. Eski bağlantının süresi dolduysa yeni link geçerlidir.');
        resetAndClose();
        return;
      }
      toast.success(
        'Karar kutusuna düşüş planlandı. E-posta 1 dakika sonra gider; bu sürede geri alırsanız hiç gönderilmez.',
      );
      dispatchAnnouncedRef.current = false;
      setPhase('sent');
      setSecondsLeft(REVOKE_SECONDS);
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Gönderilemedi.');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => procurementApi.revokeDecisionInvite(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', requestId] });
      toast.success('Geri alındı. Üst yönetime e-posta gönderilmeyecek.');
      resetAndClose();
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Geri alınamadı.');
    },
  });

  useEffect(() => {
    if (!open || phase !== 'sent') return;
    setSecondsLeft(REVOKE_SECONDS);
    const started = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const left = Math.max(0, REVOKE_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left <= 0) window.clearInterval(intervalId);
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [open, phase]);

  useEffect(() => {
    if (!open || phase !== 'sent' || secondsLeft > 0) return;
    if (dispatchAnnouncedRef.current) return;
    dispatchAnnouncedRef.current = true;
    queryClient.invalidateQueries({ queryKey: ['procurement', requestId] });
    toast.success('1 dakika doldu', {
      description:
        'Sunucu üst yönetim onay kutusuna e-postayı iletiyor. Birkaç saniye içinde posta kutusuna düşmesi gerekir.',
    });
  }, [open, phase, secondsLeft, queryClient, requestId]);

  const triggerLabel = isResend ? 'Tekrar gönder' : isPendingMail ? 'E-posta bekleniyor' : 'Karar daveti gönder';
  const triggerHint = isResend
    ? 'Yeni bağlantı ile ilet'
    : isPendingMail
      ? '1 dakika içinde geri alınabilir'
      : 'Üst yönetimin onay kutusuna düşer';
  const openInvite = () => {
    setPhase('inform');
    setSecondsLeft(REVOKE_SECONDS);
    setExtraEmails([]);
    setOpen(true);
  };
  const triggerClass =
    variant === 'toolbar'
      ? `font-black h-10 shrink-0 px-3 sm:px-4 rounded-xl text-[10px] tracking-wider whitespace-nowrap border border-primary/45 bg-primary/12 text-primary shadow-sm hover:bg-primary/20 hover:border-primary/60 ${className ?? ''}`
      : `font-black h-11 px-5 text-xs tracking-wider w-full sm:flex-1 justify-center border border-primary/45 bg-primary/12 text-primary hover:bg-primary/18 hover:border-primary/55 shadow-sm ${className ?? ''}`;

  return (
    <>
      {variant === 'row' ? (
        <QuickActionRow icon={Mail} title={triggerLabel} hint={triggerHint} tone="amber" onClick={openInvite} />
      ) : (
        <Button type="button" variant="outline" className={triggerClass} onClick={openInvite}>
          <Mail className="h-4 w-4 mr-2 shrink-0 opacity-90" />
          {isResend ? 'TEKRAR GÖNDER' : isPendingMail ? 'E-POSTA BEKLENİYOR' : 'KARAR DAVETİ GÖNDER'}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) resetAndClose();
          else setOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-lg border-border/50 bg-card p-0 gap-0 overflow-hidden shadow-xl pb-0">
          <div className="border-b border-border/40 bg-gradient-to-b from-muted/40 to-card px-6 py-6 text-center">
            <DialogHeader className="gap-3 items-center text-center sm:text-center">
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground text-center">
                {phase === 'confirm'
                  ? 'Son onay'
                  : phase === 'sent'
                    ? 'E-posta bekleniyor'
                    : 'Üst yönetim karar kutusu'}
              </DialogTitle>
              <DialogDescription className="text-center text-sm leading-relaxed text-muted-foreground max-w-md mx-auto">
                <span className="font-medium text-foreground/90 block">{displayTitle}</span>
                {phase === 'inform' && (
                  <span className="block mt-3 text-left sm:text-center">
                    {isPendingMail ? (
                      <>
                        E-posta henüz gitmedi. 1 dakika dolmadan &quot;Geri al&quot; derseniz hiç
                        gönderilmez.
                      </>
                    ) : isResend ? (
                      <>
                        Bu talep zaten kuyrukta. Tekrar gönderince alıcılara <strong>yeni bağlantı</strong>{' '}
                        gider; süresi dolmuş eski linkler çalışmaz.
                      </>
                    ) : (
                      <>
                        Üst yönetim e-postasını listeden çıkarabilirsiniz; o zaman o kişiye mail gitmez.
                        İşaretlediğiniz kişilere ayrı bağlantı gider. E-posta{' '}
                        <strong>1 dakika sonra</strong> gider; bu dakika dolmadan &quot;Geri al&quot;
                        derseniz <strong>hiç gönderilmez</strong>.
                      </>
                    )}
                  </span>
                )}
                {phase === 'confirm' && (
                  <span className="block mt-3 flex items-start gap-2 text-left text-emerald-200/95 bg-emerald-950/40 border border-emerald-600/35 rounded-lg px-3 py-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                    <span>
                      {isResend ? (
                        <>
                          <strong>Tekrar gönderilsin mi?</strong> E-posta hemen gider.
                        </>
                      ) : (
                        <>
                          <strong>Emin misiniz?</strong> İlk 1 dakika içinde geri alırsanız mail gitmez.
                        </>
                      )}
                      {extraEmails.length
                        ? ` ${extraEmails.length} alıcıya gidecek${
                            includeCanonical ? '' : ' (üst yönetim dahil değil)'
                          }.`
                        : ''}
                    </span>
                  </span>
                )}
                {phase === 'sent' && (
                  <span className="block mt-3 text-left sm:text-center">
                    Henüz e-posta <strong>gönderilmedi</strong>. Aşağıdaki süre içinde geri alırsanız
                    işlem tamamen iptal olur.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          {phase === 'inform' && (
            <>
              <div className="px-6 py-4">
                <ExecutiveCopyRecipients
                  contacts={ccContacts}
                  loading={ccLoading}
                  selectedEmails={extraEmails}
                  onChange={setExtraEmails}
                  canonical={canonicalContact}
                />
              </div>
              {isPendingMail && (
                <div className="px-6 pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate()}
                  >
                    {revokeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    E-postayı göndermeden geri al
                  </Button>
                </div>
              )}
            </>
          )}

          {phase === 'sent' && (
            <div className="px-6 py-4 flex flex-col items-center gap-3">
              <p className="text-2xl font-black tabular-nums text-primary">
                {secondsLeft > 0 ? `${secondsLeft}` : '0'} sn
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full max-w-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={secondsLeft <= 0 || revokeMutation.isPending}
                onClick={() => revokeMutation.mutate()}
              >
                {revokeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                E-postayı göndermeden geri al
              </Button>
              {secondsLeft <= 0 ? (
                <p className="text-xs text-muted-foreground text-center">
                  Süre doldu. Pencereyi kapatabilirsiniz.
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-2 flex flex-col gap-3 border-t border-border/40 bg-muted/15 px-6 pt-5 pb-6 sm:flex-row sm:justify-center sm:gap-4">
            {phase === 'inform' && (
              <>
                <Button type="button" variant="outline" className="min-w-[120px]" onClick={resetAndClose}>
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  className="min-w-[120px] bg-emerald-600 text-white hover:bg-emerald-600/90 font-semibold"
                  disabled={!extraEmails.length || isPendingMail}
                  onClick={() => setPhase('confirm')}
                >
                  Devam
                </Button>
              </>
            )}
            {phase === 'confirm' && (
              <>
                <Button type="button" variant="outline" className="min-w-[120px]" onClick={() => setPhase('inform')}>
                  Hayır
                </Button>
                <Button
                  type="button"
                  className="min-w-[120px] bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Evet, {isResend ? 'tekrar gönder' : '1 dk sonra gönder'}
                </Button>
              </>
            )}
            {phase === 'sent' && (
              <Button type="button" variant="outline" className="min-w-[120px] w-full sm:w-auto" onClick={resetAndClose}>
                Kapat
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
