/** Tedarikçi talebi (procurement) durum etiketleri — tek kaynak. */
export const PROCUREMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Taslak',
  SENT_TO_VENDOR: 'Tedarikçiye İletildi',
  VENDOR_QUOTED: 'Teklif Geldi',
  PENDING_MANAGER_APPROVAL: 'Yetkili Onayında',
  PENDING_ADMIN_APPROVAL: 'Üst Yönetim Onayında',
  RETURNED_TO_MANAGER: 'Yetkiliye İade',
  APPROVED_FOR_PURCHASE: 'Satın Alma Aşamasında',
  VENDOR_APPROVED: 'Sipariş Onaylandı',
  IN_PRODUCTION: 'Teminde',
  COMPLETED: 'Tamamlandı',
  REJECTED: 'Reddedildi',
  CANCELLED: 'İptal Edildi',
  HAS_ISSUES: 'Sorunlu',
};

export function procurementStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  return PROCUREMENT_STATUS_LABELS[status] || status;
}
