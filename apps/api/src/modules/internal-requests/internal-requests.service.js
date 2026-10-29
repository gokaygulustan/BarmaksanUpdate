import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma.js';
import { sanitizeRichHtml } from '../../lib/sanitizeHtml.js';
import { recordAudit } from '../../lib/audit.js';
import {
  isExecutiveUser,
  isSilentChatViewer,
  managesUnitModule,
  unitRequestModuleOf,
} from '../../lib/access.js';
import {
  sendDepartmentRequestMail,
  sendInternalRequestAssignedMail,
  sendNewChatMail,
  sendRequesterStatusMail,
} from '../mail/mail-settings.service.js';
import { getFrontendBaseUrl } from '../../config/frontendUrl.js';
import { decodeMultipartOriginalName, decodeStoredOriginalName } from '../../utils/multipartFilename.js';
import { BOARD_COLUMNS, columnWhere, slowestProcurementStatus } from '../../lib/internalRequestColumns.js';
import { filterNotifyUserIds } from '../../lib/mailSink.js';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'internal-requests');

const includeFull = {
  items: { orderBy: { sortOrder: 'asc' } },
  attachments: { orderBy: { createdAt: 'asc' } },
  createdBy: { select: { id: true, name: true, email: true, moduleId: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  shopDepartment: { select: { id: true, name: true, collarType: true } },
  shopWorker: { select: { id: true, firstName: true, lastName: true, departmentId: true } },
  assignees: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  },
  procurementRequests: {
    select: { id: true, title: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
};

const assigneeUserIds = (row) => {
  const ids = new Set();
  if (row?.assignedToId) ids.add(row.assignedToId);
  for (const a of row?.assignees || []) {
    if (a.userId) ids.add(a.userId);
    else if (a.user?.id) ids.add(a.user.id);
    else if (a.id) ids.add(a.id);
  }
  return ids;
};

const isAssignedStaff = (row, user) =>
  Boolean(
    user?.role === 'PURCHASING' &&
      user.subRole !== 'MANAGER' &&
      (user.moduleId || 'SATIN_ALMA') === (row?.moduleId || 'SATIN_ALMA') &&
      assigneeUserIds(row).has(user.id),
  );

const flattenAssignees = (row) => {
  const fromLinks = (row.assignees || [])
    .map((a) => a.user || (a.id && a.name ? a : null))
    .filter(Boolean);
  if (fromLinks.length) return fromLinks;
  if (row.assignedTo) return [row.assignedTo];
  return [];
};

const assertCanView = (row, user) => {
  if (user?.role === 'ADMIN' || isExecutiveUser(user)) return;
  if (managesUnitModule(user, row?.moduleId)) return;
  if (isAssignedStaff(row, user)) return;
  // Talebi açan kişi rolü ne olursa olsun kendi talebini görür; "Taleplerim"
  // listesi de aynı ölçütü kullanıyor (mineWhere).
  if (row.createdById === user.id) return;
  const err = new Error('Bu talebe erişim yetkiniz yok.');
  err.statusCode = 403;
  throw err;
};

const canHandlePurchasing = (row, user) =>
  Boolean(managesUnitModule(user, row?.moduleId) || isAssignedStaff(row, user));

const staffModuleFor = (user, requested) => {
  if (user?.role === 'ADMIN' || isExecutiveUser(user)) {
    return requested === 'URETIM_PLANLAMA' ? 'URETIM_PLANLAMA' : 'SATIN_ALMA';
  }
  return user?.moduleId === 'URETIM_PLANLAMA' ? 'URETIM_PLANLAMA' : 'SATIN_ALMA';
};

const notifyUnitManagers = async (moduleId, message, link) => {
  const mod = moduleId === 'URETIM_PLANLAMA' ? 'URETIM_PLANLAMA' : 'SATIN_ALMA';
  const managers = await prisma.user.findMany({
    where: { isActive: true, role: 'PURCHASING', moduleId: mod, subRole: 'MANAGER' },
    select: { id: true, name: true, email: true },
  });
  const ids = new Set(await filterNotifyUserIds(prisma, managers.map((u) => u.id)));
  const visible = managers.filter((u) => ids.has(u.id));
  if (!visible.length) return [];
  await prisma.notification.createMany({
    data: visible.map((u) => ({ userId: u.id, message, link: link || null })),
  });
  return visible;
};

/**
 * Talebi açan kişiye e-posta. İşlemi kendisi yaptıysa (ör. kendi talebini onaylayan
 * yetkili) kendine mail atmaz.
 */
const mailRequester = async (row, kind, { actor, actorLabel, note, itemNames, rfqTitle } = {}) => {
  const requester = row?.createdBy;
  if (!requester?.email) return;
  if (actor?.id && actor.id === requester.id) return;
  const link = `${getFrontendBaseUrl().replace(/\/$/, '')}/taleplerim/${row.id}`;
  await sendRequesterStatusMail(requester.email, {
    kind,
    title: row.title,
    requesterUnit: row.requesterUnit,
    actorName: actor?.name || null,
    actorLabel,
    note,
    itemNames,
    rfqTitle,
    link,
    recipientName: requester.name,
  }).catch((e) => console.error('Talep sahibine mail gönderilemedi:', e.message));
};

const presentAttachments = (attachments) =>
  (attachments || [])
    .filter((a) => (a.kind || 'FILE') === 'FILE' && !a.messageId)
    .map((a) => ({
      ...a,
      originalName: decodeStoredOriginalName(a.originalName) || a.originalName,
    }));

const presentForViewer = (row, user) => {
  if (!row) return row;
  const allFiles = presentAttachments(row.attachments);
  const attachments = allFiles.filter((a) => !a.itemId);
  const byItem = new Map();
  for (const a of allFiles) {
    if (!a.itemId) continue;
    const list = byItem.get(a.itemId) || [];
    list.push(a);
    byItem.set(a.itemId, list);
  }
  const items = (row.items || []).map((it) => ({
    ...it,
    attachments: byItem.get(it.id) || [],
  }));
  const assignees = flattenAssignees(row);
  const procurementRequests = row.procurementRequests || [];
  const procurementStatus = slowestProcurementStatus(procurementRequests.map((r) => r.status));
  const splits = procurementRequests.map((rfq) => ({
    id: rfq.id,
    title: rfq.title,
    status: rfq.status,
    createdAt: rfq.createdAt,
    items: items.filter((it) => it.procurementRequestId === rfq.id),
  }));
  const openItems = items.filter((it) => !it.procurementRequestId);
  if (user.role !== 'DEPARTMENT') {
    return { ...row, items, attachments, assignees, splits, openItems, procurementStatus };
  }
  const {
    procurementRequests: _rfqs,
    assignedTo,
    assignedToId,
    assignees: _hidden,
    reviewNote: _reviewNote,
    ...rest
  } = row;
  return {
    ...rest,
    items,
    attachments,
    splits,
    openItems,
    procurementStatus,
  };
};

const OWNER_EDITABLE_STATUSES = new Set(['DRAFT', 'SUBMITTED', 'REJECTED', 'APPROVED']);

const ownerCanMutate = (row, user) => {
  if (!row || !user) return false;
  if (row.createdById !== user.id) return false;
  if ((row.procurementRequests || []).length) return false;
  if ((row.items || []).some((it) => it.procurementRequestId)) return false;
  return OWNER_EDITABLE_STATUSES.has(row.status);
};

const assertOwnerCanMutate = (row, user) => {
  if (ownerCanMutate(row, user)) return;
  if (row?.createdById !== user?.id) {
    const err = new Error('Bu talebi yalnızca oluşturan düzenleyebilir.');
    err.statusCode = 403;
    throw err;
  }
  const err = new Error('Bu talep artık düzenlenemez; satın alma teklif sürecine aktarılmış.');
  err.statusCode = 409;
  throw err;
};

const normalizeItems = async (title, items) => {
  const clean = (items || [])
    .map((item) => ({
      id: item.id ? String(item.id) : null,
      productName: String(item.productName || '').trim(),
      quantity: Number(item.quantity) || 1,
      unit: item.unit || 'Adet',
      notes: item.notes || null,
      stockCode: item.stockCode || null,
    }))
    .filter((item) => item.productName);
  const source = clean.length
    ? clean
    : [{ id: null, productName: title, quantity: 1, unit: 'Adet', notes: null, stockCode: null }];
  const { resolve } = await import('../units/units.service.js');
  const out = [];
  for (const item of source) {
    const unit = await resolve(item.unit || 'Adet');
    out.push({ ...item, unit: unit?.name || item.unit || 'Adet' });
  }
  return out;
};

const resolveInternalShop = async (data, existing = null) => {
  let shopDepartmentId =
    data.shopDepartmentId !== undefined ? data.shopDepartmentId : existing?.shopDepartmentId ?? null;
  let shopWorkerId =
    data.shopWorkerId !== undefined ? data.shopWorkerId : existing?.shopWorkerId ?? null;
  let requesterUnit =
    data.requesterUnit !== undefined ? data.requesterUnit : existing?.requesterUnit ?? null;
  if (shopDepartmentId === '') shopDepartmentId = null;
  if (shopWorkerId === '') shopWorkerId = null;
  if (requesterUnit === '') requesterUnit = null;

  let dept = null;
  if (shopDepartmentId) {
    dept = await prisma.department.findUnique({ where: { id: shopDepartmentId } });
    if (!dept) {
      const err = new Error('Seçilen birim bulunamadı.');
      err.statusCode = 400;
      throw err;
    }
    if (!dept.isActive && shopDepartmentId !== existing?.shopDepartmentId) {
      const err = new Error('Seçilen birim pasif.');
      err.statusCode = 400;
      throw err;
    }
    requesterUnit = dept.name;
  } else if (requesterUnit) {
    dept = await prisma.department.findFirst({
      where: { name: { equals: String(requesterUnit).trim(), mode: 'insensitive' } },
    });
    if (dept) shopDepartmentId = dept.id;
  }

  if (shopWorkerId) {
    const worker = await prisma.orgWorker.findUnique({
      where: { id: shopWorkerId },
      include: { department: true },
    });
    if (!worker) {
      const err = new Error('Usta/çalışan bulunamadı.');
      err.statusCode = 400;
      throw err;
    }
    if (worker.department?.collarType !== 'BLUE_COLLAR') {
      const err = new Error('Usta/çalışan yalnızca mavi yaka birime bağlanabilir.');
      err.statusCode = 400;
      throw err;
    }
    if (shopDepartmentId && worker.departmentId !== shopDepartmentId) {
      const err = new Error('Usta/çalışan seçilen birime bağlı değil.');
      err.statusCode = 400;
      throw err;
    }
    if (!shopDepartmentId) {
      shopDepartmentId = worker.departmentId;
      requesterUnit = worker.department?.name || requesterUnit;
    }
  } else if (dept && dept.collarType !== 'BLUE_COLLAR') {
    shopWorkerId = null;
  }

  return { shopDepartmentId, shopWorkerId, requesterUnit };
};

const inboxWhere = (user) => {
  if (user?.role === 'ADMIN' || isExecutiveUser(user)) return {};
  if (user?.role === 'PURCHASING' && user.subRole === 'MANAGER') {
    return { moduleId: user.moduleId || 'URETIM_PLANLAMA' };
  }
  if (user?.role === 'PURCHASING') {
    return {
      moduleId: user.moduleId || 'URETIM_PLANLAMA',
      OR: [{ createdById: user.id }, { assignees: { some: { userId: user.id } } }],
    };
  }
  if (user.role === 'DEPARTMENT') return { createdById: user.id };
  return { id: '__none__' };
};

/** Taleplerim panosu: herkes yalnızca kendi açtığı talepleri görür. */
const mineWhere = (user) => ({ createdById: user.id });

const boardScopeWhere = (user, mine) => (mine ? mineWhere(user) : inboxWhere(user));

const canOpenUnitRequest = (user) =>
  Boolean(user && (user.role === 'DEPARTMENT' || user.role === 'ADMIN' || user.role === 'PURCHASING'));

export const getAll = async (user, { mine = false } = {}) => {
  const where = boardScopeWhere(user, mine);
  if (where.id === '__none__') return [];
  const rows = await prisma.internalRequest.findMany({
    where,
    include: includeFull,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => presentForViewer(row, user));
};

const boardSelect = {
  id: true,
  title: true,
  status: true,
  requesterUnit: true,
  neededBy: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  assignees: { include: { user: { select: { name: true } } } },
  items: { select: { procurementRequestId: true } },
  procurementRequests: { select: { status: true } },
};

const presentBoardRow = (row) => {
  const items = row.items || [];
  const sourcedItemCount = items.filter((it) => it.procurementRequestId).length;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    requesterUnit: row.requesterUnit,
    neededBy: row.neededBy || null,
    createdAt: row.createdAt,
    createdByName: row.createdBy?.name || null,
    assigneeNames: (row.assignees || []).map((a) => a.user?.name).filter(Boolean),
    procurementStatus:
      row.status === 'CONVERTED'
        ? slowestProcurementStatus((row.procurementRequests || []).map((r) => r.status))
        : null,
    sourcedItemCount,
    openItemCount: items.length - sourcedItemCount,
  };
};

const unitWhere = (units) => {
  const names = (units || []).map((u) => String(u).trim()).filter(Boolean);
  if (!names.length) return {};
  return {
    OR: names.map((name) => ({
      requesterUnit: { contains: name, mode: 'insensitive' },
    })),
  };
};

const searchWhere = (q) => {
  const term = String(q || '').trim();
  if (!term) return {};
  return {
    OR: [
      { title: { contains: term, mode: 'insensitive' } },
      { requesterUnit: { contains: term, mode: 'insensitive' } },
      { createdBy: { name: { contains: term, mode: 'insensitive' } } },
      { createdBy: { email: { contains: term, mode: 'insensitive' } } },
      { items: { some: { productName: { contains: term, mode: 'insensitive' } } } },
    ],
  };
};

export const getBoardCounts = async (user, units, q, mine = false) => {
  const base = boardScopeWhere(user, mine);
  const extra = unitWhere(units);
  const search = searchWhere(q);
  const counts = {};
  await Promise.all(
    BOARD_COLUMNS.map(async (column) => {
      counts[column] = await prisma.internalRequest.count({
        where: { AND: [base, extra, search, columnWhere(column)] },
      });
    })
  );
  return counts;
};

export const listBoardColumn = async (user, { column, cursor, limit = 20, units, q, mine = false }) => {
  if (!BOARD_COLUMNS.includes(column)) {
    const err = new Error('Geçersiz sütun.');
    err.statusCode = 400;
    throw err;
  }
  const take = Math.min(Math.max(Number(limit) || 20, 1), 40);
  const base = boardScopeWhere(user, mine);
  const extra = unitWhere(units);
  const search = searchWhere(q);
  const where = { AND: [base, extra, search, columnWhere(column)] };

  if (cursor) {
    const cursorRow = await prisma.internalRequest.findFirst({
      where: { AND: [base, { id: cursor }] },
      select: { id: true, createdAt: true },
    });
    if (cursorRow) {
      where.AND.push({
        OR: [
          { createdAt: { lt: cursorRow.createdAt } },
          { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
        ],
      });
    }
  }

  const rows = await prisma.internalRequest.findMany({
    where,
    select: boardSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(presentBoardRow),
    nextCursor: hasMore && last ? last.id : null,
    hasMore,
  };
};

export const getById = async (id, user) => {
  const row = await prisma.internalRequest.findUnique({ where: { id }, include: includeFull });
  if (!row) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(row, user);
  return { ...presentForViewer(row, user), canEdit: ownerCanMutate(row, user) };
};

export const create = async (data, user) => {
  if (!canOpenUnitRequest(user)) {
    const err = new Error('Talepleri yalnızca şirket hesapları birim portalından açabilir.');
    err.statusCode = 403;
    throw err;
  }

  const title = String(data.title || '').trim();
  const items = await normalizeItems(title, data.items);
  const shop = await resolveInternalShop(data);
  const row = await prisma.internalRequest.create({
    data: {
      title,
      description: data.description != null ? sanitizeRichHtml(data.description) : null,
      internalNote: String(data.internalNote ?? '').trim() || null,
      requesterUnit: shop.requesterUnit || null,
      shopDepartmentId: shop.shopDepartmentId,
      shopWorkerId: shop.shopWorkerId,
      neededBy: data.neededBy ?? null,
      moduleId: unitRequestModuleOf(user),
      createdById: user.id,
      items: {
        create: items.map((item, index) => ({
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit || 'Adet',
          notes: item.notes || null,
          stockCode: item.stockCode || null,
          sortOrder: index,
        })),
      },
    },
    include: includeFull,
  });
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_CREATED',
    internalRequestId: row.id,
    payload: { title: row.title },
  });
  return presentForViewer(row, user);
};

export const update = async (id, data, user) => {
  const existing = await prisma.internalRequest.findUnique({ where: { id }, include: includeFull });
  if (!existing) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(existing, user);
  assertOwnerCanMutate(existing, user);

  const title = data.title != null ? String(data.title).trim() : existing.title;
  const shop = await resolveInternalShop(data, existing);
  const items = data.items ? await normalizeItems(title, data.items) : null;
  await prisma.$transaction(async (tx) => {
    await tx.internalRequest.update({
      where: { id },
      data: {
        title,
        description:
          data.description !== undefined
            ? data.description == null
              ? null
              : sanitizeRichHtml(data.description)
            : existing.description,
        internalNote:
          data.internalNote !== undefined
            ? String(data.internalNote ?? '').trim() || null
            : existing.internalNote,
        requesterUnit: shop.requesterUnit,
        shopDepartmentId: shop.shopDepartmentId,
        shopWorkerId: shop.shopWorkerId,
        neededBy: data.neededBy !== undefined ? data.neededBy : existing.neededBy,
      },
    });
    if (items) {
      const existingItems = await tx.internalRequestItem.findMany({
        where: { requestId: id },
        select: { id: true },
      });
      const owned = new Set(existingItems.map((row) => row.id));
      const kept = [];
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const payload = {
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit || 'Adet',
          notes: item.notes || null,
          stockCode: item.stockCode || null,
          sortOrder: index,
        };
        const wantId = item.id && owned.has(item.id) ? item.id : null;
        if (wantId) {
          await tx.internalRequestItem.update({ where: { id: wantId }, data: payload });
          kept.push(wantId);
        } else {
          const created = await tx.internalRequestItem.create({
            data: { requestId: id, ...payload },
          });
          kept.push(created.id);
        }
      }
      await tx.internalRequestItem.deleteMany({
        where: { requestId: id, id: { notIn: kept } },
      });
    }
  });
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_UPDATED',
    internalRequestId: id,
    payload: { title },
  });
  return getById(id, user);
};

