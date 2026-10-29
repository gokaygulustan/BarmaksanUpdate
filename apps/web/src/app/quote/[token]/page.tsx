'use client';

import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { currencyApi, procurementApi } from '@/lib/api';
import { showsProductionItemMeta, usesPurchasingQuoteForm } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCcw,
  Send,
  Layers,
  ChevronDown,
  CircleHelp,
  Download,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  buildQuoteItemsFromRequest,
  clearQuoteFormDraft,
  loadQuoteFormDraft,
  mergeQuoteFormDraft,
  saveQuoteFormDraft,
} from '@/lib/quote-form-draft';
import { sortRequestItems } from '@/lib/request-item-order';
import { ItemMediaStrip, ProcurementMediaPanel } from '@/components/ProcurementMedia';
import { pageTitle } from '@/lib/brand';
import { QUOTE_VAT_OPTIONS, acceptPercentInput, quoteLineTotal } from '@/lib/quoteMath';
import { currencySymbol, emptyCurrencyBag } from '@/lib/currency';
import { VendorQuoteReceipt, buildQuoteReceiptDoc } from '@/components/quote/VendorQuoteReceipt';
import { QuoteGuideTour, QuoteGuideVideo } from '@/components/quote/QuoteGuide';
import { downloadVendorQuoteExcel, parseVendorQuoteExcel } from '@/lib/vendorQuoteExcel';

