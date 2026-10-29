/** Mail `mailSubject` ile aynı marka. */
export const SITE_BRAND = 'Uğur Promilling';

/** Ürün adı (sekme varsayılanı, sidebar, login). */
export const SITE_PRODUCT = 'Tedarik Portalı';

/** Title / mail son eki: "Uğur Promilling - Tedarik Portalı" */
export const SITE_SUFFIX = `${SITE_BRAND} - ${SITE_PRODUCT}`;

/**
 * Sekme / document.title — mail konusu ile aynı kalıp:
 * "Konu // Uğur Promilling - Tedarik Portalı"
 * "Konu: detay // Uğur Promilling - Tedarik Portalı"
 */
export function pageTitle(topic: string, detail?: string | null) {
  const cleanTopic = String(topic || SITE_PRODUCT).replace(/\s+/g, ' ').trim();
  const cleanDetail = detail != null ? String(detail).replace(/\s+/g, ' ').trim() : '';
  const head = cleanDetail ? `${cleanTopic}: ${cleanDetail}` : cleanTopic;
  return `${head} // ${SITE_SUFFIX}`;
}

/** Dashboard rotaları için sekme konusu (detay sayfaları data gelince override eder). */
export function dashboardTabTopic(pathname: string): string {
  const p = pathname.replace(/\/$/, '') || '/';

  if (p === '/dashboard') return 'Tedarik Paneli';
  if (p === '/procurement/new') return 'Tedarikçi talebi';
  if (/^\/procurement\/[^/]+\/analysis$/.test(p)) return 'Teklif analizi';
  if (/^\/procurement\/[^/]+$/.test(p)) return 'Tedarikçi talebi';
  if (p === '/procurement') return 'Tedarikçi talepleri';

  if (p === '/internal-requests/new') return 'Birim tedarik talebi';
  if (/^\/internal-requests\/[^/]+$/.test(p)) return 'Birim tedarik talebi';
  if (p === '/internal-requests') return 'Birim tedarik talepleri';

  if (p === '/taleplerim/yeni') return 'Yeni talep';
  if (/^\/taleplerim\/[^/]+$/.test(p)) return 'Talebim';
  if (p === '/taleplerim') return 'Taleplerim';

  if (/^\/vendors\/[^/]+\/products$/.test(p)) return 'Ürün katalogları';
  if (p === '/vendors') return 'Tedarikçi listesi';

  if (p === '/users' || p === '/settings/users') return 'Kullanıcılar';
  if (p === '/analysis-reports') return 'Analiz raporları';
  if (p === '/procurement/central') return 'Merkezi tedarik takibi';
  if (p === '/vendor-history') return 'Cari tedarik geçmişi';
  if (p === '/price-history') return 'Fiyat geçmişi';
  if (p === '/my-products') return 'Ürünlerim';
  if (p === '/vendor-portal/tasks') return 'Görevlerim';

  if (p === '/settings') return 'Ayarlar';
  if (p === '/settings/notifications') return 'Bildirimler';
  if (p === '/settings/mail') return 'E-posta';
  if (p === '/settings/mail-outbox') return 'Mail günlüğü';
  if (p === '/settings/sms') return 'SMS';
  if (p === '/settings/notification-cc-contacts') return 'Teklif mail kopyası';
  if (p === '/settings/procurement-list-template') return 'Talep listesi şablonları';
  if (p === '/settings/approval-limit') return 'Onay limiti';
  if (p === '/settings/departments') return 'Talep birimleri';

  return SITE_PRODUCT;
}

/** Detay sayfaları DocumentTitle ile override eder; layout bu rotalara yazmaz. */
export function dashboardOwnsTabTitle(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === '/procurement/new' || p === '/internal-requests/new' || p === '/taleplerim/yeni') {
    return true;
  }
  if (/^\/procurement\/[^/]+(\/analysis)?$/.test(p)) return false;
  if (/^\/internal-requests\/[^/]+$/.test(p)) return false;
  if (/^\/taleplerim\/[^/]+$/.test(p)) return false;
  return true;
}
