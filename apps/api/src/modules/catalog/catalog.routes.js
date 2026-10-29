import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as catalogController from './catalog.controller.js';

const router = Router();

// Ensure upload dir exists
const uploadDir = 'uploads/catalogs';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 350 * 1024 * 1024 }, // 350MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  },
});

// Routes
router.get('/', authenticate, catalogController.getAll);
router.get('/my', authenticate, authorize('SUPPLIER'), catalogController.getMy);
router.post(
  '/',
  authenticate,
  authorize('SUPPLIER'),
  upload.single('file'),
  catalogController.upload
);
router.delete('/:id', authenticate, authorize('SUPPLIER', 'ADMIN'), catalogController.remove);

export default router;
