'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const MARKET_EDITABLE_STATUSES = new Set([
  'DRAFT',
  'SENT_TO_VENDOR',
  'VENDOR_QUOTED',
  'PENDING_MANAGER_APPROVAL',
  'RETURNED_TO_MANAGER',
]);

export const MARKET_CHANNELS = [
  { id: 'TRENDYOL', label: 'Trendyol' },
  { id: 'HEPSIBURADA', label: 'Hepsiburada' },
  { id: 'N11', label: 'n11' },
  { id: 'AMAZON', label: 'Amazon' },
  { id: 'OTHER', label: 'Diğer' },
] as const;

export type MarketSource = {
  id: string;
  channel: string;
  channelLabel?: string;
  sellerName: string;
  url: string;
  notes?: string | null;
  columnName?: string;
  quotes?: Array<{
    id: string;
    itemId: string;
    price: number;
    currency: string;
    url?: string | null;
  }>;
  attachments?: Array<{ id: string; originalName: string; itemId?: string | null }>;
};

type ItemOpt = { id: string; productName: string };

export function MarketOfferDialog({
  open,
  onOpenChange,
  requestId,
  items,
  initialItemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  items: ItemOpt[];
  initialItemId?: string | null;
}) {
  const queryClient = useQueryClient();
  const itemId = initialItemId || items[0]?.id || '';
  const itemName = items.find((it) => it.id === itemId)?.productName || '';
  const [channel, setChannel] = useState('TRENDYOL');
  const [sellerName, setSellerName] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const reset = () => {
    setChannel('TRENDYOL');
    setSellerName('');
    setUrl('');
    setPrice('');
    setCurrency('TRY');
    setNotes('');
    setFiles(null);
  };

  useEffect(() => {
    if (open) reset();
  }, [open, initialItemId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('itemId', itemId);
      fd.append('channel', channel);
      fd.append('sellerName', sellerName.trim());
      fd.append('url', url.trim());
      fd.append('price', price.replace(',', '.'));
      fd.append('currency', currency);
      if (notes.trim()) {
        fd.append('itemNotes', notes.trim());
        fd.append('notes', notes.trim());
      }
      if (files?.length) {
        Array.from(files).forEach((f) => fd.append('files', f));
      }
      const { data } = await procurementApi.upsertMarketOffer(requestId, fd);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', requestId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-approval-summary', requestId] });
      toast.success('Online piyasa fiyatı eklendi.');
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Online fiyat kaydedilemedi.');
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Online piyasa fiyatı</DialogTitle>
          <DialogDescription>
            Bu kalem için ilan linki, fiyat ve ekran görüntüsü. Cari kart açılmaz; sipariş tedarikçisi olarak seçilemez.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {itemName ? (
            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
              {itemName}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Pazar yeri</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {MARKET_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Satıcı / mağaza</Label>
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Örn. ABC Store" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>İlan linki</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.trendyol.com/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Fiyat</Label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Para birimi</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Ekran görüntüsü / kanıt</Label>
            <Input
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
            <p className="text-[11px] text-muted-foreground">Fiyatın göründüğü ekran görüntüsü ekleyin.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Not (opsiyonel)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !itemId ||
              !price.trim() ||
              !sellerName.trim() ||
              !url.trim()
            }
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MarketQuoteDeleteButton({
  requestId,
  quoteId,
  canEdit,
}: {
  requestId: string;
  quoteId: string;
  canEdit: boolean;
}) {
  return (
    <QuoteTrashButton
      canEdit={canEdit}
      title="Online fiyatı sil"
      confirmMessage="Bu online fiyat silinsin mi?"
      successMessage="Online fiyat silindi."
      errorFallback="Online fiyat silinemedi."
      mutateFn={() => procurementApi.deleteMarketQuote(requestId, quoteId)}
      requestId={requestId}
    />
  );
}

export function VendorQuoteDeleteButton({
  requestId,
  quoteId,
  vendorName,
  canEdit,
}: {
  requestId: string;
  quoteId: string;
  vendorName?: string;
  canEdit: boolean;
}) {
  const who = String(vendorName || 'Tedarikçi').trim() || 'Tedarikçi';
  return (
    <QuoteTrashButton
      canEdit={canEdit}
      title={`${who} teklifini sil`}
      confirmMessage={`${who} teklifi bu kalemden silinsin mi?`}
      successMessage="Tedarikçi teklifi silindi."
      errorFallback="Tedarikçi teklifi silinemedi."
      mutateFn={() => procurementApi.deleteItemQuote(requestId, quoteId)}
      requestId={requestId}
    />
  );
}

function QuoteTrashButton({
  canEdit,
  title,
  confirmMessage,
  successMessage,
  errorFallback,
  mutateFn,
  requestId,
}: {
  canEdit: boolean;
  title: string;
  confirmMessage: string;
  successMessage: string;
  errorFallback: string;
  mutateFn: () => Promise<unknown>;
  requestId: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: mutateFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', requestId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-approval-summary', requestId] });
      toast.success(successMessage);
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || errorFallback);
    },
  });

  if (!canEdit) return null;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={mutation.isPending}
      onClick={(e) => {
        e.stopPropagation();
        if (!window.confirm(confirmMessage)) return;
        mutation.mutate();
      }}
      className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
    >
      {mutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function MarketOfferItemButton({
  canEdit,
  onClick,
}: {
  canEdit: boolean;
  onClick: () => void;
}) {
  if (!canEdit) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 mt-2 ml-7 text-[11px] border-sky-500/35 text-sky-300"
      onClick={onClick}
    >
      <Globe className="h-3 w-3 mr-1" />
      Online fiyat
    </Button>
  );
}

export function OnlineQuoteBadge() {
  return (
    <Badge className="bg-sky-500/15 text-sky-300 border-sky-500/30 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
      Online
    </Badge>
  );
}

type ProofAtt = { id: string; originalName: string; itemId?: string | null; marketSourceId?: string | null };

export function MarketProofLinks({
  requestId,
  attachments,
  sourceId,
  itemId,
}: {
  requestId: string;
  attachments: ProofAtt[] | null | undefined;
  sourceId?: string | null;
  itemId: string;
}) {
  const list = (attachments || []).filter(
    (a) => a.marketSourceId && a.marketSourceId === sourceId && a.itemId === itemId
  );
  if (!list.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {list.map((a) => (
        <button
          key={a.id}
          type="button"
          title={a.originalName}
          className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 hover:bg-sky-500/20"
          onClick={() =>
            procurementApi
              .downloadAttachmentBlob(requestId, a.id, a.originalName)
              .catch(() => toast.error('Kanıt açılamadı.'))
          }
        >
          <Paperclip className="h-3 w-3" />
          Kanıt
        </button>
      ))}
    </span>
  );
}
