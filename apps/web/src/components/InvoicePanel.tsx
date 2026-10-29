'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Check, FileDown, FileText, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type InvoiceItem = { id: string; productName: string; quantity?: number | string; unit?: string | null };
type InvoiceAttachment = {
  id: string;
  kind?: string | null;
  originalName: string;
  createdAt?: string;
  invoiceItems?: { itemId: string }[];
};
type VendorPick = {
  itemId: string;
  chosenVendorId?: string | null;
  chosenMarketSourceId?: string | null;
  vendor?: { id: string; name: string } | null;
};
type MarketSource = { id: string; sellerName?: string | null; channel?: string | null };

const apiMessage = (err: unknown) =>
  typeof err === 'object' && err !== null && 'response' in err
    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
    : undefined;

export function InvoicePanel({
  requestId,
  items,
  attachments,
  picks,
  marketSources,
  invoiceUploadedAt,
  onChanged,
}: {
  requestId: string;
  items: InvoiceItem[];
  attachments: InvoiceAttachment[];
  picks: VendorPick[];
  marketSources: MarketSource[];
  invoiceUploadedAt?: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const invoices = useMemo(
    () => (attachments || []).filter((a) => a.kind === 'INVOICE'),
    [attachments],
  );

  const sourceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of marketSources || []) m.set(s.id, s.sellerName || s.channel || 'Online satıcı');
    return m;
  }, [marketSources]);

  const vendorOf = useMemo(() => {
    const m = new Map<string, { key: string; name: string }>();
    for (const p of picks || []) {
      if (p.chosenVendorId) {
        m.set(p.itemId, { key: p.chosenVendorId, name: p.vendor?.name || 'Cari' });
      } else if (p.chosenMarketSourceId) {
        m.set(p.itemId, {
          key: `mkt_${p.chosenMarketSourceId}`,
          name: sourceName.get(p.chosenMarketSourceId) || 'Online satıcı',
        });
      }
    }
    return m;
  }, [picks, sourceName]);

  const invoiceableItems = useMemo(() => {
    const anyPick = items.some((i) => vendorOf.has(i.id));
    return anyPick ? items.filter((i) => vendorOf.has(i.id)) : items;
  }, [items, vendorOf]);

  const invoicesByItem = useMemo(() => {
    const m = new Map<string, InvoiceAttachment[]>();
    for (const inv of invoices) {
      for (const link of inv.invoiceItems || []) {
        const list = m.get(link.itemId) || [];
        list.push(inv);
        m.set(link.itemId, list);
      }
    }
    return m;
  }, [invoices]);

  const coveredCount = invoiceableItems.filter((i) => invoicesByItem.has(i.id)).length;
  const missingIds = invoiceableItems.filter((i) => !invoicesByItem.has(i.id)).map((i) => i.id);

  const vendorGroups = useMemo(() => {
    const m = new Map<string, { name: string; ids: string[] }>();
    for (const item of invoiceableItems) {
      const v = vendorOf.get(item.id);
      if (!v) continue;
      const g = m.get(v.key) || { name: v.name, ids: [] };
      g.ids.push(item.id);
      m.set(v.key, g);
    }
    return [...m.values()];
  }, [invoiceableItems, vendorOf]);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.productName])), [items]);

  const resetDialog = () => {
    setSelected(new Set());
    setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const uploadMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('itemIds', JSON.stringify([...selected]));
      return procurementApi.uploadInvoice(requestId, fd);
    },
    onSuccess: (res) => {
      const d = res?.data as { invoicedItemCount?: number; invoiceableItemCount?: number } | undefined;
      toast.success(
        d?.invoiceableItemCount
          ? `Fatura yüklendi. ${d.invoicedItemCount}/${d.invoiceableItemCount} kalem faturalı.`
          : 'Fatura yüklendi.',
      );
      setOpen(false);
      resetDialog();
      onChanged();
    },
    onError: (err) => toast.error(apiMessage(err) || 'Fatura yüklenirken bir hata oluştu.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => procurementApi.deleteInvoice(requestId, attachmentId),
    onSuccess: () => {
      toast.success('Fatura silindi.');
      setConfirmDeleteId(null);
      onChanged();
    },
    onError: (err) => toast.error(apiMessage(err) || 'Fatura silinemedi.'),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectOnly = (ids: string[]) => setSelected(new Set(ids));

  const allDone = invoiceableItems.length > 0 && coveredCount === invoiceableItems.length;

  return (
    <>
      <div
        className={cn(
          'rounded-lg border px-3 py-2 text-[12px] space-y-1.5',
          allDone ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-border/60 bg-black/20 text-foreground',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">
            {allDone ? 'Faturalar tamam' : 'Fatura'}
            <span className="ml-1.5 tabular-nums text-muted-foreground font-normal">
              {coveredCount}/{invoiceableItems.length} kalem
            </span>
          </span>
          {allDone && invoiceUploadedAt ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {format(new Date(invoiceUploadedAt), 'dd MMM yyyy HH:mm', { locale: tr })}
            </span>
          ) : null}
        </div>

        {invoices.length > 0 && (
          <ul className="space-y-1">
            {invoices.map((inv) => {
              const names = (inv.invoiceItems || []).map((l) => itemName.get(l.itemId)).filter(Boolean) as string[];
              return (
                <li key={inv.id} className="flex items-start gap-1.5">
                  <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="block w-full truncate text-left text-[11px] text-primary hover:underline"
                      onClick={() =>
                        procurementApi
                          .downloadAttachmentBlob(requestId, inv.id, inv.originalName)
                          .catch(() => toast.error('Fatura indirilemedi.'))
                      }
                    >
                      {inv.originalName}
                    </button>
                    <p className="truncate text-[10px] text-muted-foreground" title={names.join(', ')}>
                      {names.length ? `${names.length} kalem: ${names.join(', ')}` : 'Kalem bağlı değil'}
                    </p>
                  </div>
                  {confirmDeleteId === inv.id ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="rounded px-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(inv.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sil'}
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Vazgeç"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteId(inv.id)}
                      aria-label="Faturayı sil"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button
        type="button"
        className="w-full h-9 justify-start gap-2 text-[13px] font-semibold border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
        onClick={() => {
          resetDialog();
          setOpen(true);
        }}
      >
        <FileDown className="h-3.5 w-3.5 shrink-0" />
        Fatura yükle
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetDialog();
        }}
      >
        <DialogContent className="bg-[#1a1a1a] border border-white/10 text-white w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Fatura yükle</DialogTitle>
            <DialogDescription className="text-xs text-white/60">
              Faturanın kapsadığı kalemleri işaretleyin, dosyayı seçin. Her fatura için ayrı yükleme yapabilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] hover:bg-white/5"
              onClick={() => selectOnly(invoiceableItems.map((i) => i.id))}
            >
              Tümü
            </button>
            {missingIds.length > 0 && missingIds.length < invoiceableItems.length && (
              <button
                type="button"
                className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] hover:bg-white/5"
                onClick={() => selectOnly(missingIds)}
              >
                Faturasız olanlar ({missingIds.length})
              </button>
            )}
            {vendorGroups.length > 1 &&
              vendorGroups.map((g) => (
                <button
                  key={g.name + g.ids[0]}
                  type="button"
                  className="rounded-full border border-amber-500/30 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10"
                  onClick={() => selectOnly(g.ids)}
                >
                  {g.name} ({g.ids.length})
                </button>
              ))}
            {selected.size > 0 && (
              <button
                type="button"
                className="rounded-full px-2.5 py-1 text-[11px] text-white/50 hover:text-white"
                onClick={() => selectOnly([])}
              >
                Temizle
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
            {invoiceableItems.map((item) => {
              const checked = selected.has(item.id);
              const v = vendorOf.get(item.id);
              const existing = invoicesByItem.get(item.id) || [];
              return (
                <label
                  key={item.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-white/[0.03]',
                    checked && 'bg-primary/10',
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-amber-500"
                    checked={checked}
                    onChange={() => toggle(item.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{item.productName}</div>
                    <div className="truncate text-[10px] text-white/50">
                      {item.quantity} {item.unit || ''}
                      {v ? ` · ${v.name}` : ''}
                    </div>
                  </div>
                  {existing.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      <Check className="h-3 w-3" />
                      {existing.length > 1 ? `${existing.length} fatura` : 'Faturalı'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              multiple
              onChange={(e) => setFiles(e.target.files ? [...e.target.files] : [])}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2 border-white/15 text-[13px]"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {files.length ? `${files.length} dosya seçildi` : 'Fatura dosyasını seç (PDF / görsel)'}
            </Button>
            {files.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-white/70">
                {files.map((f) => (
                  <li key={f.name + f.size} className="truncate">
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <span className="mr-auto self-center text-[11px] text-white/50">
              {selected.size} kalem seçili
            </span>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
              disabled={!selected.size || !files.length || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Tamam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
