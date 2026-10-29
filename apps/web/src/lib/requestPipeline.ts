export const PIPELINE_STEPS = [
  { key: 'review', label: 'İnceleme' },
  { key: 'decision', label: 'Karar' },
  { key: 'sourcing', label: 'Teklif toplama' },
  { key: 'price', label: 'Yetkili onayı' },
  { key: 'exec', label: 'Üst yönetim onayı' },
  { key: 'close', label: 'Temin ve sonuç' },
] as const;

/** Satın alma panosu — yönetici: gelen talebi görür. */
export const PURCHASING_MANAGER_BOARD_STEPS = [
  { key: 'review', label: 'Birim talebi incelemesi' },
  { key: 'decision', label: 'Birim talebi kararı' },
  { key: 'sourcing', label: 'Teklif toplama' },
  { key: 'price', label: 'Yetkili onayı' },
  { key: 'exec', label: 'Üst yönetim onayı' },
  { key: 'close', label: 'Temin / sonuç' },
] as const;

/** Personel: kendi gönderdiği talep yetkili incelemesinde durur; onaydan sonra atanan işler. */
export const PURCHASING_STAFF_BOARD_STEPS = [
  { key: 'review', label: 'Yetkili incelemesinde' },
  { key: 'decision', label: 'Birim talebi kararı' },
  { key: 'sourcing', label: 'Teklif toplama' },
  { key: 'price', label: 'Yetkili onayı' },
  { key: 'exec', label: 'Üst yönetim onayı' },
  { key: 'close', label: 'Temin / sonuç' },
] as const;

/**
 * Talep sahibinin panosu. Sütunlar satın almanın iç terimleriyle değil,
 * talebin o an hangi durumda olduğuyla adlandırılır.
 */
export const DEPARTMENT_BOARD_STEPS = [
  { key: 'draft', label: 'Taslak' },
  { key: 'review', label: 'İncelemede' },
  { key: 'decision', label: 'Onaylandı' },
  { key: 'sourcing', label: 'Teklif toplanıyor' },
  { key: 'price', label: 'Yetkili onayında' },
  { key: 'exec', label: 'Üst yönetim onayında' },
  { key: 'close', label: 'Temin ve sonuç' },
] as const;

export type PipelineResult = {
  current: number;
  failed: number | null;
  caption: string;
  doneAll: boolean;
};

export function resolvePipeline(
  status: string,
  procurementStatus?: string | null
): PipelineResult {
  if (status === 'DRAFT') {
    return { current: -1, failed: null, caption: 'Taslak', doneAll: false };
  }
  if (status === 'REJECTED') {
    return { current: 1, failed: 1, caption: 'Satın alma tarafından reddedildi', doneAll: false };
  }
  if (status === 'SUBMITTED') {
    return { current: 0, failed: null, caption: 'Satın alma birimi inceliyor', doneAll: false };
  }
  if (status === 'APPROVED') {
    return {
      current: 1,
      failed: null,
      caption: 'Satın alma onayladı, işleme alınması bekleniyor',
      doneAll: false,
    };
  }
  if (status !== 'CONVERTED') {
    return { current: 0, failed: null, caption: 'Satın alma birimi inceliyor', doneAll: false };
  }

  const p = procurementStatus || 'DRAFT';
  if (p === 'CANCELLED' || p === 'REJECTED') {
    return { current: 5, failed: 5, caption: 'Süreç sonlandırıldı', doneAll: false };
  }
  if (p === 'HAS_ISSUES') {
    return { current: 5, failed: 5, caption: 'Süreçte sorun bildirildi', doneAll: false };
  }
  if (p === 'PENDING_ADMIN_APPROVAL') {
    return { current: 4, failed: null, caption: 'Üst yönetime onaya gönderildi', doneAll: false };
  }
  if (p === 'PENDING_MANAGER_APPROVAL') {
    return { current: 3, failed: null, caption: 'Yetkili onayında', doneAll: false };
  }
  if (p === 'RETURNED_TO_MANAGER') {
    return { current: 3, failed: null, caption: 'Yetkiliye iade edildi', doneAll: false };
  }
  if (p === 'IN_PRODUCTION') {
    return { current: 5, failed: null, caption: 'Teminde', doneAll: false };
  }
  if (p === 'APPROVED_FOR_PURCHASE' || p === 'VENDOR_APPROVED') {
    return { current: 5, failed: null, caption: 'Satın alma aşamasında', doneAll: false };
  }
  if (p === 'COMPLETED') {
    return { current: 5, failed: null, caption: 'Tamamlandı', doneAll: true };
  }
  if (p === 'VENDOR_QUOTED') {
    return { current: 2, failed: null, caption: 'Teklifler değerlendirmede', doneAll: false };
  }
  if (p === 'SENT_TO_VENDOR') {
    return { current: 2, failed: null, caption: 'Tedarikçilerden teklif bekleniyor', doneAll: false };
  }
  if (p === 'DRAFT') {
    return { current: 2, failed: null, caption: 'Satın alma teklif listesini hazırlıyor', doneAll: false };
  }
  return { current: 2, failed: null, caption: 'Satın alma işleme aldı', doneAll: false };
}

export function pipelineColumnKey(status: string, procurementStatus?: string | null) {
  if (status === 'DRAFT') return 'draft';
  const { current } = resolvePipeline(status, procurementStatus);
  return PIPELINE_STEPS[current]?.key ?? 'review';
}

/** Birim talebi satın alma talebine döndü ama henüz tedarikçiye gitmedi. */
export function isPurchasingDraft(status: string, procurementStatus?: string | null) {
  return status === 'CONVERTED' && (!procurementStatus || procurementStatus === 'DRAFT');
}

export function pipelineStepState(
  idx: number,
  pipeline: PipelineResult
): 'done' | 'active' | 'failed' | 'pending' {
  if (pipeline.failed === idx) return 'failed';
  if (pipeline.doneAll || idx < pipeline.current) return 'done';
  if (idx === pipeline.current) return 'active';
  return 'pending';
}
