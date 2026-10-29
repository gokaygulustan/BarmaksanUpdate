'use client';

import { use, useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementApi, notificationCcContactsApi } from '@/lib/api';
import { HandoverPanel, QuickActionRow } from '@/components/procurement/HandoverPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  CheckCircle2,
  Clock,
  Loader2,
  FileEdit,
  X,
  History,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Mail,
  Eye,
  Send,
  User,
  AlertCircle,
  Building2,
  Layers,
  ChevronDown,
  FileDown,
  Phone,
  AlertTriangle,
  MapPin,
  Pencil,
} from 'lucide-react';
import { DetailSkeleton } from '@/components/page/Skeleton';
import { cn } from '@/lib/utils';
import { statusTone } from '@/components/StatusGlyph';
import { SmokeText } from '@/components/SmokeText';
import { SelectMenu } from '@/components/page/Page';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  showsProductionItemMeta,
  canCreateStandaloneRfq,
  canSendDecisionInvite,
  isYedekParcaModule,
  isSatinAlmaPurchasing,
  usesPurchasingQuoteForm,
  projectLabel,
} from '@/lib/access';
import { DecisionInviteDialog } from '@/components/analysis/DecisionInviteDialog';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { sortRequestItems } from '@/lib/request-item-order';
import { ItemMediaStrip, ProcurementMediaPanel } from '@/components/ProcurementMedia';
import { OrderDossierPreview } from '@/components/OrderDossierPreview';
import { InvoicePanel } from '@/components/InvoicePanel';
import { VendorActivityLogs } from '@/components/VendorActivityLogs';
import {
  MarketOfferDialog,
  MarketOfferItemButton,
  MarketQuoteDeleteButton,
  VendorQuoteDeleteButton,
  MarketProofLinks,
  OnlineQuoteBadge,
  MARKET_EDITABLE_STATUSES,
} from '@/components/MarketOfferPanel';
import { pageTitle } from '@/lib/brand';
import {
  ExecutiveCopyRecipients,
  splitExecutiveRecipients,
  type ExecutiveCopyContact,
} from '@/components/ExecutiveCopyRecipients';
import { acceptPercentInput, assignmentChfTry, assignmentEurTry, assignmentUsdTry, quoteLineTotal } from '@/lib/quoteMath';
import { currencySymbol, emptyCurrencyBag, hasFxSums } from '@/lib/currency';
import { PROCUREMENT_STATUS_LABELS } from '@/lib/procurementStatus';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MarketOfferUrl({ url }: { url?: string | null }) {
  const href = String(url || '').trim();
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-[11px] font-medium text-sky-300 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      {href}
    </a>
  );
}

const emailReSimple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /procurement/:id/approval-summary — onay kararına esas tutar ve parasal limit durumu. */
type ApprovalSummary = {
  /** ITEM_PICKS = kalem bazında seçilen teklifler; HIGHEST_VENDOR_TOTAL = seçim yokken en yüksek cari toplamı. */
  basis: 'ITEM_PICKS' | 'HIGHEST_VENDOR_TOTAL' | 'NO_QUOTES';
  basisVendorName: string | null;
  totalTRY: number;
  byCurrency: Record<string, number>;
  pickedItemCount: number;
  pickedItemsWithoutPrice: number;
  totalItemCount: number;
  limitAmount: number;
  limitIsActive: boolean;
  requiresExecutiveApproval: boolean;
  exceedsLimitBy: number;
  rates: Record<string, number>;
  rateSource: string;
  rateFetchedAt?: string | Date | null;
  rateFrozenAt?: string | Date | null;
  ratesFrozen?: boolean;
  ratesLegacyUnlocked?: boolean;
  vendors: {
    vendorId: string;
    vendorName: string;
    totalTRY: number;
    byCurrency: Record<string, number>;
    overallDiscountRate?: number;
    usdRateFixed?: boolean;
    usdRate?: number | null;
    eurRate?: number | null;
    chfRate?: number | null;
    quoteNote?: string | null;
    quotedItemCount?: number;
    /** Fiyat verilmeyen kalemler en uygun fiyatla tamamlandığında (TL). */
    completedTotalTRY?: number;
    missingItemCount?: number;
    exceedsLimit?: boolean;
  }[];
};

/** Onay geçmişi adımlarının ekran karşılıkları. */
const APPROVAL_ACTION_MAP: Record<string, { label: string; tone: string }> = {
  SUBMIT_TO_MANAGER: { label: 'Yetkili onayına sunuldu', tone: 'text-amber-400' },
  WITHDRAW_FROM_MANAGER: { label: 'Yetkili onayından geri çekildi', tone: 'text-emerald-400' },
  MANAGER_APPROVE: { label: 'Yetkili onayladı', tone: 'text-amber-400' },
  MANAGER_APPROVE_ESCALATED: { label: 'Üst yönetime yükseltildi', tone: 'text-emerald-400' },
  ADMIN_APPROVE: { label: 'Üst yönetim onayladı', tone: 'text-amber-400' },
  ADMIN_REJECT: { label: 'Üst yönetim onaylamadı', tone: 'text-red-400' },
  REJECT_TO_STAFF: { label: 'Personele iade edildi', tone: 'text-red-400' },
  ROUTE_TO_STAFF: { label: 'Personele yönlendirildi', tone: 'text-purple-400' },
  COMPLETE: { label: 'Satın alma tamamlandı', tone: 'text-amber-400' },
  INVOICE_UPLOADED: { label: 'Fatura yüklendi', tone: 'text-amber-400' },
  INVOICE_DELETED: { label: 'Fatura silindi', tone: 'text-red-400' },
  VENDOR_APPROVAL_NOTIFIED: { label: 'Tedarikçiye onay bildirildi', tone: 'text-emerald-400' },
  DECISION_INVITE_SENT: { label: 'Üst yönetime karar daveti', tone: 'text-sky-300' },
  DECISION_INVITE_RESENT: { label: 'Karar daveti yeniden gönderildi', tone: 'text-sky-300' },
  DECISION_INVITE_REVOKED: { label: 'Karar daveti geri alındı', tone: 'text-muted-foreground' },
  EXECUTIVE_VENDOR_PICK: { label: 'Üst yönetim tedarikçi seçti', tone: 'text-amber-400' },
  EXECUTIVE_VENDOR_PICK_REJECT: { label: 'Üst yönetim kararı iade etti', tone: 'text-red-400' },
  EXECUTIVE_INBOX_RECALL: { label: 'Üst yönetim kuyruğundan çekildi', tone: 'text-emerald-400' },
  VENDOR_QUOTE_REMOVED: { label: 'Tedarikçi teklifi silindi', tone: 'text-red-400' },
  MARKET_QUOTE_REMOVED: { label: 'Online fiyat silindi', tone: 'text-red-400' },
  ITEM_RENAMED: { label: 'Kalem adı değişti', tone: 'text-sky-300' },
  HANDOVER_REQUESTED: { label: 'Devir isteği gönderildi', tone: 'text-sky-300' },
  HANDOVER_ACCEPTED: { label: 'Devir isteği kabul edildi', tone: 'text-amber-400' },
  HANDOVER_REJECTED: { label: 'Devir isteği reddedildi', tone: 'text-red-400' },
};

function vendorHasNotificationEmails(v: {
  contactEmail?: string | null;
  extraContactEmails?: string[] | null;
} | null | undefined) {
  const main = v?.contactEmail?.trim();
  if (main && emailReSimple.test(main)) return true;
  for (const e of v?.extraContactEmails || []) {
    if (typeof e === 'string' && emailReSimple.test(e.trim())) return true;
  }
  return false;
}

/** Bilgi şeridinin bir sütunu: soluk etiket, altında değer. Komşusundan yalnızca ince bir çizgiyle ayrılır. */
function Fact({
  label,
  tour,
  className,
  children,
}: {
  label: string;
  tour?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-tour={tour} className={cn('min-w-0 sm:px-6 sm:first:pl-0', className)}>
      <dt className="text-[12px] text-white/40">{label}</dt>
      <dd className="mt-1 truncate text-[14px] text-white">{children}</dd>
    </div>
  );
}

