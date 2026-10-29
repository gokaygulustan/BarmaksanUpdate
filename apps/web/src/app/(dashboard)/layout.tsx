'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  ClipboardList,
  Inbox,
  FilePlus2,
  ScrollText,
  Store,
  History,
  BarChart3,
  Lock,
  ArrowRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  LucideIcon,
  Settings,
  CircleHelp,
  Eye,
} from 'lucide-react';
import { useAuthStore, isBirimPortalSession } from '@/stores/useAuthStore';
import { EditModeButton, TextOverrides } from '@/components/edit/EditMode';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { authApi, currencyApi } from '@/lib/api';
import { settingsLabelForPath, settingsNestedSections, settingsRootSections, isSettingsRootPath } from '@/lib/settingsNav';
import { NotificationBell } from '@/components/NotificationBell';
import { AccountSettingsButton } from '@/components/AccountSettingsDialog';
import {
  isDashboardLockCookieSet,
  setDashboardLockCookie,
  clearDashboardLockCookie,
} from '@/lib/dashboard-lock-cookie';
import { format as formatBtn } from 'date-fns';
import { tr as trLocale } from 'date-fns/locale';
import { dashboardTabTopic, dashboardOwnsTabTitle, pageTitle } from '@/lib/brand';
import { roleTitle, canCreateStandaloneRfq } from '@/lib/access';
import { NAV_TOUR_ATTR, requestTourReplay } from '@/lib/tour';
import { TourHost } from '@/components/tour/TourHost';
import { SIDE_MOTION, SideNav, type SideNavEntry } from '@/components/shell/SideNav';
import { usePageEntrance } from '@/components/shell/usePageEntrance';

const SIDEBAR_PREF_KEY = 'up:sidebar-collapsed';

/** Değişen rakam yukarıdan kayarak gelir (saat saniyesi); diğerleri yerinde kalır. */
function RollingText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('inline-flex overflow-hidden', className)} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={`${i}-${ch}`} aria-hidden className="digit-roll inline-block">
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * Saat kendi bileşeninde: her saniye yalnızca bu küçük parça yeniden çizilir (eskiden bütün layout,
 * menü dahil, saniyede bir baştan çiziliyordu).
 */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function HeaderClock() {
  const now = useNow();
  return (
    <div className="flex items-baseline gap-2">
      <RollingText text={formatBtn(now, 'HH:mm:ss')} className="font-mono text-[12.5px] text-white tabular-nums" />
      <span className="truncate text-[11.5px] text-white/38">{formatBtn(now, 'dd MMMM yyyy', { locale: trLocale })}</span>
    </div>
  );
}

function LockClock() {
  const now = useNow();
  return (
    <>
      <p className="text-[15px] font-medium capitalize tracking-[-0.005em] text-white/55">
        {formatBtn(now, 'EEEE, d MMMM', { locale: trLocale })}
      </p>
      <div className="mt-1 font-[200] text-[92px] leading-[0.95] tracking-[-0.045em] text-white tabular-nums sm:text-[112px]">
        {formatBtn(now, 'HH:mm')}
      </div>
    </>
  );
}

const headerIconBtn =
  'wave-btn flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] text-white/65';

interface Star {
  id: number;
  top: string;
  right: string;
  fontSize: string;
  duration: string;
  delay: string;
  opacity: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  children?: NavItem[];
  labelFor?: Record<string, string>;
  moduleIds?: string[];
  hideForSatinAlmaStaff?: boolean;
  labelForStaff?: string;
}