export const submit = async (id, user) => {
  const existing = await prisma.internalRequest.findUnique({ where: { id }, include: includeFull });
  if (!existing) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(existing, user);
  if (existing.createdById !== user.id) {
    const err = new Error('Talebi yalnızca oluşturan gönderebilir.');
    err.statusCode = 403;
    throw err;
  }
  if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
    const err = new Error('Yalnızca taslak veya reddedilmiş talepler gönderilebilir.');
    err.statusCode = 409;
    throw err;
  }
  const row = await prisma.internalRequest.update({
    where: { id },
    data:
      existing.status === 'REJECTED'
        ? {
            status: 'SUBMITTED',
            reviewNote: null,
            reviewedById: null,
            reviewedAt: null,
          }
        : { status: 'SUBMITTED' },
    include: includeFull,
  });
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_SUBMITTED',
    internalRequestId: id,
    severity: 'INFO',
    payload: { title: row.title },
  });

  const inboxLink = `${getFrontendBaseUrl()}/internal-requests/${id}`;
  const message = `${user.name} birim satın alma talebi gönderdi: "${row.title}".`;
  const managers = await notifyUnitManagers(row.moduleId, message, `/internal-requests/${id}`);
  const copyTeam = row.moduleId !== 'URETIM_PLANLAMA';
  await Promise.all(
    managers.map((m, idx) =>
      sendDepartmentRequestMail(m.email, {
        title: row.title,
        requesterName: user.name,
        requesterEmail: user.email,
        requesterUnit: row.requesterUnit,
        description: row.description,
        link: inboxLink,
        recipientName: m.name,
        teamCc: copyTeam && idx === 0,
        teamCcExclude: managers.map((x) => x.email),
      }).catch((e) => console.error('Birim talep maili gönderilemedi:', e.message))
    )
  );
  // Talep sahibine "iletildi" teyidi
  await mailRequester(row, 'SUBMITTED');

  return presentForViewer(row, user);
};

