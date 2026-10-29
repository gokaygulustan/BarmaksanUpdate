import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as procurementController from './procurement.controller.js';
import * as procurementService from './procurement.service.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { beforeUpload, removeUploadedFiles } from './upload-guard.js';

const router = Router();

const procurementUploadRoot = 'uploads/procurement';
if (!fs.existsSync(procurementUploadRoot)) {
  fs.mkdirSync(procurementUploadRoot, { recursive: true });
}

const attachmentStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(procurementUploadRoot, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const listTemplateDir = path.join('uploads', 'procurement-list-template');
if (!fs.existsSync(listTemplateDir)) {
  fs.mkdirSync(listTemplateDir, { recursive: true });
}

const listTemplateStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, listTemplateDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `upload-${Date.now()}${path.extname(file.originalname) || '.xlsx'}`);
  },
});

const listTemplateUpload = multer({
  storage: listTemplateStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    if (ok) cb(null, true);
    else cb(new Error('Yalnızca Excel dosyası (.xlsx / .xls) yüklenebilir.'));
  },
});

const PROCUREMENT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

const procurementAttachmentMimeFilter = (_req, file, cb) => {
  const allowedExtensions = new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
    '.txt',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.dwg',
    '.dxf',
    '.stp',
    '.step',
    '.igs',
    '.iges',
    '.ifc',
    '.sat',
    '.x_t',
    '.x_b',
    '.prt',
    '.sldprt',
    '.sldasm',
  ]);
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExtensions.has(ext)) {
    return cb(new Error('Desteklenmeyen dosya türü.'));
  }
  const mime = String(file.mimetype || '').toLowerCase();
  const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
  if (imageExt.has(ext)) {
    if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
      return cb(new Error('Görsel dosya MIME türü geçersiz.'));
    }
  }
  // RAR/ZIP/CAD: Windows çoğu zaman application/octet-stream veya boş MIME gönderir.
  cb(null, true);
};

const acceptDiskUpload = (uploader, maxMb = 50) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (!err) return next();
    removeUploadedFiles(req).finally(() => {
      if (!res.headersSent) res.status(400).json({ message: multerUploadError(err, maxMb) });
    });
  });
};

const multerUploadError = (err, maxMb = 50) => {
  if (!err) return 'Yükleme hatası';
  if (err.code === 'LIMIT_FILE_SIZE') {
    return `Dosya en fazla ${maxMb} MB olabilir.`;
  }
  return err.message || 'Yükleme hatası';
};

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: PROCUREMENT_ATTACHMENT_MAX_BYTES, files: 24 },
  fileFilter: procurementAttachmentMimeFilter,
});

const vendorTokenAttachmentStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(procurementUploadRoot, '_vendor_pending', req.params.token);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const vendorTokenAttachmentUpload = multer({
  storage: vendorTokenAttachmentStorage,
  limits: { fileSize: PROCUREMENT_ATTACHMENT_MAX_BYTES, files: 12 },
  fileFilter: procurementAttachmentMimeFilter,
});

// Public Access via unique tokens (no login required)
router.get('/token/:token', optionalAuthenticate, procurementController.getByToken);
router.get('/short/:code', procurementController.resolveQuoteShortCode);
router.get(
  '/token/:token/attachments/:attachmentId',
  procurementController.downloadAttachmentByToken
);
router.post('/token/:token/quote', optionalAuthenticate, procurementController.submitQuoteByToken);
router.post(
  '/token/:token/vendor-attachments',
  acceptDiskUpload(vendorTokenAttachmentUpload.array('files', 12)),
  procurementController.uploadVendorAttachmentsByToken
);

router.get('/decision-token/:token', procurementController.getByDecisionToken);
router.put(
  '/decision-token/:token/item-vendor-picks',
  procurementController.upsertItemVendorPicksByDecisionToken
);

router.get('/over-limit-token/:token', procurementController.getOverLimitInboxByToken);
router.get(
  '/over-limit-token/:token/requests/:requestId/attachments/:attachmentId',
  procurementController.downloadAttachmentByOverLimitToken,
);
router.post(
  '/over-limit-token/:token/requests/:requestId/approve',
  procurementController.approveOverLimitByToken,
);
router.post(
  '/over-limit-token/:token/requests/:requestId/reject',
  procurementController.rejectOverLimitByToken,
);

router.use(authenticate);

router.get(
  '/manager-inbox',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.getManagerUnderLimitInbox,
);
router.post(
  '/manager-inbox/:id/approve',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.approveManagerUnderLimit,
);
router.post(
  '/manager-inbox/:id/reject',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.rejectManagerUnderLimit,
);

router.get('/settings/approval-limit', authorize('ADMIN', 'PURCHASING'), procurementController.getApprovalLimit);
router.put('/settings/approval-limit', authorize('ADMIN'), procurementController.updateApprovalLimit);

router.get(
  '/settings/executive-inbox',
  authorize('ADMIN'),
  procurementController.getStaffExecutiveInbox,
);
router.get(
  '/settings/executive-inbox/preview-link',
  authorize('ADMIN'),
  procurementController.getStaffExecutivePreviewLink,
);
router.post(
  '/settings/executive-inbox/:id/recall',
  authorize('ADMIN'),
  procurementController.recallFromExecutiveInbox,
);