const navItems: NavItem[] = [
  {
    href: '/taleplerim',
    label: 'Taleplerim',
    icon: ClipboardList,
    roles: ['DEPARTMENT'],
  },
  {
    href: '/dashboard',
    label: 'Tedarik Paneli',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'PURCHASING', 'SUPPLIER'],
  },
  {
    href: '/procurement/central',
    label: 'Merkezi Tedarik Takibi',
    icon: Eye,
    roles: ['ADMIN', 'PURCHASING'],
    moduleIds: ['SATIN_ALMA'],
  },
  {
    href: '/procurement/new',
    label: 'Tedarikçi Talebi Oluştur',
    labelForStaff: 'Yetkiliye talep',
    icon: FilePlus2,
    roles: ['ADMIN', 'PURCHASING'],
  },
  {
    href: '/procurement-actions',
    label: 'Tedarik İşlemleri',
    icon: ShoppingCart,
    roles: ['ADMIN', 'PURCHASING', 'SUPPLIER'],
    children: [
      {
        href: '/taleplerim',
        label: 'Benim Taleplerim',
        icon: ClipboardList,
        roles: ['ADMIN', 'PURCHASING'],
      },
      {
        href: '/internal-requests',
        label: 'Birim Tedarik Talepleri',
        icon: Inbox,
        roles: ['ADMIN', 'PURCHASING'],
        moduleIds: ['SATIN_ALMA', 'URETIM_PLANLAMA'],
      },
      {
        href: '/procurement',
        label: 'Tedarikçi Talepleri',
        labelFor: { SUPPLIER: 'Teklif Verme' } as Record<string, string>,
        icon: ScrollText,
        roles: ['ADMIN', 'PURCHASING', 'SUPPLIER'],
      },
      {
        href: '/vendors',
        label: 'Tedarikçi Listesi',
        icon: Store,
        roles: ['ADMIN', 'PURCHASING'],
      },
      {
        href: '/vendor-history',
        label: 'Cari Tedarik Geçmişi',
        icon: History,
        roles: ['ADMIN', 'PURCHASING'],
      },
    ],
  },
  {
    href: '/analysis-reports',
    label: 'Analiz Raporları',
    icon: BarChart3,
    roles: ['ADMIN', 'PURCHASING'],
    moduleIds: ['URETIM_PLANLAMA'],
  },
  ...settingsRootSections().map((s) => ({
    href: s.href,
    label: s.label,
    icon: s.icon,
    roles: [...s.roles],
    moduleIds: s.moduleIds ? [...s.moduleIds] : undefined,
  })),
  {
    href: '/settings',
    label: 'Ayarlar',
    icon: Settings,
    roles: ['ADMIN'],
    children: settingsNestedSections().map((s) => ({
      href: s.href,
      label: s.label,
      icon: s.icon,
      roles: [...s.roles],
      moduleIds: s.moduleIds ? [...s.moduleIds] : undefined,
    })),
  },
];

function navVisible(item: NavItem, user: { role?: string; moduleId?: string; subRole?: string; isExecutive?: boolean } | null | undefined) {
  if (!user?.role || !item.roles.includes(user.role)) return false;
  if (item.hideForSatinAlmaStaff && !canCreateStandaloneRfq(user)) return false;
  if (item.moduleIds?.length) {
    if (user.role === 'ADMIN' || user.isExecutive) return true;
    return item.moduleIds.includes(user.moduleId || '');
  }
  return true;
}

function navItemLabel(
  item: NavItem,
  user: { role?: string; moduleId?: string; subRole?: string; isExecutive?: boolean } | null | undefined
) {
  if (item.labelForStaff && user && !canCreateStandaloneRfq(user)) return item.labelForStaff;
  return item.labelFor?.[user?.role ?? ''] ?? item.label;
}

function getUserRoleTitle(user: any) {
  return roleTitle(user);
}

function displayUserName(user: { name?: string | null; email?: string | null; role?: string | null } | null | undefined) {
  if (user?.name) return user.name;
  const local = String(user?.email || '').split('@')[0];
  return local || '';
}

/** Avatar: e-posta local kısmının ilk iki harfi (örn. mcorlu@… → MC) */
function emailMark(email?: string | null, fallbackName?: string | null) {
  const fromLocal = (raw: string) => {
    const local = String(raw || '')
      .trim()
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase();
    return '';
  };

  const fromEmail = fromLocal(email || '');
  if (fromEmail) return fromEmail;

  if (String(fallbackName || '').includes('@')) {
    const fromNameEmail = fromLocal(fallbackName || '');
    if (fromNameEmail) return fromNameEmail;
  }

  const parts = String(fallbackName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 1) {
    const one = fromLocal(parts[0]);
    if (one) return one;
  }

  return '?';
}

/** /procurement/[id]/analysis — teklif analizi; Tedarikçi Talepleri değil, Analiz Raporları bağlamı */
const PROCUREMENT_REQUEST_ANALYSIS_PATH = /^\/procurement\/[^/]+\/analysis(?:\/|$|\?)/;
function isAnalysisReportsContext(pathname: string): boolean {
  return (
    pathname === '/analysis-reports' ||
    pathname.startsWith('/analysis-reports/') ||
    PROCUREMENT_REQUEST_ANALYSIS_PATH.test(pathname)
  );
}

