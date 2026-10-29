'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SITE_BRAND } from '@/lib/brand';

export type DossierVendor = {
  vendorId: string;
  vendorName: string;
  totalTRY: number;
  isMarket?: boolean;
  maturityLabel?: string;
  shippingLabel?: string;
  city?: string | null;
  shippingCostTRY?: number | null;
  overallDiscountRate?: number;
  usdRateFixed?: boolean;
  usdRate?: number | null;
  eurRate?: number | null;
  chfRate?: number | null;
  quoteNote?: string | null;
  quotedItemCount?: number;
};

export type DossierQuote = {
  vendorId: string;
  vendorName: string;
  price: number;
  discountRate?: number;
  priceLabel?: string;
  lineNetTRY?: number | null;
  isChosen?: boolean;
  isBestForItem?: boolean;
};

export type DossierItem = {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  category?: string | null;
  chosenVendorId?: string | null;
  chosenLineNetTRY?: number | null;
  quotes: DossierQuote[];
};

export type DossierTrail = {
  action: string;
  label: string;
  name: string | null;
  at: string;
  note?: string | null;
};

export type OrderDossier = {
  id: string;
  title: string;
  createdAt?: string;
  requesterUnit?: string | null;
  createdByName?: string | null;
  unitNote?: string | null;
  managerNote?: string | null;
  neededBy?: string | null;
  vendors: DossierVendor[];
  items: DossierItem[];
  approvalTrail: DossierTrail[];
  orderVendors: {
    vendorId: string;
    vendorName: string;
    itemCount: number;
    totalTRY: number;
    selectedAt?: string | null;
  }[];
  printedAt?: string;
  totalTRY?: number;
};

