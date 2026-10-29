import fs from 'fs';
import * as procurementService from './procurement.service.js';
import * as handoverService from './handover.service.js';
import { removeUnreferencedUploads } from './upload-guard.js';
import * as procurementListTemplateService from './procurementListTemplate.service.js';
import { streamAttachmentToResponse, setAttachmentDownloadHeaders } from '../../utils/attachmentDownload.js';
import { renderOrderDossierPdf } from './orderDossierPdf.js';
import {
  createRequestSchema,
  updateRequestSchema,
  itemVendorPicksSchema,
  decisionInviteBodySchema,
} from './procurement.schema.js';

const validateQuotePayload = (items, overallDiscountRate, res) => {
  if (!items || !Array.isArray(items)) {
    res.status(400).json({ message: 'Items must be an array' });
    return false;
  }

  const hasInvalidPrice = items.some(
    (item) => item.price !== null && item.price !== undefined && (!Number.isFinite(item.price) || item.price < 0)
  );
  if (hasInvalidPrice) {
    res.status(400).json({ message: 'Price must be a finite number and cannot be negative.' });
    return false;
  }

  const hasInvalidDiscount = items.some(
    (item) =>
      item.discountRate !== null &&
      item.discountRate !== undefined &&
      (!Number.isFinite(item.discountRate) || item.discountRate < 0 || item.discountRate > 100)
  );
  if (hasInvalidDiscount) {
    res.status(400).json({ message: 'Item discountRate must be between 0 and 100.' });
    return false;
  }

  if (
    overallDiscountRate !== null &&
    overallDiscountRate !== undefined &&
    (!Number.isFinite(overallDiscountRate) || overallDiscountRate < 0 || overallDiscountRate > 100)
  ) {
    res.status(400).json({ message: 'overallDiscountRate must be between 0 and 100.' });
    return false;
  }

  return true;
};

export const getAll = async (req, res, next) => {
  try {
    res.json(
      await procurementService.getAll(req.user.id, req.user.role, req.user.moduleId, req.user, {
        shopDepartmentId: req.query.shopDepartmentId || undefined,
        shopWorkerId: req.query.shopWorkerId || undefined,
      })
    );
  } catch (e) { next(e); }
};

export const listCentral = async (req, res, next) => {
  try {
    res.json(await procurementService.listCentral(req.user));
  } catch (e) {
    next(e);
  }
};

export const getById = async (req, res, next) => {
  try { res.json(await procurementService.getById(req.params.id, req.user)); } catch (e) { next(e); }
};

export const upsertItemVendorPicks = async (req, res, next) => {
  try {
    const data = itemVendorPicksSchema.parse(req.body);
    res.json(
      await procurementService.upsertItemVendorPicks(req.params.id, req.user.id, data.choices)
    );
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    const data = createRequestSchema.parse(req.body);
    res.status(201).json(await procurementService.create(data, req.user.id, req.user, req.user.moduleId));
  } catch (e) { next(e); }
};

export const update = async (req, res, next) => {
  try {
    const data = updateRequestSchema.parse(req.body);
    res.json(await procurementService.update(req.params.id, data, req.user, req.user));
  } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try {
    await procurementService.remove(req.params.id, req.user);
    res.status(204).send();
  } catch (e) { next(e); }
};

export const addComment = async (req, res, next) => {
  try {
    const { content, targetVendorId } = req.body;
    if (!content) return res.status(400).json({ message: "Content is required" });
    const comment = await procurementService.addComment(req.params.id, req.user.id, content, targetVendorId);
    res.status(201).json(comment);
  } catch (e) { next(e); }
};

export const submitQuote = async (req, res, next) => {
  try {
    const {
      items,
      overallDiscountRate,
      isShippingIncluded,
      isVatIncluded,
      vatRate,
      hasMaturity,
      maturityDays,
      usdRateFixed,
      usdRate,
      eurRate,
      chfRate,
      quoteNote,
    } = req.body;
    if (!validateQuotePayload(items, overallDiscountRate, res)) return;
    res.json(
      await procurementService.submitQuote(req.params.id, items, req.user, overallDiscountRate, {
        isShippingIncluded,
        isVatIncluded,
        vatRate,
        hasMaturity,
        maturityDays,
        usdRateFixed,
        usdRate,
        eurRate,
        chfRate,
        quoteNote,
      }),
    );
  } catch (e) { next(e); }
};

