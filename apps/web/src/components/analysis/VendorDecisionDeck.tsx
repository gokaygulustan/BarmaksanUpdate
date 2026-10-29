'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { quoteLineTotal, ratesWithVendorUsd } from '@/lib/quoteMath';
import { currencySymbol } from '@/lib/currency';
import {
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Check,
  ChevronDown,
} from 'lucide-react';

type QuoteInfo = {
  id: string;
  price: number;
  currency: string;
  discountRate?: number;
  vatRate?: number | null;
  vendorId: string;
  vendor: { name: string };
  isMarket?: boolean;
};

export type ItemInfo = {
  id: string;
  productName: string;
  notes?: string;
  quantity: number;
  unit: string;
  quotes?: QuoteInfo[];
};

type AssignmentInfo = {
  vendorId: string;
  overallDiscountRate?: number | null;
  isShippingIncluded?: boolean | null;
  isVatIncluded?: boolean | null;
  vatRate?: number | null;
  hasMaturity?: boolean | null;
  maturityDays?: number | null;
  usdRateFixed?: boolean | null;
  usdRate?: number | null;
  eurRate?: number | null;
  chfRate?: number | null;
};

type Props = {
  requestId: string;
  requestTitle: string;
  items: ItemInfo[];
  assignments: AssignmentInfo[];
  targetCurrency: string;
  rates: Record<string, number>;
  applyVat?: boolean;
  initialChoices: Record<string, string | null>;
  onClose: () => void;
  /** Davet bağlantısı (girişsiz); verildiğinde kayıtlar bu token ile yapılır */
  decisionToken?: string;
};

const SWIPE_X = 110;

type ApproveConfirmDraft = {
  nextChoices: Record<string, string | null>;
  nextIndex: number;
  summary: string;
};

function convertPrice(
  price: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  assignment?: AssignmentInfo | null,
) {
  if (from === to) return price;
  const r = ratesWithVendorUsd(rates, assignment);
  const priceInTry = from === 'TRY' ? price : price * (r[from] || 1);
  return to === 'TRY' ? priceInTry : priceInTry / (r[to] || 1);
}

function getCurrencySymbol(code: string) {
  return currencySymbol(code);
}

function formatMoney(value: number, currency: string) {
  const formatted = value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'TRY'
    ? `${formatted}${getCurrencySymbol(currency)}`
    : `${getCurrencySymbol(currency)}${formatted}`;
}

function buildPurchaseConfirmSummary(args: {
  requestTitle: string;
  productName: string;
  quantity: number;
  unit: string;
  vendorName: string;
  priceLabel: string;
  assignment?: AssignmentInfo | null;
}): string {
  const a = args.assignment;
  const isVatIncluded = a?.isVatIncluded ?? true;
  const vatRate = a?.vatRate;
  const hasMaturity = a?.hasMaturity ?? false;
  const maturityDays = a?.maturityDays;
  const isShippingIncluded = a?.isShippingIncluded ?? true;

  const maturity = hasMaturity
    ? maturityDays != null
      ? `${maturityDays} gün vade`
      : 'vadeli ödeme'
    : 'peşin';
  const vat = isVatIncluded
    ? 'KDV dahil'
    : vatRate != null
      ? `%${vatRate} KDV hariç`
      : 'KDV hariç';
  const shipping = isShippingIncluded ? 'nakliye dahil bedeliyle' : 'nakliye hariç bedeliyle';
  const qty = `${args.quantity.toLocaleString('tr-TR')} ${args.unit}`;

  return `${args.requestTitle} talebi için ${args.vendorName} tedarikçisinden ${args.productName} kalem ürününü (${qty}) ${args.priceLabel} fiyatına, ${maturity}, ${vat} ile, ${shipping} satın almayı onayla.`;
}

