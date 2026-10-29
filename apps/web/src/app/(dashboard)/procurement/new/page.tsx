'use client';

import { SmokeText } from '@/components/SmokeText';
import { Fragment, useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Trash2,
  X,
  Save,
  Send,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  ChevronRight,
  Layers,
  Paperclip,
  Table,
  Download,
  Upload,
  Lock,
  ArrowRight,
  Users,
  ChevronLeft,
  ChevronDown,
  FileText,
  Building2,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { Windmill } from '@/components/brand/Windmill';
import { CountUp } from '@/components/CountUp';
import { cn } from '@/lib/utils';
import {
  procurementApi,
  projectsApi,
  vendorsApi,
  unitsApi,
  notificationCcContactsApi,
  departmentsApi,
  orgWorkersApi,
  internalRequestsApi,
} from '@/lib/api';
import { mergeQuantityUnits } from '@/lib/quantity-units';
import { useAuthStore } from '@/stores/useAuthStore';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import { QuickVendorDialog, type QuickVendorPayload } from '@/components/QuickVendorDialog';
import { VendorPickerHost, type VendorPickerHandle } from '@/components/VendorPickerDialog';
import { maskTrPhoneLoose } from '@/lib/phone';
import {
  QuickOrgWorkerDialog,
  type QuickOrgWorkerPayload,
} from '@/components/QuickOrgWorkerDialog';
import {
  showsProductionItemMeta,
  canCreateStandaloneRfq,
  projectLabel,
  isYedekParcaModule,
} from '@/lib/access';
import { requestNamedTour } from '@/lib/tour';
import { htmlToPlain } from '@/lib/richHtml';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import { toast } from 'sonner';
import { parseProcurementListExcel } from '@/lib/procurementListExcel';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ALLOWED_LABEL,
  splitAllowedAttachmentFiles,
} from '@/lib/allowed-attachment-files';
import { ItemMediaStrip } from '@/components/ProcurementMedia';

/* ─── Types ──────────────────────────────────────────────────────────────── */
type SelectedItem = {
  id: string;
  serialNumber?: string;
  stockCode?: string;
  tonnageInfo?: string;
  productName: string;
  unit: string;
  quantity: number | string;
  secondaryQuantity?: number | string;
  secondaryUnit?: string;
  showSecondary?: boolean;
  notes?: string;
  category?: string;
  photos?: File[];
};

interface UnitRow {
  id: string;
  name: string;
  isSystem: boolean;
}

interface Vendor {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  extraContactEmails?: string[];
  contactPhone?: string;
  extraContactPhones?: string[];
  taxId?: string;
  city?: string;
  district?: string;
  address?: string;
  /** Ne sattığı: MOTOR, PASLANMAZ SAC … */
  categories?: string[];
  notes?: string;
  moduleId?: string;
  contacts?: {
    id?: string;
    name?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    isPrimary?: boolean;
  }[];
}