export const getByToken = async (req, res, next) => {
  try {
    if (req.user) {
      await procurementService.noteStaffQuoteAccess(req.params.token, req.user).catch(() => {});
    }
    res.json(await procurementService.getByToken(req.params.token));
  } catch (e) {
    next(e);
  }
};

/** SMS kısa link: /q/:code → uzun teklif token’ına çözülür */
export const resolveQuoteShortCode = async (req, res, next) => {
  try {
    const { resolveQuoteTokenByShortCode } = await import('../../lib/quoteShortCode.js');
    const token = await resolveQuoteTokenByShortCode(req.params.code);
    if (!token) {
      return res.status(404).json({ message: 'Geçersiz veya süresi dolmuş bağlantı.' });
    }
    res.json({ quoteToken: token });
  } catch (e) {
    next(e);
  }
};

export const recordChannelAction = async (req, res, next) => {
  try {
    const action = req.body?.action;
    const vendorId = req.body?.vendorId;
    res.json(await procurementService.recordChannelAction(req.params.id, req.user, { action, vendorId }));
  } catch (e) {
    next(e);
  }
};

export const submitQuoteByToken = async (req, res, next) => {
  try {
    const {
      items,
      overallDiscountRate,
      isShippingIncluded,
      isVatIncluded,
      vatRate,
      hasMaturity,
      maturityDays,
      usdRateFixed,
      usdRate,
      eurRate,
      chfRate,
      quoteNote,
    } = req.body;
    if (!validateQuotePayload(items, overallDiscountRate, res)) return;
    if (req.user) {
      await procurementService.noteStaffQuoteAccess(req.params.token, req.user).catch(() => {});
    }
    res.json(
      await procurementService.submitQuoteByToken(req.params.token, items, overallDiscountRate, {
        isShippingIncluded,
        isVatIncluded,
        vatRate,
        hasMaturity,
        maturityDays,
        usdRateFixed,
        usdRate,
        eurRate,
        chfRate,
        quoteNote,
      }),
    );
  } catch (e) { next(e); }
};

export const getByDecisionToken = async (req, res, next) => {
  try {
    res.json(await procurementService.getByDecisionToken(req.params.token));
  } catch (e) {
    next(e);
  }
};

export const upsertItemVendorPicksByDecisionToken = async (req, res, next) => {
  try {
    const data = itemVendorPicksSchema.parse(req.body);
    res.json(
      await procurementService.upsertItemVendorPicksByDecisionToken(req.params.token, data.choices)
    );
  } catch (e) {
    next(e);
  }
};

