'use client';

import { cn } from '@/lib/utils';

export type PickQuote = {
  vendorId: string;
  vendorName?: string;
  price?: number;
  lineNetTRY?: number | null;
  discountRate?: number;
  isBestForItem?: boolean;
};

export type PickItem = {
  id: string;
  productName: string;
  quantity: number;
  unit?: string | null;
  category?: string | null;
  quotes: PickQuote[];
};

export type PickVendor = {
  vendorId: string;
  vendorName: string;
  totalTRY?: number;
  quotedItemCount?: number;
  city?: string | null;
  maturityLabel?: string | null;
  shippingLabel?: string | null;
  shippingCostTRY?: number | null;
  isMarket?: boolean;
  overallDiscountRate?: number;
};

const formatTRY = (n: number) =>
  `${Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;

const CELL = {
  best: 'bg-[#fef3c7]',
  pickYes: 'bg-[rgba(22,163,74,0.2)]',
  pickNo: 'bg-[rgba(239,68,68,0.14)]',
  base: 'bg-white',
  fill: 'bg-red-50',
} as const;

export function bestQuote(item: PickItem): PickQuote | null {
  let best: PickQuote | null = null;
  for (const q of item.quotes || []) {
    const n = q.lineNetTRY;
    if (n == null || !Number.isFinite(n)) continue;
    if (!best || n < (best.lineNetTRY as number)) best = q;
  }
  return best;
}

export function columnAssignment(items: PickItem[], vendorId: string): Record<string, string> {
  const next: Record<string, string> = {};
  for (const item of items) {
    const own = (item.quotes || []).some((q) => q.vendorId === vendorId && q.lineNetTRY != null);
    if (own) {
      next[item.id] = vendorId;
      continue;
    }
    const fill = bestQuote(item);
    if (fill) next[item.id] = fill.vendorId;
  }
  return next;
}

export function selectableItems(items: PickItem[]): PickItem[] {
  return (items || []).filter((item) =>
    (item.quotes || []).some((q) => q.lineNetTRY != null && Number.isFinite(q.lineNetTRY)),
  );
}

export function selectionTotalTRY(items: PickItem[], choices: Record<string, string>): number {
  let sum = 0;
  for (const item of items || []) {
    const vendorId = choices[item.id];
    if (!vendorId) continue;
    const quote = (item.quotes || []).find((q) => q.vendorId === vendorId);
    const n = quote?.lineNetTRY;
    if (n != null && Number.isFinite(n)) sum += n;
  }
  return sum;
}

function completedBasketTRY(items: PickItem[], vendorId: string): number | null {
  let sum = 0;
  let any = false;
  for (const item of items) {
    const own = (item.quotes || []).find((q) => q.vendorId === vendorId);
    const n =
      own?.lineNetTRY != null && Number.isFinite(own.lineNetTRY)
        ? own.lineNetTRY
        : bestQuote(item)?.lineNetTRY;
    if (n == null || !Number.isFinite(n)) continue;
    sum += n;
    any = true;
  }
  return any ? sum : null;
}

type Row =
  | { type: 'unit'; key: string; name: string }
  | { type: 'item'; key: string; item: PickItem };

function tableRows(items: PickItem[]): Row[] {
  const groups: { name: string; items: PickItem[] }[] = [];
  const indexByName = new Map<string, number>();
  for (const item of items) {
    const name = String(item.category || '').trim() || 'GENEL';
    const idx = indexByName.get(name);
    if (idx === undefined) {
      indexByName.set(name, groups.length);
      groups.push({ name, items: [item] });
    } else {
      groups[idx].items.push(item);
    }
  }
  const showHeaders = groups.length > 1;
  const rows: Row[] = [];
  for (const group of groups) {
    if (showHeaders) rows.push({ type: 'unit', key: `unit-${group.name}`, name: group.name });
    for (const item of group.items) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

export function ManagerQuotePickTable({
  vendors,
  items,
  choices,
  disabled,
  onToggleCell,
  onSelectColumn,
}: {
  vendors: PickVendor[];
  items: PickItem[];
  choices: Record<string, string>;
  disabled?: boolean;
  onToggleCell: (itemId: string, vendorId: string) => void;
  onSelectColumn: (vendorId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="min-w-[18rem] w-[24rem] px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-r border-slate-200 bg-slate-50">
              Kalem
            </th>
            <th className="min-w-[3.5rem] px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-r border-slate-200 bg-slate-50">
              Adet
            </th>
            {vendors.map((vendor, index) => {
              const assignment = columnAssignment(items, vendor.vendorId);
              const columnSelected =
                Object.keys(assignment).length > 0 &&
                Object.entries(assignment).every(([itemId, vendorId]) => choices[itemId] === vendorId);
              return (
                <th
                  key={vendor.vendorId}
                  className={cn(
                    'min-w-[12rem] px-1 py-1.5 text-center border-b border-slate-200',
                    index < vendors.length - 1 && 'border-r border-slate-200',
                    columnSelected ? 'bg-[rgba(22,163,74,0.18)]' : 'bg-slate-50',
                  )}
                >
                  <button
                    type="button"
                    disabled={disabled || !Object.keys(assignment).length}
                    onClick={() => onSelectColumn(vendor.vendorId)}
                    title={`${vendor.vendorName} — tekliflerini seç, eksikleri en uygun fiyattan tamamla`}
                    className="w-full rounded-md px-1 py-1.5 text-center hover:bg-black/5 disabled:opacity-50"
                  >
                    <span className="block truncate px-1 text-[14px] font-bold leading-snug text-slate-800">
                      {vendor.vendorName}
                    </span>
                    {vendor.isMarket ? (
                      <span className="mt-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-800">
                        Online
                      </span>
                    ) : (
                      <>
                        <span className="mt-1 block text-[12px] font-medium text-slate-600">
                          Vade: {String(vendor.maturityLabel || '').trim() || '—'}
                        </span>
                        <span className="mt-0.5 block text-[12px] font-medium text-slate-600">
                          Nakliye: {String(vendor.shippingLabel || '').trim() || '—'}
                        </span>
                        {vendor.city ? (
                          <span className="mt-0.5 block text-[12px] font-medium text-slate-600">
                            Şehir: {vendor.city}
                          </span>
                        ) : null}
                      </>
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tableRows(items).map((row) => {
            if (row.type === 'unit') {
              return (
                <tr key={row.key}>
                  <td
                    colSpan={2 + vendors.length}
                    className="bg-[#D9B625] text-center font-black uppercase tracking-[0.14em] text-[11px] text-slate-900 py-1.5 border-b border-[#b8960a]"
                  >
                    {row.name}
                  </td>
                </tr>
              );
            }
            const item = row.item;
            const selectedVendorId = choices[item.id] || null;
            const rowHasSelection = Boolean(selectedVendorId);
            const unitLabel = String(item.unit || 'Adet').trim() || 'Adet';
            const isAdet = unitLabel.toLocaleLowerCase('tr-TR') === 'adet';
            return (
              <tr key={item.id}>
                <td className="px-3 py-2 align-middle border-r border-b border-slate-200 bg-white">
                  <p className="whitespace-normal break-words font-semibold text-slate-900 leading-snug text-[15px]">
                    {item.productName}
                  </p>
                </td>
                <td className="px-2 py-2 align-middle text-center tabular-nums whitespace-nowrap border-r border-b border-slate-200 bg-slate-50">
                  <span className="text-lg font-bold text-slate-900">{item.quantity}</span>
                  {!isAdet ? (
                    <span className="block text-[12px] text-slate-500 mt-0.5">{unitLabel}</span>
                  ) : null}
                </td>
                {vendors.map((vendor, index) => {
                  const quote = (item.quotes || []).find((q) => q.vendorId === vendor.vendorId);
                  const edge = index < vendors.length - 1 && 'border-r border-slate-200';
                  const rowLine = 'border-b border-slate-200';
                  if (!quote || quote.lineNetTRY == null || !Number.isFinite(quote.lineNetTRY)) {
                    const fill = bestQuote(item);
                    const qty = Number(item.quantity) || 0;
                    const fillLine = fill?.lineNetTRY;
                    const fillUnit =
                      fillLine != null && Number.isFinite(fillLine) && qty > 0 ? fillLine / qty : null;
                    if (!fill || fillLine == null) {
                      return (
                        <td
                          key={vendor.vendorId}
                          className={cn(
                            'px-2 py-2 text-center text-slate-300',
                            edge,
                            rowLine,
                            rowHasSelection ? CELL.pickNo : CELL.base,
                          )}
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={vendor.vendorId} className={cn('px-1.5 py-1.5 align-middle', edge, rowLine, CELL.fill)}>
                        <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center text-red-700">
                          <span className="text-[10px] font-extrabold uppercase tracking-wide text-red-600">
                            En uygun
                          </span>
                          <span className="max-w-full truncate text-[12px] font-bold text-red-800">
                            {fill.vendorName || 'Tedarikçi'}
                          </span>
                          <span className="mt-1 text-[12px] font-semibold text-red-600">Birim</span>
                          <span className="text-[18px] font-bold tabular-nums">
                            {fillUnit != null ? formatTRY(fillUnit) : '—'}
                          </span>
                          <span className="mt-1 text-[12px] font-semibold text-red-600">Toplam</span>
                          <span className="text-[15px] font-semibold tabular-nums">{formatTRY(fillLine)}</span>
                        </div>
                      </td>
                    );
                  }
                  const isSelected = selectedVendorId === quote.vendorId;
                  const qty = Number(item.quantity) || 0;
                  const unitNet = qty > 0 ? (quote.lineNetTRY as number) / qty : null;
                  const cellBg = isSelected
                    ? CELL.pickYes
                    : quote.isBestForItem
                      ? CELL.best
                      : rowHasSelection
                        ? CELL.pickNo
                        : CELL.base;
                  return (
                    <td key={vendor.vendorId} className={cn('px-1.5 py-1.5 align-middle', edge, rowLine, cellBg)}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onToggleCell(item.id, quote.vendorId)}
                        className="flex w-full min-h-[4.5rem] flex-col items-center justify-center gap-1 bg-transparent px-1.5 py-2 text-center"
                      >
                        <span className="text-[13px] font-semibold text-slate-600">Birim</span>
                        <span className="text-[20px] font-bold tabular-nums text-slate-900">
                          {unitNet != null ? formatTRY(unitNet) : '—'}
                        </span>
                        <span className="mt-1.5 text-[13px] font-semibold text-slate-600">Toplam</span>
                        <span className="text-[16px] font-semibold tabular-nums text-slate-800">
                          {formatTRY(quote.lineNetTRY as number)}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {items.length > 1 ? (
          <tfoot>
            <tr>
              <td
                colSpan={2}
                className="px-3 py-4 text-right text-[13px] font-bold uppercase tracking-wide text-slate-800 bg-slate-300 border-t-2 border-r border-slate-400"
              >
                Genel toplam
              </td>
              {vendors.map((vendor, index) => {
                const quoted = Number(vendor.quotedItemCount) || 0;
                const incomplete = items.length > 0 && quoted < items.length;
                const filled = incomplete
                  ? completedBasketTRY(items, vendor.vendorId)
                  : Number(vendor.totalTRY);
                return (
                  <td
                    key={vendor.vendorId}
                    className={cn(
                      'px-1 py-2 text-center border-t-2 border-slate-400',
                      index < vendors.length - 1 && 'border-r border-slate-300',
                      incomplete ? 'bg-red-50' : 'bg-slate-300',
                    )}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectColumn(vendor.vendorId)}
                      className="w-full rounded-md px-1 py-2 hover:bg-black/5 disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          'text-[18px] font-bold tabular-nums',
                          incomplete ? 'text-red-800' : 'text-slate-900',
                        )}
                      >
                        {filled != null && Number.isFinite(filled) ? formatTRY(filled) : '—'}
                      </span>
                      {incomplete ? (
                        <p className="mt-1 text-[11px] font-semibold leading-snug text-red-800">
                          En uygun fiyatlı ürünler ile eksik kalemler tamamlandığında
                        </p>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
