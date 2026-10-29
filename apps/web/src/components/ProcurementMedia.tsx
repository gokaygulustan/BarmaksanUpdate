'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Expand, FileText, ImageIcon, ImagePlus, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { procurementApi } from '@/lib/api';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ALLOWED_LABEL,
  splitAllowedAttachmentFiles,
} from '@/lib/allowed-attachment-files';
import { formatBytes, isImageFile, isPdfFile } from '@/lib/richHtml';
import { cn } from '@/lib/utils';

export type ProcurementAttachment = {
  id: string;
  originalName: string;
  mimeType?: string | null;
  size?: number;
  kind?: string | null;
  vendorId?: string | null;
  itemId?: string | null;
  marketSourceId?: string | null;
  vendor?: { id?: string; name?: string } | null;
  item?: { id?: string; productName?: string } | null;
};

type ItemOption = { id: string; productName: string };

type MediaSource =
  | { mode: 'auth'; requestId: string; attachmentId: string }
  | { mode: 'token'; token: string; attachmentId: string }
  | { mode: 'overLimit'; token: string; requestId: string; attachmentId: string };

async function fetchMediaBlob(source: MediaSource) {
  if (source.mode === 'auth') {
    return procurementApi.fetchAttachmentBlob(source.requestId, source.attachmentId);
  }
  if (source.mode === 'token') {
    return procurementApi.fetchTokenAttachmentBlob(source.token, source.attachmentId);
  }
  return procurementApi.fetchOverLimitAttachmentBlob(
    source.token,
    source.requestId,
    source.attachmentId
  );
}

