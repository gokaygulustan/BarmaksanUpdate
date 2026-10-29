'use client';

import { ArrowUpRight, Check } from 'lucide-react';
import { AuthImage } from '@/components/RichBody';
import { DocCard } from '@/components/ChatMedia';
import { Tile, TileHeader } from '@/components/page/Page';
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

/** Kalem satırı: solda ad (altında not ve ekler), sağda miktar. */
const lineClass = 'flex items-start gap-3.5 px-6 py-4';

/** Miktar sağda: rakam belirgin, birim soluk. */
function Quantity({ item }: { item: UnitLine }) {
  return (
    <span className="shrink-0 whitespace-nowrap text-right tabular-nums">
      <span className="text-[15px] font-medium text-white">{item.quantity}</span>
      <span className="ml-1 text-[13px] text-white/45">{item.unit || 'Adet'}</span>
    </span>
  );
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
      <p className="text-[14px] leading-snug text-white/90 [overflow-wrap:anywhere]">{item.productName}</p>
      {item.notes ? (
        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/45">{item.notes}</p>
      ) : null}
      {item.attachments?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {item.attachments.map((att) =>
            isImageFile(att.originalName, att.mimeType) ? (
              <AuthImage
                key={att.id}
                requestId={requestId}
                attachmentId={att.id}
                className="h-20 w-20 rounded-[12px] object-cover"
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
    <div className="space-y-4">
      {grouped.map(({ split, lines }) => {
        const href = hrefFor?.(split) || null;
        return (
          <Tile key={split.id}>
            {/* Açılmış tedarik talebi: üstte adı ve aşaması, altında ona alınan kalemler. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-6 py-4">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-brand/85">Tedarik talebi · {rfqStatusLabel(split.status)}</p>
                <p className="mt-0.5 truncate text-[15px] font-medium tracking-[-0.012em] text-white">{split.title}</p>
              </div>
              {href ? (
                <a
                  href={href}
                  className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-white/60 outline-none transition-colors duration-200 hover:text-brand focus-visible:text-brand"
                >
                  Talebi aç
                  <ArrowUpRight className="size-3.5" />
                </a>
              ) : null}
            </div>
            <ul className="divide-y divide-hairline">
              {lines.map((item) => (
                <li key={item.id} className={lineClass}>
                  <LineBody requestId={requestId} item={item} onDownload={onDownload} />
                  <Quantity item={item} />
                </li>
              ))}
            </ul>
          </Tile>
        );
      })}

      {open.length > 0 && (
        <Tile>
          <TileHeader title={grouped.length ? 'Açık kalemler' : 'Kalemler'} aside={`${open.length} kalem`} />
          <ul className="divide-y divide-hairline">
            {open.map((item) => {
              const on = picked.includes(item.id);
              return (
                <li key={item.id}>
                  {selectable ? (
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggle?.(item.id)}
                      className={cn(
                        lineClass,
                        'w-full text-left outline-none transition-colors duration-200 focus-visible:bg-white/[0.04]',
                        on ? 'bg-brand/[0.05]' : 'hover:bg-white/[0.03]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-px flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-200',
                          on ? 'border-brand bg-brand text-[#141416]' : 'border-white/20',
                        )}
                      >
                        {on ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                      </span>
                      <LineBody requestId={requestId} item={item} onDownload={onDownload} />
                      <Quantity item={item} />
                    </button>
                  ) : (
                    <div className={lineClass}>
                      <LineBody requestId={requestId} item={item} onDownload={onDownload} />
                      <Quantity item={item} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Tile>
      )}
    </div>
  );
}