router.get(
  '/settings/excel-import',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.getExcelImportSettings,
);
router.put(
  '/settings/excel-import',
  authorize('ADMIN'),
  procurementController.updateExcelImportSetting,
);

router.get('/', authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), procurementController.getAll);

router.get(
  '/list-template',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.getProcurementListTemplateMeta
);
router.get(
  '/list-template/download',
  authorize('ADMIN', 'PURCHASING', 'DEPARTMENT'),
  procurementController.downloadProcurementListTemplate
);
router.post(
  '/list-template',
  authorize('ADMIN'),
  acceptDiskUpload(listTemplateUpload.single('file'), 15),
  procurementController.uploadProcurementListTemplate
);

router.post(
  '/:id/channel-action',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.recordChannelAction
);

router.put(
  '/:id/item-vendor-picks',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.upsertItemVendorPicks
);
router.post(
  '/:id/decision-invite',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.createDecisionInvite
);
router.delete(
  '/:id/decision-invite',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.revokeDecisionInvite
);
router.post(
  '/:id/executive-inbox-resend',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.resendExecutiveInbox
);
router.post(
  '/:id/resend-vendor-email',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.resendVendorNotificationEmail
);
router.post(
  '/:id/resend-vendor-sms',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.resendVendorNotificationSms
);
router.get('/:id/attachments/:attachmentId', authenticate, procurementController.downloadAttachment);
router.post(
  '/:id/attachments',
  authenticate,
  authorize('ADMIN', 'PURCHASING'),
  beforeUpload((req) => procurementService.assertAttachmentUploadAllowed(req.params.id, req.user)),
  acceptDiskUpload(attachmentUpload.array('files', 24)),
  procurementController.uploadAttachments
);

router.post(
  '/:id/market-offers',
  authorize('ADMIN', 'PURCHASING'),
  beforeUpload((req) => procurementService.assertMarketUploadAllowed(req.params.id, req.user)),
  acceptDiskUpload(attachmentUpload.array('files', 8)),
  procurementController.upsertMarketOffer
);
router.patch(
  '/:id/market-quotes/:quoteId',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.updateMarketQuote
);
router.delete(
  '/:id/market-quotes/:quoteId',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.deleteMarketQuote
);
router.delete(
  '/:id/item-quotes/:quoteId',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.deleteItemQuote
);
router.patch(
  '/:id/items/:itemId',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.renameRequestItem
);
router.delete(
  '/:id/market-sources/:sourceId',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.deleteMarketSource
);

router.get('/:id/order-dossier', authorize('ADMIN', 'PURCHASING'), procurementController.getOrderDossier);
router.get('/:id/order-dossier/pdf', authorize('ADMIN', 'PURCHASING'), procurementController.downloadOrderDossierPdf);
router.get('/:id/approval-summary', authorize('ADMIN', 'PURCHASING'), procurementController.getApprovalSummary);
router.post('/:id/submit-approval', authorize('ADMIN', 'PURCHASING'), procurementController.submitForApproval);
router.post(
  '/:id/withdraw-approval',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.withdrawFromManagerApproval
);
router.post('/:id/manager-approve', authorize('ADMIN', 'PURCHASING'), procurementController.managerApprove);
router.post('/:id/admin-approve', authorize('ADMIN'), procurementController.adminApprove);
router.post('/:id/route-staff', authorize('ADMIN', 'PURCHASING'), procurementController.routeToStaff);
router.post('/:id/complete', authorize('ADMIN', 'PURCHASING'), procurementController.completePurchase);
router.post(
  '/:id/invoice',
  authorize('ADMIN', 'PURCHASING'),
  acceptDiskUpload(attachmentUpload.array('files', 12)),
  procurementController.uploadInvoice
);
router.delete(
  '/:id/invoice/:attachmentId',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.deleteInvoice
);
router.post('/:id/reject', authorize('ADMIN', 'PURCHASING'), procurementController.rejectRequest);
router.get('/warehouse-contacts', authorize('ADMIN', 'PURCHASING'), procurementController.getWarehouseContacts);
router.get('/:id/warehouse-dispatch', authorize('ADMIN', 'PURCHASING'), procurementController.getWarehouseDispatchList);
router.post(
  '/:id/warehouse-dispatch/send',
  authorize('ADMIN', 'PURCHASING'),
  procurementController.sendWarehouseDispatchList
);

router.get('/central', authorize('ADMIN', 'PURCHASING'), procurementController.listCentral);
router.get('/:id', authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), procurementController.getById);
router.post('/', authorize('ADMIN', 'PURCHASING'), procurementController.create);
router.put('/:id', authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), procurementController.update); // Supplier can update status
router.put('/:id/quote', authorize('SUPPLIER'), procurementController.submitQuote); // Supplier sends prices
router.post('/:id/comments', procurementController.addComment); // All authenticated can comment
router.delete('/:id', authorize('ADMIN'), procurementController.remove);

export default router;
