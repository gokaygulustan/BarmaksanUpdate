'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, internalRequestsApi, orgWorkersApi, procurementApi, unitsApi } from '@/lib/api';
import { mergeQuantityUnits } from '@/lib/quantity-units';
import { parseProcurementListExcel } from '@/lib/procurementListExcel';
import { downloadBirimTalepTemplate } from '@/lib/birimTalepExcel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PasteRichInput, packInline, type PasteImage } from '@/components/PasteRichInput';
import { PendingFiles } from '@/components/ChatMedia';
import { AuthImage } from '@/components/RichBody';
import { isImageFile } from '@/lib/richHtml';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

/** Form dili: bölüm kartı, etiket ve alan (dashboard / liste ekranlarıyla aynı). */
const sectionClass = 'space-y-5 rounded-[22px] border border-white/[0.07] bg-card p-5 sm:p-6';
const labelClass = 'text-[12.5px] font-medium text-white/55';
const inputClass =
  'h-11 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-3 text-[14px] text-white outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-white/30 hover:border-brand/50 focus-visible:border-brand/70 focus-visible:bg-white/[0.05] focus-visible:ring-4 focus-visible:ring-brand/15';

/** Küçük, sakin ikincil düğme (Şablon indir, Excel yükle): üzerine gelince altın dolar. */
const ghostBtn =
  'press inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.12] px-3 text-[12.5px] font-medium text-white/70 outline-none transition-colors duration-150 hover:border-transparent hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50';

