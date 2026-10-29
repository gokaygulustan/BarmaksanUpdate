'use client';

import { SmokeText } from '@/components/SmokeText';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { internalRequestsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { DetailSkeleton } from '@/components/page/Skeleton';
import {
  BirimTalepForm,
  isBirimTalepEditable,
  type BirimTalepExisting,
} from '@/components/internal-request/BirimTalepForm';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { resolvePipeline } from '@/lib/requestPipeline';
import { RequestPipelineBoard } from '@/components/RequestPipelineBoard';
import { RequestThread, ReviewNote } from '@/components/RequestThread';
import { RichBody, AuthImage } from '@/components/RichBody';
import { DocCard } from '@/components/ChatMedia';
import { isImageFile } from '@/lib/richHtml';
import { DocumentTitle } from '@/components/DocumentTitle';
import { UnitRequestLines, type UnitSplit } from '@/components/internal-request/UnitRequestLines';

export default function TalepDetayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const viewing = searchParams.get('gor') === '1';
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['birim-request', id],
    retry: 1,
    queryFn: async () => (await internalRequestsApi.getById(id)).data as BirimTalepExisting & Record<string, any>,
  });

  const apiMessage = (e: unknown) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const deleteMutation = useMutation({
    mutationFn: () => internalRequestsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['birim-board-counts'] });
      toast.success('Taslak silindi.');
      router.push('/taleplerim');
    },
    onError: (e) => toast.error(apiMessage(e) || 'Silinemedi.'),
  });

  const download = async (attachmentId: string, name: string) => {
    try {
      const res = await internalRequestsApi.downloadAttachment(id, attachmentId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Dosya indirilemedi');
    }
  };

  if (isLoading) return <DetailSkeleton />;

  // Hata durumunda sonsuz dönen spinner yerine nedenini göster.
  if (isError || !data) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    const message =
      (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ||
      (status === 404
        ? 'Talep bulunamadı; silinmiş olabilir.'
        : 'Talep açılamadı. Sayfayı yenileyin; sorun sürerse satın alma birimine bildirin.');
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold">{message}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/taleplerim')}>
          Taleplerim&apos;e dön
        </Button>
      </div>
    );
  }

  const pipeline = resolvePipeline(data.status, data.procurementStatus);
  const isDraft = data.status === 'DRAFT';
  const isOwner = Boolean(user?.id && data.createdBy?.id === user.id);
  const canForceDelete = user?.role === 'ADMIN' || Boolean(user?.isExecutive);
  const canEdit = Boolean(isOwner && isBirimTalepEditable(data));
  const editing = canEdit && !viewing;

  if (editing) {
    return (
      <BirimTalepForm
        key={data.id}
        draft={data}
        backHref="/taleplerim"
        onCancel={() => router.replace(`/taleplerim/${data.id}?gor=1`)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DocumentTitle topic="Talebim" detail={data.title} />
      <div>
        <Button variant="ghost" className="mb-2 px-0 text-muted-foreground" onClick={() => router.push('/taleplerim')}>
          ← Taleplerim
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold"><SmokeText text={data.title} /></h1>
          {canEdit ? (
            <Button className="gap-2" onClick={() => router.replace(`/taleplerim/${data.id}`)}>
              <Pencil className="h-4 w-4" />
              Talebi düzenle
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.requesterUnit ? `${data.requesterUnit} · ` : ''}
          {data.createdAt ? format(new Date(data.createdAt), 'dd MMMM yyyy HH:mm', { locale: tr }) : ''}
          {data.neededBy
            ? ` · lazım ${format(new Date(data.neededBy), 'dd MMMM yyyy', { locale: tr })}`
            : ''}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-snug text-foreground/80">{pipeline.caption}</p>
      </div>

      {isDraft && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Bu talep henüz gönderilmedi</p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            Taslak yalnızca sizde durur; gönderene kadar satın alma birimi bu talebi görmez ve üzerinde
            işlem yapmaz.
          </p>
          {(isOwner || canForceDelete) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  className="gap-2"
                  disabled={deleteMutation.isPending}
                  onClick={() => router.replace(`/taleplerim/${data.id}`)}
                >
                  <Pencil className="h-4 w-4" />
                  Düzenle ve gönder
                </Button>
              )}
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm('Bu taslak silinsin mi? Geri alınamaz.')) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Taslağı sil
              </Button>
            </div>
          )}
        </div>
      )}

      <RequestPipelineBoard status={data.status} procurementStatus={data.procurementStatus} />

      {data.description && (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="bg-black/20 px-3 py-2 text-sm text-muted-foreground">Talep açıklaması</div>
          <div className="p-3">
            <RichBody text={data.description} requestId={id} className="text-sm" />
          </div>
        </div>
      )}

      {(data.items?.length ?? 0) > 0 && (
        <UnitRequestLines
          requestId={id}
          items={data.items || []}
          splits={(data.splits || []) as UnitSplit[]}
          onDownload={download}
        />
      )}

      {data.reviewNote && (
        <ReviewNote note={data.reviewNote} author={data.reviewedBy?.name} at={data.reviewedAt} />
      )}

      {(data.attachments?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ekler</p>
          <div className="flex flex-wrap gap-2">
            {(data.attachments ?? []).map((att: any) =>
              isImageFile(att.originalName, att.mimeType) ? (
                <AuthImage
                  key={att.id}
                  requestId={id}
                  attachmentId={att.id}
                  className="h-24 w-24 rounded-lg object-cover"
                />
              ) : (
                <DocCard
                  key={att.id}
                  name={att.originalName}
                  size={att.size}
                  mime={att.mimeType}
                  onOpen={() => download(att.id, att.originalName)}
                />
              )
            )}
          </div>
        </div>
      )}

      {['APPROVED', 'CONVERTED'].includes(data.status) && <RequestThread requestId={id} />}
    </div>
  );
}