export const listAssignableStaff = async (user, moduleId) => {
  const mod = staffModuleFor(user, moduleId);
  if (!managesUnitModule(user, mod)) {
    const err = new Error('Personel listesi yalnızca birim yetkilisi içindir.');
    err.statusCode = 403;
    throw err;
  }
  return prisma.user.findMany({
    where: {
      isActive: true,
      role: 'PURCHASING',
      moduleId: mod,
      subRole: 'STAFF',
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
};

export const approve = async (id, user, note, assignedToIds) => {
  const ids = [...new Set((assignedToIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) {
    const err = new Error('Onaylarken en az bir personel seçmelisiniz.');
    err.statusCode = 400;
    throw err;
  }
  const existing = await getById(id, user);
  if (!managesUnitModule(user, existing.moduleId)) {
    const err = new Error('Bu talebi yalnızca birim yetkilisi onaylar.');
    err.statusCode = 403;
    throw err;
  }
  if (existing.status !== 'SUBMITTED') {
    const err = new Error('Yalnızca gönderilmiş talepler onaylanabilir.');
    err.statusCode = 409;
    throw err;
  }
  const staff = await prisma.user.findMany({
    where: {
      id: { in: ids },
      isActive: true,
      role: 'PURCHASING',
      moduleId: existing.moduleId || 'SATIN_ALMA',
      subRole: 'STAFF',
    },
    select: { id: true, name: true, email: true },
  });
  if (staff.length !== ids.length) {
    const err = new Error('Geçersiz personel.');
    err.statusCode = 400;
    throw err;
  }
  const row = await prisma.$transaction(async (tx) => {
    await tx.internalRequestAssignee.deleteMany({ where: { requestId: id } });
    await tx.internalRequestAssignee.createMany({
      data: ids.map((userId) => ({ requestId: id, userId })),
    });
    return tx.internalRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: note || null,
        assignedToId: ids[0],
      },
      include: includeFull,
    });
  });
  const portalPath = `/internal-requests/${id}`;
  const notifyIds = await filterNotifyUserIds(prisma, ids);
  if (notifyIds.length) {
    await prisma.notification.createMany({
      data: notifyIds.map((userId) => ({
        userId,
        message: `Size birim talebi atandı: "${row.title}"`,
        link: portalPath,
      })),
    });
  }
  const inboxLink = `${getFrontendBaseUrl().replace(/\/$/, '')}${portalPath}`;
  await Promise.all(
    staff.map((s, idx) =>
      s.email
        ? sendInternalRequestAssignedMail(s.email, {
            title: row.title,
            assignedByName: user.name,
            requesterName: row.createdBy?.name || null,
            requesterUnit: row.requesterUnit,
            reviewNote: note || null,
            link: inboxLink,
            recipientName: s.name,
            teamCc: row.moduleId !== 'URETIM_PLANLAMA' && idx === 0,
            teamCcExclude: staff.map((x) => x.email),
          }).catch((e) => console.error('Birim talep atama maili gönderilemedi:', e.message))
        : Promise.resolve()
    )
  );
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_APPROVED',
    internalRequestId: id,
    payload: {
      title: row.title,
      assignedToIds: ids,
      assigneeNames: staff.map((s) => s.name),
      note: note || null,
    },
  });
  await prisma.notification
    .create({
      data: {
        userId: row.createdById,
        kind: 'ALERT',
        message: `"${row.title}" birim talebiniz onaylandı.`,
        link: `/taleplerim/${id}`,
      },
    })
    .catch(() => {});
  await mailRequester(row, 'APPROVED', { actor: user, actorLabel: 'Onaylayan', note });
  return presentForViewer(row, user);
};

