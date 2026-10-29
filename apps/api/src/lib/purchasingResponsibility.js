import { MODULE } from './modules.js';

/** Satın alma işlemlerini yürüten hat. Boşsa kaynak moduleId geçerlidir. */
export const purchasingModuleOf = (request) =>
  request?.purchasingResponsibleModuleId || request?.moduleId || MODULE.URETIM;

/** Kaynak departman duruyor; satın alma sorumluluğu Satın Alma'ya geçmiş. */
export const isHandedToSatinAlma = (request) =>
  request?.purchasingResponsibleModuleId === MODULE.SATIN_ALMA &&
  (request?.moduleId || '') !== MODULE.SATIN_ALMA;

/**
 * Parasal limit ve satın alma onay zinciri.
 * Yalnız kaynak moduleId'si SATIN_ALMA olan veya kabul edilmiş devirle
 * sorumluluğu SATIN_ALMA'ya geçmiş taleplerde açılır.
 */
export const usesSatinAlmaApprovalChain = (request) =>
  (request?.moduleId || '') === MODULE.SATIN_ALMA || isHandedToSatinAlma(request);
