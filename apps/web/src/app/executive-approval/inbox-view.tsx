'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ItemMediaStrip, ProcurementMediaPanel } from '@/components/ProcurementMedia';
import { ExecRequestIntro } from '@/components/ExecRequestIntro';
import { RichBody } from '@/components/RichBody';
import { pageTitle } from '@/lib/brand';

type VendorCard = {
  vendorId: string;
  vendorName: string;
  totalTRY: number;
  isBest?: boolean;
  isMarket?: boolean;
  marketChannel?: string | null;
  marketUrl?: string | null;
  marketSellerName?: string | null;
  vatLabel?: string;
  maturityLabel?: string;
  shippingLabel?: string;
  city?: string | null;
  shippingCostTRY?: number | null;
  overallDiscountRate?: number;
  quotedItemCount?: number;
  usdRateFixed?: boolean;
  usdRate?: number | null;
  eurRate?: number | null;
  chfRate?: number | null;
  quoteNote?: string | null;
};

type InboxItem = {
  id: string;
  title: string;
  status?: string;
  totalTRY: number;
  limitAmount: number;
  exceedsLimitBy: number;
  itemCount: number;
  kind?: 'OVER_LIMIT' | 'PRODUCTION_DECISION';
  moduleId?: string | null;
  vendors: VendorCard[];
  bestVendorId?: string | null;
  evaluationMode?: 'PER_ITEM' | 'SINGLE';
  itemEval?: {
    bestMixedTotalTRY?: number;
    itemsWithQuotes?: number;
    itemsWhereChosenIsBest?: number;
    itemsWhereChosenDiffers?: number;
    potentialSavingTRY?: number | null;
  };
  requesterUnit?: string | null;
  createdByName?: string | null;
  unitNote?: string | null;
  managerNote?: string | null;
  neededBy?: string | null;
  avgShippingCostTRY?: number | null;
  escalatedByName?: string | null;
  escalatedAt?: string | null;
  createdAt?: string | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    unit: string;
    category?: string | null;
    sortOrder?: number | null;
    chosenVendorId?: string | null;
    bestForItemVendorId?: string | null;
    bestForItemVendorName?: string | null;
    bestForItemLineNetTRY?: number | null;
    bestForItemPriceLabel?: string | null;
    chosenLineNetTRY?: number | null;
    chosenDiffersFromBest?: boolean;
    quotes: {
      vendorId: string;
      vendorName: string;
      price: number;
      currency: string;
      discountRate?: number;
      priceLabel?: string;
      lineNetLabel?: string;
      lineNetTRY?: number | null;
      isChosen?: boolean;
      isBestVendor?: boolean;
      isBestForItem?: boolean;
      isMarket?: boolean;
      marketUrl?: string | null;
    }[];
  }[];
  shippingInputs?: {
    vendorId: string;
    vendorName: string;
    city?: string | null;
    shippingCostTRY?: number | null;
  }[];
  attachments?: {
    id: string;
    originalName: string;
    mimeType?: string | null;
    size?: number;
    kind?: string | null;
    vendorId?: string | null;
    itemId?: string | null;
    vendor?: { id?: string; name?: string } | null;
    item?: { id?: string; productName?: string } | null;
  }[];
  unitAttachments?: {
    id: string;
    originalName: string;
    mimeType?: string | null;
    size?: number;
    kind?: string | null;
  }[];
};

function parseTryAmount(raw: string): number | null {
  const s = String(raw || '').trim().replace(/\s/g, '');
  if (!s) return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const formatTRY = (n: number) =>
  `${Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;

/** Teklif analiz raporu ile aynı hücre vurguları */
const CELL = {
  best: 'bg-[#fef3c7]',
  pickYes: 'bg-[rgba(22,163,74,0.2)]',
  pickNo: 'bg-[rgba(239,68,68,0.14)]',
  base: 'bg-white',
  fill: 'bg-red-50',
} as const;

type ExecQuote = InboxItem['items'][number]['quotes'][number];

function bestActualQuote(item: ExecItem): ExecQuote | null {
  let best: ExecQuote | null = null;
  for (const q of item.quotes || []) {
    const n = q.lineNetTRY;
    if (n == null || !Number.isFinite(n)) continue;
    if (!best || n < (best.lineNetTRY as number)) best = q;
  }
  return best;
}

function completedBasketTRY(items: ExecItem[], vendorId: string): number | null {
  let sum = 0;
  let any = false;
  for (const item of items) {
    const own = (item.quotes || []).find((q) => q.vendorId === vendorId);
    const n =
      own?.lineNetTRY != null && Number.isFinite(own.lineNetTRY)
        ? own.lineNetTRY
        : bestActualQuote(item)?.lineNetTRY;
    if (n == null || !Number.isFinite(n)) continue;
    sum += n;
    any = true;
  }
  return any ? sum : null;
}

function completeBestVendorId(vendors: VendorCard[] | undefined, itemCount: number) {
  if (!itemCount) return null;
  let id: string | null = null;
  let best = Infinity;
  for (const v of vendors || []) {
    const quoted = Number(v.quotedItemCount) || 0;
    if (quoted < itemCount) continue;
    const total = Number(v.totalTRY);
    if (!Number.isFinite(total) || total >= best) continue;
    best = total;
    id = v.vendorId;
  }
  return id;
}

function unitGroupName(category?: string | null) {
  const t = String(category || '').trim();
  return t || 'GENEL';
}

type ExecItem = InboxItem['items'][number];
type ExecTableRow =
  | { type: 'unit'; key: string; name: string }
  | { type: 'item'; key: string; item: ExecItem };

function buildExecTableRows(items: ExecItem[] | undefined): ExecTableRow[] {
  const list = items || [];
  const groups: { name: string; items: ExecItem[] }[] = [];
  const indexByName = new Map<string, number>();
  for (const item of list) {
    const name = unitGroupName(item.category);
    const idx = indexByName.get(name);
    if (idx === undefined) {
      indexByName.set(name, groups.length);
      groups.push({ name, items: [item] });
    } else {
      groups[idx].items.push(item);
    }
  }
  const showHeaders = groups.length > 1;
  const rows: ExecTableRow[] = [];
  for (const g of groups) {
    if (showHeaders) rows.push({ type: 'unit', key: `unit-${g.name}`, name: g.name });
    for (const item of g.items) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

function requestCode(id: string) {
  return `#${String(id || '').slice(-6).toUpperCase()}`;
}

