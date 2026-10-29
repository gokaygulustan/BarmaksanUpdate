'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/useAuthStore';
import { dashboardPersona, isSatinAlmaInbox, roleTitle } from '@/lib/access';
import {
  ClipboardList,
  Building2,
  Users,
  Plus,
  TrendingUp,
  FileEdit,
  ArrowRight,
  Clock,
  Inbox,
  FilePlus2,
  ScrollText,
  History,
  Store,
  CheckCircle2,
} from 'lucide-react';
import { CountUp } from '@/components/CountUp';
import { Skeleton } from '@/components/page/Skeleton';
import { SmokeText } from '@/components/SmokeText';
import { StatusGlyph, statusTone } from '@/components/StatusGlyph';
import { Windmill } from '@/components/brand/Windmill';
import { PervanePattern } from '@/components/brand/Pervane';
import { useQuery } from '@tanstack/react-query';
import { procurementApi, usersApi, internalRequestsApi } from '@/lib/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';
import { PROCUREMENT_STATUS_LABELS } from '@/lib/procurementStatus';

const statusLabel: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: PROCUREMENT_STATUS_LABELS.DRAFT, color: 'hsl(0,0%,65%)', bg: 'hsl(0,0%,18%)' },
  SENT_TO_VENDOR: {
    label: PROCUREMENT_STATUS_LABELS.SENT_TO_VENDOR,
    color: 'hsl(152, 85%, 55%)',
    bg: 'hsl(152, 40%, 14%)',
  },
  VENDOR_QUOTED: {
    label: PROCUREMENT_STATUS_LABELS.VENDOR_QUOTED,
    color: 'hsl(48, 55%, 52%)',
    bg: 'hsl(48, 35%, 12%)',
  },
  VENDOR_APPROVED: {
    label: PROCUREMENT_STATUS_LABELS.VENDOR_APPROVED,
    color: 'hsl(48, 60%, 48%)',
    bg: 'hsl(48, 35%, 12%)',
  },
  PENDING_MANAGER_APPROVAL: {
    label: PROCUREMENT_STATUS_LABELS.PENDING_MANAGER_APPROVAL,
    color: 'hsl(152, 88%, 52%)',
    bg: 'hsl(152, 40%, 14%)',
  },
  PENDING_ADMIN_APPROVAL: {
    label: PROCUREMENT_STATUS_LABELS.PENDING_ADMIN_APPROVAL,
    color: 'hsl(152, 88%, 52%)',
    bg: 'hsl(152, 40%, 14%)',
  },
  RETURNED_TO_MANAGER: {
    label: PROCUREMENT_STATUS_LABELS.RETURNED_TO_MANAGER,
    color: 'hsl(0,72%,58%)',
    bg: 'hsl(0,35%,14%)',
  },
  APPROVED_FOR_PURCHASE: {
    label: PROCUREMENT_STATUS_LABELS.APPROVED_FOR_PURCHASE,
    color: 'hsl(48, 55%, 48%)',
    bg: 'hsl(48, 35%, 12%)',
  },
  HAS_ISSUES: {
    label: PROCUREMENT_STATUS_LABELS.HAS_ISSUES,
    color: 'hsl(0,72%,55%)',
    bg: 'hsl(0,35%,14%)',
  },
  IN_PRODUCTION: {
    label: PROCUREMENT_STATUS_LABELS.IN_PRODUCTION,
    color: 'hsl(48, 45%, 52%)',
    bg: 'hsl(48, 30%, 12%)',
  },
  COMPLETED: {
    label: PROCUREMENT_STATUS_LABELS.COMPLETED,
    color: 'hsl(48, 60%, 46%)',
    bg: 'hsl(48, 35%, 12%)',
  },
  CANCELLED: {
    label: PROCUREMENT_STATUS_LABELS.CANCELLED,
    color: 'hsl(0,0%,55%)',
    bg: 'hsl(0,0%,16%)',
  },
};

type Proc = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  createdBy?: { name?: string };
  quoteRoundComplete?: boolean;
};

type Stat = { label: string; unit?: string; value: number; icon: LucideIcon; color: string; sub: string; href: string };
type Shortcut = { href: string; icon: LucideIcon; label: string; desc: string };
type Agenda = { href: string; icon: LucideIcon; title: string; count: number; body: string; tone: string };

/** Masaüstünde sayı sütunları tek sıra; geniş ekranda ilki iki kat geniş. */
const STAT_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2 2xl:grid-cols-3',
  3: 'lg:grid-cols-3 2xl:grid-cols-4',
  4: 'lg:grid-cols-4 2xl:grid-cols-5',
};

