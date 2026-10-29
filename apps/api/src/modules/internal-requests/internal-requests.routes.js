import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as controller from './internal-requests.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN', 'PURCHASING', 'DEPARTMENT'));

const uploadRoot = 'uploads/internal-requests';
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const uniqueFilename = (_req, file, cb) => {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  let ext = path.extname(file.originalname || '').toLowerCase();
  if (!ext && String(file.mimetype || '').startsWith('image/')) {
    const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
    ext = map[file.mimetype] || '.png';
  }
  cb(null, `${unique}${ext}`);
};

const attachmentStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadRoot, req.params.id || '_pending');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: uniqueFilename,
});

const pendingStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadRoot, '_pending', req.user?.id || 'anon');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: uniqueFilename,
});

const allowedExtensions = new Set(['.pdf', '.zip', '.rar', '.7z', '.tar', '.gz', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.webp']);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExtensions.has(ext) || ext === '.svg') {
    return cb(new Error('İzin verilen türler: PDF, ZIP, RAR, 7Z ve ofis/görsel dosyaları.'));
  }
  const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const mime = String(file.mimetype || '');
  if (imageExt.has(ext)) {
    if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
      return cb(new Error('Görsel dosya MIME türü geçersiz.'));
    }
  } else if (!mime || mime === 'application/octet-stream') {
    // Uzantı allowlist'te; boş/jenerik MIME kabul (bazı istemciler böyle gönderir)
  }
  cb(null, true);
};

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 8 },
  fileFilter,
});

const submitUpload = multer({
  storage: pendingStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 48 },
  fileFilter,
});

const messageUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 16 },
  fileFilter,
});

router.get('/', controller.getAll);
router.get('/board/counts', controller.getBoardCounts);
router.get('/board', controller.listBoardColumn);
router.get('/assignees', controller.listAssignees);
router.post('/', controller.create);
router.post('/submit-with-files', submitUpload.any(), controller.createAndSubmit);
router.get('/:id', controller.getById);
router.get('/:id/messages', controller.listMessages);
router.post(
  '/:id/messages',
  messageUpload.fields([
    { name: 'files', maxCount: 8 },
    { name: 'inlineImages', maxCount: 8 },
  ]),
  controller.postMessage
);
router.put('/:id', controller.update);
router.post('/:id/submit', controller.submit);
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);
router.post('/:id/convert', controller.convertToRfq);
router.delete('/:id', controller.remove);
router.post('/:id/attachments', attachmentUpload.array('files', 8), controller.uploadAttachments);
router.get('/:id/attachments/:attachmentId', controller.downloadAttachment);
router.delete('/:id/attachments/:attachmentId', controller.deleteAttachment);

export default router;