function trUpper(s: string) {
  return String(s || '').toLocaleUpperCase('tr-TR');
}

function isProductionDecision(item: Pick<InboxItem, 'kind' | 'moduleId'> | null | undefined) {
  if (!item) return false;
  if (item.kind === 'PRODUCTION_DECISION') return true;
  if (item.kind === 'OVER_LIMIT') return false;
  return (item.moduleId || '') === 'URETIM_PLANLAMA' || item.moduleId === 'YEDEK_PARCA';
}

/** Üretimde karar talep durumunu değiştirmez (kaydet); yedek parçada onay siparişi açar (onayla). */
function decisionVerb(item: Pick<InboxItem, 'kind' | 'moduleId'> | null | undefined) {
  return isProductionDecision(item) && item?.moduleId !== 'YEDEK_PARCA' ? 'kaydet' : 'onayla';
}

function requestSentAt(item: Pick<InboxItem, 'escalatedAt' | 'createdAt'>) {
  return item.escalatedAt || item.createdAt || null;
}

function formatDateTimeTr(raw?: string | null) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceModuleLabel(item: Pick<InboxItem, 'kind' | 'moduleId'> | null | undefined) {
  if (item?.moduleId === 'YEDEK_PARCA') return 'YEDEK PARÇA';
  return isProductionDecision(item) ? 'ÜRETİM PLANLAMA' : 'SATIN ALMA';
}