function MediaLightbox({
  url,
  name,
  mime,
  onClose,
  onDownload,
}: {
  url: string;
  name: string;
  mime?: string | null;
  onClose: () => void;
  onDownload?: () => void;
}) {
  const pdf = isPdfFile(name, mime || undefined);
  const image = isImageFile(name, mime || undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium text-white/90">{name}</p>
        <div className="flex shrink-0 items-center gap-2">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
            >
              <Download className="h-3.5 w-3.5" />
              İndir
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6" onClick={onClose}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={name}
            className="max-h-full max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {pdf && (
          <iframe
            title={name}
            src={url}
            className="h-full w-full max-w-5xl rounded-md bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {!image && !pdf && (
          <div
            className="rounded-xl border border-white/15 bg-white/5 px-6 py-8 text-center text-sm text-white/80"
            onClick={(e) => e.stopPropagation()}
          >
            Bu dosya türü önizlenemiyor.
            {onDownload && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onDownload}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#D9B625] px-3 py-2 text-xs font-bold text-black"
                >
                  <Download className="h-3.5 w-3.5" />
                  İndir
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function useAttachmentObjectUrl(source: MediaSource | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!source) {
      setUrl(null);
      setError(false);
      return;
    }
    let alive = true;
    let obj = '';
    setLoading(true);
    setError(false);
    fetchMediaBlob(source)
      .then((res) => {
        obj = URL.createObjectURL(res.data);
        if (alive) setUrl(obj);
      })
      .catch(() => {
        if (alive) {
          setUrl(null);
          setError(true);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [
    source?.mode,
    source && 'requestId' in source ? source.requestId : null,
    source && 'token' in source ? source.token : null,
    source?.attachmentId,
  ]);

  return { url, loading, error };
}

function ThumbCard({
  attachment,
  label,
  dark,
  source,
  onOpen,
}: {
  attachment: ProcurementAttachment;
  label: string;
  dark?: boolean;
  source: MediaSource;
  onOpen: (url: string) => void;
}) {
  const { url, loading, error } = useAttachmentObjectUrl(
    isImageFile(attachment.originalName, attachment.mimeType || undefined) ? source : null
  );
  const pdf = isPdfFile(attachment.originalName, attachment.mimeType || undefined);
  const image = isImageFile(attachment.originalName, attachment.mimeType || undefined);
  const open = async () => {
    if (url) {
      onOpen(url);
      return;
    }
    try {
      const res = await fetchMediaBlob(source);
      onOpen(URL.createObjectURL(res.data));
    } catch {
      toast.error('Dosya açılamadı.');
    }
  };

  // Uygulamada dosya bir satırdır (Finder listesi gibi): küçük önizleme ya da tür rozeti, tam okunan ad,
  // altında kimin eklediği ve boyutu. Üzerine gelince arkada altın dolgu yükselir, sağda büyüt düğmesi belirir.
  if (!dark) {
    return (
      <button
        type="button"
        onClick={open}
        className="gold-fade gold-fade-x group/file flex w-full min-w-0 items-center gap-3 rounded-[12px] px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.05]">
          {image && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : image && loading ? (
            <Loader2 className="size-4 animate-spin text-white/40" />
          ) : pdf ? (
            <span className="text-[10px] font-semibold tracking-wide text-[#ef5a50]">PDF</span>
          ) : (
            <FileText className="size-[18px] text-white/55" strokeWidth={1.7} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-white">{attachment.originalName}</span>
          <span className="mt-0.5 block truncate text-[12px] text-white/40">
            {label}
            {typeof attachment.size === 'number' ? (
              <span className="tabular-nums"> · {formatBytes(attachment.size)}</span>
            ) : null}
          </span>
        </span>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/25 transition-colors duration-150 group-hover/file:bg-brand group-hover/file:text-primary-foreground"
        >
          <Expand className="size-3.5" strokeWidth={2} />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        if (url) {
          onOpen(url);
          return;
        }
        try {
          const res = await fetchMediaBlob(source);
          const obj = URL.createObjectURL(res.data);
          onOpen(obj);
        } catch {
          toast.error('Dosya açılamadı.');
        }
      }}
      className={cn(
        'group flex w-[148px] flex-col overflow-hidden rounded-[14px] border text-left transition-[border-color,background-color,transform] duration-200',
        dark
          ? 'border-white/15 bg-white/[0.06] hover:border-[#D9B625]/45 hover:bg-white/[0.1]'
          : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.04]'
      )}
    >
      <div
        className={cn(
          'relative flex h-24 items-center justify-center overflow-hidden',
          dark ? 'bg-black/40' : 'bg-black/30'
        )}
      >
        {image && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        )}
        {image && loading && (
          <Loader2 className={cn('h-5 w-5 animate-spin', dark ? 'text-white/50' : 'text-muted-foreground')} />
        )}
        {image && error && <ImageIcon className={cn('h-6 w-6', dark ? 'text-white/35' : 'text-muted-foreground')} />}
        {!image && (
          <span
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-lg text-[10px] font-bold',
              pdf
                ? 'bg-[#E53935] text-white'
                : dark
                  ? 'bg-white/15 text-white'
                  : 'bg-white/[0.08] text-white/70'
            )}
          >
            {pdf ? 'PDF' : <FileText className="h-5 w-5" />}
          </span>
        )}
        {/* Koyu görünümde büyüt düğmesi hep görünür; uygulamada yalnızca üzerine gelince altın düğme belirir. */}
        <span
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200',
            dark
              ? 'bg-black/35 opacity-80 group-hover:opacity-100 group-focus-visible:opacity-100'
              : 'bg-black/30 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border shadow-sm',
              dark
                ? 'border-white/30 bg-black/45 text-white backdrop-blur-[2px]'
                : 'border-transparent bg-brand text-primary-foreground',
            )}
          >
            <Expand className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        </span>
      </div>
      {dark ? (
        <div className="space-y-0.5 px-2.5 py-2">
          <p className="truncate text-[12px] font-medium text-white/90">{attachment.originalName}</p>
          <p className="truncate text-[10px] text-white/45">{label}</p>
          {typeof attachment.size === 'number' && (
            <p className="text-[10px] tabular-nums text-white/35">{formatBytes(attachment.size)}</p>
          )}
        </div>
      ) : (
        <div className="px-3 py-2.5">
          <p className="truncate text-[12.5px] font-medium text-white">{attachment.originalName}</p>
          <p className="mt-0.5 truncate text-[11px] text-white/40">
            {label}
            {typeof attachment.size === 'number' ? (
              <span className="tabular-nums"> · {formatBytes(attachment.size)}</span>
            ) : null}
          </p>
        </div>
      )}
    </button>
  );
}

