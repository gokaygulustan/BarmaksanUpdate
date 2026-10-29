export type AppRole = 'ADMIN' | 'PURCHASING' | 'SUPPLIER' | 'DEPARTMENT';

export function isSatinAlmaPurchasing(user: { role?: string; moduleId?: string } | null | undefined) {
  return user?.role === 'PURCHASING' && user?.moduleId === 'SATIN_ALMA';
}

export function isSatinAlmaInbox(user: { role?: string; moduleId?: string; isExecutive?: boolean } | null | undefined) {
  return Boolean(user && (user.role === 'ADMIN' || user.isExecutive || isSatinAlmaPurchasing(user)));
}

export function isSatinAlmaManager(user: { role?: string; moduleId?: string; subRole?: string; isExecutive?: boolean } | null | undefined) {
  return Boolean(
    user &&
      (user.isExecutive ||
        user.role === 'ADMIN' ||
        (isSatinAlmaPurchasing(user) && user.subRole === 'MANAGER'))
  );
}

/** Satın alma ve üretim personeli doğrudan tedarikçi talebi açamaz; önce birim yetkilisi onaylar. */
export function canCreateStandaloneRfq(user: {
  role?: string;
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
} | null | undefined) {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.isExecutive) return true;
  if (user.role !== 'PURCHASING') return false;
  if (user.moduleId === 'SATIN_ALMA' || user.moduleId === 'URETIM_PLANLAMA') return user.subRole === 'MANAGER';
  return true;
}

/** Birim talebi kuyruğunu onaylayan yetkili: Mahmut satın almada, Kerem üretimde. */
export function isUnitRequestManager(user: {
  role?: string;
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
} | null | undefined) {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.isExecutive) return true;
  return user.role === 'PURCHASING' && user.subRole === 'MANAGER' &&
    (user.moduleId === 'SATIN_ALMA' || user.moduleId === 'URETIM_PLANLAMA');
}

export function canReviewUnitRequest(
  user: { role?: string; moduleId?: string; subRole?: string; isExecutive?: boolean } | null | undefined,
  moduleId?: string | null,
) {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.isExecutive) return true;
  const mod = moduleId || 'SATIN_ALMA';
  return user.role === 'PURCHASING' && user.subRole === 'MANAGER' && user.moduleId === mod;
}

/** SN, stok kodu, tonaj yalnızca üretim planlama taleplerinde. */
export function showsProductionItemMeta(moduleId?: string | null) {
  return (moduleId || 'URETIM_PLANLAMA') === 'URETIM_PLANLAMA';
}

export const MODULE_OPTIONS = [
  { id: 'URETIM_PLANLAMA', label: 'Üretim Planlama' },
  { id: 'SATIN_ALMA', label: 'Satın Alma' },
  { id: 'YEDEK_PARCA', label: 'Yedek Parça' },
] as const;

export function moduleLabel(moduleId?: string | null) {
  return MODULE_OPTIONS.find((m) => m.id === moduleId)?.label || 'Üretim Planlama';
}

export function projectLabel(
  project?: { code?: string | null; name?: string | null; isDefault?: boolean } | null,
) {
  if (!project?.name) return 'Genel';
  if (project.isDefault || !project.code) return project.name;
  return `${project.code} ${project.name}`;
}

export function isYedekParcaModule(moduleId?: string | null) {
  return moduleId === 'YEDEK_PARCA';
}

export function isYedekParcaUser(user: { role?: string; moduleId?: string } | null | undefined) {
  return user?.role === 'PURCHASING' && user?.moduleId === 'YEDEK_PARCA';
}

/** Tedarikçi formu satın alma ile aynı: kalem KDV'si, sabit kur, teklif notu. */
export function usesPurchasingQuoteForm(moduleId?: string | null) {
  return moduleId === 'SATIN_ALMA' || moduleId === 'YEDEK_PARCA';
}

/** Fiyatı birim içinde onaylanmayan hatlar üst yönetime karar daveti gönderir. */
export function usesExecutiveDecisionInvite(moduleId?: string | null) {
  return (moduleId || 'URETIM_PLANLAMA') === 'URETIM_PLANLAMA' || moduleId === 'YEDEK_PARCA';
}

/** Üretimde karar davetini yalnız Kerem gönderir. Yedek parça personeli göndermeye devam eder. */
export function canSendDecisionInvite(
  user: { role?: string; moduleId?: string; subRole?: string; isExecutive?: boolean } | null | undefined,
  moduleId?: string | null,
) {
  if (!usesExecutiveDecisionInvite(moduleId)) return false;
  if (!user) return false;
  if (user.role === 'ADMIN' || user.isExecutive) return true;
  if (user.role !== 'PURCHASING') return false;
  const mod = moduleId || 'URETIM_PLANLAMA';
  if ((user.moduleId || 'URETIM_PLANLAMA') !== mod) return false;
  if (mod === 'URETIM_PLANLAMA') return user.subRole === 'MANAGER';
  return true;
}

export function roleTitle(user: {
  role?: string;
  moduleId?: string;
  subRole?: string;
  vendor?: { name?: string | null } | null;
} | null | undefined) {
  if (user?.role === 'ADMIN') return 'Sistem yöneticisi';
  if (user?.role === 'DEPARTMENT') return 'Birim kullanıcısı';
  if (user?.role === 'SUPPLIER') return user?.vendor?.name || 'Tedarikçi';
  const isManager = user?.subRole === 'MANAGER';
  if (user?.moduleId === 'SATIN_ALMA') {
    return isManager ? 'Satın Alma Birimi Yetkilisi' : 'Satın Alma Birimi Personeli';
  }
  if (user?.moduleId === 'YEDEK_PARCA') {
    return isManager ? 'Yedek Parça Birimi Yetkilisi' : 'Yedek Parça Birimi Personeli';
  }
  return isManager ? 'Üretim Planlama Birimi Yetkilisi' : 'Üretim Planlama Birimi Personeli';
}

export type DashboardPersona = 'admin' | 'sa-manager' | 'sa-staff' | 'production' | 'supplier' | 'department';

export function dashboardPersona(user: {
  role?: string;
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
} | null | undefined): DashboardPersona {
  if (user?.role === 'SUPPLIER') return 'supplier';
  if (user?.role === 'DEPARTMENT') return 'department';
  if (user?.role === 'ADMIN' || user?.isExecutive) return 'admin';
  if (isSatinAlmaPurchasing(user) && user?.subRole === 'MANAGER') return 'sa-manager';
  if (isSatinAlmaPurchasing(user)) return 'sa-staff';
  return 'production';
}