export default function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const STATUS_MAP: Record<string, string> = PROCUREMENT_STATUS_LABELS;
  const { user } = useAuthStore();

  const [quotedItems, setQuotedItems] = useState<any>({}); // { [itemId]: { price: string, notes: string, currency: string, discountRate: string } }
  const [overallDiscountRate, setOverallDiscountRate] = useState<string>('');
  const [selectedViewVendorId, setSelectedViewVendorId] = useState<string>('all');
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [smsSendTarget, setSmsSendTarget] = useState<{
    vendorId: string;
    vendorName: string;
    phone: string | null;
  } | null>(null);
  const [smsPhoneInput, setSmsPhoneInput] = useState('');
  /** İnceleme sayfasında kategori grupları varsayılan kapalı; true = açık */
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [editListWarningOpen, setEditListWarningOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);
  const [submitApprovalOpen, setSubmitApprovalOpen] = useState(false);
  const [submitApprovalNote, setSubmitApprovalNote] = useState('');
  const [submitVendorShipping, setSubmitVendorShipping] = useState<Record<string, string>>({});
  const [withdrawApprovalOpen, setWithdrawApprovalOpen] = useState(false);
  const [decisionModal, setDecisionModal] = useState<'approve' | 'reject' | 'admin-approve' | null>(
    null,
  );
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionVendorId, setDecisionVendorId] = useState<string>('');
  const [escalateOnly, setEscalateOnly] = useState(false);
  const [decisionExtraEmails, setDecisionExtraEmails] = useState<string[]>([]);
  const [execResendOpen, setExecResendOpen] = useState(false);
  const [execResendEmails, setExecResendEmails] = useState<string[]>([]);
  const [routeStaffDialogOpen, setRouteStaffDialogOpen] = useState(false);
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [warehouseData, setWarehouseData] = useState<any>(null);
  const [warehouseMailOpen, setWarehouseMailOpen] = useState(false);
  const [warehouseRecipientIds, setWarehouseRecipientIds] = useState<string[]>([]);
  const [warehouseMailNote, setWarehouseMailNote] = useState('');
  const [marketOfferOpen, setMarketOfferOpen] = useState(false);
  const [marketOfferItemId, setMarketOfferItemId] = useState<string | null>(null);
  const [completePurchaseOpen, setCompletePurchaseOpen] = useState(false);
  const [completeSendWarehouseMail, setCompleteSendWarehouseMail] = useState(false);
  const [completeWarehouseNote, setCompleteWarehouseNote] = useState('');
  const [completeDispatch, setCompleteDispatch] = useState<any>(null);
  const [completeDispatchLoading, setCompleteDispatchLoading] = useState(false);
  const [completeOrderConfirmed, setCompleteOrderConfirmed] = useState(false);
  const [renameItemId, setRenameItemId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  /** Kayıtlı depo sorumluları — listenin e-posta ile gönderileceği alıcılar. */
  const { data: warehouseContacts = [], isLoading: warehouseContactsLoading } = useQuery({
    queryKey: ['warehouse-contacts'],
    queryFn: async () => {
      const { data } = await procurementApi.getWarehouseContacts();
      return (data || []) as Array<{ id: string; name: string; email: string }>;
    },
    enabled: warehouseMailOpen || completePurchaseOpen,
  });

  const canSeeApprovalFlow = user?.role === 'PURCHASING' || user?.role === 'ADMIN';

  /** Onay kararına esas tutar + geçerli parasal limit (döviz kalemleri TL'ye çevrilmiş halde). */
  const { data: approval } = useQuery<ApprovalSummary | null>({
    queryKey: ['procurement-approval-summary', id],
    queryFn: async () => {
      const { data } = await procurementApi.getApprovalSummary(id);
      return data as ApprovalSummary;
    },
    enabled: canSeeApprovalFlow,
    refetchInterval: (q) => (q.state.data?.ratesFrozen ? false : 5 * 60 * 1000),
  });

  const decisionVendor = (approval?.vendors || []).find((v) => v.vendorId === decisionVendorId);
  /** Seçilen carinin tamamlanmış toplamı limiti aşıyorsa onay üst yönetime gider. */
  const approveEscalates = decisionVendor
    ? Boolean(decisionVendor.exceedsLimit)
    : Boolean(approval?.requiresExecutiveApproval);

  const escalateCopyOpen = decisionModal === 'approve' && approveEscalates;

  const { data: executiveCcContacts = [], isPending: executiveCcLoading } = useQuery({
    queryKey: ['notification-cc-contacts'],
    queryFn: async () => {
      const { data } = await notificationCcContactsApi.getAll();
      return data as ExecutiveCopyContact[];
    },
    enabled: (escalateCopyOpen || execResendOpen) && canSeeApprovalFlow,
  });

  const { data: approvalLimit } = useQuery({
    queryKey: ['approval-limit'],
    queryFn: async () => {
      const { data } = await procurementApi.getApprovalLimit();
      return data as { executiveEmail?: string | null };
    },
    enabled: (escalateCopyOpen || execResendOpen) && canSeeApprovalFlow,
  });

  const canonicalExecutiveEmail = (approvalLimit?.executiveEmail || '').trim().toLowerCase();
  const canonicalExecutiveContact: ExecutiveCopyContact | null = canonicalExecutiveEmail
    ? {
        id: 'canonical-executive',
        name:
          executiveCcContacts.find(
            (c) => c.email.trim().toLowerCase() === canonicalExecutiveEmail,
          )?.name || 'Üst yönetim',
        email: approvalLimit?.executiveEmail?.trim() || canonicalExecutiveEmail,
      }
    : null;

  const escalateRecipients = splitExecutiveRecipients(
    decisionExtraEmails,
    canonicalExecutiveEmail,
  );
  const execResendRecipients = splitExecutiveRecipients(
    execResendEmails,
    canonicalExecutiveEmail,
  );
  const escalateSeededRef = useRef(false);
  const execResendSeededRef = useRef(false);

  useEffect(() => {
    if (!escalateCopyOpen) {
      escalateSeededRef.current = false;
      return;
    }
    if (escalateSeededRef.current || !canonicalExecutiveEmail) return;
    escalateSeededRef.current = true;
    setDecisionExtraEmails((prev) => (prev.length ? prev : [canonicalExecutiveEmail]));
  }, [escalateCopyOpen, canonicalExecutiveEmail]);

  useEffect(() => {
    if (!execResendOpen) {
      execResendSeededRef.current = false;
      return;
    }
    if (execResendSeededRef.current || !canonicalExecutiveEmail) return;
    execResendSeededRef.current = true;
    setExecResendEmails((prev) => (prev.length ? prev : [canonicalExecutiveEmail]));
  }, [execResendOpen, canonicalExecutiveEmail]);

  /** Onay akışı uçları durum/rol ihlallerini 403-409 ile döndürür; mesaj kullanıcıya aynen gösterilir. */
  const approvalErrorHandler = (fallback: string) => (err: any) =>
    toast.error(err?.response?.data?.message || fallback);

  const refreshApprovalState = () => {
    queryClient.invalidateQueries({ queryKey: ['procurement', id] });
    queryClient.invalidateQueries({ queryKey: ['procurement-approval-summary', id] });
  };

  const submitForApprovalMutation = useMutation({
    mutationFn: (payload: {
      note?: string;
      vendorShippingCosts?: Array<{ vendorId: string; costTRY: number }>;
    }) => procurementApi.submitForApproval(id, payload.note, payload.vendorShippingCosts),
    onSuccess: () => {
      setSubmitApprovalOpen(false);
      setSubmitApprovalNote('');
      setSubmitVendorShipping({});
      refreshApprovalState();
      toast.success('Talep Satın Alma Birimi Yetkilisinin onayına sunuldu.');
    },
    onError: approvalErrorHandler('Talep onaya sunulurken bir hata oluştu.'),
  });

  const withdrawFromApprovalMutation = useMutation({
    mutationFn: () => procurementApi.withdrawFromManagerApproval(id),
    onSuccess: () => {
      setWithdrawApprovalOpen(false);
      refreshApprovalState();
      toast.success('Yetkiliye gönderim geri alındı. Tedarikçiler yeniden fiyat girebilir.');
    },
    onError: approvalErrorHandler('Gönderim geri alınırken bir hata oluştu.'),
  });

  const managerApproveMutation = useMutation({
    mutationFn: ({
      note,
      approvedVendorId,
      extraEmails,
      includeCanonical,
      vendorShippingCosts,
    }: {
      note?: string;
      approvedVendorId?: string;
      extraEmails?: string[];
      includeCanonical?: boolean;
      vendorShippingCosts?: Array<{ vendorId: string; costTRY: number }>;
    }) =>
      procurementApi.managerApprove(
        id,
        note,
        approvedVendorId,
        extraEmails,
        includeCanonical,
        vendorShippingCosts,
      ),
    onSuccess: (res: any) => {
      setDecisionModal(null);
      setDecisionNote('');
      setDecisionVendorId('');
      setDecisionExtraEmails([]);
      setSubmitVendorShipping({});
      refreshApprovalState();
      if (res?.data?.isEscalated || res?.data?.status === 'PENDING_ADMIN_APPROVAL') {
        toast.warning(
          res?.data?.message ||
            'Kayıt üst yönetim onayına iletildi.',
          { duration: 9000 }
        );
      } else {
        toast.success(res?.data?.message || 'Teklifler onaylandı.');
      }
    },
    onError: approvalErrorHandler('Onay işlemi sırasında bir hata oluştu.'),
  });

  const resendExecutiveInboxMutation = useMutation({
    mutationFn: () =>
      procurementApi.resendExecutiveInbox(id, {
        extraEmails: execResendRecipients.extraEmails,
        includeCanonical: execResendRecipients.includeCanonical,
      }),
    onSuccess: () => {
      setExecResendOpen(false);
      setExecResendEmails([]);
      toast.success('E-posta tekrar gönderildi. Eski bağlantının süresi dolduysa yeni link geçerlidir.');
    },
    onError: approvalErrorHandler('Üst yönetim e-postası tekrar gönderilemedi.'),
  });

  const adminApproveMutation = useMutation({
    mutationFn: (note?: string) => procurementApi.adminApprove(id, note),
    onSuccess: () => {
      setDecisionModal(null);
      setDecisionNote('');
      refreshApprovalState();
      toast.success('Üst yönetim onayı verildi; kayıt satın alma birimine iletildi.');
    },
    onError: approvalErrorHandler('Üst yönetim onayı sırasında bir hata oluştu.'),
  });

  const routeToStaffMutation = useMutation({
    mutationFn: () => procurementApi.routeToStaff(id),
    onSuccess: (res: any) => {
      refreshApprovalState();
      setRouteStaffDialogOpen(false);
      const name = res?.data?.assignedTo?.name;
      toast.success(
        name
          ? `İşlem ${name} adlı personele yönlendirildi.`
          : 'İşlem ilgili Satın Alma Birimi Personeline yönlendirildi.',
      );
    },
    onError: approvalErrorHandler('Yönlendirme sırasında bir hata oluştu.'),
  });

  const completePurchaseMutation = useMutation({
    mutationFn: (body: {
      note?: string;
      sendWarehouseMail?: boolean;
      warehouseUserIds?: string[];
    }) => procurementApi.completePurchase(id, body),
    onSuccess: (res: any) => {
      setCompletePurchaseOpen(false);
      setCompleteSendWarehouseMail(false);
      setCompleteWarehouseNote('');
      setCompleteDispatch(null);
      refreshApprovalState();
      if (res?.data?.warehouseSent) {
        toast.success('Satın alma tamamlandı; depo bildirimi gönderildi.');
      } else {
        toast.success('Satın alma tamamlandı. Fatura yüklemesi bekleniyor.');
      }
    },
    onError: approvalErrorHandler('Satın alma tamamlanırken bir hata oluştu.'),
  });

  const openCompletePurchaseModal = async () => {
    setCompletePurchaseOpen(true);
    setCompleteSendWarehouseMail(false);
    setCompleteWarehouseNote('');
    setCompleteOrderConfirmed(false);
    setWarehouseRecipientIds([]);
    setCompleteDispatchLoading(true);
    try {
      const { data } = await procurementApi.getWarehouseDispatchList(id);
      setCompleteDispatch(data);
    } catch {
      setCompleteDispatch(null);
      toast.error('İrsaliye listesi alınamadı; sayfadaki kalemler kullanılacak.');
    } finally {
      setCompleteDispatchLoading(false);
    }
  };

  const rejectMutation = useMutation({
    mutationFn: (note?: string) => procurementApi.rejectRequest(id, note),
    onSuccess: () => {
      setDecisionModal(null);
      setDecisionNote('');
      refreshApprovalState();
      toast.error('Teklif onaylanmadı ve Satın Alma Birimi Personeline iade edildi.');
    },
    onError: approvalErrorHandler('İade işlemi sırasında bir hata oluştu.'),
  });

  const openDecisionModal = (
    mode: 'approve' | 'reject' | 'admin-approve',
    vendorId?: string,
    options?: { escalateOnly?: boolean },
  ) => {
    setDecisionModal(mode);
    setEscalateOnly(Boolean(options?.escalateOnly));
    setDecisionNote('');
    setDecisionVendorId(vendorId || '');
  };

  const fetchWarehouseDispatch = async () => {
    try {
      const { data } = await procurementApi.getWarehouseDispatchList(id);
      setWarehouseData(data);
      setWarehouseDialogOpen(true);
    } catch {
      toast.error('Depo listesi alınamadı.');
    }
  };

  // Alıcı listesi açıldığında kayıtlı depo sorumlularının tümü varsayılan olarak seçili gelir.
  const warehouseContactIdsKey = warehouseContacts.map((c) => c.id).join(',');
  useEffect(() => {
    if (!warehouseMailOpen) return;
    setWarehouseRecipientIds(warehouseContactIdsKey ? warehouseContactIdsKey.split(',') : []);
  }, [warehouseMailOpen, warehouseContactIdsKey]);

  const sendWarehouseMailMutation = useMutation({
    mutationFn: () => procurementApi.sendWarehouseDispatchList(id, warehouseRecipientIds, warehouseMailNote),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Depo teslim listesi gönderildi.');
      setWarehouseMailOpen(false);
      setWarehouseMailNote('');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Depo listesi e-postası gönderilemedi.');
    },
  });

  // Periyodik yenileme (Polling)
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['procurement', id] });
    }, 15000); // 15 saniyede bir
    return () => clearInterval(interval);
  }, [id, queryClient]);

  useEffect(() => {
    setExpandedCategories({});
  }, [id]);

  const { data: req, isLoading } = useQuery({
    queryKey: ['procurement', id],
    queryFn: async () => {
      const { data } = await procurementApi.getById(id);

      if (data?.status === 'DRAFT') {
        router.push(`/procurement/new?edit=${id}`);
        return data;
      }

      // Initialize quoted items state if status is SENT_TO_VENDOR or VENDOR_QUOTED
      if (data?.status === 'SENT_TO_VENDOR' || data?.status === 'VENDOR_QUOTED') {
        const initialQuotes: any = {};
        data.items.forEach((item: any) => {
          const myQuote = item.quotes?.find((q: any) => q.vendor?.userId === user?.id);
          initialQuotes[item.id] = {
            price: myQuote?.price ? myQuote.price.toString().replace('.', ',') : '',
            notes: myQuote?.notes || '',
            currency: myQuote?.currency || 'TRY',
            discountRate: myQuote?.discountRate ? myQuote.discountRate.toString().replace('.', ',') : '',
          };
        });
        setQuotedItems(initialQuotes);

        const myAssignment = data.assignments?.find((a: any) => a.vendor?.userId === user?.id);
        if (myAssignment && myAssignment.overallDiscountRate) {
          setOverallDiscountRate(myAssignment.overallDiscountRate.toString().replace('.', ','));
        }
      }
      return data;
    },
    refetchInterval: 5000, // Polling every 5 seconds for chat/status updates
  });

  useEffect(() => {
    if (req?.title) document.title = pageTitle('Tedarikçi talebi', req.title);
  }, [req?.title]);

  const orderedItems: any[] = useMemo(
    () => sortRequestItems<any>((req?.items ?? []) as any[]),
    [req?.items]
  );

  const groupedOrderedItems = useMemo((): [string, any[]][] => {
    const groups: Record<string, any[]> = {};
    for (const item of orderedItems) {
      const cat = item.category?.trim() || 'GENEL';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return Object.entries(groups);
  }, [orderedItems]);

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => procurementApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', id] });
      toast.success('Talep durumu güncellendi');
    },
  });

  const renameItemMutation = useMutation({
    mutationFn: ({ itemId, productName }: { itemId: string; productName: string }) =>
      procurementApi.renameItem(id, itemId, productName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', id] });
      setRenameItemId(null);
      toast.success('Kalem adı güncellendi');
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Kalem adı güncellenemedi.');
    },
  });

  const submitQuoteMutation = useMutation({
    mutationFn: (items: any[]) => procurementApi.submitQuote(id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', id] });
      toast.success('Fiyat teklifi tarafımıza başarıyla iletildi!');
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Teklif iletilirken bir hata oluştu.');
    },
  });

  const resendVendorEmailMutation = useMutation({
    mutationFn: (vendorId: string) => procurementApi.resendVendorNotificationEmail(id, vendorId),
    onSuccess: () => {
      toast.success('Tedarikçiye bildirim e-postası yeniden gönderildi.');
      queryClient.invalidateQueries({ queryKey: ['procurement', id] });
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'E-posta gönderilemedi.');
    },
  });

  const resendVendorSmsMutation = useMutation({
    mutationFn: ({ vendorId, phone }: { vendorId: string; phone?: string }) =>
      procurementApi.resendVendorNotificationSms(id, vendorId, phone),
    onSuccess: (res) => {
      const phone =
        typeof res?.data?.phone === 'string' && res.data.phone
          ? res.data.phone
          : smsSendTarget?.phone || smsPhoneInput.trim() || null;
      toast.success(
        phone
          ? `Teklif bağlantısı şu numaraya gönderildi: ${phone}`
          : 'Teklif bağlantısı tedarikçi telefonuna gönderildi.',
      );
      setSmsSendTarget(null);
      setSmsPhoneInput('');
      queryClient.invalidateQueries({ queryKey: ['procurement', id] });
    },
    onError: (err: unknown) => {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'SMS gönderilemedi.');
    },
  });

  const openSmsSendDialog = (assignment: {
    vendorId?: string;
    vendor?: { id?: string; name?: string; contactPhone?: string | null };
  }) => {
    const vendorId = assignment.vendorId || assignment.vendor?.id;
    if (!vendorId) return;
    const phone = String(assignment.vendor?.contactPhone || '').trim() || null;
    setSmsSendTarget({
      vendorId,
      vendorName: assignment.vendor?.name || 'Tedarikçi',
      phone,
    });
    // Admin her zaman numarayı düzenleyebilir; kayıtlı varsa ön doldur.
    setSmsPhoneInput(user?.role === 'ADMIN' ? phone || '' : '');
  };



  if (isLoading) return <DetailSkeleton />;
  if (!req)
    return <div className="p-10 text-center text-muted-foreground">Talep bulunamadı.</div>;

  const isSupplier = user?.role === 'SUPPLIER';
  const isRequester = user?.role === 'PURCHASING' || user?.role === 'ADMIN';
  const handedToSatinAlma =
    req.purchasingResponsibleModuleId === 'SATIN_ALMA' && (req.moduleId || '') !== 'SATIN_ALMA';
  const responsibleModule = req.purchasingResponsibleModuleId || req.moduleId || '';
  const operatesThisModule =
    user?.role === 'ADMIN' ||
    (user?.role === 'PURCHASING' && (user.moduleId || '') === responsibleModule);
  const canRenameItems =
    req.moduleId === 'SATIN_ALMA' &&
    !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(req.status) &&
    (user?.role === 'ADMIN' || isSatinAlmaPurchasing(user));

  /* ── Onay hiyerarşisindeki roller ──
     Personel  : teklifleri toplar, yetkili onayına sunar
     Yetkili   : onaylar; tutar parasal limiti aşıyorsa onay yetkisi yoktur, kayıt üst yönetime yükselir
     Üst yönetim: yalnızca limit aşan kayıtlarda karar verir */
  const isExecutive = user?.role === 'ADMIN';
  const isChannelExecutive = Boolean(user?.role === 'ADMIN' || user?.isExecutive);
  const isUnitManager = user?.subRole === 'MANAGER' || isExecutive;

  /** Parasal limite tabi onay hiyerarşisi yalnızca satın alma modülünde işler. */
  const isProcurementApprovalFlow = req.moduleId === 'SATIN_ALMA' || handedToSatinAlma;
  const showProductionMeta = showsProductionItemMeta(req.moduleId);
  /** Yedek parça fiyat onaylayamaz; teklifler yalnızca üst yönetim kararına gider. */
  const isSparePart = isYedekParcaModule(req.moduleId);
  const canCancelProductionOrder =
    operatesThisModule &&
    isUnitManager && req.status === 'VENDOR_QUOTED' && !isProcurementApprovalFlow && !isSparePart;

  const canSubmitForApproval =
    isProcurementApprovalFlow &&
    isRequester &&
    !isUnitManager &&
    (req.status === 'VENDOR_QUOTED' ||
      req.status === 'SENT_TO_VENDOR' ||
      (handedToSatinAlma && (req.status === 'VENDOR_APPROVED' || req.status === 'IN_PRODUCTION')));
  const canWithdrawFromApproval =
    isProcurementApprovalFlow &&
    req.status === 'PENDING_MANAGER_APPROVAL' &&
    (user?.role === 'ADMIN' || (isRequester && user?.subRole !== 'MANAGER'));
  /** Yetkili, personelin “yetkiliye sun” adımını beklemeden teklif gelmiş kaydı onaylayabilir. */
  const canManagerDecide =
    isProcurementApprovalFlow &&
    isUnitManager &&
    (req.status === 'PENDING_MANAGER_APPROVAL' ||
      req.status === 'VENDOR_QUOTED' ||
      (handedToSatinAlma && (req.status === 'VENDOR_APPROVED' || req.status === 'IN_PRODUCTION')));
  const anyQuotedUnderLimit = (approval?.vendors || []).some(
    (v) => Number(v.quotedItemCount) > 0 && !v.exceedsLimit,
  );
  const showManagerInboxAction =
    canManagerDecide &&
    (!approval || anyQuotedUnderLimit || !approval.requiresExecutiveApproval);
  const showExecutiveSendAction =
    canManagerDecide && Boolean(approval?.requiresExecutiveApproval);
  const canExecutiveDecide = isExecutive && req.status === 'PENDING_ADMIN_APPROVAL';
  const canResendExecutiveInbox =
    isProcurementApprovalFlow && isUnitManager && req.status === 'PENDING_ADMIN_APPROVAL';
  /** Depo listesi yalnızca onay tamamlandıktan sonraki durumlarda üretilebilir. */
  const isApprovedForWarehouse = ['APPROVED_FOR_PURCHASE', 'VENDOR_APPROVED', 'IN_PRODUCTION', 'COMPLETED'].includes(
    req.status
  );
  const hasRoutedToStaff = ((req.approvalHistories as any[]) || []).some(
    (h) => h.action === 'ROUTE_TO_STAFF',
  );
  const latestExecutiveAction = [...((req.approvalHistories as any[]) || [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .find((row) =>
      ['EXECUTIVE_VENDOR_PICK', 'ADMIN_APPROVE', 'EXECUTIVE_VENDOR_PICK_REJECT', 'ADMIN_REJECT'].includes(row.action),
    )?.action;
  const hasLiveExecutiveApproval =
    latestExecutiveAction === 'EXECUTIVE_VENDOR_PICK' || latestExecutiveAction === 'ADMIN_APPROVE';
  /** Önce personele yönlendir; satın alma hattında tamamla ancak yönlendirmeden sonra. */
  const canRouteToStaff =
    isProcurementApprovalFlow &&
    operatesThisModule &&
    isUnitManager &&
    (req.status === 'RETURNED_TO_MANAGER' ||
      (req.status === 'APPROVED_FOR_PURCHASE' && !hasRoutedToStaff));
  const executiveDecision = (req as { executiveDecision?: { state?: string; reason?: string } })
    .executiveDecision;
  const decisionInvalid = executiveDecision?.state === 'invalid';
  const canCompleteOwnDepartment =
    operatesThisModule &&
    !isProcurementApprovalFlow &&
    hasLiveExecutiveApproval &&
    !decisionInvalid &&
    (isSparePart
      ? req.status === 'VENDOR_APPROVED' || req.status === 'IN_PRODUCTION'
      : req.moduleId === 'URETIM_PLANLAMA' && req.status === 'APPROVED_FOR_PURCHASE');
  const canCompletePurchase =
    (isProcurementApprovalFlow &&
      operatesThisModule &&
      req.status === 'APPROVED_FOR_PURCHASE' &&
      hasRoutedToStaff) ||
    canCompleteOwnDepartment;
  const canOpenOrderDossier =
    isRequester &&
    [
      'PENDING_MANAGER_APPROVAL',
      'PENDING_ADMIN_APPROVAL',
      'APPROVED_FOR_PURCHASE',
      'RETURNED_TO_MANAGER',
      'VENDOR_APPROVED',
      'IN_PRODUCTION',
      'COMPLETED',
    ].includes(req.status);
  const awaitingExecutive = req.status === 'PENDING_ADMIN_APPROVAL';
  const quoteLockedByDecision = !!(req as { quoteLockedByDecisionInvite?: boolean }).quoteLockedByDecisionInvite;
  const canEditMarket =
    operatesThisModule && isRequester && MARKET_EDITABLE_STATUSES.has(req.status);
  const canDeleteQuotes = canEditMarket && !quoteLockedByDecision;

  const assignedVendors = req.assignments?.map((a: any) => a.vendor) || [];
  const vendorNames = assignedVendors.map((v: any) => v.name).join(', ');
  const shippingExcludedVendors: Array<{ vendorId: string; name: string; city: string | null }> = (
    req.assignments || []
  )
    .filter((a: any) => a.isShippingIncluded === false)
    .map((a: any) => ({
      vendorId: String(a.vendorId || ''),
      name: String(a.vendor?.name || 'Tedarikçi'),
      city: String(a.vendor?.city || '').trim() || null,
    }))
    .filter((v: { vendorId: string }) => v.vendorId);
  const needsVendorShipping = shippingExcludedVendors.length > 0;

  const hasAnySupplierQuote = orderedItems.some((it: any) =>
    (it.quotes || []).some((q: any) => !q.isMarket)
  );
  const canRenewInvalidDecision =
    decisionInvalid &&
    canSendDecisionInvite(user, req.moduleId) &&
    !handedToSatinAlma &&
    hasAnySupplierQuote &&
    ['APPROVED_FOR_PURCHASE', 'VENDOR_APPROVED', 'IN_PRODUCTION'].includes(req.status);
  const canOfferDecisionInvite =
    (canSendDecisionInvite(user, req.moduleId) &&
      (req.status === 'VENDOR_QUOTED' || req.status === 'SENT_TO_VENDOR') &&
      hasAnySupplierQuote) ||
    canRenewInvalidDecision;

  /** Yetkili / karar sürecinde seçilen sipariş carileri (kalem seçimleri). */
  const selectedOrderVendors = (() => {
    const map = new Map<string, string>();
    for (const p of (req as any).itemVendorPicks || []) {
      const vid = p?.chosenVendorId;
      if (!vid) continue;
      const name =
        p.vendor?.name ||
        req.assignments?.find((a: any) => a.vendorId === vid)?.vendor?.name ||
        (req.items || [])
          .flatMap((it: any) => it.quotes || [])
          .find((q: any) => q.vendorId === vid)?.vendor?.name ||
        (String(vid).startsWith('mkt_') ? 'Online' : 'Tedarikçi');
      map.set(vid, name);
    }
    // Eski kayıtlarda pick yoksa ve tek fiyat veren cari varsa onu sipariş carisi say.
    if (
      map.size === 0 &&
      ['APPROVED_FOR_PURCHASE', 'VENDOR_APPROVED', 'IN_PRODUCTION', 'COMPLETED'].includes(req.status)
    ) {
      const quotedIds = new Set<string>();
      for (const item of req.items || []) {
        for (const q of item.quotes || []) {
          if (q.price !== null && q.price !== undefined) quotedIds.add(q.vendorId);
        }
      }
      if (quotedIds.size === 1) {
        const onlyId = [...quotedIds][0];
        const name =
          req.assignments?.find((a: any) => a.vendorId === onlyId)?.vendor?.name || 'Tedarikçi';
        map.set(onlyId, name);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  })();
  const selectedOrderVendorIds = new Set(selectedOrderVendors.map((v) => v.id));
  const showSelectedOrderVendors =
    selectedOrderVendors.length > 0 &&
    [
      'PENDING_MANAGER_APPROVAL',
      'PENDING_ADMIN_APPROVAL',
      'APPROVED_FOR_PURCHASE',
      'RETURNED_TO_MANAGER',
      'VENDOR_APPROVED',
      'IN_PRODUCTION',
      'COMPLETED',
    ].includes(req.status);

  /** Tamamlama modalı için irsaliye satırları (API + sayfa yedeği). */
  const completeDispatchItems = (() => {
    const pickByItem = new Map(
      ((req as any).itemVendorPicks || []).map((p: any) => [p.itemId, p]),
    );
    const assignmentByVendor = new Map<string, any>(
      (req.assignments || []).map((a: any) => [a.vendorId as string, a]),
    );
    const formatCommercial = (assignment: any) => {
      const isVatIncluded = assignment?.isVatIncluded ?? true;
      const isShippingIncluded = assignment?.isShippingIncluded ?? true;
      const hasMaturity = assignment?.hasMaturity ?? false;
      const vatRate = assignment?.vatRate ?? null;
      const maturityDays = assignment?.maturityDays ?? null;
      return {
        vatLabel:
          isVatIncluded === true
            ? 'Dahil'
            : vatRate != null
              ? `Hariç (%${vatRate})`
              : 'Hariç',
        maturityLabel:
          hasMaturity === true
            ? maturityDays != null
              ? `${maturityDays} gün`
              : 'Evet'
            : 'Hayır',
        shippingLabel: isShippingIncluded === true ? 'Dahil' : 'Hariç',
      };
    };

    const buildLocalRow = (item: any) => {
      const pick = pickByItem.get(item.id) || item.vendorPick;
      let vendorName = pick?.vendor?.name || null;
      let vendorId = pick?.chosenVendorId || pick?.vendor?.id || null;
      const quoted = (item.quotes || []).filter(
        (q: any) => q.price !== null && q.price !== undefined,
      );
      if (!vendorId) {
        if (quoted.length === 1) {
          vendorId = quoted[0].vendorId;
          vendorName = quoted[0].vendor?.name || vendorName;
        } else if (selectedOrderVendors.length === 1) {
          vendorId = selectedOrderVendors[0].id;
          vendorName = selectedOrderVendors[0].name;
        }
      }
      if (!vendorName && vendorId) {
        vendorName =
          req.assignments?.find((a: any) => a.vendorId === vendorId)?.vendor?.name || null;
      }

      let quote = vendorId ? quoted.find((q: any) => q.vendorId === vendorId) : null;
      if (!quote && quoted.length === 1) quote = quoted[0];

      const assignment = vendorId ? assignmentByVendor.get(vendorId) : null;
      const commercial = formatCommercial(assignment);
      const price = quote?.price != null ? Number(quote.price) : null;
      const currency = quote?.currency || 'TRY';
      const discountRate = quote?.discountRate != null ? Number(quote.discountRate) : 0;
      const overallDiscount = Number(assignment?.overallDiscountRate) || 0;
      let unitNet: number | null = null;
      if (price != null && Number.isFinite(price)) {
        unitNet = quoteLineTotal({
          price,
          quantity: 1,
          discountRate,
          vatRate: quote?.vatRate,
          overallDiscountRate: overallDiscount,
          applyVat: false,
        });
      }
      const currencySymbol =
        currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'CHF' ? 'CHF' : '₺';
      const priceLabel =
        unitNet != null
          ? `${unitNet.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`
          : '—';

      return {
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit || 'Adet',
        vendorId,
        vendorName: vendorName || null,
        priceLabel,
        vatLabel: quote?.vatRate != null ? `%${Number(quote.vatRate)}` : commercial.vatLabel,
        maturityLabel: commercial.maturityLabel,
        shippingLabel: commercial.shippingLabel,
      };
    };

    const localById = new Map(orderedItems.map((item: any) => [item.id, buildLocalRow(item)]));

    // API geldiyse fiyat/ticari alanları birleştir; eksikse sayfa verisiyle doldur
    if (completeDispatch?.items?.length) {
      return (completeDispatch.items as any[]).map((apiItem) => {
        const local = localById.get(apiItem.id);
        const priceMissing = !apiItem.priceLabel || apiItem.priceLabel === '—';
        const commercialMissing =
          !apiItem.vatLabel ||
          apiItem.vatLabel === '—' ||
          !apiItem.maturityLabel ||
          apiItem.maturityLabel === '—' ||
          !apiItem.shippingLabel ||
          apiItem.shippingLabel === '—';
        return {
          ...apiItem,
          priceLabel: priceMissing && local ? local.priceLabel : apiItem.priceLabel || local?.priceLabel || '—',
          vatLabel:
            commercialMissing && local ? local.vatLabel : apiItem.vatLabel || local?.vatLabel || 'Dahil',
          maturityLabel:
            commercialMissing && local
              ? local.maturityLabel
              : apiItem.maturityLabel || local?.maturityLabel || 'Hayır',
          shippingLabel:
            commercialMissing && local
              ? local.shippingLabel
              : apiItem.shippingLabel || local?.shippingLabel || 'Dahil',
          productName: apiItem.productName || local?.productName,
          quantity: apiItem.quantity ?? local?.quantity,
          unit: apiItem.unit || local?.unit || 'Adet',
          vendorId: apiItem.vendorId || local?.vendorId || null,
          vendorName: apiItem.vendorName || local?.vendorName || null,
        };
      });
    }

    return [...localById.values()];
  })();

  /** Tamamlama listesi: cariye göre gruplu (personel hangi kalem hangi tedarikçi görsün) */
  const completeDispatchGroups = (() => {
    const groups = new Map<string, { vendorName: string; items: any[] }>();
    for (const item of completeDispatchItems) {
      const key = item.vendorId || item.vendorName || '__none__';
      const vendorName = item.vendorName || 'Tedarikçi seçilmedi';
      if (!groups.has(key)) groups.set(key, { vendorName, items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.values()].sort((a, b) =>
      a.vendorName.localeCompare(b.vendorName, 'tr'),
    );
  })();

  const completeOrderVendorNames = (() => {
    const fromApi = (completeDispatch?.vendors || [])
      .map((v: any) => v.vendorName)
      .filter(Boolean);
    if (fromApi.length) return [...new Set(fromApi)] as string[];
    if (selectedOrderVendors.length) return selectedOrderVendors.map((v) => v.name);
    return [
      ...new Set(
        completeDispatchItems.map((i: any) => i.vendorName).filter(Boolean),
      ),
    ] as string[];
  })();

  const proceedToEditList = () => {
    setEditListWarningOpen(false);
    router.push(`/procurement/new?edit=${id}`);
  };

  const requestEditList = () => {
    if (hasAnySupplierQuote) {
      setEditListWarningOpen(true);
      return;
    }
    proceedToEditList();
  };

  const getCurrencySymbol = (code: string) => currencySymbol(code);

  const vendorShippingMeta = (vendorId: string) => {
    const a = (req.assignments || []).find((x: any) => x.vendorId === vendorId);
    const own = a?.shippingCostTRY != null ? Number(a.shippingCostTRY) : NaN;
    const legacy = (req as any).avgShippingCostTRY != null ? Number((req as any).avgShippingCostTRY) : NaN;
    const shippingIncluded = a?.isShippingIncluded !== false;
    return {
      city: String(a?.vendor?.city || '').trim() || null,
      shippingIncluded,
      shippingCostTRY: Number.isFinite(own)
        ? own
        : !shippingIncluded && Number.isFinite(legacy)
          ? legacy
          : null,
    };
  };

  const getVendorTotals = () => {
    const itemCount = (req.items || []).length;

    const vTotals: Record<
      string,
      {
        id: string;
        name: string;
        sums: Record<string, number>;
        overallDiscountRate: number;
        totalTRY: number;
        usdRateFixed: boolean;
        usdRate: number | null;
        eurRate: number | null;
        chfRate: number | null;
        quoteNote: string | null;
        quotedItemCount: number;
        itemCount: number;
        city: string | null;
        shippingIncluded: boolean;
        shippingCostTRY: number | null;
      }
    > = {};
    
    req.assignments?.forEach((assignment: any) => {
      const vId = assignment.vendorId;
      if (!vTotals[vId]) {
        vTotals[vId] = {
          id: vId,
          name: assignment.vendor.name,
          sums: emptyCurrencyBag(),
          overallDiscountRate: assignment.overallDiscountRate || 0,
          totalTRY: 0,
          usdRateFixed: Boolean(assignment.usdRateFixed),
          usdRate: assignmentUsdTry(assignment),
          eurRate: assignmentEurTry(assignment),
          chfRate: assignmentChfTry(assignment),
          quoteNote: assignment.quoteNote ? String(assignment.quoteNote).trim() : null,
          quotedItemCount: 0,
          itemCount,
          ...vendorShippingMeta(vId),
        };
      }
    });

    // Limit ve kartlar KDV hariç. Kaynak: talep kalemleri (yenilemede kaybolan kart olmasın).
    req.items.forEach((item: any) => {
      item.quotes?.forEach((quote: any) => {
        const vId = quote.vendorId;
        if (!vTotals[vId]) {
          vTotals[vId] = {
            id: vId,
            name: quote.vendor?.name || (quote.isMarket ? 'Online' : 'Bilinmeyen'),
            sums: emptyCurrencyBag(),
            overallDiscountRate: 0,
            totalTRY: 0,
            usdRateFixed: false,
            usdRate: null,
            eurRate: null,
            chfRate: null,
            quoteNote: null,
            quotedItemCount: 0,
            itemCount,
            ...vendorShippingMeta(vId),
          };
        }
        const price = Number(quote.price);
        if (!Number.isFinite(price)) return;
        const cur = quote.currency || 'TRY';
        const line = quoteLineTotal({
          price,
          quantity: item.quantity,
          discountRate: Number(quote.discountRate) || 0,
          vatRate: quote.vatRate,
          overallDiscountRate: 0,
          applyVat: false,
        });
        vTotals[vId].sums[cur] = (vTotals[vId].sums[cur] || 0) + line;
        vTotals[vId].quotedItemCount += 1;
      });
    });

    Object.values(vTotals).forEach((vt) => {
      if (vt.overallDiscountRate > 0) {
        Object.keys(vt.sums).forEach((cur) => {
          vt.sums[cur] = vt.sums[cur] - vt.sums[cur] * (vt.overallDiscountRate / 100);
        });
      }
    });

    if (approval?.vendors?.length) {
      for (const v of approval.vendors) {
        const existing = vTotals[v.vendorId];
        if (!existing) continue;
        existing.sums = {
          TRY: Number(v.byCurrency?.TRY) || existing.sums.TRY,
          USD: Number(v.byCurrency?.USD) || existing.sums.USD,
          EUR: Number(v.byCurrency?.EUR) || existing.sums.EUR,
          CHF: Number(v.byCurrency?.CHF) || existing.sums.CHF,
        };
        existing.totalTRY = Number(v.totalTRY) || existing.totalTRY;
        existing.quotedItemCount = Number(v.quotedItemCount) || existing.quotedItemCount;
      }
    }

    return Object.values(vTotals).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base', numeric: true }),
    );
  };

  const formatTryMoney = (n: number) =>
    `${Number(n || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ₺`;

  const fxMetaLabel = (() => {
    if (!approval?.rates) return null;
    if (approval.ratesFrozen) {
      const when = approval.rateFrozenAt
        ? new Date(approval.rateFrozenAt).toLocaleString('tr-TR')
        : null;
      return when ? `Kilitli kur · ${when}` : 'Kilitli kur (satın alma tamamlandı)';
    }
    if (approval.ratesLegacyUnlocked) {
      return 'Eski tamamlanmış kayıt — kur kilitlenmemiş; gösterim canlı kur ile (uyarı)';
    }
    const usd = approval.rates.USD;
    const eur = approval.rates.EUR;
    const chf = approval.rates.CHF;
    const src = approval.rateSource || 'TCMB';
    return `Canlı kur · 1 USD = ${Number(usd).toFixed(4)} ₺ · 1 EUR = ${Number(eur).toFixed(4)} ₺ · 1 CHF = ${Number(chf).toFixed(4)} ₺ · ${src}`;
  })();

  const calculateTotals = () => {
    const totals: Record<string, number> = emptyCurrencyBag();

    if (isSupplier && (req.status === 'SENT_TO_VENDOR' || req.status === 'VENDOR_QUOTED')) {
      req.items.forEach((item: any) => {
        const quote = quotedItems[item.id] || {};
        const qPrice = Number((quote.price || '').replace(',', '.')) || 0;
        const qDiscount = Number((quote.discountRate || '').replace(',', '.')) || 0;
        const cur = quote.currency || 'TRY';
        
        const itemTotal = qPrice * item.quantity;
        totals[cur] = (totals[cur] || 0) + (itemTotal - (itemTotal * (qDiscount / 100)));
      });
      
      const oRate = Number(overallDiscountRate.replace(',', '.')) || 0;
      if (oRate > 0) {
        Object.keys(totals).forEach((cur) => {
          totals[cur] = totals[cur] - (totals[cur] * (oRate / 100));
        });
      }
    } else if (isSupplier) {
      req.items.forEach((item: any) => {
        const myQuote = item.quotes?.find((q: any) => q.vendor?.userId === user?.id);
        if (myQuote) {
          const cur = myQuote.currency || 'TRY';
          const qDiscount = Number(myQuote.discountRate) || 0;
          const itemTotal = (myQuote.price || 0) * item.quantity;
          totals[cur] = (totals[cur] || 0) + (itemTotal - (itemTotal * (qDiscount / 100)));
        }
      });
      const myAssignment = req.assignments?.find((a: any) => a.vendor?.userId === user?.id);
      if (myAssignment && myAssignment.overallDiscountRate) {
        Object.keys(totals).forEach((cur) => {
          totals[cur] = totals[cur] - (totals[cur] * (myAssignment.overallDiscountRate / 100));
        });
      }
    }
    return totals;
  };

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
    }));
    
    const oRate = parseLocaleNumber(overallDiscountRate);

    const hasEmptyPrice = itemsPayload.some((item) => item.price === null);
    if (hasEmptyPrice) {
      toast.error('Tüm kalemler için birim fiyat girilmelidir. 0 fiyat verebilirsiniz.');
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

    if (quoteLockedByDecision) {
      toast.error(
        'Teklif kararı süreci başlatıldığı için teklif güncellemesi yapılamaz. Sorularınız için satın alma ekibiyle iletişime geçin.'
      );
      return;
    }

    (submitQuoteMutation.mutate as any)({ items: itemsPayload, overallDiscountRate: oRate });
  };

  const hasMyQuotes = req?.items?.some((item: any) =>
    item.quotes?.some((q: any) => q.vendor?.userId === user?.id)
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-8">
      {/* Başlık: ad büyük ve ince; altında kutusuz bir bilgi şeridi (durum, proje, kişiler). Kapsül, rozet yok. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between" data-tour="rfq-detail-head">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="break-words text-[28px] font-[300] leading-[1.1] tracking-[-0.03em] text-white sm:text-[36px] lg:text-[40px]">
            <SmokeText text={req.title} />
          </h1>
          <dl className="fx-rise mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-0 sm:divide-x sm:divide-white/[0.07]">
            <Fact label="Durum">
              <span style={{ color: statusTone(req.status) }}>{STATUS_MAP[req.status] || req.status}</span>
            </Fact>
            {req.project && user?.role !== 'SUPPLIER' ? <Fact label="Proje">{projectLabel(req.project)}</Fact> : null}
            <Fact label="Oluşturan">{req.createdBy?.name || '—'}</Fact>
            {req.moduleId === 'SATIN_ALMA' && (req.shopDepartment?.name || req.shopWorker) && user?.role !== 'SUPPLIER' ? (
              <Fact label={req.shopDepartment?.collarType === 'WHITE_COLLAR' ? 'Beyaz yaka' : 'Mavi yaka'}>
                {[req.shopDepartment?.name, req.shopWorker ? `${req.shopWorker.firstName} ${req.shopWorker.lastName}` : null]
                  .filter(Boolean)
                  .join(' → ')}
              </Fact>
            ) : null}
            {req.neededBy && user?.role !== 'SUPPLIER' ? (
              <Fact label="İhtiyaç">
                <span className="tabular-nums">
                  {new Date(req.neededBy).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </Fact>
            ) : null}
            <Fact label="Tedarikçi" tour="rfq-detail-vendors" className="col-span-2 sm:max-w-[560px]">
              {assignedVendors.length > 0 ? (
                <>
                  {assignedVendors.length} firma
                  <span className="ml-2 text-white/45">{vendorNames}</span>
                </>
              ) : (
                <span className="text-white/45">Seçilmedi</span>
              )}
            </Fact>
          </dl>
        </div>

      {req.status === 'RETURNED_TO_MANAGER' && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Üst yönetim reddetti — kayıt size iade edildi.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-100/85">
            Notu okuyup personele yönlendirebilir veya kalem seçimini düzeltip yeniden onaylayabilirsiniz.
          </p>
          {(() => {
            const hist = [...(((req as any).approvalHistories as any[]) || [])]
              .reverse()
              .find((h) => h.action === 'ADMIN_REJECT');
            const note = String(hist?.note || '');
            const extracted = note.includes('Not:') ? note.split('Not:').slice(1).join('Not:').trim() : '';
            return extracted ? (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 px-3 py-2 text-[13px] text-foreground">
                {extracted}
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Üst şerit: yalnızca tedarikçi rolü aksiyonları (liste düzenleme Hızlı İşlemler’de) */}
      <div className="flex gap-2 flex-wrap shrink-0 sm:justify-end">
          {isSupplier &&
            (req.status === 'SENT_TO_VENDOR' || req.status === 'VENDOR_QUOTED') &&
            !quoteLockedByDecision && (
            <>
              <Button
                onClick={handleQuoteSubmit}
                data-tour="rfq-detail-quote"
                className="bg-primary text-primary-foreground hover:opacity-90 px-6 font-bold"
                disabled={submitQuoteMutation.isPending}
              >
                {submitQuoteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileEdit className="w-4 h-4 mr-2" />
                )}
                {hasMyQuotes ? 'Fiyatları Revize Et' : 'Fiyatları Gönder ve Onaya Sun'}
              </Button>
            </>
          )}



          {isSupplier && req.status === 'VENDOR_APPROVED' && (
            <Button
              onClick={() => updateStatusMutation.mutate('IN_PRODUCTION')}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Clock className="w-4 h-4 mr-2" /> Üretime/Hazırlığa Başla
            </Button>
          )}

          {/* Satın alma aksiyonları sağ panelde */}
                </div>
                </div>

      {/* Yalnızca yetkilinin karar verebileceği aşamada; tamamlanmış kayıtlarda güncel limitle yargılanmaz. */}
      {canSeeApprovalFlow &&
        isProcurementApprovalFlow &&
        canManagerDecide &&
        approval &&
        approval.basis !== 'NO_QUOTES' &&
        approval.requiresExecutiveApproval &&
        !awaitingExecutive && (
          <p className="w-full text-xs leading-relaxed text-muted-foreground color-foreground/80 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
            Bu teklif üst yönetim onayı gerektirmektedir; onay verdiğinizde kayıt üst yönetime iletilir.
          </p>
        )}

      {awaitingExecutive && (
        <div className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div className="min-w-0 space-y-2 text-xs leading-relaxed text-emerald-200">
              <p className="text-sm font-bold text-emerald-400">Üst Yönetim Onayı Bekleniyor</p>
              <p>
                Bu talebin teklif toplamı belirlenen <strong>onay limitinin üzerindedir</strong>. Satın Alma Birimi
                Yetkilisi teklifi incelemiş olup, süreç <strong>üst yönetim onayına</strong> yükseltilmiştir.
              </p>
              {isExecutive ? (
                <p className="rounded border border-emerald-500/30 bg-emerald-600/30 p-3 font-bold text-white">
                  👉 Sağ paneldeki <strong>Karar / işlem</strong> bölümünden onaylayabilir veya personele iade edebilirsiniz.
                </p>
              ) : (
                <p className="text-emerald-300/90">
                  Onay verilene kadar bu kayıt üzerinde satın alma işlemi başlatılamaz.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Sol Kolon - Sipariş Kalemleri */}
        <div className="min-w-0 space-y-5">
          {isSupplier &&
            quoteLockedByDecision &&
            (req.status === 'SENT_TO_VENDOR' || req.status === 'VENDOR_QUOTED') && (
              <Card className="border-emerald-500/35 bg-emerald-500/[0.07] shadow-md">
                <CardContent className="pt-5 pb-5 flex gap-3 sm:gap-4">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-bold text-foreground">Teklif kararı süreci başlatıldı</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Teklifiniz kayıtlıdır; bu aşamadan sonra fiyat veya iskonto güncellemesi yapılamaz. Sorularınız için
                      satın alma ekibiyle iletişime geçin.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          {canOpenOrderDossier ? <OrderDossierPreview requestId={id} /> : null}

          <ProcurementMediaPanel
            attachments={req.attachments}
            items={(req.items || []).map((it: { id: string; productName: string }) => ({
              id: it.id,
              productName: it.productName,
            }))}
            requestId={id}
            canUpload={false}
            vendorMode={isSupplier}
            myVendorId={(user as { vendor?: { id?: string } } | null)?.vendor?.id ?? null}
            title="Fotoğraf / belgeler"
            description="Satın alma ve tedarikçi ekleri ayrı listelenir. Dosya eklemek için talebi düzenleyin."
          />

          <section className="rounded-[22px] border border-white/[0.07] bg-card px-6 py-5">
            <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Şartname / açıklama</h3>
            <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-white/75">
              {req.description || <span className="text-white/35">Girilmemiş</span>}
            </div>
          </section>

          {user?.role !== 'SUPPLIER' && req.internalNote ? (
            <section className="rounded-[22px] border border-amber-400/15 bg-amber-400/[0.04] px-6 py-5">
              <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Tedarik talep notu</h3>
              <p className="mt-1 text-[12.5px] text-white/40">
                Bu not yalnızca Satın Alma personeli tarafından görülür. Tedarikçi ile paylaşılmaz.
              </p>
              <div className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-white/80">{req.internalNote}</div>
            </section>
          ) : null}

          <Card className="overflow-hidden rounded-[22px] border-white/[0.07] bg-card shadow-none" data-tour="rfq-detail-items">
            <CardHeader className="flex flex-col justify-between gap-4 border-b border-hairline px-6 py-4 sm:flex-row sm:items-center">
              <CardTitle className="text-[15px] font-medium tracking-[-0.012em]">İstenilen ürünler</CardTitle>
              {isRequester && assignedVendors.length > 1 && (
                <SelectMenu
                  label="Görünüm"
                  size="sm"
                  align="end"
                  menuWidth={260}
                  value={selectedViewVendorId}
                  onChange={setSelectedViewVendorId}
                  active={selectedViewVendorId !== 'all'}
                  className="sm:w-56"
                  options={[
                    { value: 'all', label: 'Tümünü karşılaştır' },
                    ...assignedVendors.map((v: any) => ({ value: v.id, label: v.name })),
                  ]}
                />
              )}
            </CardHeader>
            {/* Kalemler: kutusuz satırlar. Grup başlığı ince bir şerit; basınca grup açılıp kapanır. */}
            <CardContent className="p-0">
              <div className="flex flex-col">
                {groupedOrderedItems.length > 0 ? (
                  groupedOrderedItems.map(([catName, catItems]) => (
                    <div key={catName} className="border-b border-hairline last:border-b-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCategories((prev) => ({
                            ...prev,
                            [catName]: prev[catName] === false,
                          }))
                        }
                        className="gold-fade gold-fade-x group/cat flex w-full items-center gap-3 px-6 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/55 transition-colors duration-150 group-hover/cat:bg-brand group-hover/cat:text-primary-foreground">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                              expandedCategories[catName] !== false && 'rotate-180'
                            )}
                            aria-hidden
                          />
                        </span>
                        <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium text-white">
                          {String(catName).charAt(0).toLocaleUpperCase('tr-TR') + String(catName).slice(1).toLocaleLowerCase('tr-TR')}
                        </h3>
                        <span className="shrink-0 text-[12.5px] tabular-nums text-white/35">{catItems.length} kalem</span>
                      </button>

                      {expandedCategories[catName] !== false ? (
                      <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                        {catItems.map((item: any, i: number) => {
                          const isQuotingEditable =
                            isSupplier &&
                            (req.status === 'SENT_TO_VENDOR' || req.status === 'VENDOR_QUOTED') &&
                            !quoteLockedByDecision;
                          const myQuote = isSupplier
                            ? item.quotes?.find((q: any) => q.vendor?.userId === user?.id)
                            : null;

                          return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col gap-4 px-6 py-5"
                      >
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-start gap-3">
                              <span className="mt-[2px] w-6 shrink-0 text-[13px] tabular-nums text-white/30">
                                {i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                {canRenameItems && renameItemId === item.id ? (
                                  <form
                                    className="flex flex-wrap items-center gap-2"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const next = renameDraft.trim().replace(/\s+/g, ' ');
                                      if (!next || next === String(item.productName || '').trim()) {
                                        setRenameItemId(null);
                                        return;
                                      }
                                      renameItemMutation.mutate({ itemId: item.id, productName: next });
                                    }}
                                  >
                                    <Input
                                      autoFocus
                                      value={renameDraft}
                                      maxLength={300}
                                      onChange={(e) => setRenameDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setRenameItemId(null);
                                      }}
                                      className="h-9 max-w-md font-bold"
                                    />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      disabled={renameItemMutation.isPending}
                                    >
                                      {renameItemMutation.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        'Kaydet'
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setRenameItemId(null)}
                                    >
                                      Vazgeç
                                    </Button>
                                  </form>
                                ) : canRenameItems ? (
                                  <button
                                    type="button"
                                    title="Kalem adını değiştir"
                                    onClick={() => {
                                      setRenameItemId(item.id);
                                      setRenameDraft(item.productName || '');
                                    }}
                                    className="group/name inline-flex max-w-full items-center gap-2 text-left text-[16px] font-medium leading-snug tracking-[-0.012em] text-white transition-colors hover:text-brand-ink"
                                  >
                                    <span className="min-w-0">{item.productName}</span>
                                    <Pencil className="h-3.5 w-3.5 shrink-0 text-white/30 transition-colors group-hover/name:text-brand" />
                                  </button>
                                ) : (
                                  <h3 className="text-[16px] font-medium leading-snug tracking-[-0.012em] text-white">
                                    {item.productName}
                                  </h3>
                                )}
                                {showProductionMeta && (item.serialNumber || item.stockCode || item.tonnageInfo) && (
                                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-white/40">
                                    {item.serialNumber && (
                                      <span>
                                        SN <span className="tabular-nums text-white/75">{item.serialNumber}</span>
                                      </span>
                                    )}
                                    {item.stockCode && (
                                      <span>
                                        Stok <span className="tabular-nums text-white/75">{item.stockCode}</span>
                                      </span>
                                    )}
                                    {item.tonnageInfo && (
                                      <span>
                                        Tonaj <span className="tabular-nums text-white/75">{item.tonnageInfo}</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                                {item.notes && (
                                  <div className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/55">
                                    {item.notes}
                                  </div>
                                )}
                              </div>
                            </div>

                            {(isQuotingEditable || (myQuote && myQuote.notes)) && (
                              <div className="mt-2 ml-7">
                                {isQuotingEditable ? (
                                  <Textarea
                                    value={quotedItems[item.id]?.notes || ''}
                                    onChange={(e) =>
                                      setQuotedItems({
                                        ...quotedItems,
                                        [item.id]: {
                                          ...quotedItems[item.id],
                                          notes: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="Ürünle ilgili stok yok, alternatifi var vb. notlarınız..."
                                    className="h-16 text-sm border-border bg-background"
                                  />
                                ) : myQuote?.notes ? (
                                  <p className="text-sm text-primary/80 bg-primary/10 p-2 rounded-md">
                                    <strong>Not:</strong> {myQuote.notes}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:items-end gap-3 shrink-0">
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[24px] font-[300] leading-none tracking-[-0.03em] tabular-nums text-white">{item.quantity}</span>
                                <span className="text-[13px] text-white/45">{item.unit || 'Adet'}</span>
                              </div>
                              {item.secondaryQuantity && (
                                <div className="flex items-center justify-end gap-1 opacity-70 w-full">
                                  <span className="text-[10px] font-bold text-muted-foreground">İkincil:</span>
                                  <span className="text-xs font-bold text-foreground">{item.secondaryQuantity}</span>
                                  <span className="text-[10px] text-muted-foreground">{item.secondaryUnit || ''}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              {isQuotingEditable ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    Birim Fiyat:
                                  </span>
                                  <div className="flex items-center gap-1 border border-primary rounded-md bg-background focus-within:ring-2 focus-within:ring-primary overflow-hidden w-44">
                                    <Input
                                      type="text"
                                      value={quotedItems[item.id]?.price || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (/^[\d,.]*$/.test(val)) {
                                          setQuotedItems({
                                            ...quotedItems,
                                            [item.id]: { ...quotedItems[item.id], price: val },
                                          });
                                        }
                                      }}
                                      placeholder="0,00"
                                      className="w-full text-right font-medium text-primary border-none shadow-none focus-visible:ring-0 px-2 h-9"
                                    />
                                    <div className="h-5 w-px bg-primary/30 mx-1"></div>
                                    <select
                                      className="bg-transparent text-sm text-primary font-bold focus:outline-none appearance-none cursor-pointer pr-3 py-1 outline-none"
                                      value={quotedItems[item.id]?.currency || 'TRY'}
                                      onChange={(e) =>
                                        setQuotedItems({
                                          ...quotedItems,
                                          [item.id]: {
                                            ...quotedItems[item.id],
                                            currency: e.target.value,
                                          },
                                        })
                                      }
                                    >
                                      <option className="bg-[#3D464D] text-white" value="TRY">
                                        ₺
                                      </option>
                                      <option className="bg-[#3D464D] text-white" value="USD">
                                        $
                                      </option>
                                      <option className="bg-[#3D464D] text-white" value="EUR">
                                        €
                                      </option>
                                      <option className="bg-[#3D464D] text-white" value="CHF">
                                        CHF
                                      </option>
                                    </select>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 border border-amber-500 rounded-md bg-background focus-within:ring-2 focus-within:ring-amber-500 overflow-hidden w-24 ml-2">
                                    <Input
                                      type="text"
                                      value={quotedItems[item.id]?.discountRate || ''}
                                      onChange={(e) => {
                                        const val = acceptPercentInput(e.target.value);
                                        if (val == null) return;
                                        setQuotedItems({
                                          ...quotedItems,
                                          [item.id]: { ...quotedItems[item.id], discountRate: val },
                                        });
                                      }}
                                      placeholder="İsk. %"
                                      className="w-full text-right font-medium text-amber-500 border-none shadow-none focus-visible:ring-0 px-2 h-9"
                                    />
                                  </div>
                                </div>
                              ) : isSupplier ? (
                                <div className="text-right">
                                  {myQuote?.price ? (
                                    <>
                                      <p className="text-sm text-muted-foreground">
                                        Birim: {myQuote.price} {getCurrencySymbol(myQuote.currency)}
                                        {myQuote.discountRate > 0 && <span className="text-amber-500 ml-2">(-%{myQuote.discountRate})</span>}
                                      </p>
                                      <p className="text-lg font-bold text-primary">
                                        Toplam: {((item.quantity * myQuote.price) * (1 - (myQuote.discountRate || 0)/100)).toFixed(2)}{' '}
                                        {getCurrencySymbol(myQuote.currency)}
                                      </p>
                                    </>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      Fiyat Girilmedi
                                    </Badge>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Requester Comparison Table for each item */}
                        {isRequester && item.quotes && item.quotes.length > 0 && (
                          <div className="ml-9 overflow-hidden rounded-[14px] border border-white/[0.06]">
                            {selectedViewVendorId === 'all' ? (
                              <>
                                <div className="border-b border-white/[0.06] px-4 py-2">
                                  <p className="text-[12px] text-white/40">
                                    Tedarikçi karşılaştırması · {item.quotes.length} teklif
                                  </p>
                                </div>
                                <div className="divide-y divide-white/[0.05]">
                                  {item.quotes.map((quote: any) => {
                                    const chosenVendorId =
                                      ((req as any).itemVendorPicks || []).find(
                                        (p: any) => p.itemId === item.id
                                      )?.chosenVendorId ||
                                      item.vendorPick?.chosenVendorId ||
                                      null;
                                    const isChosen = chosenVendorId && quote.vendorId === chosenVendorId;
                                    return (
                                    <div
                                      key={quote.id}
                                      className={cn(
                                        'relative px-4 py-2.5',
                                        isChosen && 'bg-brand/[0.06]',
                                      )}
                                    >
                                      {isChosen ? (
                                        <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-r-full bg-brand" />
                                      ) : null}
                                      <div className="flex justify-between items-start gap-3">
                                      <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-white">
                                        {quote.vendor.name}
                                        {quote.isMarket && <OnlineQuoteBadge />}
                                        {quote.isMarket && (
                                          <MarketProofLinks
                                            requestId={id}
                                            attachments={req.attachments}
                                            sourceId={quote.marketSourceId}
                                            itemId={item.id}
                                          />
                                        )}
                                        {isChosen && <span className="text-[12px] text-brand-ink">Sipariş</span>}
                                        {quote.isMarket ? (
                                          <MarketQuoteDeleteButton
                                            requestId={id}
                                            quoteId={quote.id}
                                            canEdit={canDeleteQuotes}
                                          />
                                        ) : (
                                          <VendorQuoteDeleteButton
                                            requestId={id}
                                            quoteId={quote.id}
                                            vendorName={quote.vendor?.name}
                                            canEdit={canDeleteQuotes}
                                          />
                                        )}
                                      </p>
                                      <div className="text-right shrink-0">
                                        <div className="flex items-center justify-end gap-2 text-[14px] font-medium tabular-nums text-brand-ink">
                                          {quote.discountRate > 0 && (
                                            <>
                                              <span className="text-[11.5px] font-normal text-amber-300">−%{quote.discountRate}</span>
                                              <span className="text-[12px] font-normal text-white/30 line-through">
                                                {quote.price} {getCurrencySymbol(quote.currency)}
                                              </span>
                                            </>
                                          )}
                                          <span>
                                            {quote.discountRate > 0 
                                              ? (Number(quote.price) * (1 - quote.discountRate/100)).toFixed(2)
                                              : quote.price} {getCurrencySymbol(quote.currency)}
                                          </span>
                                          {usesPurchasingQuoteForm(req.moduleId) && quote.vatRate != null && (
                                            <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 text-[9px] px-1 py-0">
                                              KDV %{quote.vatRate}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      </div>
                                      {quote.isMarket ? <MarketOfferUrl url={quote.marketUrl} /> : null}
                                      {quote.notes ? (
                                        <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap break-words leading-snug">
                                          {quote.notes}
                                        </p>
                                      ) : null}
                                    </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              (() => {
                                const sq = item.quotes.find(
                                  (q: any) => q.vendorId === selectedViewVendorId
                                );
                                if (!sq)
                                  return (
                                    <div className="px-4 py-3 text-sm text-muted-foreground">
                                      Bu tedarikçi (henüz) fiyat vermemiş.
                                    </div>
                                  );
                                return (
                                  <div className="flex justify-between items-center px-4 py-3 border-l-2 border-primary bg-primary/5">
                                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                                      Verilen Birim Fiyat:
                                      {sq.isMarket ? (
                                        <MarketQuoteDeleteButton
                                          requestId={id}
                                          quoteId={sq.id}
                                          canEdit={canDeleteQuotes}
                                        />
                                      ) : (
                                        <VendorQuoteDeleteButton
                                          requestId={id}
                                          quoteId={sq.id}
                                          vendorName={sq.vendor?.name}
                                          canEdit={canDeleteQuotes}
                                        />
                                      )}
                                    </p>
                                    <div className="text-right flex flex-col items-end">
                                      <div className="text-lg font-bold text-primary flex items-center justify-end gap-2">
                                        {sq.discountRate > 0 && (
                                          <>
                                            <Badge variant="outline" className="text-amber-500 border-amber-500 text-[10px]">-%{sq.discountRate}</Badge>
                                            <span className="line-through text-muted-foreground opacity-60 font-medium text-sm">
                                              {sq.price} {getCurrencySymbol(sq.currency)}
                                            </span>
                                          </>
                                        )}
                                        <span>
                                          {sq.discountRate > 0 
                                            ? (Number(sq.price) * (1 - sq.discountRate/100)).toFixed(2)
                                            : sq.price} {getCurrencySymbol(sq.currency)}
                                        </span>
                                        {usesPurchasingQuoteForm(req.moduleId) && sq.vatRate != null && (
                                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 text-[9px] px-1 py-0">
                                            KDV %{sq.vatRate}
                                          </Badge>
                                        )}
                                      </div>
                                      {sq.isMarket ? <MarketOfferUrl url={sq.marketUrl} /> : null}
                                      {sq.notes && (
                                        <p className="text-sm text-muted-foreground mt-1 font-medium bg-background px-2 py-1 rounded whitespace-pre-wrap break-words">
                                          Not: {sq.notes}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        )}

                        <ItemMediaStrip
                          attachments={req.attachments}
                          itemId={item.id}
                          requestId={id}
                          vendorMode={isSupplier}
                          myVendorId={(user as { vendor?: { id?: string } } | null)?.vendor?.id ?? null}
                        />
                        <MarketOfferItemButton
                          canEdit={canEditMarket}
                          onClick={() => {
                            setMarketOfferItemId(item.id);
                            setMarketOfferOpen(true);
                          }}
                        />
                      </div>
                    );
                  })
                 }
                </div>
                      ) : null}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              Listede ürün bulunmuyor.
            </div>
          )}
        </div>
      </CardContent>
      {/* Toplam Tutar Footeri */}
            {isSupplier ? (
              <div className="p-4 bg-background border-t border-border/50 flex flex-col items-end gap-2 rounded-b-xl">
                {(req.status === 'SENT_TO_VENDOR' || req.status === 'VENDOR_QUOTED') && (
                  <div className="flex items-center gap-3 w-full sm:w-auto mb-2">
                    <span className="text-xs uppercase text-amber-500 font-bold whitespace-nowrap">
                      TÜM TEKLİFE İSKONTO (%):
                    </span>
                    <Input
                      type="text"
                      className="w-20 h-8 text-right bg-amber-500/10 border-amber-500 text-amber-500 font-bold"
                      value={overallDiscountRate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^[\d,.]*$/.test(val)) setOverallDiscountRate(val);
                      }}
                      placeholder="0"
                    />
                  </div>
                )}
                
                <span className="text-muted-foreground font-medium">Cari Toplamınız</span>
                {calculateTotals().TRY > 0 && (
                  <span className="text-xl font-bold text-primary">
                    {calculateTotals().TRY.toFixed(2)} ₺
                  </span>
                )}
                {calculateTotals().USD > 0 && (
                  <span className="text-xl font-bold text-primary">
                    {calculateTotals().USD.toFixed(2)} $
                  </span>
                )}
                {calculateTotals().EUR > 0 && (
                  <span className="text-xl font-bold text-primary">
                    {calculateTotals().EUR.toFixed(2)} €
                  </span>
                )}
                {calculateTotals().CHF > 0 && (
                  <span className="text-xl font-bold text-primary">
                    {calculateTotals().CHF.toFixed(2)} CHF
                  </span>
                )}
                {calculateTotals().TRY === 0 &&
                  calculateTotals().USD === 0 &&
                  calculateTotals().EUR === 0 &&
                  calculateTotals().CHF === 0 && (
                    <span className="text-xl font-bold text-primary">0.00 ₺</span>
                  )}
              </div>
            ) : (
              <div className="p-4 bg-background border-t border-border/50 rounded-b-xl space-y-3">
                {showSelectedOrderVendors && (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                      Sipariş verilecek cari
                    </p>
                    <ul className="mt-1.5 space-y-2">
                      {selectedOrderVendors.map((v) => {
                        const vendorPicks = ((req as any).itemVendorPicks || []).filter(
                          (p: any) => p?.chosenVendorId === v.id || p?.vendor?.id === v.id,
                        );
                        const vendorItems = orderedItems.filter((item: any) => {
                          const pick =
                            vendorPicks.find((p: any) => p.itemId === item.id) ||
                            item.vendorPick;
                          return pick?.chosenVendorId === v.id || pick?.vendor?.id === v.id;
                        });
                        const selectedAt = vendorPicks.reduce((latest: string | null, p: any) => {
                          const t = p?.updatedAt || p?.createdAt;
                          if (!t) return latest;
                          if (!latest) return t;
                          return new Date(t).getTime() >= new Date(latest).getTime() ? t : latest;
                        }, null);
                        const selectedAtLabel = selectedAt
                          ? format(new Date(selectedAt), 'd MMMM yyyy HH:mm', { locale: tr })
                          : null;
                        return (
                          <li key={v.id} className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
                              {v.name}
                              {vendorItems.length > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  ({vendorItems.length} kalem)
                                </span>
                              )}
                            </div>
                            {selectedAtLabel ? (
                              <p className="ml-6 text-[11px] font-medium tabular-nums text-muted-foreground">
                                {selectedAtLabel}
                              </p>
                            ) : null}
                            {vendorItems.length > 0 && (
                              <ul className="ml-6 space-y-0.5">
                                {vendorItems.map((item: any) => (
                                  <li
                                    key={item.id}
                                    className="text-[12px] text-muted-foreground leading-snug"
                                  >
                                    {item.productName}
                                    <span className="text-muted-foreground/70">
                                      {' '}
                                      · {item.quantity} {item.unit || 'Adet'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                      Yetkili onayı bu cari(ler) üzerinden verildi; satın alma bu firmadan geçilecek.
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Building2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground leading-none">
                      {selectedViewVendorId === 'all'
                        ? 'Tedarikçi teklif toplamları'
                        : 'Seçili tedarikçi toplamı'}
                    </h3>
                    <p
                      className={cn(
                        'text-[11px] mt-1 leading-relaxed',
                        approval?.ratesLegacyUnlocked
                          ? 'text-amber-400/90'
                          : approval?.ratesFrozen
                            ? 'text-emerald-400/90'
                            : 'text-muted-foreground',
                      )}
                    >
                      KDV hariç{fxMetaLabel ? ` · ${fxMetaLabel}` : ''}
                    </p>
                  </div>
                </div>
                {getVendorTotals().some(
                  (vt: any) =>
                    (selectedViewVendorId === 'all' || vt.id === selectedViewVendorId) &&
                    Number(vt.itemCount) > 0 &&
                    Number(vt.quotedItemCount) < Number(vt.itemCount),
                ) && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Eksik kalemli tekliflerin toplamı daha düşük görünebilir.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {getVendorTotals()
                    .filter(
                      (vt: any) => selectedViewVendorId === 'all' || vt.id === selectedViewVendorId
                    )
                    .map((vt: any, idx: number) => {
                      const isOrderVendor = selectedOrderVendorIds.has(vt.id);
                      const quoted = Number(vt.quotedItemCount) || 0;
                      const itemCount = Number(vt.itemCount) || 0;
                      const missing = Math.max(0, itemCount - quoted);
                      const incomplete = itemCount > 0 && missing > 0;
                      return (
                      <div
                        key={vt.id || idx}
                        className={cn(
                          'rounded-lg border border-border/60 bg-muted/20 p-3 text-left shadow-sm flex flex-col gap-1.5',
                          isOrderVendor && 'border-primary/40 bg-primary/10',
                          !isOrderVendor && selectedViewVendorId !== 'all' && 'border-primary/40',
                        )}
                      >
                        <p className="text-[13px] font-medium text-foreground flex items-center gap-2 flex-wrap">
                          {vt.name}
                          {vt.city ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {vt.city}
                            </span>
                          ) : null}
                          {isOrderVendor && (
                            <span className="text-[11px] font-medium text-primary">Sipariş</span>
                          )}
                          {vt.overallDiscountRate > 0 && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500 bg-amber-500/10 px-1 py-0 text-[9px]">
                              Ek İskonto: %{vt.overallDiscountRate}
                            </Badge>
                          )}
                          {vt.usdRateFixed && Number(vt.usdRate) > 0 && (
                            <Badge variant="outline" className="text-sky-400 border-sky-500/50 bg-sky-500/10 px-1 py-0 text-[9px]">
                              USD {Number(vt.usdRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </Badge>
                          )}
                          {vt.usdRateFixed && Number(vt.eurRate) > 0 && (
                            <Badge variant="outline" className="text-sky-400 border-sky-500/50 bg-sky-500/10 px-1 py-0 text-[9px]">
                              EUR {Number(vt.eurRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </Badge>
                          )}
                          {vt.usdRateFixed && Number(vt.chfRate) > 0 && (
                            <Badge variant="outline" className="text-sky-400 border-sky-500/50 bg-sky-500/10 px-1 py-0 text-[9px]">
                              CHF {Number(vt.chfRate).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </Badge>
                          )}
                        </p>
                        {vt.quoteNote ? (
                          <p className="text-[11px] text-muted-foreground w-full whitespace-pre-wrap leading-snug">
                            {vt.quoteNote}
                          </p>
                        ) : null}
                        {vt.shippingIncluded === false ? (
                          <p className="text-[11px] text-muted-foreground w-full leading-snug">
                            Nakliye hariç
                            {vt.shippingCostTRY != null
                              ? ` · ${formatTryMoney(vt.shippingCostTRY)}`
                              : ''}
                          </p>
                        ) : null}
                        {incomplete && (
                          <p className="text-[11px] leading-snug text-amber-300/90">
                            {missing} kalem eksik
                          </p>
                        )}
                        {typeof vt.totalTRY === 'number' && vt.totalTRY > 0 && (
                          <span className="text-lg font-bold text-primary">
                            {formatTryMoney(vt.totalTRY)}
                          </span>
                        )}
                        {typeof vt.totalTRY === 'number' &&
                          vt.totalTRY > 0 &&
                          ((vt.sums.USD || 0) > 0 || (vt.sums.EUR || 0) > 0 || (vt.sums.CHF || 0) > 0) && (
                          <span className="text-[11px] text-muted-foreground">
                            Çapraz kur karşılığı
                          </span>
                        )}
                        {hasFxSums(vt.sums) && (vt.sums.TRY || 0) > 0 && (
                          <span className="font-semibold text-foreground/90 text-sm">
                            {Number(vt.sums.TRY).toFixed(2)} ₺
                          </span>
                        )}
                        {(vt.sums.USD || 0) > 0 && (
                          <span className="font-semibold text-foreground/90 text-sm">
                            {Number(vt.sums.USD).toFixed(2)} $
                          </span>
                        )}
                        {(vt.sums.EUR || 0) > 0 && (
                          <span className="font-semibold text-foreground/90 text-sm">
                            {Number(vt.sums.EUR).toFixed(2)} €
                          </span>
                        )}
                        {(vt.sums.CHF || 0) > 0 && (
                          <span className="font-semibold text-foreground/90 text-sm">
                            {Number(vt.sums.CHF).toFixed(2)} CHF
                          </span>
                        )}
                        {!(typeof vt.totalTRY === 'number' && vt.totalTRY > 0) && (vt.sums.TRY || 0) > 0 && (
                          <span className="font-bold text-primary text-lg">
                            {Number(vt.sums.TRY).toFixed(2)} ₺
                          </span>
                        )}
                      </div>
                      );
                    })}
                  {getVendorTotals().filter(
                    (vt: any) => selectedViewVendorId === 'all' || vt.id === selectedViewVendorId
                  ).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Henüz fiyat teklifi veren tedarikçi bulunmuyor.
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* ── Hızlı İşlemler ── */}
          {isRequester && (
            <section
              className="texture-host relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-card"
              data-tour="rfq-detail-actions"
            >
              <span aria-hidden className="tile-texture" />
              <div className="relative px-5 pb-2 pt-5">
                <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Hızlı işlemler</h3>
                <p className="mt-0.5 text-[12.5px] text-white/40">Liste, teklif ve iletişim</p>
              </div>

              <div className="relative space-y-0.5 px-2 pb-2">
                  {operatesThisModule && !['COMPLETED', 'CANCELLED'].includes(req.status) && (
                  <QuickActionRow
                    icon={FileEdit}
                    title="Listeyi düzenle"
                    hint="Kalemler ve tedarikçiler"
                    tone="amber"
                    onClick={requestEditList}
                  />
                )}

                  {operatesThisModule && assignedVendors.length > 0 && !(isSparePart && !isChannelExecutive && !handedToSatinAlma) && (
                  <QuickActionRow
                    icon={ExternalLink}
                    title="Teklif formları"
                    hint="Bağlantı ve önizleme"
                    onClick={() => setIsQuoteDialogOpen(true)}
                  />
                )}

                {operatesThisModule && req.status !== 'DRAFT' && canCreateStandaloneRfq(user) && (
                  <QuickActionRow
                    icon={Copy}
                    title="Talebi tekrarla"
                    hint="Yeni taslak olarak kopyala"
                    onClick={() => setConfirmDuplicateOpen(true)}
                  />
                )}

                <HandoverPanel request={req as any} user={user} />
              </div>

              {operatesThisModule && (canSubmitForApproval ||
                canWithdrawFromApproval ||
                canManagerDecide ||
                canExecutiveDecide ||
                (isUnitManager &&
                  (req.status === 'APPROVED_FOR_PURCHASE' || req.status === 'RETURNED_TO_MANAGER')) ||
                req.status === 'APPROVED_FOR_PURCHASE' ||
                isApprovedForWarehouse ||
                canCancelProductionOrder ||
                canOfferDecisionInvite ||
                (req.status === 'COMPLETED' && !(req as any).invoiceUploadedAt) ||
                (req.status === 'COMPLETED' && (req as any).invoiceUploadedAt)) && (
                <div className="relative space-y-0.5 border-t border-hairline px-2 pb-2 pt-3">
                  <p className="px-3 pb-1 text-[12px] font-medium text-white/40">Karar / işlem</p>

                  {canSubmitForApproval && (
                    <QuickActionRow
                      icon={Send}
                      title="Yetkili onayına gönder"
                      hint="Teklifler yetkiliye gider"
                      onClick={() => setSubmitApprovalOpen(true)}
                      disabled={!hasAnySupplierQuote || submitForApprovalMutation.isPending}
                    />
                  )}

                  {canWithdrawFromApproval && (
                    <QuickActionRow
                      icon={History}
                      title="Gönderimi geri al"
                      hint="Onay kuyruğundan çek"
                      tone="emerald"
                      onClick={() => setWithdrawApprovalOpen(true)}
                      disabled={withdrawFromApprovalMutation.isPending}
                    />
                  )}

                  {showManagerInboxAction && (
                    <QuickActionRow
                      icon={CheckCircle2}
                      title="Teklifleri onayla"
                      hint="Limit altı karar sayfasında kalem seç"
                      tone="amber"
                      onClick={() => router.push(`/executive-approval/manager?r=${id}`)}
                      disabled={req.status === 'VENDOR_QUOTED' && !hasAnySupplierQuote}
                    />
                  )}
                  {showExecutiveSendAction && (
                    <QuickActionRow
                      icon={Send}
                      title="Üst yönetime gönder"
                      hint="Limit üstü karar kutusuna gider"
                      tone="emerald"
                      onClick={() => openDecisionModal('approve', undefined, { escalateOnly: true })}
                      disabled={
                        managerApproveMutation.isPending ||
                        (req.status === 'VENDOR_QUOTED' && !hasAnySupplierQuote)
                      }
                    />
                  )}
                  {canManagerDecide && (
                    <>
                      {req.status === 'PENDING_MANAGER_APPROVAL' && (
                        <QuickActionRow
                          icon={X}
                          title="Personele iade et"
                          hint="Düzeltme için geri gönder"
                          tone="danger"
                          onClick={() => openDecisionModal('reject')}
                          disabled={rejectMutation.isPending}
                        />
                      )}
                    </>
                  )}

                  {canResendExecutiveInbox && (
                    <QuickActionRow
                      icon={Mail}
                      title="Üst yönetime tekrar gönder"
                      hint="Karar kutusuna yeniden ilet"
                      tone="emerald"
                      onClick={() => {
                        setExecResendEmails([]);
                        setExecResendOpen(true);
                      }}
                      disabled={resendExecutiveInboxMutation.isPending}
                    />
                  )}

                  {canExecutiveDecide && (
                    <>
                      <QuickActionRow
                        icon={CheckCircle2}
                        title="Üst yönetim onayla"
                        hint="Seçilen teklifi onayla"
                        tone="amber"
                        onClick={() => openDecisionModal('admin-approve')}
                        disabled={adminApproveMutation.isPending}
                      />
                      <QuickActionRow
                        icon={X}
                        title="Personele iade et"
                        hint="Düzeltme için geri gönder"
                        tone="danger"
                        onClick={() => openDecisionModal('reject')}
                        disabled={rejectMutation.isPending}
                      />
                    </>
                  )}

                  {canRouteToStaff && (
                    <QuickActionRow
                      icon={User}
                      title="Personele yönlendir"
                      hint="Satın almayı personele bırak"
                      tone="violet"
                      onClick={() => setRouteStaffDialogOpen(true)}
                      disabled={routeToStaffMutation.isPending}
                    />
                  )}

                  {canCompletePurchase && (
                    <QuickActionRow
                      icon={CheckCircle2}
                      title="Satın almayı tamamla"
                      hint="Siparişi kapat"
                      tone="amber"
                      onClick={() => openCompletePurchaseModal()}
                      disabled={completePurchaseMutation.isPending}
                    />
                  )}

                  {req.status === 'COMPLETED' && (
                    <InvoicePanel
                      requestId={id}
                      items={orderedItems}
                      attachments={(req.attachments || []) as any[]}
                      picks={((req as any).itemVendorPicks || []) as any[]}
                      marketSources={((req as any).marketSources || []) as any[]}
                      invoiceUploadedAt={(req as any).invoiceUploadedAt}
                      onChanged={refreshApprovalState}
                    />
                  )}

                  {decisionInvalid && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[12px] leading-snug text-amber-100">
                      {executiveDecision?.reason || 'Üst yönetim kararı artık bu teklif için geçerli değil.'}
                    </p>
                  )}

                  {canOfferDecisionInvite && (
                    <DecisionInviteDialog
                      variant="row"
                      requestId={id}
                      requestTitle={req.title}
                      inviteState={
                        (req as { decisionInviteMailPending?: boolean }).decisionInviteMailPending
                          ? 'pendingMail'
                          : (req as { quoteLockedByDecisionInvite?: boolean }).quoteLockedByDecisionInvite
                            ? 'queued'
                            : 'idle'
                      }
                    />
                  )}

                  {canCancelProductionOrder && (
                    <QuickActionRow
                      icon={X}
                      title="Siparişi iptal et"
                      hint="Açık siparişi kapat"
                      tone="danger"
                      onClick={() => setConfirmCancelOpen(true)}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Onay Geçmişi ── */}
          {isRequester && (
            <section className="flex flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card">
              <div className="px-5 pb-3 pt-5">
                <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Onay geçmişi</h3>
                <p className="mt-0.5 text-[12.5px] text-white/40">Hiyerarşideki adımlar, en yenisi üstte</p>
              </div>
              {/* Zaman çizelgesi: her adım renkli bir noktada, noktaları ince bir çizgi bağlar. */}
              <div className="overflow-y-auto px-5 pb-5" style={{ maxHeight: '380px' }}>
                {(req.approvalHistories?.length ?? 0) === 0 ? (
                  <div className="py-4">
                    <p className="text-[13.5px] text-white/75">Henüz onay adımı yok</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-white/40">
                      Yetkili onayı, üst yönetim kararı ve iadeler burada görünür.
                    </p>
                  </div>
                ) : (
                  [...(req.approvalHistories as any[])]
                  .sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )
                  .map((h: any) => {
                    const meta = APPROVAL_ACTION_MAP[h.action] || {
                      label: 'İşlem kaydı',
                      tone: 'text-muted-foreground',
                    };
                    return (
                      <div key={h.id} className="group/step relative space-y-1 pb-5 pl-6 last:pb-0">
                        <span
                          aria-hidden
                          className="absolute bottom-0 left-[5px] top-4 w-px bg-white/[0.08] group-last/step:hidden"
                        />
                        <span
                          aria-hidden
                          className={cn('absolute left-0 top-[5px] size-[11px] rounded-full bg-current ring-4 ring-card', meta.tone)}
                        />
                        <div className="flex items-start justify-between gap-2">
                            <span className={cn('text-[13.5px] font-medium leading-snug', meta.tone)}>
                              {meta.label}
                            </span>
                            <span className="shrink-0 text-[12px] tabular-nums text-white/35">
                              {format(new Date(h.createdAt), 'd MMM HH:mm', { locale: tr })}
                          </span>
                        </div>
                          {h.note ? (
                            <p className="text-[13px] leading-6 text-white/70">{h.note}</p>
                          ) : null}
                          {(() => {
                            const m = String(h.note || '').match(/seçilen cari:\s*([^;—]+)/i);
                            if (!m?.[1]) return null;
                            return (
                              <p className="text-[12px] font-semibold text-amber-400 flex items-center gap-1.5 pt-0.5">
                                <Building2 className="w-3 h-3 shrink-0" />
                                Sipariş: {m[1].trim()}
                              </p>
                            );
                          })()}
                        {h.actorUser?.name && (
                            <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {h.actorUser.name}
                          </p>
                        )}
                      </div>
                    );
                    })
                )}
              </div>
            </section>
          )}

          {/* ── Tedarikçi Logları ── */}
          {isRequester && (
            <VendorActivityLogs
              activityLogs={req.vendorActivityLogs}
              comments={req.comments}
            />
          )}
        </div>
      </div>

      <Dialog open={editListWarningOpen} onOpenChange={setEditListWarningOpen}>
        <DialogContent
          className="sm:max-w-[480px] border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Düzenleme uyarısı</DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              Bu talebe ait tedarikçi fiyatları olabilir. Satır silmek veya ürünü değiştirmek ilgili teklif kayıtlarını
              etkileyebilir. Düzenlemeye devam etmek istiyor musunuz?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditListWarningOpen(false)}>
              İptal
            </Button>
            <Button type="button" onClick={proceedToEditList}>
              Devam et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDuplicateOpen} onOpenChange={setConfirmDuplicateOpen}>
        <DialogContent
          className="sm:max-w-[420px] border-border/60 p-0 gap-0 overflow-hidden"
          style={{ background: 'hsl(0, 0%, 10%)' }}
        >
          <div className="px-6 pt-6 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Copy className="h-5 w-5" />
                  </div>
            <DialogHeader className="space-y-2 text-center sm:text-center">
              <DialogTitle className="text-lg text-foreground">Talebi tekrarla?</DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground leading-relaxed">
                Kalemler ve bilgiler yeni bir taslak olarak kopyalanır. Mevcut talep olduğu gibi kalır.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="grid grid-cols-2 gap-0 border-t border-border/50">
            <button
              type="button"
              onClick={() => setConfirmDuplicateOpen(false)}
              className="h-12 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              Hayır
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDuplicateOpen(false);
                router.push(`/procurement/new?duplicate=${req.id}`);
              }}
              className="h-12 border-l border-border/50 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              Evet, kopyala
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={submitApprovalOpen}
        onOpenChange={(open) => {
          setSubmitApprovalOpen(open);
          if (!open) {
            setSubmitApprovalNote('');
            setSubmitVendorShipping({});
            return;
          }
          const next: Record<string, string> = {};
          for (const a of req.assignments || []) {
            if (a.isShippingIncluded !== false) continue;
            const n = a.shippingCostTRY;
            next[a.vendorId] =
              n != null && Number.isFinite(Number(n)) ? String(n) : '';
          }
          setSubmitVendorShipping(next);
        }}
      >
        <DialogContent
          className="sm:max-w-[520px] max-h-[90dvh] overflow-y-auto border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Yetkili onayına gönder
            </DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              Talep Satın Alma Birimi Yetkilisine iletilecek. Gönderimden sonra tedarikçiler fiyat
              giremez veya revize edemez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {needsVendorShipping && (
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nakliye bedeli (TRY) *
                </label>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Nakliye hariç teklif veren her cari için ayrı bedel girin. Şehirler farklıysa
                  aynı tutarı yazmayın.
                </p>
                <div className="space-y-2">
                  {shippingExcludedVendors.map((v) => (
                    <div
                      key={v.vendorId}
                      className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug text-foreground">{v.name}</p>
                        {v.city ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            <MapPin className="h-3 w-3" />
                            {v.city}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Şehir yok</span>
                        )}
                      </div>
                      <Input
                        inputMode="decimal"
                        value={submitVendorShipping[v.vendorId] ?? ''}
                        onChange={(e) =>
                          setSubmitVendorShipping((prev) => ({
                            ...prev,
                            [v.vendorId]: e.target.value,
                          }))
                        }
                        placeholder={v.city ? `${v.city} nakliyesi, örn. 2500` : 'Örn. 2500'}
                        className="bg-background/50"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Not (isteğe bağlı)
              </label>
              <Textarea
                value={submitApprovalNote}
                onChange={(e) => setSubmitApprovalNote(e.target.value)}
                placeholder="Yetkiliye iletmek istediğiniz kısa not…"
                className="min-h-[100px] bg-background/50 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSubmitApprovalOpen(false);
                setSubmitApprovalNote('');
                setSubmitVendorShipping({});
              }}
              disabled={submitForApprovalMutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              className="gap-2"
              disabled={!hasAnySupplierQuote || submitForApprovalMutation.isPending}
              onClick={() => {
                const parseTry = (raw: string) => {
                  const s = raw.trim().replace(/\s/g, '');
                  if (!s) return null;
                  const n = s.includes(',')
                    ? Number(s.replace(/\./g, '').replace(',', '.'))
                    : Number(s);
                  return Number.isFinite(n) && n >= 0 ? n : null;
                };
                if (needsVendorShipping) {
                  const missing = shippingExcludedVendors.filter(
                    (v) => parseTry(submitVendorShipping[v.vendorId] || '') == null,
                  );
                  if (missing.length) {
                    toast.error(
                      `Nakliye bedeli girin: ${missing.map((v) => v.name).join(', ')}.`,
                    );
                    return;
                  }
                }
                submitForApprovalMutation.mutate({
                  note: submitApprovalNote.trim() || undefined,
                  vendorShippingCosts: shippingExcludedVendors.map((v) => ({
                    vendorId: v.vendorId,
                    costTRY: parseTry(submitVendorShipping[v.vendorId] || '') as number,
                  })),
                });
              }}
            >
              {submitForApprovalMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog
        open={decisionModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDecisionModal(null);
            setEscalateOnly(false);
            setDecisionNote('');
            setDecisionVendorId('');
            setDecisionExtraEmails([]);
            setSubmitVendorShipping({});
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[520px] max-h-[90dvh] overflow-y-auto border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {decisionModal === 'reject'
                ? 'Personele iade et'
                : decisionModal === 'admin-approve'
                  ? 'Üst yönetim onayı'
                  : escalateOnly || approveEscalates
                    ? 'Üst yönetime gönder'
                    : 'Teklifleri onayla'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              {decisionModal === 'reject'
                ? 'İade nedeninizi yazabilirsiniz. Kayıt personel aşamasına döner.'
                : decisionModal === 'admin-approve'
                  ? 'Onay notunuzu ekleyebilirsiniz.'
                  : escalateOnly && decisionVendor && !decisionVendor.exceedsLimit
                    ? 'Bu tutar limitin altında. Onu Teklifleri onayla ile karar sayfasında seçin.'
                  : escalateOnly || approveEscalates
                    ? 'Seçilen tutar limiti aştığı için kayıt üst yönetime iletilecek. İsterseniz yönetici CC listesinden ek kişi seçin. Cari seçmeden göndermek de üst yönetimin kalem seçimine bırakır.'
                    : 'Onaylamak istediğiniz cariyi seçin ve isteğe bağlı not ekleyin.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {decisionModal === 'approve' && (approval?.vendors || []).length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tedarikçi seçimi
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Fiyat vermediği kalemler en uygun fiyatlı tekliflerle tamamlanmış toplamdır; limit buna göre bakılır.
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {(approval?.vendors || []).map((v) => {
                    const total = Number(v.completedTotalTRY ?? v.totalTRY ?? 0);
                    const missing = Number(v.missingItemCount) || 0;
                    return (
                    <button
                      key={v.vendorId}
                      type="button"
                      onClick={() =>
                        setDecisionVendorId((prev) => (prev === v.vendorId ? '' : v.vendorId))
                      }
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                        decisionVendorId === v.vendorId
                          ? 'border-primary bg-primary/15'
                          : 'border-border/60 bg-background/40 hover:bg-background/70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{v.vendorName}</span>
                        <span
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            v.exceedsLimit ? 'text-red-400' : 'text-primary',
                          )}
                        >
                          {total.toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          ₺
                        </span>
                      </div>
                      {(missing > 0 || v.exceedsLimit) && (
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="text-muted-foreground">
                            {missing > 0
                              ? `${missing} kalem eksik · en uygun fiyatlarla tamamlandı`
                              : ''}
                          </span>
                          {v.exceedsLimit && (
                            <span className="font-semibold text-red-400">Limit üstü · üst yönetime gider</span>
                          )}
                        </div>
                      )}
                    </button>
                    );
                  })}
                    </div>
              </div>
            )}

            {decisionModal === 'approve' && req.status === 'VENDOR_QUOTED' && needsVendorShipping && (
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nakliye bedeli (TRY) *
                </label>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Nakliye hariç teklif veren her cari için ayrı bedel girin.
                </p>
                <div className="space-y-2">
                  {shippingExcludedVendors.map((v) => (
                    <div
                      key={v.vendorId}
                      className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug text-foreground">{v.name}</p>
                        {v.city ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            <MapPin className="h-3 w-3" />
                            {v.city}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Şehir yok</span>
                        )}
                      </div>
                      <Input
                        inputMode="decimal"
                        value={submitVendorShipping[v.vendorId] ?? ''}
                        onChange={(e) =>
                          setSubmitVendorShipping((prev) => ({
                            ...prev,
                            [v.vendorId]: e.target.value,
                          }))
                        }
                        placeholder={v.city ? `${v.city} nakliyesi, örn. 2500` : 'Örn. 2500'}
                        className="bg-background/50"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {decisionModal === 'approve' && approveEscalates && (
              <ExecutiveCopyRecipients
                tone="dark"
                contacts={executiveCcContacts}
                loading={executiveCcLoading}
                selectedEmails={decisionExtraEmails}
                onChange={setDecisionExtraEmails}
                canonical={canonicalExecutiveContact}
              />
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Not {decisionModal === 'reject' ? '' : '(isteğe bağlı)'}
              </label>
              <Textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  decisionModal === 'reject'
                    ? 'İade nedeni…'
                    : 'Karar notu…'
                }
                className="min-h-[96px] bg-background/50 resize-none"
              />
        </div>
      </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDecisionModal(null);
                setEscalateOnly(false);
                setDecisionNote('');
                setDecisionVendorId('');
                setDecisionExtraEmails([]);
                setSubmitVendorShipping({});
              }}
              disabled={
                managerApproveMutation.isPending ||
                adminApproveMutation.isPending ||
                rejectMutation.isPending
              }
            >
              Vazgeç
            </Button>
            <Button
              className={cn(
                'gap-2',
                decisionModal === 'reject' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              )}
              disabled={
                managerApproveMutation.isPending ||
                adminApproveMutation.isPending ||
                rejectMutation.isPending ||
                (decisionModal === 'approve' &&
                  !escalateOnly &&
                  !approval?.requiresExecutiveApproval &&
                  (approval?.vendors || []).length > 0 &&
                  !decisionVendorId) ||
                (decisionModal === 'approve' &&
                  escalateOnly &&
                  Boolean(decisionVendor) &&
                  !decisionVendor?.exceedsLimit) ||
                (decisionModal === 'approve' && (escalateOnly || approveEscalates) && !decisionExtraEmails.length)
              }
              onClick={() => {
                const note = decisionNote.trim() || undefined;
                if (decisionModal === 'reject') {
                  rejectMutation.mutate(note);
                  return;
                }
                if (decisionModal === 'admin-approve') {
                  adminApproveMutation.mutate(note);
                  return;
                }
                if (escalateOnly && decisionVendor && !decisionVendor.exceedsLimit) {
                  toast.error('Bu tutar limitin altında. Teklifleri onayla ile karar sayfasına gidin.');
                  return;
                }
                if (escalateOnly && !approveEscalates) {
                  toast.error('Limit altı onay, karar sayfasından verilir.');
                  return;
                }
                const parseTry = (raw: string) => {
                  const s = raw.trim().replace(/\s/g, '');
                  if (!s) return null;
                  const n = s.includes(',')
                    ? Number(s.replace(/\./g, '').replace(',', '.'))
                    : Number(s);
                  return Number.isFinite(n) && n >= 0 ? n : null;
                };
                let vendorShippingCosts: Array<{ vendorId: string; costTRY: number }> | undefined;
                if (req.status === 'VENDOR_QUOTED' && needsVendorShipping) {
                  const missing = shippingExcludedVendors.filter(
                    (v) => parseTry(submitVendorShipping[v.vendorId] || '') == null,
                  );
                  if (missing.length) {
                    toast.error(`Nakliye bedeli girin: ${missing.map((v) => v.name).join(', ')}.`);
                    return;
                  }
                  vendorShippingCosts = shippingExcludedVendors.map((v) => ({
                    vendorId: v.vendorId,
                    costTRY: parseTry(submitVendorShipping[v.vendorId] || '') as number,
                  }));
                }
                managerApproveMutation.mutate({
                  note,
                  approvedVendorId: decisionVendorId || undefined,
                  extraEmails: approveEscalates
                    ? escalateRecipients.extraEmails
                    : undefined,
                  includeCanonical: approveEscalates
                    ? escalateRecipients.includeCanonical
                    : undefined,
                  vendorShippingCosts,
                });
              }}
            >
              {(managerApproveMutation.isPending ||
                adminApproveMutation.isPending ||
                rejectMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {decisionModal === 'reject'
                ? 'İade et'
                : decisionModal === 'admin-approve'
                  ? 'Onayla'
                  : escalateOnly || approveEscalates
                    ? 'Gönder'
                    : 'Onayla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={execResendOpen}
        onOpenChange={(open) => {
          setExecResendOpen(open);
          if (!open) setExecResendEmails([]);
        }}
      >
        <DialogContent
          className="sm:max-w-[480px] border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Üst yönetime tekrar gönder</DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              Süresi dolmuş bağlantılar çalışmaz. İşaretlenen alıcılara bugünün kutu linki gider.
            </DialogDescription>
          </DialogHeader>
          <ExecutiveCopyRecipients
            tone="dark"
            contacts={executiveCcContacts}
            loading={executiveCcLoading}
            selectedEmails={execResendEmails}
            onChange={setExecResendEmails}
            canonical={canonicalExecutiveContact}
          />
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExecResendOpen(false)}
              disabled={resendExecutiveInboxMutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              disabled={!execResendEmails.length || resendExecutiveInboxMutation.isPending}
              onClick={() => resendExecutiveInboxMutation.mutate()}
            >
              {resendExecutiveInboxMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Tekrar gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={withdrawApprovalOpen} onOpenChange={setWithdrawApprovalOpen}>
        <DialogContent
          className="sm:max-w-[440px] border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Yetkiliye gönderimi geri al?</DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              Talep personel aşamasına döner. Tedarikçi teklif formları yeniden açılır; yetkili
              onay bekleyen listesinden çıkar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setWithdrawApprovalOpen(false)}
              disabled={withdrawFromApprovalMutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={withdrawFromApprovalMutation.isPending}
              onClick={() => withdrawFromApprovalMutation.mutate()}
            >
              {withdrawFromApprovalMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <History className="h-4 w-4" />
              )}
              Geri al
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent
          className="sm:max-w-[440px] border-border border-destructive/20"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Siparişi iptal etmek üzeresiniz</DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              Bu işlem talebi iptal edilmiş olarak işaretler ve süreç sonlanır. Geri almak için yeni bir talep oluşturmanız
              gerekir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmCancelOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={updateStatusMutation.isPending}
              onClick={() =>
                updateStatusMutation.mutate('CANCELLED', {
                  onSuccess: () => setConfirmCancelOpen(false),
                })
              }
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Evet, iptal et'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Teklif Formları Yönetimi Modalı ── */}
      <Dialog open={isQuoteDialogOpen} onOpenChange={setIsQuoteDialogOpen}>
        <DialogContent
          className="sm:max-w-[560px] border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-primary" />
              Tedarikçi Teklif Formları
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {isChannelExecutive
                ? 'Formu önizleyebilir, linki kopyalayabilir veya bildirimi tekrar gönderebilirsiniz.'
                : 'Bildirimi e-posta veya SMS ile tekrar gönderebilirsiniz.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {req.assignments?.map((assignment: any) => {
              const hasEmail = vendorHasNotificationEmails(assignment.vendor);
              const resendBusy =
                resendVendorEmailMutation.isPending || resendVendorSmsMutation.isPending;
              return (
              <div 
                key={assignment.id} 
                className="flex flex-col gap-3 p-3 rounded-lg border border-border bg-background/50 hover:bg-background transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-bold text-foreground">
                    {assignment.vendor.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Durum: {assignment.status === 'SENT' ? 'Gönderildi' : 'Beklemede'}
                  </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
                  {isChannelExecutive && assignment.quoteToken ? (
                    <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => {
                      procurementApi
                        .recordChannelAction(id, { action: 'QUOTE_LINK_PREVIEW', vendorId: assignment.vendorId })
                        .catch(() => {});
                        window.open(`/quote/${assignment.quoteToken}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Önizle
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border"
                    onClick={() => {
                        const link = `${window.location.origin}/quote/${assignment.quoteToken}`;
                        navigator.clipboard.writeText(link);
                      procurementApi
                        .recordChannelAction(id, { action: 'QUOTE_LINK_COPY', vendorId: assignment.vendorId })
                        .catch(() => {});
                        toast.success('Bağlantı kopyalandı');
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Kopyala
                  </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 gap-1.5 text-xs border-border"
                    disabled={!hasEmail || resendBusy}
                    title={!hasEmail ? 'Tedarikçi e-postası yok' : 'E-postayı tekrar gönder'}
                    onClick={() => resendVendorEmailMutation.mutate(assignment.vendorId)}
                  >
                    {resendVendorEmailMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Tekrar gönder
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                    disabled={resendBusy}
                    title="Bağlantıyı telefona gönder"
                    onClick={() => openSmsSendDialog(assignment)}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Telefona gönder
                  </Button>
                </div>
              </div>
              );
            })}
            {(!req.assignments || req.assignments.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Atanmış tedarikçi bulunamadı.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuoteDialogOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SMS gönder diyaloğu ── */}
      <Dialog
        open={Boolean(smsSendTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setSmsSendTarget(null);
            setSmsPhoneInput('');
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[420px] border-border"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Bağlantıyı telefona gönder
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {smsSendTarget?.vendorName
                ? `${smsSendTarget.vendorName} için SMS gönderimi.`
                : 'Teklif bağlantısını SMS ile gönderin.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {user?.role === 'ADMIN' ? (
              <div className="space-y-2">
                {smsSendTarget?.phone ? (
                  <p className="text-[12px] text-muted-foreground">
                    Kayıtlı numara: <span className="text-foreground font-medium">{smsSendTarget.phone}</span>
                    . İsterseniz farklı bir numaraya gönderebilirsiniz.
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    Bu tedarikçinin kayıtlı telefonu yok. Gönderilecek numarayı girin.
                  </p>
                )}
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="05xx xxx xx xx"
                  value={smsPhoneInput}
                  onChange={(e) => setSmsPhoneInput(e.target.value)}
                  className="bg-background/60"
                  autoFocus
                  />
                </div>
            ) : smsSendTarget?.phone ? (
              <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-3 text-sm text-foreground">
                Kayıtlı numara:{' '}
                <span className="font-semibold text-primary">{smsSendTarget.phone}</span>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Gönderimi onaylarsanız bağlantı bu numaraya iletilir.
                </p>
                    </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-muted-foreground">
                  Bu tedarikçinin kayıtlı telefonu yok. Gönderilecek numarayı girin.
                </p>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="05xx xxx xx xx"
                  value={smsPhoneInput}
                  onChange={(e) => setSmsPhoneInput(e.target.value)}
                  className="bg-background/60"
                  autoFocus
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                setSmsSendTarget(null);
                setSmsPhoneInput('');
                      }}
              disabled={resendVendorSmsMutation.isPending}
                    >
              Vazgeç
                    </Button>
                    <Button
              className="gap-2"
              disabled={
                resendVendorSmsMutation.isPending ||
                (user?.role === 'ADMIN'
                  ? !smsPhoneInput.trim()
                  : !smsSendTarget?.phone && !smsPhoneInput.trim())
              }
              onClick={() => {
                if (!smsSendTarget) return;
                const phone =
                  user?.role === 'ADMIN'
                    ? smsPhoneInput.trim() || undefined
                    : smsSendTarget.phone
                      ? undefined
                      : smsPhoneInput.trim() || undefined;
                resendVendorSmsMutation.mutate({
                  vendorId: smsSendTarget.vendorId,
                  phone,
                });
              }}
            >
              {resendVendorSmsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Gönder
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Personele Yönlendirme — atanan/gönderen personele otomatik */}
      <Dialog open={routeStaffDialogOpen} onOpenChange={setRouteStaffDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#D9B625]">
              <User className="w-5 h-5" />
              Personele yönlendir
            </DialogTitle>
            <DialogDescription className="text-xs text-white/60 leading-relaxed">
              Onaylanan işlem, talebi yetkiliye gönderen / atanan satın alma personeline otomatik
              yönlendirilir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteStaffDialogOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={routeToStaffMutation.isPending}
              onClick={() => routeToStaffMutation.mutate()}
              className="bg-[#D9B625] text-black font-bold hover:brightness-110"
            >
              {routeToStaffMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Yönlendir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Satın almayı tamamla — irsaliye önizleme + isteğe bağlı depo maili */}
      <Dialog
        open={completePurchaseOpen}
        onOpenChange={(open) => {
          setCompletePurchaseOpen(open);
          if (!open) {
            setCompleteDispatch(null);
            setCompleteSendWarehouseMail(false);
            setCompleteWarehouseNote('');
            setCompleteOrderConfirmed(false);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[760px] border-border max-h-[90vh] overflow-y-auto"
          style={{ background: 'hsl(0, 0%, 11%)' }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-amber-400" />
              Satın almayı tamamla
            </DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              Siparişi onaylayın. İsterseniz depocuya irsaliye maili gönderin; ardından fatura
              yüklemesi beklenir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-foreground leading-relaxed">
              {completeOrderVendorNames.length === 1 ? (
                <>
                  <span className="font-semibold text-amber-300">
                    {completeOrderVendorNames[0]}
                  </span>{' '}
                  tedarikçisinden aşağıdaki ürünleri sipariş ettiğimi onaylıyorum. Mal kabul /
                  irsaliye listesi bu cari üzerinden hazırlanmıştır.
                </>
              ) : completeOrderVendorNames.length > 1 ? (
                <>
                  <span className="font-semibold text-amber-300">
                    {completeOrderVendorNames.join(', ')}
                  </span>{' '}
                  tedarikçilerinden aşağıdaki ürünleri sipariş ettiğimi onaylıyorum.
                </>
              ) : (
                <>Aşağıdaki ürünleri sipariş ettiğimi onaylıyorum.</>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/30 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#D9B625]"
                checked={completeOrderConfirmed}
                onChange={(e) => setCompleteOrderConfirmed(e.target.checked)}
              />
              <span className="text-sm text-foreground leading-snug">
                Sipariş bilgisini kontrol ettim; tamamlamayı onaylıyorum.
              </span>
            </label>

            <div className="rounded-lg border border-border/50 bg-background/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-border/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                İrsaliye / mal kabul listesi
              </div>
              {completeDispatchLoading && !completeDispatchItems.length ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Liste hazırlanıyor…
                </div>
              ) : completeDispatchItems.length ? (
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-[1] bg-background/95 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Tedarikçi</th>
                        <th className="px-3 py-2">Ürün</th>
                        <th className="px-3 py-2 whitespace-nowrap">Miktar</th>
                        <th className="px-3 py-2 whitespace-nowrap">Fiyat</th>
                        <th className="px-3 py-2 whitespace-nowrap">KDV</th>
                        <th className="px-3 py-2 whitespace-nowrap">Vade</th>
                        <th className="px-3 py-2 whitespace-nowrap">Nakliye</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {completeDispatchGroups.map((group) =>
                        group.items.map((item: any) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 align-top">
                              <span className="font-semibold text-amber-300">{group.vendorName}</span>
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground">{item.productName}</td>
                            <td className="px-3 py-2 font-semibold text-amber-400 whitespace-nowrap">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                              {item.priceLabel || '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {item.vatLabel || '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {item.maturityLabel || '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {item.shippingLabel || '—'}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-3 py-6 text-sm text-muted-foreground text-center">Kalem bulunamadı.</p>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/30 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#D9B625]"
                checked={completeSendWarehouseMail}
                onChange={(e) => {
                  setCompleteSendWarehouseMail(e.target.checked);
                  if (e.target.checked) setWarehouseRecipientIds([]);
                }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">Depocuya mail gönder</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  İşaretlerseniz irsaliye, seçtiğiniz depocuya e-posta ile gider (varsayılan kapalı).
                </span>
              </span>
            </label>

            {completeSendWarehouseMail && (
              <div className="space-y-3 rounded-lg border border-border/50 bg-background/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Depocu seçimi
                </p>
                {warehouseContactsLoading ? (
                  <p className="text-xs text-muted-foreground">Yükleniyor…</p>
                ) : warehouseContacts.length === 0 ? (
                  <p className="text-xs text-emerald-300">
                    Kayıtlı depocu yok. Kullanıcılar ekranından “Depo Sorumlusu” unvanıyla ekleyin.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {warehouseContacts.map((person: any) => {
                      const selected = warehouseRecipientIds.includes(person.id);
                      return (
                        <label
                          key={person.id}
                          className={cn(
                            'flex items-center gap-2.5 rounded-md border px-2.5 py-2.5 cursor-pointer text-sm',
                            selected
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-border/50 hover:bg-background/60',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="accent-[#D9B625]"
                            checked={selected}
                            onChange={() => {
                              setWarehouseRecipientIds((prev) =>
                                selected
                                  ? prev.filter((x) => x !== person.id)
                                  : [...prev, person.id],
                              );
                            }}
                          />
                          <span className="min-w-0">
                            <span className="font-semibold text-foreground">
                              Depocu: {person.name}
                            </span>
                            <span className="block text-[11px] text-muted-foreground truncate">
                              {person.email}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <Textarea
                  value={completeWarehouseNote}
                  onChange={(e) => setCompleteWarehouseNote(e.target.value)}
                  placeholder="Depocuya not (isteğe bağlı)…"
                  className="min-h-[72px] bg-background/50 resize-none text-sm"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setCompletePurchaseOpen(false)}
              disabled={completePurchaseMutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-500 text-white"
              disabled={
                completePurchaseMutation.isPending ||
                !completeOrderConfirmed ||
                !completeDispatchItems.length ||
                (completeSendWarehouseMail &&
                  (warehouseContacts.length === 0 || warehouseRecipientIds.length === 0))
              }
              onClick={() =>
                completePurchaseMutation.mutate({
                  note: completeWarehouseNote.trim() || undefined,
                  sendWarehouseMail: completeSendWarehouseMail,
                  warehouseUserIds: completeSendWarehouseMail
                    ? warehouseRecipientIds
                    : undefined,
                })
              }
            >
              {completePurchaseMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Onayla ve tamamla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isRequester && (
        <MarketOfferDialog
          open={marketOfferOpen}
          onOpenChange={setMarketOfferOpen}
          requestId={id}
          items={orderedItems.map((it: any) => ({ id: it.id, productName: it.productName }))}
          initialItemId={marketOfferItemId}
        />
      )}

      {/* Depo Fiyatsız Teslimat Listesi Diyaloğu */}
      <Dialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen}>
        <DialogContent className="bg-[#1a1a1a] border border-white/10 text-white w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="min-w-0">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-400">
              <FileDown className="w-5 h-5" />
              Depo Teslimat Teslim Listesi (Fiyatsız)
            </DialogTitle>
            <DialogDescription className="text-xs text-white/60">
              Bu liste depo personelinin mal kabul yapabilmesi için fiyatlar gizlenerek hazırlanmıştır.
            </DialogDescription>
          </DialogHeader>
          {warehouseData && (
            <div className="min-w-0 py-4 space-y-4">
              <div className="p-3 bg-black/40 rounded-lg border border-white/10 flex flex-wrap justify-between items-center gap-3 text-xs">
                <div className="min-w-0">
                  <span className="text-white/40 block text-[10px]">TALEP BAŞLIĞI</span>
                  <span className="font-bold text-white">{warehouseData.title}</span>
                  {warehouseData.requesterLabel || warehouseData.requesterName ? (
                    <p className="mt-1.5 text-[11px] text-white/70">
                      <span className="text-white/40">Talep eden: </span>
                      {warehouseData.requesterLabel ||
                        [warehouseData.requesterName, warehouseData.requesterUnit].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <span className="text-white/40 block text-[10px]">DÜZENLEME TARİHİ</span>
                  <span className="text-amber-400 font-bold">
                    {format(new Date(warehouseData.dispatchDate), 'dd.MM.yyyy HH:mm')}
                  </span>
                </div>
              </div>

              <div className="min-w-0 overflow-x-auto border border-white/10 rounded-lg">
                <table className="w-full min-w-[640px] text-left text-xs text-white/80">
                  <thead className="bg-black/60 text-[10px] text-white/50 uppercase tracking-wider border-b border-white/10">
                    <tr>
                      <th className="p-2.5 whitespace-nowrap">S.No</th>
                      {showProductionMeta && <th className="p-2.5 whitespace-nowrap">Stok Kodu</th>}
                      <th className="p-2.5">Ürün Adı & Kategori</th>
                      <th className="p-2.5 whitespace-nowrap">Miktar & Birim</th>
                      <th className="p-2.5">Tedarikçi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {warehouseData.items?.map((item: any, idx: number) => (
                      <tr key={item.id} className="hover:bg-white/[0.02]">
                        <td className="p-2.5 text-white/50">{showProductionMeta ? item.serialNumber || idx + 1 : idx + 1}</td>
                        {showProductionMeta && (
                          <td className="p-2.5 font-mono text-emerald-400">{item.stockCode || '-'}</td>
                        )}
                        <td className="p-2.5">
                          <div className="font-bold text-white">{item.productName}</div>
                          <div className="text-[10px] text-white/40">{item.category}</div>
                        </td>
                        <td className="p-2.5 font-bold text-amber-400">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="p-2.5 font-semibold text-white/90">{item.vendorName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setWarehouseMailOpen(true)}
              variant="outline"
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold"
            >
              <Mail className="w-4 h-4 mr-2" />
              Depo Sorumlusuna Gönder
            </Button>
            <Button
              onClick={() => window.print()}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              Yazdır / Yazıcıya Gönder
            </Button>
            <Button variant="outline" onClick={() => setWarehouseDialogOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Depo listesi e-posta gönderimi — alıcılar kullanıcılar ekranındaki Depo Sorumlularıdır */}
      <Dialog open={warehouseMailOpen} onOpenChange={setWarehouseMailOpen}>
        <DialogContent className="bg-[#1a1a1a] border border-white/10 text-white w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-400">
              <Mail className="w-5 h-5" />
              Depo Teslim Listesini Gönder
            </DialogTitle>
            <DialogDescription className="text-xs text-white/60">
              Fiyatsız teslim listesi seçtiğiniz depo sorumlularına e-posta olarak iletilir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {warehouseContactsLoading ? (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                Depo sorumluları yükleniyor...
              </div>
            ) : warehouseContacts.length === 0 ? (
              <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200">
                Kayıtlı depo sorumlusu bulunamadı. <strong>Kullanıcılar</strong> ekranından "Depo Sorumlusu" unvanıyla
                bir kullanıcı ekleyin.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Alıcılar ({warehouseRecipientIds.length}/{warehouseContacts.length})
                </p>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {warehouseContacts.map((person) => {
                    const selected = warehouseRecipientIds.includes(person.id);
                    return (
                      <label
                        key={person.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.04]"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setWarehouseRecipientIds((prev) =>
                              prev.includes(person.id)
                                ? prev.filter((x) => x !== person.id)
                                : [...prev, person.id]
                            )
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-white">{person.name}</span>
                          <span className="block truncate font-mono text-[11px] text-white/50">{person.email}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Not (isteğe bağlı)</p>
              <Textarea
                value={warehouseMailNote}
                onChange={(e) => setWarehouseMailNote(e.target.value)}
                placeholder="Örn: Teslimat cuma günü yapılacaktır."
                className="min-h-20 bg-black/50 border-white/20 text-xs text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWarehouseMailOpen(false)}>
              Vazgeç
            </Button>
            <Button
              onClick={() => sendWarehouseMailMutation.mutate()}
              disabled={sendWarehouseMailMutation.isPending || warehouseRecipientIds.length === 0}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              {sendWarehouseMailMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              E-postayı Gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