export const createDecisionInvite = async (req, res, next) => {
  try {
    const parsed = decisionInviteBodySchema.safeParse(req.body ?? {});
    const extraEmails = parsed.success ? parsed.data.extraEmails : [];
    const includeCanonical = parsed.success ? parsed.data.includeCanonical : undefined;
    res.json(
      await procurementService.createDecisionInvite(
        req.params.id,
        req.user.id,
        extraEmails,
        includeCanonical,
        req.user,
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const revokeDecisionInvite = async (req, res, next) => {
  try {
    res.json(await procurementService.revokeLatestDecisionInviteGrace(req.params.id, req.user));
  } catch (e) {
    next(e);
  }
};

export const resendExecutiveInbox = async (req, res, next) => {
  try {
    const parsed = decisionInviteBodySchema.safeParse(req.body ?? {});
    const extraEmails = parsed.success ? parsed.data.extraEmails : [];
    const includeCanonical = parsed.success ? parsed.data.includeCanonical : undefined;
    res.json(
      await procurementService.resendExecutiveInbox(
        req.params.id,
        req.user,
        extraEmails,
        includeCanonical,
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const resendVendorNotificationEmail = async (req, res, next) => {
  try {
    const vendorId = req.body?.vendorId;
    if (!vendorId || typeof vendorId !== 'string') {
      return res.status(400).json({ message: 'vendorId gerekli.' });
    }
    res.json(
      await procurementService.resendVendorNotificationEmail(req.params.id, vendorId, req.user)
    );
  } catch (e) {
    next(e);
  }
};

export const resendVendorNotificationSms = async (req, res, next) => {
  try {
    const vendorId = req.body?.vendorId;
    if (!vendorId || typeof vendorId !== 'string') {
      return res.status(400).json({ message: 'vendorId gerekli.' });
    }
    const phone =
      typeof req.body?.phone === 'string' && req.body.phone.trim()
        ? req.body.phone.trim()
        : null;
    res.json(
      await procurementService.resendVendorNotificationSms(req.params.id, vendorId, req.user, {
        phone,
      })
    );
  } catch (e) {
    next(e);
  }
};

export const uploadAttachments = async (req, res, next) => {
  try {
    const files = req.files;
    if (!files?.length) {
      return res.status(400).json({ message: 'Dosya seçilmedi.' });
    }
    const itemId = req.body?.itemId || req.query?.itemId || null;
    const rows = await procurementService.addAttachmentsFromUpload(req.params.id, files, {
      itemId: itemId && String(itemId).trim() ? String(itemId).trim() : null,
      actor: req.user,
    });
    res.status(201).json(rows);
  } catch (e) {
    await removeUnreferencedUploads(req);
    next(e);
  }
};

export const upsertMarketOffer = async (req, res, next) => {
  try {
    const files = req.files || [];
    const data = await procurementService.upsertMarketOffer(
      req.params.id,
      req.user,
      req.body || {},
      files
    );
    res.status(201).json(data);
  } catch (e) {
    await removeUnreferencedUploads(req);
    next(e);
  }
};

export const updateMarketQuote = async (req, res, next) => {
  try {
    res.json(
      await procurementService.updateMarketQuote(
        req.params.id,
        req.params.quoteId,
        req.user,
        req.body || {}
      )
    );
  } catch (e) {
    next(e);
  }
};

export const deleteMarketQuote = async (req, res, next) => {
  try {
    res.json(
      await procurementService.deleteMarketQuote(req.params.id, req.params.quoteId, req.user)
    );
  } catch (e) {
    next(e);
  }
};

export const deleteItemQuote = async (req, res, next) => {
  try {
    res.json(
      await procurementService.deleteItemQuote(req.params.id, req.params.quoteId, req.user)
    );
  } catch (e) {
    next(e);
  }
};

export const renameRequestItem = async (req, res, next) => {
  try {
    res.json(
      await procurementService.renameRequestItem(
        req.params.id,
        req.params.itemId,
        req.user,
        req.body?.productName,
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const deleteMarketSource = async (req, res, next) => {
  try {
    res.json(
      await procurementService.deleteMarketSource(req.params.id, req.params.sourceId, req.user)
    );
  } catch (e) {
    next(e);
  }
};

export const downloadAttachment = async (req, res, next) => {
  try {
    const att = await procurementService.getAttachmentForRequest(
      req.params.id,
      req.params.attachmentId
    );
    await procurementService.assertAttachmentDownloadAllowed(req.user, att);
    const abs = procurementService.resolveAttachmentAbsolutePath(att);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ message: 'Dosya bulunamadı.' });
    }
    await streamAttachmentToResponse(res, abs, att.originalName, att.mimeType);
  } catch (e) {
    next(e);
  }
};

export const downloadAttachmentByToken = async (req, res, next) => {
  try {
    const att = await procurementService.getAttachmentForQuoteToken(
      req.params.token,
      req.params.attachmentId
    );
    const abs = procurementService.resolveAttachmentAbsolutePath(att);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ message: 'Dosya bulunamadı.' });
    }
    await streamAttachmentToResponse(res, abs, att.originalName, att.mimeType);
  } catch (e) {
    next(e);
  }
};

export const downloadAttachmentByOverLimitToken = async (req, res, next) => {
  try {
    const att = await procurementService.getAttachmentForOverLimitToken(
      req.params.token,
      req.params.requestId,
      req.params.attachmentId
    );
    const abs = procurementService.resolveAttachmentAbsolutePath(att);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ message: 'Dosya bulunamadı.' });
    }
    await streamAttachmentToResponse(res, abs, att.originalName, att.mimeType);
  } catch (e) {
    next(e);
  }
};

export const uploadVendorAttachmentsByToken = async (req, res, next) => {
  try {
    const files = req.files;
    if (!files?.length) {
      return res.status(400).json({ message: 'Dosya seçilmedi.' });
    }
    const itemId = req.body?.itemId || req.query?.itemId || null;
    const rows = await procurementService.addVendorAttachmentsFromUpload(req.params.token, files, {
      itemId: itemId && String(itemId).trim() ? String(itemId).trim() : null,
    });
    res.status(201).json(rows);
  } catch (e) {
    await removeUnreferencedUploads(req);
    next(e);
  }
};

export const getProcurementListTemplateMeta = async (req, res, next) => {
  try {
    if (req.query?.moduleId) {
      return res.json(
        await procurementListTemplateService.getTemplateMeta(req.query.moduleId),
      );
    }
    res.json(await procurementListTemplateService.getAllTemplateMetas());
  } catch (e) {
    next(e);
  }
};

export const downloadProcurementListTemplate = async (req, res, next) => {
  try {
    const requested = String(req.query?.moduleId || '').trim();
    if (req.user?.role === 'DEPARTMENT' && requested && requested !== 'BIRIM_TALEP') {
      return res.status(403).json({ message: 'Bu şablonu indirme yetkiniz yok.' });
    }
    const moduleId = procurementListTemplateService.normalizeTemplateModuleId(
      requested || (req.user?.role === 'DEPARTMENT' ? 'BIRIM_TALEP' : req.user?.moduleId),
    );
    if (req.user?.role === 'DEPARTMENT' && moduleId !== 'BIRIM_TALEP') {
      return res.status(403).json({ message: 'Bu şablonu indirme yetkiniz yok.' });
    }
    if (req.user?.role !== 'ADMIN' && moduleId !== 'BIRIM_TALEP') {
      if (
        req.user?.moduleId &&
        moduleId !== procurementListTemplateService.normalizeTemplateModuleId(req.user.moduleId)
      ) {
        return res.status(403).json({ message: 'Bu şablonu indirme yetkiniz yok.' });
      }
      const enabled = await procurementService.isExcelImportEnabled(req.user?.moduleId || moduleId);
      if (!enabled) {
        return res
          .status(403)
          .json({ message: 'Excel ile toplu kalem ekleme bu modül için kapalı.' });
      }
    }
    const { buffer, filename, mimeType } =
      await procurementListTemplateService.getTemplateBufferForDownload(moduleId);
    setAttachmentDownloadHeaders(res, filename, mimeType);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
};

export const uploadProcurementListTemplate = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel dosyası seçilmedi.' });
    }
    const moduleId = procurementListTemplateService.normalizeTemplateModuleId(
      req.query?.moduleId || req.body?.moduleId,
    );
    const meta = await procurementListTemplateService.saveUploadedTemplate(req.file, moduleId);
    res.json(meta);
  } catch (e) {
    await removeUnreferencedUploads(req);
    next(e);
  }
};

export const getExcelImportSettings = async (req, res, next) => {
  try { res.json(await procurementService.getExcelImportSettings()); } catch (e) { next(e); }
};

export const updateExcelImportSetting = async (req, res, next) => {
  try {
    const { moduleId, isEnabled } = req.body || {};
    res.json(await procurementService.updateExcelImportSetting({ moduleId, isEnabled }));
  } catch (e) {
    next(e);
  }
};

export const getApprovalLimit = async (req, res, next) => {
  try { res.json(await procurementService.getApprovalLimit()); } catch (e) { next(e); }
};

export const updateApprovalLimit = async (req, res, next) => {
  try {
    const { limitAmount, isActive, executiveEmail } = req.body || {};
    res.json(
      await procurementService.updateApprovalLimit({ limitAmount, isActive, executiveEmail }),
    );
  } catch (e) {
    next(e);
  }
};

export const getStaffExecutiveInbox = async (req, res, next) => {
  try {
    res.json(await procurementService.getStaffExecutiveInbox(req.user));
  } catch (e) {
    next(e);
  }
};

export const getStaffExecutivePreviewLink = async (req, res, next) => {
  try {
    res.json(await procurementService.getStaffExecutivePreviewLink(req.user));
  } catch (e) {
    next(e);
  }
};

export const recallFromExecutiveInbox = async (req, res, next) => {
  try {
    res.json(await procurementService.recallFromExecutiveInbox(req.params.id, req.user));
  } catch (e) {
    next(e);
  }
};

export const getOverLimitInboxByToken = async (req, res, next) => {
  try {
    res.json(await procurementService.getOverLimitInboxByToken(req.params.token));
  } catch (e) {
    next(e);
  }
};

export const approveOverLimitByToken = async (req, res, next) => {
  try {
    const choices = Array.isArray(req.body?.choices) ? req.body.choices : null;
    res.json(
      await procurementService.approveOverLimitByToken(
        req.params.token,
        req.params.requestId,
        parseApprovalNote(req.body?.note),
        choices,
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const rejectOverLimitByToken = async (req, res, next) => {
  try {
    res.json(
      await procurementService.rejectOverLimitByToken(
        req.params.token,
        req.params.requestId,
        parseApprovalNote(req.body?.note),
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const getManagerUnderLimitInbox = async (req, res, next) => {
  try {
    res.json(await procurementService.getManagerUnderLimitInbox(req.user));
  } catch (e) {
    next(e);
  }
};

export const approveManagerUnderLimit = async (req, res, next) => {
  try {
    const choices = Array.isArray(req.body?.choices) ? req.body.choices : null;
    res.json(
      await procurementService.approveManagerUnderLimit(
        req.params.id,
        req.user,
        parseApprovalNote(req.body?.note),
        choices,
        parseVendorShippingCosts(req.body?.vendorShippingCosts),
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const rejectManagerUnderLimit = async (req, res, next) => {
  try {
    res.json(
      await procurementService.rejectManagerUnderLimit(
        req.params.id,
        req.user,
        parseApprovalNote(req.body?.note),
      ),
    );
  } catch (e) {
    next(e);
  }
};

/** Onay notu serbest metindir; boş/uzun değerler normalize edilir. */
const parseApprovalNote = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 1000);
};

const parseAvgShippingCostTRY = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  const s = String(raw).trim().replace(/\s/g, '');
  if (!s) return null;
  const n = s.includes(',')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

export const getOrderDossier = async (req, res, next) => {
  try {
    res.json(await procurementService.getOrderDossier(req.params.id, req.user));
  } catch (e) { next(e); }
};

export const downloadOrderDossierPdf = async (req, res, next) => {
  try {
    const data = await procurementService.getOrderDossier(req.params.id, req.user);
    const pdf = await renderOrderDossierPdf(data);
    const safeTitle = String(data.title || 'talep').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120);
    setAttachmentDownloadHeaders(res, `Sipariş dosyası - ${safeTitle}.pdf`, 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (e) { next(e); }
};

export const getApprovalSummary = async (req, res, next) => {
  try {
    res.json(await procurementService.getApprovalSummary(req.params.id, req.user));
  } catch (e) { next(e); }
};

const parseVendorShippingCosts = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const vendorId = String(row.vendorId || row.id || '').trim();
    if (!vendorId) continue;
    const costTRY = parseAvgShippingCostTRY(row.costTRY ?? row.amount);
    if (costTRY == null) continue;
    out.push({ vendorId, costTRY });
  }
  return out;
};

export const submitForApproval = async (req, res, next) => {
  try {
    res.json(
      await procurementService.submitForApproval(
        req.params.id,
        req.user,
        parseApprovalNote(req.body?.note),
        parseVendorShippingCosts(req.body?.vendorShippingCosts),
      ),
    );
  } catch (e) { next(e); }
};

export const withdrawFromManagerApproval = async (req, res, next) => {
  try {
    res.json(
      await procurementService.withdrawFromManagerApproval(
        req.params.id,
        req.user,
        parseApprovalNote(req.body?.note),
      ),
    );
  } catch (e) { next(e); }
};

export const managerApprove = async (req, res, next) => {
  try {
    const approvedVendorId =
      typeof req.body?.approvedVendorId === 'string' ? req.body.approvedVendorId : null;
    const extraEmails = Array.isArray(req.body?.extraEmails) ? req.body.extraEmails : [];
    const includeCanonical =
      typeof req.body?.includeCanonical === 'boolean' ? req.body.includeCanonical : undefined;
    res.json(
      await procurementService.managerApprove(
        req.params.id,
        req.user,
        parseApprovalNote(req.body?.note),
        {
          approvedVendorId,
          extraEmails,
          includeCanonical,
          vendorShippingCosts: parseVendorShippingCosts(req.body?.vendorShippingCosts),
        },
      ),
    );
  } catch (e) { next(e); }
};

export const adminApprove = async (req, res, next) => {
  try {
    res.json(await procurementService.adminApprove(req.params.id, req.user, parseApprovalNote(req.body?.note)));
  } catch (e) { next(e); }
};

export const routeToStaff = async (req, res, next) => {
  try {
    const raw = req.body?.targetUserId;
    const targetUserId =
      typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    res.json(
      await procurementService.routeToStaff(
        req.params.id,
        req.user,
        targetUserId,
        parseApprovalNote(req.body?.note),
      ),
    );
  } catch (e) {
    next(e);
  }
};

export const completePurchase = async (req, res, next) => {
  try {
    const sendWarehouseMail = Boolean(req.body?.sendWarehouseMail);
    const warehouseUserIds = Array.isArray(req.body?.warehouseUserIds)
      ? req.body.warehouseUserIds.filter((id) => typeof id === 'string')
      : null;
    res.json(
      await procurementService.completePurchase(
        req.params.id,
        req.user,
        parseApprovalNote(req.body?.note),
        { sendWarehouseMail, warehouseUserIds },
      ),
    );
  } catch (e) { next(e); }
};

export const uploadInvoice = async (req, res, next) => {
  try {
    const files = req.files;
    if (!files?.length) {
      return res.status(400).json({ message: 'Fatura dosyası seçilmedi.' });
    }
    let itemIds = req.body?.itemIds;
    if (typeof itemIds === 'string') {
      try {
        itemIds = JSON.parse(itemIds);
      } catch {
        itemIds = [];
      }
    }
    res.status(201).json(
      await procurementService.uploadInvoice(req.params.id, files, req.user, itemIds),
    );
  } catch (e) {
    await removeUnreferencedUploads(req);
    next(e);
  }
};

export const deleteInvoice = async (req, res, next) => {
  try {
    res.json(await procurementService.deleteInvoice(req.params.id, req.params.attachmentId, req.user));
  } catch (e) { next(e); }
};

export const rejectRequest = async (req, res, next) => {
  try {
    res.json(await procurementService.rejectRequest(req.params.id, req.user, parseApprovalNote(req.body?.note)));
  } catch (e) { next(e); }
};

export const getWarehouseDispatchList = async (req, res, next) => {
  try {
    res.json(await procurementService.getWarehouseDispatchList(req.params.id));
  } catch (e) { next(e); }
};

export const getWarehouseContacts = async (req, res, next) => {
  try {
    res.json(await procurementService.getWarehouseContacts());
  } catch (e) { next(e); }
};

export const sendWarehouseDispatchList = async (req, res, next) => {
  try {
    const { userIds, note } = req.body || {};
    res.json(
      await procurementService.sendWarehouseDispatchList(req.params.id, req.user, {
        userIds: Array.isArray(userIds) ? userIds.filter((x) => typeof x === 'string') : undefined,
        note,
      })
    );
  } catch (e) { next(e); }
};

export const createHandover = async (req, res, next) => {
  try {
    res.status(201).json(
      await handoverService.createHandover(req.params.id, req.user, {
        direction: req.body?.direction,
        note: req.body?.note ?? null,
      }),
    );
  } catch (e) {
    next(e);
  }
};

export const acceptHandover = async (req, res, next) => {
  try {
    res.json(
      await handoverService.decideHandover(req.params.id, req.params.handoverId, req.user, {
        accept: true,
        note: req.body?.note ?? null,
      }),
    );
  } catch (e) {
    next(e);
  }
};

export const rejectHandover = async (req, res, next) => {
  try {
    res.json(
      await handoverService.decideHandover(req.params.id, req.params.handoverId, req.user, {
        accept: false,
        note: req.body?.note ?? null,
      }),
    );
  } catch (e) {
    next(e);
  }
};

