'use client';

import { SmokeText } from '@/components/SmokeText';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
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
import { ArrowLeft, Check, Loader2, Trash2, X } from 'lucide-react';
import { DetailSkeleton } from '@/components/page/Skeleton';
import { Dot, IconButton, Initial, PrimaryButton, Tile, TileHeader, fieldClass } from '@/components/page/Page';
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

/** Durum hapı: kenarsız, durum renginde hafif dolgu. */
const statusPillClass: Record<string, string> = {
  DRAFT: 'bg-white/[0.06] text-white/70',
  SUBMITTED: 'bg-brand/[0.12] text-brand',
  APPROVED: 'bg-emerald-400/[0.12] text-emerald-300',
  REJECTED: 'bg-destructive/[0.14] text-[#f2705e]',
  CONVERTED: 'bg-sky-400/[0.12] text-sky-300',
};

const fullDay = (value: string) =>
  new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

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
  const attachments = (data.attachments ?? []) as any[];
  const reviewing = canReview && data.status === 'SUBMITTED';
  const converting = canConvert && data.status === 'APPROVED' && openItems.length > 0;
  const hasAside = reviewing || converting;
  const busy = approveMut.isPending || rejectMut.isPending;
  const back =
    user?.role === 'DEPARTMENT'
      ? { href: '/taleplerim', label: 'Taleplerim' }
      : { href: '/internal-requests', label: 'Birim tedarik talepleri' };
  const meta = [
    data.requesterUnit,
    data.shopDepartment?.collarType === 'BLUE_COLLAR' ? 'Mavi yaka' : null,
    data.shopWorker ? `${data.shopWorker.firstName} ${data.shopWorker.lastName}` : null,
    data.createdAt ? fullDay(data.createdAt) : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn('skel-in mx-auto pb-10', hasAside ? 'max-w-6xl' : 'max-w-3xl')}>
      <DocumentTitle topic="Birim tedarik talebi" detail={data.title} />

      <Link
        href={back.href}
        className="group/back mb-5 inline-flex items-center gap-1.5 text-[13px] text-white/45 outline-none transition-colors duration-200 hover:text-white focus-visible:text-white"
      >
        <ArrowLeft className="size-4 transition-transform duration-200 ease-out group-hover/back:-translate-x-0.5" />
        {back.label}
      </Link>

      {/* Başlık kutusuz: büyük ad, altında kim / ne zaman / ne zamana lazım; sağda durum ve silme. */}
      <header className="flex flex-col gap-4 pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-white [overflow-wrap:anywhere] sm:text-[32px]">
            <SmokeText text={data.title} />
          </h1>
          {meta.length || data.neededBy ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-white/50">
              {meta.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 ? <Dot /> : null}
                  <span>{part}</span>
                </Fragment>
              ))}
              {data.neededBy ? (
                <>
                  {meta.length ? <Dot /> : null}
                  <span className="text-white/80">Lazım: {fullDay(data.neededBy)}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium',
              statusPillClass[data.status] || 'bg-white/[0.06] text-white/70',
            )}
          >
            {statusLabel[data.status] || data.status}
          </span>
          {canDeleteAny ? (
            <IconButton label="Talebi sil" tone="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
            </IconButton>
          ) : null}
        </div>
      </header>

      {/* Solda talebin kendisi; incelenecek ya da tedarik talebine çevrilecekse sağda, kaydırırken sabit
       * duran karar paneli. */}
      <div className={cn('grid items-start gap-4', hasAside && 'lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5')}>
        <div className="min-w-0 space-y-4">
          {data.description ? (
            <Tile>
              <TileHeader title="Açıklama" />
              <div className="px-6 py-5">
                <RichBody text={data.description} requestId={id} className="text-[14px] leading-relaxed text-white/80" />
              </div>
            </Tile>
          ) : null}

          {data.internalNote ? (
            <section className="rounded-[22px] border border-brand/20 bg-brand/[0.04] px-6 py-5">
              <p className="text-[12px] font-medium text-brand/90">İç not · tedarikçiyle paylaşılmaz</p>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-white/80">{data.internalNote}</p>
            </section>
          ) : null}

          <UnitRequestLines
            requestId={id}
            items={data.items || []}
            splits={splits}
            onDownload={download}
            selectable={converting}
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

          {attachments.length > 0 ? (
            <Tile>
              <TileHeader title="Ekler" aside={attachments.length} />
              <div className="flex flex-wrap gap-2.5 px-6 py-5">
                {attachments.map((att) =>
                  isImageFile(att.originalName, att.mimeType) ? (
                    <AuthImage
                      key={att.id}
                      requestId={id}
                      attachmentId={att.id}
                      className="h-24 w-24 rounded-[14px] object-cover"
                    />
                  ) : (
                    <DocCard
                      key={att.id}
                      name={att.originalName}
                      size={att.size}
                      mime={att.mimeType}
                      onOpen={() => download(att.id, att.originalName)}
                    />
                  ),
                )}
              </div>
            </Tile>
          ) : null}

          <ReviewNote note={data.reviewNote} author={data.reviewedBy?.name} at={data.reviewedAt} />
          {chatOpen && <RequestThread requestId={id} />}
        </div>

        {hasAside ? (
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
            {reviewing ? (
              <Tile>
                <TileHeader title="İnceleme" aside={selectedIds.length ? `${selectedIds.length} kişi seçili` : null} />
                <div className="space-y-5 p-5">
                  <div>
                    <p className="text-[13.5px] font-medium text-white/90">Kime atansın?</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-white/45">
                      Talebi takip edecek satın alma personelini seçin.
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {staff.map((person) => {
                        const selected = selectedIds.includes(person.id);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleStaff(person.id)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/40',
                              selected
                                ? 'border-brand/50 bg-brand/[0.08]'
                                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]',
                            )}
                          >
                            <Initial name={person.name} className="size-8 text-[12px] ring-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-white">{person.name}</span>
                              <span className="block truncate text-[12px] text-white/45">{person.email}</span>
                            </span>
                            <span
                              className={cn(
                                'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                                selected ? 'border-brand bg-brand text-[#141416]' : 'border-white/20',
                              )}
                            >
                              {selected ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                            </span>
                          </button>
                        );
                      })}
                      {staff.length === 0 ? (
                        <p className="rounded-[14px] border border-dashed border-white/[0.08] py-5 text-center text-[12.5px] text-white/35">
                          Atanabilecek personel yok
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <Textarea
                    placeholder="Not (isteğe bağlı)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={cn(fieldClass, 'h-auto min-h-[88px] resize-none px-3.5 py-3 shadow-none')}
                  />

                  <div className="space-y-2">
                    <PrimaryButton
                      className="w-full"
                      disabled={!selectedIds.length || busy}
                      onClick={() => approveMut.mutate()}
                      icon={approveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    >
                      Onayla ve ata
                    </PrimaryButton>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => rejectMut.mutate()}
                      className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border border-white/[0.1] text-[14px] font-medium text-white/70 outline-none transition-colors duration-200 hover:border-destructive/60 hover:bg-destructive/10 hover:text-[#f2705e] focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {rejectMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                      Reddet
                    </button>
                    {!selectedIds.length ? (
                      <p className="pt-1 text-center text-[12px] text-white/35">Onaylamak için en az bir kişi seçin.</p>
                    ) : null}
                  </div>
                </div>
              </Tile>
            ) : null}

            {converting ? (
              <Tile>
                <TileHeader title="Tedarik talebi aç" aside={`${picked.length}/${openItems.length} kalem`} />
                <div className="space-y-4 p-5">
                  <p className="text-[12.5px] leading-relaxed text-white/45">
                    Boya ayrı, metal ayrı gidecekse kalemleri seçip her grup için kendi adını yazın.
                  </p>
                  <label className="block">
                    <span className="text-[13.5px] font-medium text-white/90">Talebin adı</span>
                    <Input
                      value={rfqTitle}
                      onChange={(e) => setRfqTitle(e.target.value)}
                      placeholder={data.title || 'Örneğin boya alımı'}
                      maxLength={200}
                      className={cn(fieldClass, 'mt-2 px-3.5 shadow-none')}
                    />
                  </label>
                  <PrimaryButton
                    className="h-12 w-full"
                    disabled={convertMut.isPending || picked.length === 0}
                    onClick={() => convertMut.mutate({ itemIds: picked, title: rfqTitle.trim() })}
                    icon={convertMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  >
                    {picked.length === openItems.length && splits.length === 0
                      ? 'Tedarikçi talebi oluştur'
                      : `Seçilen ${picked.length} kalemle talep aç`}
                  </PrimaryButton>
                </div>
              </Tile>
            ) : null}
          </aside>
        ) : null}
      </div>

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