export const reject = async (id, user, note) => {
  const existing = await getById(id, user);
  if (!managesUnitModule(user, existing.moduleId)) {
    const err = new Error('Bu talebi yalnızca birim yetkilisi reddedebilir.');
    err.statusCode = 403;
    throw err;
  }
  if (!['SUBMITTED', 'APPROVED'].includes(existing.status)) {
    const err = new Error('Bu talep reddedilemez.');
    err.statusCode = 409;
    throw err;
  }
  const row = await prisma.internalRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: note || null,
    },
    include: includeFull,
  });
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_REJECTED',
    internalRequestId: id,
    severity: 'INFO',
    payload: { title: row.title, note: note || null },
  });
  const [rejectNotifyId] = await filterNotifyUserIds(prisma, [row.createdById]);
  if (rejectNotifyId) {
    await prisma.notification.create({
      data: {
        userId: rejectNotifyId,
        kind: 'ALERT',
        message: `"${row.title}" birim talebiniz ${row.moduleId === 'URETIM_PLANLAMA' ? 'üretim planlama' : 'satın alma'} tarafından reddedildi.`,
        link: `/taleplerim/${id}`,
      },
    }).catch(() => {});
  }
  await mailRequester(row, 'REJECTED', { actor: user, actorLabel: 'Reddeden', note });
  return presentForViewer(row, user);
};