export function ProcurementMediaPanel({
  attachments,
  items,
  requestId,
  token,
  overLimitToken,
  canUpload,
  vendorMode,
  myVendorId,
  dark,
  onUploaded,
  title = 'Fotoğraf / belgeler',
  description,
  simple = false,
  hideHeader = false,
  sideBySide = false,
}: {
  attachments: ProcurementAttachment[] | null | undefined;
  items: ItemOption[];
  requestId?: string;
  token?: string;
  overLimitToken?: string;
  canUpload?: boolean;
  vendorMode?: boolean;
  myVendorId?: string | null;
  dark?: boolean;
  onUploaded?: () => void;
  title?: string;
  description?: string;
  /** Tek liste; satın alma / tedarikçi ayrımı yok (üst onay kutusu birim ekleri). */
  simple?: boolean;
  hideHeader?: boolean;
  /** Satın alma + tedarikçi kutularını yan yana göster. */
  sideBySide?: boolean;
}) {
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    mime?: string | null;
    attachmentId: string;
    revoke?: boolean;
  } | null>(null);

  const list = useMemo(
    () => (attachments || []).filter((a) => a.kind !== 'INVOICE' && !a.itemId && !a.marketSourceId),
    [attachments]
  );

  const buyerList = useMemo(
    () => list.filter((a) => !a.vendorId),
    [list]
  );
  const vendorOwnList = useMemo(
    () =>
      vendorMode
        ? list.filter((a) => a.vendorId && (!myVendorId || a.vendorId === myVendorId))
        : list.filter((a) => Boolean(a.vendorId)),
    [list, vendorMode, myVendorId]
  );

  const vendorGroups = useMemo(() => {
    const map = new Map<string, { name: string; rows: ProcurementAttachment[] }>();
    for (const a of list.filter((x) => x.vendorId)) {
      const key = a.vendorId || 'unknown';
      const name = a.vendor?.name?.trim() || 'Tedarikçi';
      const cur = map.get(key) || { name, rows: [] };
      cur.rows.push(a);
      map.set(key, cur);
    }
    return [...map.values()];
  }, [list]);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      if (vendorMode && token) {
        return procurementApi.uploadVendorAttachmentsByToken(token, fd);
      }
      if (!requestId) throw new Error('requestId gerekli');
      return procurementApi.uploadAttachments(requestId, fd);
    },
    onSuccess: () => {
      toast.success('Dosyalar yüklendi.');
      onUploaded?.();
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Dosya yüklenemedi.');
    },
  });

  const handleFiles = (listFiles: FileList | null) => {
    if (!listFiles?.length) return;
    const { accepted, rejected } = splitAllowedAttachmentFiles(Array.from(listFiles));
    if (rejected.length) {
      toast.error(`Desteklenmeyen dosya türü: ${rejected.map((f) => f.name).join(', ')}`);
    }
    if (accepted.length) uploadMutation.mutate(accepted);
  };

  const downloadOne = async (a: ProcurementAttachment) => {
    try {
      const source: MediaSource | null = overLimitToken && requestId
        ? { mode: 'overLimit', token: overLimitToken, requestId, attachmentId: a.id }
        : token
          ? { mode: 'token', token, attachmentId: a.id }
          : requestId
            ? { mode: 'auth', requestId, attachmentId: a.id }
            : null;
      if (!source) return;
      const res = await fetchMediaBlob(source);
      const url = URL.createObjectURL(res.data);
      const el = document.createElement('a');
      el.href = url;
      el.download = a.originalName;
      el.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('İndirme başarısız.');
    }
  };

  const resolveSource = (attachmentId: string): MediaSource | null => {
    if (overLimitToken && requestId) {
      return { mode: 'overLimit', token: overLimitToken, requestId, attachmentId };
    }
    if (token) return { mode: 'token', token, attachmentId };
    if (requestId) return { mode: 'auth', requestId, attachmentId };
    return null;
  };

  // Tedarikçi teklif paneli: içerik yoksa gizle. Satın alma inceleme: boş kutular da gösterilsin.
  if (vendorMode && !list.length && !canUpload) return null;

  const renderThumbs = (rows: ProcurementAttachment[], labelFor: (a: ProcurementAttachment) => string) => (
    <div className={dark ? 'flex flex-wrap gap-2.5' : '-mx-2.5 flex flex-col gap-0.5'}>
      {rows.map((a) => {
        const source = resolveSource(a.id);
        if (!source) return null;
        return (
          <ThumbCard
            key={a.id}
            attachment={a}
            label={labelFor(a)}
            dark={dark}
            source={source}
            onOpen={(url) =>
              setPreview({
                url,
                name: a.originalName,
                mime: a.mimeType,
                attachmentId: a.id,
                revoke: !isImageFile(a.originalName, a.mimeType || undefined),
              })
            }
          />
        );
      })}
    </div>
  );

  const uploadZone = (
    <div className="space-y-2">
      <p className={cn('text-[11px] leading-snug', dark ? 'text-white/55' : 'text-muted-foreground')}>
        {ATTACHMENT_ALLOWED_LABEL} Fotoğraf ve PDF tıklanınca önizlenir.
      </p>
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 transition-colors',
          dark
            ? 'border-white/15 bg-white/[0.05] hover:border-[#D9B625]/40 hover:bg-white/[0.08]'
            : 'border-border/70 bg-background/50 hover:border-primary/50 hover:bg-background/80',
          uploadMutation.isPending && 'pointer-events-none opacity-60'
        )}
      >
        <input
          type="file"
          multiple
          className="hidden"
          accept={ATTACHMENT_ACCEPT}
          disabled={uploadMutation.isPending}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {uploadMutation.isPending ? (
          <Loader2
            className={cn(
              'mb-2 h-8 w-8 animate-spin opacity-80',
              dark ? 'text-[#D9B625]' : 'text-primary'
            )}
          />
        ) : (
          <Paperclip
            className={cn(
              'mb-2 h-8 w-8 opacity-80',
              dark ? 'text-[#D9B625]' : 'text-muted-foreground'
            )}
          />
        )}
        <span className={cn('text-sm font-semibold', dark ? 'text-white/90' : 'text-foreground')}>
          {uploadMutation.isPending ? 'Yükleniyor…' : 'Dosya seç veya sürükle'}
        </span>
        <span className={cn('mt-1 text-[11px]', dark ? 'text-white/55' : 'text-muted-foreground')}>
          {vendorMode ? 'Dosyalar sizin teklifinize eklenir' : 'Birden fazla seçebilirsiniz'}
        </span>
      </label>
    </div>
  );

  return (
    <div className="space-y-3">
      {!hideHeader && !dark && (
        <div>
          <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">{title}</h3>
          <p className="mt-1 text-[13px] leading-snug text-white/40">
            {description || 'Tıklayınca fotoğraf ve PDF doğrudan açılır.'}
          </p>
        </div>
      )}
      {!hideHeader && dark && (
        <p className="text-xs font-bold uppercase tracking-wider text-[#D9B625] flex items-center gap-2">
          <Paperclip className="h-4 w-4 shrink-0 opacity-90" />
          {title}
        </p>
      )}

      {simple ? (
        <div className="space-y-2">
          {list.length > 0 ? (
            renderThumbs(list, (a) => (a.vendor?.name ? a.vendor.name : 'Ek'))
          ) : (
            <p className={cn('text-[11px]', dark ? 'text-white/40' : 'text-muted-foreground')}>
              Dosya yok.
            </p>
          )}
          {canUpload && uploadZone}
        </div>
      ) : vendorMode ? (
        <div className="space-y-4">
          {buyerList.length > 0 && (
            <div
              className={cn(
                'space-y-2.5 rounded-xl border p-3',
                dark ? 'border-white/10 bg-black/30' : 'border-border/60 bg-muted/15'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    'text-[10px] font-black uppercase tracking-[0.14em]',
                    dark ? 'text-white/70' : 'text-muted-foreground'
                  )}
                >
                  Satın almanın ekleri
                </p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                    dark ? 'bg-white/10 text-white/55' : 'bg-muted text-muted-foreground'
                  )}
                >
                  Salt okunur
                </span>
              </div>
              <p className={cn('text-[11px] leading-snug', dark ? 'text-white/45' : 'text-muted-foreground')}>
                Satın alma biriminin talebe eklediği genel dosyalar.
              </p>
              {renderThumbs(buyerList, () => 'Satın alma')}
            </div>
          )}

          <div
            className={cn(
              'space-y-2.5 rounded-xl border p-3',
              dark ? 'border-[#D9B625]/35 bg-[rgba(217,182,37,0.07)]' : 'border-primary/30 bg-primary/5'
            )}
          >
            <p
              className={cn(
                'text-[10px] font-black uppercase tracking-[0.14em]',
                dark ? 'text-[#D9B625]' : 'text-primary'
              )}
            >
              Sizin ekleriniz
            </p>
            <p className={cn('text-[11px] leading-snug', dark ? 'text-white/55' : 'text-muted-foreground')}>
              Teklifinize eklediğiniz dosyalar. Kaleme özel ekleri ilgili kalemin altından ekleyebilirsiniz.
            </p>
            {vendorOwnList.length > 0 ? (
              renderThumbs(vendorOwnList, () => 'Sizin teklifiniz')
            ) : (
              <p className={cn('text-[11px]', dark ? 'text-white/40' : 'text-muted-foreground')}>
                Henüz dosya eklemediniz.
              </p>
            )}
            {canUpload && uploadZone}
          </div>
        </div>
      ) : (
        // Uygulamada iki grup tek kutuda, kutusuz iki sütun: aralarında yalnızca ince bir çizgi.
        <div
          className={cn(
            dark
              ? cn('gap-4', sideBySide ? 'grid sm:grid-cols-2' : 'space-y-4')
              : 'grid divide-y divide-white/[0.06] overflow-hidden rounded-[22px] border border-white/[0.07] bg-card md:grid-cols-2 md:divide-x md:divide-y-0'
          )}
        >
          <div
            className={cn(
              dark ? 'space-y-2.5 rounded-xl border border-[#D9B625]/35 bg-[rgba(217,182,37,0.07)] p-3' : 'space-y-3 p-5'
            )}
          >
            <p
              className={cn(
                dark
                  ? 'text-[10px] font-black uppercase tracking-[0.14em] text-[#D9B625]'
                  : 'flex items-baseline gap-2 text-[13.5px] font-medium text-white'
              )}
            >
              Satın alma ekleri
              {!dark && buyerList.length > 0 ? (
                <span className="text-[12px] font-normal tabular-nums text-white/35">{buyerList.length}</span>
              ) : null}
            </p>
            <p className={cn('leading-snug', dark ? 'text-[11px] text-white/55' : 'text-[12.5px] text-white/40')}>
              Satın almanın bu talebe eklediği genel dosyalar. Kaleme özel dosyalar ilgili kalemin altındadır.
            </p>
            {buyerList.length > 0 ? (
              renderThumbs(buyerList, () => 'Satın alma')
            ) : (
              <p className={cn(dark ? 'text-[11px] text-white/40' : 'text-[12.5px] text-white/30')}>
                Henüz genel ek yok.
              </p>
            )}
            {canUpload && uploadZone}
          </div>

          <div className={cn(dark ? 'space-y-2.5 rounded-xl border border-white/10 bg-black/30 p-3' : 'space-y-3 p-5')}>
            <p
              className={cn(
                dark
                  ? 'text-[10px] font-black uppercase tracking-[0.14em] text-white/70'
                  : 'text-[13.5px] font-medium text-white'
              )}
            >
              Tedarikçi ekleri
            </p>
            <p className={cn('leading-snug', dark ? 'text-[11px] text-white/45' : 'text-[12.5px] text-white/40')}>
              Tedarikçilerin teklif sürecinde yüklediği genel dosyalar.
            </p>
            {vendorGroups.length > 0 ? (
              <div className="space-y-3">
                {vendorGroups.map((g) => (
                  <div key={g.name} className="space-y-2">
                    <p className={cn(dark ? 'text-[11px] font-semibold text-white/80' : 'text-[12.5px] text-white/60')}>
                      {g.name}
                    </p>
                    {renderThumbs(g.rows, () => g.name)}
                  </div>
                ))}
              </div>
            ) : (
              <p className={cn(dark ? 'text-[11px] text-white/40' : 'text-[12.5px] text-white/30')}>
                Tedarikçiden henüz genel dosya yok.
              </p>
            )}
          </div>
        </div>
      )}

      {preview && (
        <MediaLightbox
          url={preview.url}
          name={preview.name}
          mime={preview.mime}
          onClose={() => {
            if (preview.revoke) URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
          onDownload={() => {
            const a = list.find((x) => x.id === preview.attachmentId);
            if (a) void downloadOne(a);
          }}
        />
      )}
    </div>
  );
}

