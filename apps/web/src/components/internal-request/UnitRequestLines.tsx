'use client';

import { Check } from 'lucide-react';
import { AuthImage } from '@/components/RichBody';
import { DocCard } from '@/components/ChatMedia';
import { isImageFile } from '@/lib/richHtml';
import { cn } from '@/lib/utils';

export type UnitLine = {
  id: string;
  productName: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  procurementRequestId?: string | null;
  attachments?: { id: string; originalName: string; mimeType?: string; size?: number }[];
};

export type UnitSplit = {
  id: string;
  title: string;
  status: string;
};

const RFQ_STATUS: Record<string, string> = {
  DRAFT: 'Satın alma hazırlıyor',
  SENT_TO_VENDOR: 'Teklif bekleniyor',
  VENDOR_QUOTED: 'Teklifler geldi',
  PENDING_MANAGER_APPROVAL: 'Yetkili onayında',
  RETURNED_TO_MANAGER: 'Yetkiliye iade edildi',
  PENDING_ADMIN_APPROVAL: 'Üst yönetim onayında',
  APPROVED_FOR_PURCHASE: 'Satın alma aşamasında',
  VENDOR_APPROVED: 'Tedarikçiye bildirildi',
  IN_PRODUCTION: 'Teminde',
  COMPLETED: 'Tamamlandı',
  REJECTED: 'Sonlandırıldı',
  CANCELLED: 'İptal edildi',
  HAS_ISSUES: 'Sorun bildirildi',
};

export function rfqStatusLabel(status?: string | null) {
  if (!status) return '';
  return RFQ_STATUS[status] || status;
}

function LineBody({
  requestId,
  item,
  onDownload,
}: {
  requestId: string;
  item: UnitLine;
  onDownload: (attachmentId: string, name: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div>{item.productName}</div>
      {item.notes ? (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</p>
      ) : null}
      {item.attachments?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.attachments.map((att) =>
            isImageFile(att.originalName, att.mimeType) ? (
              <AuthImage
                key={att.id}
                requestId={requestId}
                attachmentId={att.id}
                className="h-20 w-20 rounded-lg object-cover"
              />
            ) : (
              <DocCard
                key={att.id}
                name={att.originalName}
                size={att.size}
                mime={att.mimeType}
                onOpen={() => onDownload(att.id, att.originalName)}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UnitRequestLines({
  requestId,
  items,
  splits,
  onDownload,
  selectable = false,
  picked = [],
  onToggle,
  hrefFor,
}: {
  requestId: string;
  items: UnitLine[];
  splits: UnitSplit[];
  onDownload: (attachmentId: string, name: string) => void;
  selectable?: boolean;
  picked?: string[];
  onToggle?: (itemId: string) => void;
  hrefFor?: (split: UnitSplit) => string | null;
}) {
  const byRequest = new Map(splits.map((split) => [split.id, split]));
  const grouped = splits
    .map((split) => ({
      split,
      lines: items.filter((item) => item.procurementRequestId === split.id),
    }))
    .filter((group) => group.lines.length > 0);
  const open = items.filter((item) => !item.procurementRequestId || !byRequest.has(item.procurementRequestId));

  return (
    <div className="space-y-3">
      {grouped.map(({ split, lines }) => {
        const href = hrefFor?.(split) || null;
        return (
          <div key={split.id} className="overflow-hidden rounded-xl border border-primary/30">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-primary/10 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">Tedarik talebi</p>
                <p className="text-sm font-semibold">{split.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{rfqStatusLabel(split.status)}</span>
                {href ? (
                  <a href={href} className="text-xs font-semibold text-primary hover:underline">
                    Talebi aç
                  </a>
                ) : null}
              </div>
            </div>
            <ul>
              {lines.map((item) => (
                <li key={item.id} className="flex items-start gap-3 border-t border-border px-3 py-3 text-sm">
                  <LineBody requestId={requestId} item={item} onDownload={onDownload} />
                  <span className="shrink-0 text-right whitespace-nowrap">
                    {item.quantity} {item.unit || 'Adet'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {open.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="bg-black/20 px-3 py-2 text-sm text-muted-foreground">
            {grouped.length ? 'Henüz tedarik talebine alınmayan kalemler' : 'Kalemler'}
          </div>
          <ul>
            {open.map((item) => {
              const on = picked.includes(item.id);
              return (
                <li key={item.id} className="border-t border-border">
                  {selectable ? (
                    <button
                      type="button"
                      onClick={() => onToggle?.(item.id)}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-3 text-left text-sm',
                        on ? 'bg-primary/5' : 'hover:bg-white/5',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-white/20',
                        )}
                      >
                        {on ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <LineBody requestId={requestId} item={item} onDownload={onDownload} />
                      <span className="shrink-0 text-right whitespace-nowrap">
                        {item.quantity} {item.unit || 'Adet'}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 px-3 py-3 text-sm">
                      <LineBody requestId={requestId} item={item} onDownload={onDownload} />
                      <span className="shrink-0 text-right whitespace-nowrap">
                        {item.quantity} {item.unit || 'Adet'}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
