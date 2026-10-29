'use client';

import { useEffect, useState } from 'react';
import { internalRequestsApi, procurementApi } from '@/lib/api';
import { htmlToPlain, INLINE_IMG_SPLIT, INLINE_IMG_TOKEN, sanitizeHtml } from '@/lib/richHtml';

export function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function AuthImage({
  requestId,
  attachmentId,
  className,
  width,
  overLimitToken,
  procurementRequestId,
}: {
  requestId: string;
  attachmentId: string;
  className?: string;
  width?: number;
  /** Üst yönetim onay kutusu: JWT yok, over-limit token ile indir */
  overLimitToken?: string;
  procurementRequestId?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    let obj = '';
    const fetchBlob =
      overLimitToken && procurementRequestId
        ? procurementApi.fetchOverLimitAttachmentBlob(
            overLimitToken,
            procurementRequestId,
            attachmentId
          )
        : internalRequestsApi.downloadAttachment(requestId, attachmentId);

    fetchBlob
      .then((res) => {
        obj = URL.createObjectURL(res.data);
        if (alive) setUrl(obj);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [requestId, attachmentId, overLimitToken, procurementRequestId]);

  if (!url) {
    return (
      <span
        className="block h-36 max-w-full animate-pulse rounded-lg bg-white/10"
        style={width ? { width, maxWidth: '100%' } : { width: '100%', maxWidth: 260 }}
      />
    );
  }
  return (
    <>
      <button
        type="button"
        className="block max-w-full overflow-hidden"
        style={width ? { width, maxWidth: '100%' } : undefined}
        onClick={() => setOpen(true)}
      >
        <img src={url} alt="" className={className} style={width ? { width: '100%', height: 'auto' } : undefined} />
      </button>
      {open && <ImageLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

export function RichBody({
  text,
  requestId,
  className,
  overLimitToken,
  procurementRequestId,
}: {
  text?: string | null;
  requestId: string;
  className?: string;
  overLimitToken?: string;
  procurementRequestId?: string;
}) {
  const raw = String(text || '');
  if (!htmlToPlain(raw) && !/\[\[img:/.test(raw)) return null;
  const html = /<[a-z][\s\S]*>/i.test(raw) ? sanitizeHtml(raw) : raw.replace(/\n/g, '<br>');
  const parts = html.split(INLINE_IMG_SPLIT);

  return (
    <div className={className}>
      {parts.map((part, i) => {
        const match = part.match(INLINE_IMG_TOKEN);
        if (match) {
          const width = match[2] ? Number(match[2]) : 0;
          return (
            <AuthImage
              key={`${match[1]}-${i}`}
              requestId={requestId}
              attachmentId={match[1]}
              width={width || undefined}
              overLimitToken={overLimitToken}
              procurementRequestId={procurementRequestId}
              className={
                width
                  ? 'my-1 max-w-full rounded-lg object-contain'
                  : 'my-1 max-h-64 w-full max-w-[280px] rounded-lg object-cover'
              }
            />
          );
        }
        if (!part || part === '<br>') return null;
        return (
          <div
            key={i}
            className="break-words leading-relaxed [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 last:[&_p]:mb-0 [&_b]:font-semibold [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: part }}
          />
        );
      })}
    </div>
  );
}
