'use client';

import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Redo2, Underline, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyImgWidth, sanitizeHtml } from '@/lib/richHtml';

export type PasteImage = { id: string; file: File };

export function packInline(html: string, images: PasteImage[]) {
  const map = new Map(images.map((x) => [x.id, x.file]));
  const files: File[] = [];
  const index = new Map<string, number>();
  const next = String(html || '').replace(/\[\[img:([^\]]+)\]\]/g, (whole, raw) => {
    const [id, w] = String(raw).split('|');
    // Sunucuda zaten kayıtlı bir eke işaret ediyorsa (taslak düzenleme) olduğu gibi kalsın.
    if (!map.has(id)) return whole;
    if (!index.has(id)) {
      index.set(id, files.length);
      files.push(map.get(id)!);
    }
    const width = w && /^\d+$/.test(w) ? Number(w) : 0;
    return width ? `[[img:${index.get(id)}|${width}]]` : `[[img:${index.get(id)}]]`;
  });
  return { text: next.trim(), files };
}

function newLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `l${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function dataUrlToFile(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  return new File([bytes], `yapistirma.${ext}`, { type: mime });
}

function markEmpty(el: HTMLDivElement) {
  const empty = !el.textContent?.trim() && !el.querySelector('img');
  el.dataset.empty = empty ? 'true' : 'false';
}

const DEFAULT_IMG_W = 220;
const MIN_IMG_W = 72;

export function PasteRichInput({
  placeholder,
  className,
  submitOnEnter,
  onSubmit,
  onChange,
  resetKey,
  toolbar,
  plain,
  initialHtml,
}: {
  placeholder?: string;
  className?: string;
  submitOnEnter?: boolean;
  onSubmit?: () => void;
  onChange: (payload: { text: string; images: PasteImage[] }) => void;
  resetKey?: number | string;
  toolbar?: boolean;
  plain?: boolean;
  /** Taslak düzenlemede kayıtlı açıklamayı kutuya basmak için. */
  initialHtml?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<PasteImage[]>([]);
  const pickedRef = useRef<HTMLImageElement | null>(null);
  const [picked, setPicked] = useState<HTMLImageElement | null>(null);
  const [grip, setGrip] = useState<{ top: number; left: number } | null>(null);

  const syncGrip = (img: HTMLImageElement | null) => {
    const wrap = wrapRef.current;
    if (!wrap || !img || !img.isConnected) {
      setGrip(null);
      return;
    }
    const wr = wrap.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setGrip({ top: ir.bottom - wr.top - 7, left: ir.right - wr.left - 7 });
  };

  const pick = (img: HTMLImageElement | null) => {
    const prev = pickedRef.current;
    if (prev && prev !== img) prev.removeAttribute('data-picked');
    pickedRef.current = img;
    if (img) {
      img.setAttribute('data-picked', 'true');
      ref.current?.focus();
    }
    setPicked(img);
    syncGrip(img);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initialHtml || '';
    imagesRef.current = [];
    pick(null);
    markEmpty(el);
    onChange({ text: initialHtml || '', images: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !picked) return;
    const update = () => syncGrip(pickedRef.current);
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [picked]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    markEmpty(el);
    const html = sanitizeHtml(el.innerHTML);
    const used = new Set([...html.matchAll(/\[\[img:([A-Za-z0-9_-]+)/g)].map((m) => m[1]));
    imagesRef.current = imagesRef.current.filter((x) => used.has(x.id));
    onChange({ text: html, images: imagesRef.current });
  };

  const styleImage = (img: HTMLImageElement, width = DEFAULT_IMG_W) => {
    img.alt = '';
    img.contentEditable = 'false';
    img.draggable = false;
    img.className = 'my-1 max-w-full rounded-md object-contain';
    applyImgWidth(img, width);
  };

  const insertImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const id = newLocalId();
    imagesRef.current = [...imagesRef.current, { id, file }];
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.dataset.local = id;
    styleImage(img);
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(img);
    }
    pick(img);
    emit();
  };

  const run = (cmd: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false);
    emit();
  };

  const startResize = (e: React.PointerEvent) => {
    const img = pickedRef.current;
    const box = ref.current;
    if (!img || !box) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const maxW = Math.max(MIN_IMG_W, box.clientWidth - 24);
    const onMove = (ev: PointerEvent) => {
      const next = Math.round(Math.min(maxW, Math.max(MIN_IMG_W, startW + (ev.clientX - startX))));
      applyImgWidth(img, next);
      syncGrip(img);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      emit();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative',
        plain
          ? 'min-w-0 flex-1 overflow-hidden rounded-2xl bg-black/30'
          : 'rounded-lg border border-white/10 bg-background/60',
        toolbar && !plain && 'focus-within:border-white/25'
      )}
    >
      {toolbar && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 px-1 py-1">
          {[
            { cmd: 'undo', Icon: Undo2, label: 'Geri al' },
            { cmd: 'redo', Icon: Redo2, label: 'Yinele' },
            { cmd: 'bold', Icon: Bold, label: 'Kalın' },
            { cmd: 'italic', Icon: Italic, label: 'İtalik' },
            { cmd: 'underline', Icon: Underline, label: 'Altı çizili' },
            { cmd: 'insertUnorderedList', Icon: List, label: 'Madde listesi' },
            { cmd: 'insertOrderedList', Icon: ListOrdered, label: 'Numaralı liste' },
          ].map(({ cmd, Icon, label }) => (
            <button
              key={cmd}
              type="button"
              title={label}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground"
              onMouseDown={(ev) => {
                ev.preventDefault();
                run(cmd);
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        role="textbox"
        data-empty="true"
        data-placeholder={placeholder || ''}
        className={cn(
          'overflow-y-auto px-3 py-2 text-sm outline-none',
          toolbar ? 'min-h-[160px] max-h-[70vh] resize-y' : 'min-h-[72px] max-h-56',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_b]:font-semibold [&_strong]:font-semibold',
          '[&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-md [&_img]:object-contain',
          '[&_img[data-picked]]:outline [&_img[data-picked]]:outline-2 [&_img[data-picked]]:outline-offset-2 [&_img[data-picked]]:outline-primary',
          className
        )}
        onInput={emit}
        onMouseDown={(e) => {
          const img = (e.target as HTMLElement | null)?.closest?.('img');
          if (img && ref.current?.contains(img)) {
            e.preventDefault();
            pick(img as HTMLImageElement);
            return;
          }
          pick(null);
        }}
        onKeyDown={(e) => {
          if (pickedRef.current && (e.key === 'Backspace' || e.key === 'Delete')) {
            e.preventDefault();
            pickedRef.current.remove();
            pick(null);
            emit();
            return;
          }
          if (submitOnEnter && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        onPaste={(e) => {
          const items = Array.from(e.clipboardData?.items || []);
          const image = items.find((item) => item.type.startsWith('image/'));
          if (image) {
            e.preventDefault();
            const file = image.getAsFile();
            if (file) insertImageFile(file);
            return;
          }
          const html = e.clipboardData?.getData('text/html') || '';
          if (html) {
            e.preventDefault();
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            tmp.querySelectorAll('img').forEach((img) => {
              const src = img.getAttribute('src') || '';
              const file = src.startsWith('data:image') ? dataUrlToFile(src) : null;
              if (!file) {
                img.remove();
                return;
              }
              const id = newLocalId();
              imagesRef.current = [...imagesRef.current, { id, file }];
              img.src = URL.createObjectURL(file);
              img.setAttribute('data-local', id);
              img.removeAttribute('srcset');
              styleImage(img);
            });
            document.execCommand('insertHTML', false, sanitizeHtml(tmp.innerHTML, true));
            emit();
            return;
          }
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '');
          emit();
        }}
      />
      {grip && picked && (
        <button
          type="button"
          aria-label="Görsel boyutunu değiştir"
          className="absolute z-10 h-3.5 w-3.5 cursor-nwse-resize rounded-[3px] border-2 border-primary bg-background shadow"
          style={{ top: grip.top, left: grip.left }}
          onPointerDown={startResize}
        />
      )}
    </div>
  );
}
