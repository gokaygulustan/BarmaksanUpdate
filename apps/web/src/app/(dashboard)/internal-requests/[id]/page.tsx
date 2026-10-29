'use client';

import { SmokeText } from '@/components/SmokeText';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { internalRequestsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { canReviewUnitRequest } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UnitRequestLines, type UnitSplit } from '@/components/internal-request/UnitRequestLines';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { DetailSkeleton } from '@/components/page/Skeleton';
import { toast } from 'sonner';
import { RequestThread, ReviewNote } from '@/components/RequestThread';
import { RichBody, AuthImage } from '@/components/RichBody';
import { DocCard } from '@/components/ChatMedia';
import { isImageFile } from '@/lib/richHtml';
import { cn } from '@/lib/utils';
import { DocumentTitle } from '@/components/DocumentTitle';

const statusLabel: Record<string, string> = {
  DRAFT: 'Taslak',
  SUBMITTED: 'İnceleme bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  CONVERTED: 'Tedarikçi talebi açıldı',
};

const statusBadgeClass: Record<string, string> = {
  DRAFT: 'border-white/20 bg-white/10 text-white/80',
  SUBMITTED: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
  APPROVED: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  REJECTED: 'border-destructive/40 bg-destructive/15 text-destructive',
  CONVERTED: 'border-primary/40 bg-primary/15 text-primary',
};

type StaffUser = { id: string; name: string; email: string };