interface Procurement {
  id: string;
  title: string;
  description?: string;
  status?: string;
  moduleId?: string;
  deadline?: string | null;
  createdAt?: string;
  quoteVatIncluded?: boolean | null;
  quoteVatRate?: number | null;
  quoteHasMaturity?: boolean | null;
  quoteMaturityDays?: number | null;
  shopDepartmentId?: string | null;
  shopWorkerId?: string | null;
  internalNote?: string | null;
  projectId?: string | null;
  project?: { id: string; code?: string | null; name: string; isDefault?: boolean } | null;
  shopDepartment?: {
    id: string;
    name: string;
    collarType?: 'WHITE_COLLAR' | 'BLUE_COLLAR' | string | null;
  } | null;
  shopWorker?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  items: (SelectedItem & { sortOrder?: number | null })[];
  assignments?: { vendorId: string }[];
  attachments?: { id: string; originalName: string; mimeType: string; size: number; createdAt: string }[];
  sourceInternalRequest?: { id: string; title: string } | null;
  createdBy?: { id: string; name: string; email?: string | null; phone?: string | null; subRole?: string | null } | null;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─── HTML E-posta Şablonu Üretici (API mail.service ile aynı yapı; liste başlığı tedarikçiye gösterilmez) ─── */
function escapeEmailHtml(s: string) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTrDate(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function deadlineIsoFromDays(days: number) {
  const n = Math.min(120, Math.max(1, Math.round(Number(days) || 15)));
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function daysUntilDeadline(deadline?: string | null) {
  if (!deadline) return 15;
  const ms = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return 15;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

type QuoteInviteOpts = {
  deadline?: string | Date | null;
};

function quoteInviteExtraHtml(_opts: QuoteInviteOpts) {
  return '';
}

type QuoteLetterhead = {
  quoteDate?: string | Date | null;
  quoteDeadline?: string | Date | null;
  quoteRef?: string | null;
  showQuoteTitle?: boolean;
};

/** Mail önizlemede kişi/müdür yok; üretimde liste adı + hitap + tarih/son gün. */
function quoteLetterheadHtml(vendorName: string, letterhead?: QuoteLetterhead | null) {
  const quoteDate = formatTrDate(letterhead?.quoteDate);
  const quoteDeadline = formatTrDate(letterhead?.quoteDeadline);
  const dateBits: string[] = [];
  if (quoteDate) dateBits.push(`Teklif tarihi: <strong style="color:#1e293b;">${quoteDate}</strong>`);
  if (quoteDeadline) dateBits.push(`Son gün: <strong style="color:#1e293b;">${quoteDeadline}</strong>`);
  const metaRight = dateBits.join(' · ');
  const quoteTitle =
    letterhead?.showQuoteTitle && String(letterhead?.quoteRef || '').trim()
      ? escapeEmailHtml(String(letterhead.quoteRef).trim())
      : '';
  const titleRow = quoteTitle
    ? `<tr>
        <td colspan="2" style="font-size:16px;font-weight:700;color:#1e293b;line-height:1.35;padding-bottom:10px;">${quoteTitle}</td>
      </tr>`
    : '';

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${titleRow}
      <tr>
        <td valign="bottom" style="font-size:18px;font-weight:700;color:#1e293b;line-height:1.4;padding-right:12px;">Sayın ${vendorName} yetkilisi</td>
        <td valign="bottom" style="font-size:12px;color:#64748b;line-height:1.5;text-align:right;white-space:nowrap;">${metaRight}</td>
      </tr>
    </table>`;
}

function buildEmailHTML(
  description: string,
  items: SelectedItem[],
  vendorName = 'Tedarikçi Yetkilisi',
  invite?: QuoteInviteOpts,
  letterhead?: QuoteLetterhead | null,
) {
  const itemCount = items.filter((i) => i.productName.trim()).length;

  const year = new Date().getFullYear();
  const portalUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://b2b.ugurpromilling.com';
  const previewQuoteUrl = `${portalUrl}/quote/onizleme-ornek`;
  const quoteUrlText = escapeEmailHtml(previewQuoteUrl);
  const vendorEsc = escapeEmailHtml(vendorName);
  const plainSpec = htmlToPlain(description.trim());
  const spec = plainSpec ? escapeEmailHtml(plainSpec) : '';
  const extra = quoteInviteExtraHtml(invite || {});
  const letterheadBlock = quoteLetterheadHtml(vendorEsc, letterhead);

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tedarikçi teklif bildirimi</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#ebebeb;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="border-top:3px solid #D9B625;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:20px 24px 16px;vertical-align:middle;width:42%;">
              <img src="${portalUrl}/logo.png" alt="Uğur Promilling" style="max-height:72px;width:auto;max-width:100%;display:block;" onerror="this.style.display='none'"/>
            </td>
            <td style="padding:20px 24px 16px;vertical-align:middle;text-align:right;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#D9B625;">Tedarikçi teklif formu</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:28px 16px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <tr>
            <td style="padding:28px 28px 20px;border-bottom:1px solid #f1f5f9;">
              ${letterheadBlock}
              <p style="margin:0;font-size:15px;color:#475569;line-height:1.75;">
                Bu bildirim, satın alma ekibimizin hazırladığı talep listesindeki ürün ve miktar kalemleri için fiyat teklifinizi almak amacıyla gönderilmiştir.
                Aşağıdaki güvenli bağlantıyı kullanarak teklif formuna girdiğinizde kalemler ürün adı ve talep miktarlarıyla birlikte listelenir; her satır için birim fiyat, para birimi ve gerektiğinde iskonto ile teknik/ticari notlarınızı girebilirsiniz.
              </p>
              ${
                itemCount > 0
                  ? `<p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">Bu talepte toplam <strong>${itemCount}</strong> ürün kalemi bulunmaktadır.</p>`
                  : ''
              }
              ${extra}
              <p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">
                Kaydettiğiniz teklif değerlendirme sürecine aktarılır. Bu ileti bilgilendirme amaçlıdır; süreç veya liste içeriğiyle ilgili sorularınız için satın alma ekibimizle iletişime geçebilirsiniz.
              </p>
            </td>
          </tr>

          ${
            spec
              ? `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Şartname / teknik notlar</div>
              <div style="font-size:13px;color:#334155;margin-top:8px;line-height:1.65;white-space:pre-wrap;">${spec}</div>
            </td>
          </tr>`
              : ''
          }

          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#252b31;border-radius:10px;border:1px solid #1e293b;border-left:4px solid #D9B625;">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <div style="font-size:14px;font-weight:700;color:#D9B625;margin-bottom:6px;">Teklif formuna erişim</div>
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;line-height:1.5;">Bağlantı yalnızca bu e-postanın alıcısı için geçerlidir. Bazı posta sistemleri düğmeyi engelleyebilir; sorun yaşarsanız aşağıdaki adresi tarayıcıya kopyalayın.</div>
                    <a href="${previewQuoteUrl}"
                      style="display:inline-block;background:#D9B625;color:#1e293b;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:8px;">
                      Teklif formunu aç
                    </a>
                    <div style="margin-top:22px;padding:12px 14px;background:#1a1f24;border-radius:6px;text-align:left;word-break:break-all;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Bağlantı (kopyala-yapıştır)</div>
                      <span style="font-size:12px;color:#D9B625;font-family:Consolas,'Courier New',monospace;">${quoteUrlText}</span>
                    </div>
                    <p style="margin:16px 0 0;font-size:11px;color:#64748b;line-height:1.5;">Önizleme: gönderimde her firmaya özel benzersiz bağlantı kullanılır.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px 24px;text-align:center;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                © ${year} Uğur Promilling × Dijisa Teknoloji
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/* ─── Yeni Boş Kalem ─────────────────────────────────────────────────────── */
const SECONDARY_UNIT_TOGGLE_VISIBLE = false;
const PRODUCTION_COLUMN_IDS = new Set(['serialNumber', 'stockCode', 'tonnageInfo']);
/** Sunucu tarafındaki ek dosya limitleriyle aynı olmalı. */
const MAX_ATTACHMENTS = 20;
const QUOTE_DAY_PRESETS = [7, 15, 30] as const;

/**
 * Boşken tek satır yer kaplayan, yazdıkça büyüyen açıklama kutusu.
 * Kalem sayısı arttıkça sayfanın gereksiz uzamasını önler.
 */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
  maxHeight = 200,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  maxHeight?: number;
}) {
  // Yükseklik kenarlık payıyla birlikte; kaydırma çubuğu yalnızca üst sınırı aşınca. (Eskiden içerik
  // sığdığı hâlde birkaç piksel eksik kalıyor, sağda kaydırma okları çıkıyordu.)
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const next = el.scrollHeight + el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(next, maxHeight)}px`;
    el.style.overflowY = next > maxHeight ? 'auto' : 'hidden';
  };

  return (
    <Textarea
      ref={fit}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        fit(e.target);
      }}
      className={cn('min-h-0 resize-none overflow-y-hidden', className)}
    />
  );
}

const newEmptyItem = (): SelectedItem => ({
  id: Math.random().toString(36).substr(2, 9),
  serialNumber: '',
  stockCode: '',
  tonnageInfo: '',
  productName: '',
  unit: 'Adet',
  quantity: 1,
  secondaryQuantity: '',
  secondaryUnit: '',
  showSecondary: false,
  notes: '',
  category: '',
  photos: [],
});

const MAX_CC_PER_SEND = 15;
/** Sunucu ile aynı üst sınır (bilgi metni için). */
const MAX_CC_CONTACTS_DB = 40;

type CcContact = { id: string; name: string; email: string; sortOrder: number };
/** Sorgu henüz veri döndürmediğinde sabit referans — her render'da yeni [] üretilmesin. */
const EMPTY_CC_CONTACTS: CcContact[] = [];

/* ─── Doğrulama Hataları ────────────────────────────────────────────────── */
type ValidationErrors = {
  title?: string;
  items?: string;
  vendors?: string;
};

/* ─── Ana Bileşen ───────────────────────────────────────────────────────── */
function NewProjectInline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: () => projectsApi.create({ code: code.trim() || null, name: name.trim() }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['procurement-projects'] });
      toast.success('Proje oluşturuldu.');
      onCreated(res.data.id as string);
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Proje oluşturulamadı.',
      );
    },
  });
  return (
    <div className="space-y-3 rounded-[14px] border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Kod, örn. 26336"
          aria-label="Proje kodu"
          className={cn(fieldClass, 'h-10')}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ad, örn. Moritanya"
          aria-label="Proje adı"
          className={cn(fieldClass, 'h-10')}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={cn(btnGhost, 'h-9')}>
          Vazgeç
        </button>
        <button
          type="button"
          disabled={!name.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
          className={cn(btnGold, 'h-9 rounded-[10px] px-3.5 text-[13px]')}
        >
          {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : 'Projeyi kaydet'}
        </button>
      </div>
    </div>
  );
}

/* ─── Görünüm parçaları ─────────────────────────────────────────────────── */
// Panonun dili: 22 px köşeli bento kartları, ince kenar, 200 ağırlıklı rakamlar, altın hover dolguları.
// Büyük harfli, harf aralıklı etiketler yok; hiyerarşi boyut ve ağırlıkla kurulur.
const fieldBase =
  'rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-3.5 text-[14px] text-white outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-white/30 hover:border-brand/35 focus-visible:border-brand/60 focus-visible:bg-white/[0.04] focus-visible:ring-4 focus-visible:ring-brand/15 focus-visible:ring-offset-0 md:text-[14px]';
const fieldClass = `h-11 ${fieldBase}`;
const selectClass = `${fieldClass} w-full cursor-pointer appearance-none pr-10 focus:border-brand/60 focus:ring-4 focus:ring-brand/15`;
// Kalem hücresi: kenarsız, hafif dolgulu; satır satır okunur, kutu kalabalığı yapmaz. Üzerine
// gelince altın kenar, odakta altın halka.
const cellClass =
  'h-10 rounded-[10px] border border-transparent bg-white/[0.035] px-3 text-[13.5px] text-white shadow-none outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-white/25 hover:border-brand/30 focus-visible:border-brand/60 focus-visible:bg-white/[0.05] focus-visible:ring-4 focus-visible:ring-brand/15 focus-visible:ring-offset-0 md:text-[13.5px]';

// Bölümlü seçim (yaka, hazır süre): seçili olan düz altın; kutu 12 px, içi 8 px (eşmerkezli).
const segmentWrap = 'flex gap-1 rounded-[12px] bg-white/[0.04] p-1';
const segmentItem =
  'press h-9 flex-1 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/30';
const segmentOn = 'bg-brand text-primary-foreground';
const segmentOff = 'text-white/55 hover:bg-brand/[0.1] hover:text-brand';

const btnBase =
  'press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] px-4 text-[13.5px] font-medium outline-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50';
const btnGold = `${btnBase} bg-brand px-5 text-[14px] font-semibold text-primary-foreground hover:bg-[#e4c43c] focus-visible:ring-2 focus-visible:ring-brand/40`;
// Panodaki ikincil düğme: üzerine gelince altın dalga dolar.
const btnWave =
  'wave-btn press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-white/12 px-4 text-[13.5px] font-medium text-white/80 outline-none [--wave-fill:#d9b625] [--wave-ink:#141416] focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-50';
const btnGhost = `${btnBase} h-9 rounded-[10px] px-3 text-[13px] text-white/60 hover:bg-brand/[0.1] hover:text-brand focus-visible:ring-2 focus-visible:ring-white/30`;

/** Panodaki ana eylem: altın, yazı yukarı yuvarlanır, ok çipi döner. */
function PrimaryCta({
  children,
  icon,
  onClick,
  disabled,
  busy,
  className,
}: {
  children: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'press group/cta inline-flex h-12 items-center justify-center gap-2.5 rounded-[11px] bg-brand pl-5 pr-2.5 text-[14.5px] font-medium text-primary-foreground outline-none transition-colors duration-200 hover:bg-[#e4c43c] focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      {busy ? <Loader2 className="size-[18px] animate-spin" /> : icon}
      <span className="roll">
        <span>{children}</span>
        <span aria-hidden>{children}</span>
      </span>
      <span className="ml-auto flex size-7 items-center justify-center rounded-[7px] bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/cta:translate-x-0.5 group-hover/cta:-rotate-45">
        <ArrowRight className="size-3.5" />
      </span>
    </button>
  );
}

/**
 * Bölüm kartı (panonun bento kutusu): solda simge, başlık ve kısa açıklama; sağda sayaç ya da
 * eylemler. Bölüm tamamlanınca simge onay işaretine döner.
 */
function RfqTile({
  icon: Icon,
  title,
  description,
  required,
  done,
  meta,
  action,
  tour,
  flush,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  required?: boolean;
  done?: boolean;
  meta?: ReactNode;
  action?: ReactNode;
  tour?: string;
  /** İçerik kenardan kenara (tablo, ızgara); iç boşluğu içerik kendisi verir. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-tour={tour}
      className="bento-tile @container scroll-mt-6 overflow-hidden rounded-[22px] border border-white/[0.07] bg-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pb-5 pt-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {done ? (
            <Check aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={2.4} />
          ) : (
            <Icon aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={1.8} />
          )}
          <div className="min-w-0">
            <h2 className="flex items-baseline gap-2 text-[16px] font-medium tracking-[-0.014em] text-white">
              {title}
              {required ? (
                <span aria-hidden className="text-brand">
                  *
                </span>
              ) : null}
              {meta ? <span className="text-[12px] font-normal tabular-nums text-white/38">{meta}</span> : null}
            </h2>
            {description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/42">{description}</p> : null}
          </div>
        </div>
        {action}
      </header>
      <div className={flush ? 'border-t border-hairline' : 'border-t border-hairline px-5 py-6 sm:px-6'}>{children}</div>
    </section>
  );
}

function FieldLabel({ children, required, htmlFor }: { children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[12.5px] font-medium text-white/70">
      {children}
      {required ? (
        <span aria-hidden className="text-brand">
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-1.5 text-[12px] text-destructive">
      <AlertCircle className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** Onay kutusu görünümü (seçim davranışı satırın kendisinde). */
function CheckMark({ checked, className = '' }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150',
        checked ? 'border-brand bg-brand text-primary-foreground' : 'border-white/25',
        className,
      )}
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

/** Firma baş harfleri (simge kutusu için). */
const vendorInitials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('') || '·';

export default function NewProcurementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const excelImportInputRef = useRef<HTMLInputElement>(null);
  const [staffSending, setStaffSending] = useState(false);

  const duplicateId = searchParams.get('duplicate');
  const editId = searchParams.get('edit');
  /** Satın alma personeli bu formdan Mahmut’a birim talebi iletir; tedarikçiye mail gitmez. */
  const staffNeedsMahmut = Boolean(user && !editId && !canCreateStandaloneRfq(user));

  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quoteCollectDays, setQuoteCollectDays] = useState(15);
  const [items, setItems] = useState<SelectedItem[]>([newEmptyItem()]);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isAttachmentDragging, setIsAttachmentDragging] = useState(false);
  const focusItemIdRef = useRef<string | null>(null);
  const [shopDepartmentId, setShopDepartmentId] = useState<string | null>(null);
  const [shopWorkerId, setShopWorkerId] = useState<string | null>(null);
  const [shopCollarType, setShopCollarType] = useState<'WHITE_COLLAR' | 'BLUE_COLLAR' | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [quickVendorOpen, setQuickVendorOpen] = useState(false);
  // "Tablodan seç" kendi açık/kapalı durumunu tutar: açılırken bu büyük sayfa yeniden işlenmez.
  const vendorPickerRef = useRef<VendorPickerHandle>(null);
  const [quickWorkerOpen, setQuickWorkerOpen] = useState(false);

  // Vendor table filters
  const [vendorSearch, setVendorSearch] = useState('');

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data } = await vendorsApi.getAll();
      return data;
    },
    enabled: !staffNeedsMahmut,
  });

  const { data: whiteDepartments = [] } = useQuery({
    queryKey: ['org-departments', 'WHITE_COLLAR', 'active'],
    queryFn: async () =>
      (await departmentsApi.getAll({ collarType: 'WHITE_COLLAR', active: true })).data as {
        id: string;
        name: string;
      }[],
  });

  const { data: blueDepartments = [] } = useQuery({
    queryKey: ['org-departments', 'BLUE_COLLAR', 'active'],
    queryFn: async () =>
      (await departmentsApi.getAll({ collarType: 'BLUE_COLLAR', active: true })).data as {
        id: string;
        name: string;
      }[],
  });

  const { data: orgWorkers = [] } = useQuery({
    queryKey: ['org-workers', 'active', shopCollarType === 'BLUE_COLLAR' ? shopDepartmentId : null],
    queryFn: async () =>
      (
        await orgWorkersApi.getAll({
          active: true,
          ...(shopDepartmentId ? { departmentId: shopDepartmentId } : {}),
        })
      ).data as {
        id: string;
        firstName: string;
        lastName: string;
        departmentId: string;
        fullName?: string;
      }[],
    enabled: shopCollarType === 'BLUE_COLLAR',
  });

  const departmentOptions = useMemo(() => {
    const list =
      shopCollarType === 'WHITE_COLLAR'
        ? whiteDepartments
        : shopCollarType === 'BLUE_COLLAR'
          ? blueDepartments
          : [];
    return list.map((d) => ({ value: d.id, label: d.name }));
  }, [shopCollarType, whiteDepartments, blueDepartments]);

  const workerById = useMemo(() => {
    const map = new Map<string, { id: string; departmentId: string; label: string }>();
    for (const w of orgWorkers) {
      map.set(w.id, {
        id: w.id,
        departmentId: w.departmentId,
        label: w.fullName || `${w.firstName} ${w.lastName}`,
      });
    }
    return map;
  }, [orgWorkers]);

  const workerOptions = useMemo(
    () =>
      orgWorkers.map((w) => ({
        value: w.id,
        label: w.fullName || `${w.firstName} ${w.lastName}`,
      })),
    [orgWorkers]
  );

  const selectShopCollar = (next: 'WHITE_COLLAR' | 'BLUE_COLLAR') => {
    setShopCollarType(next);
    setShopDepartmentId(null);
    setShopWorkerId(null);
  };

  const onShopDepartmentChange = (v: string | null) => {
    setShopDepartmentId(v);
    setShopWorkerId(null);
  };

  const onShopWorkerChange = (v: string | null) => {
    setShopWorkerId(v);
    if (!v) return;
    const w = workerById.get(v);
    if (w?.departmentId) setShopDepartmentId(w.departmentId);
  };

  const { data: unitsList = [] } = useQuery<UnitRow[]>({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await unitsApi.getAll();
      return data;
    },
  });
  const quantityUnitNames = useMemo(() => mergeQuantityUnits(unitsList), [unitsList]);

  const [isNewUnitDialogOpen, setIsNewUnitDialogOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitTargetItemId, setNewUnitTargetItemId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: duplicateData } = useQuery<Procurement>({
    queryKey: ['procurement', duplicateId],
    queryFn: async () => {
      const { data } = await procurementApi.getById(duplicateId as string);
      return data;
    },
    enabled: !!duplicateId,
  });

  const { data: editData, isLoading: editLoading } = useQuery<Procurement>({
    queryKey: ['procurement', editId],
    queryFn: async () => {
      const { data } = await procurementApi.getById(editId as string);
      return data;
    },
    enabled: !!editId,
  });

  const [hasPrefilled, setHasPrefilled] = useState(false);

  useEffect(() => {
    if (duplicateData && !hasPrefilled) {
      setTitle(duplicateData.title + ' (Kopyası)');
      setDescription(htmlToPlain(duplicateData.description || ''));
      setProjectId(duplicateData.projectId || duplicateData.project?.id || null);
      if (duplicateData.items && duplicateData.items.length > 0) {
        setItems(
          duplicateData.items.map((i: SelectedItem) => ({
            id: Math.random().toString(36).substr(2, 9),
            serialNumber: i.serialNumber || '',
            stockCode: i.stockCode || '',
            tonnageInfo: i.tonnageInfo || '',
            productName: i.productName || '',
            unit: i.unit || 'Adet',
            quantity: i.quantity || 1,
            secondaryQuantity: i.secondaryQuantity || '',
            secondaryUnit: i.secondaryUnit || '',
            showSecondary: !!i.secondaryQuantity,
            notes: i.notes || '',
            category: i.category || '',
            photos: [],
          }))
        );
      }
      setQuoteCollectDays(15);
      setHasPrefilled(true);
    }
    if (editData && !hasPrefilled) {
      setTitle(editData.title || '');
      setDescription(htmlToPlain(editData.description || ''));
      setProjectId(editData.projectId || editData.project?.id || null);
      setSelectedVendors(editData.assignments?.map((a) => a.vendorId) || []);
      if (editData.items && editData.items.length > 0) {
        setItems(
          editData.items.map((i: SelectedItem) => ({
            id: i.id || Math.random().toString(36).substr(2, 9),
            serialNumber: i.serialNumber || '',
            stockCode: i.stockCode || '',
            tonnageInfo: i.tonnageInfo || '',
            productName: i.productName || '',
            unit: i.unit || 'Adet',
            quantity: i.quantity || 1,
            secondaryQuantity: i.secondaryQuantity || '',
            secondaryUnit: i.secondaryUnit || '',
            showSecondary: !!i.secondaryQuantity,
            notes: i.notes || '',
            category: i.category || '',
            photos: [],
          }))
        );
      }
      if (editData.deadline) setQuoteCollectDays(daysUntilDeadline(editData.deadline));
      setShopDepartmentId(editData.shopDepartmentId || null);
      setShopWorkerId(editData.shopWorkerId || null);
      setShopCollarType(
        (editData.shopDepartment?.collarType as 'WHITE_COLLAR' | 'BLUE_COLLAR' | undefined) ||
          (editData.shopWorkerId ? 'BLUE_COLLAR' : editData.shopDepartmentId ? 'BLUE_COLLAR' : null)
      );
      setInternalNote(editData.internalNote || '');
      setHasPrefilled(true);
    }
  }, [duplicateData, editData, hasPrefilled]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      document.getElementById('procurement-list-title')?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onAction: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onAction: () => {},
  });

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleAddItem = useCallback(
    (category?: string) => {
      const finalCategory = category || '';
      const created = { ...newEmptyItem(), category: finalCategory };
      // Liste aşağı doğru büyüsün; yeni kalem eklendiği yerin sonunda görünsün.
      setItems((prev) => [...prev, created]);
      focusItemIdRef.current = created.id;
      if (errors.items) setErrors((e) => ({ ...e, items: undefined }));

      // Yeni eklenen grubun otomatik açık olmasını sağla
      if (finalCategory) {
        setCollapsedGroups((prev) => ({ ...prev, [finalCategory]: false }));
      }
    },
    [errors.items]
  );

  /** Yeni kalem eklenince listenin neresinde olursa olsun oraya götür ve imleci koy. */
  useEffect(() => {
    const id = focusItemIdRef.current;
    if (!id) return;
    focusItemIdRef.current = null;
    const el = document.getElementById(`item-name-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (el as HTMLInputElement).focus({ preventScroll: true });
  }, [items]);

  const handleCreateCategory = () => {
    if (!newCatName.trim()) {
      toast.error('Lütfen bir grup adı girin.');
      return;
    }

    const trimmedName = newCatName.trim();
    const existingCats = getUniqueCategories();
    if (existingCats.some((c) => c.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error(`"${trimmedName}" adında bir grup zaten mevcut!`);
      return;
    }

    handleAddItem(trimmedName);
    setNewCatName('');
    setIsCategoryDialogOpen(false);
    toast.success('Yeni grup başarıyla oluşturuldu.');
  };

  const getUniqueCategories = useCallback(() => {
    const cats = new Set<string>();
    items.forEach((i) => {
      if (i.category) cats.add(i.category.trim());
    });
    return Array.from(cats);
  }, [items]);

  /** Kullanıcı gerçekten grup tanımladı mı? Tanımlamadıysa grup arayüzü gizlenir. */
  const hasNamedGroups = useMemo(
    () => items.some((item) => Boolean(item.category?.trim())),
    [items],
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, SelectedItem[]> = { GENEL: [] };
    const cats = getUniqueCategories();
    cats.forEach((c: string) => (groups[c] = []));

    items.forEach((item) => {
      const cat = item.category?.trim() || 'GENEL';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [items, getUniqueCategories]);

  const updateItem = (id: string, field: string, value: string | number | boolean | undefined) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  /* ─── Vendor selection ─── */
  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors;
    const q = vendorSearch.toLowerCase();
    return vendors.filter(
      (v: Vendor) =>
        v.name?.toLowerCase().includes(q) ||
        v.contactName?.toLowerCase().includes(q) ||
        v.taxId?.toLowerCase().includes(q) ||
        v.contactEmail?.toLowerCase().includes(q) ||
        (v.extraContactEmails || []).some((em) => em.toLowerCase().includes(q)) ||
        (v.categories || []).some((c) => c.toLowerCase().includes(q)) ||
        v.notes?.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        v.district?.toLowerCase().includes(q) ||
        v.address?.toLowerCase().includes(q)
    );
  }, [vendors, vendorSearch]);

  /** Hızlı ekleme formunda öneri olarak sunulan mevcut etiketler */
  const vendorCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vendor of vendors) {
      for (const category of vendor.categories || []) {
        counts.set(category, (counts.get(category) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
      .map(([category]) => category);
  }, [vendors]);

  const selectedVendorNames = useMemo(() => {
    const byId = new Map(vendors.map((v) => [v.id, v.name]));
    return selectedVendors.map((id) => byId.get(id)).filter((name): name is string => Boolean(name));
  }, [vendors, selectedVendors]);

  const allFilteredSelected =
    filteredVendors.length > 0 && filteredVendors.every((v) => selectedVendors.includes(v.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      const filteredIds = new Set(filteredVendors.map((v) => v.id));
      setSelectedVendors((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      // Add all filtered
      const filteredIds = filteredVendors.map((v) => v.id);
      setSelectedVendors((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
    if (errors.vendors) setErrors((e) => ({ ...e, vendors: undefined }));
  };

  // Kararlı (memo'lu pencere kabuğu bununla gereksiz yere yeniden işlenmez).
  const applyPickedVendors = useCallback((ids: string[]) => {
    setSelectedVendors(ids);
    if (ids.length) setErrors((e) => (e.vendors ? { ...e, vendors: undefined } : e));
  }, []);

  const toggleVendor = (id: string) => {
    setSelectedVendors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    if (errors.vendors) setErrors((e) => ({ ...e, vendors: undefined }));
  };

  /* ─── Validation ─── */
  const validate = (): boolean => {
    const errs: ValidationErrors = {};
    if (!title.trim()) errs.title = 'Liste adı zorunludur.';
    else if (title.trim().length < 3) errs.title = 'Başlık en az 3 karakter olmalı.';
    
    // Geçerli kalemler: En azından ürün adı girilmiş olanlar
    const itemRows = items.filter((i) => i.productName.trim() || i.stockCode?.trim());
    if (itemRows.length === 0) {
      errs.items = 'En az 1 ürün kalemi girilmelidir.';
    } else {
      // Girilen kalemlerin zorunlu alanlarını kontrol et
      const hasIncomplete = itemRows.some(i => {
        const qty = typeof i.quantity === 'string' ? parseFloat(i.quantity) : i.quantity;
        return !i.productName.trim() || !qty || qty <= 0 || !i.unit.trim();
      });
      if (hasIncomplete) {
        errs.items = 'Ürün Adı, Miktar ve Birim alanları tüm kalemler için zorunludur.';
      }
    }

    if (!staffNeedsMahmut && selectedVendors.length === 0) errs.vendors = 'En az 1 tedarikçi seçilmelidir.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isFilledItem = (i: SelectedItem) => {
    const qty = typeof i.quantity === 'string' ? parseFloat(i.quantity) : i.quantity;
    return Boolean(i.productName.trim() && qty && qty > 0 && i.unit.trim());
  };

  const isPersistedItem = (itemId: string) =>
    Boolean(editId && (editData?.items || []).some((e: { id?: string }) => e.id === itemId));

  const collectItemMedia = () =>
    items
      .map((i, originalIndex) => ({ i, originalIndex }))
      .filter(({ i }) => isFilledItem(i))
      .map(({ i, originalIndex }, compactIndex) => ({
        sortOrder: originalIndex,
        compactIndex,
        files: i.photos || [],
      }))
      .filter((row) => row.files.length > 0);

  type ItemMediaRow = { sortOrder: number; compactIndex: number; files: File[] };

  /* ─── Mutation ─── */
  const createMutation = useMutation({
    mutationFn: async ({
      payload,
      files,
      itemMedia,
    }: {
      payload: unknown;
      files: File[];
      itemMedia: ItemMediaRow[];
    }) => {
      const res = editId
        ? await procurementApi.update(editId, payload)
        : await procurementApi.create(payload);
      return { res, files, itemMedia, payload };
    },
    onSuccess: async ({
      res,
      files,
      itemMedia,
      payload,
    }: {
      res: {
        data: {
          id: string;
          status?: string;
          items?: { id: string; sortOrder?: number | null }[];
          _newVendorEmailsSent?: number;
          _notifyErrors?: { vendorId: string; message: string }[];
        };
      };
      files: File[];
      itemMedia: ItemMediaRow[];
      payload: unknown;
    }) => {
      const saved = res?.data;
      const responseId = saved?.id || editId;
      const n = saved?._newVendorEmailsSent;
      const notifyErrors = saved?._notifyErrors || [];
      const status =
        saved?.status || (payload as { status?: string } | undefined)?.status;
      const isDraft = status === 'DRAFT';
      if (responseId && files.length > 0) {
        try {
          const fd = new FormData();
          files.forEach((f) => fd.append('files', f));
          await procurementApi.uploadAttachments(responseId, fd);
        } catch (err: unknown) {
          const apiMsg =
            typeof err === 'object' && err !== null && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : undefined;
          toast.error(apiMsg || 'Talep kaydedildi; ek dosyalar yüklenirken hata oluştu.');
        }
      }
      if (responseId && itemMedia.length > 0) {
        try {
          let serverItems = saved?.items || [];
          if (!serverItems.length) {
            const { data } = await procurementApi.getById(responseId);
            serverItems = (data?.items || []) as { id: string; sortOrder?: number | null }[];
          }
          const ordered = [...serverItems].sort(
            (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
          );
          for (const row of itemMedia) {
            const match =
              ordered.find((s) => Number(s.sortOrder) === row.sortOrder) ||
              ordered[row.compactIndex];
            if (!match?.id || !row.files.length) continue;
            const fd = new FormData();
            row.files.forEach((f) => fd.append('files', f));
            fd.append('itemId', match.id);
            await procurementApi.uploadAttachments(responseId, fd);
          }
        } catch (err: unknown) {
          const apiMsg =
            typeof err === 'object' && err !== null && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : undefined;
          toast.error(apiMsg || 'Talep kaydedildi; kalem dosyaları yüklenirken hata oluştu.');
        }
      }
      setPendingFiles([]);
      if (isDraft) {
        toast.success(
          editId
            ? 'Taslak güncellendi. Firmalara henüz bildirim gitmedi.'
            : 'Taslak kaydedildi. Firmalara henüz bildirim gitmedi.',
        );
      } else if (editId) {
        if (typeof n === 'number' && n > 0) {
          toast.success(`Tedarikçi talebi güncellendi. ${n} yeni tedarikçiye teklif e-postası gönderildi.`);
        } else if (notifyErrors.length > 0) {
          toast.error(
            notifyErrors[0]?.message ||
              'Talep güncellendi; yeni tedarikçi bildirimi gönderilemedi.'
          );
        } else {
          toast.success('Tedarikçi talebi güncellendi.');
        }
      } else if (notifyErrors.length > 0) {
        toast.error(
          notifyErrors[0]?.message ||
            'Talep kaydedildi; tedarikçi bildirimi gönderilemedi.',
        );
      } else {
        toast.success('Tedarikçi talebi oluşturuldu ve firmalara iletildi.');
      }
      if (responseId) {
        router.push(isDraft ? `/procurement/new?edit=${responseId}` : `/procurement/${responseId}`);
      } else {
        router.push('/procurement');
      }
    },
    onError: () => toast.error('Oluşturulamadı, lütfen alanları kontrol edin.'),
  });

  const quickVendorMutation = useMutation({
    // Hızlı eklenen tedarikçi, talebin modülüne yazılır; üretim listesine karışmasın.
    mutationFn: (data: QuickVendorPayload) =>
      vendorsApi.create({
        ...data,
        moduleId:
          requestModuleId === 'URETIM_PLANLAMA' || requestModuleId === 'YEDEK_PARCA'
            ? requestModuleId
            : 'SATIN_ALMA',
      }),
    onSuccess: async (res) => {
      const created = res.data as Vendor;
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      if (created?.id) {
        setSelectedVendors((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      }
      setQuickVendorOpen(false);
      toast.success('Tedarikçi eklendi ve seçildi.');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Tedarikçi eklenemedi.'
      );
    },
  });

  const quickWorkerMutation = useMutation({
    mutationFn: (data: QuickOrgWorkerPayload) =>
      orgWorkersApi.create({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        departmentId: data.departmentId,
      }),
    onSuccess: async (res) => {
      const created = res.data as {
        id: string;
        departmentId: string;
        firstName: string;
        lastName: string;
      };
      setShopCollarType('BLUE_COLLAR');
      setShopDepartmentId(created.departmentId);
      setShopWorkerId(created.id);
      await queryClient.invalidateQueries({ queryKey: ['org-workers'] });
      setQuickWorkerOpen(false);
      toast.success('Usta/çalışan eklendi ve seçildi.');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Usta/çalışan eklenemedi.'
      );
    },
  });

  const downloadTemplateMutation = useMutation({
    mutationFn: () =>
      procurementApi.downloadListTemplateBlob(
        showsProductionItemMeta(editData?.moduleId || duplicateData?.moduleId || user?.moduleId)
          ? 'URETIM_PLANLAMA'
          : 'SATIN_ALMA',
      ),
    onSuccess: () => toast.success('Şablon indirildi.'),
    onError: (e: unknown) => {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Şablon indirilemedi.');
    },
  });

  const handleFilledExcelSelected = async (file: File) => {
    try {
      const hasContent = items.some((i) => i.productName.trim());
      if (hasContent) {
        const ok = window.confirm(
          'Listede girilmiş ürünler var. Excel\'den gelen kalemler mevcut listeyin yerine geçecek. Devam edilsin mi?'
        );
        if (!ok) {
          if (excelImportInputRef.current) excelImportInputRef.current.value = '';
          return;
        }
      }
      const { rows, listTitle } = await parseProcurementListExcel(file);
      if (listTitle?.trim()) {
        setTitle(listTitle.trim());
        if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
      }
      // Excel'deki tüm birimleri resolve et (DB'de yoksa oluşturulur)
      const foldUnit = (s: string) => String(s || '').trim().toLocaleLowerCase('tr-TR');
      const excelUnits = [...new Set(rows.map((r) => r.unit || 'Adet'))];
      const canonUnits = new Map<string, string>();
      try {
        const { data } = await unitsApi.resolveMany(excelUnits);
        for (const u of (data as { name?: string }[]) || []) {
          if (u?.name) canonUnits.set(foldUnit(u.name), u.name);
        }
        await queryClient.invalidateQueries({ queryKey: ['units'] });
      } catch (err) {
        console.error('Units resolve error:', err);
      }

      const prodMeta = showsProductionItemMeta(
        editData?.moduleId || duplicateData?.moduleId || user?.moduleId,
      );
      const next = rows.map((r) => ({
        id: Math.random().toString(36).slice(2, 11),
        serialNumber: prodMeta ? r.serialNumber || '' : '',
        stockCode: prodMeta ? r.stockCode || '' : '',
        tonnageInfo: prodMeta ? r.tonnageInfo || '' : '',
        productName: r.productName,
        unit: canonUnits.get(foldUnit(r.unit || 'Adet')) || r.unit || 'Adet',
        quantity: r.quantity,
        secondaryQuantity: '',
        secondaryUnit: '',
        showSecondary: false,
        notes: r.notes || '',
        category: r.category || '',
        photos: [],
      }));
      setItems(next);
      const groups: Record<string, boolean> = {};
      next.forEach((i) => {
        const c = i.category?.trim() || 'GENEL';
        groups[c] = false;
      });
      setCollapsedGroups(groups);
      if (errors.items) setErrors((e) => ({ ...e, items: undefined }));
      toast.success(`${next.length} kalem Excel'den yüklendi.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Excel okunamadı.');
    }
    if (excelImportInputRef.current) excelImportInputRef.current.value = '';
  };

  /** Talep ekleri: hem dosya seçiminden hem sürükle-bırak ile aynı yol. */
  const addPendingFiles = (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    const { accepted, rejected } = splitAllowedAttachmentFiles(files);
    if (rejected.length) {
      toast.error(`Desteklenmeyen dosya türü: ${rejected.map((f) => f.name).join(', ')}`);
    }
    if (!accepted.length) return;
    setPendingFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_ATTACHMENTS) {
        toast.error(`En fazla ${MAX_ATTACHMENTS} dosya eklenebilir.`);
      }
      return next.slice(0, MAX_ATTACHMENTS);
    });
  };

  const handleCreateUnit = async () => {
    if (!newUnitName.trim()) return;
    try {
      const { data: unit } = await unitsApi.resolve(newUnitName.trim());
      await queryClient.invalidateQueries({ queryKey: ['units'] });
      if (newUnitTargetItemId) {
        updateItem(newUnitTargetItemId, 'unit', unit.name);
      }
      setIsNewUnitDialogOpen(false);
      setNewUnitName('');
      setNewUnitTargetItemId(null);
      toast.success('Birim eklendi.');
    } catch (err: unknown) {
      toast.error('Birim eklenirken hata oluştu.');
    }
  };

  const ALL_COLUMNS = [
    { id: 'serialNumber', label: 'SN (Sıra No)', description: 'Sıra numarası sütunu' },
    { id: 'stockCode', label: 'Stok Kodu', description: 'Ürün stok kodları' },
    { id: 'productName', label: 'Ürün Adı', description: 'Zorunlu alan', mandatory: true },
    { id: 'notes', label: 'Açıklama', description: 'Ürün detay notları' },
    { id: 'tonnageInfo', label: 'Tonaj', description: 'Tonaj bilgisi' },
    { id: 'quantity', label: 'Miktar', description: 'Zorunlu alan', mandatory: true },
    { id: 'unit', label: 'Birim', description: 'Zorunlu alan', mandatory: true },
  ];

  const requestModuleId = editData?.moduleId || duplicateData?.moduleId || user?.moduleId;
  const showProductionMeta = showsProductionItemMeta(requestModuleId);

  const { data: excelImportSettings } = useQuery({
    queryKey: ['procurement-excel-import-settings'],
    queryFn: async () => {
      const { data } = await procurementApi.getExcelImportSettings();
      return data as Record<string, boolean>;
    },
    enabled: user?.role === 'ADMIN' || user?.role === 'PURCHASING',
    staleTime: 5 * 60 * 1000,
  });
  /** Yönetici her zaman görür; diğer kullanıcılar için ayar modül bazında kapatılabilir. */
  const showExcelImportCard =
    user?.role === 'ADMIN' ||
    (requestModuleId ? excelImportSettings?.[requestModuleId] !== false : true);
  /** Sütun seçimi + yönetici CC yalnızca üretim taleplerinde; satın alma doğrudan e-posta önizlemesi. */
  const skipNotifyWizardSteps = !showProductionMeta;
  /** Yedek parça, tedarikçiye giden teklif formunu görmez; gönderim aynı şekilde yapılır. */
  const hideVendorFormPreview = isYedekParcaModule(requestModuleId) && user?.role !== 'ADMIN';
  /** Mavi / beyaz yaka birim yalnızca satın alma talebinde. Üretim ve yedek parça görmez. */
  const hideShopUnit = requestModuleId !== 'SATIN_ALMA';
  const showProjectPicker = showsProductionItemMeta(requestModuleId);

  const { data: projects = [] } = useQuery<
    { id: string; code?: string | null; name: string; isDefault?: boolean; isActive?: boolean }[]
  >({
    queryKey: ['procurement-projects', requestModuleId],
    queryFn: async () => (await projectsApi.list()).data,
    enabled: showProjectPicker && (user?.role === 'ADMIN' || user?.role === 'PURCHASING'),
  });

  useEffect(() => {
    if (!showProjectPicker || projectId || editId || duplicateId) return;
    const fallback = projects.find((p) => p.isDefault && p.isActive !== false) || projects.find((p) => p.isActive !== false);
    if (fallback) setProjectId(fallback.id);
  }, [showProjectPicker, projectId, editId, duplicateId, projects]);
  const pickerColumns = showProductionMeta
    ? ALL_COLUMNS
    : ALL_COLUMNS.filter((col) => !PRODUCTION_COLUMN_IDS.has(col.id));

  const [visibleColumns, setVisibleColumns] = useState<string[]>(['productName', 'quantity', 'unit']);
  const [previewStep, setPreviewStep] = useState<'COLUMNS' | 'MANAGERS' | 'EMAIL'>('COLUMNS');

  useEffect(() => {
    if (!showPreview || staffNeedsMahmut) return;
    requestNamedTour('procurement-new-send');
  }, [showPreview, staffNeedsMahmut]);

  useEffect(() => {
    const onReveal = (event: Event) => {
      const which = (event as CustomEvent<{ reveal?: string }>).detail?.reveal;
      if (which === 'rfq-preview-columns') setPreviewStep('COLUMNS');
      if (which === 'rfq-preview-managers') setPreviewStep('MANAGERS');
      if (which === 'rfq-preview-email') setPreviewStep('EMAIL');
    };
    window.addEventListener('up-tour:reveal', onReveal);
    return () => window.removeEventListener('up-tour:reveal', onReveal);
  }, []);

  const [ccSelectedIds, setCcSelectedIds] = useState<Set<string>>(() => new Set());

  const ccContactsEnabled = Boolean(
    !skipNotifyWizardSteps && (user?.role === 'ADMIN' || user?.role === 'PURCHASING')
  );

  const { data: ccContactsData, isPending: ccContactsLoading } = useQuery({
    queryKey: ['notification-cc-contacts'],
    queryFn: async () => {
      const { data } = await notificationCcContactsApi.getAll();
      return data as CcContact[];
    },
    enabled: ccContactsEnabled,
  });
  const ccContacts = ccContactsData ?? EMPTY_CC_CONTACTS;

  // Listeden kalkan kişilerin seçimini temizle; değişiklik yoksa aynı Set'i döndürüp render döngüsünü kes.
  useEffect(() => {
    const valid = new Set(ccContacts.map((c) => c.id));
    setCcSelectedIds((prev) => {
      const next = [...prev].filter((id) => valid.has(id));
      return next.length === prev.size ? prev : new Set(next);
    });
  }, [ccContacts]);

  const toggleCcSelected = (id: string) => {
    setCcSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
        return n;
      }
      if (n.size >= MAX_CC_PER_SEND) {
        toast.error(`CC için en fazla ${MAX_CC_PER_SEND} kişi seçebilirsiniz.`);
        return prev;
      }
      n.add(id);
      return n;
    });
  };

  const buildPayload = (status: string) => {
    const notificationCcEmails = skipNotifyWizardSteps
      ? []
      : (() => {
          const emails = ccContacts
            .filter((p) => ccSelectedIds.has(p.id))
            .map((p) => p.email.trim())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
          const seen = new Set<string>();
          const out: string[] = [];
          for (const e of emails) {
            const k = e.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(e);
          }
          return out;
        })();

    return {
      title: title.trim(),
      description: description.trim(),
      status,
      vendorIds: selectedVendors,
      visibleColumns: showProductionMeta
        ? visibleColumns
        : visibleColumns.filter((id) => !PRODUCTION_COLUMN_IDS.has(id)),
      quoteCollectDays: Math.min(120, Math.max(1, Math.round(Number(quoteCollectDays) || 15))),
      deadline: deadlineIsoFromDays(quoteCollectDays),
      shopDepartmentId: shopDepartmentId || null,
      shopWorkerId: shopCollarType === 'BLUE_COLLAR' ? shopWorkerId || null : null,
      ...(showProjectPicker ? { projectId: projectId || null } : {}),
      internalNote: internalNote.trim() || null,
      ...(notificationCcEmails.length > 0 ? { notificationCcEmails } : {}),
      items: items
        .map((i, originalIndex) => ({ i, originalIndex }))
        .filter(({ i }) => {
          const qty = typeof i.quantity === 'string' ? parseFloat(i.quantity) : i.quantity;
          return i.productName.trim() && qty && qty > 0 && i.unit.trim();
        })
        .map(({ i, originalIndex }) => {
          const row: Record<string, unknown> = {
            serialNumber: i.serialNumber || null,
            stockCode: i.stockCode || null,
            tonnageInfo: i.tonnageInfo || null,
            productName: i.productName,
            quantity: typeof i.quantity === 'string' ? parseFloat(i.quantity) || 0 : i.quantity,
            unit: i.unit,
            secondaryQuantity:
              i.showSecondary && i.secondaryQuantity ? parseFloat(String(i.secondaryQuantity)) : null,
            secondaryUnit: i.showSecondary && i.secondaryQuantity ? i.secondaryUnit : null,
            notes: i.notes,
            category: i.category,
            sortOrder: originalIndex,
          };
          if (editId && i.id) row.id = i.id;
          return row;
        }),
    };
  };

  const handleSaveDraft = () => {
    if (!title.trim()) {
      setErrors({ title: 'Liste adı zorunludur.' });
      toast.error('Lütfen liste adını girin');
      return;
    }
    createMutation.mutate({
      payload: buildPayload('DRAFT'),
      files: [...pendingFiles],
      itemMedia: collectItemMedia(),
    });
  };

  const handleSendToManager = async () => {
    if (!validate()) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }
    const filled = items.filter((i) => {
      const qty = typeof i.quantity === 'string' ? parseFloat(i.quantity) : i.quantity;
      return i.productName.trim() && qty && qty > 0 && i.unit.trim();
    });
    const cleanItems = filled.map((i) => ({
      productName: i.productName.trim(),
      quantity: typeof i.quantity === 'string' ? parseFloat(i.quantity) || 0 : i.quantity,
      unit: i.unit.trim(),
      notes: i.notes || null,
      stockCode: i.stockCode || null,
    }));
    const depts = [...whiteDepartments, ...blueDepartments];
    const deptName = depts.find((d) => d.id === shopDepartmentId)?.name || null;
    const fd = new FormData();
    fd.append('title', title.trim());
    if (description.trim()) fd.append('description', description.trim());
    if (internalNote.trim()) fd.append('internalNote', internalNote.trim());
    if (deptName) fd.append('requesterUnit', deptName);
    if (shopDepartmentId) fd.append('shopDepartmentId', shopDepartmentId);
    if (shopCollarType === 'BLUE_COLLAR' && shopWorkerId) fd.append('shopWorkerId', shopWorkerId);
    fd.append('items', JSON.stringify(cleanItems));
    pendingFiles.forEach((f) => fd.append('files', f));
    filled.forEach((item, idx) => {
      (item.photos || []).forEach((f) => fd.append(`itemFiles-${idx}`, f));
    });

    setStaffSending(true);
    try {
      const { data } = await internalRequestsApi.createAndSubmit(fd);
      toast.success('Talep yetkiliye iletildi. Tedarikçiye bildirim gitmedi.');
      router.replace(`/internal-requests/${data.id}`);
    } catch (err: unknown) {
      const apiMsg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(apiMsg || 'Yetkiliye gönderilemedi.');
    } finally {
      setStaffSending(false);
    }
  };

  const handleComplete = () => {
    if (!validate()) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }
    setPreviewStep(skipNotifyWizardSteps ? 'EMAIL' : 'COLUMNS');
    setCcSelectedIds(new Set());
    setShowPreview(true);
  };

  const handleSend = () => {
    createMutation.mutate({
      payload: buildPayload('SENT_TO_VENDOR'),
      files: [...pendingFiles],
      itemMedia: collectItemMedia(),
    });
  };

  const isEditingSentList = Boolean(editId && editData && editData.status !== 'DRAFT');
  const fromInternal = Boolean(editData?.sourceInternalRequest);

  const pageTitle = !editId
    ? staffNeedsMahmut
      ? 'Yetkiliye talep'
      : 'Yeni tedarikçi talebi'
    : fromInternal
      ? isEditingSentList
        ? 'Tedarikçi talebini düzenle'
        : 'Tedarikçi talebi'
      : isEditingSentList
        ? 'Tedarikçi talebini düzenle'
        : 'Taslağı düzenle';

  const pageHint = !editId
    ? staffNeedsMahmut
      ? 'Kalemleri ve isteğe bağlı mavi/beyaz yaka birimi girin.'
      : 'Tedarikçi seçip ürün kalemlerini belirleyerek talep oluşturun'
    : fromInternal
      ? isEditingSentList
        ? 'Birim talebinden oluşan teklif kaydı. Aynı talebe yetkili personel de görebilir.'
        : 'Tedarikçi talebi kayıtlı. Taslak olsa da aynı talebe yetkili diğer personel açabilir.'
      : isEditingSentList
        ? 'Ürün kalemleri ve tedarikçileri güncelleyin. Mevcut teklif bağlantıları korunur; silinen veya değişen satırlar tedarikçi tekliflerini etkileyebilir.'
        : 'Mevcut taslak listeyi güncelleyin veya gönderin';

  const handlePersistSentEdit = () => {
    if (!validate()) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }
    const st = editData?.status || 'SENT_TO_VENDOR';
    createMutation.mutate({
      payload: buildPayload(st),
      files: [...pendingFiles],
      itemMedia: collectItemMedia(),
    });
  };

  /* ─── Preview helpers ─── */
  const selectedVendorObjects = vendors.filter((v) => selectedVendors.includes(v.id));

  const previewLetterhead = useMemo(
    (): QuoteLetterhead => ({
      quoteDate: editData?.createdAt || new Date().toISOString(),
      quoteDeadline: deadlineIsoFromDays(quoteCollectDays),
      quoteRef: title.trim(),
      showQuoteTitle: requestModuleId === 'URETIM_PLANLAMA',
    }),
    [editData?.createdAt, quoteCollectDays, title, requestModuleId],
  );

  const previewHtml = buildEmailHTML(
    description,
    items.filter((i) => i.productName.trim()),
    (selectedVendorObjects[0] as Vendor)?.name || 'Tedarikçi Yetkilisi',
    { deadline: deadlineIsoFromDays(quoteCollectDays) },
    previewLetterhead,
  );

  const selectedCcPeople = useMemo(
    () => ccContacts.filter((p) => ccSelectedIds.has(p.id)),
    [ccContacts, ccSelectedIds]
  );

  const filledItemCount = items.filter((i) => String(i.productName || '').trim()).length;
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
  // Kalem tablosu sütunları (başlık ve satırlar aynı şablonu kullanır): üretimde Excel şablonundaki
  // SN, stok kodu ve tonaj da sütun. Eşik ekranın değil kartın genişliği (container query): yanda
  // özet kartı varken de tablo sığdığında sütunlara geçer, sığmazsa alt alta dizilir.
  const itemGrid = showProductionMeta
    ? {
        on: '@min-[760px]:grid',
        cols: '@min-[760px]:grid-cols-[28px_64px_100px_minmax(0,1fr)_80px_76px_110px_32px]',
        gap: '@min-[760px]:gap-2.5',
        one: '@min-[760px]:col-span-1',
        center: '@min-[760px]:justify-center',
        hide: '@min-[760px]:hidden',
        show: '@min-[760px]:flex',
      }
    : {
        on: '@min-[600px]:grid',
        cols: '@min-[600px]:grid-cols-[28px_minmax(0,1fr)_100px_150px_36px]',
        gap: '@min-[600px]:gap-3',
        one: '@min-[600px]:col-span-1',
        center: '@min-[600px]:justify-center',
        hide: '@min-[600px]:hidden',
        show: '@min-[600px]:flex',
      };

  const deadlineIso = deadlineIsoFromDays(quoteCollectDays);
  const deadlineDate = new Date(deadlineIso);
  const groupCount = Object.keys(groupedItems).filter((g) => g !== 'GENEL').length;
  const selectedNames = selectedVendors
    .map((id) => vendorNameById.get(id))
    .filter((name): name is string => Boolean(name));
  // Özet kartındaki kontrol listesi: her satır ilgili bölüme götürür.
  const readiness = [
    {
      key: 'title',
      step: 'Talep',
      label: 'Liste adı',
      done: Boolean(title.trim()),
      detail: title.trim() || 'Henüz yazılmadı',
      target: '#procurement-list-title',
    },
    {
      key: 'items',
      step: 'Kalemler',
      label: 'Kalemler',
      done: filledItemCount > 0,
      detail: filledItemCount ? `${filledItemCount} kalem${groupCount ? ` · ${groupCount} grup` : ''}` : 'En az bir ürün yazın',
      target: '[data-tour="rfq-items"]',
    },
    ...(staffNeedsMahmut
      ? []
      : [
          {
            key: 'vendors',
            step: 'Tedarikçiler',
            label: 'Tedarikçiler',
            done: selectedVendors.length > 0,
            detail: selectedNames.length
              ? selectedNames.slice(0, 2).join(', ') + (selectedNames.length > 2 ? ` +${selectedNames.length - 2}` : '')
              : 'Firma seçilmedi',
            target: '[data-tour="rfq-vendors"]',
          },
        ]),
  ];
  const readyCount = readiness.filter((r) => r.done).length;
  const goTo = (selector: string) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    const field = el.matches('input, textarea');
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: field ? 'center' : 'start' });
    if (field) el.focus({ preventScroll: true });
  };

  // Eylemler: geniş ekranda özet kartında alt alta, dar ekranda altta yüzen çubukta.
  const renderActions = (stacked: boolean) => {
    const full = stacked ? 'w-full' : undefined;
    if (isEditingSentList) {
      return (
        <>
          <PrimaryCta
            onClick={handlePersistSentEdit}
            disabled={createMutation.isPending}
            busy={createMutation.isPending}
            icon={<Save className="size-[18px]" />}
            className={full}
          >
            Değişiklikleri kaydet
          </PrimaryCta>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={createMutation.isPending}
            className={cn(btnWave, 'h-12', full)}
          >
            <ArrowLeft className="size-4" />
            Geri
          </button>
        </>
      );
    }
    if (staffNeedsMahmut) {
      return (
        <PrimaryCta
          onClick={handleSendToManager}
          disabled={staffSending}
          busy={staffSending}
          icon={<Send className="size-[18px]" />}
          className={full}
        >
          Yetkiliye gönder
        </PrimaryCta>
      );
    }
    return (
      <>
        <PrimaryCta onClick={handleComplete} disabled={createMutation.isPending} className={full}>
          Listeyi tamamla ve önizle
        </PrimaryCta>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={createMutation.isPending}
          className={cn(btnWave, 'h-12', full)}
        >
          <Save className="size-4" />
          Taslak olarak kaydet
        </button>
      </>
    );
  };

  if (editId && editLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {!staffNeedsMahmut ? (
        <>
      <QuickVendorDialog
        open={quickVendorOpen}
        onClose={() => setQuickVendorOpen(false)}
        onSave={(data) => quickVendorMutation.mutate(data)}
        isPending={quickVendorMutation.isPending}
        categorySuggestions={vendorCategoryOptions}
      />
      <VendorPickerHost
        ref={vendorPickerRef}
        vendors={vendors}
        selectedIds={selectedVendors}
        isLoading={vendorsLoading}
        canSeeAllModules={user?.role === 'ADMIN'}
        preferredModuleId={requestModuleId}
        createModuleId={requestModuleId}
        onApply={applyPickedVendors}
      />
        </>
      ) : null}
      <QuickOrgWorkerDialog
        open={quickWorkerOpen}
        onClose={() => setQuickWorkerOpen(false)}
        onSave={(data) => quickWorkerMutation.mutate(data)}
        isPending={quickWorkerMutation.isPending}
        departments={blueDepartments}
        defaultDepartmentId={shopDepartmentId}
      />
      {/* ─── Önizleme + Gönder Modal ─── */}
      {showPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Talebi gözden geçir ve gönder"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-3 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPreview(false);
          }}
        >
          <div className="flex h-[min(800px,calc(100dvh-1.5rem))] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-white/15 bg-background sm:h-[min(800px,calc(100dvh-2rem))]">
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              data-tour="rfq-wiz-head"
              style={{
                background: 'var(--background)',
                borderBottom: '1px solid rgba(255,255,255,.1)',
              }}
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold text-foreground text-sm ">
                    {previewStep === 'COLUMNS'
                      ? 'Görünür Sütunları Seç'
                      : previewStep === 'MANAGERS'
                        ? 'Yönetici alanları (CC)'
                        : 'E-posta önizlemesi'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {previewStep === 'COLUMNS'
                      ? 'Adım 1/3 — Tedarikçilerin hangi verileri göreceğini belirleyin'
                      : previewStep === 'MANAGERS'
                        ? 'Adım 2/3 — Bildirimde CC olacak yöneticileri seçin (isteğe bağlı)'
                        : skipNotifyWizardSteps
                          ? `${selectedVendorNames.length} firmaya gönderilecek`
                          : `Adım 3/3 — ${selectedVendorNames.length} firmaya gönderilecek`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                aria-label="Önizlemeyi kapat"
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewStep === 'COLUMNS' && !skipNotifyWizardSteps ? (
              <div className="min-h-0 flex-1 overflow-y-auto bg-background p-8" data-tour="rfq-wiz-columns">
                <div className="max-w-3xl mx-auto space-y-8">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-white">Teklif formunun sütunları</h3>
                    <p className="text-muted-foreground text-sm">
                      Tedarikçilerin teklif verirken göreceği ve doldurabileceği sütunları seçin. 
                      Zorunlu sütunlar her zaman gösterilir.
                    </p>
                  </div>

                  <div className="divide-y divide-white/10 border-y border-white/10">
                    {pickerColumns.map((col) => (
                      <label key={col.id} className="flex cursor-pointer items-center gap-3 py-3.5 text-sm">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.id)}
                          disabled={col.mandatory}
                          onChange={() => setVisibleColumns(prev => prev.includes(col.id) ? prev.filter(x => x !== col.id) : [...prev, col.id])}
                          className="size-4 accent-brand"
                        />
                        <span className="flex-1 text-white/90">{col.label}</span>
                        <span className="text-xs text-white/40">{col.mandatory ? 'Zorunlu' : col.description}</span>
                      </label>
                    ))}
                  </div>

                  <div className="pt-8 border-t border-white/5 flex justify-end">
                    <Button 
                      onClick={() => setPreviewStep('MANAGERS')}
                      className="h-10 rounded-md px-4 text-sm font-medium shadow-none"
                    >
                      İleri: Yöneticiler (CC)
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : previewStep === 'MANAGERS' && !skipNotifyWizardSteps ? (
              <div className="min-h-0 flex-1 overflow-y-auto bg-background p-6 sm:p-8" data-tour="rfq-wiz-managers">
                <div className="max-w-3xl mx-auto space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                      <Users className="w-6 h-6 text-primary shrink-0" />
                      Yönetici alanları (CC)
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      Yönetici tarafından tanımlanan kişiler arasından bu gönderimde bildirim kopyası alacakları
                      işaretleyin. Kişi eklemek veya silmek için sol menüden{' '}
                      <span className="text-foreground font-medium">Teklif bildirimi CC</span> sayfasını yönetici
                      kullanır; satın alma sorumlusu listeyi değiştiremez.
                    </p>
                    {user?.role === 'ADMIN' ? (
                      <Link
                        href="/settings/notification-cc-contacts"
                        className="inline-flex items-center justify-center rounded-lg border border-primary/40 bg-transparent px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        CC listesini düzenle
                      </Link>
                    ) : null}
                  </div>

                  {ccContactsLoading ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-bold  text-white/90">
                          CC alacaklar ({ccSelectedIds.size}/{MAX_CC_PER_SEND})
                        </p>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {ccContacts.length} kişi tanımlı (sunucu, en fazla {MAX_CC_CONTACTS_DB})
                        </span>
                      </div>
                      {ccContacts.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/15 p-8 text-center space-y-3">
                          <p className="text-muted-foreground text-sm">
                            Henüz tanımlı yönetici yok. CC göndermek için yöneticinin kişi listesini doldurması gerekir.
                          </p>
                          {user?.role === 'ADMIN' ? (
                            <Link
                              href="/settings/notification-cc-contacts"
                              className="inline-flex items-center justify-center rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:opacity-90"
                            >
                              Listeyi aç
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <ul className="space-y-2 max-h-[min(320px,45vh)] overflow-y-auto pr-1">
                          {ccContacts.map((person) => {
                            const sel = ccSelectedIds.has(person.id);
                            return (
                              <li
                                key={person.id}
                                className={cn(
                                  'border-b border-white/10 flex items-stretch gap-3 py-3',
                                  sel
                                    ? 'bg-white/[0.03]'
                                    : 'hover:bg-white/[0.02]'
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleCcSelected(person.id)}
                                  className="shrink-0 w-8 flex items-center justify-center text-white/75"
                                  title={sel ? "CC'den çıkar" : "CC'ye ekle"}
                                >
                                  {sel ? (
                                    <CheckSquare className="w-5 h-5 text-primary" />
                                  ) : (
                                    <Square className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0 py-0.5">
                                  <p className="font-semibold text-foreground truncate">{person.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{person.email}</p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t border-white/5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewStep('COLUMNS')}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm text-white/70 hover:bg-white/5"
                    >
                      <ChevronLeft className="h-5 w-5 shrink-0 text-primary/90 transition-transform group-hover:-translate-x-0.5" />
                      <span className="hidden sm:inline">1. adım:</span>
                      <span>Sütunlar</span>
                    </button>
                    <Button
                      type="button"
                      onClick={() => setPreviewStep('EMAIL')}
                      className="h-10 rounded-md px-4 text-sm font-medium shadow-none"
                    >
                      İleri: E-posta önizlemesi
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-hidden bg-white">
                  <iframe
                    srcDoc={previewHtml}
                    title="Email Önizleme"
                    className="h-full w-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>

                {/* Modal Footer — Gönder butonu burada */}
                <div
                  className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-5 py-4"
                  style={{ background: 'var(--background)', borderTop: '1px solid rgba(255,255,255,.1)' }}
                >
                  <div className="text-xs text-muted-foreground space-y-1 max-w-xl">
                    <div className="font-medium text-foreground">
                      {items.filter((i) => i.productName.trim()).length} kalem •{' '}
                      {selectedVendorNames.length} tedarikçi
                    </div>
                    {!skipNotifyWizardSteps &&
                      (selectedCcPeople.length > 0 ? (
                        <div className="text-primary/95 leading-snug">
                          <span className="text-muted-foreground font-medium">CC: </span>
                          {selectedCcPeople.map((p) => p.email).join(', ')}
                        </div>
                      ) : (
                        <div className="text-muted-foreground/90">CC seçilmedi — yalnızca tedarikçi adresleri alır.</div>
                      ))}
                    <div>Göndermek listeyi kaydeder ve seçilen firmalara e-posta iletir.</div>
                  </div>
                  <div className="flex gap-2 sm:gap-3 flex-wrap justify-end shrink-0 items-center">
                    {!skipNotifyWizardSteps ? (
                      <button
                        type="button"
                        onClick={() => setPreviewStep('MANAGERS')}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm text-white/70 hover:bg-white/5"
                      >
                        <ChevronLeft className="h-5 w-5 shrink-0 text-primary/90 transition-transform group-hover:-translate-x-0.5" />
                        <span className="hidden sm:inline">2. adım:</span>
                        <span>Yöneticiler</span>
                      </button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={handleSend}
                      disabled={createMutation.isPending}
                      data-tour="rfq-wiz-send"
                      className="h-10 gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Onayla ve gönder
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Ana sayfa: panonun dili. Kutusuz karşılama; solda bölüm kartları, sağda yapışkan özet. ─── */}
      <div className="@container mx-auto max-w-[1600px] pb-12">
        {/* Karşılama: liste adı yazıldıkça ikinci satırda belirir; sağda son teklif günü (panodaki tarih bloğu). */}
        <header
          data-tour="rfq-head"
          className="relative flex flex-col gap-6 pb-6 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="min-w-0 max-w-3xl">
            {/* Adım şeridi: adım doldukça altına döner, tıklayınca o bölüme götürür. */}
            <nav aria-label="Adımlar" className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
              {readiness.map((r, i) => (
                <Fragment key={r.key}>
                  {i > 0 ? (
                    <span
                      aria-hidden
                      className={cn(
                        'h-px w-6 transition-colors duration-300',
                        readiness[i - 1].done ? 'bg-brand/60' : 'bg-white/15',
                      )}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => goTo(r.target)}
                    className="group/step flex items-center gap-2 rounded-full py-1 pr-1 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <span
                      className={cn(
                        'flex size-[22px] items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums transition-colors duration-300',
                        r.done
                          ? 'border-brand bg-brand text-[#141416]'
                          : 'border-white/20 text-white/55 group-hover/step:border-brand/60 group-hover/step:text-brand',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        'font-medium transition-colors duration-200',
                        r.done ? 'text-white' : 'text-white/50 group-hover/step:text-brand',
                      )}
                    >
                      {r.step}
                    </span>
                  </button>
                </Fragment>
              ))}
            </nav>
            <h1 className="text-[34px] font-medium leading-[1.06] tracking-[-0.035em] text-white sm:text-[42px] lg:text-[50px]">
              <span className="block">
                <SmokeText text={pageTitle} />
              </span>
              <span className="block overflow-hidden pb-[0.05em]">
                <span
                  className={cn(
                    'login-line block truncate transition-colors duration-300',
                    title.trim() ? 'text-white/75' : 'text-white/20',
                  )}
                  style={{ animationDelay: '110ms' }}
                >
                  {title.trim() || 'Adsız liste'}
                </span>
              </span>
            </h1>
            <p className="fx-rise mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/55">{pageHint}</p>
          </div>

          {!staffNeedsMahmut ? (
            // Değirmen tarihin yanında: blok soldaki yazıdan kısa kalır, ikisi alttan hizalanır.
            <div className="hidden shrink-0 items-end gap-5 lg:flex">
              <Windmill className="mb-1.5 block size-[64px] text-brand" />
              <div className="text-right">
                <p className="text-[13px] text-white/40">Son teklif günü</p>
                <p className="mt-2 text-[72px] font-[200] leading-[0.85] tracking-[-0.05em] text-white tabular-nums">
                  {String(deadlineDate.getDate()).padStart(2, '0')}
                </p>
                <p className="mt-3 text-[14px] font-medium capitalize text-white/70">
                  {deadlineDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-[13px] text-white/38">
                  <span className="capitalize">{deadlineDate.toLocaleDateString('tr-TR', { weekday: 'long' })}</span>
                  {' · '}
                  <span className="tabular-nums">{quoteCollectDays}</span> gün sonra
                </p>
              </div>
            </div>
          ) : null}
        </header>

        <div className="grid grid-cols-1 items-start gap-4 @min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            {/* ─── Talep ─── */}
            <RfqTile
              icon={FileText}
              title="Talep"
              done={Boolean(title.trim())}
              tour="rfq-info"
            >
              <div className="space-y-7">
                {/* Liste adı: belge başlığı gibi büyük ve kutusuz; altında ince çizgi, odakta altın. */}
                <div>
                  <FieldLabel htmlFor="procurement-list-title" required>
                    Liste adı / referans
                  </FieldLabel>
                  <input
                    id="procurement-list-title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (errors.title) setErrors((err) => ({ ...err, title: undefined }));
                    }}
                    placeholder="örn: PO-2026-004 Demir Alımı"
                    aria-invalid={errors.title ? true : undefined}
                    autoComplete="off"
                    className={cn(
                      'mt-1 h-14 w-full border-0 border-b bg-transparent px-0 text-[22px] font-medium tracking-[-0.02em] text-white outline-none transition-colors duration-200 placeholder:font-normal placeholder:text-white/20 sm:text-[24px]',
                      errors.title
                        ? 'border-destructive/70'
                        : 'border-white/[0.1] hover:border-brand/45 focus-visible:border-brand',
                    )}
                  />
                  {errors.title ? (
                    <div className="mt-2">
                      <FieldError>{errors.title}</FieldError>
                    </div>
                  ) : null}
                </div>

                {showProjectPicker ? (
                  <div className="grid grid-cols-1 gap-5 @min-[640px]:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel htmlFor="procurement-project">Proje</FieldLabel>
                        <button
                          type="button"
                          onClick={() => setNewProjectOpen((v) => !v)}
                          className="text-[12px] font-medium text-brand transition-colors duration-150 hover:text-[#e4c43c]"
                        >
                          {newProjectOpen ? 'Vazgeç' : 'Yeni proje'}
                        </button>
                      </div>
                      <div className="relative">
                        <select
                          id="procurement-project"
                          value={projectId || ''}
                          onChange={(e) => setProjectId(e.target.value || null)}
                          className={selectClass}
                        >
                          {projects
                            .filter((p) => p.isActive !== false || p.id === projectId)
                            .map((p) => (
                              <option key={p.id} value={p.id} className="bg-[#1a1a1d]">
                                {projectLabel(p)}
                              </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                      </div>
                      {newProjectOpen ? (
                        <NewProjectInline
                          onCancel={() => setNewProjectOpen(false)}
                          onCreated={(id) => {
                            setProjectId(id);
                            setNewProjectOpen(false);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {!hideShopUnit ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel>Talep eden birim</FieldLabel>
                      {shopCollarType ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShopCollarType(null);
                            setShopDepartmentId(null);
                            setShopWorkerId(null);
                          }}
                          className="flex items-center gap-1 text-[12px] text-white/45 transition-colors duration-150 hover:text-brand"
                        >
                          <X className="size-3" />
                          Temizle
                        </button>
                      ) : (
                        <span className="text-[12px] text-white/35">İsteğe bağlı</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 @min-[720px]:flex-row @min-[720px]:items-center">
                      <div role="group" aria-label="Yaka" className={cn(segmentWrap, '@min-[720px]:w-[240px] @min-[720px]:shrink-0')}>
                        {(
                          [
                            ['WHITE_COLLAR', 'Beyaz yaka'],
                            ['BLUE_COLLAR', 'Mavi yaka'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={shopCollarType === key}
                            onClick={() => selectShopCollar(key)}
                            className={cn(segmentItem, shopCollarType === key ? segmentOn : segmentOff)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {shopCollarType ? (
                        <div className="min-w-0 flex-1">
                          <SearchableCombobox
                            options={departmentOptions}
                            value={shopDepartmentId}
                            onChange={onShopDepartmentChange}
                            placeholder={
                              shopCollarType === 'BLUE_COLLAR' ? 'Mavi yaka birim ara…' : 'Beyaz yaka birim ara…'
                            }
                            allowClear
                          />
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-white/35 @min-[720px]:pl-2">
                          Önce yaka seçin; birim ve usta buna göre listelenir.
                        </p>
                      )}
                      {shopCollarType === 'BLUE_COLLAR' ? (
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <SearchableCombobox
                              options={workerOptions}
                              value={shopWorkerId}
                              onChange={onShopWorkerChange}
                              placeholder="Talep eden usta ara…"
                              allowClear
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setQuickWorkerOpen(true)}
                            className={cn(btnWave, 'h-9 rounded-[10px] px-3 text-[12.5px]')}
                          >
                            <Plus className="size-3.5" />
                            Yeni usta
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-5 @min-[640px]:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel htmlFor="procurement-description">Açıklama / şartname</FieldLabel>
                    <Textarea
                      id="procurement-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Teslimat koşulları, ödeme vb."
                      className={cn(fieldBase, 'min-h-[104px] py-2.5 leading-relaxed')}
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel htmlFor="procurement-internal-note">
                      İç not
                      <span className="inline-flex items-center gap-1 font-normal text-white/35">
                        <Lock className="size-3" />
                        yalnızca Satın Alma görür
                      </span>
                    </FieldLabel>
                    <Textarea
                      id="procurement-internal-note"
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="Satın alma ekibi için not; tedarikçiyle paylaşılmaz"
                      className={cn(fieldBase, 'min-h-[104px] py-2.5 leading-relaxed')}
                    />
                  </div>
                </div>

                {/* Ekler: bırakma alanı panodaki kısayol gibi; simge kutusu üzerine gelince altınla dolar. */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel>Şartname ve ek dosyalar</FieldLabel>
                    <span className="text-[12px] tabular-nums text-white/40">
                      {pendingFiles.length}/{MAX_ATTACHMENTS}
                    </span>
                  </div>
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsAttachmentDragging(true);
                    }}
                    onDragLeave={() => setIsAttachmentDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsAttachmentDragging(false);
                      addPendingFiles(e.dataTransfer.files);
                    }}
                    className={cn(
                      'gold-fade group/drop flex cursor-pointer items-center gap-4 rounded-[16px] border border-dashed px-4 py-4 transition-colors duration-200',
                      isAttachmentDragging ? 'border-brand bg-brand/[0.06]' : 'border-white/[0.14] hover:border-brand/45',
                    )}
                  >
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept={ATTACHMENT_ACCEPT}
                      onChange={(e) => {
                        addPendingFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <Paperclip
                      aria-hidden
                      className="size-5 shrink-0 text-brand transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/drop:-rotate-12 group-hover/drop:scale-110"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-white">
                        {isAttachmentDragging ? 'Bırakın, eklensin' : 'Dosya seçin ya da sürükleyip bırakın'}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-white/40">
                        Şartname, katalog, teknik çizim… dosya başına en çok 25 MB. Kaleme özel dosyayı kalemin
                        altından ekleyin.
                      </span>
                    </span>
                    <ArrowRight className="hidden size-4 shrink-0 -translate-x-1.5 -rotate-45 text-brand opacity-0 transition-[opacity,transform] duration-300 group-hover/drop:translate-x-0 group-hover/drop:opacity-100 sm:block" />
                  </label>
                  <details className="group text-[12px] text-white/40">
                    <summary className="flex cursor-pointer list-none items-center gap-1 transition-colors duration-150 hover:text-brand">
                      <ChevronRight className="size-3 transition-transform duration-200 group-open:rotate-90" />
                      İzinli dosya türleri
                    </summary>
                    <p className="mt-1.5 pl-4 leading-relaxed">{ATTACHMENT_ALLOWED_LABEL}</p>
                  </details>
                  {pendingFiles.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {pendingFiles.map((f, idx) => (
                        <li
                          key={`${f.name}-${idx}`}
                          className="flex max-w-full items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-1"
                        >
                          <FileText className="size-3.5 shrink-0 text-brand" />
                          <span className="min-w-0 max-w-[260px] truncate text-[12.5px] text-white/85">{f.name}</span>
                          <span className="shrink-0 text-[11.5px] tabular-nums text-white/35">
                            {formatFileSize(f.size)}
                          </span>
                          <button
                            type="button"
                            title="Kaldır"
                            aria-label={`${f.name} dosyasını kaldır`}
                            className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-white/40 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </RfqTile>

            {/* ─── Kalemler: Excel şablonuyla aynı sütunlar, başlıklar bir kez ─── */}
            <RfqTile
              icon={Package}
              title="Kalemler"
              required
              done={filledItemCount > 0}
              meta={filledItemCount ? `${filledItemCount} kalem` : undefined}
              tour="rfq-items"
              action={
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {!editId && showExcelImportCard ? (
                    <div className="flex items-center gap-1" data-tour="rfq-excel">
                      <button
                        type="button"
                        title="Excel şablonunu indir"
                        disabled={downloadTemplateMutation.isPending}
                        onClick={() => downloadTemplateMutation.mutate()}
                        className={btnGhost}
                      >
                        {downloadTemplateMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                        Şablon
                      </button>
                      <button
                        type="button"
                        title="Hazır Excel yükle (mevcut satırların üzerine yazar)"
                        onClick={() => excelImportInputRef.current?.click()}
                        className={btnGhost}
                      >
                        <Upload className="size-4" />
                        Excel yükle
                      </button>
                      <input
                        ref={excelImportInputRef}
                        type="file"
                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFilledExcelSelected(f);
                        }}
                      />
                      <span aria-hidden className="mx-1 h-5 w-px bg-white/[0.08]" />
                    </div>
                  ) : null}
                  <button type="button" onClick={() => setIsCategoryDialogOpen(true)} className={btnGhost}>
                    <Layers className="size-4" />
                    Grup ekle
                  </button>
                </div>
              }
              flush
            >
              {!editId && showExcelImportCard ? (
                <p className="flex items-start gap-2 border-b border-hairline px-5 py-3 text-[12px] leading-relaxed text-white/40 sm:px-6">
                  <Table className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  <span>
                    {showProductionMeta
                      ? 'Excel şablonu: SN, Stok Kodu, Ürün Adı, Açıklama, Tonaj, Miktar, Birim. Sarı satıra ünite adı yazın.'
                      : 'Excel şablonu: Ürün Adı, Miktar, Birim, Açıklama (SN / stok / tonaj / ünite yok).'}{' '}
                    &quot;Excel yükle&quot; tabloya aktarır, mevcut satırların üzerine yazar.
                  </span>
                </p>
              ) : null}
              {errors.items ? (
                <div className="border-b border-hairline px-5 py-3 sm:px-6">
                  <FieldError>{errors.items}</FieldError>
                </div>
              ) : null}

              {/* Sütun başlıkları (kart yeterince genişse) */}
              <div
                aria-hidden
                className={cn(
                  'hidden items-center border-b border-hairline px-5 py-2.5 text-[12px] font-medium text-white/40 sm:px-6',
                  itemGrid.on,
                  itemGrid.cols,
                  itemGrid.gap,
                )}
              >
                <span className="text-center">#</span>
                {showProductionMeta ? (
                  <>
                    <span>SN</span>
                    <span>Stok kodu</span>
                  </>
                ) : null}
                <span>
                  Ürün adı / detayı <span className="text-brand">*</span>
                </span>
                {showProductionMeta ? <span>Tonaj</span> : null}
                <span className="text-center">
                  Miktar <span className="text-brand">*</span>
                </span>
                <span>
                  Birim <span className="text-brand">*</span>
                </span>
                <span />
              </div>

              <div>
                {Object.entries(groupedItems).map(([groupName, groupItems]) => {
                  // Grup kullanılmadıysa "Genel" başlığı gereksiz kalabalık yapıyor
                  const hideGroupHeader = groupName === 'GENEL' && !hasNamedGroups;
                  const isCollapsed = !hideGroupHeader && (collapsedGroups[groupName] || false);

                  return (
                    <div key={groupName} className="border-b border-hairline last:border-b-0">
                      {!hideGroupHeader ? (
                        <div className="flex items-center justify-between gap-3 bg-white/[0.02] py-2 pl-3 pr-3 sm:pl-4 sm:pr-5">
                          <button
                            type="button"
                            onClick={() => toggleGroup(groupName)}
                            aria-expanded={!isCollapsed}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] px-1.5 py-1 text-left outline-none transition-colors duration-150 hover:text-brand focus-visible:ring-2 focus-visible:ring-white/30"
                          >
                            <ChevronRight
                              className={cn(
                                'size-4 shrink-0 text-white/45 transition-transform duration-200',
                                !isCollapsed && 'rotate-90',
                              )}
                            />
                            {groupName !== 'GENEL' ? <Layers aria-hidden className="size-4 shrink-0 text-brand" /> : null}
                            <span className="min-w-0 truncate text-[13.5px] font-medium text-white">
                              {groupName === 'GENEL' ? 'Grupsuz kalemler' : groupName}
                            </span>
                            <span className="shrink-0 text-[12px] tabular-nums text-white/40">
                              {groupItems.length} kalem
                            </span>
                          </button>
                          {groupName !== 'GENEL' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  title: 'Grubu Temizle?',
                                  description: `"${groupName}" grubundaki tüm ürün kalemleri silinecektir. Bu işlem geri alınamaz.`,
                                  onAction: () => {
                                    setItems((prev) => prev.filter((i) => i.category?.trim() !== groupName));
                                  },
                                });
                              }}
                              className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-medium text-white/45 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                              Grubu temizle
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {!isCollapsed ? (
                        <>
                          {groupItems.map((item, idx) => (
                            <div
                              key={item.id}
                              className="gold-fade gold-fade-x group/item relative border-b border-white/[0.05] px-5 py-3.5 sm:px-6"
                            >
                              {/* Odaktaki satır: solda altın çizgi (panodaki son talepler satırı gibi). */}
                              <span
                                aria-hidden
                                className="absolute inset-y-3 left-0 w-[2px] origin-center scale-y-0 rounded-r-full bg-brand transition-transform duration-300 ease-out group-focus-within/item:scale-y-100"
                              />
                              {/* Ana satır: sütunlar başlıkla hizalı; dar kartta alt alta */}
                              <div className={cn('grid grid-cols-2 items-center gap-2', itemGrid.cols, itemGrid.gap)}>
                                <span className={cn('col-span-2 flex items-center justify-between', itemGrid.one, itemGrid.center)}>
                                  <span className="text-[15px] font-[300] tabular-nums text-white/40 transition-colors duration-200 group-focus-within/item:text-brand">
                                    {idx + 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    disabled={items.length <= 1}
                                    aria-label={`Kalem ${idx + 1} sil`}
                                    className={cn(
                                      'flex size-8 items-center justify-center rounded-[9px] text-white/35 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30',
                                      itemGrid.hide,
                                    )}
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </span>
                                {showProductionMeta ? (
                                  <>
                                    <Input
                                      aria-label="SN"
                                      value={item.serialNumber || ''}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9.,\-]/g, '');
                                        updateItem(item.id, 'serialNumber', val);
                                      }}
                                      placeholder="SN"
                                      className={cn(cellClass, 'tabular-nums')}
                                    />
                                    <Input
                                      aria-label="Stok kodu"
                                      value={item.stockCode || ''}
                                      onChange={(e) => updateItem(item.id, 'stockCode', e.target.value)}
                                      placeholder="Stok kodu"
                                      maxLength={250}
                                      className={cellClass}
                                    />
                                  </>
                                ) : null}
                                <Input
                                  id={`item-name-${item.id}`}
                                  aria-label="Ürün adı"
                                  value={item.productName}
                                  onChange={(e) => {
                                    updateItem(item.id, 'productName', e.target.value);
                                    if (errors.items) setErrors((err) => ({ ...err, items: undefined }));
                                  }}
                                  placeholder="İstenilen ürün adı"
                                  className={cn(cellClass, 'col-span-2 font-medium', itemGrid.one)}
                                />
                                {showProductionMeta ? (
                                  <Input
                                    aria-label="Tonaj bilgisi"
                                    value={item.tonnageInfo || ''}
                                    onChange={(e) => updateItem(item.id, 'tonnageInfo', e.target.value)}
                                    placeholder="Tonaj"
                                    maxLength={250}
                                    className={cn(cellClass, 'col-span-2', itemGrid.one)}
                                  />
                                ) : null}
                                <Input
                                  aria-label="Miktar"
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                  placeholder="Miktar"
                                  className={cn(cellClass, 'text-center font-medium tabular-nums')}
                                  min={0}
                                />
                                <div className="relative">
                                  <select
                                    aria-label="Birim"
                                    value={item.unit}
                                    onChange={(e) => {
                                      if (e.target.value === '__NEW__') {
                                        setNewUnitTargetItemId(item.id);
                                        setNewUnitName('');
                                        setIsNewUnitDialogOpen(true);
                                      } else {
                                        updateItem(item.id, 'unit', e.target.value);
                                      }
                                    }}
                                    className={cn(
                                      cellClass,
                                      'w-full cursor-pointer appearance-none pr-8 focus:border-brand/60 focus:ring-4 focus:ring-brand/15',
                                    )}
                                  >
                                    {quantityUnitNames.map((name) => (
                                      <option key={name} value={name} className="bg-[#1a1a1d]">
                                        {name}
                                      </option>
                                    ))}
                                    {item.unit && !quantityUnitNames.some((name) => name === item.unit) ? (
                                      <option value={item.unit} className="bg-[#1a1a1d]">
                                        {item.unit}
                                      </option>
                                    ) : null}
                                    <option value="__NEW__" className="bg-[#1a1a1d] font-medium text-brand">
                                      + Yeni birim ekle…
                                    </option>
                                  </select>
                                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  disabled={items.length <= 1}
                                  title="Kalemi sil"
                                  aria-label={`Kalem ${idx + 1} sil`}
                                  className={cn(
                                    'hidden size-9 items-center justify-center rounded-[10px] text-white/25 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 group-hover/item:text-white/50',
                                    itemGrid.show,
                                  )}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>

                              {/* Alt satır: açıklama, kaleme özel dosyalar, grup */}
                              <div className="mt-2.5 space-y-2">
                                <AutoGrowTextarea
                                  value={item.notes || ''}
                                  onChange={(next) => updateItem(item.id, 'notes', next)}
                                  placeholder="Açıklama / teknik not ekle (isteğe bağlı)…"
                                  className="w-full rounded-[10px] border border-transparent bg-transparent px-3 py-1.5 text-[13px] leading-relaxed text-white/80 outline-none transition-colors duration-150 placeholder:text-white/25 hover:bg-white/[0.03] focus-visible:border-brand/50 focus-visible:bg-white/[0.03]"
                                />
                                <div className="flex flex-wrap items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <ItemMediaStrip
                                      attachments={isPersistedItem(item.id) ? editData?.attachments : []}
                                      itemId={item.id}
                                      requestId={isPersistedItem(item.id) ? editId || undefined : undefined}
                                      canUpload
                                      dark
                                      pendingFiles={isPersistedItem(item.id) ? undefined : item.photos || []}
                                      onPendingChange={
                                        isPersistedItem(item.id)
                                          ? undefined
                                          : (photos) =>
                                              setItems((prev) =>
                                                prev.map((it) => (it.id === item.id ? { ...it, photos } : it)),
                                              )
                                      }
                                      onUploaded={() => {
                                        if (!editId) return;
                                        void queryClient.invalidateQueries({
                                          queryKey: ['procurement', editId],
                                        });
                                      }}
                                    />
                                  </div>
                                  {groupName !== 'GENEL' ? (
                                    <label className="flex shrink-0 items-center gap-2 text-[12px] text-white/40">
                                      <Layers className="size-3.5 text-brand" />
                                      Grup
                                      <Input
                                        value={item.category}
                                        onChange={(e) => updateItem(item.id, 'category', e.target.value)}
                                        placeholder="Grup adı"
                                        aria-label="Grup"
                                        className={cn(cellClass, 'h-8 w-40 text-[12.5px]')}
                                        list={`category-list-${item.id}`}
                                      />
                                      <datalist id={`category-list-${item.id}`}>
                                        {getUniqueCategories().map((cat) => (
                                          <option key={cat} value={cat} />
                                        ))}
                                      </datalist>
                                    </label>
                                  ) : null}
                                </div>

                                {SECONDARY_UNIT_TOGGLE_VISIBLE ? (
                                  <button
                                    type="button"
                                    onClick={() => updateItem(item.id, 'showSecondary', !item.showSecondary)}
                                    className={cn(
                                      'h-8 rounded-[9px] border px-3 text-[12.5px] font-medium transition-colors duration-150',
                                      item.showSecondary
                                        ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                                        : 'border-brand/40 text-brand hover:bg-brand/10',
                                    )}
                                  >
                                    {item.showSecondary ? 'İkincil birimi kaldır' : 'İkincil birim ekle'}
                                  </button>
                                ) : null}
                                {item.showSecondary ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      type="number"
                                      aria-label="İkincil miktar"
                                      value={item.secondaryQuantity}
                                      onChange={(e) => updateItem(item.id, 'secondaryQuantity', e.target.value)}
                                      placeholder="İkincil miktar, örn. 2500"
                                      className={cn(cellClass, 'tabular-nums')}
                                    />
                                    <Input
                                      aria-label="İkincil birim"
                                      value={item.secondaryUnit}
                                      onChange={(e) => updateItem(item.id, 'secondaryUnit', e.target.value)}
                                      placeholder="İkincil birim, örn. mm, kg"
                                      className={cellClass}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}

                          {/* Grubun sonuna ekleme: panodaki kısayol gibi; simge kutusu altınla dolar. */}
                          <button
                            type="button"
                            onClick={() => handleAddItem(groupName === 'GENEL' ? '' : groupName)}
                            className="gold-fade group/add flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none focus-visible:bg-white/[0.03] sm:px-6"
                          >
                            <Plus
                              aria-hidden
                              className="size-[18px] shrink-0 text-brand transition-transform duration-300 group-hover/add:rotate-90"
                            />
                            <span className="text-[13.5px] font-medium text-white/65 transition-colors duration-200 group-hover/add:text-white">
                              {groupName === 'GENEL' ? 'Kalem ekle' : `${groupName} grubuna kalem ekle`}
                            </span>
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </RfqTile>

            {/* ─── Tedarikçiler: seçilenler üstte altın etiket; firmalar panodaki kısayollar gibi ince çizgili ızgarada ─── */}
            {!staffNeedsMahmut ? (
              <RfqTile
                icon={Building2}
                title="Tedarikçiler"
                required
                done={selectedVendors.length > 0}
                meta={selectedVendors.length ? `${selectedVendors.length} seçili` : undefined}
                tour="rfq-vendors"
                flush
              >
                <div className="space-y-4 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-2 @min-[640px]:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                      <Input
                        placeholder="Firma, ne satıyor, şehir ara"
                        aria-label="Firma ara"
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                        className={cn(fieldClass, 'pl-10')}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => vendorPickerRef.current?.open()}
                        className={cn(btnWave, 'flex-1 border-brand/45 text-brand @min-[640px]:flex-none')}
                      >
                        <Table className="size-4" />
                        Tablodan seç
                      </button>
                      <button type="button" onClick={() => setQuickVendorOpen(true)} className={btnWave}>
                        <Plus className="size-4" />
                        Yeni firma
                      </button>
                    </div>
                  </div>

                  {errors.vendors ? <FieldError>{errors.vendors}</FieldError> : null}

                  {selectedVendors.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedVendors.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleVendor(id)}
                          title="Seçimden çıkar"
                          className="press group/chip flex max-w-full items-center gap-1.5 rounded-full bg-brand py-1 pl-3 pr-1.5 text-[12.5px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-[#e4c43c]"
                        >
                          <span className="truncate">{vendorNameById.get(id) || 'Firma'}</span>
                          <span className="flex size-5 items-center justify-center rounded-full bg-black/10 transition-colors group-hover/chip:bg-black/20">
                            <X className="size-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {vendorsLoading ? (
                  <div className="flex items-center justify-center border-t border-hairline py-12">
                    <Loader2 className="size-5 animate-spin text-white/40" />
                  </div>
                ) : filteredVendors.length === 0 ? (
                  <div className="flex flex-col items-center border-t border-hairline py-14 text-center">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-white/10">
                      <Building2 className="size-5 text-white/35" strokeWidth={1.7} />
                    </div>
                    <p className="text-[14.5px] font-medium text-white">Firma bulunamadı</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2 sm:px-4">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-[12.5px] font-medium text-white/60 transition-colors duration-150 hover:bg-brand/[0.1] hover:text-brand"
                      >
                        <CheckMark checked={allFilteredSelected} />
                        {allFilteredSelected ? 'Seçimi kaldır' : `Tümünü seç (${filteredVendors.length})`}
                      </button>
                      <span className="pr-2 text-[12px] tabular-nums text-white/35">{filteredVendors.length} firma</span>
                    </div>
                    {/* Hücreler sağ ve alt çizgiyle ayrılır; taşan son çizgiler kırpılır (yarım satırda boşluk kalmaz). */}
                    <div className="max-h-[560px] overflow-y-auto overflow-x-hidden border-t border-hairline">
                      <div className="-mb-px -mr-px grid grid-cols-1 @min-[560px]:grid-cols-2 @min-[980px]:grid-cols-3">
                        {filteredVendors.map((vendor: Vendor) => {
                          const isSelected = selectedVendors.includes(vendor.id);
                          // Yetkili kişilerin adresleri de aynı bildirimi alıyor
                          const extraRecipients = (vendor.contacts || []).filter(
                            (c) => c.email && c.email.toLowerCase() !== (vendor.contactEmail || '').toLowerCase(),
                          ).length;
                          return (
                            <div
                              key={vendor.id}
                              role="checkbox"
                              aria-checked={isSelected}
                              tabIndex={0}
                              onClick={() => toggleVendor(vendor.id)}
                              onKeyDown={(e) => {
                                if (e.key === ' ' || e.key === 'Enter') {
                                  e.preventDefault();
                                  toggleVendor(vendor.id);
                                }
                              }}
                              className={cn(
                                // Görünmeyen hücreler dizilmez/çizilmez (yüzlerce firma): menü açılıp kapanınca sayfa hızlı oturur.
                                'gold-fade group/v flex cursor-pointer items-start gap-3.5 border-b border-r border-hairline px-5 py-4 outline-none transition-colors duration-200 [contain-intrinsic-size:auto_92px] [content-visibility:auto] focus-visible:bg-white/[0.04] sm:px-6',
                                isSelected && 'bg-brand/[0.07]',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex size-10 shrink-0 items-center justify-center rounded-[12px] border text-[12.5px] font-semibold transition-[background-color,border-color,color] duration-300',
                                  isSelected
                                    ? 'border-brand bg-brand text-[#141416]'
                                    : 'border-white/[0.08] bg-white/[0.03] text-white/55 group-hover/v:border-brand/50 group-hover/v:text-brand',
                                )}
                              >
                                {isSelected ? (
                                  <Check className="size-[18px]" strokeWidth={2.4} />
                                ) : (
                                  vendorInitials(vendor.name)
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-medium leading-snug text-white">{vendor.name}</p>
                                {(vendor.categories || []).length > 0 ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {(vendor.categories || []).slice(0, 3).map((category) => (
                                      <span
                                        key={category}
                                        className={cn(
                                          'rounded-full px-2 py-0.5 text-[11px]',
                                          isSelected ? 'bg-brand/15 text-brand' : 'bg-white/[0.06] text-white/60',
                                        )}
                                      >
                                        {category}
                                      </span>
                                    ))}
                                    {(vendor.categories || []).length > 3 ? (
                                      <span className="px-1 py-0.5 text-[11px] text-white/35">
                                        +{(vendor.categories || []).length - 3}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                                {vendor.address || vendor.taxId ? (
                                  <p className="mt-1.5 truncate text-[12px] text-white/40">
                                    {vendor.address}
                                    {vendor.address && vendor.taxId ? ' · ' : null}
                                    {vendor.taxId ? <span className="text-white/30">VKN {vendor.taxId}</span> : null}
                                  </p>
                                ) : null}
                                {vendor.contactPhone || vendor.contactEmail || extraRecipients ? (
                                  <p className="mt-0.5 truncate text-[12px] text-white/35">
                                    {vendor.contactPhone ? <span>{maskTrPhoneLoose(vendor.contactPhone)}</span> : null}
                                    {vendor.contactPhone && vendor.contactEmail ? ' · ' : null}
                                    {vendor.contactEmail ? <span>{vendor.contactEmail}</span> : null}
                                    {extraRecipients > 0 ? (
                                      <span className="text-white/30">
                                        {vendor.contactPhone || vendor.contactEmail ? ' · ' : null}+{extraRecipients} adres
                                      </span>
                                    ) : null}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </RfqTile>
            ) : null}
          </div>

          {/* ─── Özet: panodaki "Bekleyenler" kutusu. Sayılar, hazırlık şeridi, eksikler, süre ve gönder. ─── */}
          <aside className="bento-tile relative isolate flex flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card @min-[900px]:sticky @min-[900px]:top-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[240px] bg-[linear-gradient(180deg,rgba(217,182,37,0.1),rgba(217,182,37,0.025)_55%,transparent)]"
            />
            <Windmill className="pointer-events-none absolute -bottom-40 -right-32 -z-10 size-[420px] text-brand opacity-[0.07]" />

            <div className="px-6 pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Özet</h3>
                <span className="text-[12px] tabular-nums text-white/40">
                  {readyCount}/{readiness.length} hazır
                </span>
              </div>
              <div className="mt-6 flex items-end gap-10">
                <div>
                  <CountUp
                    value={filledItemCount}
                    className={cn(
                      'block text-[64px] font-[200] leading-none tracking-[-0.05em] tabular-nums',
                      filledItemCount ? 'text-white' : 'text-white/30',
                    )}
                  />
                  <p className="mt-2 text-[13px] text-white/45">kalem</p>
                </div>
                {!staffNeedsMahmut ? (
                  <div>
                    <CountUp
                      value={selectedVendors.length}
                      className={cn(
                        'block text-[64px] font-[200] leading-none tracking-[-0.05em] tabular-nums',
                        selectedVendors.length ? 'text-white' : 'text-white/30',
                      )}
                    />
                    <p className="mt-2 text-[13px] text-white/45">tedarikçi</p>
                  </div>
                ) : null}
              </div>
              <div className="mt-6 flex h-[5px] gap-[3px]" aria-hidden>
                {readiness.map((r) => (
                  <span
                    key={r.key}
                    className={cn(
                      'h-full flex-1 rounded-full transition-colors duration-500',
                      r.done ? 'bg-brand' : 'bg-white/[0.08]',
                    )}
                  />
                ))}
              </div>
            </div>

            <ul className="mt-6 border-t border-hairline">
              {readiness.map((r) => (
                <li key={r.key} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    onClick={() => goTo(r.target)}
                    className="gold-fade gold-fade-x group/item grid w-full grid-cols-[20px_minmax(0,1fr)_16px] items-start gap-x-3 px-6 py-3.5 text-left outline-none"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-[18px] items-center justify-center rounded-full border transition-colors duration-300',
                        r.done ? 'border-brand bg-brand text-[#141416]' : 'border-white/20',
                      )}
                    >
                      {r.done ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium leading-snug text-white">{r.label}</span>
                      <span className={cn('mt-0.5 block truncate text-[12.5px]', r.done ? 'text-white/45' : 'text-white/30')}>
                        {r.detail}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 -translate-x-1 text-white/20 transition-[transform,color] duration-300 ease-out group-hover/item:translate-x-0 group-hover/item:text-brand" />
                  </button>
                </li>
              ))}
            </ul>

            {!staffNeedsMahmut ? (
              <div className="border-t border-hairline px-6 py-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-white/75">Teklif toplama süresi</p>
                  <span className="text-[12px] text-white/45">
                    Bitiş <span className="tabular-nums text-white/80">{formatTrDate(deadlineIso)}</span>
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div role="group" aria-label="Hazır süreler" className={cn(segmentWrap, 'min-w-0 flex-1')}>
                    {QUOTE_DAY_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={quoteCollectDays === preset}
                        onClick={() => setQuoteCollectDays(preset)}
                        className={cn(segmentItem, 'px-2', quoteCollectDays === preset ? segmentOn : segmentOff)}
                      >
                        {preset} gün
                      </button>
                    ))}
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      aria-label="Özel gün sayısı"
                      value={quoteCollectDays}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!e.target.value) {
                          setQuoteCollectDays(15);
                          return;
                        }
                        if (Number.isNaN(n)) return;
                        setQuoteCollectDays(Math.min(120, Math.max(1, Math.round(n))));
                      }}
                      className={cn(fieldClass, 'w-14 px-1.5 text-center tabular-nums')}
                    />
                    <span className="text-[13px] text-white/45">gün</span>
                  </label>
                </div>
              </div>
            ) : null}

            {/* Geniş ekranda eylemler burada; dar ekranda altta yüzen çubukta. */}
            <div data-tour="rfq-actions" className="hidden flex-col gap-2 border-t border-hairline p-4 @min-[900px]:flex">
              {renderActions(true)}
            </div>
          </aside>
        </div>

        {/* Dar ekranda eylemler: uzun listede de görünür kalsın diye altta yüzer (içerik altından kayar). */}
        <div className="sticky bottom-3 z-20 mt-4 @min-[900px]:hidden" data-tour="rfq-actions">
          <div className="flex flex-col gap-2 rounded-[20px] border border-white/[0.08] bg-[#141416]/85 p-2 shadow-[var(--shadow-float)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:pl-5">
            <p className="hidden text-[13px] text-white/50 sm:block">
              <span className="tabular-nums text-white">{filledItemCount}</span> kalem
              {!staffNeedsMahmut ? (
                <>
                  {' · '}
                  <span className="tabular-nums text-white">{selectedVendors.length}</span> tedarikçi
                </>
              ) : null}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse">{renderActions(false)}</div>
          </div>
        </div>
      </div>
      {/* Yeni Kategori Diyaloğu */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-white/5 shadow-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-6 h-6" /> Yeni Grup Tanımla
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase text-muted-foreground font-semibold tracking-widest">
                Grup / Kategori Adı
              </Label>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Örn: Motor Fabrikası Alımları..."
                className="bg-black/20 border-white/10 h-12 text-sm font-bold placeholder:font-normal"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground font-medium opacity-60">
                * Bu isimle bir grup oluşturulacak ve analiz raporunda ürünler bu başlık altında
                toplanacaktır.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-3 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setIsCategoryDialogOpen(false)}
              className="font-bold text-sm"
            >
              Vazgeç
            </Button>
            <Button
              onClick={handleCreateCategory}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Grup Oluştur ve Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onay Diyaloğu (Confirm Modal) */}
      <Dialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="sm:max-w-[400px] bg-card border-white/5 shadow-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-6 h-6" /> {confirmDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <p className="text-sm font-bold text-muted-foreground leading-relaxed">
              {confirmDialog.description}
            </p>
          </div>
          <DialogFooter className="gap-3 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
              className="font-bold text-sm h-11 flex-1"
            >
              Vazgeç
            </Button>
            <Button
              onClick={() => {
                confirmDialog.onAction();
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              }}
              className="h-10 flex-1 rounded-md bg-destructive px-4 text-sm font-medium text-white"
            >
              Evet, Onaylıyorum
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni Birim Diyaloğu */}
      <Dialog open={isNewUnitDialogOpen} onOpenChange={setIsNewUnitDialogOpen}>
        <DialogContent className="bg-[#1c1c1c] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-[#D9B625]">Yeni Birim Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/70">Birim Adı</Label>
              <Input
                placeholder="Örn: Paket, Koli, Rulo..."
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newUnitName.trim()) {
                    handleCreateUnit();
                  }
                }}
                className="bg-black/20 border-white/10 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewUnitDialogOpen(false)} className="border-white/10 text-white hover:bg-white/5">İptal</Button>
            <Button 
              disabled={!newUnitName.trim()} 
              onClick={handleCreateUnit}
              className="bg-[#D9B625] text-black hover:bg-[#D9B625]/90"
            >
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