/** Sunucuda kaydı olan kalemleri sırayla atla; ilk eksik kalemden devam et (hepsi doluysa son kalem). */
function getResumeStepIndex(
  itemsWithQuotes: ItemInfo[],
  initialChoices: Record<string, string | null>
): number {
  if (itemsWithQuotes.length === 0) return 0;
  for (let i = 0; i < itemsWithQuotes.length; i++) {
    if (!(itemsWithQuotes[i].id in initialChoices)) return i;
  }
  return itemsWithQuotes.length - 1;
}

/** stackOrder bazen kalem değişiminde bir render için eski vendor id'leri tutar; geçersiz id'leri atıp sırayı düzeltir. */
function reconcileStackOrder(order: string[], item: ItemInfo, sortedQuotes: QuoteInfo[]): string[] {
  const validIds = new Set((item.quotes ?? []).map((q) => q.vendorId));
  const baseOrder = sortedQuotes.map((q) => q.vendorId);
  const filtered = order.filter((id) => validIds.has(id));
  if (filtered.length === 0) return [...baseOrder];
  const merged: string[] = [...filtered];
  for (const id of baseOrder) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

export function VendorDecisionDeck({
  requestId,
  requestTitle,
  items,
  assignments,
  targetCurrency,
  rates,
  applyVat = false,
  initialChoices,
  onClose,
  decisionToken,
}: Props) {
  const queryClient = useQueryClient();
  const itemsWithQuotes = useMemo(
    () => items.filter((i) => (i.quotes?.length ?? 0) > 0),
    [items]
  );

  const [stepIndex, setStepIndex] = useState(() =>
    getResumeStepIndex(
      items.filter((i) => (i.quotes?.length ?? 0) > 0),
      initialChoices
    )
  );
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  /** Üstteki kaydırma / kayıt açıklaması */
  const [deckHelpOpen, setDeckHelpOpen] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState<ApproveConfirmDraft | null>(null);
  /** Taslak: key yok = henüz seçim yok; string = seçilen tedarikçi */
  const [choices, setChoices] = useState<Record<string, string | undefined>>(() => {
    const o: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(initialChoices)) {
      if (v !== null) o[k] = v;
    }
    return o;
  });

  const currentItem = itemsWithQuotes[stepIndex];
  const totalSteps = itemsWithQuotes.length;

  const getOverallDiscount = useCallback(
    (vendorId: string) => {
      const a = assignments.find((x) => x.vendorId === vendorId);
      return Number(a?.overallDiscountRate) || 0;
    },
    [assignments]
  );

  const getComparableNetTry = useCallback(
    (item: ItemInfo, q: QuoteInfo) => {
      const assignment = assignments.find((x) => x.vendorId === q.vendorId);
      const net = quoteLineTotal({
        price: Number(q.price) || 0,
        quantity: item.quantity,
        discountRate: Number(q.discountRate) || 0,
        vatRate: q.vatRate,
        overallDiscountRate: getOverallDiscount(q.vendorId),
        applyVat,
      });
      return convertPrice(net, q.currency, 'TRY', rates, assignment);
    },
    [assignments, getOverallDiscount, rates, applyVat]
  );

  const sortedQuotesForItem = useMemo(() => {
    if (!currentItem?.quotes?.length) return [];
    return [...currentItem.quotes].sort(
      (a, b) => getComparableNetTry(currentItem, a) - getComparableNetTry(currentItem, b)
    );
  }, [currentItem, getComparableNetTry]);

  /** Karşılaştırma (TRY) en düşük = en avantajlı; beraberlikte birden fazla id */
  const bestVendorIdSet = useMemo(() => {
    if (!currentItem?.quotes?.length) return new Set<string>();
    const EPS = 0.01;
    let min = Infinity;
    const rows: { id: string; n: number }[] = [];
    for (const q of currentItem.quotes) {
      const n = getComparableNetTry(currentItem, q);
      rows.push({ id: q.vendorId, n });
      if (n < min) min = n;
    }
    return new Set(rows.filter((r) => Math.abs(r.n - min) <= EPS).map((r) => r.id));
  }, [currentItem, getComparableNetTry]);

  const sortedIdsKey = useMemo(
    () => sortedQuotesForItem.map((q) => q.vendorId).join(','),
    [sortedQuotesForItem]
  );

  const [stackOrder, setStackOrder] = useState<string[]>([]);
  useEffect(() => {
    if (!sortedQuotesForItem.length) {
      setStackOrder([]);
      return;
    }
    setStackOrder(sortedQuotesForItem.map((q) => q.vendorId));
  }, [currentItem?.id, sortedIdsKey]);

  const safeStackOrder = useMemo(
    () =>
      currentItem ? reconcileStackOrder(stackOrder, currentItem, sortedQuotesForItem) : [],
    [stackOrder, currentItem, sortedQuotesForItem]
  );

  const topVendorId = safeStackOrder[0];

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    axis: 'undecided' | 'h' | 'v';
  }>({ active: false, startX: 0, startY: 0, axis: 'undecided' });
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    setDragOffset(0);
    dragOffsetRef.current = 0;
  }, [stepIndex]);

  const mutation = useMutation({
    mutationFn: async (payload: { choices: { itemId: string; vendorId: string | null }[] }) => {
      if (decisionToken) {
        const { data } = await procurementApi.upsertItemVendorPicksByDecisionToken(
          decisionToken,
          payload
        );
        return data;
      }
      const { data } = await procurementApi.upsertItemVendorPicks(requestId, payload);
      return data;
    },
    onSuccess: () => {
      if (!decisionToken) {
        queryClient.invalidateQueries({ queryKey: ['procurement', requestId] });
      }
    },
  });

  const persistAndContinue = useCallback(
    (nextChoices: Record<string, string | null>, nextIndex: number) => {
      const entries = Object.entries(nextChoices).map(([itemId, vendorId]) => ({
        itemId,
        vendorId,
      }));
      mutation.mutate(
        { choices: entries },
        {
          onSuccess: () => {
            setApproveConfirm(null);
            setChoices(() => {
              const draft: Record<string, string | undefined> = {};
              for (const [k, v] of Object.entries(nextChoices)) {
                if (v !== null) draft[k] = v;
              }
              return draft;
            });
            if (nextIndex >= totalSteps) {
              onClose();
            } else {
              setStepIndex(nextIndex);
            }
          },
        },
      );
    },
    [mutation, onClose, totalSteps],
  );

  const openVendorApproveConfirm = useCallback(
    (vendorId: string) => {
      if (!currentItem || totalSteps === 0) return;
      const quote = currentItem.quotes?.find((q) => q.vendorId === vendorId);
      if (!quote) return;

      const next: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(choices)) {
        if (v !== undefined) next[k] = v;
      }
      next[currentItem.id] = vendorId;

      const netTry = getComparableNetTry(currentItem, quote);
      const priceLabel =
        targetCurrency === 'TRY'
          ? formatMoney(netTry, 'TRY')
          : formatMoney(convertPrice(netTry, 'TRY', targetCurrency, rates), targetCurrency);

      const assignment = assignments.find((a) => a.vendorId === vendorId) ?? null;

      setApproveConfirm({
        nextChoices: next,
        nextIndex: stepIndex + 1,
        summary: buildPurchaseConfirmSummary({
          requestTitle,
          productName: currentItem.productName,
          quantity: currentItem.quantity,
          unit: currentItem.unit,
          vendorName: quote.vendor.name,
          priceLabel,
          assignment,
        }),
      });
    },
    [
      assignments,
      choices,
      currentItem,
      getComparableNetTry,
      rates,
      requestTitle,
      stepIndex,
      targetCurrency,
      totalSteps,
    ],
  );

  const handleNext = useCallback(() => {
    if (!currentItem || totalSteps === 0) return;
    const selected = choices[currentItem.id];
    if (selected) {
      openVendorApproveConfirm(selected);
      return;
    }
    const next: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(choices)) {
      if (v !== undefined) next[k] = v;
    }
    next[currentItem.id] = null;
    persistAndContinue(next, stepIndex + 1);
  }, [
    choices,
    currentItem,
    openVendorApproveConfirm,
    persistAndContinue,
    stepIndex,
    totalSteps,
  ]);

  const handleBack = useCallback(() => {
    if (stepIndex <= 0) return;
    setStepIndex((s) => s - 1);
  }, [stepIndex]);

  /** Üstte gösterilen tedarikçiyi sona atar (sıradaki teklife bak) */
  const rotateStack = useCallback(() => {
    if (!currentItem) return;
    setStackOrder((prev) => {
      const order = reconcileStackOrder(prev, currentItem, sortedQuotesForItem);
      const [a, ...rest] = order;
      return a ? [...rest, a] : [];
    });
    setDragOffset(0);
    dragOffsetRef.current = 0;
  }, [currentItem, sortedQuotesForItem]);

  /** Listeden seç / aynısına tekrar tıkla = seçimi kaldır; üst kartı o firmaya getir */
  const toggleVendorFromGrid = useCallback(
    (vendorId: string) => {
      if (!currentItem) return;
      setStackOrder((order) => {
        const r = reconcileStackOrder(order, currentItem, sortedQuotesForItem);
        if (!r.includes(vendorId)) return r;
        return [vendorId, ...r.filter((id) => id !== vendorId)];
      });
      setChoices((c) => {
        if (c[currentItem.id] === vendorId) {
          const n = { ...c };
          delete n[currentItem.id];
          return n;
        }
        return { ...c, [currentItem.id]: vendorId };
      });
    },
    [currentItem, sortedQuotesForItem]
  );

  /** Sağa kaydır: üstteki firmayı bu kalem için onay modalına aç */
  const confirmSwipeRightAndNext = useCallback(() => {
    if (!currentItem || !topVendorId || totalSteps === 0) return;
    openVendorApproveConfirm(topVendorId);
    setDragOffset(0);
    dragOffsetRef.current = 0;
  }, [currentItem, openVendorApproveConfirm, topVendorId, totalSteps]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (approveConfirm) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      axis: 'undecided',
    };
    dragOffsetRef.current = 0;
    setDragOffset(0);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (approveConfirm || !dragRef.current.active) return;
    const d = dragRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.axis === 'undecided') {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        d.axis = 'v';
        d.active = false;
        dragOffsetRef.current = 0;
        setDragOffset(0);
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
        d.axis = 'h';
      } else {
        return;
      }
    }

    if (d.axis !== 'h') return;
    dragOffsetRef.current = dx;
    setDragOffset(dx);
  };

  const onPointerUp = () => {
    if (!dragRef.current.active && dragRef.current.axis !== 'h') {
      dragRef.current = { active: false, startX: 0, startY: 0, axis: 'undecided' };
      return;
    }
    dragRef.current.active = false;
    dragRef.current.axis = 'undecided';
    if (approveConfirm) {
      setDragOffset(0);
      dragOffsetRef.current = 0;
      return;
    }
    if (mutation.isPending) {
      setDragOffset(0);
      dragOffsetRef.current = 0;
      return;
    }
    const off = dragOffsetRef.current;
    if (off > SWIPE_X) {
      confirmSwipeRightAndNext();
    } else if (off < -SWIPE_X) {
      rotateStack();
    } else {
      setDragOffset(0);
      dragOffsetRef.current = 0;
    }
  };

  const requestClose = useCallback(() => {
    setCloseConfirmOpen(true);
  }, []);

  const confirmExit = useCallback(() => {
    setCloseConfirmOpen(false);
    onClose();
  }, [onClose]);

  if (totalSteps === 0) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
        <p className="text-white text-center mb-6 max-w-md">
          Bu talepte teklif girilmiş kalem bulunmuyor. Karar akışı için en az bir fiyatlı kalem gerekir.
        </p>
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      </div>
    );
  }

  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const draftVendorId = currentItem ? choices[currentItem.id] : undefined;
  const deckBusy = mutation.isPending || Boolean(approveConfirm);

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-50">
      <header className="shrink-0 border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3 bg-slate-900">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 rounded-xl"
          disabled={Boolean(approveConfirm)}
          onClick={requestClose}
          aria-label="Kapat"
        >
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center px-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Teklif kararı
          </div>
          <div className="text-sm font-bold text-white leading-snug line-clamp-2">{requestTitle}</div>
          <button
            type="button"
            disabled={Boolean(approveConfirm)}
            onClick={() => setDeckHelpOpen((o) => !o)}
            className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
            aria-expanded={deckHelpOpen}
            aria-controls="deck-help-panel"
          >
            <span>Nasıl kullanılır?</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${deckHelpOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {deckHelpOpen && (
            <p
              id="deck-help-panel"
              className="text-[10px] sm:text-[11px] text-slate-400 text-center leading-relaxed mt-2 max-w-xl mx-auto"
            >
              <span className="text-slate-200 font-semibold">Sola</span> kaydırın: sıradaki teklife geçin.{' '}
              <span className="text-slate-200 font-semibold">Sağa</span> kaydırın: üstteki firmayı onaylayın.{' '}
              İsterseniz alttan firma seçin; kayıt için{' '}
              <span className="text-slate-200 font-semibold">Sonraki kalem</span>, atlamak için{' '}
              <span className="text-slate-200 font-semibold">Seçmeden ilerle</span>.
            </p>
          )}
        </div>
        <div className="w-10 shrink-0" />
      </header>

      <div className="h-1.5 w-full shrink-0 bg-white/5">
        <div
          className="h-full bg-slate-300 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="scroll-touch mx-auto flex w-full max-w-3xl min-h-0 flex-1 touch-pan-y flex-col items-center overflow-y-auto overscroll-contain px-4 py-4">
        <div key={stepIndex} className="flex w-full flex-col items-center">
        <div className="text-center mb-4 space-y-1 shrink-0">
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            Kalem {stepIndex + 1} / {totalSteps}
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white leading-tight">{currentItem.productName}</h2>
          {currentItem.notes && (
            <p className="text-xs text-slate-400 max-w-lg mx-auto whitespace-pre-wrap break-words">{currentItem.notes}</p>
          )}
          <p className="text-sm text-slate-300">
            Miktar:{' '}
            <span className="font-bold text-white">
              {currentItem.quantity} {currentItem.unit}
            </span>
          </p>
        </div>

        {/* Stack — üst kart opak; taşan arka katman metni kesilir */}
        <div className="relative isolate mb-4 w-full max-w-md min-h-[280px] max-h-[min(420px,42vh)] touch-pan-y overflow-hidden sm:max-h-[min(440px,45vh)]">
          {safeStackOrder.map((vid, idx) => {
            const q = currentItem.quotes!.find((x) => x.vendorId === vid);
            if (!q) return null;
            const netTry = getComparableNetTry(currentItem, q);
            const itemDisc = Number(q.discountRate) || 0;
            const genDisc = getOverallDiscount(vid);
            const assignment = assignments.find((x) => x.vendorId === vid);
            const unitConv = convertPrice(Number(q.price), q.currency, targetCurrency, rates, assignment);
            const gross = unitConv * currentItem.quantity;
            const afterItem = gross * (1 - itemDisc / 100);
            const afterGen = quoteLineTotal({
              price: unitConv,
              quantity: currentItem.quantity,
              discountRate: itemDisc,
              vatRate: q.vatRate,
              overallDiscountRate: genDisc,
              applyVat,
            });
            const z = safeStackOrder.length - idx;
            const scale = 1 - idx * 0.035;
            const translateY = idx * 10;
            const isTop = idx === 0;
            const draftMatchesTop = draftVendorId === vid && isTop;
            const isBestOffer = bestVendorIdSet.has(vid);
            const topBorder = isTop
              ? isBestOffer
                ? 'border-amber-600 bg-slate-900'
                : 'border-red-600 bg-slate-900'
              : 'border-slate-700 bg-slate-800';

            return (
              <div
                key={vid}
                className={`absolute inset-x-0 top-0 mx-auto w-[92%] rounded-2xl border-2 shadow-lg overflow-hidden transition-shadow duration-300 sm:shadow-2xl ${topBorder} ${
                  isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
                } ${
                  draftMatchesTop ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950' : ''
                } ${isTop && !draftMatchesTop ? 'ring-1 ring-slate-500' : ''}`}
                style={{
                  zIndex: z,
                  transform: isTop
                    ? `translateY(${translateY}px) translateX(${dragOffset}px) scale(${scale})`
                    : `translateY(${translateY}px) scale(${scale})`,
                  opacity: idx > 4 ? 0 : 1 - idx * 0.07,
                  transition:
                    dragOffset !== 0 ? 'none' : 'transform 0.25s ease, opacity 0.25s ease',
                }}
                onPointerDown={isTop ? onPointerDown : undefined}
                onPointerMove={isTop ? onPointerMove : undefined}
                onPointerUp={isTop ? onPointerUp : undefined}
                onPointerCancel={isTop ? onPointerUp : undefined}
              >
                <div
                  className={`px-4 py-3 border-b border-white/10 flex items-start gap-3 ${
                    isTop ? (isBestOffer ? 'bg-amber-950' : 'bg-red-950') : 'bg-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-emerald-200/90">
                      {isTop ? 'İncelenen teklif' : `Arka plan ${idx + 1}`}
                    </div>
                    <div className="line-clamp-2 min-h-[2.5rem] overflow-hidden break-words text-base font-black leading-snug text-white">
                      {q.vendor?.name || 'Online'}
                      {q.isMarket ? (
                        <span className="ml-2 align-middle rounded bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-200">
                          Online
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="max-w-[40%] shrink-0 text-right">
                    <div className="text-[10px] text-slate-300 font-bold leading-tight">
                      Karşılaştırma tutarı (TRY)
                    </div>
                    <div
                      className={`text-lg font-black tabular-nums ${
                        isBestOffer ? 'text-amber-300' : 'text-red-300'
                      }`}
                    >
                      {formatMoney(netTry, 'TRY')}
                    </div>
                  </div>
                </div>
                <div
                  className={`px-4 py-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs ${
                    isTop ? 'bg-slate-900' : 'bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wide mb-0.5">
                      Birim fiyat
                    </div>
                    <div className="font-bold text-white tabular-nums">{formatMoney(unitConv, targetCurrency)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wide mb-0.5">
                      Satır tutarı (brüt)
                    </div>
                    <div className="font-bold text-white tabular-nums">{formatMoney(gross, targetCurrency)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wide mb-0.5">
                      Kalem iskontosu
                    </div>
                    <div className={itemDisc > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}>
                      {itemDisc > 0
                        ? `%${itemDisc.toFixed(2)} · −${formatMoney(gross - afterItem, targetCurrency)}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wide mb-0.5">
                      Genel iskonto
                    </div>
                    <div className={genDisc > 0 ? 'text-emerald-200 font-bold' : 'text-slate-500'}>
                      {genDisc > 0
                        ? `%${genDisc.toFixed(2)} · −${formatMoney(afterItem - afterGen, targetCurrency)}`
                        : '—'}
                    </div>
                  </div>
                </div>
                {targetCurrency !== 'TRY' && (
                  <div
                    className={`px-4 py-2 border-t border-white/10 flex justify-between items-center gap-2 ${
                      isTop ? 'bg-slate-950' : 'bg-slate-900'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                      Tablo tutarı ({targetCurrency})
                    </span>
                    <span className="text-base font-black text-white tabular-nums shrink-0">
                      {formatMoney(afterGen, targetCurrency)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="w-full max-w-2xl mb-2 shrink-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 text-center">
            Tüm teklifler
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sortedQuotesForItem.map((q) => {
              const netTry = getComparableNetTry(currentItem, q);
              const isBest = bestVendorIdSet.has(q.vendorId);
              const isMainCardVendor = topVendorId === q.vendorId;
              const baseTint = isBest
                ? 'border-amber-500/45 bg-amber-500/10 hover:bg-amber-500/15'
                : 'border-red-500/35 bg-red-950/20 hover:bg-red-950/30';
              return (
                <button
                  key={q.vendorId}
                  type="button"
                  onClick={() => toggleVendorFromGrid(q.vendorId)}
                  className={`relative rounded-xl border px-3 py-2.5 pr-8 text-left transition-all duration-200 ${baseTint}`}
                >
                  {isMainCardVendor && (
                    <span
                      className="pointer-events-none absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 text-slate-950 shadow-sm"
                      aria-hidden
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  )}
                  <div className="min-w-0 overflow-hidden text-xs font-black leading-none text-white">
                    <span className="block truncate" title={q.vendor?.name || 'Online'}>
                      {q.vendor?.name || 'Online'}
                      {q.isMarket ? ' · Online' : ''}
                    </span>
                  </div>
                  <div
                    className={`text-[11px] font-bold tabular-nums mt-1 ${
                      isBest ? 'text-amber-300' : 'text-red-300'
                    }`}
                  >
                    {formatMoney(netTry, 'TRY')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-slate-950 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-lg space-y-3">
          <div className="flex w-full justify-center">
            <Button
              type="button"
              variant="outline"
              className="inline-flex w-auto max-w-[min(100%,20rem)] shrink-0 flex-row items-center justify-center gap-2 border-slate-500/50 bg-slate-800/80 px-5 text-slate-100 hover:bg-slate-700 hover:text-white"
              disabled={deckBusy}
              onClick={() => {
                if (!currentItem) return;
                const next: Record<string, string | null> = {};
                for (const [k, v] of Object.entries(choices)) {
                  if (v !== undefined) next[k] = v;
                }
                next[currentItem.id] = null;
                persistAndContinue(next, stepIndex + 1);
              }}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <SkipForward className="h-4 w-4 shrink-0" />
              )}
              <span>Seçmeden ilerle</span>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-white/25 bg-white/5 text-slate-100 hover:bg-white/10 inline-flex flex-row items-center justify-center gap-1.5"
              disabled={stepIndex === 0 || deckBusy}
              onClick={handleBack}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Önceki kalem</span>
            </Button>
            <Button
              type="button"
              className="flex-1 bg-slate-200 text-slate-900 font-semibold hover:bg-white border border-slate-300/90 shadow-sm inline-flex flex-row items-center justify-center gap-1.5"
              disabled={deckBusy}
              onClick={handleNext}
            >
              <span>
                {draftVendorId
                  ? 'Satın almayı onayla'
                  : stepIndex >= totalSteps - 1
                    ? 'Bitir'
                    : 'Sonraki kalem'}
              </span>
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : draftVendorId ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" />
              )}
            </Button>
          </div>
        </div>
        </div>
      </div>

      {closeConfirmOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-close-title"
          onClick={() => setCloseConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="deck-close-title" className="text-base font-semibold text-white">
              Karar ekranından çıkılsın mı?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Şu ana kadar kaydettiğiniz seçimler saklı kalır.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10"
                onClick={() => setCloseConfirmOpen(false)}
              >
                Vazgeç
              </Button>
              <Button type="button" className="bg-slate-200 text-slate-900 hover:bg-white" onClick={confirmExit}>
                Çık
              </Button>
            </div>
          </div>
        </div>
      )}

      {approveConfirm && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deck-approve-title"
          onClick={() => {
            if (!mutation.isPending) setApproveConfirm(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="deck-approve-title" className="text-base font-semibold text-white">
              Satın almayı onayla
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{approveConfirm.summary}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10"
                disabled={mutation.isPending}
                onClick={() => setApproveConfirm(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 text-white hover:bg-emerald-500"
                disabled={mutation.isPending}
                onClick={() =>
                  persistAndContinue(approveConfirm.nextChoices, approveConfirm.nextIndex)
                }
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Onayla
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