const MAX_ITEM_PENDING = 8;

function PendingLocalThumb({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const image = isImageFile(file.name, file.type);
  return (
    <span className="block h-20 w-20 overflow-hidden rounded-[10px] bg-black/40 ring-1 ring-white/10">
      {image && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center">
          <FileText className="h-4 w-4 text-white/60" />
          <span className="line-clamp-2 text-[9px] leading-tight text-white/55">{file.name}</span>
        </span>
      )}
    </span>
  );
}

function ItemMediaWell({
  dark,
  over,
  count,
  max,
  full,
  disabled,
  onOver,
  onTake,
  thumbs,
}: {
  dark?: boolean;
  over: boolean;
  count: number;
  max: number;
  full: boolean;
  disabled?: boolean;
  onOver: (next: boolean) => void;
  onTake: (list: FileList | null) => void;
  thumbs: ReactNode;
}) {
  const fileInput = (
    <input
      type="file"
      multiple
      className="hidden"
      accept={ATTACHMENT_ACCEPT}
      disabled={disabled}
      onChange={(e) => {
        onTake(e.target.files);
        e.target.value = '';
      }}
    />
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!full && !disabled) onOver(true);
      }}
      onDragLeave={() => onOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        onOver(false);
        if (!disabled) onTake(e.dataTransfer.files);
      }}
      // Sakin, tek satırlık bırakma alanı: büyük harf ve simge kutusu yok; üzerine gelince kenar ve
      // simge altına döner. Dosya eklenince aynı kutuda küçük resimler dizilir.
      className={cn(
        'group/well rounded-[12px] border border-dashed transition-colors duration-200',
        disabled && 'pointer-events-none opacity-60',
        over
          ? dark
            ? 'border-[#D9B625]/60 bg-[#D9B625]/[0.06]'
            : 'border-primary bg-primary/10'
          : dark
            ? 'border-white/[0.1] hover:border-[#D9B625]/40'
            : 'border-border hover:border-primary/40'
      )}
    >
      {count === 0 ? (
        <label
          title={`PNG, JPG veya belge · en fazla ${max} dosya`}
          className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5"
        >
          {disabled ? (
            <Loader2 className={cn('h-[18px] w-[18px] shrink-0 animate-spin', dark ? 'text-white/40' : 'text-muted-foreground')} />
          ) : (
            <ImagePlus
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
                dark ? 'text-white/35 group-hover/well:text-[#D9B625]' : 'text-muted-foreground group-hover/well:text-primary'
              )}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-left text-[13px]">
            <span className={dark ? 'text-white/65' : 'text-foreground/80'}>
              {disabled ? 'Yükleniyor…' : 'Fotoğraf veya belge ekle'}
            </span>
            {!disabled ? (
              <span className={cn('ml-2 hidden sm:inline', dark ? 'text-white/30' : 'text-muted-foreground')}>
                sürükleyin ya da tıklayın
              </span>
            ) : null}
          </span>
          <span className={cn('shrink-0 text-[12px] tabular-nums', dark ? 'text-white/30' : 'text-muted-foreground')}>
            {count}/{max}
          </span>
          {fileInput}
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-2 p-2">
          {thumbs}
          {!full ? (
            <label
              title={`PNG, JPG veya belge · en fazla ${max} dosya`}
              className={cn(
                'flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed transition-colors duration-200',
                dark
                  ? 'border-white/[0.1] text-white/40 hover:border-[#D9B625]/40 hover:text-[#D9B625]'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
              )}
            >
              {disabled ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ImagePlus className="h-[18px] w-[18px]" />}
              <span className="text-[11px] font-medium">{disabled ? '…' : 'Ekle'}</span>
              {fileInput}
            </label>
          ) : null}
          <span className={cn('ml-auto px-1.5 text-[12px] tabular-nums', dark ? 'text-white/30' : 'text-muted-foreground')}>
            {count}/{max}
          </span>
        </div>
      )}
    </div>
  );
}

