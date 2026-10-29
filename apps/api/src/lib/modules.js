/** Tedarik hatları. Kullanıcı, tedarikçi ve talep aynı moduleId ile ayrışır. */
export const MODULE = {
  URETIM: 'URETIM_PLANLAMA',
  SATIN_ALMA: 'SATIN_ALMA',
  YEDEK_PARCA: 'YEDEK_PARCA',
};

export const PROCUREMENT_MODULES = [MODULE.SATIN_ALMA, MODULE.URETIM, MODULE.YEDEK_PARCA];

export const MODULE_LABELS = {
  [MODULE.URETIM]: 'Üretim Planlama',
  [MODULE.SATIN_ALMA]: 'Satın Alma',
  [MODULE.YEDEK_PARCA]: 'Yedek Parça',
};

export const moduleLabel = (moduleId) => MODULE_LABELS[moduleId] || 'Üretim Planlama';

export const isYedekParcaModule = (moduleId) => moduleId === MODULE.YEDEK_PARCA;

/** Tedarikçi formu satın alma ile aynı: kalem KDV'si, döviz kuru sabitleme, teklif notu, SN yok. */
export const usesPurchasingQuoteForm = (moduleId) =>
  moduleId === MODULE.SATIN_ALMA || moduleId === MODULE.YEDEK_PARCA;

/** Fiyatı kendi onaylamayan hatlar üst yönetime karar daveti (decision invite) ile gider. */
export const usesExecutiveDecisionInvite = (moduleId) =>
  (moduleId || MODULE.URETIM) === MODULE.URETIM || moduleId === MODULE.YEDEK_PARCA;

/** Yedek parça hiçbir tutarı kendisi onaylayamaz; onay yalnızca üst yönetim kararıyla. */
export const requiresExecutiveForAnyApproval = (moduleId) => moduleId === MODULE.YEDEK_PARCA;

/** Cari tedarik geçmişinde tüm hatların fiyatlarını görebilir (tedarikçi listesi yine kendi hattı). */
export const seesAllModulePriceHistory = (user) =>
  Boolean(
    user?.role === 'PURCHASING' &&
      (user?.moduleId === MODULE.YEDEK_PARCA || user?.moduleId === MODULE.SATIN_ALMA)
  );