/** Bölüm başlığı: başlık (+ sayı rozeti), ipucu ve sağda isteğe bağlı eylem. */
function SectionHead({
  title,
  hint,
  badge,
  action,
}: {
  title: string;
  hint?: string;
  badge?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[16px] font-medium tracking-[-0.012em] text-white">
          {title}
          {badge != null ? (
            <span className="rounded-full bg-white/[0.07] px-2 py-px text-[12px] font-normal tabular-nums text-white/55">{badge}</span>
          ) : null}
        </h2>
        {hint ? <p className="mt-1 text-[12.5px] leading-relaxed text-white/40">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

const ALLOWED = ['.pdf', '.zip', '.rar', '.7z', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ITEM_PHOTOS = 4;

type ItemAttachment = { id: string; originalName: string; mimeType?: string; size?: number };

type Item = {
  id?: string;
  productName: string;
  quantity: string;
  unit: string;
  notes: string;
  photos: File[];
  savedPhotos: ItemAttachment[];
};

const emptyItem = (): Item => ({
  productName: '',
  quantity: '1',
  unit: 'Adet',
  notes: '',
  photos: [],
  savedPhotos: [],
});

const apiMessage = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

const fileExt = (name: string) => `.${name.split('.').pop()?.toLowerCase() || ''}`;

const pendingBytes = (list: File[]) => list.reduce((sum, f) => sum + f.size, 0);

/** Boşken en az 3 satır, yazdıkça büyüyen not kutusu. */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  maxHeight = 240,
  minRows = 3,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxHeight?: number;
  minRows?: number;
}) {
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const min = minRows * 24 + 20;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), maxHeight)}px`;
  };

  return (
    <Textarea
      ref={fit}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        fit(e.target);
      }}
      className="min-h-[5.5rem] resize-none overflow-y-auto rounded-xl px-3 py-2.5 text-sm"
    />
  );
}

function PendingPhotoThumb({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <span className="block h-20 w-20 overflow-hidden rounded-[10px] bg-white/10 ring-1 ring-white/10">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

function PhotoRemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white shadow-sm ring-1 ring-white/15 transition hover:bg-black"
      aria-label={label}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function ItemPhotoField({
  saved,
  pending,
  draftId,
  max,
  onAdd,
  onRemoveSaved,
  onRemovePending,
}: {
  saved: ItemAttachment[];
  pending: File[];
  draftId?: string;
  max: number;
  onAdd: (list: FileList | null) => void;
  onRemoveSaved: (id: string) => void;
  onRemovePending: (index: number) => void;
}) {
  const [over, setOver] = useState(false);
  const count = saved.length + pending.length;
  const full = count >= max;

  const take = (list: FileList | null) => {
    if (full) {
      if (list?.length) toast.error(`Kaleme en fazla ${max} fotoğraf eklenebilir.`);
      return;
    }
    onAdd(list);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!full) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        'rounded-xl border border-dashed transition-colors',
        over ? 'border-primary bg-primary/10' : 'border-white/12 bg-white/[0.035]'
      )}
    >
      {count === 0 ? (
        <label className="flex min-h-[4.75rem] cursor-pointer items-center gap-3 px-3.5 py-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-muted-foreground ring-1 ring-white/10">
            <ImagePlus className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-medium text-foreground/90">Ürün fotoğrafı ekle</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
              PNG, JPG — sürükle veya tıkla · en fazla {max}
            </span>
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {count}/{max}
          </span>
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              take(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          {saved.map((att) => (
            <div key={att.id} className="relative shrink-0">
              {isImageFile(att.originalName, att.mimeType) && draftId ? (
                <AuthImage
                  requestId={draftId}
                  attachmentId={att.id}
                  className="h-20 w-20 rounded-[10px] object-cover ring-1 ring-white/10"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-[10px] bg-white/10 px-1 text-center text-[10px] leading-tight text-muted-foreground ring-1 ring-white/10">
                  {att.originalName}
                </span>
              )}
              <PhotoRemoveButton onClick={() => onRemoveSaved(att.id)} label="Fotoğrafı kaldır" />
            </div>
          ))}
          {pending.map((file, photoIdx) => (
            <div key={`${file.name}-${file.size}-${file.lastModified}-${photoIdx}`} className="relative shrink-0">
              <PendingPhotoThumb file={file} />
              <PhotoRemoveButton onClick={() => onRemovePending(photoIdx)} label="Fotoğrafı kaldır" />
            </div>
          ))}
          {!full ? (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-white/18 bg-white/[0.03] text-muted-foreground transition hover:border-white/30 hover:bg-white/[0.06] hover:text-foreground">
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px] font-medium">Ekle</span>
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  take(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
          <span className="ml-auto px-1 text-[11px] tabular-nums text-muted-foreground">
            {count}/{max}
          </span>
        </div>
      )}
    </div>
  );
}

export type BirimTalepExisting = {
  id: string;
  title: string;
  status: string;
  canEdit?: boolean;
  description?: string | null;
  requesterUnit?: string | null;
  shopDepartmentId?: string | null;
  shopWorkerId?: string | null;
  neededBy?: string | null;
  items?: {
    id: string;
    productName: string;
    quantity: number;
    unit: string;
    notes?: string | null;
    attachments?: ItemAttachment[];
  }[];
  attachments?: { id: string; originalName: string }[];
};

export function isBirimTalepEditable(row: { status?: string; canEdit?: boolean } | null | undefined) {
  if (!row) return true;
  if (row.canEdit === false) return false;
  if (row.canEdit === true) return true;
  return ['DRAFT', 'SUBMITTED', 'REJECTED', 'APPROVED'].includes(String(row.status || ''));
}

/** Yeni talep, taslak ve henüz teklife dönüşmemiş kayıtlar. */
export function BirimTalepForm({
  draft,
  backHref,
  onCancel,
}: {
  draft: BirimTalepExisting | null;
  backHref?: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [newUnitOpen, setNewUnitOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitItemIdx, setNewUnitItemIdx] = useState<number | null>(null);
  const status = draft?.status || 'DRAFT';
  const isDraft = !draft || status === 'DRAFT';
  const isRejected = status === 'REJECTED';
  const sendOnSave = isDraft || isRejected;
  const [title, setTitle] = useState(draft?.title || '');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(draft?.shopDepartmentId || null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(draft?.shopWorkerId || null);
  const [neededBy, setNeededBy] = useState(() => {
    if (!draft?.neededBy) return '';
    const d = new Date(draft.neededBy);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [notes, setNotes] = useState<{ text: string; images: PasteImage[] }>({
    text: draft?.description || '',
    images: [],
  });
  const [items, setItems] = useState<Item[]>(
    draft?.items?.length
      ? draft.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: String(item.quantity ?? 1),
          unit: item.unit || 'Adet',
          notes: item.notes || '',
          photos: [],
          savedPhotos: item.attachments || [],
        }))
      : [emptyItem()]
  );
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [focusItemIdx, setFocusItemIdx] = useState<number | null>(null);

  const { data: departments = [] } = useQuery({
    queryKey: ['org-departments', 'active'],
    queryFn: async () =>
      (await departmentsApi.getAll({ active: true })).data as {
        id: string;
        name: string;
        collarType?: 'WHITE_COLLAR' | 'BLUE_COLLAR' | string | null;
      }[],
  });

  const selectedDept = departments.find((d) => d.id === selectedDeptId) || null;
  const selectedIsBlue = selectedDept?.collarType === 'BLUE_COLLAR';

  useEffect(() => {
    if (selectedDeptId || !draft?.requesterUnit || !departments.length) return;
    const match = departments.find(
      (d) => d.name.toLocaleLowerCase('tr-TR') === draft.requesterUnit!.toLocaleLowerCase('tr-TR'),
    );
    if (match) setSelectedDeptId(match.id);
  }, [departments, draft?.requesterUnit, selectedDeptId]);

  const unitOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: d.id,
        label: d.collarType === 'BLUE_COLLAR' ? `${d.name} (mavi yaka)` : d.name,
      })),
    [departments]
  );

  const { data: workers = [] } = useQuery({
    queryKey: ['org-workers', 'active', selectedDeptId],
    enabled: selectedIsBlue && user?.role !== 'DEPARTMENT',
    queryFn: async () =>
      (
        await orgWorkersApi.getAll({
          active: true,
          ...(selectedDeptId ? { departmentId: selectedDeptId } : {}),
        })
      ).data as { id: string; firstName: string; lastName: string }[],
  });

  const workerOptions = useMemo(
    () => workers.map((w) => ({ value: w.id, label: `${w.firstName} ${w.lastName}`.trim() })),
    [workers]
  );

  const { data: quantityUnits = [] } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      try {
        return (await unitsApi.getAll()).data as { name: string }[];
      } catch {
        return [];
      }
    },
  });

  const quantityUnitOptions = useMemo(
    () => mergeQuantityUnits(quantityUnits).map((name) => ({ value: name, label: name })),
    [quantityUnits]
  );

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await procurementApi.downloadListTemplateBlob('BIRIM_TALEP');
      toast.success('Şablon indirildi.');
    } catch (err: unknown) {
      try {
        await downloadBirimTalepTemplate(title);
        toast.success('Şablon indirildi.');
      } catch {
        toast.error(apiMessage(err) || 'Şablon indirilemedi.');
      }
    } finally {
      setDownloadingTemplate(false);
    }
  };
  const persistUnit = async (raw: string) => {
    const name = raw.trim() || 'Adet';
    try {
      const { data } = await unitsApi.resolve(name);
      const canon = (data as { name?: string })?.name || name;
      await queryClient.invalidateQueries({ queryKey: ['units'] });
      return canon;
    } catch {
      return name;
    }
  };

  const applyUnit = async (idx: number, raw: string) => {
    const name = raw.trim() || 'Adet';
    updateItem(idx, { unit: name });
    const canon = await persistUnit(name);
    if (canon !== name) updateItem(idx, { unit: canon });
  };

  const createCustomUnit = async () => {
    const name = newUnitName.trim();
    if (!name) return;
    const canon = await persistUnit(name);
    if (newUnitItemIdx != null) updateItem(newUnitItemIdx, { unit: canon });
    setNewUnitOpen(false);
    setNewUnitName('');
    setNewUnitItemIdx(null);
    toast.success(`Birim eklendi: ${canon}`);
  };

  const importExcel = async (file: File) => {
    try {
      const hasContent = items.some((i) => i.productName.trim());
      if (hasContent) {
        const ok = window.confirm(
          'Listede girilmiş kalemler var. Excel’den gelen satırlar mevcut listenin yerine geçecek. Devam edilsin mi?'
        );
        if (!ok) return;
      }
      const { rows, listTitle } = await parseProcurementListExcel(file);
      if (listTitle?.trim()) {
        setTitle((prev) => prev.trim() || listTitle.trim());
      }

      const foldUnit = (s: string) => String(s || '').trim().toLocaleLowerCase('tr-TR');
      const excelUnits = [...new Set(rows.map((r) => r.unit || 'Adet'))];
      const canonUnits = new Map<string, string>();
      try {
        const { data } = await unitsApi.resolveMany(excelUnits);
        for (const u of (data as { name?: string }[]) || []) {
          if (u?.name) canonUnits.set(foldUnit(u.name), u.name);
        }
        await queryClient.invalidateQueries({ queryKey: ['units'] });
      } catch {
        /* Birim kaydı olmasa da satırdaki ad kullanılır */
      }

      setItems(
        rows.map((r) => ({
          productName: r.productName,
          quantity: String(r.quantity ?? 1),
          unit: canonUnits.get(foldUnit(r.unit || 'Adet')) || r.unit || 'Adet',
          notes: r.notes || '',
          photos: [],
          savedPhotos: [],
        }))
      );
      toast.success(`${rows.length} kalem Excel’den yüklendi.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Excel okunamadı.');
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#birim-excel') return;
    document.getElementById('birim-excel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (focusItemIdx == null) return;
    const el = document.querySelector<HTMLInputElement>(`[data-kalem-name="${focusItemIdx}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFocusItemIdx(null);
  }, [focusItemIdx, items.length]);

  const addItem = () => {
    const nextIdx = items.length;
    setItems((prev) => [...prev, emptyItem()]);
    setFocusItemIdx(nextIdx);
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const totalPendingBytes = () => pendingBytes(files) + pendingBytes(items.flatMap((item) => item.photos));

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.length > 8) {
      toast.error('En fazla 8 dosya eklenebilir.');
      return;
    }
    if (pendingBytes(next) + pendingBytes(items.flatMap((item) => item.photos)) > MAX_BYTES) {
      toast.error('Toplam dosya boyutu en fazla 50 MB olabilir.');
      return;
    }
    const bad = next.find((f) => !ALLOWED.includes(fileExt(f.name)));
    if (bad) {
      toast.error('İzin verilen türler: PDF, ZIP, RAR, 7Z ve ofis/görsel dosyaları.');
      return;
    }
    setFiles(next);
  };

  const onItemPhotos = (idx: number, list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => IMAGE_EXTS.includes(fileExt(f.name)) || isImageFile(f.name, f.type));
    if (!incoming.length) {
      toast.error('Kaleme yalnızca fotoğraf ekleyebilirsiniz (PNG, JPG, WEBP).');
      return;
    }
    const item = items[idx];
    const nextPhotos = [...item.photos, ...incoming];
    if (item.savedPhotos.length + nextPhotos.length > MAX_ITEM_PHOTOS) {
      toast.error(`Kaleme en fazla ${MAX_ITEM_PHOTOS} fotoğraf eklenebilir.`);
      return;
    }
    if (totalPendingBytes() + pendingBytes(incoming) > MAX_BYTES) {
      toast.error('Toplam dosya boyutu en fazla 50 MB olabilir.');
      return;
    }
    updateItem(idx, { photos: nextPhotos });
  };

  const removeSavedPhoto = async (idx: number, attachmentId: string) => {
    if (!draft) {
      updateItem(idx, { savedPhotos: items[idx].savedPhotos.filter((p) => p.id !== attachmentId) });
      return;
    }
    try {
      await internalRequestsApi.deleteAttachment(draft.id, attachmentId);
      updateItem(idx, { savedPhotos: items[idx].savedPhotos.filter((p) => p.id !== attachmentId) });
    } catch (err: unknown) {
      toast.error(apiMessage(err) || 'Fotoğraf silinemedi');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      toast.error('Talep konusu en az 3 karakter olmalıdır.');
      return;
    }
    if (departments.length && !selectedDeptId) {
      toast.error('Bir birim seçin.');
      return;
    }
    const filled = items.filter((item) => item.productName.trim());
    const cleanItems = filled.map((item) => ({
      id: item.id || undefined,
      productName: item.productName.trim(),
      quantity: Number(item.quantity) || 0,
      unit: item.unit.trim() || 'Adet',
      notes: item.notes.trim() || null,
    }));
    if (!cleanItems.length) {
      toast.error('En az bir kalem giriniz.');
      return;
    }
    if (cleanItems.some((item) => item.quantity <= 0)) {
      toast.error('Kalem miktarları sıfırdan büyük olmalıdır.');
      return;
    }
    setSaving(true);
    try {
      const packed = packInline(notes.text, notes.images);

      if (draft) {
        // Taslakta metin içine yeni görsel gömülemiyor; onları dosya eki olarak yüklüyoruz.
        const description = packed.text.replace(/\[\[img:\d+(?:\|\d+)?\]\]/g, '').trim();
        const updated = (
          await internalRequestsApi.update(draft.id, {
          title: title.trim(),
          requesterUnit: selectedDept?.name || null,
          shopDepartmentId: selectedDeptId,
          shopWorkerId: selectedIsBlue ? selectedWorkerId : null,
          neededBy: neededBy || null,
          description,
          items: cleanItems,
        })).data as { items?: { id: string }[] };
        const upload = [...files, ...packed.files];
        if (upload.length) {
          const fd = new FormData();
          upload.forEach((f) => fd.append('files', f));
          await internalRequestsApi.uploadAttachments(draft.id, fd);
          if (packed.files.length) {
            toast.message('Metne eklediğiniz görseller dosya eki olarak kaydedildi.');
          }
        }
        for (let i = 0; i < filled.length; i++) {
          const photos = filled[i].photos;
          const itemId = updated.items?.[i]?.id;
          if (!photos.length || !itemId) continue;
          const fd = new FormData();
          photos.forEach((f) => fd.append('files', f));
          fd.append('itemId', itemId);
          await internalRequestsApi.uploadAttachments(draft.id, fd);
        }
        if (sendOnSave) {
          await internalRequestsApi.submit(draft.id);
          toast.success(
            isRejected
              ? 'Talep yeniden satın alma birimine iletildi.'
              : 'Talep satın alma birimine iletildi.'
          );
        } else {
          toast.success('Talep güncellendi.');
        }
        await queryClient.invalidateQueries({ queryKey: ['birim-request', draft.id] });
        await queryClient.invalidateQueries({ queryKey: ['birim-board-counts'] });
        const dest =
          user?.role === 'PURCHASING' || user?.role === 'ADMIN'
            ? `/internal-requests/${draft.id}`
            : `/taleplerim/${draft.id}`;
        if (onCancel && dest.includes('/taleplerim/')) {
          onCancel();
        } else {
          router.replace(dest);
        }
        return;
      }

      const fd = new FormData();
      fd.append('title', title.trim());
      if (selectedDept?.name) fd.append('requesterUnit', selectedDept.name);
      if (selectedDeptId) fd.append('shopDepartmentId', selectedDeptId);
      if (selectedIsBlue && selectedWorkerId) fd.append('shopWorkerId', selectedWorkerId);
      if (neededBy) fd.append('neededBy', neededBy);
      if (packed.text) fd.append('description', packed.text);
      packed.files.forEach((f) => fd.append('inlineImages', f));
      fd.append('items', JSON.stringify(cleanItems.map(({ id: _id, ...rest }) => rest)));
      files.forEach((f) => fd.append('files', f));
      filled.forEach((item, idx) => {
        item.photos.forEach((f) => fd.append(`itemFiles-${idx}`, f));
      });
      const { data } = await internalRequestsApi.createAndSubmit(fd);
      toast.success('Talep satın alma birimine iletildi.');
      router.replace(
        user?.role === 'PURCHASING' || user?.role === 'ADMIN'
          ? `/internal-requests/${data.id}`
          : `/taleplerim/${data.id}`,
      );
    } catch (err: unknown) {
      toast.error(apiMessage(err) || 'Gönderilemedi');
    } finally {
      setSaving(false);
    }
  };

  const removeDraft = async () => {
    if (!draft) return;
    if (!window.confirm('Bu taslak silinsin mi? Geri alınamaz.')) return;
    setSaving(true);
    try {
      await internalRequestsApi.remove(draft.id);
      toast.success('Taslak silindi.');
      router.replace('/taleplerim');
    } catch (err: unknown) {
      toast.error(apiMessage(err) || 'Silinemedi');
      setSaving(false);
    }
  };

  const [noteOpen, setNoteOpen] = useState<Record<number, boolean>>({});
  const unitName = departments.find((d) => d.id === selectedDeptId)?.name;
  const neededByLabel = neededBy ? neededBy.split('-').reverse().join('.') : '';

  const submitLabel = saving ? (
    <>
      <Loader2 className="size-[18px] animate-spin" />
      {sendOnSave ? 'Gönderiliyor' : 'Kaydediliyor'}
    </>
  ) : sendOnSave ? (
    <>
      <Send className="size-[18px] transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/send:-translate-y-0.5 group-hover/send:translate-x-1" />
      {isRejected ? 'Yeniden gönder' : 'Talebi ilet'}
    </>
  ) : (
    <>
      <Save className="size-[18px]" />
      Değişiklikleri kaydet
    </>
  );
  const submitClass =
    'press group/send inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] bg-brand text-[14.5px] font-semibold text-primary-foreground outline-none transition-colors duration-200 hover:bg-[#e4c43c] focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-60';

  return (
    <form onSubmit={submit} className="@container mx-auto max-w-[1240px] pb-24 @min-[900px]:pb-8">
      <div data-tour="birim-form-head" className="pb-6">
        <button
          type="button"
          onClick={() => {
            if (onCancel) {
              onCancel();
              return;
            }
            router.push(
              backHref || (user?.role === 'DEPARTMENT' ? '/taleplerim' : '/internal-requests')
            );
          }}
          className="group/back mb-3 inline-flex items-center gap-1 rounded-full py-1 pl-1.5 pr-3 text-[13px] text-white/50 outline-none transition-colors duration-150 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ChevronLeft className="size-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/back:-translate-x-0.5" />
          Geri
        </button>
        <h1 className="text-[32px] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[38px]">
          <SmokeText text={!draft ? 'Yeni talep' : isDraft ? 'Taslağı düzenle' : 'Talebi düzenle'} />
        </h1>
        <p className="mt-2.5 max-w-[66ch] text-[14px] leading-relaxed text-white/45">
          {!draft
            ? 'Talep, Satın Alma Birimi Yetkilisine iletilir. Kalemleri tek tek veya Excel ile yükleyebilirsiniz.'
            : isDraft
              ? 'Bu talep henüz gönderilmedi. Değiştirip gönderebilir veya taslağı silebilirsiniz.'
              : isRejected
                ? 'Reddedilen talebi düzeltip yeniden gönderebilirsiniz.'
                : 'Kalem, miktar ve birimi güncelleyebilirsiniz. Satın alma teklife dönüştürene kadar kayıt sizde düzenlenebilir.'}
        </p>
      </div>

      <div className="grid items-start gap-5 @min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
        {/* Sol: ne isteniyor (bilgi + kalemler). Her şey tek akışta, ekranı doldurur. */}
        <div className="stagger min-w-0 space-y-5">
          <section className={sectionClass} data-tour="birim-form-info">
            <SectionHead title="Talep bilgileri" hint="Konu ve birim zorunlu; açıklama satın almanın işini kolaylaştırır." />
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label className={labelClass}>Talep konusu</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn. Bakım malzemesi temini"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Talep eden birim</Label>
                {departments.length ? (
                  <SearchableCombobox
                    options={unitOptions}
                    value={selectedDeptId}
                    onChange={(id) => {
                      setSelectedDeptId(id);
                      setSelectedWorkerId(null);
                    }}
                    placeholder="Birim ara ve seçin…"
                    allowClear={false}
                    controlClassName="h-11 rounded-[12px] border-white/[0.08] bg-white/[0.03] px-3 text-[14px] transition-colors duration-200 hover:border-brand/50"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Birim listesi henüz tanımlanmamış. Sistem yöneticisinin eklemesi gerekir.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className={labelClass}>Ne zamana kadar lazım?</Label>
                <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={inputClass} />
              </div>
              {selectedIsBlue && user?.role !== 'DEPARTMENT' ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label className={labelClass}>Usta / çalışan (isteğe bağlı)</Label>
                  <SearchableCombobox
                    options={workerOptions}
                    value={selectedWorkerId}
                    onChange={setSelectedWorkerId}
                    placeholder="Usta ara…"
                    allowClear
                    controlClassName="h-11 rounded-[12px] border-white/[0.08] bg-white/[0.03] px-3 text-[14px] transition-colors duration-200 hover:border-brand/50"
                  />
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                <Label className={labelClass}>Talep açıklaması</Label>
                <PasteRichInput
                  toolbar
                  placeholder="Ne ve ne için gerekiyor? Marka, model, ölçü gibi ayrıntıları da yazabilirsiniz."
                  onChange={setNotes}
                  initialHtml={draft?.description || ''}
                  className="rounded-none"
                />
              </div>
            </div>
          </section>

          <section className={cn(sectionClass, '@container')} data-tour="birim-form-items">
            <SectionHead
              title="Kalemler"
              hint="Listeden seçin ya da “koli” gibi yeni bir birim yazın."
              badge={items.length}
              action={
                <div id="birim-excel" data-tour="birim-form-excel" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadTemplate()}
                    disabled={downloadingTemplate}
                    className={ghostBtn}
                  >
                    {downloadingTemplate ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Şablon indir
                  </button>
                  <button type="button" onClick={() => excelInputRef.current?.click()} className={ghostBtn}>
                    <FileSpreadsheet className="size-3.5" />
                    Excel yükle
                  </button>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importExcel(f);
                    }}
                  />
                </div>
              }
            />

            <div className="hidden grid-cols-[28px_minmax(0,1fr)_104px_190px_44px] gap-x-3 px-3.5 text-[12px] font-medium text-white/35 @min-[600px]:grid">
              <span />
              <span>Ürün / hizmet</span>
              <span>Miktar</span>
              <span>Birim</span>
              <span />
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => {
                const photoCount = item.photos.length + item.savedPhotos.length;
                const hasExtra = Boolean(item.notes?.trim()) || photoCount > 0;
                const extraOpen = Boolean(noteOpen[idx]) || hasExtra;
                return (
                  <div
                    key={idx}
                    className="group/item relative rounded-[16px] border border-white/[0.07] bg-white/[0.02] transition-colors duration-200 hover:border-white/[0.14] focus-within:border-brand/40"
                  >
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_44px] items-start gap-x-3 gap-y-2.5 p-3.5 @min-[600px]:grid-cols-[28px_minmax(0,1fr)_104px_190px_44px]">
                      <span className="mt-[11px] flex size-6 items-center justify-center rounded-full bg-white/[0.06] text-[11.5px] font-medium tabular-nums text-white/55 transition-colors duration-200 group-focus-within/item:bg-brand group-focus-within/item:text-primary-foreground">
                        {idx + 1}
                      </span>
                      <Input
                        data-kalem-name={idx}
                        value={item.productName}
                        onChange={(e) => updateItem(idx, { productName: e.target.value })}
                        placeholder={`Kalem ${idx + 1}`}
                        className={inputClass}
                        aria-label={`Kalem ${idx + 1} ürün / hizmet`}
                      />
                      <button
                        type="button"
                        disabled={items.length === 1}
                        onClick={() => {
                          setItems((prev) => prev.filter((_, i) => i !== idx));
                          setNoteOpen({});
                        }}
                        className="press inline-flex size-11 items-center justify-center rounded-[12px] text-white/40 outline-none transition-colors duration-150 hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:pointer-events-none disabled:opacity-30 @min-[600px]:order-last"
                        aria-label="Kalemi sil"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <div className="col-span-3 grid grid-cols-[104px_minmax(0,1fr)] gap-3 @min-[600px]:contents">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                          className={inputClass}
                          aria-label={`Kalem ${idx + 1} miktar`}
                        />
                        <div className="min-w-0 space-y-1">
                          <SearchableCombobox
                            options={quantityUnitOptions}
                            value={item.unit}
                            onChange={(v) => void applyUnit(idx, v || '')}
                            placeholder="Adet, koli, teneke…"
                            emptyText="Listede yok — yazıp Enter’a basın"
                            allowClear={false}
                            allowCustom
                            controlClassName="h-11 rounded-[12px] border-white/[0.08] bg-white/[0.03] px-3 text-[14px] transition-colors duration-200 hover:border-brand/50"
                          />
                          <button
                            type="button"
                            className="text-[12px] text-brand outline-none transition-colors duration-150 hover:text-[#e4c43c] focus-visible:underline"
                            onClick={() => {
                              setNewUnitItemIdx(idx);
                              setNewUnitName('');
                              setNewUnitOpen(true);
                            }}
                          >
                            Listede yoksa yeni birim ekle
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/[0.05] px-3.5 py-2">
                      <button
                        type="button"
                        onClick={() => setNoteOpen((s) => ({ ...s, [idx]: !extraOpen }))}
                        aria-expanded={extraOpen}
                        className="group/note flex items-center gap-1.5 rounded-[8px] py-1 pr-2 text-[12.5px] text-white/45 outline-none transition-colors duration-150 hover:text-white focus-visible:text-white"
                      >
                        <ChevronDown className={cn('size-3.5 transition-transform duration-300', extraOpen && 'rotate-180')} />
                        Not ve fotoğraf
                        {hasExtra ? (
                          <span className="rounded-full bg-brand/15 px-1.5 py-px text-[11px] tabular-nums text-brand">
                            {[item.notes?.trim() ? 'not' : '', photoCount ? `${photoCount} foto` : ''].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                      </button>
                      <div
                        className={cn(
                          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                          extraOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-2 pb-2 pt-1.5">
                            <AutoGrowTextarea
                              value={item.notes}
                              onChange={(next) => updateItem(idx, { notes: next })}
                              placeholder="Kalem notu (marka, model, ölçü…) — isteğe bağlı"
                            />
                            <ItemPhotoField
                              saved={item.savedPhotos}
                              pending={item.photos}
                              draftId={draft?.id}
                              max={MAX_ITEM_PHOTOS}
                              onAdd={(list) => onItemPhotos(idx, list)}
                              onRemoveSaved={(id) => removeSavedPhoto(idx, id)}
                              onRemovePending={(photoIdx) =>
                                updateItem(idx, { photos: item.photos.filter((_, i) => i !== photoIdx) })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-white/[0.16] text-[13.5px] font-medium text-white/60 outline-none transition-[border-color,color,background-color] duration-200 hover:border-brand/60 hover:bg-brand/[0.06] hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Plus className="size-4" />
              Kalem ekle
            </button>
          </section>
        </div>

        {/* Sağ: özet ve gönder (masaüstünde ekranla birlikte kayar), altında ekler. */}
        <aside className="stagger space-y-5 @min-[900px]:sticky @min-[900px]:top-6">
          <div
            className="texture-host relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-card p-5 sm:p-6"
            data-tour="birim-form-submit"
          >
            <span aria-hidden className="tile-texture tile-texture-down" />
            <div className="relative">
              <p className="text-[12.5px] font-medium text-white/45">Özet</p>
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="text-[52px] font-[200] leading-[0.9] tracking-[-0.05em] text-white tabular-nums">{items.length}</span>
                <span className="text-[14px] text-white/45">kalem</span>
              </div>
              <dl className="mt-5 space-y-2.5 border-t border-hairline pt-4 text-[13px]">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-white/40">Birim</dt>
                  <dd className="min-w-0 truncate text-right text-white/85">{unitName || '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-white/40">Gerekli tarih</dt>
                  <dd className="text-white/85 tabular-nums">{neededByLabel || 'Belirtilmedi'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-white/40">Ekler</dt>
                  <dd className="text-white/85 tabular-nums">{files.length}</dd>
                </div>
              </dl>
              <div className="mt-5 hidden space-y-2.5 @min-[900px]:block">
                <button type="submit" disabled={saving} className={submitClass}>
                  {submitLabel}
                </button>
                {draft && isDraft ? (
                  <button
                    type="button"
                    onClick={removeDraft}
                    disabled={saving}
                    className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-[13px] border border-destructive/30 text-[13.5px] font-medium text-destructive outline-none transition-colors duration-150 hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" />
                    Taslağı sil
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <section className={sectionClass} data-tour="birim-form-files">
            <SectionHead
              title="Ekler"
              hint="Şartname, teklif, fotoğraf… İsteğe bağlı."
              action={<span className="shrink-0 text-[12.5px] tabular-nums text-white/40">{files.length}/8</span>}
            />
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onFiles(e.dataTransfer.files);
              }}
              className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[16px] border border-dashed px-4 text-center transition-[border-color,background-color] duration-200 ${
                dragging ? 'border-brand bg-brand/10' : 'border-white/[0.14] hover:border-brand/40 hover:bg-white/[0.03]'
              }`}
            >
              <Paperclip className={cn('size-5 transition-transform duration-300', dragging ? '-translate-y-0.5 text-brand' : 'text-white/40')} />
              <span className="text-[14px] font-medium text-white">Dosya seç veya sürükleyip bırak</span>
              <span className="text-[12px] leading-relaxed text-white/40">
                PDF, Word, Excel, görsel, ZIP/RAR — en fazla 8 dosya, toplam 50 MB
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                accept={ALLOWED.join(',')}
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
            <PendingFiles files={files} onRemove={(idx) => setFiles(files.filter((_, i) => i !== idx))} />
            {draft?.attachments?.length ? (
              <div className="text-[12.5px] leading-relaxed text-white/45">
                <span className="font-medium text-white/80">Kayıtlı ekler: </span>
                {draft.attachments.map((a) => a.originalName).join(', ')}
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {/* Dar ekranda gönder düğmesi sayfanın altına yapışır (masaüstünde özet kutusunda). */}
      <div className="fixed inset-x-3 bottom-3 z-30 rounded-[20px] border border-white/[0.09] bg-[#161618]/85 p-2.5 shadow-[var(--shadow-float)] backdrop-blur-xl @min-[900px]:hidden">
        <div className="flex gap-2.5">
          {draft && isDraft ? (
            <button
              type="button"
              onClick={removeDraft}
              disabled={saving}
              aria-label="Taslağı sil"
              className="press inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-destructive/30 text-destructive outline-none transition-colors duration-150 hover:bg-destructive/10 disabled:opacity-60"
            >
              <Trash2 className="size-[18px]" />
            </button>
          ) : null}
          <button type="submit" disabled={saving} className={submitClass}>
            {submitLabel}
          </button>
        </div>
      </div>

      <Dialog open={newUnitOpen} onOpenChange={setNewUnitOpen}>
        <DialogContent className="bg-[#1c1c1c] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Yeni ölçü birimi</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Birim adı</Label>
            <Input
              placeholder="Örn. Koli, Teneke, Paket…"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newUnitName.trim()) {
                  e.preventDefault();
                  void createCustomUnit();
                }
              }}
              className="h-11 rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">
              Sistemde yoksa kaydolur; sonraki taleplerde listede görünür.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewUnitOpen(false)}>
              Vazgeç
            </Button>
            <Button type="button" disabled={!newUnitName.trim()} onClick={() => void createCustomUnit()}>
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
