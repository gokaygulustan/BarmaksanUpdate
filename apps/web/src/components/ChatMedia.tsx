'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, fileKindLabel, isImageFile, isPdfFile } from '@/lib/richHtml';
import { AuthImage } from '@/components/RichBody';
import { internalRequestsApi } from '@/lib/api';

async function download(requestId: string, file: { id: string; originalName: string }) {
  const res = await internalRequestsApi.downloadAttachment(requestId, file.id);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.originalName;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocCard({
  name,
  size,
  mime,
  mine,
  flush,
  onOpen,
  onRemove,
}: {
  name: string;
  size?: number;
  mime?: string;
  mine?: boolean;
  flush?: boolean;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const pdf = isPdfFile(name, mime);
  return (
    <div
      className={cn(
        'flex w-[248px] max-w-full items-center gap-2',
        !flush && 'rounded-xl px-2 py-2',
        !flush && (mine ? 'bg-black/20' : 'bg-black/35')
      )}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide',
            pdf ? 'bg-[#E53935] text-white' : 'bg-white/15 text-foreground'
          )}
        >
          {pdf ? 'PDF' : <FileText className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-snug">{name}</span>
          <span className={cn('mt-0.5 block text-[11px] leading-none', mine || flush ? 'opacity-70' : 'text-muted-foreground')}>
            {fileKindLabel(name, mime)}
            {size ? ` · ${formatBytes(size)}` : ''}
          </span>
        </span>
        {onOpen && !onRemove && (
          <Download className={cn('h-4 w-4 shrink-0', mine || flush ? 'opacity-70' : 'text-muted-foreground')} />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          onClick={onRemove}
          aria-label="Kaldır"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function MessageMedia({
  requestId,
  files,
  mine,
}: {
  requestId: string;
  files: { id: string; originalName: string; size: number; mimeType?: string }[];
  mine?: boolean;
}) {
  if (!files?.length) return null;
  const images = files.filter((f) => isImageFile(f.originalName, f.mimeType));
  const docs = files.filter((f) => !isImageFile(f.originalName, f.mimeType));
  return (
    <div className="space-y-1.5">
      {images.length === 1 && (
        <AuthImage
          requestId={requestId}
          attachmentId={images[0].id}
          className="max-h-72 w-full max-w-[280px] rounded-lg object-cover"
        />
      )}
      {images.length > 1 && (
        <div className={cn('grid gap-0.5 overflow-hidden rounded-lg', images.length === 2 ? 'grid-cols-2' : 'grid-cols-2')}>
          {images.map((file) => (
            <AuthImage
              key={file.id}
              requestId={requestId}
              attachmentId={file.id}
              className="h-36 w-full object-cover"
            />
          ))}
        </div>
      )}
      {docs.map((file) => (
        <DocCard
          key={file.id}
          name={file.originalName}
          size={file.size}
          mime={file.mimeType}
          mine={mine}
          flush
          onOpen={() => download(requestId, file)}
        />
      ))}
    </div>
  );
}

function PendingThumb({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!url) return <span className="h-16 w-16 rounded-lg bg-white/10" />;
  return <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />;
}

export function PendingFiles({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {files.map((file, idx) =>
        isImageFile(file.name, file.type) ? (
          <div key={`${file.name}-${idx}`} className="relative">
            <PendingThumb file={file} />
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-black p-0.5 text-white"
              onClick={() => onRemove(idx)}
              aria-label="Kaldır"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <DocCard
            key={`${file.name}-${idx}`}
            name={file.name}
            size={file.size}
            mime={file.type}
            onRemove={() => onRemove(idx)}
          />
        )
      )}
    </div>
  );
}
