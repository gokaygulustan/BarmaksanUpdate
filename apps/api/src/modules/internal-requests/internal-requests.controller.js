import * as service from './internal-requests.service.js';
import { streamAttachmentToResponse } from '../../utils/attachmentDownload.js';
import {
  createInternalRequestSchema,
  updateInternalRequestSchema,
  reviewInternalRequestSchema,
  chatMessageSchema,
} from './internal-requests.schema.js';

const parseCreateBody = (body) => {
  const raw = { ...body };
  if (typeof raw.items === 'string') {
    try {
      raw.items = JSON.parse(raw.items);
    } catch {
      raw.items = [];
    }
  }
  if (raw.items && Array.isArray(raw.items)) {
    raw.items = raw.items.map((item) => ({
      ...item,
      quantity: item.quantity != null ? Number(item.quantity) : 1,
    }));
  }
  if (raw.shopDepartmentId === '') raw.shopDepartmentId = null;
  if (raw.shopWorkerId === '') raw.shopWorkerId = null;
  return createInternalRequestSchema.parse(raw);
};

export const getAll = async (req, res, next) => {
  try {
    const mine = String(req.query.mine || '') === '1' || String(req.query.mine || '').toLowerCase() === 'true';
    res.json(await service.getAll(req.user, { mine }));
  } catch (e) {
    next(e);
  }
};

const parseUnits = (raw) =>
  String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const parseMine = (raw) => String(raw || '') === '1' || String(raw || '').toLowerCase() === 'true';

export const getBoardCounts = async (req, res, next) => {
  try {
    res.json(
      await service.getBoardCounts(req.user, parseUnits(req.query.units), req.query.q, parseMine(req.query.mine))
    );
  } catch (e) {
    next(e);
  }
};

export const listBoardColumn = async (req, res, next) => {
  try {
    res.json(
      await service.listBoardColumn(req.user, {
        column: String(req.query.column || ''),
        cursor: req.query.cursor ? String(req.query.cursor) : undefined,
        limit: req.query.limit,
        units: parseUnits(req.query.units),
        q: req.query.q ? String(req.query.q) : undefined,
        mine: parseMine(req.query.mine),
      })
    );
  } catch (e) {
    next(e);
  }
};

export const listAssignees = async (req, res, next) => {
  try {
    res.json(await service.listAssignableStaff(req.user, req.query.moduleId));
  } catch (e) {
    next(e);
  }
};

export const getById = async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.id, req.user));
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    const data = parseCreateBody(req.body);
    res.status(201).json(await service.create(data, req.user));
  } catch (e) {
    next(e);
  }
};

const fileBag = (files) => {
  if (!files) return { files: [], inlineImages: [], itemFiles: new Map() };
  if (Array.isArray(files)) {
    const filesOut = [];
    const inlineImages = [];
    const itemFiles = new Map();
    for (const file of files) {
      const name = String(file.fieldname || '');
      const itemMatch = /^itemFiles-(\d+)$/.exec(name);
      if (itemMatch) {
        const idx = Number(itemMatch[1]);
        const list = itemFiles.get(idx) || [];
        list.push(file);
        itemFiles.set(idx, list);
      } else if (name === 'inlineImages') {
        inlineImages.push(file);
      } else {
        filesOut.push(file);
      }
    }
    return { files: filesOut, inlineImages, itemFiles };
  }
  const itemFiles = new Map();
  for (const [name, list] of Object.entries(files)) {
    const itemMatch = /^itemFiles-(\d+)$/.exec(name);
    if (!itemMatch) continue;
    itemFiles.set(Number(itemMatch[1]), list || []);
  }
  return {
    files: files.files || [],
    inlineImages: files.inlineImages || [],
    itemFiles,
  };
};

export const createAndSubmit = async (req, res, next) => {
  try {
    const data = parseCreateBody(req.body);
    const created = await service.create(data, req.user);
    try {
      const bag = fileBag(req.files);
      if (bag.files.length) {
        await service.addAttachments(created.id, bag.files, req.user);
      }
      const orderedItems = created.items || [];
      for (const [idx, files] of bag.itemFiles) {
        const item = orderedItems[idx];
        if (!item?.id || !files?.length) continue;
        await service.addAttachments(created.id, files, req.user, { itemId: item.id });
      }
      if (bag.inlineImages.length && data.description) {
        await service.attachInlineImages(created.id, bag.inlineImages, req.user, data.description);
      }
      res.status(201).json(await service.submit(created.id, req.user));
    } catch (inner) {
      // Gönderim yarıda kalırsa kullanıcıya görünmeyen taslak artığı bırakma.
      await service.remove(created.id, req.user).catch(() => {});
      throw inner;
    }
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateInternalRequestSchema.parse(req.body);
    res.json(await service.update(req.params.id, data, req.user));
  } catch (e) {
    next(e);
  }
};

export const submit = async (req, res, next) => {
  try {
    res.json(await service.submit(req.params.id, req.user));
  } catch (e) {
    next(e);
  }
};

export const approve = async (req, res, next) => {
  try {
    const parsed = reviewInternalRequestSchema.parse(req.body || {});
    const assignedToIds = parsed.assignedToIds?.length
      ? parsed.assignedToIds
      : parsed.assignedToId
        ? [parsed.assignedToId]
        : [];
    res.json(await service.approve(req.params.id, req.user, parsed.note, assignedToIds));
  } catch (e) {
    next(e);
  }
};

export const reject = async (req, res, next) => {
  try {
    const { note } = reviewInternalRequestSchema.parse(req.body || {});
    res.json(await service.reject(req.params.id, req.user, note));
  } catch (e) {
    next(e);
  }
};

export const convertToRfq = async (req, res, next) => {
  try {
    res.json(await service.convertToRfq(req.params.id, req.user, req.body || {}));
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id, req.user);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

export const uploadAttachments = async (req, res, next) => {
  try {
    res.json(
      await service.addAttachments(req.params.id, req.files || [], req.user, {
        itemId: req.body?.itemId || null,
      })
    );
  } catch (e) {
    next(e);
  }
};

export const downloadAttachment = async (req, res, next) => {
  try {
    const file = await service.getAttachmentFile(req.params.id, req.params.attachmentId, req.user);
    await streamAttachmentToResponse(res, file.abs, file.originalName, file.mimeType);
  } catch (e) {
    next(e);
  }
};

export const deleteAttachment = async (req, res, next) => {
  try {
    res.json(await service.removeAttachment(req.params.id, req.params.attachmentId, req.user));
  } catch (e) {
    next(e);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    res.json(await service.listMessages(req.params.id, req.user));
  } catch (e) {
    next(e);
  }
};

export const postMessage = async (req, res, next) => {
  try {
    const { body } = chatMessageSchema.parse(req.body || {});
    const bag = fileBag(req.files);
    res.status(201).json(await service.postMessage(req.params.id, req.user, body, bag));
  } catch (e) {
    next(e);
  }
};