/**
 * Onaylı iç fişten tedarikçi talep taslağı. Seçilen kalemler ayrı bir SATIN_ALMA talebine gider;
 * kalan kalemler aynı birim talebinde bekler.
 */
export const convertToRfq = async (id, user, body = {}) => {
  const existing = await getById(id, user);
  if (!canHandlePurchasing(existing, user)) {
    const err = new Error('Teklif talebi oluşturma yetkiniz yok.');
    err.statusCode = 403;
    throw err;
  }
  if (existing.status !== 'APPROVED') {
    const err = new Error(
      existing.status === 'CONVERTED'
        ? 'Bu talebin bütün kalemleri zaten tedarik talebine alınmış.'
        : 'Yalnızca onaylanmış iç talepler teklif talebine dönüştürülür.',
    );
    err.statusCode = 409;
    throw err;
  }

  const rfq = await prisma.$transaction(async (tx) => {
    const locked = await tx.internalRequest.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!locked) {
      const err = new Error('Talep bulunamadı.');
      err.statusCode = 404;
      throw err;
    }
    if (locked.status !== 'APPROVED') {
      const err = new Error('Yalnızca onaylanmış iç talepler teklif talebine dönüştürülür.');
      err.statusCode = 409;
      throw err;
    }

    const openItems = (locked.items || []).filter((item) => !item.procurementRequestId);
    if (!openItems.length) {
      const err = new Error('Ayrılacak kalem kalmadı.');
      err.statusCode = 409;
      throw err;
    }
    const requested = Array.isArray(body.itemIds)
      ? body.itemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)
      : [];
    const selected = requested.length
      ? openItems.filter((item) => requested.includes(item.id))
      : openItems;
    if (!selected.length) {
      const err = new Error('Seçilen kalemler bu talebe ait değil veya zaten bir tedarik talebine alınmış.');
      err.statusCode = 400;
      throw err;
    }
    if (requested.length && selected.length !== requested.length) {
      const err = new Error('Seçilen kalemlerin bir kısmı zaten tedarik talebine alınmış.');
      err.statusCode = 409;
      throw err;
    }

    const customTitle = String(body.title || '').trim().replace(/\s+/g, ' ');
    const title = (customTitle || locked.title).slice(0, 200);
    const plainDescription = String(locked.description || '')
      .replace(/\[\[img:[^\]]+\]\]/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const req = await tx.procurementRequest.create({
      data: {
        title,
        description: plainDescription || null,
        internalNote: locked.internalNote || null,
        moduleId: locked.moduleId || 'SATIN_ALMA',
        neededBy: locked.neededBy || null,
        shopDepartmentId: locked.shopDepartmentId || null,
        shopWorkerId: locked.shopWorkerId || null,
        createdById: user.id,
        assignedToId: user.id,
        status: 'DRAFT',
        internalRequestId: id,
        items: {
          create: selected.map((item, index) => ({
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            notes: item.notes,
            stockCode: item.stockCode,
            sortOrder: index,
          })),
        },
      },
    });

    const claimed = await tx.internalRequestItem.updateMany({
      where: { id: { in: selected.map((item) => item.id) }, requestId: id, procurementRequestId: null },
      data: { procurementRequestId: req.id },
    });
    if (claimed.count !== selected.length) {
      await tx.procurementRequest.delete({ where: { id: req.id } });
      const err = new Error('Kalemler aynı anda başka bir talebe alınmış. Sayfayı yenileyip tekrar seçin.');
      err.statusCode = 409;
      throw err;
    }

    const stillOpen = await tx.internalRequestItem.count({
      where: { requestId: id, procurementRequestId: null },
    });
    if (stillOpen === 0) {
      await tx.internalRequest.update({ where: { id }, data: { status: 'CONVERTED' } });
    }

    return {
      id: req.id,
      title,
      partial: stillOpen > 0,
      itemNames: selected.map((item) => item.productName),
      itemIds: selected.map((item) => item.id),
    };
  });

  await copyItemPhotosToRfq(id, rfq.id, rfq.itemIds).catch((e) =>
    console.error('Kalem fotoğrafları RFQ’ya kopyalanamadı:', e.message),
  );
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_CONVERTED',
    internalRequestId: id,
    requestId: rfq.id,
    payload: {
      title: existing.title,
      rfqTitle: rfq.title,
      itemNames: rfq.itemNames,
      partial: rfq.partial,
    },
  });
  if (existing.createdById) {
    const names = rfq.itemNames.join(', ');
    await prisma.notification
      .create({
        data: {
          userId: existing.createdById,
          kind: 'ALERT',
          message: rfq.partial
            ? `"${existing.title}" talebinizden bazı kalemler «${rfq.title}» tedarik talebine alındı: ${names}.`
            : `"${existing.title}" talebiniz tedarikçi talebi taslağına dönüştürüldü.`,
          link: `/taleplerim/${id}`,
        },
      })
      .catch(() => {});
  }
  await mailRequester(existing, rfq.partial ? 'SPLIT' : 'CONVERTED', {
    actor: user,
    actorLabel: 'İşleme alan',
    itemNames: rfq.itemNames.join(', '),
    rfqTitle: rfq.title,
  });

  const presented = await getById(id, user);
  return { ...presented, createdProcurementRequestId: rfq.id };
};

