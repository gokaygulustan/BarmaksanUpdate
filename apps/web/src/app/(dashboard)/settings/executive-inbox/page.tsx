'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ExternalLink, Inbox, Loader2, RotateCcw, Shield } from 'lucide-react';
import { SkeletonRows } from '@/components/page/Skeleton';
import { procurementApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocumentTitle } from '@/components/DocumentTitle';
import { toast } from 'sonner';

type Recipient = {
  email: string;
  source: string;
  isCanonical?: boolean;
};

type InboxRow = {
  id: string;
  title: string;
  status: string;
  moduleId: string;
  kind: 'OVER_LIMIT' | 'PRODUCTION_DECISION';
  queuedAt: string;
  mailPending?: boolean;
  recipients: Recipient[];
};

export default function ExecutiveInboxSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [recallId, setRecallId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, router]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['staff-executive-inbox'],
    queryFn: async () => {
      const { data: d } = await procurementApi.getStaffExecutiveInbox();
      return d as { pendingCount: number; pending: InboxRow[] };
    },
    enabled: user?.role === 'ADMIN',
    refetchInterval: 30_000,
  });

  const previewMut = useMutation({
    mutationFn: async (requestId?: string) => {
      const { data: d } = await procurementApi.getStaffExecutivePreviewLink();
      return { ...(d as { url: string }), requestId };
    },
    onSuccess: ({ url, requestId }) => {
      const href = requestId ? `${url}?r=${encodeURIComponent(requestId)}` : url;
      window.open(href, '_blank', 'noopener,noreferrer');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Karar ekranı açılamadı.',
      );
    },
  });

  const recallMut = useMutation({
    mutationFn: (requestId: string) => procurementApi.recallFromExecutiveInbox(requestId),
    onSuccess: (res) => {
      const next = res.data as { pendingCount?: number; pending?: InboxRow[] };
      queryClient.setQueryData(['staff-executive-inbox'], next);
      setRecallId(null);
      toast.success('Talep kuyruktan çekildi.');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Kuyruktan çekilemedi.',
      );
    },
  });

  const pending = data?.pending || [];
  const recallRow = pending.find((p) => p.id === recallId) || null;

  if (user && user.role !== 'ADMIN') return null;

  return (
    <div className="space-y-6">
      <DocumentTitle topic="Üst yönetim kutusu" />
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="h-5 w-5 text-primary" />
              Üst yönetim kutusu
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Üretim karar davetleri ve satın alma limit aşımı aynı kuyrukta. Bu sayfa kopya
              filtresi olmadan her bekleyen talebi gösterir; e-posta alan kişiler yalnız kendilerine
              gidenleri görür.
            </CardDescription>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={previewMut.isPending || pending.length === 0}
            onClick={() => previewMut.mutate(undefined)}
          >
            {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Karar ekranını aç
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Bekleyen karar: <span className="font-semibold text-foreground">{data?.pendingCount ?? '—'}</span>
          </p>
          {isPending ? (
            <SkeletonRows rows={4} />
          ) : isError ? (
            <p className="text-sm text-destructive">
              {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Kuyruk yüklenemedi.'}
            </p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">Şu an bekleyen üst yönetim kararı yok.</p>
          ) : (
            <div className="skel-in overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Talep</th>
                    <th className="px-3 py-2 font-semibold">Tür</th>
                    <th className="px-3 py-2 font-semibold">Kime gitti</th>
                    <th className="px-3 py-2 font-semibold">Kuyruğa düşüş</th>
                    <th className="px-3 py-2 font-semibold text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-foreground leading-snug">{row.title}</p>
                        {row.mailPending ? (
                          <p className="mt-1 text-[11px] text-amber-400">E-posta henüz gitmedi (1 dk pencere)</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            row.kind === 'OVER_LIMIT' || row.moduleId === 'SATIN_ALMA'
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                              : 'border-sky-500/40 bg-sky-500/15 text-sky-200',
                          )}
                        >
                          {row.kind === 'OVER_LIMIT' || row.moduleId === 'SATIN_ALMA'
                            ? 'Satın Alma'
                            : row.moduleId === 'YEDEK_PARCA'
                              ? 'Yedek Parça'
                              : 'Üretim Planlama'}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.recipients.length ? (
                          <ul className="space-y-0.5">
                            {row.recipients.map((r) => (
                              <li key={r.email} className="text-[12px] text-muted-foreground">
                                {r.email}
                                {r.isCanonical ? (
                                  <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">
                                    üst yönetim
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">Alıcı kaydı yok</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-[12px] text-muted-foreground whitespace-nowrap">
                        {row.queuedAt
                          ? format(new Date(row.queuedAt), 'd MMM yyyy HH:mm', { locale: tr })
                          : '—'}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col items-end gap-1.5">
                          <Link
                            href={`/procurement/${row.id}`}
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8')}
                          >
                            Talebi aç
                          </Link>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={previewMut.isPending}
                            onClick={() => previewMut.mutate(row.id)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Karar ekranı
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => setRecallId(row.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Kuyruktan çek
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(recallId)} onOpenChange={(open) => !open && setRecallId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kuyruktan çekilsin mi?</DialogTitle>
            <DialogDescription>
              {recallRow ? (
                <>
                  <span className="font-medium text-foreground">{recallRow.title}</span>
                  {recallRow.kind === 'OVER_LIMIT'
                    ? ' yetkili onayına döner; personel iadesi yapılmaz.'
                    : ' teklif kilidi kalkar; talep durumu değişmez.'}{' '}
                  E-posta gitmiş olsa da kuyruktan çıkar.
                </>
              ) : (
                'Bu talep üst yönetim kuyruğundan çıkarılacak.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRecallId(null)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!recallId || recallMut.isPending}
              onClick={() => recallId && recallMut.mutate(recallId)}
            >
              {recallMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Kuyruktan çek
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