/** Bekleyenler payları: altın ailesinden sakin tonlar (yeşil yok). */
const AGENDA_SHADES = ['#d9b625', '#e9d891', '#a8923f', '#8e8e94', '#5f5f66'];

/** Panodaki parlak yeşilleri markanın sıcak tonuna çeker; altın, gri ve kırmızı aynen kalır. */
function calmTone(color: string) {
  const hue = Number(/hsl\(\s*(\d+)/.exec(color)?.[1] ?? -1);
  return hue >= 90 && hue <= 170 ? '#e9d891' : color;
}

function countStatus(rows: Proc[], statuses: string[]) {
  return rows.filter((p) => statuses.includes(p.status)).length;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const persona = dashboardPersona(user);
  const showBirim =
    isSatinAlmaInbox(user) ||
    (user?.role === 'PURCHASING' && user.moduleId === 'URETIM_PLANLAMA');
  const firstName = user?.name?.split(' ')[0] || '';

  const { data: procurements = [], isLoading: procurementsLoading } = useQuery({
    queryKey: ['procurement'],
    queryFn: async () => ((await procurementApi.getAll()).data || []) as Proc[],
  });

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => ((await usersApi.getAll()).data || []) as unknown[],
    enabled: persona === 'admin',
  });

  const { data: boardCounts = {}, isLoading: boardLoading } = useQuery({
    queryKey: ['sa-inbox-counts', 'dashboard'],
    queryFn: async () => ((await internalRequestsApi.boardCounts()).data || {}) as Record<string, number>,
    enabled: showBirim,
  });

  // Veri gelene kadar sayılar ve bekleyenler iskelet olarak durur (sıfır yanıp sönmez).
  const loading = procurementsLoading || (persona === 'admin' && usersLoading) || (showBirim && boardLoading);

  const activeRfqs = procurements.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status)).length;
  const quoted = countStatus(procurements, ['VENDOR_QUOTED']);
  const drafts = countStatus(procurements, ['DRAFT']);
  const awaitingVendor = countStatus(procurements, ['SENT_TO_VENDOR']);
  const priceApproval = countStatus(procurements, ['PENDING_MANAGER_APPROVAL', 'RETURNED_TO_MANAGER']);
  const execApproval = countStatus(procurements, ['PENDING_ADMIN_APPROVAL']);
  const inSupply = countStatus(procurements, ['IN_PRODUCTION', 'APPROVED_FOR_PURCHASE', 'VENDOR_APPROVED']);
  const quoteRoundsDone = procurements.filter((p) => p.quoteRoundComplete).length;
  const review = boardCounts.review ?? 0;
  const decision = boardCounts.decision ?? 0;
  const sourcing = boardCounts.sourcing ?? 0;

  const copy: Record<
    typeof persona,
    { badge: string; intro: string; cta: { href: string; label: string; icon: LucideIcon }; cta2?: { href: string; label: string } }
  > = {
    admin: {
      badge: 'Sistem yöneticisi',
      intro: 'Birim tedarik talepleri, tedarikçi talepleri ve hesaplar aynı yerde.',
      cta: { href: '/internal-requests', label: 'Birim Tedarik Talepleri', icon: Inbox },
      cta2: { href: '/procurement/new', label: 'Tedarikçi Talebi Oluştur' },
    },
    'sa-manager': {
      badge: 'Satın Alma Birimi Yetkilisi',
      intro: 'Gelen birim taleplerini inceleyin, personel atayın, teklifleri onaylayın.',
      cta: { href: '/internal-requests', label: 'Birim Tedarik Talepleri', icon: Inbox },
      cta2: { href: '/procurement/new', label: 'Tedarikçi Talebi Oluştur' },
    },
    'sa-staff': {
      badge: 'Satın Alma Birimi Personeli',
      intro: 'Size atanan birim talepleri ve tedarikçi teklifleri. Yeni iş yetkili onayından sonra teklif toplanır.',
      cta: { href: '/internal-requests', label: 'Birim Tedarik Talepleri', icon: Inbox },
      cta2: { href: '/procurement/new', label: 'Yetkiliye talep' },
    },
    production: {
      badge: roleTitle(user),
      intro:
        user?.moduleId === 'URETIM_PLANLAMA' && user?.subRole === 'MANAGER'
          ? 'Personelin taleplerini onaylayın, teklifleri karşılaştırın, kararı üst yönetime iletin.'
          : user?.moduleId === 'URETIM_PLANLAMA'
            ? 'Talebi birim yetkilisi onayladıktan sonra tedarikçilere gönderin.'
            : 'Tedarikçiden fiyat toplayın, teklifleri karşılaştırın.',
      cta:
        user?.moduleId === 'URETIM_PLANLAMA' && user?.subRole !== 'MANAGER'
          ? { href: '/procurement/new', label: 'Yetkiliye talep', icon: FilePlus2 }
          : { href: '/procurement/new', label: 'Tedarikçi Talebi Oluştur', icon: FilePlus2 },
      cta2:
        user?.moduleId === 'URETIM_PLANLAMA'
          ? { href: '/internal-requests', label: user.subRole === 'MANAGER' ? 'Birim talepleri' : 'Birim taleplerim' }
          : { href: '/procurement', label: 'Tedarikçi Talepleri' },
    },
    supplier: {
      badge: user?.vendor?.name || 'Tedarikçi',
      intro: 'Size gelen taleplere teklif verin. Süre dolmuş bağlantılar yalnızca okunur.',
      cta: { href: '/procurement', label: 'Teklif Verme', icon: ScrollText },
    },
    department: {
      badge: 'Birim kullanıcısı',
      intro: 'Satın alma taleplerinizi Taleplerim’den iletin.',
      cta: { href: '/taleplerim', label: 'Taleplerim', icon: ClipboardList },
      cta2: { href: '/taleplerim/yeni', label: 'Yeni talep' },
    },
  };

  const stats: Record<typeof persona, Stat[]> = {
    admin: [
      { label: 'İnceleme bekleyen birim', unit: 'Bekleyen', value: review, icon: Inbox, color: 'hsl(48, 55%, 48%)', sub: 'Birim Tedarik Talepleri', href: '/internal-requests' },
      { label: 'Aktif tedarikçi talepleri', value: activeRfqs, icon: ScrollText, color: 'hsl(48, 55%, 48%)', sub: 'Tedarikçi Talepleri', href: '/procurement' },
      { label: 'Tamamlanan teklifler', value: quoteRoundsDone, icon: CheckCircle2, color: 'hsl(142,50%,60%)', sub: 'Herkes fiyat verdi / süre doldu', href: '/procurement?round=complete' },
      { label: 'Sistem kullanıcıları', value: allUsers.length, icon: Users, color: 'hsl(152, 70%, 58%)', sub: 'Hesaplar', href: '/settings/users' },
    ],
    'sa-manager': [
      { label: 'İnceleme bekleyen', value: review, icon: Inbox, color: 'hsl(48, 55%, 48%)', sub: 'Birim Tedarik Talepleri', href: '/internal-requests' },
      { label: 'Karar bekleyen', value: decision, icon: ClipboardList, color: 'hsl(48, 55%, 48%)', sub: 'Birim talebi kararı', href: '/internal-requests' },
      { label: 'Tamamlanan teklifler', value: quoteRoundsDone, icon: CheckCircle2, color: 'hsl(142,50%,60%)', sub: 'Herkes fiyat verdi / süre doldu', href: '/procurement?round=complete' },
    ],
    'sa-staff': [
      { label: 'Birim tedarik talepleri', value: decision + sourcing, icon: Inbox, color: 'hsl(48, 55%, 48%)', sub: 'Atananlar', href: '/internal-requests' },
      { label: 'Tamamlanan teklifler', value: quoteRoundsDone, icon: CheckCircle2, color: 'hsl(142,50%,60%)', sub: 'Karşılaştır', href: '/procurement?round=complete' },
      { label: 'Taslak talep', value: drafts, icon: FileEdit, color: 'hsl(0,0%,62%)', sub: 'Gönderilmedi', href: '/procurement' },
    ],
    production: [
      { label: 'Aktif tedarikçi talepleri', value: activeRfqs, icon: ScrollText, color: 'hsl(48, 55%, 48%)', sub: 'Sizin hattınız', href: '/procurement' },
      { label: 'Tamamlanan teklifler', value: quoteRoundsDone, icon: CheckCircle2, color: 'hsl(142,50%,60%)', sub: 'Herkes fiyat verdi / süre doldu', href: '/procurement?round=complete' },
      { label: 'Taslak', value: drafts, icon: FileEdit, color: 'hsl(0,0%,62%)', sub: 'Henüz iletilmedi', href: '/procurement' },
    ],
    supplier: [
      { label: 'Bana gelen talepler', value: activeRfqs, icon: ScrollText, color: 'hsl(48, 55%, 48%)', sub: 'Teklif Verme', href: '/procurement' },
      { label: 'Teklif beklenen', value: awaitingVendor, icon: Clock, color: 'hsl(152, 80%, 60%)', sub: 'Cevapsız', href: '/procurement' },
      { label: 'Teklif verdiğim', value: quoted + inSupply, icon: ClipboardList, color: 'hsl(142,50%,60%)', sub: 'Süreçte', href: '/procurement' },
    ],
    department: [
      { label: 'Taleplerim', value: 0, icon: ClipboardList, color: 'hsl(48, 55%, 48%)', sub: 'Pano', href: '/taleplerim' },
    ],
  };

  const shortcuts: Record<typeof persona, Shortcut[]> = {
    admin: [
      { href: '/internal-requests', icon: Inbox, label: 'Birim Tedarik Talepleri', desc: 'İç kuyruk' },
      { href: '/procurement/new', icon: FilePlus2, label: 'Tedarikçi Talebi Oluştur', desc: 'Teklif topla' },
      { href: '/vendors', icon: Store, label: 'Tedarikçi Listesi', desc: 'Firma listesi' },
      { href: '/settings/users', icon: Users, label: 'Kullanıcılar', desc: 'Yetki ve hesap' },
    ],
    'sa-manager': [
      { href: '/internal-requests', icon: Inbox, label: 'Birim Tedarik Talepleri', desc: 'İnceleme / karar' },
      { href: '/procurement/new', icon: FilePlus2, label: 'Tedarikçi Talebi Oluştur', desc: 'Teklif topla' },
      { href: '/procurement', icon: ScrollText, label: 'Tedarikçi Talepleri', desc: 'Talep listesi' },
      { href: '/vendors', icon: Building2, label: 'Tedarikçi Listesi', desc: 'Firmalar' },
    ],
    'sa-staff': [
      { href: '/internal-requests', icon: Inbox, label: 'Birim Tedarik Talepleri', desc: 'Atananlar' },
      { href: '/procurement/new', icon: FilePlus2, label: 'Yetkiliye talep', desc: 'Mahmut’a ilet' },
      { href: '/procurement', icon: ScrollText, label: 'Tedarikçi Talepleri', desc: 'Talep listesi' },
      { href: '/vendor-history', icon: History, label: 'Cari Tedarik Geçmişi', desc: 'Eski fiyatlar' },
    ],
    production:
      user?.moduleId === 'URETIM_PLANLAMA' && user?.subRole === 'MANAGER'
        ? [
            { href: '/internal-requests', icon: Inbox, label: 'Birim Tedarik Talepleri', desc: 'Personel talepleri' },
            { href: '/procurement/new', icon: FilePlus2, label: 'Tedarikçi Talebi Oluştur', desc: 'Teklif topla' },
            { href: '/procurement', icon: ScrollText, label: 'Tedarikçi Talepleri', desc: 'Sizin listeler' },
            { href: '/vendors', icon: Store, label: 'Tedarikçi Listesi', desc: 'Firmalar' },
            { href: '/analysis-reports', icon: TrendingUp, label: 'Analiz Raporları', desc: 'Teklif kıyası' },
          ]
        : user?.moduleId === 'URETIM_PLANLAMA'
          ? [
              { href: '/procurement/new', icon: FilePlus2, label: 'Yetkiliye talep', desc: 'Birim yetkilisine ilet' },
              { href: '/internal-requests', icon: Inbox, label: 'Birim taleplerim', desc: 'Onay ve atama' },
              { href: '/procurement', icon: ScrollText, label: 'Tedarikçi Talepleri', desc: 'Sizin listeler' },
              { href: '/vendors', icon: Store, label: 'Tedarikçi Listesi', desc: 'Firmalar' },
              { href: '/analysis-reports', icon: TrendingUp, label: 'Analiz Raporları', desc: 'Teklif kıyası' },
            ]
          : [
              { href: '/procurement/new', icon: FilePlus2, label: 'Tedarikçi Talebi Oluştur', desc: 'Teklif topla' },
              { href: '/procurement', icon: ScrollText, label: 'Tedarikçi Talepleri', desc: 'Sizin listeler' },
              { href: '/vendors', icon: Store, label: 'Tedarikçi Listesi', desc: 'Firmalar' },
              { href: '/analysis-reports', icon: TrendingUp, label: 'Analiz Raporları', desc: 'Teklif kıyası' },
            ],
    supplier: [
      { href: '/procurement', icon: ScrollText, label: 'Teklif Verme', desc: 'Teklif ver' },
    ],
    department: [
      { href: '/taleplerim', icon: ClipboardList, label: 'Taleplerim', desc: 'Pano' },
      { href: '/taleplerim/yeni', icon: Plus, label: 'Yeni talep', desc: 'Satın almaya ilet' },
    ],
  };

  const agenda: Agenda[] = [];
  if (showBirim && review > 0) {
    agenda.push({
      href: '/internal-requests',
      icon: Inbox,
      title: 'Birim talebi incelemesi',
      count: review,
      body: 'İletilmiş, henüz karar verilmemiş birim talebi.',
      tone: 'hsl(48, 55%, 48%)',
    });
  }
  if (showBirim && decision > 0 && (persona === 'sa-manager' || persona === 'admin')) {
    agenda.push({
      href: '/internal-requests',
      icon: ClipboardList,
      title: 'Birim talebi kararı',
      count: decision,
      body: 'Onaylanıp işleme alınması veya reddi beklenenler.',
      tone: 'hsl(48, 55%, 48%)',
    });
  }
  if (quoteRoundsDone > 0 && persona !== 'department' && persona !== 'supplier') {
    agenda.push({
      href: '/procurement?round=complete',
      icon: CheckCircle2,
      title: 'Tamamlanan teklifler',
      count: quoteRoundsDone,
      body: 'Tüm firmalar fiyat verdi veya teklif süresi doldu. Karşılaştırmaya hazır.',
      tone: 'hsl(142, 50%, 58%)',
    });
  } else if (quoted > 0 && persona !== 'department') {
    agenda.push({
      href: '/procurement',
      icon: ScrollText,
      title: persona === 'supplier' ? 'Teklifiniz alındı' : 'Teklifler değerlendirmede',
      count: quoted,
      body: persona === 'supplier' ? 'Girdiğiniz teklifler satın almada.' : 'Tedarikçi fiyat verdi, karşılaştırma bekliyor.',
      tone: 'hsl(48, 55%, 48%)',
    });
  }
  if (priceApproval > 0 && (persona === 'sa-manager' || persona === 'admin' || persona === 'production')) {
    agenda.push({
      href: '/procurement',
      icon: Clock,
      title: 'Yetkili onayı',
      count: priceApproval,
      body: 'Yetkili onayı bekleyen teklif toplamı.',
      tone: 'hsl(48, 55%, 48%)',
    });
  }
  if (execApproval > 0 && (persona === 'admin' || persona === 'sa-manager')) {
    agenda.push({
      href: '/procurement',
      icon: Users,
      title: 'Üst yönetim onayı',
      count: execApproval,
      body: 'Limit aşıldı. Onay sizin veya üst yönetimde.',
      tone: 'hsl(152, 85%, 52%)',
    });
  }
  if (awaitingVendor > 0 && persona === 'supplier') {
    agenda.push({
      href: '/procurement',
      icon: Clock,
      title: 'Cevap beklenen',
      count: awaitingVendor,
      body: 'Firmanıza fiyat soruldu, henüz teklif yok.',
      tone: 'hsl(152, 80%, 60%)',
    });
  }
  if (drafts > 0 && persona !== 'supplier' && persona !== 'department') {
    agenda.push({
      href: '/procurement',
      icon: FileEdit,
      title: 'Taslak tedarikçi talebi',
      count: drafts,
      body: 'Tedarikçiye henüz gitmedi.',
      tone: 'hsl(0,0%,62%)',
    });
  }

  const recent = [...procurements]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const view = copy[persona];
  const CtaIcon = view.cta.icon;

  const agendaTotal = agenda.reduce((sum, item) => sum + item.count, 0);
  const today = new Date();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      {/* ── Karşılama: kutu yok, doğrudan panelin üstünde (arkada sayfanın altın sızıntısı) ── */}
      <section data-tour="dash-hero" className="relative pb-2 pt-4 sm:pt-6 lg:pt-8">
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-4 text-[14px] text-white/45">{view.badge}</p>
            <h1 className="text-[34px] font-medium leading-[1.06] tracking-[-0.035em] text-white sm:text-[42px] lg:text-[50px]">
              <span className="block">
                <SmokeText text={`Hoş geldiniz${firstName ? ',' : ''}`} />
              </span>
              {firstName ? (
                <span className="block text-white/75">
                  <SmokeText text={firstName} />
                </span>
              ) : null}
            </h1>
            <p className="fx-rise mt-5 max-w-xl text-[15.5px] leading-relaxed text-white/55">{view.intro}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={view.cta.href}
                className="press group/cta inline-flex h-12 items-center gap-2.5 rounded-[11px] bg-primary pl-5 pr-4 text-[14.5px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-[#e4c43c]"
              >
                <CtaIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                <span className="roll">
                  <span>{view.cta.label}</span>
                  <span aria-hidden>{view.cta.label}</span>
                </span>
                <span className="ml-1 flex size-7 items-center justify-center rounded-[7px] bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/cta:translate-x-0.5 group-hover/cta:-rotate-45">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
              {view.cta2 && (
                <Link
                  href={view.cta2.href}
                  className="wave-btn press inline-flex h-12 items-center rounded-[11px] border border-white/12 px-5 text-[14.5px] font-medium text-white/80 [--wave-fill:#f2f2ef] [--wave-ink:#141416]"
                >
                  {view.cta2.label}
                </Link>
              )}
            </div>
          </div>

          {/* Bugün: sakin, tipografik bir tarih bloğu */}
          <div className="hidden shrink-0 text-right lg:block">
            {/* Marka değirmeni: tarihin üstünde, ince çizgili ve çok yavaş döner (rakamın 200 ağırlığıyla aynı incelik). */}
            <Windmill className="mb-6 ml-auto block size-[104px] text-brand" />
            <p className="text-[84px] font-[200] leading-[0.85] tracking-[-0.05em] text-white tabular-nums">
              {format(today, 'dd')}
            </p>
            <p className="mt-3 text-[14px] font-medium capitalize text-white/70">
              {format(today, 'MMMM yyyy', { locale: tr })}
            </p>
            <p className="text-[13px] capitalize text-white/38">{format(today, 'EEEE', { locale: tr })}</p>
          </div>
        </div>
      </section>

      {/* ── Bento: solda öne çıkan sayı + küçük sayılar, kısayollar ve son talepler; sağda boydan
       * boya Bekleyenler. Her kutu kendi işini yapar, aynı kartın tekrarı değil. ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        {/* Sayılar: tek sıra; ilki iki kat geniş ve desenli, diğerleri eşit. */}
        <div
          data-tour="dash-stats"
          className={`grid grid-cols-2 gap-3 lg:col-span-8 lg:gap-4 ${STAT_COLS[stats[persona].length] ?? 'lg:grid-cols-4'}`}
        >
          {stats[persona].map((stat, i) => {
            const Icon = stat.icon;
            const featured = i === 0 && stats[persona].length > 1;
            const tone = calmTone(stat.color);
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className={`bento-tile gold-fade group/stat @container relative flex min-h-[176px] flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card p-5 sm:p-6 ${
                  featured ? 'col-span-2 lg:col-span-1 2xl:col-span-2' : stats[persona].length === 1 ? 'col-span-2 lg:col-span-1' : 'col-span-1'
                }`}
              >
                {featured ? (
                  <PervanePattern
                    animated
                    scale={0.8}
                    className="bento-pattern pointer-events-none absolute inset-0 text-brand opacity-[0.08]"
                  />
                ) : null}
                <span
                  aria-hidden
                  className="absolute inset-x-6 bottom-0 h-[2px] origin-left scale-x-0 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/stat:scale-x-100"
                  style={{ background: tone }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: tone }} strokeWidth={1.8} />
                  <ArrowRight className="h-4 w-4 shrink-0 -translate-x-1.5 -rotate-45 text-brand opacity-0 transition-[opacity,transform] duration-300 group-hover/stat:translate-x-0 group-hover/stat:opacity-100" />
                </div>
                {/* Sayılar aynı hizada: etiket kaç satır olursa olsun yukarıda sabit. */}
                <div className="relative mt-5 flex h-[52px] items-baseline gap-7 transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/stat:-translate-y-1">
                  {loading ? (
                    <Skeleton className="h-[40px] w-[88px] rounded-[12px]" style={{ '--i': i } as React.CSSProperties} />
                  ) : (
                    <CountUp
                      value={stat.value}
                      className="block text-[52px] font-[200] leading-[0.85] tracking-[-0.05em] text-white tabular-nums"
                    />
                  )}
                  {stat.unit && !loading ? (
                    // Rakamın tam ortasına: 52 px'lik "2"nin mürekkebi 38 px; yazının büyük harf ortası onun
                    // ortasına gelsin diye taban çizgisinden yukarı kaydırılır. Kart darsa (tek sütun) sığmaz,
                    // kesilmek yerine görünmez.
                    <span className="hidden -translate-y-[9px] text-[28px] font-[300] tracking-[-0.02em] text-white @min-[220px]:block">
                      {stat.unit}
                    </span>
                  ) : null}
                </div>
                <div className="relative mt-auto pt-4">
                  <p className="text-[13px] font-medium leading-snug text-white/75 transition-colors duration-200 group-hover/stat:text-white">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-white/38">{stat.sub}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ── Bekleyenler ────────────────────────────────────────────────────────────
         * Sağda boydan boya. Üstte toplam ve işlerin payları (altın tonlarında tek şerit, renk
         * anahtarı satırlarda); altında her iş bir satır: solda hizalı sayı sütunu, sağda başlık ve
         * açıklama. Üzerine gelince satırın payı şeritte öne çıkar, ok kayarak gelir. */}
        <aside
          data-tour="dash-agenda"
          className={`bento-tile relative isolate flex flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card lg:col-span-4 ${
            persona !== 'department' ? 'lg:row-span-3' : 'lg:row-span-2'
          }`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[240px] bg-[linear-gradient(180deg,rgba(217,182,37,0.1),rgba(217,182,37,0.025)_55%,transparent)]"
          />
          <Windmill className="pointer-events-none absolute -bottom-40 -right-32 -z-10 size-[420px] text-brand opacity-[0.07]" />

          <div className="px-6 pt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Bekleyenler</h3>
              {agenda.length > 0 && <span className="text-[12px] text-white/40 tabular-nums">{agenda.length} başlık</span>}
            </div>

            <div className="mt-6 flex items-baseline gap-3">
              {loading ? (
                <>
                  <Skeleton className="h-[52px] w-[104px] rounded-[14px]" />
                  <Skeleton className="h-3 w-24 rounded-full" style={{ '--i': 1 } as React.CSSProperties} />
                </>
              ) : (
                <>
                  <CountUp
                    value={agendaTotal}
                    className="text-[64px] font-[200] leading-none tracking-[-0.05em] text-white tabular-nums"
                  />
                  <span className="text-[14px] text-white/45">{agendaTotal > 0 ? 'iş sizi bekliyor' : 'bekleyen iş yok'}</span>
                </>
              )}
            </div>

            {!loading && agenda.length > 0 && (
              <div className="mt-5 flex h-[5px] gap-[3px]" aria-hidden>
                {agenda.map((item, i) => (
                  <span
                    key={item.title}
                    data-agenda-seg={i}
                    className="agenda-seg h-full rounded-full transition-opacity duration-300 ease-out"
                    style={{
                      background: AGENDA_SHADES[i % AGENDA_SHADES.length],
                      flexGrow: Math.max(item.count, agendaTotal * 0.05),
                      animationDelay: `${200 + i * 70}ms`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div aria-hidden className="mt-6 border-t border-hairline">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-3 border-b border-hairline px-6 py-4 last:border-b-0">
                  <Skeleton className="h-7 w-9 rounded-[10px]" style={{ '--i': i } as React.CSSProperties} />
                  <div className="space-y-2.5 pt-0.5">
                    <Skeleton className="h-3.5 rounded-full" style={{ '--i': i + 1, width: `${70 - i * 8}%` } as React.CSSProperties} />
                    <Skeleton className="h-3 w-4/5 rounded-full opacity-70" style={{ '--i': i + 2 } as React.CSSProperties} />
                  </div>
                </div>
              ))}
            </div>
          ) : agenda.length === 0 ? (
            <div className="mx-6 mt-6 flex flex-1 flex-col items-center justify-center border-t border-hairline py-12 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-brand/30 text-brand">
                <CheckCircle2 className="h-5 w-5" strokeWidth={1.7} />
              </div>
              <p className="text-[14.5px] font-medium text-white">Şu an bekleyen iş yok.</p>
              <p className="mt-1 text-[13px] text-white/40">Yeni bir iş geldiğinde burada görünür.</p>
            </div>
          ) : (
            <ul className="stagger mt-6 border-t border-hairline">
              {agenda.map((item, i) => (
                <li key={item.title} className="border-b border-hairline last:border-b-0">
                  <Link
                    href={item.href}
                    onPointerEnter={(e) => {
                      const root = e.currentTarget.closest('[data-tour="dash-agenda"]');
                      root?.querySelectorAll<HTMLElement>('[data-agenda-seg]').forEach((seg) => {
                        seg.style.opacity = seg.dataset.agendaSeg === String(i) ? '1' : '0.18';
                      });
                    }}
                    onPointerLeave={(e) => {
                      const root = e.currentTarget.closest('[data-tour="dash-agenda"]');
                      root?.querySelectorAll<HTMLElement>('[data-agenda-seg]').forEach((seg) => {
                        seg.style.opacity = '';
                      });
                    }}
                    className="gold-fade gold-fade-x group/item grid grid-cols-[56px_minmax(0,1fr)_16px] items-start gap-x-3 px-6 py-4"
                  >
                    <CountUp
                      value={item.count}
                      className="text-[28px] font-[250] leading-none tracking-[-0.04em] text-brand-ink tabular-nums transition-transform duration-300 ease-out group-hover/item:translate-x-0.5"
                    />
                    <div className="min-w-0 pt-0.5">
                      <p className="flex items-center gap-2 text-[14px] font-medium leading-snug text-white">
                        <span
                          aria-hidden
                          className="size-[7px] shrink-0 rounded-[2px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/item:scale-125"
                          style={{ background: AGENDA_SHADES[i % AGENDA_SHADES.length] }}
                        />
                        <span className="truncate">{item.title}</span>
                      </p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-white/42">{item.body}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 -translate-x-1 text-white/20 transition-[transform,color] duration-300 ease-out group-hover/item:translate-x-0 group-hover/item:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Kısayollar: tek kutu, içinde ince çizgilerle ayrılmış sütunlar. */}
        {shortcuts[persona].length > 0 && (
          <section
            data-tour="dash-shortcuts"
            className="bento-tile overflow-hidden rounded-[22px] border border-white/[0.07] bg-card lg:col-span-8"
          >
            <div className="flex items-baseline justify-between px-6 pb-4 pt-5">
              <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Kısayollar</h3>
              <span className="text-[12px] text-white/35 tabular-nums">{shortcuts[persona].length}</span>
            </div>
            <div className="grid grid-cols-1 gap-px border-t border-hairline bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {shortcuts[persona].map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className="gold-fade group/sc relative flex flex-col gap-5 bg-card p-5 sm:p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.03] text-brand">
                      <span
                        aria-hidden
                        className="absolute inset-0 origin-bottom scale-y-0 bg-brand transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/sc:scale-y-100"
                      />
                      <item.icon
                        className="relative h-[18px] w-[18px] transition-[color,transform] duration-300 group-hover/sc:scale-110 group-hover/sc:text-[#141416]"
                        strokeWidth={1.8}
                      />
                    </div>
                    <ArrowRight className="h-4 w-4 -translate-x-1.5 -rotate-45 text-brand opacity-0 transition-[opacity,transform] duration-300 group-hover/sc:translate-x-0 group-hover/sc:opacity-100" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium leading-snug text-white">{item.label}</p>
                    <p className="mt-1 text-[12.5px] text-white/40">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Son tedarikçi talepleri */}
        {persona !== 'department' && (
          <section
            data-tour="dash-recent"
            className="bento-tile overflow-hidden rounded-[22px] border border-white/[0.07] bg-card lg:col-span-8"
          >
            <div className="flex items-baseline justify-between px-6 pb-4 pt-5">
              <h3 className="text-[15px] font-medium tracking-[-0.012em] text-white">Son tedarikçi talepleri</h3>
              {recent.length ? <span className="text-[12px] text-white/35 tabular-nums">{recent.length} kayıt</span> : null}
            </div>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center border-t border-hairline py-16 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-white/10">
                  <ClipboardList className="h-5 w-5 text-white/35" strokeWidth={1.7} />
                </div>
                <p className="text-[15px] font-medium">Henüz kayıt yok</p>
                <p className="mt-1 text-[13.5px] text-white/45">
                  {persona === 'supplier'
                    ? 'Size talep geldiğinde burada görünür.'
                    : 'Tedarikçi talebi oluşturulunca burada birikir.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05] border-t border-hairline">
                {recent.map((p) => {
                  const s = statusLabel[p.status] || { label: (PROCUREMENT_STATUS_LABELS as Record<string, string>)[p.status] ?? p.status, color: 'hsl(0,0%,55%)', bg: 'transparent' };
                  return (
                    <Link
                      key={p.id}
                      href={p.status === 'DRAFT' ? `/procurement/new?edit=${p.id}` : `/procurement/${p.id}`}
                      className="gold-fade gold-fade-x group/row relative flex items-center justify-between gap-4 px-6 py-4"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-3 left-0 w-[2px] origin-center scale-y-0 rounded-r-full bg-brand transition-transform duration-300 ease-out group-hover/row:scale-y-100"
                      />
                      <div className="min-w-0 transition-transform duration-300 ease-out group-hover/row:translate-x-1">
                        <p className="truncate text-[14px] font-medium text-white">{p.title}</p>
                        <div className="mt-1 flex items-center gap-2 text-[12px] text-white/40">
                          {p.createdBy?.name && (
                            <>
                              <span>{p.createdBy.name}</span>
                              <span className="size-[3px] rounded-full bg-white/25" aria-hidden />
                            </>
                          )}
                          <span className="tabular-nums">{format(new Date(p.createdAt), 'dd MMM yyyy', { locale: tr })}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="hidden items-center gap-2.5 text-[12.5px] font-medium sm:inline-flex" style={{ color: statusTone(p.status) }}>
                          <span
                            className="flex size-8 items-center justify-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/row:scale-110"
                            style={{ background: `${statusTone(p.status)}17`, boxShadow: `inset 0 0 0 1px ${statusTone(p.status)}33` }}
                          >
                            <StatusGlyph status={p.status} className="size-[18px]" />
                          </span>
                          {s.label}
                        </span>
                        <ArrowRight className="h-4 w-4 text-white/25 transition-[transform,color] duration-300 ease-out group-hover/row:translate-x-1 group-hover/row:text-brand" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
