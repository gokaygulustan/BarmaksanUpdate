'use client';

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Check,
  CheckSquare,
  Loader2,
  MailWarning,
  Plus,
  Search,
  Square,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { vendorsApi } from '@/lib/api';
import { VendorQuickForm, type QuickVendorPayload } from '@/components/VendorQuickForm';
import { maskTrPhoneLoose } from '@/lib/phone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type PickerVendorContact = {
  id?: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
};

export type PickerVendor = {
  id: string;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  extraContactEmails?: string[] | null;
  contactPhone?: string | null;
  extraContactPhones?: string[] | null;
  taxId?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  categories?: string[] | null;
  notes?: string | null;
  moduleId?: string | null;
  contacts?: PickerVendorContact[] | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Türkçe karakter / büyük-küçük harf farkını yok sayan arama anahtarı */
const fold = (value: unknown) =>
  String(value ?? '')
    .replace(/[İIı]/g, 'i')
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase();

const hasEmail = (vendor: PickerVendor) =>
  [vendor.contactEmail, ...(vendor.extraContactEmails || [])].some(
    (email) => typeof email === 'string' && EMAIL_RE.test(email.trim()),
  );

const MODULE_LABEL: Record<string, string> = {
  SATIN_ALMA: 'Satın Alma',
  URETIM_PLANLAMA: 'Üretim',
  YEDEK_PARCA: 'Yedek Parça',
};

/** Tedarikçilerin bağlı olabileceği modüller — ADMIN'in modülü (ör. IT_DIRECTORATE) bunların dışında olabilir */
const VENDOR_MODULES = ['SATIN_ALMA', 'URETIM_PLANLAMA', 'YEDEK_PARCA'];

/** Açılışta çizilen satır sayısı (ilk ekranı doldurur), sonra boşta eklenen parça boyu. */
const FIRST_ROWS = 24;
// Küçük parça: her ekleme tek karede biter (60 satır geliştirmede ~120 ms kilitliyordu).
const ROW_CHUNK = 20;
/** İlk parça, pencerenin açılış animasyonu (300 ms) bitince eklenir; animasyon sırasında iş yapılmaz. */
const OPEN_SETTLE_MS = 360;

type VendorRowProps = {
  vendor: PickerVendor;
  selected: boolean;
  editing: boolean;
  /** YalnÄ±zca dÃ¼zenlenen satÄ±rda dolu: etiket yazarken diÄŸer satÄ±rlar yeniden iÅŸlenmesin. */
  tagDraft: string;
  tagSaving: boolean;
  onToggle: (id: string) => void;
  onEditTags: (id: string | null) => void;
  onTagDraft: (value: string) => void;
  onSaveTags?: (vendor: PickerVendor) => void;
  onRemoveTag: (target: { vendorId: string; vendorName: string; category: string }) => void;
};

/** Tablo satÄ±rÄ±; memo'lu, yalnÄ±zca kendi verisi deÄŸiÅŸince yeniden iÅŸlenir. */
const VendorRow = memo(function VendorRow({
  vendor,
  selected,
  editing,
  tagDraft,
  tagSaving,
  onToggle,
  onEditTags,
  onTagDraft,
  onSaveTags,
  onRemoveTag,
}: VendorRowProps) {
  const contactCount = (vendor.contacts || []).length;
  const mailOk = hasEmail(vendor);
  return (
    <tr
      onClick={() => onToggle(vendor.id)}
      className={cn(
        'cursor-pointer border-t border-border/40 align-top transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-white/5',
      )}
    >
      <td className="px-2 py-2">
        <div
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded border transition-colors',
            selected ? 'border-primary bg-primary' : 'border-border/60',
          )}
        >
          {selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </div>
      </td>

      <td className="px-2 py-2">
        <div className="font-semibold text-foreground">{vendor.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground/70">
          {vendor.taxId && <span>VKN: {vendor.taxId}</span>}
          {contactCount > 1 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {contactCount} kişi
            </span>
          )}
          {vendor.moduleId && vendor.moduleId !== 'SATIN_ALMA' && (
            <span className="rounded bg-white/10 px-1.5 py-0.5">
              {MODULE_LABEL[vendor.moduleId] || vendor.moduleId}
            </span>
          )}
        </div>
      </td>

      <td className="px-2 py-2 text-muted-foreground">
        {vendor.contactName || vendor.contacts?.[0]?.name || '—'}
        {contactCount > 1 && (
          <div
            className="mt-0.5 text-[11px] text-muted-foreground/60"
            title={(vendor.contacts || [])
              .map((c) => [c.name, c.phone, c.email].filter(Boolean).join(' · '))
              .join('\n')}
          >
            +{contactCount - 1} kişi daha
          </div>
        )}
      </td>

      <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
        {vendor.contactPhone ? maskTrPhoneLoose(vendor.contactPhone) : '—'}
        {(() => {
          const extraPhones = (vendor.contacts || []).filter(
            (c) => c.phone && c.phone !== vendor.contactPhone,
          ).length;
          return extraPhones > 0 ? (
            <div className="text-[11px] text-muted-foreground/60">
              +{extraPhones} numara
            </div>
          ) : null;
        })()}
      </td>

      <td className="px-2 py-2 text-muted-foreground">
        {mailOk ? (
          <>
            <span className="break-all">{vendor.contactEmail}</span>
            {(vendor.extraContactEmails || []).length > 0 && (
              <div className="text-[11px] text-muted-foreground/60">
                +{(vendor.extraContactEmails || []).length} e-posta
              </div>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1 text-amber-400/90" title="Teklif maili gönderilemez; SMS ile iletin.">
            <MailWarning className="h-3.5 w-3.5" />
            mail yok
          </span>
        )}
      </td>

      <td
        className="px-2 py-2"
        onClick={(e) => {
          if (editing) e.stopPropagation();
        }}
      >
        <div className="flex flex-wrap items-center gap-1">
          {(vendor.categories || []).map((category) => (
            <span
              key={category}
              className="relative inline-flex items-center rounded bg-primary/10 py-0.5 pl-1.5 pr-3.5 text-[11px] text-primary"
            >
              {category}
              <button
                type="button"
                title={`${category} etiketini sil`}
                aria-label={`${category} etiketini sil`}
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:border-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTag({
                    vendorId: vendor.id,
                    vendorName: vendor.name,
                    category,
                  });
                }}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {editing ? (
            <span
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                autoFocus
                value={tagDraft}
                placeholder="motor, redüktör"
                onChange={(e) => onTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSaveTags?.(vendor);
                  }
                  if (e.key === 'Escape') {
                    onEditTags(null);
                  }
                }}
                className="h-6 w-36 px-1.5 text-[11px]"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[11px]"
                disabled={tagSaving}
                onClick={() => onSaveTags?.(vendor)}
              >
                {tagSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Kaydet'
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                title="Vazgeç"
                aria-label="Etiket eklemeyi iptal et"
                onClick={() => {
                  onEditTags(null);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-dashed border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onEditTags(vendor.id);
              }}
            >
              <Tag className="h-3 w-3" />
              etiket
            </button>
          )}
        </div>
      </td>

      <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
        {vendor.city || '—'}
      </td>

      <td className="max-w-[220px] px-2 py-2 text-[11px] text-muted-foreground/80">
        {vendor.notes ? (
          <span className="line-clamp-2" title={vendor.notes}>
            {vendor.notes}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
});
export function VendorPickerDialog({
  open,
  onClose,
  vendors,
  selectedIds,
  onApply,
  isLoading = false,
  canSeeAllModules = false,
  preferredModuleId,
  createModuleId,
}: {
  open: boolean;
  onClose: () => void;
  vendors: PickerVendor[];
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  isLoading?: boolean;
  canSeeAllModules?: boolean;
  preferredModuleId?: string | null;
  /** Bu modalın içinden eklenen tedarikçinin yazılacağı modül */
  createModuleId?: string | null;
}) {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState('');
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [tagEditFor, setTagEditFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [tagDeleteTarget, setTagDeleteTarget] = useState<{
    vendorId: string;
    vendorName: string;
    category: string;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rowLimit, setRowLimit] = useState(FIRST_ROWS);
  /** "Uygula" ile seçilenler: pencere kapanınca sayfaya verilir (onOpenChangeComplete). */
  const [pendingApply, setPendingApply] = useState<string[] | null>(null);

  // Açılışta durum ilk çizimden önce sıfırlanır. Eskiden efektte sıfırlanıyordu: pencere önce bir
  // önceki oturumun durumuyla (yüzlerce satır, eski arama/seçim) çizilip hemen yeniden çiziliyordu;
  // açılışta takılma ve animasyon sonunda içeriğin değişmesi buydu.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRowLimit(FIRST_ROWS);
      // Kapanış bitmeden yeniden açıldıysa henüz sayfaya verilmemiş seçimden devam eder.
      setDraft(pendingApply ?? selectedIds);
      setSearch('');
      setActiveCategories([]);
      setCity('');
      setModuleFilter(
        canSeeAllModules && preferredModuleId && VENDOR_MODULES.includes(preferredModuleId)
          ? preferredModuleId
          : '',
      );
      setTagEditFor(null);
      setTagDraft('');
      setTagDeleteTarget(null);
      setCreateOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  // Tedarikçi bu modalın içinde oluşturulur; tablo açık kalır, yeni kayıt seçili gelir.
  const createMutation = useMutation({
    mutationFn: (data: QuickVendorPayload) =>
      vendorsApi.create({
        ...data,
        moduleId:
          createModuleId && VENDOR_MODULES.includes(createModuleId) ? createModuleId : 'SATIN_ALMA',
      }),
    onSuccess: async (res) => {
      const created = res.data as PickerVendor;
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      if (created?.id) setDraft((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setCreateOpen(false);
      toast.success(`${created?.name || 'Tedarikçi'} eklendi ve seçildi.`);
    },
    onError: (err: unknown) => {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(message || 'Tedarikçi eklenemedi.');
    },
  });

  const tagMutation = useMutation({
    mutationFn: ({ id, categories }: { id: string; categories: string[] }) =>
      vendorsApi.update(id, { categories }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setTagEditFor(null);
      setTagDraft('');
    },
    onError: (err: unknown) => {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(message || 'Etiket kaydedilemedi.');
    },
  });

  /** Modül süzgeci sonrası liste — diğer filtreler ve sayaçlar bunun üzerinden hesaplanır */
  const moduleScoped = useMemo(
    () => (moduleFilter ? vendors.filter((v) => (v.moduleId || '') === moduleFilter) : vendors),
    [vendors, moduleFilter],
  );

  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const vendor of moduleScoped) {
      const parts: unknown[] = [
        vendor.name,
        vendor.contactName,
        vendor.contactEmail,
        ...(vendor.extraContactEmails || []),
        vendor.contactPhone,
        ...(vendor.extraContactPhones || []),
        vendor.taxId,
        vendor.city,
        vendor.district,
        vendor.address,
        ...(vendor.categories || []),
        vendor.notes,
      ];
      for (const contact of vendor.contacts || []) {
        parts.push(contact.name, contact.title, contact.email, contact.phone, contact.notes);
      }
      // Numara boşluklu da kayıtlı olabiliyor: "0532 528 58 61" ve "05325285861" ikisi de bulunsun
      for (const phone of [
        vendor.contactPhone,
        ...(vendor.extraContactPhones || []),
        ...(vendor.contacts || []).map((c) => c.phone),
      ]) {
        if (phone) parts.push(String(phone).replace(/\D/g, ''));
      }
      index.set(vendor.id, fold(parts.filter(Boolean).join(' ')));
    }
    return index;
  }, [moduleScoped]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vendor of moduleScoped) {
      for (const category of vendor.categories || []) {
        counts.set(category, (counts.get(category) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
  }, [moduleScoped]);

  const cityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vendor of moduleScoped) {
      const value = (vendor.city || '').trim();
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
  }, [moduleScoped]);

  const filtered = useMemo(() => {
    const terms = fold(search).split(/\s+/).filter(Boolean);
    const activeFolded = activeCategories.map((c) => fold(c));

    return moduleScoped.filter((vendor) => {
      if (city && (vendor.city || '').trim() !== city) return false;

      if (activeFolded.length) {
        const vendorTags = (vendor.categories || []).map((c) => fold(c));
        // Seçilen etiketlerden herhangi biri yeterli
        if (!activeFolded.some((tag) => vendorTags.includes(tag))) return false;
      }

      if (terms.length) {
        const haystack = searchIndex.get(vendor.id) || '';
        if (!terms.every((term) => haystack.includes(term))) return false;
      }

      return true;
    });
  }, [moduleScoped, searchIndex, search, activeCategories, city]);

  // Kademeli çizim: açılışta yalnızca ilk ekranı dolduran satırlar; kalanı açılış animasyonu
  // bittikten sonra boşta parça parça eklenir. Yüzlerce satır tek seferde ~8000 öğe demekti ve
  // pencere açılırken sayfayı ~1 sn kilitliyordu. Seçim mantığı satırlara değil listeye bağlı.
  useEffect(() => {
    if (!open || rowLimit >= filtered.length) return;
    const ric = typeof window.requestIdleCallback === 'function';
    let idle = 0;
    const timer = window.setTimeout(
      () => {
        const grow = () => setRowLimit((n) => n + ROW_CHUNK);
        idle = ric ? window.requestIdleCallback(grow, { timeout: 400 }) : window.setTimeout(grow, 16);
      },
      rowLimit <= FIRST_ROWS ? OPEN_SETTLE_MS : 0,
    );
    return () => {
      window.clearTimeout(timer);
      if (ric) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [open, rowLimit, filtered.length]);

  const draftSet = useMemo(() => new Set(draft), [draft]);
  const visibleRows = useMemo(() => filtered.slice(0, rowLimit), [filtered, rowLimit]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((v) => draftSet.has(v.id));
  const hasFilter = Boolean(search.trim() || activeCategories.length || city);

  // Satırlar memo'lu (VendorRow): geri çağırmalar kararlı olmalı. Açma/kapama ya da tek bir seçim
  // artık yüzlerce satırı baştan işlemiyor.
  const toggleVendor = useCallback((id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const editTags = useCallback((id: string | null) => {
    setTagEditFor(id);
    setTagDraft('');
  }, []);

  const toggleFiltered = () => {
    const ids = filtered.map((v) => v.id);
    if (allFilteredSelected) {
      const drop = new Set(ids);
      setDraft((prev) => prev.filter((id) => !drop.has(id)));
    } else {
      setDraft((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const toggleCategory = (category: string) => {
    setActiveCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const saveTags = (vendor: PickerVendor) => {
    const incoming = tagDraft
      .split(',')
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!incoming.length) {
      setTagEditFor(null);
      setTagDraft('');
      return;
    }
    const existing = vendor.categories || [];
    const seen = new Set(existing.map((c) => fold(c)));
    const merged = [...existing];
    for (const tag of incoming) {
      const upper = tag.toLocaleUpperCase('tr-TR');
      if (seen.has(fold(upper))) continue;
      seen.add(fold(upper));
      merged.push(upper);
    }
    tagMutation.mutate({ id: vendor.id, categories: merged });
  };

  const confirmRemoveTag = () => {
    if (!tagDeleteTarget) return;
    const vendor = vendors.find((v) => v.id === tagDeleteTarget.vendorId);
    const next = (vendor?.categories || []).filter((c) => c !== tagDeleteTarget.category);
    tagMutation.mutate({ id: tagDeleteTarget.vendorId, categories: next });
    setTagDeleteTarget(null);
  };

  const clearFilters = () => {
    setSearch('');
    setActiveCategories([]);
    setCity('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (tagDeleteTarget) {
            setTagDeleteTarget(null);
            return;
          }
          onClose();
        }
      }}
      onOpenChangeComplete={(isOpen) => {
        // Seçim, kapanış animasyonu bittikten sonra sayfaya verilir: büyük sayfanın yeniden
        // işlenmesi animasyonun ilk karelerini kilitliyordu.
        if (isOpen || !pendingApply) return;
        setPendingApply(null);
        onApply(pendingApply);
      }}
    >
      <DialogContent
        className="flex w-[96vw] max-h-[min(92vh,100dvh)] flex-col overflow-hidden border-border sm:max-w-[1180px]"
        style={{ background: 'hsl(0, 0%, 11%)' }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Tedarikçi Listesi
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Ne sattığına, şehrine veya yetkilisine göre arayın. &quot;motor&quot; yazmak motor satan
            firmaları getirir.
          </DialogDescription>
        </DialogHeader>

        {/* Arama + hızlı aksiyonlar */}
        <div className="shrink-0 space-y-2.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="motor, paslanmaz sac, Çorum, firma adı, yetkili, telefon…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 border-border bg-background"
              />
            </div>

            {cityOptions.length > 0 && (
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground sm:w-44"
              >
                <option value="">Tüm şehirler</option>
                {cityOptions.map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            )}

            {canSeeAllModules && (
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground sm:w-40"
              >
                <option value="">Tüm modüller</option>
                <option value="SATIN_ALMA">Satın Alma</option>
                <option value="URETIM_PLANLAMA">Üretim</option>
                <option value="YEDEK_PARCA">Yedek Parça</option>
              </select>
            )}

            <Button
              type="button"
              variant="outline"
              className={cn(
                'h-9 gap-1.5 text-xs',
                createOpen
                  ? 'border-border text-muted-foreground'
                  : 'border-primary/30 text-primary hover:bg-primary/10',
              )}
              onClick={() => setCreateOpen((prev) => !prev)}
            >
              {createOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {createOpen ? 'Formu Kapat' : 'Yeni Tedarikçi'}
            </Button>
          </div>

          {/* Yeni tedarikçi — tablo kapanmadan burada, modalın içinde */}
          {createOpen && (
            <div
              className="rounded-lg border border-primary/30 p-3"
              style={{ background: 'hsl(0, 0%, 9%)' }}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                Yeni Tedarikçi
              </p>
              <VendorQuickForm
                compact
                isPending={createMutation.isPending}
                categorySuggestions={categoryCounts.map(([category]) => category)}
                onCancel={() => setCreateOpen(false)}
                onSave={(data) => createMutation.mutate(data)}
              />
            </div>
          )}

          {categoryCounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                Ne satıyor
              </span>
              {categoryCounts.slice(0, 16).map(([category, count]) => {
                const active = activeCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    {category}
                    <span className="ml-1 text-muted-foreground/60">{count}</span>
                  </button>
                );
              })}
              {hasFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-1 flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  Filtreyi temizle
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleFiltered}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40"
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {allFilteredSelected
                ? `Seçimi kaldır (${filtered.length})`
                : hasFilter
                  ? `Filtredeki ${filtered.length} firmayı seç`
                  : `Tümünü seç (${filtered.length})`}
            </button>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {filtered.length} firma listeleniyor ·{' '}
              <span className="text-primary font-medium">{draft.length} seçili</span>
              <button
                type="button"
                disabled={draft.length === 0}
                onClick={() => setDraft([])}
                className="rounded-md border border-dashed border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Seçimleri kaldır
              </button>
            </span>
          </div>
        </div>

        {/* Tablo: ölçekli ekranda footer kesilmesin diye kalan yüksekliği kaydır */}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Bu filtreyle firma bulunamadı.
            </p>
          ) : (
            // Sabit sütunlar: satırlar kademeli eklenirken sütun genişlikleri yeniden hesaplanıp
            // görünen satırlar zıplamasın.
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-9" />
                <col className="w-[20%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[17%]" />
                <col />
                <col className="w-[8%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="sticky top-0 z-10" style={{ background: 'hsl(0, 0%, 14%)' }}>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-9 px-2 py-2" />
                  <th className="px-2 py-2">Firma</th>
                  <th className="px-2 py-2">Yetkili</th>
                  <th className="px-2 py-2">Telefon</th>
                  <th className="px-2 py-2">E-posta</th>
                  <th className="px-2 py-2">Ne satıyor</th>
                  <th className="px-2 py-2">Şehir</th>
                  <th className="px-2 py-2">Not</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((vendor) => {
                  const editing = tagEditFor === vendor.id;
                  return (
                    <VendorRow
                      key={vendor.id}
                      vendor={vendor}
                      selected={draftSet.has(vendor.id)}
                      editing={editing}
                      tagDraft={editing ? tagDraft : ''}
                      tagSaving={editing && tagMutation.isPending}
                      onToggle={toggleVendor}
                      onEditTags={editTags}
                      onTagDraft={setTagDraft}
                      onSaveTags={editing ? saveTags : undefined}
                      onRemoveTag={setTagDeleteTarget}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            <span className="text-primary font-semibold">{draft.length}</span> firma seçili
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground gap-2"
              onClick={() => {
                setPendingApply(draft);
                onClose();
              }}
            >
              <Check className="h-4 w-4" />
              Seçimi Uygula
            </Button>
          </div>
        </DialogFooter>

        {tagDeleteTarget && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
            onClick={(e) => {
              e.stopPropagation();
              setTagDeleteTarget(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tag-delete-title"
              className="w-full max-w-sm rounded-xl border border-border p-4 shadow-xl"
              style={{ background: 'hsl(0, 0%, 13%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <p id="tag-delete-title" className="text-sm font-medium text-foreground">
                {tagDeleteTarget.category} etiketini silmek istediğinize emin misiniz?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{tagDeleteTarget.vendorName}</p>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setTagDeleteTarget(null)}>
                  Hayır
                </Button>
                <Button
                  type="button"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={tagMutation.isPending}
                  onClick={confirmRemoveTag}
                >
                  Evet
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type VendorPickerHandle = { open: () => void };

/**
 * Pencereyi açık/kapalı durumuyla birlikte taşıyan kabuk; memo'lu. Çağıran sayfa yalnızca
 * `open()` der: açılırken büyük sayfa yeniden işlenmez, sayfa başka bir sebeple işlendiğinde de
 * pencere (yüzlerce satır) boşuna yeniden kurulmaz. Prop'lar kararlı verilmeli (geri çağırmalar
 * useCallback ile).
 */
export const VendorPickerHost = memo(
  forwardRef<VendorPickerHandle, Omit<ComponentProps<typeof VendorPickerDialog>, 'open' | 'onClose'>>(
    function VendorPickerHost(props, ref) {
      const [open, setOpen] = useState(false);
      useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
      const close = useCallback(() => setOpen(false), []);
      return <VendorPickerDialog {...props} open={open} onClose={close} />;
    },
  ),
);