/**
 * En uzun eşleşen child href'ini döndürür (/procurement/new ile /procurement ayrımı).
 * Talep analizi sayfası Satın Alma alt menüsüne dahil edilmez.
 */
function getActiveChildHref(pathname: string, children: { href: string }[]): string | null {
  if (PROCUREMENT_REQUEST_ANALYSIS_PATH.test(pathname)) {
    return null;
  }
  const sorted = [...children].sort((a, b) => b.href.length - a.href.length);
  for (const c of sorted) {
    if (pathname === c.href) return c.href;
    if (pathname.startsWith(c.href + '/')) {
      if (
        c.href === '/procurement' &&
        (pathname.startsWith('/procurement/new') ||
          pathname === '/procurement/central' ||
          pathname.startsWith('/procurement/central/'))
      ) {
        continue;
      }
      return c.href;
    }
  }
  return null;
}

function SidebarTicker({ text }: { text: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const overflow = inner.scrollWidth - outer.clientWidth;
      setShift(overflow > 2 ? overflow : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div
      ref={outerRef}
      className="mt-px overflow-hidden"
      title={text}
    >
      <span
        ref={innerRef}
        className={cn(
          'inline-block max-w-none whitespace-nowrap text-[11.5px] text-white/42',
          shift > 0 && 'sidebar-ticker',
        )}
        style={shift > 0 ? ({ ['--ticker-shift' as string]: `${shift}px` } as React.CSSProperties) : undefined}
      >
        {text}
      </span>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout, isTokenExpired, portalMode } = useAuthStore();
  const birimPortal = isBirimPortalSession({ portalMode, user });
  const shownName = displayUserName(user);
  const [isMounted, setIsMounted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockInput, setLockInput] = useState('');
  const [isWrongPassword, setIsWrongPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [rates, setRates] = useState({ usd: 34.25, eur: 37.1, chf: 38.5 });
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    if (!dashboardOwnsTabTitle(pathname)) return;
    document.title = pageTitle(dashboardTabTopic(pathname));
  }, [pathname]);

  // Fetch latest user profile on mount to sync subRole and moduleId
  useEffect(() => {
    authApi.me().then((res) => {
      if (res.data) {
        useAuthStore.getState().setUser(res.data);
      }
    }).catch(() => {});
  }, []);

  // Generate Stars for Lock Screen in useEffect to avoid render purity issues
  useEffect(() => {
    if (isLocked) {
      const generatedStars = [...Array(40)].map((_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        right: `${Math.random() * -20}%`,
        fontSize: `${Math.random() * 10 + 5}px`,
        duration: `${Math.random() * 4 + 3}s`,
        delay: `${Math.random() * 10}s`,
        opacity: Math.random() * 0.7 + 0.3,
      }));
      setStars(generatedStars);
    } else {
      setStars([]);
    }
  }, [isLocked]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  usePageEntrance(pageRef, isMounted && isAuthenticated ? pathname : '');

  // Menü tercihi: masaüstünde hatırlanır; telefonda menü her açılışta kapalı (rail) başlar.
  useLayoutEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsNarrow(narrow.matches);
    apply();
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SIDEBAR_PREF_KEY);
    } catch {
      /* ignore */
    }
    if (narrow.matches) setSidebarCollapsed(true);
    else if (stored != null) setSidebarCollapsed(stored === '1');
    else setSidebarCollapsed(window.innerWidth < 1280);
    narrow.addEventListener('change', apply);
    return () => narrow.removeEventListener('change', apply);
  }, []);

  // Menü daralıp genişlerken içerik sütunu her karede yeniden dizilmiyor (eskiden 420 ms boyunca her
  // karede bütün sayfanın düzeni baştan hesaplanıyordu: dizüstünde takılma). Sütun yeni genişliğine
  // bir kez oturur, eski yerinden yalnızca transform ile kayarak gelir (bileşik katmanda).
  const contentRef = useRef<HTMLDivElement>(null);
  const slideContent = useRef(false);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!slideContent.current || !el) return;
    slideContent.current = false;
    // Menü her koşulda kayarak açılıp kapanır (eskisi gibi); içerik de onunla birlikte.
    if (isNarrow) return;
    const shift = 264 - 72;
    // Yarıda tersine basılırsa içerik bulunduğu yerden döner, başa sıçramaz. Yalnızca kayma sürerken
    // ölçülür: ölçüm stili hemen hesaplatır (ağır sayfada menünün kendi geçişinden önce bekleme olur).
    const running = el.getAnimations();
    let current = 0;
    if (running.length) {
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none') current = new DOMMatrixReadOnly(t).m41;
      running.forEach((a) => a.cancel());
    }
    el.animate(
      [{ transform: `translateX(${current + (sidebarCollapsed ? shift : -shift)}px)` }, { transform: 'translateX(0)' }],
      SIDE_MOTION,
    );
  }, [sidebarCollapsed, isNarrow]);

  const toggleSidebar = () => {
    slideContent.current = true;
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (!isNarrow) {
        try {
          localStorage.setItem(SIDEBAR_PREF_KEY, next ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const onPrep = (event: Event) => {
      const sidebar = Boolean((event as CustomEvent<{ sidebar?: boolean }>).detail?.sidebar);
      if (sidebar) setSidebarCollapsed(false);
    };
    window.addEventListener('up-tour:prepare', onPrep);
    return () => window.removeEventListener('up-tour:prepare', onPrep);
  }, []);

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && isDashboardLockCookieSet()) {
      setIsLocked(true);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);

    const fetchRates = async () => {
      try {
        const response = await currencyApi.getRates();
        const data = response?.data;
        if (data?.success && data?.rates?.USD) {
          setRates({
            usd: data.rates.USD,
            eur: data.rates.EUR,
            chf: Number(data.rates.CHF) || 38.5,
          });
        }
      } catch {}
    };

    // İlk yüklemede kurları çek
    fetchRates();

    // Gerçek TCMB kurlarını 1 saatte bir tazele (TCMB genelde 15:30'da günceller)
    const currencyTimer = setInterval(fetchRates, 3600000);

    return () => {
      clearInterval(currencyTimer);
    };
  }, []);

  useEffect(() => {
    if (isMounted && birimPortal && !pathname.startsWith('/taleplerim')) {
      router.replace('/taleplerim');
    }
  }, [isMounted, birimPortal, pathname, router]);

  useEffect(() => {
    if (isMounted && (!isAuthenticated || isTokenExpired())) {
      logout();
      router.push('/login');
    }
  }, [isMounted, isAuthenticated, isTokenExpired, logout, router]);

  // Uygulama içi geçmiş: geri chevron'u önce önceki ekrana döner; doğrudan açılan sayfada ana ekrana gider.
  const visited = useRef<string[]>([]);
  useEffect(() => {
    const s = visited.current;
    if (s.length >= 2 && s[s.length - 2] === pathname) s.pop();
    else if (s[s.length - 1] !== pathname) s.push(pathname);
  }, [pathname]);
  const homePath = birimPortal ? '/taleplerim' : '/dashboard';
  const showBack = pathname !== homePath;
  const goBack = () => {
    if (visited.current.length > 1) router.back();
    else router.push(homePath);
  };

  const handleLogout = () => {
    clearDashboardLockCookie();
    try {
      sessionStorage.removeItem('up_notify_known_ids');
      sessionStorage.removeItem('up_notify_booted');
      sessionStorage.removeItem('up_notify_summary_shown');
    } catch {
      /* ignore */
    }
    logout();
    toast.success('Başarıyla çıkış yapıldı');
    router.push('/login');
  };

  const handleUnlock = async () => {
    if (!lockInput || isUnlocking) return;
    setIsUnlocking(true);
    try {
      const response = await authApi.verifyPassword(lockInput);
      if (response.data.isValid) {
        clearDashboardLockCookie();
        setIsLocked(false);
        setLockInput('');
        setIsWrongPassword(false);
      } else {
        setIsWrongPassword(true);
      }
    } catch (error) {
      console.error('Lock screen unlock failed:', error);
      setIsWrongPassword(true);
    } finally {
      setIsUnlocking(false);
    }
  };

  const filteredNav = navItems.filter((item) => navVisible(item, user));
  const isDepartment = birimPortal;

  const sideEntries: SideNavEntry[] = filteredNav.flatMap((item): SideNavEntry[] => {
    const hasChildren = Boolean(item.children && item.children.length > 0);
    if (hasChildren) {
      const visibleChildren = item.children!.filter((child) => navVisible(child, user));
      if (visibleChildren.length === 0) return [];
      const activeChildHref = getActiveChildHref(pathname, visibleChildren);
      return [
        {
          kind: 'group',
          href: item.href,
          label: item.label,
          icon: item.icon,
          active: activeChildHref !== null,
          tour: NAV_TOUR_ATTR[item.href],
          children: visibleChildren.map((child) => ({
            href: child.href,
            label: child.labelFor?.[user?.role ?? ''] ?? child.label,
            icon: child.icon,
            active: activeChildHref === child.href,
            tour: NAV_TOUR_ATTR[child.href],
          })),
        },
      ];
    }
    const active =
      item.href === '/analysis-reports'
        ? isAnalysisReportsContext(pathname)
        : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
    return [
      {
        kind: 'link',
        href: item.href,
        label: navItemLabel(item, user),
        icon: item.icon,
        active,
        tour: NAV_TOUR_ATTR[item.href],
      },
    ];
  });

  if (!isMounted || !isAuthenticated) return null;

  const crumbParent = 'hidden text-white/40 md:inline';
  const crumbCurrent = 'crumb-in text-brand-ink';
  const CrumbSep = () => <span aria-hidden className="hidden h-3.5 w-px shrink-0 bg-white/20 md:inline-block" />;

  const breadcrumbs = (function getBreadcrumbs() {
    if (!user?.role) {
      return <span className={crumbCurrent}>Portal Yönetimi</span>;
    }
    if (PROCUREMENT_REQUEST_ANALYSIS_PATH.test(pathname)) {
      return (
        <>
          <span className={crumbParent}>Analiz Raporları</span>
          <CrumbSep />
          <span key={pathname} className={crumbCurrent}>Teklif Analizi</span>
        </>
      );
    }
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      if (isSettingsRootPath(pathname)) {
        return <span key={pathname} className={crumbCurrent}>{settingsLabelForPath(pathname, user)}</span>;
      }
      return (
        <>
          <span className={crumbParent}>Ayarlar</span>
          <CrumbSep />
          <span key={pathname} className={crumbCurrent}>{settingsLabelForPath(pathname, user)}</span>
        </>
      );
    }
    for (const item of navItems) {
      if (item.children?.length) {
        const visible = item.children.filter((c) => navVisible(c, user));
        const ach = getActiveChildHref(pathname, visible);
        if (ach) {
          const child = item.children.find((c) => c.href === ach);
          if (child) {
            const childLabel = navItemLabel(child, user);
            return (
              <>
                <span className={crumbParent}>{item.label}</span>
                <CrumbSep />
                <span key={pathname} className={crumbCurrent}>{childLabel}</span>
              </>
            );
          }
        }
      }
      if (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))) {
        return <span key={pathname} className={crumbCurrent}>{navItemLabel(item, user)}</span>;
      }
    }
    return <span className={crumbCurrent}>Portal Yönetimi</span>;
  })();

  const avatarMark = emailMark(user?.email, shownName);
  const roleLine = isDepartment ? user?.email || '' : getUserRoleTitle(user);

  const backButton = showBack ? (
    <button
      type="button"
      onClick={goBack}
      className={cn(headerIconBtn, 'group/back')}
      aria-label="Geri dön"
      title="Geri dön"
    >
      <ChevronLeft
        className="h-[19px] w-[19px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/back:-translate-x-0.5"
        strokeWidth={1.8}
      />
    </button>
  ) : null;

  return (
    <QueryClientProvider client={queryClient}>
    <div className="relative flex h-screen overflow-hidden bg-chrome">
      {/* ── Kilit ekranı: büyük ince saat, ad, tek alan ── */}
      {isLocked && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0c]/95 backdrop-blur-2xl animate-in fade-in duration-700">
          <style>{`
            @keyframes star-fall {
              0% { transform: translate(50vw, -50vh) rotate(0deg); opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { transform: translate(-100vw, 100vh) rotate(360deg); opacity: 0; }
            }
            .animate-star-fall { animation: star-fall linear infinite; }
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20% { transform: translateX(-8px); }
              40% { transform: translateX(7px); }
              60% { transform: translateX(-5px); }
              80% { transform: translateX(3px); }
            }
            .animate-shake { animation: shake 0.42s cubic-bezier(.36,.07,.19,.97) both; }
            @media (prefers-reduced-motion: reduce) { .animate-star-fall { animation: none; display: none; } }
          `}</style>

          <div className="pointer-events-none absolute inset-0">
            {stars.map((star: Star) => (
              <div
                key={star.id}
                className="animate-star-fall absolute select-none text-white"
                style={{
                  top: star.top,
                  right: star.right,
                  fontSize: `calc(${star.fontSize} * 0.6)`,
                  animationDuration: `calc(${star.duration} * 2.4)`,
                  animationDelay: star.delay,
                  opacity: star.opacity * 0.22,
                }}
              >
                ★
              </div>
            ))}
          </div>

          <div className="stagger relative z-10 flex w-full max-w-[340px] flex-col items-center px-6 text-center">
            <LockClock />

            <div className="mt-10 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-[#141416]">
                {shownName?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-[15px] font-medium text-white">{shownName}</p>
                <p className="flex items-center gap-1.5 text-[12.5px] text-white/45">
                  <Lock className="size-3" strokeWidth={2} />
                  Sistem kilitli
                </p>
              </div>
            </div>

            <div className="mt-6 w-full">
              <div className={cn('relative', isWrongPassword && 'animate-shake')}>
                <input
                  type="password"
                  placeholder="Şifrenizi girin"
                  aria-label="Güvenlik şifresi"
                  value={lockInput}
                  autoFocus
                  onChange={(e) => {
                    setLockInput(e.target.value);
                    setIsWrongPassword(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUnlock();
                    }
                  }}
                  disabled={isUnlocking}
                  className={cn(
                    'h-12 w-full rounded-full border border-white/10 bg-white/[0.06] pl-5 pr-14 text-[15px] text-white outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-white/35 hover:border-white/20 focus:border-primary/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-primary/10',
                    isWrongPassword && 'border-destructive/70 text-destructive focus:border-destructive/70',
                    isUnlocking && 'cursor-not-allowed opacity-60',
                  )}
                />
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={isUnlocking}
                  aria-label="Kilidi aç"
                  title="Kilidi aç"
                  className="group/unlock absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-primary text-[#141416] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:scale-105 active:scale-90 disabled:opacity-60"
                >
                  {isUnlocking ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                  ) : (
                    <>
                      <ArrowRight className="size-4 transition-transform duration-300 group-hover/unlock:translate-x-6" />
                      <ArrowRight className="absolute size-4 -translate-x-6 transition-transform duration-300 group-hover/unlock:translate-x-0" />
                    </>
                  )}
                </button>
              </div>
              <p
                className={cn(
                  'mt-3 h-4 text-[12.5px] transition-opacity duration-200',
                  isWrongPassword ? 'text-destructive opacity-100' : 'opacity-0',
                )}
                aria-live="polite"
              >
                {isWrongPassword ? 'Şifre hatalı, tekrar deneyin.' : ' '}
              </p>
              <p className="mt-1 text-[12px] text-white/30">
                {isUnlocking ? 'Kontrol ediliyor…' : 'Enter ile kilidi açın'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Kenar çubuğu: açıkken tam menü, kapalıyken ikon rail'i ── */}
      {!isDepartment && (
        <div
          className={cn(
            // Yer tutucu geçişsiz: menünün kendisi (SideNav) üstte daralır, içerik kayarak gelir.
            'shell-rail-in relative z-30 h-full shrink-0',
            sidebarCollapsed ? 'w-[72px]' : 'w-[264px]',
            'max-md:w-[64px]',
          )}
        >
          <SideNav
            entries={sideEntries}
            activeKey={pathname}
            collapsed={sidebarCollapsed}
            mobileOpen={isNarrow && !sidebarCollapsed}
            onRequestClose={() => {
              if (isNarrow) setSidebarCollapsed(true);
            }}
            logo={
              <a
                href="https://www.ugurpromilling.com"
                target="_blank"
                rel="noopener noreferrer"
                title="Uğur Promilling"
                className="block transition-opacity duration-200 hover:opacity-80"
              >
                <img src="/logo.png" alt="Uğur Promilling" className="h-8 w-auto max-w-[180px] object-contain" />
              </a>
            }
            mark={
              <button
                type="button"
                onClick={toggleSidebar}
                title="Menüyü aç"
                aria-label="Menüyü aç"
                className="group/mark flex size-7 items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:rotate-[-8deg] hover:scale-110 active:scale-95"
              >
                <img src="/favicon/apple-touch-icon.png" alt="" className="size-7 object-contain" />
              </button>
            }
            footer={({ collapsed, showTip, hideTip }) =>
              collapsed ? (
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    tabIndex={0}
                    onPointerEnter={(e) => showTip(e.currentTarget, 'me', `${shownName} · ${roleLine}`)}
                    onPointerLeave={hideTip}
                    onFocus={(e) => showTip(e.currentTarget, 'me', `${shownName} · ${roleLine}`)}
                    onBlur={hideTip}
                    className="mb-1 flex size-9 items-center justify-center rounded-full bg-brand text-[11.5px] font-semibold uppercase text-[#141416] outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    {avatarMark}
                  </div>
                  <AccountSettingsButton
                    variant="icon"
                    className="size-9 rounded-[10px] border-transparent text-white/50 hover:bg-white/[0.07] hover:text-white"
                  />
                  <button
                    id="logout-btn"
                    type="button"
                    onClick={handleLogout}
                    className="flex size-9 items-center justify-center rounded-[10px] text-white/50 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-300"
                    aria-label="Çıkış Yap"
                    title="Çıkış Yap"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 pl-1">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-[11.5px] font-semibold uppercase text-[#141416]">
                    {avatarMark}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium leading-tight text-white" title={shownName}>
                      {shownName}
                    </p>
                    <SidebarTicker text={roleLine} />
                  </div>
                  <AccountSettingsButton
                    variant="icon"
                    className="size-8 shrink-0 rounded-[9px] border-transparent text-white/50 hover:bg-white/[0.07] hover:text-white"
                  />
                  <button
                    id="logout-btn"
                    type="button"
                    onClick={handleLogout}
                    className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-white/50 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-300"
                    aria-label="Çıkış Yap"
                    title="Çıkış Yap"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            }
          />
        </div>
      )}

      {/* ── Ana içerik: üst bar çerçevenin parçası, sayfa içeride bir panel ── */}
      <div ref={contentRef} className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shell-bar-in relative z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:px-4 xl:flex-nowrap xl:py-0">
          {/* Kenar çubuğundaki değirmen dokusu üst çubukta da (yazıların arkasında). */}
          <span aria-hidden className="bar-texture" />
          {/* Sol */}
          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 sm:gap-3">
            {isDepartment ? (
              <>
                {backButton}
                <a
                  href="https://www.ugurpromilling.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center justify-center transition-opacity duration-200 hover:opacity-80"
                  title="Uğur Promilling"
                >
                  <img
                    src="/logo.png"
                    alt="Uğur Promilling"
                    className="h-8 w-auto max-w-[7.5rem] object-contain sm:h-9 sm:max-w-[9rem]"
                  />
                </a>
                <div className="hidden h-7 w-px shrink-0 bg-white/10 sm:block" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-white/40">Tedarik Portalı</p>
                  <h2 key={pathname} className="crumb-in truncate text-[15px] font-medium tracking-[-0.012em] text-white">
                    {pathname.startsWith('/taleplerim/yeni')
                      ? 'Yeni talep'
                      : pathname.match(/^\/taleplerim\/[^/]+/)
                        ? 'Talep detayı'
                        : 'Taleplerim'}
                  </h2>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={cn(headerIconBtn, 'max-md:hidden')}
                  onClick={toggleSidebar}
                  aria-expanded={!sidebarCollapsed}
                  aria-label={sidebarCollapsed ? 'Menüyü aç' : 'Menüyü kapat'}
                  title={sidebarCollapsed ? 'Menüyü aç' : 'Menüyü kapat'}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.7} />
                  ) : (
                    <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.7} />
                  )}
                </button>
                <button
                  type="button"
                  className={cn(headerIconBtn, 'md:hidden')}
                  onClick={toggleSidebar}
                  aria-label={sidebarCollapsed ? 'Menüyü aç' : 'Menüyü kapat'}
                  title={sidebarCollapsed ? 'Menüyü aç' : 'Menüyü kapat'}
                >
                  <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.7} />
                </button>
                {backButton}
                <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-[14.5px] font-medium tracking-[-0.012em] sm:gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 truncate leading-tight sm:gap-2">{breadcrumbs}</span>
                </h2>
              </>
            )}
          </div>

          {/* Orta: kurlar + saat (birimde yok) */}
          {!isDepartment && (
            <div className="order-last flex w-full min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 pb-1 text-[12.5px] xl:order-none xl:w-auto xl:flex-nowrap xl:pb-0">
              {(
                [
                  ['Dolar', '$', rates.usd],
                  ['Euro', '€', rates.eur],
                  ['CHF', '₣', rates.chf],
                ] as const
              ).map(([name, sign, value]) => (
                <div key={name} className="group/rate flex items-baseline gap-1.5" title={`${name} (TCMB)`}>
                  <span className="text-[11.5px] font-medium text-white/38 transition-colors duration-200 group-hover/rate:text-white/70">
                    {name}
                  </span>
                  <span className="font-mono text-[12.5px] text-white/85 tabular-nums">
                    {value.toFixed(2)}
                    <span className="ml-0.5 text-white/30">{sign}</span>
                  </span>
                </div>
              ))}
              <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
              <HeaderClock />
            </div>
          )}

          {/* Sağ */}
          <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              data-tour="tour-help"
              onClick={() => requestTourReplay()}
              className={headerIconBtn}
              title="Sayfa turunu başlat"
              aria-label="Sayfa turunu başlat"
            >
              <CircleHelp className="h-[17px] w-[17px]" strokeWidth={1.7} />
            </button>
            <EditModeButton className={headerIconBtn} />
            <NotificationBell />
            <button
              type="button"
              onClick={() => {
                setDashboardLockCookie();
                setIsLocked(true);
              }}
              className={headerIconBtn}
              title="Ekranı Kilitle"
              aria-label="Ekranı kilitle"
            >
              <Lock className="h-[17px] w-[17px]" strokeWidth={1.7} />
            </button>

            <div className="mx-1 hidden h-6 w-px bg-white/[0.08] sm:block" />

            {isDepartment ? (
              <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-[11.5px] font-semibold uppercase text-[#141416]">
                  {avatarMark}
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="max-w-[10rem] truncate text-[13.5px] font-medium leading-tight text-white" title={shownName}>
                    {shownName}
                  </p>
                  <p className="mt-0.5 max-w-[10rem] truncate text-[11.5px] text-white/42" title={user?.email || ''}>
                    {user?.email}
                  </p>
                </div>
                <AccountSettingsButton className="h-9 w-auto shrink-0 rounded-[10px] px-2.5 text-white/60 sm:h-9" />
                <button
                  type="button"
                  id="logout-btn"
                  onClick={handleLogout}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.08] px-2.5 text-[13px] font-medium text-white/60 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 sm:px-3"
                  title="Çıkış Yap"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Çıkış Yap</span>
                </button>
              </div>
            ) : (
              <a
                href="https://www.ugurpromilling.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center justify-center p-1 opacity-80 transition-[opacity,transform] duration-300 hover:opacity-100 active:scale-95"
                title="Uğur Promilling Web Sitesi"
              >
                <img src="/logo2.png" alt="Logo" className="h-7 w-auto max-w-[96px] object-contain sm:h-8 sm:max-w-none" />
              </a>
            )}
          </div>
        </header>

        {/* Sayfa paneli */}
        <main
          data-edit-scope
          data-plain={pathname === '/internal-requests' || pathname === '/taleplerim' ? '' : undefined}
          className={cn(
            'shell-panel-in page-surface relative flex-1 overflow-y-auto overflow-x-hidden',
            isDepartment ? 'sm:mx-2 sm:rounded-t-[20px]' : 'md:rounded-tl-[20px]',
          )}
        >
          <div ref={pageRef} className="shell-panel-rise min-h-full p-3 sm:p-6 lg:p-7">
            {children}
          </div>
        </main>
      </div>
      {!isLocked && <TourHost locked={isLocked} />}
      <TextOverrides />
    </div>
    </QueryClientProvider>
  );
}