/** Talep henüz kayıtlı değilken kaleme yerel foto/belge bağlar; kayıtta itemId ile yüklenir. */
export function PendingItemMediaStrip({
  files,
  onChange,
  dark,
  max = MAX_ITEM_PENDING,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  dark?: boolean;
  max?: number;
}) {
  return (
    <ItemMediaStrip
      itemId="pending"
      attachments={[]}
      canUpload
      dark={dark}
      pendingFiles={files}
      onPendingChange={onChange}
      pendingMax={max}
    />
  );
}

/** Kalem satırında ekler + isteğe bağlı yükleme (kaleme bağlı) */
export function ItemMediaStrip({
  attachments,
  itemId,
  requestId,
  token,
  overLimitToken,
  dark,
  canUpload,
  onUploaded,
  compact,
  pendingFiles,
  onPendingChange,
  pendingMax = MAX_ITEM_PENDING,
}: {
  attachments: ProcurementAttachment[] | null | undefined;
  itemId: string;
  requestId?: string;
  token?: string;
  overLimitToken?: string;
  vendorMode?: boolean;
  myVendorId?: string | null;
  dark?: boolean;
  canUpload?: boolean;
  onUploaded?: () => void;
  compact?: boolean;
  pendingFiles?: File[];
  onPendingChange?: (next: File[]) => void;
  pendingMax?: number;
}) {
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    mime?: string | null;
    attachmentId: string;
    revoke?: boolean;
  } | null>(null);
  const [over, setOver] = useState(false);

  const pendingMode = Boolean(onPendingChange);
  const pending = pendingFiles || [];

  const list = useMemo(
    () =>
      (attachments || []).filter(
        (a) => a.kind !== 'INVOICE' && a.itemId === itemId && !a.marketSourceId
      ),
    [attachments, itemId]
  );

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!requestId) throw new Error('requestId gerekli');
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('itemId', itemId);
      return procurementApi.uploadAttachments(requestId, fd);
    },
    onSuccess: () => {
      toast.success('Kaleme dosya eklendi.');
      onUploaded?.();
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Dosya yüklenemedi.');
    },
  });

  const takeFiles = (listFiles: FileList | File[] | null) => {
    const incoming = listFiles ? Array.from(listFiles) : [];
    if (!incoming.length) return;
    const { accepted, rejected } = splitAllowedAttachmentFiles(incoming);
    if (rejected.length) {
      toast.error(`Desteklenmeyen dosya türü: ${rejected.map((f) => f.name).join(', ')}`);
    }
    if (!accepted.length) return;
    if (pendingMode) {
      const room = pendingMax - pending.length;
      if (room <= 0) {
        toast.error(`Kaleme en fazla ${pendingMax} dosya eklenebilir.`);
        return;
      }
      if (accepted.length > room) {
        toast.error(`Kaleme en fazla ${pendingMax} dosya eklenebilir.`);
      }
      onPendingChange?.([...pending, ...accepted.slice(0, room)]);
      return;
    }
    uploadMutation.mutate(accepted);
  };

  const count = pendingMode ? pending.length : list.length;
  const canAdd = Boolean(canUpload && (pendingMode || requestId));
  if (!count && !canAdd) return null;

  const resolveSource = (attachmentId: string): MediaSource | null => {
    if (overLimitToken && requestId) {
      return { mode: 'overLimit', token: overLimitToken, requestId, attachmentId };
    }
    if (token) return { mode: 'token', token, attachmentId };
    if (requestId) return { mode: 'auth', requestId, attachmentId };
    return null;
  };

  const wellThumbs = pendingMode
    ? pending.map((file, idx) => (
        <div key={`${file.name}-${file.size}-${file.lastModified}-${idx}`} className="relative shrink-0">
          <PendingLocalThumb file={file} />
          <button
            type="button"
            onClick={() => onPendingChange?.(pending.filter((_, i) => i !== idx))}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white shadow-sm ring-1 ring-white/15 transition hover:bg-black"
            aria-label="Dosyayı kaldır"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))
    : list.map((a) => {
        const source = resolveSource(a.id);
        if (!source) return null;
        const image = isImageFile(a.originalName, a.mimeType || undefined);
        const pdf = isPdfFile(a.originalName, a.mimeType || undefined);
        return (
          <StripThumb
            key={a.id}
            attachment={a}
            source={source}
            image={image}
            pdf={pdf}
            dark={dark}
            size={compact ? 'sm' : 'tile'}
            onOpen={(url, revoke) =>
              setPreview({
                url,
                name: a.originalName,
                mime: a.mimeType,
                attachmentId: a.id,
                revoke,
              })
            }
          />
        );
      });

  return (
    <div className={compact ? 'mt-1.5' : undefined}>
      {compact ? (
        <div className="flex flex-wrap gap-2.5">
          {wellThumbs}
        </div>
      ) : canAdd ? (
        <ItemMediaWell
          dark={dark}
          over={over}
          count={count}
          max={pendingMax}
          full={count >= pendingMax}
          disabled={uploadMutation.isPending}
          onOver={setOver}
          onTake={takeFiles}
          thumbs={wellThumbs}
        />
      ) : (
        <div className="flex flex-wrap gap-2">{wellThumbs}</div>
      )}
      {preview && (
        <MediaLightbox
          url={preview.url}
          name={preview.name}
          mime={preview.mime}
          onClose={() => {
            if (preview.revoke) URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

function StripThumb({
  attachment,
  source,
  image,
  pdf,
  dark,
  size = 'sm',
  onOpen,
}: {
  attachment: ProcurementAttachment;
  source: MediaSource;
  image: boolean;
  pdf: boolean;
  dark?: boolean;
  size?: 'sm' | 'lg' | 'tile';
  onOpen: (url: string, revoke: boolean) => void;
}) {
  const { url, loading } = useAttachmentObjectUrl(image ? source : null);
  const large = size === 'lg';
  const tile = size === 'tile';

  return (
    <button
      type="button"
      title={attachment.originalName}
      onClick={async () => {
        if (url) {
          onOpen(url, false);
          return;
        }
        try {
          const res = await fetchMediaBlob(source);
          onOpen(URL.createObjectURL(res.data), true);
        } catch {
          toast.error('Dosya açılamadı.');
        }
      }}
      className={cn(
        'group relative shrink-0 overflow-hidden border text-left transition-colors',
        large
          ? 'w-[7.5rem] rounded-xl'
          : tile
            ? 'h-20 w-20 rounded-[10px] ring-1 ring-white/10'
            : 'h-11 w-11 rounded-md',
        dark
          ? 'border-white/15 bg-black/40 hover:border-[#D9B625]/55'
          : 'border-border/60 bg-muted/30 hover:border-primary/40'
      )}
    >
      <span
        className={cn(
          'relative block overflow-hidden',
          large ? 'aspect-[4/3] w-full' : 'h-full w-full'
        )}
      >
        {image && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : image && loading ? (
          <span className="flex h-full w-full items-center justify-center">
            <Loader2
              className={cn(
                'animate-spin',
                large ? 'h-5 w-5' : 'h-3.5 w-3.5',
                dark ? 'text-white/40' : 'text-muted-foreground'
              )}
            />
          </span>
        ) : (
          <span
            className={cn(
              'flex h-full w-full items-center justify-center font-bold',
              large ? 'text-xs' : 'text-[9px]',
              pdf ? 'bg-[#E53935] text-white' : dark ? 'bg-white/5 text-white/50' : 'text-muted-foreground'
            )}
          >
            {pdf ? 'PDF' : <FileText className={large ? 'h-6 w-6' : 'h-4 w-4'} />}
          </span>
        )}
        <span
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors',
            'group-hover:bg-black/35'
          )}
          aria-hidden
        >
          <Expand
            className={cn(
              'text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100',
              large ? 'h-5 w-5' : 'h-3.5 w-3.5'
            )}
            strokeWidth={2.5}
          />
        </span>
      </span>
      {large && (
        <span
          className={cn(
            'block truncate px-2 py-1.5 text-[10px] font-medium leading-tight',
            dark ? 'bg-black/50 text-white/75' : 'bg-muted/50 text-muted-foreground'
          )}
        >
          {attachment.originalName}
        </span>
      )}
    </button>
  );
}