const formatTRY = (n: number) =>
  `${Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;

const formatWhen = (raw?: string | null) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type Row =
  | { type: 'unit'; key: string; name: string }
  | { type: 'item'; key: string; item: DossierItem };

function tableRows(items: DossierItem[]): Row[] {
  const groups: { name: string; items: DossierItem[] }[] = [];
  const indexByName = new Map<string, number>();
  for (const item of items) {
    const name = String(item.category || 'GENEL').trim() || 'GENEL';
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
  for (const g of groups) {
    if (showHeaders) rows.push({ type: 'unit', key: `unit-${g.name}`, name: g.name });
    for (const item of g.items) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

function chosenBasketTRY(items: DossierItem[]) {
  return items.reduce((sum, it) => {
    const n = it.chosenLineNetTRY;
    return sum + (n != null && Number.isFinite(n) ? n : 0);
  }, 0);
}

export function OrderDossierSheet({ data }: { data: OrderDossier }) {
  const vendors = data.vendors || [];
  const items = data.items || [];
  const trail = data.approvalTrail || [];
  const orderVendors = data.orderVendors || [];
  const chosenTotal = chosenBasketTRY(items);

  return (
    <article className="dossier-sheet bg-white text-slate-900">
      <header className="border-b-2 border-slate-900 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
              {SITE_BRAND} · sipariş / onay dosyası
            </p>
            <h1 className="mt-1 text-[22px] font-black leading-tight text-slate-900">{data.title}</h1>
            <p className="mt-1 text-[12px] text-slate-600">
              {data.createdByName ? `${data.createdByName}` : ''}
              {data.requesterUnit ? ` · ${data.requesterUnit}` : ''}
              {data.neededBy
                ? ` · ihtiyaç: ${new Date(data.neededBy).toLocaleDateString('tr-TR')}`
                : ''}
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-500 tabular-nums">
            <p>Çıktı: {formatWhen(data.printedAt)}</p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-400">#{String(data.id).slice(-8).toUpperCase()}</p>
          </div>
        </div>
      </header>

      {trail.length > 0 && (
        <section className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {trail.map((step) => (
            <div
              key={`${step.action}-${step.at}`}
              className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2"
            >
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{step.label}</p>
              <p className="mt-0.5 text-[14px] font-bold text-slate-900">{step.name || '—'}</p>
              <p className="text-[11px] tabular-nums text-slate-600">{formatWhen(step.at)}</p>
              {step.note ? (
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-slate-700">{step.note}</p>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {(data.unitNote || data.managerNote) && (
        <section className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.unitNote ? (
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Birim notu</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{data.unitNote}</p>
            </div>
          ) : null}
          {data.managerNote ? (
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Yetkili notu</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">{data.managerNote}</p>
            </div>
          ) : null}
        </section>
      )}

      {orderVendors.length > 0 && (
        <section className="mt-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
            Sipariş verilecek cari
          </p>
          <ul className="mt-1 space-y-1.5 text-[13px] font-semibold text-slate-900">
            {orderVendors.map((v) => (
              <li key={v.vendorId}>
                <p className="text-[14px] font-bold text-slate-900">
                  {v.vendorName}
                  <span className="ml-2 text-[11px] font-medium text-slate-600">
                    {v.itemCount} kalem
                    {v.totalTRY > 0 ? ` · ${formatTRY(v.totalTRY)}` : ''}
                  </span>
                </p>
                {v.selectedAt ? (
                  <p className="text-[11px] font-medium tabular-nums text-slate-600">{formatWhen(v.selectedAt)}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {chosenTotal > 0 && (
            <p className="mt-1.5 text-[13px] font-black text-slate-900">
              Seçilen kalemler toplamı (KDV hariç): {formatTRY(chosenTotal)}
            </p>
          )}
        </section>
      )}

      <section className="mt-3 overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="min-w-[10rem] border border-slate-300 bg-slate-100 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
                Kalem
              </th>
              <th className="min-w-[3.2rem] border border-slate-300 bg-slate-100 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-600">
                Adet
              </th>
              {vendors.map((v) => (
                <th
                  key={v.vendorId}
                  className="min-w-[9.5rem] border border-slate-300 bg-slate-100 px-1.5 py-2 text-center"
                >
                  <span className="block text-[13px] font-bold leading-snug text-slate-900">{v.vendorName}</span>
                  {v.isMarket ? (
                    <span className="mt-0.5 inline-block rounded bg-sky-100 px-1 text-[9px] font-extrabold uppercase text-sky-800">
                      Online
                    </span>
                  ) : (
                    <>
                      <span className="mt-0.5 block text-[10px] font-medium text-slate-600">
                        Vade: {v.maturityLabel || '—'}
                      </span>
                      <span className="block text-[10px] font-medium text-slate-600">
                        Nakliye: {v.shippingLabel || '—'}
                      </span>
                      {v.city ? (
                        <span className="block text-[10px] font-medium text-slate-600">Şehir: {v.city}</span>
                      ) : null}
                      {/hariç/i.test(String(v.shippingLabel || '')) &&
                        v.shippingCostTRY != null &&
                        Number.isFinite(Number(v.shippingCostTRY)) && (
                          <span className="block text-[10px] font-semibold text-slate-800">
                            Nakliye: {formatTRY(Number(v.shippingCostTRY))}
                          </span>
                        )}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows(items).map((row) => {
              if (row.type === 'unit') {
                return (
                  <tr key={row.key}>
                    <td
                      colSpan={2 + vendors.length}
                      className="border border-[#b8960a] bg-[#D9B625] py-1 text-center text-[11px] font-black uppercase tracking-[0.14em] text-slate-900"
                    >
                      {row.name}
                    </td>
                  </tr>
                );
              }
              const item = row.item;
              const unitLabel = String(item.unit || 'Adet').trim() || 'Adet';
              const isAdet = unitLabel.toLocaleLowerCase('tr-TR') === 'adet';
              const qty = Number(item.quantity) || 0;
              return (
                <tr key={item.id}>
                  <td className="border border-slate-300 bg-white px-2 py-1.5 align-middle">
                    <p className="font-semibold leading-snug text-slate-900">{item.productName}</p>
                  </td>
                  <td className="border border-slate-300 bg-slate-50 px-1 py-1.5 text-center align-middle tabular-nums">
                    <span className="text-[15px] font-bold">{item.quantity}</span>
                    {!isAdet && <span className="mt-0.5 block text-[10px] text-slate-500">{unitLabel}</span>}
                  </td>
                  {vendors.map((v) => {
                    const q = item.quotes.find((x) => x.vendorId === v.vendorId);
                    const chosen = item.chosenVendorId === v.vendorId;
                    if (!q) {
                      return (
                        <td
                          key={v.vendorId}
                          className="border border-slate-300 bg-white px-1 py-2 text-center text-slate-300"
                        >
                          —
                        </td>
                      );
                    }
                    const line = q.lineNetTRY;
                    const unitNet =
                      line != null && Number.isFinite(line) && qty > 0 ? line / qty : null;
                    return (
                      <td
                        key={v.vendorId}
                        className={cn(
                          'relative border border-slate-300 px-1 py-1.5 text-center align-middle',
                          chosen
                            ? 'bg-[rgba(22,163,74,0.22)]'
                            : q.isBestForItem
                              ? 'bg-[#fef3c7]'
                              : 'bg-white',
                        )}
                      >
                        {chosen && (
                          <span
                            className="absolute right-0.5 top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-700 text-white"
                            title="Sipariş"
                            aria-label="Sipariş"
                          >
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        )}
                        <p className="text-[10px] font-semibold leading-none text-slate-500">Birim</p>
                        <p className="text-[14px] font-bold tabular-nums leading-tight text-slate-900">
                          {unitNet != null ? formatTRY(unitNet) : q.priceLabel || '—'}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold leading-none text-slate-500">Toplam</p>
                        <p className="text-[12px] font-semibold tabular-nums leading-tight text-slate-800">
                          {line != null ? formatTRY(line) : '—'}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && vendors.length > 0 && (
            <tfoot>
              <tr>
                <td
                  colSpan={2}
                  className="border border-slate-400 bg-slate-200 px-2 py-2 text-right text-[11px] font-black uppercase tracking-wide text-slate-800"
                >
                  Genel toplam
                </td>
                {vendors.map((v) => {
                  const filled = items.reduce((sum, it) => {
                    const q = it.quotes.find((x) => x.vendorId === v.vendorId);
                    const n = q?.lineNetTRY;
                    return sum + (n != null && Number.isFinite(n) ? n : 0);
                  }, 0);
                  return (
                    <td
                      key={v.vendorId}
                      className="border border-slate-400 bg-slate-200 px-1 py-2 text-center text-[14px] font-black tabular-nums text-slate-900"
                    >
                      {filled > 0 ? formatTRY(filled) : '—'}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Tutarlar KDV hariçtir. Sarı hücre: kalemde en uygun teklif. Yeşil hücre / sağ üst tik: sipariş carisi.
        Bu çıktı dosyalama ve irsaliye eki içindir.
      </p>
    </article>
  );
}