export const remove = async (id, user) => {
  const existing = await prisma.internalRequest.findUnique({ where: { id }, include: includeFull });
  if (!existing) return;
  assertCanView(existing, user);
  const isOwnerDraft = existing.status === 'DRAFT' && existing.createdById === user.id;
  const canForceDelete = user.role === 'ADMIN' || isExecutiveUser(user);
  if (!isOwnerDraft && !canForceDelete) {
    const err = new Error('Yalnızca kendi taslağınızı silebilirsiniz.');
    err.statusCode = 403;
    throw err;
  }
  await prisma.internalRequest.delete({ where: { id } });
  const actorName = user?.name || 'Bir kullanıcı';
  await recordAudit({
    actorUserId: user.id,
    action: 'INTERNAL_REQUEST_DELETED',
    internalRequestId: null,
    severity: 'ALERT',
    payload: {
      deletedId: id,
      title: existing.title,
      status: existing.status,
      hadProcurementRequestCount: (existing.procurementRequests || []).length,
    },
    notifyMessage: `${actorName}, "${existing.title}" birim talebini sildi.`,
  });
};

const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const rewriteInlineMarkers = (text, ids) =>
  String(text || '').replace(/\[\[img:(\d+)(?:\|(\d+))?\]\]/g, (_, raw, w) => {
    const id = ids[Number(raw)];
    if (!id) return '';
    return w ? `[[img:${id}|${w}]]` : `[[img:${id}]]`;
  });

const persistUploadedFiles = async (requestId, files, { kind = 'FILE', messageId = null, itemId = null } = {}) => {
  const incoming = files || [];
  if (!incoming.length) return [];
  const destDir = path.join(UPLOAD_ROOT, requestId);
  fs.mkdirSync(destDir, { recursive: true });
  const rows = [];
  for (const file of incoming) {
    const dest = path.join(destDir, path.basename(file.path));
    if (path.resolve(file.path) !== path.resolve(dest)) {
      fs.renameSync(file.path, dest);
      file.path = dest;
    }
    const row = await prisma.internalRequestAttachment.create({
      data: {
        requestId,
        messageId,
        itemId,
        kind,
        originalName: decodeStoredOriginalName(decodeMultipartOriginalName(file.originalname) || file.originalname),
        storedPath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size || 0,
      },
    });
    rows.push(row);
  }
  return rows;
};