export default function InternalRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [rfqTitle, setRfqTitle] = useState('');
  const canDeleteAny = user?.role === 'ADMIN' || Boolean(user?.isExecutive);

  const { data, isLoading } = useQuery({
    queryKey: ['internal-request', id],
    queryFn: async () => (await internalRequestsApi.getById(id)).data,
  });
  const canReview = canReviewUnitRequest(user, data?.moduleId);

  const { data: staff = [] } = useQuery({
    queryKey: ['internal-request-assignees', data?.moduleId],
    queryFn: async () => (await internalRequestsApi.listAssignees(data?.moduleId)).data as StaffUser[],
    enabled: canReview && Boolean(data?.moduleId),
  });

  const assignedIds = (data?.assignees || []).map((a: StaffUser) => a.id);
  const sameUnitStaff =
    user?.role === 'PURCHASING' &&
    user.subRole !== 'MANAGER' &&
    user.moduleId === (data?.moduleId || 'SATIN_ALMA');
  const canConvert = canReview || (sameUnitStaff && assignedIds.includes(user?.id || ''));
  const chatOpen = data?.status === 'APPROVED' || data?.status === 'CONVERTED';
  const openKey = (data?.items || [])
    .filter((item: { procurementRequestId?: string | null }) => !item.procurementRequestId)
    .map((item: { id: string }) => item.id)
    .join('|');
  const splitCount = (data?.splits || []).length;
  useEffect(() => {
    if (!data) return;
    setPicked(openKey ? openKey.split('|') : []);
    setRfqTitle(splitCount ? '' : data.title || '');
  }, [openKey, splitCount, data?.id, data?.title]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['internal-request', id] });
    qc.invalidateQueries({ queryKey: ['birim-request', id] });
    qc.invalidateQueries({ queryKey: ['internal-requests'] });
    qc.invalidateQueries({ queryKey: ['sa-inbox-board'] });
    qc.invalidateQueries({ queryKey: ['sa-inbox-counts'] });
    qc.invalidateQueries({ queryKey: ['birim-board'] });
    qc.invalidateQueries({ queryKey: ['birim-board-counts'] });
  };

  const toggleStaff = (staffId: string) => {
    setSelectedIds((prev) => (prev.includes(staffId) ? prev.filter((x) => x !== staffId) : [...prev, staffId]));
  };

  const approveMut = useMutation({
    mutationFn: () => internalRequestsApi.approve(id, note, selectedIds),
    onSuccess: () => {
      toast.success('Onaylandı');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Hata'),
  });
  const rejectMut = useMutation({
    mutationFn: () => internalRequestsApi.reject(id, note),
    onSuccess: () => {
      toast.success('Reddedildi');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Hata'),
  });
  const convertMut = useMutation({
    mutationFn: (body: { itemIds: string[]; title: string }) => internalRequestsApi.convert(id, body),
    onSuccess: (res) => {
      toast.success('Tedarikçi talebi oluşturuldu');
      invalidate();
      const rfqId = res.data?.createdProcurementRequestId as string | undefined;
      if (!rfqId) return;
      router.push(`/procurement/new?edit=${rfqId}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Hata'),
  });

  const deleteMut = useMutation({
    mutationFn: () => internalRequestsApi.remove(id),
    onSuccess: () => {
      toast.success('Talep silindi');
      setDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ['internal-requests'] });
      qc.invalidateQueries({ queryKey: ['sa-inbox-board'] });
      router.push('/internal-requests');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Silme işlemi başarısız'),
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

  if (isLoading || !data) return <DetailSkeleton />;

  const splits = (data.splits || []) as UnitSplit[];
  const openItems = (data.items || []).filter((item: { procurementRequestId?: string | null }) => !item.procurementRequestId);

  return (
    <div className="skel-in max-w-4xl mx-auto space-y-4">
      <DocumentTitle topic="Birim tedarik talebi" detail={data.title} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold"><SmokeText text={data.title} /></h1>
          {(data.requesterUnit || data.neededBy || data.shopWorker) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.requesterUnit || ''}
              {data.shopDepartment?.collarType === 'BLUE_COLLAR' ? ' · mavi yaka' : ''}
              {data.shopWorker
                ? ` · ${data.shopWorker.firstName} ${data.shopWorker.lastName}`
                : ''}
              {data.neededBy
                ? `${data.requesterUnit || data.shopWorker ? ' · ' : ''}lazım ${new Date(data.neededBy).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`
                : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDeleteAny && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-destructive/45 px-3 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Sil
            </Button>
          )}
          <span
            className={cn(
              'inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold tracking-wide',
              statusBadgeClass[data.status] || 'border-border bg-muted text-foreground'
            )}
          >
            {statusLabel[data.status] || data.status}
          </span>
        </div>
      </div>
      {data.description && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-black/20 px-3 py-2 text-sm text-muted-foreground">Talep açıklaması</div>
          <div className="p-3">
            <RichBody text={data.description} requestId={id} className="text-sm" />
          </div>
        </div>
      )}
      {data.internalNote && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <div className="border-b border-amber-500/15 px-3 py-2 text-sm text-muted-foreground">
            İç not · tedarikçiyle paylaşılmaz
          </div>
          <div className="p-3 whitespace-pre-line text-sm">{data.internalNote}</div>
        </div>
      )}
      <UnitRequestLines
        requestId={id}
        items={data.items || []}
        splits={splits}
        onDownload={download}
        selectable={canConvert && data.status === 'APPROVED' && openItems.length > 0}
        picked={picked}
        onToggle={(itemId) =>
          setPicked((prev) => (prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]))
        }
        hrefFor={
          user?.role === 'DEPARTMENT'
            ? undefined
            : (split) =>
                split.status === 'DRAFT' ? `/procurement/new?edit=${split.id}` : `/procurement/${split.id}`
        }
      />
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
      <ReviewNote note={data.reviewNote} author={data.reviewedBy?.name} at={data.reviewedAt} />
      {canReview && data.status === 'SUBMITTED' && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Personel</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {staff.map((person) => {
              const selected = selectedIds.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => toggleStaff(person.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                    selected ? 'border-primary bg-primary/10' : 'border-white/10 bg-black/20 hover:bg-white/5'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/20'
                    )}
                  >
                    {selected ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{person.name}</span>
                    <span className="block text-xs text-muted-foreground">{person.email}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Textarea placeholder="Not (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button disabled={!selectedIds.length || approveMut.isPending} onClick={() => approveMut.mutate()}>
              Onayla
            </Button>
            <Button variant="outline" onClick={() => rejectMut.mutate()}>
              Reddet
            </Button>
          </div>
        </div>
      )}
      {chatOpen && <RequestThread requestId={id} />}
      {canConvert && data.status === 'APPROVED' && openItems.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tedarik talebinin adı</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Boya ayrı, metal ayrı gidecekse kalemleri seçip her grup için kendi adını yazın.
            </p>
          </div>
          <Input
            value={rfqTitle}
            onChange={(e) => setRfqTitle(e.target.value)}
            placeholder={data.title || 'Örneğin boya alımı'}
            maxLength={200}
          />
          <button
            type="button"
            disabled={convertMut.isPending || picked.length === 0}
            onClick={() => convertMut.mutate({ itemIds: picked, title: rfqTitle.trim() })}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-60"
          >
            {convertMut.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : picked.length === openItems.length && splits.length === 0 ? (
              'Tedarikçi talebi oluştur'
            ) : (
              `Seçilen ${picked.length} kalemden tedarik talebi aç`
            )}
          </button>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleteMut.isPending && setDeleteOpen(open)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Talebi sil</DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">{data.title}</span> kalıcı olarak silinecek.
              Yazışmalar ve ekler de kaldırılır. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteMut.isPending}>
              Vazgeç
            </Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              {deleteMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