function RequestContextBlock({ item }: { item: InboxItem }) {
  const sentLabel = formatDateTimeTr(requestSentAt(item));
  const production = isProductionDecision(item);
  return (
    <div className="border-b border-slate-200 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.16em]',
            production
              ? 'border-sky-300 bg-sky-50 text-sky-800'
              : 'border-amber-400 bg-amber-50 text-amber-950',
          )}
        >
          {sourceModuleLabel(item)}
        </span>
      </div>
      <h2 className="mt-1.5 text-[15px] font-semibold uppercase tracking-wide text-slate-900 leading-snug">
        {trUpper(item.title)}
        <span className="ml-2 font-mono text-[12px] font-normal tracking-wider text-slate-500">
          {requestCode(item.id)}
        </span>
      </h2>
      {sentLabel && (
        <p className="mt-1.5 text-[12px] text-slate-500">
          {production ? 'Karar kutusuna düştü' : 'Onaya gönderildi'}: {sentLabel}
        </p>
      )}
      {item.neededBy && (
        <p className="mt-1 text-[12px] text-slate-600">
          Birim ihtiyaç tarihi:{' '}
          {new Date(item.neededBy).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}

function maturityPhrase(label?: string | null) {
  const raw = String(label || '').trim();
  if (!raw || raw === 'Hayır' || raw === '—') return 'peşin';
  if (/gün/i.test(raw)) return `${raw} vade`;
  if (raw === 'Evet') return 'vadeli ödeme';
  return `${raw} vade`;
}

function vatParts(label?: string | null): { prefix: string; bold: string } {
  const raw = String(label || '').trim();
  if (!raw || raw === 'Dahil') return { prefix: '', bold: 'KDV dahil' };
  const m = raw.match(/Hariç\s*\(%?\s*([\d.,]+)\)/i);
  if (m) return { prefix: `%${m[1]} `, bold: 'KDV hariç' };
  if (/hariç/i.test(raw)) return { prefix: '', bold: 'KDV hariç' };
  return { prefix: '', bold: raw };
}

function shippingBold(label?: string | null) {
  const raw = String(label || '').trim();
  if (!raw || raw === 'Dahil') return 'nakliye dahil';
  return 'nakliye hariç';
}

const confirmEm = (children: ReactNode) => (
  <strong className="font-semibold text-slate-900">{children}</strong>
);

/** Onay öncesi özet: talep / tedarikçi / kalem / fiyat / vade / KDV / nakliye */
function buildPurchaseConfirmLines(
  request: InboxItem,
  choices: Record<string, string>,
): ReactNode[] {
  const lines: ReactNode[] = [];
  for (const item of request.items || []) {
    if (!(item.quotes || []).length) continue;
    const vendorId = choices[item.id];
    if (!vendorId) continue;
    const quote = item.quotes.find((q) => q.vendorId === vendorId);
    const vendor = (request.vendors || []).find((v) => v.vendorId === vendorId);
    if (!quote || !vendor) continue;

    const price =
      quote.lineNetTRY != null
        ? formatTRY(quote.lineNetTRY)
        : quote.lineNetLabel || formatTRY(0);
    const qty = `${Number(item.quantity || 0).toLocaleString('tr-TR')} ${item.unit}`;

    if (vendor.isMarket) {
      lines.push(
        <>
          {request.title} talebi için {confirmEm(vendor.vendorName)} üzerinden{' '}
          {confirmEm(item.productName)} kalemini ({qty}) {confirmEm(price)} bedelle
          online sipariş olarak {decisionVerb(request)}.
        </>,
      );
      continue;
    }

    const vat = vatParts(vendor.vatLabel);

    lines.push(
      <>
        {request.title} talebi için {confirmEm(vendor.vendorName)} tedarikçisinden{' '}
        {confirmEm(item.productName)} kalem ürününü ({qty}) {confirmEm(price)} fiyatına,{' '}
        {confirmEm(maturityPhrase(vendor.maturityLabel))}, {vat.prefix}
        {confirmEm(vat.bold)} ile, {confirmEm(shippingBold(vendor.shippingLabel))} bedeliyle
        satın almayı {decisionVerb(request)}.
      </>,
    );
  }
  return lines;
}

function CollapsibleAttach({
  title,
  count,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 self-start overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-700" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 truncate">
            {title}
          </span>
          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
            {count}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500">
          {open ? 'Gizle' : 'Göster'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="border-t border-slate-200 px-4 py-3">{children}</div>}
    </section>
  );
}

export function ExecutiveApprovalInbox({
  mode,
  token = '',
}: {
  mode: 'executive' | 'manager';
  token?: string;
}) {
  const qc = useQueryClient();
  const isManager = mode === 'manager';
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<'approve' | 'reject' | 'incomplete' | null>(null);
  /** Talep id → kalem id → seçilen vendorId */
  const [choicesByRequest, setChoicesByRequest] = useState<Record<string, Record<string, string>>>(
    {},
  );
  /** Sütun tıklanınca (eksik kalemler en uygunla dolduruldu) */
  const [columnPickByRequest, setColumnPickByRequest] = useState<Record<string, string | null>>(
    {},
  );
  /** Birim + satın alma + tedarikçi ekleri tek tıkla birlikte */
  const [attachPanelsOpen, setAttachPanelsOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [shippingDraft, setShippingDraft] = useState<Record<string, string>>({});
  const focusedFromQuery = useRef(false);
  const inboxKey = isManager ? ['manager-under-limit-inbox'] : ['over-limit-inbox', token];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: inboxKey,
    queryFn: async () => {
      if (isManager) {
        const { data: d } = await procurementApi.getManagerUnderLimitInbox();
        return d as { pendingCount: number; pending: InboxItem[] };
      }
      const { data: d } = await procurementApi.getOverLimitInboxByToken(token);
      return d as {
        access: { email: string; dayKey: string; expiresAt: string };
        pendingCount: number;
        pending: InboxItem[];
      };
    },
    retry: false,
  });

  const pending = useMemo(() => {
    const list = [...(data?.pending || [])];
    list.sort((a, b) => {
      const ta = new Date(requestSentAt(a) || 0).getTime();
      const tb = new Date(requestSentAt(b) || 0).getTime();
      return ta - tb;
    });
    return list;
  }, [data?.pending]);
  const pendingCount = pending.length;
  const safeIndex = Math.min(index, Math.max(0, pending.length - 1));
  const current = pending[safeIndex] || null;
  const choices = (current && choicesByRequest[current.id]) || {};

  useEffect(() => {
    if (!current) {
      document.title = pageTitle(isManager ? 'Limit altı onay' : 'Üst yönetim onayı');
      return;
    }
    document.title = pageTitle(sourceModuleLabel(current), current.title);
  }, [current]);

  useEffect(() => {
    setAttachPanelsOpen(false);
    const next: Record<string, string> = {};
    for (const row of current?.shippingInputs || []) {
      next[row.vendorId] =
        row.shippingCostTRY != null && Number.isFinite(Number(row.shippingCostTRY))
          ? String(row.shippingCostTRY)
          : '';
    }
    setShippingDraft(next);
  }, [current?.id, current?.shippingInputs]);

  useEffect(() => {
    if (!current?.id) {
      setIntroOpen(false);
      return;
    }
    setIntroOpen(true);
  }, [current?.id]);

  useEffect(() => {
    if (focusedFromQuery.current || !pending.length) return;
    if (typeof window === 'undefined') return;
    const r = new URLSearchParams(window.location.search).get('r');
    if (!r) {
      focusedFromQuery.current = true;
      return;
    }
    const idx = pending.findIndex((p) => p.id === r);
    if (idx >= 0) setIndex(idx);
    focusedFromQuery.current = true;
  }, [pending]);

  const applyPendingInbox = (inbox: { pending: InboxItem[]; pendingCount?: number } | null) => {
    if (!inbox?.pending) {
      void qc.invalidateQueries({ queryKey: inboxKey });
      return;
    }
    qc.setQueryData(inboxKey, (old: typeof data) =>
      old
        ? {
            ...old,
            pending: inbox.pending,
            pendingCount: inbox.pendingCount ?? inbox.pending.length,
          }
        : old,
    );
    setIndex((i) => Math.min(i, Math.max(0, inbox.pending.length - 1)));
  };

  const setChoice = (itemId: string, vendorId: string) => {
    if (!current) return;
    setColumnPickByRequest((prev) => ({ ...prev, [current.id]: null }));
    setChoicesByRequest((prev) => {
      const row = { ...(prev[current.id] || {}) };
      if (row[itemId] === vendorId) delete row[itemId];
      else row[itemId] = vendorId;
      return { ...prev, [current.id]: row };
    });
  };

  /** Sütun tıklanınca: bu firmanın teklifi varsa onu al, yoksa kırmızıdaki en uygun fiyatı (o cariyi) seç. */
  const columnAssignment = (vendorId: string): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!current) return next;
    for (const it of current.items || []) {
      const own = (it.quotes || []).some((q) => q.vendorId === vendorId && q.price != null);
      if (own) {
        next[it.id] = vendorId;
        continue;
      }
      const fill = bestActualQuote(it);
      if (fill) next[it.id] = fill.vendorId;
    }
    return next;
  };

  const selectVendorColumn = (vendorId: string) => {
    if (!current) return;
    const assignment = columnAssignment(vendorId);
    if (!Object.keys(assignment).length) return;
    const currentRow = choicesByRequest[current.id] || {};
    const allOn = Object.entries(assignment).every(([id, vid]) => currentRow[id] === vid);
    setChoicesByRequest((prev) => {
      const row = { ...(prev[current.id] || {}) };
      if (allOn) {
        for (const id of Object.keys(assignment)) delete row[id];
      } else {
        Object.assign(row, assignment);
      }
      return { ...prev, [current.id]: row };
    });
    setColumnPickByRequest((prev) => ({
      ...prev,
      [current.id]: allOn ? null : vendorId,
    }));
  };

  const selectableItems = useMemo(
    () =>
      (current?.items || []).filter((it) =>
        (it.quotes || []).some((q) => q.price != null)
      ),
    [current],
  );

  const unselectedItems = useMemo(
    () => selectableItems.filter((it) => !choices[it.id]),
    [selectableItems, choices],
  );

  const soleSelectedVendor = useMemo(() => {
    if (!current || !selectableItems.length) return null;
    const ids = selectableItems.map((it) => choices[it.id]);
    if (ids.some((id) => !id)) return null;
    const first = ids[0];
    if (!first || ids.some((id) => id !== first)) return null;
    return (current.vendors || []).find((v) => v.vendorId === first) || null;
  }, [current, selectableItems, choices]);

  const filledColumnVendor = useMemo(() => {
    if (!current || soleSelectedVendor || unselectedItems.length) return null;
    const vid = columnPickByRequest[current.id];
    if (!vid) return null;
    return (current.vendors || []).find((v) => v.vendorId === vid) || null;
  }, [current, soleSelectedVendor, unselectedItems.length, columnPickByRequest]);

  const confirmLines = useMemo(() => {
    if (!current) return [];
    return buildPurchaseConfirmLines(current, choices);
  }, [current, choices]);

  const decisionMut = useMutation({
    mutationFn: async ({
      action,
      requestId,
    }: {
      action: 'approve' | 'reject';
      requestId: string;
    }) => {
      if (action === 'approve') {
        const picked = choicesByRequest[requestId] || {};
        const payload = selectableItems.map((it) => ({
          itemId: it.id,
          vendorId: picked[it.id] || null,
        }));
        if (isManager) {
          const costs =
            current?.status === 'VENDOR_QUOTED'
              ? (current.shippingInputs || []).map((row) => ({
                  vendorId: row.vendorId,
                  costTRY: parseTryAmount(shippingDraft[row.vendorId] || ''),
                }))
              : [];
          return procurementApi.approveManagerUnderLimit(
            requestId,
            note || undefined,
            payload,
            costs.filter((row) => row.costTRY != null) as Array<{ vendorId: string; costTRY: number }>,
          );
        }
        return procurementApi.approveOverLimitByToken(
          token,
          requestId,
          note || undefined,
          payload,
        );
      }
      if (isManager) {
        return procurementApi.rejectManagerUnderLimit(requestId, note || undefined);
      }
      return procurementApi.rejectOverLimitByToken(token, requestId, note || undefined);
    },
    onSuccess: (res, vars) => {
      const inbox = (res.data as { inbox?: { pending?: InboxItem[]; pendingCount?: number } })
        ?.inbox;
      const remaining = inbox?.pending || [];

      setConfirmDialog(null);
      setNote('');
      if (vars.action === 'approve') {
        setChoicesByRequest((prev) => {
          const next = { ...prev };
          delete next[vars.requestId];
          return next;
        });
      }

      applyPendingInbox(
        inbox?.pending
          ? { pending: remaining, pendingCount: inbox.pendingCount ?? remaining.length }
          : null,
      );

      if (isManager) {
        const body = res.data as {
          escalated?: boolean;
          routed?: boolean;
          routeError?: string | null;
        };
        if (vars.action === 'reject') {
          toast.success('Talep personele iade edildi.');
        } else if (body.escalated) {
          toast.message('Tutar limiti aştığı için üst yönetime iletildi.');
        } else if (body.routed === false) {
          toast.error(body.routeError || 'Onaylandı; personele otomatik yönlenemedi.');
        } else {
          toast.success('Onaylandı ve personele yönlendirildi.');
        }
      } else {
        toast.success(
          vars.action === 'approve'
            ? (res.data as { kind?: string })?.kind === 'PRODUCTION_DECISION'
              ? 'Tedarikçi seçimi kaydedildi.'
              : 'Seçim onaylandı; kayıt satın alma birimine iletildi.'
            : (res.data as { kind?: string })?.kind === 'PRODUCTION_DECISION'
              ? 'Karar geri gönderildi; teklif kilidi kalktı.'
              : 'Satın alım reddedildi; kayıt yetkiliye iade edildi.',
        );
      }
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'İşlem başarısız.',
      );
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-100 text-slate-800 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Onay kutusu yükleniyor…</p>
      </div>
    );
  }

  if (isError || !data) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const msg =
      status === 410
        ? 'Bu bağlantının süresi dolmuş. Satın alma ekibinden yeni link isteyin.'
        : (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Bağlantı geçersiz veya kullanılamıyor.';
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-100 text-slate-800 p-6">
        <AlertTriangle className="h-12 w-12 text-amber-600 mb-4" />
        <p className="text-center text-slate-600 max-w-md">{msg}</p>
      </div>
    );
  }

  if (!pending.length) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-100 text-slate-800 p-6 gap-3">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <h1 className="text-xl font-semibold">Bekleyen karar yok</h1>
        <p className="text-sm text-slate-500 text-center max-w-md">
          {isManager
            ? 'Limit altında onayınızı bekleyen talep yok.'
            : 'Şu an kararınızı bekleyen talep bulunmuyor. Yeni bir talep kuyruğa düşünce e-posta ile bilgilendirilirsiniz.'}
        </p>
        {isManager ? (
          <Link href="/dashboard" className="text-sm font-medium text-slate-700 underline">
            Panele dön
          </Link>
        ) : null}
      </div>
    );
  }

  const production = isProductionDecision(current);

  return (
    <div className="min-h-[100dvh] bg-neutral-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-3 px-3 py-4 lg:px-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Uğur Promilling"
              className="h-9 w-auto object-contain shrink-0"
            />
            <span className="hidden sm:block h-7 w-px bg-slate-200" aria-hidden />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {isManager ? 'Satın alma yetkilisi' : 'Üst yönetim'}
              </p>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 leading-tight">
                {isManager ? 'Limit altı kararlar' : 'Bekleyen kararlar'}
              </h1>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Toplam {pendingCount} bekleyen karar
              </p>
            </div>
          </div>
          {isManager ? (
            <Link href="/dashboard" className="text-sm font-medium text-slate-600 underline">
              Panele dön
            </Link>
          ) : null}
        </div>
      </header>

      {current && (
        <main key={current.id} className="mx-auto w-full max-w-[1920px] space-y-4 px-3 py-5 pb-28 lg:px-4">
          <RequestContextBlock item={current} />

          {(current.unitNote || current.managerNote) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {current.unitNote && (
                <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {(() => {
                      const who = current.createdByName?.trim();
                      const unit = current.requesterUnit?.trim();
                      if (who && unit) return trUpper(`Birim notu - ${who} // ${unit}`);
                      if (who) return trUpper(`Birim notu - ${who}`);
                      if (unit) return trUpper(`Birim notu // ${unit}`);
                      return 'BİRİM NOTU';
                    })()}
                  </p>
                  <RichBody
                    text={current.unitNote}
                    requestId={current.id}
                    procurementRequestId={current.id}
                    overLimitToken={token}
                    className="mt-1.5 text-sm text-slate-800"
                  />
                </section>
              )}
              {current.managerNote && (
                <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Yetkili notu
                    {current.escalatedByName ? ` — ${current.escalatedByName}` : ''}
                  </p>
                  <RichBody
                    text={current.managerNote}
                    requestId={current.id}
                    className="mt-1.5 text-sm text-slate-800"
                  />
                </section>
              )}
            </div>
          )}

          {((current.unitAttachments || []).length > 0 ||
            (current.attachments || []).some((a) => a.kind !== 'INVOICE' && !a.itemId)) && (
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <CollapsibleAttach
                title="Birim ekleri"
                count={(current.unitAttachments || []).length}
                open={attachPanelsOpen}
                onOpenChange={setAttachPanelsOpen}
              >
                {(current.unitAttachments || []).length > 0 ? (
                  <ProcurementMediaPanel
                    simple
                    hideHeader
                    title="Birim ekleri"
                    description=""
                    attachments={current.unitAttachments}
                    items={[]}
                    requestId={current.id}
                    overLimitToken={token}
                    canUpload={false}
                  />
                ) : (
                  <p className="text-[11px] text-slate-400">Birimden genel dosya yok.</p>
                )}
              </CollapsibleAttach>
              <CollapsibleAttach
                title="Satın alma ekleri"
                count={
                  (current.attachments || []).filter(
                    (a) => a.kind !== 'INVOICE' && !a.itemId && !a.vendorId,
                  ).length
                }
                open={attachPanelsOpen}
                onOpenChange={setAttachPanelsOpen}
              >
                {(current.attachments || []).some(
                  (a) => a.kind !== 'INVOICE' && !a.itemId && !a.vendorId,
                ) ? (
                  <ProcurementMediaPanel
                    simple
                    hideHeader
                    title="Satın alma ekleri"
                    description=""
                    attachments={(current.attachments || []).filter(
                      (a) => a.kind !== 'INVOICE' && !a.itemId && !a.vendorId,
                    )}
                    items={[]}
                    requestId={current.id}
                    overLimitToken={token}
                    canUpload={false}
                  />
                ) : (
                  <p className="text-[11px] text-slate-400">Satın alma dosyası yok.</p>
                )}
              </CollapsibleAttach>
              <CollapsibleAttach
                title="Tedarikçi ekleri"
                count={
                  (current.attachments || []).filter(
                    (a) => a.kind !== 'INVOICE' && !a.itemId && Boolean(a.vendorId),
                  ).length
                }
                open={attachPanelsOpen}
                onOpenChange={setAttachPanelsOpen}
              >
                {(current.attachments || []).some(
                  (a) => a.kind !== 'INVOICE' && !a.itemId && Boolean(a.vendorId),
                ) ? (
                  <ProcurementMediaPanel
                    simple
                    hideHeader
                    title="Tedarikçi ekleri"
                    description=""
                    attachments={(current.attachments || []).filter(
                      (a) => a.kind !== 'INVOICE' && !a.itemId && Boolean(a.vendorId),
                    )}
                    items={[]}
                    requestId={current.id}
                    overLimitToken={token}
                    canUpload={false}
                  />
                ) : (
                  <p className="text-[11px] text-slate-400">Tedarikçiden genel dosya yok.</p>
                )}
              </CollapsibleAttach>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Teklifler</h3>

            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto overscroll-x-contain">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="min-w-[18rem] w-[24rem] px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-r border-slate-200 sticky top-0 z-[40] bg-slate-50">
                      Kalem
                    </th>
                    <th className="min-w-[3.5rem] w-[3.5rem] px-2 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-r border-slate-200 sticky top-0 z-[30] bg-slate-50">
                      Adet
                    </th>
                    {(current.vendors || []).map((v, vi) => {
                      const vade = String(v.maturityLabel || '').trim() || '—';
                      const nakliye = String(v.shippingLabel || '').trim() || '—';
                      const quotedIds = (current.items || [])
                        .filter((it) =>
                          (it.quotes || []).some((q) => q.vendorId === v.vendorId && q.price != null),
                        )
                        .map((it) => it.id);
                      const assignment = columnAssignment(v.vendorId);
                      const columnSelected =
                        Object.keys(assignment).length > 0 &&
                        Object.entries(assignment).every(([id, vid]) => choices[id] === vid);
                      return (
                        <th
                          key={v.vendorId}
                          className={cn(
                            'min-w-[13.5rem] px-1 py-1.5 text-center border-b border-slate-200 sticky top-0 z-[30]',
                            vi < (current.vendors?.length || 0) - 1 && 'border-r border-slate-200',
                            columnSelected ? 'bg-[rgba(22,163,74,0.18)]' : 'bg-slate-50',
                          )}
                        >
                          <button
                            type="button"
                            disabled={decisionMut.isPending || !quotedIds.length}
                            onClick={() => selectVendorColumn(v.vendorId)}
                            title={`${v.vendorName} — tekliflerini seç, eksikleri en uygun fiyattan tamamla`}
                            className="w-full rounded-md px-1 py-1.5 text-center hover:bg-black/5 disabled:opacity-50"
                          >
                          <span
                            className="block max-w-full truncate px-1 text-[14px] font-bold normal-case tracking-normal leading-snug text-slate-800"
                            title={v.vendorName}
                          >
                            {v.vendorName}
                          </span>
                          {v.isMarket ? (
                            <span className="mt-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-800">
                              Online
                            </span>
                          ) : (
                            <>
                          <span className="mt-1 block text-[12px] font-medium normal-case tracking-normal leading-tight text-slate-600 whitespace-nowrap">
                            Vade: {vade}
                          </span>
                          <span className="mt-0.5 block text-[12px] font-medium normal-case tracking-normal leading-tight text-slate-600 whitespace-nowrap">
                            Nakliye: {nakliye}
                          </span>
                          {v.city ? (
                            <span className="mt-0.5 block text-[12px] font-medium normal-case tracking-normal leading-tight text-slate-600 whitespace-nowrap">
                              Şehir: {v.city}
                            </span>
                          ) : null}
                          {v.usdRateFixed && Number(v.usdRate) > 0 && (
                            <span className="mt-0.5 block text-[12px] font-medium normal-case tracking-normal leading-tight text-slate-600 whitespace-nowrap">
                              USD: {Number(v.usdRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </span>
                          )}
                          {v.usdRateFixed && Number(v.eurRate) > 0 && (
                            <span className="mt-0.5 block text-[12px] font-medium normal-case tracking-normal leading-tight text-slate-600 whitespace-nowrap">
                              EUR: {Number(v.eurRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </span>
                          )}
                          {v.usdRateFixed && Number(v.chfRate) > 0 && (
                            <span className="mt-0.5 block text-[12px] font-medium normal-case tracking-normal leading-tight text-slate-600 whitespace-nowrap">
                              CHF: {Number(v.chfRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </span>
                          )}
                          {v.quoteNote ? (
                            <span
                              className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal leading-snug text-slate-600 whitespace-pre-wrap"
                              title={v.quoteNote}
                            >
                              {v.quoteNote}
                            </span>
                          ) : null}
                          {/hariç/i.test(nakliye) &&
                            v.shippingCostTRY != null &&
                            Number.isFinite(Number(v.shippingCostTRY)) && (
                              <span className="mt-0.5 block text-[12px] font-semibold normal-case tracking-normal leading-tight text-slate-800 whitespace-nowrap">
                                Nakliye bedeli: {formatTRY(Number(v.shippingCostTRY))}
                              </span>
                            )}
                            </>
                          )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {buildExecTableRows(current.items).map((row) => {
                    if (row.type === 'unit') {
                      return (
                        <tr key={row.key}>
                          <td
                            colSpan={2 + (current.vendors?.length || 0)}
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
                        <td
                          className={cn(
                            'px-3 py-2 align-middle border-r border-b border-slate-200 bg-white',
                          )}
                        >
                          <p className="whitespace-normal break-words font-semibold text-slate-900 leading-snug text-[15px]">
                            {item.productName}
                          </p>
                          <ItemMediaStrip
                            attachments={current.attachments}
                            itemId={item.id}
                            requestId={current.id}
                            overLimitToken={token}
                            compact
                          />
                        </td>
                        <td
                          className={cn(
                            'px-2 py-2 align-middle text-center tabular-nums whitespace-nowrap border-r border-b border-slate-200 bg-slate-50',
                          )}
                        >
                          <span className="text-lg font-bold text-slate-900">{item.quantity}</span>
                          {!isAdet && (
                            <span className="block text-[12px] text-slate-500 mt-0.5">{unitLabel}</span>
                          )}
                        </td>
                        {(current.vendors || []).map((v, vi) => {
                          const q = item.quotes.find((x) => x.vendorId === v.vendorId);
                          const edge =
                            vi < (current.vendors?.length || 0) - 1 && 'border-r border-slate-200';
                          const rowLine = 'border-b border-slate-200';
                          if (!q) {
                            const fill = bestActualQuote(item);
                            const qty = Number(item.quantity) || 0;
                            const fillLine = fill?.lineNetTRY;
                            const fillUnit =
                              fillLine != null && Number.isFinite(fillLine) && qty > 0
                                ? fillLine / qty
                                : null;
                            if (!fill || fillLine == null) {
                              return (
                                <td
                                  key={v.vendorId}
                                  className={cn(
                                    'px-2 py-2 align-middle text-center text-slate-300',
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
                              <td
                                key={v.vendorId}
                                className={cn('px-1.5 py-1.5 align-middle', edge, rowLine, CELL.fill)}
                              >
                                <div className="flex w-full min-h-[4.5rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center text-red-700">
                                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-red-600">
                                    En uygun
                                  </span>
                                  <span
                                    className="max-w-full truncate text-[12px] font-bold leading-tight text-red-800"
                                    title={fill.vendorName}
                                  >
                                    {fill.vendorName}
                                  </span>
                                  <span className="mt-1 text-[12px] font-semibold leading-none text-red-600 whitespace-nowrap">
                                    Birim
                                  </span>
                                  <span className="text-[18px] font-bold tabular-nums leading-tight whitespace-nowrap">
                                    {fillUnit != null ? formatTRY(fillUnit) : fill.priceLabel || '—'}
                                  </span>
                                  <span className="mt-1 text-[12px] font-semibold leading-none text-red-600 whitespace-nowrap">
                                    Toplam
                                  </span>
                                  <span className="text-[15px] font-semibold tabular-nums leading-tight whitespace-nowrap">
                                    {formatTRY(fillLine)}
                                  </span>
                                </div>
                              </td>
                            );
                          }
                          const isSelected = selectedVendorId === q.vendorId;
                          const isBest = Boolean(q.isBestForItem);
                          const disc = Number(q.discountRate) || 0;
                          const overallDisc = Number(v.overallDiscountRate) || 0;
                          const unitGross = Number(q.price);
                          const qty = Number(item.quantity) || 0;
                          const lineNet = q.lineNetTRY;
                          const unitNetTRY =
                            lineNet != null && Number.isFinite(lineNet) && qty > 0
                              ? lineNet / qty
                              : Number.isFinite(unitGross)
                                ? unitGross * (1 - disc / 100) * (1 - overallDisc / 100)
                                : null;
                          const cellBg = isSelected
                            ? CELL.pickYes
                            : isBest
                              ? CELL.best
                              : rowHasSelection
                                ? CELL.pickNo
                                : CELL.base;
                          const inner = (
                            <>
                              <span className="text-[13px] font-semibold leading-none text-slate-600 whitespace-nowrap">
                                Birim
                              </span>
                              <span className="text-[20px] font-bold tabular-nums leading-tight text-slate-900 whitespace-nowrap">
                                {unitNetTRY != null
                                  ? formatTRY(unitNetTRY)
                                  : q.priceLabel || '—'}
                              </span>
                              <span className="mt-1.5 text-[13px] font-semibold leading-none text-slate-600 whitespace-nowrap">
                                Toplam
                              </span>
                              <span className="text-[16px] font-semibold tabular-nums leading-tight text-slate-800 whitespace-nowrap">
                                {lineNet != null ? formatTRY(lineNet) : q.lineNetLabel || '—'}
                              </span>
                            </>
                          );
                          return (
                            <td
                              key={v.vendorId}
                              className={cn('px-1.5 py-1.5 align-middle transition-colors', edge, rowLine, cellBg)}
                            >
                              <button
                                type="button"
                                disabled={decisionMut.isPending}
                                onClick={() => setChoice(item.id, q.vendorId)}
                                className="flex w-full min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-none border-0 bg-transparent px-1.5 py-2 text-center"
                              >
                                {inner}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {current.items.length > 1 && (
                  <tfoot>
                    <tr aria-hidden>
                      <td
                        colSpan={2 + (current.vendors?.length || 0)}
                        className="h-2.5 bg-slate-50 p-0 border-0"
                      />
                    </tr>
                    <tr>
                      <td
                        colSpan={2}
                        className="px-3 py-5 text-right text-[13px] font-bold uppercase tracking-wide text-slate-800 bg-slate-300 border-t-2 border-r border-slate-400"
                      >
                        Genel toplam
                      </td>
                      {(current.vendors || []).map((v, vi) => {
                        const itemCount = current.items?.length || 0;
                        const quoted = Number(v.quotedItemCount) || 0;
                        const incomplete = itemCount > 0 && quoted < itemCount;
                        const bestCompleteId = completeBestVendorId(current.vendors, itemCount);
                        const isCheapest = !incomplete && v.vendorId === bestCompleteId;
                        const filledTotal = incomplete
                          ? completedBasketTRY(current.items, v.vendorId)
                          : Number(v.totalTRY);
                        const hasTotal = filledTotal != null && Number.isFinite(filledTotal);
                        return (
                          <td
                            key={v.vendorId}
                            className={cn(
                              'px-1 py-2 text-center border-t-2 border-slate-400',
                              vi < (current.vendors?.length || 0) - 1 && 'border-r border-slate-300',
                              isCheapest ? 'bg-[#fcd34d]' : incomplete ? 'bg-red-50' : 'bg-slate-300',
                            )}
                          >
                            <button
                              type="button"
                              disabled={decisionMut.isPending}
                              onClick={() => selectVendorColumn(v.vendorId)}
                              title={`${v.vendorName} — tekliflerini seç, eksikleri en uygun fiyattan tamamla`}
                              className="w-full rounded-md px-1 py-2 hover:bg-black/5 disabled:opacity-50"
                            >
                            <span
                              className={cn(
                                'text-[18px] font-bold tabular-nums leading-tight whitespace-nowrap',
                                incomplete ? 'text-red-800' : 'text-slate-900',
                              )}
                            >
                              {hasTotal ? formatTRY(filledTotal) : '—'}
                            </span>
                            {incomplete && (
                              <p className="mt-1 text-[11px] font-semibold leading-snug text-red-800">
                                En uygun fiyatlı ürünler ile eksik kalemler tamamlandığında
                              </p>
                            )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {soleSelectedVendor ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">
                Bütün kalemler{' '}
                <span className="font-black">{soleSelectedVendor.vendorName}</span> tedarikçisinden
                alınacaktır.
              </p>
            ) : filledColumnVendor ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                <span className="font-black">{filledColumnVendor.vendorName}</span> tedarikçisinin
                teklifleri seçildi; teklif vermediği kalemler en uygun fiyattan tamamlandı.
              </p>
            ) : null}
          </section>
        </main>
      )}

      {current && (
        <footer className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto grid w-full max-w-[1920px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-3 lg:px-4">
            <div className="justify-self-start">
              {isManager && current?.status !== 'PENDING_MANAGER_APPROVAL' ? null : (
              <Button
                type="button"
                variant="outline"
                className="h-11 px-5 border-rose-300 text-rose-700 hover:bg-rose-50"
                disabled={decisionMut.isPending}
                onClick={() => setConfirmDialog('reject')}
              >
                <XCircle className="h-4 w-4" />
                {isManager ? 'Personele iade et' : production ? 'Reddet' : 'Satın alımı reddet'}
              </Button>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 px-0 text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-35"
                  disabled={safeIndex <= 0 || decisionMut.isPending}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  aria-label="Önceki talep"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-3 text-slate-800 hover:bg-white hover:text-slate-900 disabled:opacity-35"
                  disabled={pending.length <= 1 || decisionMut.isPending}
                  onClick={() =>
                    setIndex((i) => (pending.length <= 1 ? i : (i + 1) % pending.length))
                  }
                >
                  Atla
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 px-0 text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-35"
                  disabled={safeIndex >= pending.length - 1 || decisionMut.isPending}
                  onClick={() => setIndex((i) => Math.min(pending.length - 1, i + 1))}
                  aria-label="Sonraki talep"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-[11px] tabular-nums text-slate-500">
                {safeIndex + 1}
                <span className="text-slate-400"> / </span>
                {pending.length}
              </span>
            </div>
            <div className="justify-self-end">
              <Button
                type="button"
                className="h-11 px-6 bg-emerald-700 hover:bg-emerald-600 text-white"
                disabled={decisionMut.isPending}
                onClick={() => {
                  if (unselectedItems.length > 0) {
                    setConfirmDialog('incomplete');
                    return;
                  }
                  setConfirmDialog('approve');
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                {production ? 'Onayla' : 'Satın almayı onayla'}
              </Button>
            </div>
          </div>
        </footer>
      )}

      {confirmDialog === 'incomplete' && current && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exec-incomplete-title"
        >
          <div
            className="flex max-h-[min(85dvh,40rem)] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="exec-incomplete-title" className="shrink-0 text-base font-semibold text-slate-900">
              Seçilmeyen kalemler
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Şu kalemlerde cari seçilmedi. Onaya devam ederseniz bu kalemler atlanır:
            </p>
            <ul className="mt-3 min-h-0 flex-1 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-slate-800">
              {unselectedItems.map((it) => (
                <li key={it.id}>{it.productName}</li>
              ))}
            </ul>
            <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                onClick={() => setConfirmDialog(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                className="bg-emerald-700 text-white hover:bg-emerald-600"
                onClick={() => setConfirmDialog('approve')}
              >
                Yine de devam et
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog === 'approve' && current && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exec-approve-title"
        >
          <div
            className="flex max-h-[min(85dvh,40rem)] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="exec-approve-title" className="shrink-0 text-base font-semibold text-slate-900">
              {production
                ? current?.moduleId === 'YEDEK_PARCA'
                  ? 'Tedarikçi seçimini onayla'
                  : 'Tedarikçi seçimini kaydet'
                : 'Satın almayı onayla'}
            </h3>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {confirmLines.length > 0 ? (
                confirmLines.map((line, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-600">
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-sm leading-relaxed text-slate-600">
                  {production
                    ? 'Hiçbir kalemde cari seçilmedi. Seçim kaydedilir; kalemler atlanır.'
                    : 'Hiçbir kalemde cari seçilmedi. Talep onaylanır; kalemler atlanır.'}
                </p>
              )}
              {unselectedItems.length > 0 && confirmLines.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[12px] font-semibold text-amber-900">Seçilmeyen kalemler (atlanacak)</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-amber-900/90">
                    {unselectedItems.map((it) => (
                      <li key={it.id}>{it.productName}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {isManager && current.status === 'VENDOR_QUOTED' && (current.shippingInputs || []).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[12px] font-semibold text-slate-700">Nakliye bedeli (TRY)</p>
                  {(current.shippingInputs || []).map((row) => (
                    <label key={row.vendorId} className="block text-[12px] text-slate-600">
                      <span className="font-medium text-slate-800">
                        {row.vendorName}
                        {row.city ? ` · ${row.city}` : ''}
                      </span>
                      <input
                        inputMode="decimal"
                        value={shippingDraft[row.vendorId] ?? ''}
                        onChange={(e) =>
                          setShippingDraft((prev) => ({ ...prev, [row.vendorId]: e.target.value }))
                        }
                        placeholder="Örn. 2500"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              <div>
                <label htmlFor="exec-approve-note" className="text-[12px] font-semibold text-slate-700">
                  Not (isteğe bağlı)
                </label>
                <textarea
                  id="exec-approve-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Onay notu"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none resize-y focus:ring-2 focus:ring-emerald-300"
                  disabled={decisionMut.isPending}
                />
              </div>
            </div>
            <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                disabled={decisionMut.isPending}
                onClick={() => setConfirmDialog(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                className="bg-emerald-700 text-white hover:bg-emerald-600"
                disabled={decisionMut.isPending}
                onClick={() => {
                  if (
                    isManager &&
                    current.status === 'VENDOR_QUOTED' &&
                    (current.shippingInputs || []).length > 0
                  ) {
                    const missing = (current.shippingInputs || []).filter(
                      (row) => parseTryAmount(shippingDraft[row.vendorId] || '') == null,
                    );
                    if (missing.length) {
                      toast.error(
                        `Nakliye bedeli girin: ${missing.map((row) => row.vendorName).join(', ')}.`,
                      );
                      return;
                    }
                  }
                  decisionMut.mutate({ action: 'approve', requestId: current.id });
                }}
              >
                {decisionMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Onayla
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog === 'reject' && current && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exec-reject-title"
        >
          <div
            className="flex w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="exec-reject-title" className="text-base font-semibold text-slate-900">
              {isManager ? 'Personele iade et' : production ? 'Kararı geri gönder' : 'Satın alımı reddet'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {isManager
                ? `${current.title} talebi satın alma personeline iade edilecek. İsterseniz gerekçe yazın.`
                : production
                ? `${current.title} talebi kuyruktan çıkar; teklif kilidi kalkar. Talep durumu değişmez.`
                : `${current.title} talebi satın alma yetkilisine iade edilecek. Gerekçe notunu yazın.`}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Red gerekçesi (isteğe bağlı)"
              className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none resize-y focus:ring-2 focus:ring-rose-300"
              disabled={decisionMut.isPending}
              autoFocus
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                disabled={decisionMut.isPending}
                onClick={() => setConfirmDialog(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                className="bg-rose-600 text-white hover:bg-rose-500"
                disabled={decisionMut.isPending}
                onClick={() =>
                  decisionMut.mutate({ action: 'reject', requestId: current.id })
                }
              >
                {decisionMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reddet
              </Button>
            </div>
          </div>
        </div>
      )}

      {introOpen && current && (
        <ExecRequestIntro
          key={`intro-${current.id}`}
          item={current}
          position={safeIndex + 1}
          total={pending.length}
          onDone={() => setIntroOpen(false)}
        />
      )}
    </div>
  );
}