/** Rapor/kategori etiketindeki gürültüyü temizler (ör. SEED - Kategorili Rapor ...) */
function stripReportNoise(s: string): string {
  if (!s) return '';
  return s
    .replace(/\s*SEED\s*[-–]\s*Kategorili Rapor\s*\(ID bağımsız\)\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatFxInput(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function normalizeCategoryKey(raw: string | undefined | null): string {
  const t = stripReportNoise(String(raw || '').trim());
  return t || 'GENEL';
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const MIN = 104;
  const MAX = 280;

  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el || !wrapRef.current) return;
    el.style.height = '0px';
    const next = Math.min(Math.max(el.scrollHeight, MIN), MAX);
    wrapRef.current.style.minHeight = `${next}px`;
    el.style.height = '100%';
  };

  return (
    <div ref={wrapRef} className="min-h-[104px] flex-1">
      <Textarea
        ref={fit}
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          fit(e.target);
        }}
        className="h-full min-h-full resize-none overflow-y-auto bg-white/[0.02] border-white/10 focus:border-primary/30 rounded-xl text-xs p-3 placeholder:text-white/20 disabled:opacity-60"
      />
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FOOTER = {
  home: 'https://www.ugurpromilling.com/',
  contact: 'https://www.ugurpromilling.com/tr/iletisim',
  about: 'https://www.ugurpromilling.com/tr/hakkimizda',
  products: 'https://www.ugurpromilling.com/tr/urunlerimiz',
  refCatalog: 'https://www.ugurpromilling.com/storage/app/media//Reference-catalogue.pdf',
  machineCatalog:
    'https://www.ugurpromilling.com/storage/app/media//Machine%20Catalogue.pdf',
  dijisa: 'https://www.dijisa.com.tr',
  phone: 'tel:+903642220444',
  phoneLabel: '+90 364 222 0 444',
  email: 'mailto:info@ugurpromilling.com',
  emailLabel: 'info@ugurpromilling.com',
  address: 'Pınarçay OSB, 7. Cd, No:27-31/1 Çorum / Türkiye',
  social: [
    { label: 'Facebook', href: 'https://www.facebook.com/p/U%C4%9Fur-Promilling-100063512081179/' },
    { label: 'Instagram', href: 'https://www.instagram.com/ugurpromilling' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/ugurpromilling' },
    { label: 'X', href: 'https://twitter.com/ugurpromilling' },
    { label: 'YouTube', href: 'https://www.youtube.com/channel/UCoDEtWN7SE8j8ZSys1ZI5gg' },
  ],
} as const;

type LetterheadPerson = {
  name: string;
  email?: string | null;
  phone?: string | null;
  phoneTel?: string | null;
};

function QuoteLetterheadPerson({
  person,
  label,
}: {
  person?: LetterheadPerson | null;
  label: string;
}) {
  if (!person?.name) return null;
  return (
    <div className="min-w-[9.5rem] text-right">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#D9B625]/80 font-bold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{person.name}</p>
      {person.phone ? (
        <a
          href={`tel:${(person.phoneTel || person.phone).replace(/[^\d+]/g, '')}`}
          className="mt-0.5 block text-[12px] text-white/70 tabular-nums hover:text-[#D9B625] transition-colors"
        >
          {person.phone}
        </a>
      ) : null}
      {person.email ? (
        <a
          href={`mailto:${person.email}`}
          className="block text-[12px] text-white/50 hover:text-[#D9B625] transition-colors"
        >
          {person.email}
        </a>
      ) : null}
    </div>
  );
}

export default function ExternalQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const queryClient = useQueryClient();
  const [quotedItems, setQuotedItems] = useState<any>({});
  const [overallDiscountRate, setOverallDiscountRate] = useState<string>('');
  const [isShippingIncluded, setIsShippingIncluded] = useState<boolean>(true);
  const [usdRateFixed, setUsdRateFixed] = useState<boolean>(false);
  const [usdRate, setUsdRate] = useState<string>('');
  const [eurRate, setEurRate] = useState<string>('');
  const [chfRate, setChfRate] = useState<string>('');
  const [quoteNote, setQuoteNote] = useState<string>('');
  const [usdInfoOpen, setUsdInfoOpen] = useState(false);
  const [hasMaturity, setHasMaturity] = useState<boolean>(false);
  const [maturityDays, setMaturityDays] = useState<string>('30');
  const [isSubmitted, setIsSubmitted] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === '#receipt',
  );
  const [specOpen, setSpecOpen] = useState(true);
  const [itemNotesOpen, setItemNotesOpen] = useState<Record<string, boolean>>({});
  const [categoryOpen, setCategoryOpen] = useState<Record<string, boolean>>({});
  const formBootstrappedRef = useRef(false);
  const quoteExcelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncReceiptHash = () => {
      if (window.location.hash === '#receipt') setIsSubmitted(true);
    };
    syncReceiptHash();
    window.addEventListener('hashchange', syncReceiptHash);
    return () => window.removeEventListener('hashchange', syncReceiptHash);
  }, []);

  const {
    data: req,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['external-quote', token],
    queryFn: async () => {
      const { data } = await procurementApi.getByToken(token);
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  const { data: fxRates } = useQuery({
    queryKey: ['currency-rates'],
    queryFn: async () => {
      const { data } = await currencyApi.getRates();
      if (!data?.success || !data?.rates?.USD || !data?.rates?.EUR) return null;
      return {
        usd: Number(data.rates.USD),
        eur: Number(data.rates.EUR),
        chf: Number(data.rates.CHF) || 0,
      };
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useLayoutEffect(() => {
    document.title = pageTitle('Fiyat teklif talebi');
  }, []);

  const orderedItems = useMemo(
    () => sortRequestItems(req?.items ?? []),
    [req?.items]
  ) as Array<{
    id: string;
    category?: string;
    productName: string;
    quantity: number;
    unit: string;
    notes?: string;
    serialNumber?: string | null;
    stockCode?: string | null;
    tonnageInfo?: string | null;
    quotes?: Array<{ vendorId: string; price?: number; vendor?: { userId?: string } }>;
  }>;

  useEffect(() => {
    if (!req?.items?.length || formBootstrappedRef.current) return;
    formBootstrappedRef.current = true;

    const fromServer = buildQuoteItemsFromRequest(req);
    const draft = loadQuoteFormDraft(token);
    if (draft) {
      setQuotedItems(mergeQuoteFormDraft(fromServer, draft.quotedItems));
      setOverallDiscountRate(
        draft.overallDiscountRate ||
          (req.overallDiscountRate != null
            ? req.overallDiscountRate.toString().replace('.', ',')
            : ''),
      );
    } else {
      setQuotedItems(fromServer);
      if (req.overallDiscountRate != null) {
        setOverallDiscountRate(req.overallDiscountRate.toString().replace('.', ','));
      }
    }

    if (req.description?.trim()) setSpecOpen(true);
    const notesOpenInit: Record<string, boolean> = {};
    req.items.forEach((item: { id: string; notes?: string }) => {
      if (item.notes?.trim()) notesOpenInit[item.id] = true;
    });
    setItemNotesOpen(notesOpenInit);

    if (req.isShippingIncluded != null) {
      setIsShippingIncluded(Boolean(req.isShippingIncluded));
    }
    if (req.usdRateFixed) {
      setUsdRateFixed(true);
      if (req.usdRate != null) setUsdRate(String(req.usdRate).replace('.', ','));
      if (req.eurRate != null) setEurRate(String(req.eurRate).replace('.', ','));
      if (req.chfRate != null) setChfRate(String(req.chfRate).replace('.', ','));
    } else {
      setUsdRateFixed(false);
      setUsdRate('');
      setEurRate('');
      setChfRate('');
    }
    if (draft && typeof draft.usdRateFixed === 'boolean') {
      setUsdRateFixed(draft.usdRateFixed);
      if (draft.usdRate != null) setUsdRate(draft.usdRate);
      if (draft.eurRate != null) setEurRate(draft.eurRate);
      if (draft.chfRate != null) setChfRate(draft.chfRate);
    }
    if (draft?.quoteNote != null) setQuoteNote(draft.quoteNote);
    else if (req.quoteNote) setQuoteNote(String(req.quoteNote));
    if (req.quoteHasMaturity != null || req.hasMaturity != null) {
      setHasMaturity(Boolean(req.quoteHasMaturity ?? req.hasMaturity));
      const days = req.quoteMaturityDays ?? req.maturityDays;
      if (days != null) setMaturityDays(String(days));
    }
  }, [req, token]);

  useEffect(() => {
    if (!formBootstrappedRef.current || isSubmitted || req?.quoteExpired) return;
    saveQuoteFormDraft(token, {
      quotedItems,
      overallDiscountRate,
      usdRateFixed,
      usdRate,
      eurRate,
      chfRate,
      quoteNote,
    });
  }, [
    token,
    quotedItems,
    overallDiscountRate,
    usdRateFixed,
    usdRate,
    eurRate,
    chfRate,
    quoteNote,
    isSubmitted,
    req?.quoteExpired,
  ]);

  const submitQuoteMutation = useMutation({
    mutationFn: (payload: {
      items: unknown[];
      overallDiscountRate: number | null;
      isShippingIncluded?: boolean;
      usdRateFixed?: boolean;
      usdRate?: number | null;
      eurRate?: number | null;
      chfRate?: number | null;
      quoteNote?: string | null;
      hasMaturity?: boolean;
      maturityDays?: number | null;
    }) => procurementApi.submitQuoteByToken(token, payload),
    onSuccess: () => {
      clearQuoteFormDraft(token);
      setIsSubmitted(true);
      if (typeof window !== 'undefined') {
        const path = `${window.location.pathname}${window.location.search}#receipt`;
        window.history.replaceState(null, '', path);
      }
      toast.success('Teklifiniz başarıyla kaydedildi!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Teklif iletilirken bir hata oluştu.');
    },
  });

  const parseLocaleNumber = (value: string | undefined) => {
    if (!value) return null;
    const normalized = value.replace(',', '.').trim();
    if (normalized === '') return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleQuoteSubmit = () => {
    const itemsPayload = Object.keys(quotedItems).map((itemId) => ({
      id: itemId,
      price: parseLocaleNumber(quotedItems[itemId].price),
      currency: quotedItems[itemId].currency || 'TRY',
      notes: quotedItems[itemId].notes,
      discountRate: parseLocaleNumber(quotedItems[itemId].discountRate),
      vatRate:
        usesPurchasingQuoteForm(req?.moduleId)
          ? Number(quotedItems[itemId].vatRate) || 20
          : undefined,
    }));
    
    const oRate = parseLocaleNumber(overallDiscountRate);

    const hasEmptyPrice = itemsPayload.some((item) => item.price === null);
    if (hasEmptyPrice) {
      toast.error(
        'Bazı kalemlerde fiyat belirmediniz. Lütfen teklif gönderebilmek için tüm kalemleri doldurunuz.',
        {
          description:
            'Eğer bir ürüne teklif vermek istemiyorsanız, sıfır (0) olarak bırakıp tekrar deneyin veya not ekleyin.',
        }
      );
      return;
    }

    const hasNegativePrice = itemsPayload.some((item) => (item.price ?? 0) < 0);
    if (hasNegativePrice) {
      toast.error('Fiyat alanlarında negatif değer kullanılamaz.');
      return;
    }

    const hasInvalidItemDiscount = itemsPayload.some(
      (item) => item.discountRate !== null && (item.discountRate < 0 || item.discountRate > 100)
    );
    if (hasInvalidItemDiscount) {
      toast.error('Ürün iskontosu 0 ile 100 arasında olmalıdır.');
      return;
    }

    if (oRate !== null && (oRate < 0 || oRate > 100)) {
      toast.error('Ek iskonto 0 ile 100 arasında olmalıdır.');
      return;
    }

    if (usesPurchasingQuoteForm(req?.moduleId)) {
      if (usdRateFixed) {
        const lockedUsd = parseLocaleNumber(usdRate);
        const lockedEur = parseLocaleNumber(eurRate);
        const lockedChf = parseLocaleNumber(chfRate);
        if (usedFx.has('USD') && (lockedUsd === null || lockedUsd <= 0)) {
          toast.error('Döviz kuru sabitlendiğinde USD kuru girilmelidir.');
          return;
        }
        if (usedFx.has('EUR') && (lockedEur === null || lockedEur <= 0)) {
          toast.error('Döviz kuru sabitlendiğinde EUR kuru girilmelidir.');
          return;
        }
        if (usedFx.has('CHF') && (lockedChf === null || lockedChf <= 0)) {
          toast.error('Döviz kuru sabitlendiğinde CHF kuru girilmelidir.');
          return;
        }
      }

      if (hasMaturity) {
        const mDays = parseLocaleNumber(maturityDays);
        if (mDays === null || mDays <= 0) {
          toast.error('Vade Mevcut seçildiğinde geçerli bir Vade Gün Sayısı girmelisiniz.');
          return;
        }
      }
    }

    submitQuoteMutation.mutate({
      items: itemsPayload,
      overallDiscountRate: oRate,
      quoteNote: quoteNote.trim() || null,
      ...(usesPurchasingQuoteForm(req?.moduleId)
        ? {
            isShippingIncluded,
            usdRateFixed,
            usdRate: usdRateFixed && usedFx.has('USD') ? parseLocaleNumber(usdRate) : null,
            eurRate: usdRateFixed && usedFx.has('EUR') ? parseLocaleNumber(eurRate) : null,
            chfRate: usdRateFixed && usedFx.has('CHF') ? parseLocaleNumber(chfRate) : null,
            hasMaturity,
            maturityDays: hasMaturity ? parseLocaleNumber(maturityDays) : null,
          }
        : {}),
    });
  };

  useEffect(() => {
    if (!orderedItems.length) return;
    setCategoryOpen((prev) => {
      const next = { ...prev };
      orderedItems.forEach((item: { category?: string }) => {
        const k = normalizeCategoryKey(item.category);
        if (next[k] === undefined) next[k] = true;
      });
      return next;
    });
  }, [orderedItems]);

  const usedFx = useMemo(() => {
    const s = new Set<string>();
    for (const q of Object.values(quotedItems || {}) as Array<{ currency?: string }>) {
      const c = q?.currency;
      if (c === 'USD' || c === 'EUR' || c === 'CHF') s.add(c);
    }
    return s;
  }, [quotedItems]);
  const hasUsd = usedFx.has('USD');
  const hasEur = usedFx.has('EUR');
  const hasChf = usedFx.has('CHF');
  const allTry = !hasUsd && !hasEur && !hasChf;
  const lockedUsd = Number(String(usdRate).replace(',', '.'));
  const lockedEur = Number(String(eurRate).replace(',', '.'));
  const lockedChf = Number(String(chfRate).replace(',', '.'));
  const hasLockedUsd = usdRateFixed && hasUsd && Number.isFinite(lockedUsd) && lockedUsd > 0;
  const hasLockedEur = usdRateFixed && hasEur && Number.isFinite(lockedEur) && lockedEur > 0;
  const hasLockedChf = usdRateFixed && hasChf && Number.isFinite(lockedChf) && lockedChf > 0;

  useEffect(() => {
    if (!usdRateFixed || !fxRates) return;
    if (hasUsd) setUsdRate((prev) => (prev.trim() ? prev : formatFxInput(fxRates.usd)));
    if (hasEur) setEurRate((prev) => (prev.trim() ? prev : formatFxInput(fxRates.eur)));
    if (hasChf && fxRates.chf > 0) setChfRate((prev) => (prev.trim() ? prev : formatFxInput(fxRates.chf)));
  }, [usdRateFixed, fxRates, hasUsd, hasEur, hasChf]);

  const getCurrencySymbol = (code: string) => currencySymbol(code);

  const lineAmountAfterItemDiscount = (item: any) => {
    const quote = quotedItems[item.id] || {};
    const qPrice = Number((quote.price || '').replace(',', '.')) || 0;
    const qDiscount = Number((quote.discountRate || '').replace(',', '.')) || 0;
    const cur = quote.currency || 'TRY';
    const amount = quoteLineTotal({
      price: qPrice,
      quantity: item.quantity,
      discountRate: qDiscount,
      vatRate: quote.vatRate ?? 20,
      applyVat: usesPurchasingQuoteForm(req?.moduleId),
    });
    return { cur, amount };
  };

  const sumItemsAfterLineDiscount = (items: any[]) => {
    const totals: Record<string, number> = emptyCurrencyBag();
    items.forEach((item: any) => {
      const { cur, amount } = lineAmountAfterItemDiscount(item);
      totals[cur] = (totals[cur] || 0) + amount;
    });
    return totals;
  };

  const applyOverallDiscount = (totals: Record<string, number>) => {
    const oRate = Number(overallDiscountRate.replace(',', '.')) || 0;
    const out = { ...totals };
    if (oRate > 0) {
      Object.keys(out).forEach((cur) => {
        out[cur] = out[cur] - out[cur] * (oRate / 100);
      });
    }
    return out;
  };

  const totalsAfterItemDiscountsOnly = () =>
    req?.items?.length ? sumItemsAfterLineDiscount(orderedItems) : emptyCurrencyBag();

  const calculateTotalsFinal = () => applyOverallDiscount(totalsAfterItemDiscountsOnly());

  const year = new Date().getFullYear();
  const expired = Boolean(req?.quoteExpired);
  const quoteUntil = req?.deadline || req?.tokenExpires;
  const quoteUntilLabel = quoteUntil
    ? new Date(quoteUntil).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';
  const canEditQuoteExcel = Boolean(
    req && !expired && !isSubmitted && !req.quoteLockedByDecisionInvite,
  );

  const handleQuoteExcelDownload = async () => {
    if (!req) return;
    try {
      const qDate = req.letterhead?.quoteDate || req.createdAt;
      await downloadVendorQuoteExcel({
        title: req.title || 'teklif',
        vendorName: req.vendor?.name,
        quoteDate: qDate
          ? new Date(qDate).toLocaleDateString('tr-TR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : undefined,
        deadline: quoteUntilLabel || undefined,
        isSatinAlma: usesPurchasingQuoteForm(req.moduleId),
        showProductionMeta: showsProductionItemMeta(req.moduleId),
        visibleColumns: req.visibleColumns,
        items: orderedItems,
        quotedItems,
        extras: {
          overallDiscountRate,
          isShippingIncluded,
          usdRateFixed,
          usdRate,
          eurRate,
          chfRate,
          hasMaturity,
          maturityDays,
        },
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Excel indirilemedi.');
    }
  };

  const handleQuoteExcelUpload = async (file: File) => {
    try {
      const { updates, extras, matched } = await parseVendorQuoteExcel(file, orderedItems, {
        isSatinAlma: usesPurchasingQuoteForm(req?.moduleId),
        showProductionMeta: showsProductionItemMeta(req?.moduleId),
        visibleColumns: req?.visibleColumns,
      });
      setQuotedItems((prev: Record<string, { price?: string; notes?: string; currency?: string; discountRate?: string; vatRate?: string }>) => {
        const next = { ...prev };
        for (const [id, patch] of Object.entries(updates)) {
          const prevRow = next[id] || {
            price: '',
            notes: '',
            currency: 'TRY',
            discountRate: '',
            vatRate: '20',
          };
          next[id] = {
            ...prevRow,
            price: patch.price ?? prevRow.price,
            currency: patch.currency || prevRow.currency || 'TRY',
            discountRate: patch.discountRate ?? prevRow.discountRate,
            vatRate: patch.vatRate ?? prevRow.vatRate,
          };
        }
        return next;
      });
      if (extras.overallDiscountRate != null) setOverallDiscountRate(extras.overallDiscountRate);
      if (typeof extras.isShippingIncluded === 'boolean') setIsShippingIncluded(extras.isShippingIncluded);
      if (typeof extras.usdRateFixed === 'boolean') setUsdRateFixed(extras.usdRateFixed);
      if (extras.usdRate != null) setUsdRate(extras.usdRate);
      if (extras.eurRate != null) setEurRate(extras.eurRate);
      if (extras.chfRate != null) setChfRate(extras.chfRate);
      if (typeof extras.hasMaturity === 'boolean') setHasMaturity(extras.hasMaturity);
      if (extras.maturityDays != null) setMaturityDays(extras.maturityDays);
      toast.success(`${matched} kalem Excel’den forma işlendi. Teklifi göndermeyi unutmayın.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Excel okunamadı.');
    }
    if (quoteExcelInputRef.current) quoteExcelInputRef.current.value = '';
  };

  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
        {/* Dekoratif Arka Plan Efektleri */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        
        <div className="relative flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl border-2 border-primary/20 animate-[spin_3s_linear_infinite]" />
            <div className="absolute inset-0 w-16 h-16 rounded-2xl border-t-2 border-primary animate-spin" />
            <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-primary font-black tracking-[0.3em] text-[10px] uppercase">Sistem Yükleniyor</span>
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1 h-1 bg-primary rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      </div>
    );

  if (error || !req)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-6 relative overflow-hidden font-sans">
        {/* Dekoratif Arka Plan */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(217,182,37,0.05),transparent_70%)]" />
        
        <div className="relative max-w-lg w-full">
          {/* Ana Kart */}
          <div className="bg-[#141414]/80 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-10 sm:p-14 shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center relative overflow-hidden group">
            {/* Üst Altın Şerit */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            
            {/* İkon */}
            <div className="relative mb-10 inline-block">
              <div className="absolute inset-0 bg-destructive/20 blur-2xl rounded-full animate-pulse" />
              <div className="relative w-24 h-24 bg-destructive/10 rounded-3xl border border-destructive/30 flex items-center justify-center shadow-inner">
                <AlertCircle className="w-12 h-12 text-destructive" strokeWidth={1.5} />
              </div>
            </div>

            {/* Metinler */}
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-6 tracking-tight leading-tight">
              Bağlantı <span className="text-primary">Geçersiz</span>
            </h1>
            
            <div className="space-y-4 mb-12">
              <p className="text-white/70 text-base sm:text-lg leading-relaxed">
                Bu teklif bağlantısı geçerliliğini yitirmiş veya süresi dolmuş olabilir.
              </p>
              <div className="h-px w-12 bg-white/10 mx-auto" />
              <p className="text-white/40 text-sm leading-relaxed">
                Lütfen sistem üzerinden yeni bir bağlantı talep edin veya satın alma ekibiyle iletişime geçin.
              </p>
            </div>

            {/* Buton */}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/50 text-white font-bold py-5 px-8 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 group/btn"
            >
              <RefreshCcw className="w-5 h-5 text-primary group-hover/btn:rotate-180 transition-transform duration-700" />
              <span>Sayfayı Yenile</span>
            </button>
          </div>
          
          {/* Logo */}
          <div className="mt-12 flex justify-center opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
            <img src="/logo.png" alt="Logo" className="h-8" />
          </div>
        </div>
      </div>
    );

  /** Karar daveti gönderildiyse teklif formu kilitlenir; yalnızca bilgilendirme ekranı. */
  if (req.quoteLockedByDecisionInvite && !isSubmitted)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] p-6">
        <div className="max-w-xl w-full rounded-2xl border border-white/10 bg-[#1a1a1a] text-center py-12 px-6 shadow-2xl">
          <div className="w-20 h-20 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-6 ring-2 ring-amber-500/30">
            <CheckCircle2 className="w-12 h-12 text-amber-400" strokeWidth={2} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">Teklifiniz Alındı!</h1>
          <p className="text-white/95 text-base sm:text-lg mb-6 leading-relaxed">
            <span className="font-bold text-[#D9B625]">{req.vendor?.name}</span>
            <br />
            <span className="text-white/90">
              Bu talep için satın alma kararı süreci başlatılmıştır. Verdiğiniz teklif kayda alınmış ve onay
              sürecine iletilmiştir. Bu bağlantı üzerinden artık fiyat veya iskonto güncellemesi
              yapılamamaktadır.
            </span>
          </p>
          <p className="text-white/75 text-sm mb-8 leading-relaxed">
            Süreçle ilgili güncellemeler tarafınıza e-posta yoluyla iletilecektir.
          </p>
          <p className="text-xs text-white/45">Teşekkür eder, iyi çalışmalar dileriz.</p>
        </div>
      </div>
    );

  if (isSubmitted)
    return (
      <VendorQuoteReceipt
        doc={buildQuoteReceiptDoc({
          req,
          orderedItems,
          quotedItems,
          overallDiscountRate,
          isShippingIncluded,
          hasMaturity,
          maturityDays,
          usdRateFixed,
          usdRate,
          eurRate,
          chfRate,
          quoteNote,
          fxRates: fxRates
            ? { usd: fxRates.usd, eur: fxRates.eur, chf: fxRates.chf || 0 }
            : null,
        })}
      />
    );

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col text-foreground">
      <div className="flex-1 flex flex-col py-6 sm:py-10 px-3 sm:px-5">
        <div className="max-w-4xl w-full mx-auto flex flex-col gap-0">
          <header className="bg-[#1a1a1a] border-t-[3px] border-[#D9B625] rounded-t-xl border-x border-white/10 shadow-2xl overflow-hidden">
            <div className="px-4 sm:px-8 py-6 sm:py-7">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex shrink-0 items-center justify-center sm:justify-start">
                  <img
                    src="/logo.png"
                    alt="Uğur Promilling"
                    className="h-auto w-auto max-h-[4.25rem] max-w-[min(260px,78vw)] object-contain object-center sm:max-h-[4.75rem] sm:object-left sm:max-h-[5.25rem] sm:max-w-[min(280px,40vw)]"
                  />
                </div>
                {(req.letterhead?.contact || req.letterhead?.manager) && (
                  <div data-quote-tour="guide-people" className="flex flex-wrap items-start justify-end gap-x-8 gap-y-4 sm:gap-x-10">
                    {req.letterhead?.contact ? (
                      <QuoteLetterheadPerson
                        person={req.letterhead.contact}
                        label={req.letterhead?.contactLabel || 'İlgili kişi'}
                      />
                    ) : null}
                    {req.letterhead?.manager ? (
                      <QuoteLetterheadPerson
                        person={req.letterhead.manager}
                        label={req.letterhead?.managerLabel || 'Satın Alma Birimi Yetkilisi'}
                      />
                    ) : null}
                  </div>
                )}
              </div>
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="pb-4 text-center text-[11px] sm:text-xs text-white/45 italic border-b border-white/10">
                  &ldquo;Değirmencilikte <span className="text-[#D9B625] not-italic font-semibold">gelenek</span> inovasyonla
                  buluşuyor&rdquo;
                </p>
                <div className="mt-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    {req.letterhead?.showQuoteTitle && String(req.letterhead?.quoteRef || '').trim() ? (
                      <p className="mb-1.5 text-sm font-bold tracking-wide text-white sm:text-base break-words">
                        {String(req.letterhead.quoteRef).trim()}
                      </p>
                    ) : null}
                    <p className="text-base font-bold text-white sm:text-lg">
                      Sayın <span className="text-[#D9B625]">{req.vendor?.name}</span> yetkilisi
                    </p>
                  </div>
                  <p data-quote-tour="guide-deadline" className="text-[12px] text-white/50 sm:text-right shrink-0">
                    {(req.letterhead?.quoteDate || req.createdAt) && (
                      <>
                        Teklif tarihi:{' '}
                        <span className="font-semibold text-white/80">
                          {new Date(req.letterhead?.quoteDate || req.createdAt).toLocaleDateString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </>
                    )}
                    {quoteUntilLabel ? (
                      <>
                        {(req.letterhead?.quoteDate || req.createdAt) ? (
                          <span className="mx-2 text-white/25">·</span>
                        ) : null}
                        Son gün:{' '}
                        <span className="font-semibold text-[#D9B625]">{quoteUntilLabel}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {expired && (
            <div className="border-x border-white/10 bg-emerald-500/15 px-4 py-3 sm:px-6">
              <p className="text-sm font-semibold text-emerald-200">
                {req.quoteLockReason === 'approval'
                  ? 'Teklif süreci yetkili onayına alındı.'
                  : 'Teklif süresi doldu.'}
              </p>
              <p className="mt-0.5 text-[13px] text-emerald-100/80">
                Listeyi görüntüleyebilirsiniz. Fiyat, iskonto ve koşullar değiştirilemez.
              </p>
            </div>
          )}

          <Card className="rounded-t-none border-x border-b border-white/10 bg-[#1f1f1f] shadow-2xl overflow-hidden">
            {usesPurchasingQuoteForm(req?.moduleId) && (
              <>
                <QuoteGuideVideo />
                <QuoteGuideTour enabled={!expired} />
              </>
            )}
            {((req.attachments && req.attachments.length > 0) ||
              (!expired && !isSubmitted && !req.quoteLockedByDecisionInvite)) && (
              <div data-quote-tour="guide-files" className="border-b border-white/10 bg-black/25 px-4 py-4">
                <ProcurementMediaPanel
                  dark
                  title="Fotoğraf / belgeler"
                  description="Satın alma ekleri ile sizin ekleriniz ayrı listelenir."
                  attachments={req.attachments}
                  items={orderedItems.map((it: { id: string; productName: string }) => ({
                    id: it.id,
                    productName: it.productName,
                  }))}
                  token={token}
                  vendorMode
                  myVendorId={req.myVendorId}
                  canUpload={!expired && !isSubmitted && !req.quoteLockedByDecisionInvite}
                  onUploaded={() => {
                    void queryClient.invalidateQueries({ queryKey: ['external-quote', token] });
                  }}
                />
              </div>
            )}

            {req.description && (
              <div className="border-b border-white/10">
                <button
                  type="button"
                  data-quote-tour="guide-spec"
                  onClick={() => setSpecOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D9B625]">
                    Açıklama / Şartname
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-white/60 shrink-0 transition-transform ${specOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {specOpen && (
                  <div className="px-4 pb-4 text-sm text-white/80 whitespace-pre-line leading-relaxed border-t border-white/5 pt-3">
                    {req.description}
                  </div>
                )}
              </div>
            )}

            <CardContent className="p-3 sm:p-5">
              <div data-quote-tour="guide-excel" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <p className="mr-auto text-[11px] leading-snug text-white/55">
                  Kalemleri Excel’de doldurup yükleyebilirsiniz.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-white/20 bg-transparent text-white hover:bg-white/10"
                  onClick={() => void handleQuoteExcelDownload()}
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel indir
                </Button>
                {canEditQuoteExcel ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 bg-[#D9B625] text-black hover:bg-[#c4a420]"
                      onClick={() => quoteExcelInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Excel yükle
                    </Button>
                    <input
                      ref={quoteExcelInputRef}
                      type="file"
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleQuoteExcelUpload(f);
                      }}
                    />
                  </>
                ) : null}
              </div>
              <div className="flex flex-col gap-5">
                {orderedItems.length > 0 &&
                  Object.entries(
                    orderedItems.reduce((acc: any, item: any) => {
                      const cat = normalizeCategoryKey(item.category);
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(item);
                      return acc;
                    }, {})
                  ).map(([catName, catItems]: [string, any], catIndex: number) => {
                    const catTotals = sumItemsAfterLineDiscount(catItems);
                    const expanded = categoryOpen[catName] ?? true;
                    return (
                    <div
                      key={catName}
                      className="bg-black/25 rounded-xl border border-white/10 overflow-hidden"
                    >
                      <button
                        type="button"
                        data-quote-tour={catIndex === 0 ? 'guide-group' : undefined}
                        onClick={() =>
                          setCategoryOpen((prev) => ({
                            ...prev,
                            [catName]: !(prev[catName] ?? true),
                          }))
                        }
                        className="w-full bg-black/30 px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-white/10 text-left hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="p-1 bg-[#D9B625]/15 rounded-md shrink-0">
                          <Layers className="w-3.5 h-3.5 text-[#D9B625]" />
                        </div>
                        <h3 className="font-bold text-white/90 text-xs uppercase tracking-widest truncate flex-1 min-w-0 text-left">
                          {catName}
                        </h3>
                        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                          <div className="flex flex-wrap gap-1.5 justify-end max-w-[220px] sm:max-w-xs">
                            {Object.entries(catTotals).map(
                              ([cur, sum]) =>
                                sum > 0 && (
                                  <span
                                    key={cur}
                                    className="text-[10px] font-bold tabular-nums text-[#D9B625] whitespace-nowrap"
                                  >
                                    {sum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}{' '}
                                    {getCurrencySymbol(cur)}
                                  </span>
                                )
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold border-white/20 text-white/60 bg-black/20 shrink-0"
                          >
                            {catItems.length} kalem
                          </Badge>
                          <ChevronDown
                            className={`w-4 h-4 text-white/50 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </button>
                      {expanded && (
                      <div className="p-3 sm:p-4 flex flex-col gap-3">
                        {catItems.map((item: any, i: number) => {
                              const guideItem = item.id === orderedItems[0]?.id;
                              return (
                              <div
                                key={item.id}
                                className="relative bg-[#1a1c1e] rounded-2xl border border-white/5 shadow-2xl overflow-hidden group transition-all hover:border-primary/20"
                              >
                                {/* Sol Şerit Dekor */}
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary opacity-50 group-hover:opacity-100 transition-opacity shadow-[0_0_15px_rgba(217,182,37,0.3)]" />
                                
                                <div className="p-4 sm:p-6">
                                  {/* Üst Kısım: Başlık ve Meta (Daha Sıkı) */}
                                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-4">
                                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                                        <span className="text-base font-black text-primary">{i + 1}</span>
                                      </div>
                                      <div className="space-y-0.5">
                                        <h3 className="text-lg font-black text-white leading-tight">
                                          {item.productName}
                                        </h3>
                                        {/* Meta Etiketleri (Mini Boy) */}
                                        {(() => {
                                          const visibleCols = req?.visibleColumns || ['productName', 'quantity', 'unit'];
                                          const prod = showsProductionItemMeta(req?.moduleId);
                                          const showSN = prod && visibleCols.includes('serialNumber');
                                          const showStock = prod && visibleCols.includes('stockCode');
                                          const showTonnage = prod && visibleCols.includes('tonnageInfo');

                                          return (showSN || showStock || showTonnage) && (
                                            <div className="flex flex-wrap gap-1.5">
                                              {showSN && item.serialNumber && (
                                                <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-2 py-0.5">
                                                  <span className="text-[8px] uppercase font-black text-primary/60">SN</span>
                                                  <span className="text-[10px] font-bold text-white/80">{item.serialNumber}</span>
                                                </div>
                                              )}
                                              {showStock && item.stockCode && (
                                                <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-2 py-0.5">
                                                  <span className="text-[8px] uppercase font-black text-primary/60">STOK</span>
                                                  <span className="text-[10px] font-bold text-white/80">{item.stockCode}</span>
                                                </div>
                                              )}
                                              {showTonnage && item.tonnageInfo && (
                                                <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded px-2 py-0.5">
                                                  <span className="text-[8px] uppercase font-black text-primary/60">TONAJ</span>
                                                  <span className="text-[10px] font-bold text-white/80">{item.tonnageInfo}</span>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Ürün Detayları (Daha Kompakt) */}
                                  {(() => {
                                    const visibleCols = req?.visibleColumns || ['productName', 'quantity', 'unit'];
                                    const showNotes = visibleCols.includes('notes');
                                    if (!showNotes || !item.notes) return null;

                                    return (
                                      <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                        <button
                                          type="button"
                                          onClick={() => setItemNotesOpen((prev) => ({ ...prev, [item.id]: !(prev[item.id] ?? true) }))}
                                          className="text-[9px] font-black uppercase text-primary/70 tracking-widest flex items-center gap-2 hover:opacity-100 transition-all"
                                        >
                                          <ChevronDown className={cn("w-3 h-3 transition-transform", (itemNotesOpen[item.id] ?? true) && "rotate-180")} />
                                          Ürün Detayları
                                        </button>
                                        {(itemNotesOpen[item.id] ?? true) && (
                                          <p className="mt-2 text-[11px] text-white/50 leading-relaxed border-l border-primary/20 pl-4">
                                            {item.notes}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                      <div className="flex flex-col gap-1" data-quote-tour={guideItem ? 'guide-qty' : undefined}>
                                        <div className="flex h-10 items-center justify-end gap-1.5 rounded-xl border border-primary/20 bg-black/40 px-3">
                                          <span className="text-sm font-black text-primary tabular-nums">{item.quantity}</span>
                                          <span className="text-[10px] font-bold text-primary/60">{item.unit || 'Adet'}</span>
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1" data-quote-tour={guideItem ? 'guide-price' : undefined}>
                                        <Input
                                          type="text"
                                          value={quotedItems[item.id]?.price || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (/^[\d,.]*$/.test(val)) {
                                              setQuotedItems({ ...quotedItems, [item.id]: { ...quotedItems[item.id], price: val } });
                                            }
                                          }}
                                          placeholder="0,00"
                                          disabled={expired}
                                          readOnly={expired}
                                          className="h-10 bg-black/40 border-primary/20 text-right text-sm font-black text-primary tabular-nums disabled:opacity-70"
                                        />
                                      </div>
                                      <div className="col-span-2 flex flex-col gap-1 sm:col-span-1" data-quote-tour={guideItem ? 'guide-currency' : undefined}>
                                        <span className="text-[8px] uppercase text-primary/40 font-black">Para birimi</span>
                                        <select
                                          className="h-10 w-full rounded-xl border border-primary/20 bg-black/40 px-3 text-sm font-bold text-primary outline-none disabled:opacity-70"
                                          value={quotedItems[item.id]?.currency || 'TRY'}
                                          disabled={expired}
                                          onChange={(e) => setQuotedItems({ ...quotedItems, [item.id]: { ...quotedItems[item.id], currency: e.target.value } })}
                                        >
                                          <option value="TRY" className="bg-[#1a1c1e]">TRY — ₺</option>
                                          <option value="USD" className="bg-[#1a1c1e]">USD — $</option>
                                          <option value="EUR" className="bg-[#1a1c1e]">EUR — €</option>
                                          <option value="CHF" className="bg-[#1a1c1e]">CHF</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-10 sm:items-stretch">
                                      <div className="flex min-h-0 flex-col sm:col-span-7" data-quote-tour={guideItem ? 'guide-note' : undefined}>
                                        <Label className="mb-1 ml-1 h-3.5 text-[9px] uppercase tracking-widest text-white/30 font-black">
                                          Teklif notu
                                        </Label>
                                        <AutoGrowTextarea
                                          value={quotedItems[item.id]?.notes || ''}
                                          onChange={(next) =>
                                            setQuotedItems({
                                              ...quotedItems,
                                              [item.id]: { ...quotedItems[item.id], notes: next },
                                            })
                                          }
                                          placeholder="Teslim, marka, alternatif…"
                                          disabled={expired}
                                        />
                                      </div>
                                      <div className="flex min-h-0 flex-col sm:col-span-3">
                                        {usesPurchasingQuoteForm(req?.moduleId) ? (
                                          <>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="flex min-h-0 flex-col" data-quote-tour={guideItem ? 'guide-vat' : undefined}>
                                                <select
                                                  className="h-10 w-full rounded-xl border border-emerald-500/25 bg-black/40 px-2 text-sm font-black text-emerald-400 tabular-nums outline-none disabled:opacity-70"
                                                  value={quotedItems[item.id]?.vatRate || '20'}
                                                  disabled={expired}
                                                  onChange={(e) =>
                                                    setQuotedItems({
                                                      ...quotedItems,
                                                      [item.id]: { ...quotedItems[item.id], vatRate: e.target.value },
                                                    })
                                                  }
                                                >
                                                  {QUOTE_VAT_OPTIONS.map((v) => (
                                                    <option key={v} value={String(v)} className="bg-[#1a1c1e]">
                                                      %{v}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div className="flex min-h-0 flex-col" data-quote-tour={guideItem ? 'guide-discount' : undefined}>
                                                <Input
                                                  type="text"
                                                  value={quotedItems[item.id]?.discountRate || ''}
                                                  onChange={(e) => {
                                                    const val = acceptPercentInput(e.target.value);
                                                    if (val == null) return;
                                                    setQuotedItems({ ...quotedItems, [item.id]: { ...quotedItems[item.id], discountRate: val } });
                                                  }}
                                                  placeholder="0"
                                                  disabled={expired}
                                                  readOnly={expired}
                                                  className="h-10 shrink-0 bg-black/40 border-amber-500/25 text-center text-sm font-black text-amber-400 tabular-nums disabled:opacity-70"
                                                />
                                              </div>
                                            </div>
                                            <div className="min-h-2 flex-1" aria-hidden />
                                            <div data-quote-tour={guideItem ? 'guide-line-total' : undefined}>
                                            <span className="mb-1 block h-3.5 text-[8px] uppercase font-black text-white/30">Toplam</span>
                                            <div className="flex h-10 shrink-0 items-center justify-end gap-1 rounded-xl border border-primary/20 bg-black/40 px-3">
                                              <span className="text-sm font-black text-white tabular-nums">
                                                {quoteLineTotal({
                                                  price: parseFloat((quotedItems[item.id]?.price || '0').replace(',', '.')) || 0,
                                                  quantity: item.quantity || 0,
                                                  discountRate: parseFloat((quotedItems[item.id]?.discountRate || '0').replace(',', '.')) || 0,
                                                  vatRate: quotedItems[item.id]?.vatRate ?? 20,
                                                  applyVat: true,
                                                }).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </span>
                                              <span className="text-[10px] font-bold text-white/40">{quotedItems[item.id]?.currency || 'TRY'}</span>
                                            </div>
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                        <span className="mb-1 h-3.5 text-[8px] uppercase font-black text-amber-400/50">İskonto (%)</span>
                                        <Input
                                          type="text"
                                          value={quotedItems[item.id]?.discountRate || ''}
                                          onChange={(e) => {
                                            const val = acceptPercentInput(e.target.value);
                                            if (val == null) return;
                                            setQuotedItems({ ...quotedItems, [item.id]: { ...quotedItems[item.id], discountRate: val } });
                                          }}
                                          placeholder="0"
                                          disabled={expired}
                                          readOnly={expired}
                                          className="h-10 shrink-0 bg-black/40 border-amber-500/25 text-center text-sm font-black text-amber-400 tabular-nums disabled:opacity-70"
                                        />
                                        <div className="min-h-2 flex-1" aria-hidden />
                                        <span className="mb-1 h-3.5 text-[8px] uppercase font-black text-white/30">Toplam</span>
                                        <div className="flex h-10 shrink-0 items-center justify-end gap-1 rounded-xl border border-primary/20 bg-black/40 px-3">
                                          <span className="text-sm font-black text-white tabular-nums">
                                            {(() => {
                                              const price = parseFloat((quotedItems[item.id]?.price || '0').replace(',', '.'));
                                              const disc = parseFloat((quotedItems[item.id]?.discountRate || '0').replace(',', '.'));
                                              const qty = item.quantity || 0;
                                              const total = price * qty * (1 - disc / 100);
                                              return total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            })()}
                                          </span>
                                          <span className="text-[10px] font-bold text-white/40">{quotedItems[item.id]?.currency || 'TRY'}</span>
                                        </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <ItemMediaStrip
                                    dark
                                    vendorMode
                                    attachments={req.attachments}
                                    itemId={item.id}
                                    token={token}
                                    myVendorId={req.myVendorId}
                                  />
                                </div>
                              </div>
                              );
                            })}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>

            {usesPurchasingQuoteForm(req?.moduleId) && (
            <div className="px-4 py-4 bg-black/40 border-t border-white/10 flex flex-col gap-3">
              <h4 className="text-xs font-bold text-[#D9B625] uppercase tracking-wider">
                Teklif Genel Koşulları & Sevk Bilgileri
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                {/* Nakliye */}
                <div data-quote-tour="guide-ship" className="flex flex-col gap-1.5 bg-white/[0.03] p-3 rounded-lg border border-white/10">
                  <span className="text-xs font-semibold text-white/80">Nakliye Dahil Mi?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => setIsShippingIncluded(true)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        isShippingIncluded ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      EVET
                    </button>
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => setIsShippingIncluded(false)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        !isShippingIncluded ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      HAYIR
                    </button>
                  </div>
                </div>

                {/* Döviz kuru */}
                <div data-quote-tour="guide-fx" className="flex flex-col gap-1.5 bg-white/[0.03] p-3 rounded-lg border border-white/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white/80">Döviz kuru sabit mi?</span>
                    <button
                      type="button"
                      onClick={() => setUsdInfoOpen(true)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white/50 hover:text-[#D9B625] hover:bg-white/10"
                      aria-label="Döviz kuru sabitleme"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => {
                        setUsdRateFixed(true);
                        if (allTry) setUsdInfoOpen(true);
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        usdRateFixed ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      EVET
                    </button>
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => {
                        setUsdRateFixed(false);
                        setUsdRate('');
                        setEurRate('');
                        setChfRate('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        !usdRateFixed ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      HAYIR
                    </button>
                  </div>
                  {usdRateFixed && (hasUsd || hasEur || hasChf) && (
                    <>
                      {hasUsd && (
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                        <span className="text-[11px] text-white/70">1 USD =</span>
                        <Input
                          type="text"
                          value={usdRate}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^[\d,.]*$/.test(val)) setUsdRate(val);
                          }}
                          placeholder="0,00"
                          disabled={expired}
                          readOnly={expired}
                          className="w-24 h-7 text-xs bg-black/50 text-emerald-400 font-bold text-center border-emerald-500/50 disabled:opacity-70"
                        />
                        <span className="text-[11px] text-white/70">TRY</span>
                      </div>
                      )}
                      {hasEur && (
                      <div className={`flex items-center justify-between gap-2 ${hasUsd ? '' : 'mt-1 border-t border-white/10 pt-2'}`}>
                        <span className="text-[11px] text-white/70">1 EUR =</span>
                        <Input
                          type="text"
                          value={eurRate}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^[\d,.]*$/.test(val)) setEurRate(val);
                          }}
                          placeholder="0,00"
                          disabled={expired}
                          readOnly={expired}
                          className="w-24 h-7 text-xs bg-black/50 text-emerald-400 font-bold text-center border-emerald-500/50 disabled:opacity-70"
                        />
                        <span className="text-[11px] text-white/70">TRY</span>
                      </div>
                      )}
                      {hasChf && (
                      <div className={`flex items-center justify-between gap-2 ${hasUsd || hasEur ? '' : 'mt-1 border-t border-white/10 pt-2'}`}>
                        <span className="text-[11px] text-white/70">1 CHF =</span>
                        <Input
                          type="text"
                          value={chfRate}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^[\d,.]*$/.test(val)) setChfRate(val);
                          }}
                          placeholder="0,00"
                          disabled={expired}
                          readOnly={expired}
                          className="w-24 h-7 text-xs bg-black/50 text-emerald-400 font-bold text-center border-emerald-500/50 disabled:opacity-70"
                        />
                        <span className="text-[11px] text-white/70">TRY</span>
                      </div>
                      )}
                    </>
                  )}
                </div>

                {/* Vade */}
                <div data-quote-tour="guide-maturity" className="flex flex-col gap-1.5 bg-white/[0.03] p-3 rounded-lg border border-white/10">
                  <span className="text-xs font-semibold text-white/80">Vade Mevcut Mu?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => setHasMaturity(false)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        !hasMaturity ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      HAYIR (Peşin)
                    </button>
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => setHasMaturity(true)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                        hasMaturity ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      EVET (Vadeli)
                    </button>
                  </div>
                  {hasMaturity && (
                    <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <span className="text-[11px] text-white/70">Vade (Gün):</span>
                      <Input
                        type="text"
                        value={maturityDays}
                        onChange={(e) => setMaturityDays(e.target.value)}
                        placeholder="30"
                        disabled={expired}
                        readOnly={expired}
                        className="w-20 h-7 text-xs bg-black/50 text-emerald-400 font-bold text-center border-emerald-500/50 disabled:opacity-70"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {usesPurchasingQuoteForm(req?.moduleId) && (
            <div data-quote-tour="guide-quote-note" className="px-4 py-4 bg-black/40 border-t border-white/10 flex flex-col gap-3">
              <h4 className="text-xs font-bold text-[#D9B625] uppercase tracking-wider">
                Teklif notu
              </h4>
              <Textarea
                value={quoteNote}
                onChange={(e) => setQuoteNote(e.target.value)}
                placeholder="İsteğe bağlı"
                disabled={expired}
                className="min-h-[160px] w-full flex-1 resize-y bg-white/[0.02] border-white/10 focus:border-primary/30 rounded-xl text-xs p-3 placeholder:text-white/20 disabled:opacity-60"
              />
            </div>
            )}

            {!usesPurchasingQuoteForm(req?.moduleId) && (
              <div className="px-4 py-3 bg-black/25 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                <Label className="text-[10px] sm:text-xs uppercase text-amber-400 font-bold tracking-widest whitespace-nowrap">
                  Tüm teklife ek iskonto (%)
                </Label>
                <div className="flex items-center gap-1 border border-amber-500/35 rounded-lg bg-amber-500/5 overflow-hidden h-9 w-full sm:w-28">
                  <Input
                    type="text"
                    value={overallDiscountRate}
                    onChange={(e) => {
                      const val = acceptPercentInput(e.target.value);
                      if (val == null) return;
                      setOverallDiscountRate(val);
                    }}
                    placeholder="0"
                    disabled={expired}
                    readOnly={expired}
                    className="w-full text-right font-medium text-amber-400 border-none shadow-none focus-visible:ring-0 px-2.5 h-full text-sm disabled:opacity-70"
                  />
                  <span className="pr-2 text-amber-400 text-xs font-bold">%</span>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-6 bg-[#1a1a1a] border-t border-white/10 flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
              <div data-quote-tour="guide-totals" className="flex flex-col gap-4 order-2 lg:order-1 min-w-0 flex-1">
                <div>
                  <h4 className="text-xs font-bold text-[#D9B625] uppercase tracking-wider mb-1">
                    Ara toplam (ürün iskontoları sonrası)
                  </h4>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {Object.entries(totalsAfterItemDiscountsOnly()).map(
                      ([cur, sum]) =>
                        sum > 0 && (
                          <span
                            key={`ara-${cur}`}
                            className="text-sm sm:text-base font-semibold text-white/80 tabular-nums"
                          >
                            {sum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}{' '}
                            {getCurrencySymbol(cur)}
                          </span>
                        )
                    )}
                    {Object.values(totalsAfterItemDiscountsOnly()).every((v) => v === 0) && (
                      <span className="text-sm text-white/35 tabular-nums">0,00 ₺</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-white/45 text-[10px] uppercase tracking-widest font-bold block mb-1">
                    Teklif toplamı (genel iskonto sonrası)
                  </span>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {Object.entries(calculateTotalsFinal()).map(
                      ([cur, sum]) =>
                        sum > 0 && (
                          <span
                            key={cur}
                            className="text-xl sm:text-2xl font-bold text-[#D9B625] tabular-nums"
                          >
                            {sum.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}{' '}
                            {getCurrencySymbol(cur)}
                          </span>
                        )
                    )}
                    {Object.values(calculateTotalsFinal()).every((v) => v === 0) && (
                      <span className="text-xl font-bold text-[#D9B625]/35 tabular-nums">0,00 ₺</span>
                    )}
                  </div>
                  {fxRates && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-white/45">
                      <span>
                        Dolar ($){' '}
                        <span className="font-mono font-semibold text-white/75">
                          {(hasLockedUsd ? lockedUsd : fxRates.usd).toFixed(2)}
                        </span>
                        {hasLockedUsd ? <span className="ml-1 text-amber-400/80">sabit</span> : null}
                      </span>
                      <span>
                        Euro (€){' '}
                        <span className="font-mono font-semibold text-white/75">
                          {(hasLockedEur ? lockedEur : fxRates.eur).toFixed(2)}
                        </span>
                        {hasLockedEur ? <span className="ml-1 text-amber-400/80">sabit</span> : null}
                      </span>
                      <span>
                        CHF{' '}
                        <span className="font-mono font-semibold text-white/75">
                          {(hasLockedChf ? lockedChf : fxRates.chf || 0).toFixed(2)}
                        </span>
                        {hasLockedChf ? <span className="ml-1 text-amber-400/80">sabit</span> : null}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {!expired && (
              <Button
                data-quote-tour="guide-send"
                onClick={handleQuoteSubmit}
                disabled={submitQuoteMutation.isPending}
                className="bg-[#D9B625] text-[#1a1a1a] hover:brightness-110 h-11 px-6 rounded-lg text-sm font-bold shadow-lg order-1 lg:order-2 flex w-full shrink-0 items-center justify-center lg:h-auto lg:w-auto lg:self-stretch"
              >
                {submitQuoteMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                TEKLİFİ GÖNDER
              </Button>
              )}
            </div>
          </Card>

          <footer className="bg-[#1a1a1a] border-t-[3px] border-[#D9B625] rounded-b-xl border-x border-b border-white/10 overflow-hidden text-xs text-white/65">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 sm:p-8">
              <div className="flex flex-col items-center md:items-start gap-3 text-center md:text-left">
                <img
                  src="/logo2.png"
                  alt="Barmaksan Endüstri"
                  className="h-10 sm:h-11 object-contain max-w-[200px] opacity-95"
                />
                <p className="text-[10px] sm:text-[11px] text-white/55 leading-relaxed max-w-[260px] font-normal">
                  Uğur Promilling bir{' '}
                  <span className="text-white/70">Barmaksan Endüstri A.Ş.</span> markasıdır.
                </p>
              </div>
              <div>
                <p className="text-[#D9B625] font-bold text-xs mb-2">Hızlı erişim</p>
                <ul className="space-y-1.5 text-[11px]">
                  <li>
                    <a
                      href={FOOTER.home}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-1.5 text-white/75 hover:text-[#D9B625] transition-colors"
                    >
                      <span className="text-white/50">→</span>
                      Ana sayfa
                    </a>
                  </li>
                  <li>
                    <a
                      href={FOOTER.products}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-1.5 text-white/75 hover:text-[#D9B625] transition-colors"
                    >
                      <span className="text-white/50">→</span>
                      Ürünlerimiz
                    </a>
                  </li>
                  <li>
                    <a
                      href={FOOTER.about}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-1.5 text-white/75 hover:text-[#D9B625] transition-colors"
                    >
                      <span className="text-white/50">→</span>
                      Hakkımızda
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-[#D9B625] font-bold text-xs mb-2">Bize ulaşın</p>
                <ul className="space-y-1.5 text-[11px]">
                  <li>
                    <a
                      href={FOOTER.contact}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-1.5 text-white/75 hover:text-[#D9B625] transition-colors"
                    >
                      <span className="text-white/50">→</span>
                      İletişim
                    </a>
                  </li>
                  <li>
                    <a
                      href={FOOTER.machineCatalog}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-1.5 text-white/75 hover:text-[#D9B625] transition-colors"
                    >
                      <span className="text-white/50">→</span>
                      Makine kataloğu (PDF)
                    </a>
                  </li>
                  <li>
                    <a
                      href={FOOTER.refCatalog}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-1.5 text-white/75 hover:text-[#D9B625] transition-colors"
                    >
                      <span className="text-white/50">→</span>
                      Referans kataloğu (PDF)
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 px-6 sm:px-8 py-5 text-center space-y-2.5">
              <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-[12px] text-white/80">
                {FOOTER.social.map((s, i) => (
                  <span key={s.href} className="inline-flex items-center">
                    {i > 0 && <span className="px-1.5 text-white/25">·</span>}
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold hover:text-[#D9B625] transition-colors"
                    >
                      {s.label}
                    </a>
                  </span>
                ))}
              </p>
              <p className="text-[12px] text-white/60 leading-relaxed">{FOOTER.address}</p>
              <p className="text-[12px] text-white/60 leading-relaxed">
                <a href={FOOTER.phone} className="hover:text-[#D9B625]">
                  {FOOTER.phoneLabel}
                </a>
                <span className="px-1.5 text-white/25">·</span>
                <a href={FOOTER.email} className="hover:text-[#D9B625]">
                  {FOOTER.emailLabel}
                </a>
                <span className="px-1.5 text-white/25">·</span>
                <a
                  href={FOOTER.home}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#D9B625] underline-offset-2 hover:underline"
                >
                  www.ugurpromilling.com
                </a>
              </p>
            </div>
            <div className="border-t border-white/10 px-4 py-3 text-center text-[10px] text-white/45">
              © 1955 – {year} Tüm hakları saklıdır.{' '}
              <span className="text-white/80 font-medium">Uğur Promilling</span> ×{' '}
              <a
                href={FOOTER.dijisa}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 font-medium underline-offset-2 hover:underline"
              >
                Dijisa Teknoloji
              </a>{' '}
              <span className="text-white/35">(www.dijisa.com.tr)</span>
            </div>
          </footer>
        </div>
      </div>

      <Dialog open={usdInfoOpen} onOpenChange={setUsdInfoOpen}>
        <DialogContent className="bg-[#1a1c1e] text-white border-white/10 sm:max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle className="text-white">Döviz kuru sabitleme</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-white/75 leading-relaxed">
            {allTry ? (
              <p>
                Şu anda tüm kalemler TRY. Bir kalemi USD, EUR veya CHF yaparsanız yalnızca o kur için alan açılır;
                TCMB’den doldurulur, isterseniz değiştirirsiniz. TRY satırları 1:1 kalır.
              </p>
            ) : (
              <p>
                Teklifte görünen döviz için alan açılır
                {hasUsd ? (
                  <>
                    {' '}
                    (<span className="text-white font-semibold">1 USD</span>)
                  </>
                ) : null}
                {hasUsd && (hasEur || hasChf) ? (hasEur && hasChf ? ',' : ' ve') : null}
                {hasEur ? (
                  <>
                    {' '}
                    (<span className="text-white font-semibold">1 EUR</span>)
                  </>
                ) : null}
                {(hasUsd || hasEur) && hasChf ? ' ve' : null}
                {hasChf ? (
                  <>
                    {' '}
                    (<span className="text-white font-semibold">1 CHF</span>)
                  </>
                ) : null}
                . TCMB’den doldurulur, isterseniz değiştirirsiniz. TRY satırları 1:1 kalır.
              </p>
            )}
            <p>
              <span className="font-semibold text-white">Hayır:</span> Sistemdeki TCMB kurları kullanılır.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