const copyItemPhotosToRfq = async (internalId, rfqId, internalItemIds = []) => {
  const rfqItems = await prisma.requestItem.findMany({
    where: { requestId: rfqId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  const itemMap = new Map();
  internalItemIds.forEach((itemId, index) => {
    if (rfqItems[index]) itemMap.set(itemId, rfqItems[index].id);
  });
  const photos = await prisma.internalRequestAttachment.findMany({
    where: { requestId: internalId, kind: 'FILE', itemId: { not: null }, messageId: null },
  });
  if (!photos.length) return;
  const destDir = path.join(process.cwd(), 'uploads', 'procurement', rfqId);
  fs.mkdirSync(destDir, { recursive: true });
  for (const photo of photos) {
    const rfqItemId = itemMap.get(photo.itemId);
    if (!rfqItemId) continue;
    const src = path.resolve(process.cwd(), photo.storedPath);
    if (!fs.existsSync(src)) continue;
    const destName = `${Date.now()}-${path.basename(photo.storedPath)}`;
    const dest = path.join(destDir, destName);
    fs.copyFileSync(src, dest);
    await prisma.attachment.create({
      data: {
        requestId: rfqId,
        vendorId: null,
        itemId: rfqItemId,
        kind: 'GENERAL',
        filename: destName,
        originalName: photo.originalName,
        mimeType: photo.mimeType,
        size: photo.size,
        path: path.relative(process.cwd(), dest).replace(/\\/g, '/'),
      },
    });
  }
};

export const addAttachments = async (id, files, user, { itemId = null } = {}) => {
  const existing = await prisma.internalRequest.findUnique({
    where: { id },
    include: { attachments: true },
  });
  if (!existing) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(existing, user);
  assertOwnerCanMutate(existing, user);

  let resolvedItemId = null;
  if (itemId) {
    const item = await prisma.internalRequestItem.findFirst({
      where: { id: String(itemId), requestId: id },
      select: { id: true },
    });
    if (!item) {
      const err = new Error('Seçilen kalem bu talebe ait değil.');
      err.statusCode = 400;
      throw err;
    }
    resolvedItemId = item.id;
  }

  const incoming = files || [];
  const incomingBytes = incoming.reduce((sum, f) => sum + (f.size || 0), 0);
  const existingBytes = (existing.attachments || []).reduce((sum, a) => sum + (a.size || 0), 0);
  if (existingBytes + incomingBytes > MAX_TOTAL_BYTES) {
    incoming.forEach((f) => {
      try {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch {
        /* ignore */
      }
    });
    const err = new Error('Toplam dosya boyutu en fazla 50 MB olabilir.');
    err.statusCode = 400;
    throw err;
  }

  if (!incoming.length) return getById(id, user);

  await persistUploadedFiles(id, incoming, { kind: 'FILE', itemId: resolvedItemId });

  return getById(id, user);
};

export const attachInlineImages = async (id, files, user, text) => {
  if (!files?.length) return text;
  const existing = await prisma.internalRequest.findUnique({ where: { id } });
  if (!existing) return text;
  assertCanView(existing, user);
  const rows = await persistUploadedFiles(id, files, { kind: 'INLINE' });
  const next = rewriteInlineMarkers(text, rows.map((r) => r.id));
  await prisma.internalRequest.update({ where: { id }, data: { description: next } });
  return next;
};

export const getAttachmentFile = async (requestId, attachmentId, user) => {
  const row = await prisma.internalRequest.findUnique({
    where: { id: requestId },
    include: { attachments: true },
  });
  if (!row) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(row, user);
  const att = row.attachments.find((a) => a.id === attachmentId);
  if (!att) {
    const err = new Error('Dosya bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  const abs = path.resolve(process.cwd(), att.storedPath);
  const allowedRoot = path.resolve(UPLOAD_ROOT, requestId);
  if (!abs.startsWith(allowedRoot) && !abs.startsWith(path.resolve(UPLOAD_ROOT))) {
    const err = new Error('Geçersiz dosya yolu.');
    err.statusCode = 400;
    throw err;
  }
  if (!fs.existsSync(abs)) {
    const err = new Error('Dosya diskte bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  return {
    abs,
    originalName: decodeStoredOriginalName(att.originalName) || att.originalName,
    mimeType: att.mimeType,
  };
};

export const removeAttachment = async (requestId, attachmentId, user) => {
  const existing = await prisma.internalRequest.findUnique({
    where: { id: requestId },
    include: { attachments: true },
  });
  if (!existing) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(existing, user);
  assertOwnerCanMutate(existing, user);
  const att = existing.attachments.find((a) => a.id === attachmentId);
  if (!att) return getById(requestId, user);
  try {
    const abs = path.resolve(process.cwd(), att.storedPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
  await prisma.internalRequestAttachment.delete({ where: { id: attachmentId } });
  return getById(requestId, user);
};

const THREAD_ACTIONS = [
  'INTERNAL_REQUEST_CREATED',
  'INTERNAL_REQUEST_UPDATED',
  'INTERNAL_REQUEST_SUBMITTED',
  'INTERNAL_REQUEST_APPROVED',
  'INTERNAL_REQUEST_REJECTED',
  'INTERNAL_REQUEST_CONVERTED',
];

const presentThreadEvent = (row) => {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    id: row.id,
    action: row.action,
    createdAt: row.createdAt,
    actorId: row.actorUserId || null,
    actorName: row.actorUser?.name || null,
    payload: {
      assignedToIds: Array.isArray(payload.assignedToIds) ? payload.assignedToIds : [],
      assigneeNames: Array.isArray(payload.assigneeNames) ? payload.assigneeNames : [],
      note: payload.note || null,
      itemNames: Array.isArray(payload.itemNames) ? payload.itemNames : [],
      rfqTitle: payload.rfqTitle || null,
    },
  };
};

const presentMessage = (row) => ({
  id: row.id,
  body: row.body,
  createdAt: row.createdAt,
  authorId: row.authorId,
  authorName: row.author?.name || 'Kullanıcı',
  authorRole: row.author?.role || null,
  files: (row.attachments || [])
    .filter((a) => (a.kind || 'FILE') === 'FILE')
    .map((a) => ({
      id: a.id,
      originalName: decodeStoredOriginalName(a.originalName) || a.originalName,
      size: a.size,
      mimeType: a.mimeType,
    })),
  seenBy: (row.reads || [])
    .filter((r) => r.user && !isSilentChatViewer(r.user) && r.userId !== row.authorId)
    .map((r) => ({
      id: r.user.id,
      name: r.user.name,
      readAt: r.readAt,
    })),
});

const chatLinkForUser = (user, requestId) =>
  user.role === 'DEPARTMENT' ? `/taleplerim/${requestId}` : `/internal-requests/${requestId}`;

const CHAT_MAIL_COOLDOWN_MS = 3 * 60 * 1000;
const lastChatMailAt = new Map();

const uniqueUsers = (users) => {
  const map = new Map();
  for (const u of users) {
    if (!u?.id) continue;
    const prev = map.get(u.id);
    if (!prev) {
      map.set(u.id, u);
      continue;
    }
    // Sonraki kayıtta eksik alanlar (ör. author select’te email yok) öncekini ezmesin
    map.set(u.id, {
      ...prev,
      ...u,
      email: u.email || prev.email || null,
      name: u.name || prev.name,
    });
  }
  return [...map.values()];
};

const chatParticipantSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isExecutive: true,
  isActive: true,
};

const findChatRecipients = async (request, author) => {
  const extras = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: 'ADMIN' },
        { isExecutive: true },
        {
          role: 'PURCHASING',
          moduleId: request.moduleId === 'URETIM_PLANLAMA' ? 'URETIM_PLANLAMA' : 'SATIN_ALMA',
          subRole: 'MANAGER',
        },
      ],
    },
    select: chatParticipantSelect,
  });
  return uniqueUsers([
    request.createdBy,
    ...(request.assignees || []).map((a) => a.user || a),
    request.assignedTo,
    ...extras,
  ]).filter((u) => u.isActive !== false && u.id !== author.id);
};

const notifyChatCounterpart = async (request, author) => {
  const found = await findChatRecipients(request, author);
  const chatIds = new Set(await filterNotifyUserIds(prisma, found.map((user) => user.id)));
  const recipients = found.filter((user) => chatIds.has(user.id));
  const origin = getFrontendBaseUrl().replace(/\/$/, '');
  await Promise.all(
    recipients.map(async (recipient) => {
      const path = chatLinkForUser(recipient, request.id);
      const unread = await prisma.notification.findFirst({
        where: { userId: recipient.id, link: path, isRead: false, kind: 'MESSAGE' },
        select: { id: true },
      });
      if (!unread) {
        await prisma.notification.create({
          data: {
            userId: recipient.id,
            kind: 'MESSAGE',
            message: `"${request.title}" için yeni mesaj`,
            link: path,
          },
        });
      }

      if (isSilentChatViewer(recipient) || !recipient.email) return;
      const mailKey = `${recipient.id}:${request.id}`;
      const last = lastChatMailAt.get(mailKey) || 0;
      if (Date.now() - last < CHAT_MAIL_COOLDOWN_MS) return;
      lastChatMailAt.set(mailKey, Date.now());
      try {
        await sendNewChatMail(recipient.email, {
          title: request.title,
          link: `${origin}${path}`,
          recipientName: recipient.name,
        });
      } catch (e) {
        console.error('Chat mail gönderilemedi:', e.message);
      }
    })
  );
};

const messageInclude = {
  author: { select: { id: true, name: true, email: true, role: true } },
  attachments: true,
  reads: {
    include: {
      user: { select: { id: true, name: true, role: true, isExecutive: true } },
    },
  },
};

const markVisibleReads = async (items, user) => {
  if (isSilentChatViewer(user) || !items.length) return;
  const ids = items.filter((m) => m.authorId !== user.id).map((m) => m.id);
  if (!ids.length) return;
  const existing = await prisma.internalRequestMessageRead.findMany({
    where: { userId: user.id, messageId: { in: ids } },
    select: { messageId: true },
  });
  const have = new Set(existing.map((e) => e.messageId));
  const missing = ids.filter((messageId) => !have.has(messageId));
  if (!missing.length) return;
  await prisma.internalRequestMessageRead.createMany({
    data: missing.map((messageId) => ({ messageId, userId: user.id })),
    skipDuplicates: true,
  });
};

const assertChatOpen = (row) => {
  if (['APPROVED', 'CONVERTED'].includes(row.status)) return;
  const err = new Error('Yazışma talep onaylandıktan sonra açılır.');
  err.statusCode = 409;
  throw err;
};

const participantLabel = (u, createdById) => {
  if (u.id === createdById || u.role === 'DEPARTMENT') return 'Talep eden';
  if (u.role === 'ADMIN' || u.isExecutive) return 'Yönetim';
  return 'Satın alma';
};

const presentParticipant = (u, createdById, requesterUnit) => ({
  id: u.id,
  name: u.name || 'Kullanıcı',
  email: u.email || null,
  roleLabel: participantLabel(u, createdById),
  unit: u.id === createdById ? requesterUnit || null : null,
});

export const listMessages = async (id, user) => {
  const row = await prisma.internalRequest.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      createdById: true,
      assignedToId: true,
      requesterUnit: true,
      createdBy: { select: chatParticipantSelect },
      assignedTo: { select: chatParticipantSelect },
      assignees: { include: { user: { select: chatParticipantSelect } } },
    },
  });
  if (!row) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(row, user);
  assertChatOpen(row);

  const link = chatLinkForUser(user, id);
  await prisma.notification.updateMany({
    where: { userId: user.id, link, isRead: false, kind: 'MESSAGE' },
    data: { isRead: true },
  });

  const items = await prisma.internalRequestMessage.findMany({
    where: { requestId: id },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  await markVisibleReads(items, user);

  const events = await prisma.auditEvent.findMany({
    where: {
      internalRequestId: id,
      action: { in: THREAD_ACTIONS },
    },
    include: { actorUser: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  const authorIds = new Set(items.map((m) => m.authorId));
  const participants = uniqueUsers([
    row.createdBy,
    ...flattenAssignees(row),
    row.assignedTo,
    ...items.map((m) => m.author),
  ]).filter((u) => u && (!isSilentChatViewer(u) || authorIds.has(u.id)));

  const participantIds = participants.map((u) => u.id).filter(Boolean);
  const emailRows =
    participantIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
  const byId = new Map(emailRows.map((r) => [r.id, r]));

  return {
    title: row.title,
    participants: participants.map((u) => {
      const fresh = byId.get(u.id);
      return presentParticipant(
        {
          ...u,
          email: fresh?.email || u.email || null,
          name: fresh?.name || u.name,
        },
        row.createdById,
        row.requesterUnit,
      );
    }),
    items: items.map(presentMessage),
    events: events.map(presentThreadEvent),
  };
};

export const postMessage = async (id, user, body, { files = [], inlineImages = [] } = {}) => {
  const row = await prisma.internalRequest.findUnique({
    where: { id },
    include: {
      createdBy: { select: chatParticipantSelect },
      assignedTo: { select: chatParticipantSelect },
      assignees: { include: { user: { select: chatParticipantSelect } } },
    },
  });
  if (!row) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertCanView(row, user);
  assertChatOpen(row);

  const text = String(body || '').trim();
  if (!text && !files.length && !inlineImages.length) {
    const err = new Error('Mesaj boş olamaz.');
    err.statusCode = 400;
    throw err;
  }

  const msg = await prisma.internalRequestMessage.create({
    data: { requestId: id, authorId: user.id, body: text || ' ' },
  });

  if (files.length) {
    await persistUploadedFiles(id, files, { kind: 'FILE', messageId: msg.id });
  }
  let nextBody = text;
  if (inlineImages.length) {
    const inlines = await persistUploadedFiles(id, inlineImages, { kind: 'INLINE', messageId: msg.id });
    nextBody = rewriteInlineMarkers(text, inlines.map((r) => r.id));
  }
  const saved = await prisma.internalRequestMessage.update({
    where: { id: msg.id },
    data: { body: nextBody || ' ' },
    include: messageInclude,
  });

  notifyChatCounterpart(row, user).catch((e) => console.error('Chat bildirimi:', e.message));
  return presentMessage(saved);
};
