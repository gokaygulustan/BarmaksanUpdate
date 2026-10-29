import { prisma } from '../../lib/prisma.js';
import { forbid } from '../../lib/procurementViewer.js';
import { MODULE, moduleLabel } from '../../lib/modules.js';
import { isHandedToSatinAlma } from '../../lib/purchasingResponsibility.js';
import { assessPriorExecutiveApproval } from '../../lib/decisionBasis.js';
import { notifyUsers, sendWorkflowMail } from './procurement.service.js';
import { mailSubject, mailStrong } from '../mail/mail-layout.js';

export const HANDOVER_DIRECTION = {
  TAKEOVER: 'TAKEOVER',
  HANDOFF: 'HANDOFF',
};

export const HANDOVER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
};

const CLOSED_REQUEST = new Set(['COMPLETED', 'CANCELLED', 'REJECTED']);
const userSelect = { id: true, name: true, email: true, role: true, moduleId: true, subRole: true, isActive: true };

const fail = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

const sourceDeciders = (moduleId) =>
  prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['PURCHASING', 'ADMIN'] },
      moduleId,
      ...(moduleId === MODULE.YEDEK_PARCA
        ? { subRole: { in: ['MANAGER', 'STAFF'] } }
        : { subRole: 'MANAGER' }),
    },
    select: userSelect,
  });

const satinAlmaManagers = () =>
  prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['PURCHASING', 'ADMIN'] },
      moduleId: MODULE.SATIN_ALMA,
      subRole: 'MANAGER',
    },
    select: userSelect,
  });

const uniqueUsers = (rows) => [...new Map((rows || []).filter((row) => row?.id).map((row) => [row.id, row])).values()];

export const canInitiateTakeover = (actor) =>
  actor?.role === 'ADMIN' ||
  (actor?.role === 'PURCHASING' && (actor.moduleId || '') === MODULE.SATIN_ALMA);

export const canInitiateHandoff = (actor, moduleId) => {
  if (!actor) return false;
  if (actor.role === 'ADMIN') return true;
  if (actor.role !== 'PURCHASING' || (actor.moduleId || '') !== (moduleId || '')) return false;
  if (moduleId === MODULE.URETIM) return actor.subRole === 'MANAGER';
  if (moduleId === MODULE.YEDEK_PARCA) return true;
  return false;
};

export const canDecideHandover = (actor, handover, request) => {
  if (!actor || !handover || !request) return false;
  if (actor.role === 'ADMIN') return true;
  if (handover.direction === HANDOVER_DIRECTION.TAKEOVER) {
    return canInitiateHandoff(actor, request.moduleId);
  }
  if (handover.direction === HANDOVER_DIRECTION.HANDOFF) {
    return actor.role === 'PURCHASING' && actor.moduleId === MODULE.SATIN_ALMA && actor.subRole === 'MANAGER';
  }
  return false;
};

const assertTransferableRequest = (request) => {
  if (!request) fail('Talep bulunamadı.', 404);
  if (![MODULE.URETIM, MODULE.YEDEK_PARCA].includes(request.moduleId)) {
    fail('Devir yalnızca Üretim Planlama ve Yedek Parça taleplerinde, Satın Alma ile yapılır.', 409);
  }
  if (isHandedToSatinAlma(request)) {
    fail('Bu talebin satın alma sorumluluğu zaten Satın Alma departmanındadır.', 409);
  }
  if (CLOSED_REQUEST.has(request.status)) {
    fail('Kapanmış veya iptal edilmiş talep devredilemez.', 409);
  }
};

export { assessPriorExecutiveApproval };

const loadRequest = (requestId) =>
  prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      items: { include: { quotes: true, vendorPick: true } },
      approvalHistories: true,
    },
  });

export const buildHandoverNotice = async (event, request, handover) => {
  const initiator = handover.initiatedById
    ? await prisma.user.findUnique({ where: { id: handover.initiatedById }, select: userSelect })
    : null;
  let recipients = [];
  let subject = '';
  let heading = '';
  let intro = '';
  let portalMessage = '';
  const sourceName = moduleLabel(request.moduleId);
  const who = initiator?.name || sourceName;
  const decider = handover.decidedById
    ? await prisma.user.findUnique({ where: { id: handover.decidedById }, select: { name: true } })
    : null;
  const deciderName = decider?.name || 'Yetkili';
  if (event === 'CREATED' && handover.direction === HANDOVER_DIRECTION.TAKEOVER) {
    recipients = await sourceDeciders(request.moduleId);
    subject = mailSubject('Satın alma devralma isteği', request.title);
    heading = 'Satın alma devralma isteği';
    intro = `<p style="margin:0;">${mailStrong(who)}, ${mailStrong(request.title)} talebini devralmak istiyor.</p>`;
    portalMessage = `"${request.title}" için ${who} satın almayı devralmak istiyor.`;
  } else if (event === 'CREATED' && handover.direction === HANDOVER_DIRECTION.HANDOFF) {
    recipients = await satinAlmaManagers();
    subject = mailSubject('Satın alma devretme isteği', request.title);
    heading = 'Satın alma devretme isteği';
    intro = `<p style="margin:0;">${mailStrong(who)}, ${mailStrong(request.title)} talebini Satın Alma departmanına devretmek istiyor.</p>`;
    portalMessage = `"${request.title}" için ${who} satın almayı devretmek istiyor.`;
  } else if (event === 'REJECTED') {
    recipients = initiator ? [initiator] : [];
    subject = mailSubject('Devir isteği reddedildi', request.title);
    heading = 'Devir isteği reddedildi';
    intro = `<p style="margin:0;">${mailStrong(deciderName)}, ${mailStrong(request.title)} talebindeki devir isteğini reddetti.</p>`;
    portalMessage = `"${request.title}" devir isteğini ${deciderName} reddetti.`;
  } else if (event === 'ACCEPTED') {
    const [managers, source] = await Promise.all([satinAlmaManagers(), sourceDeciders(request.moduleId)]);
    recipients = uniqueUsers([initiator, ...managers, ...source]);
    subject = mailSubject('Devir kabul edildi', request.title);
    heading = 'Devir kabul edildi';
    intro = `<p style="margin:0;">${mailStrong(deciderName)}, ${mailStrong(request.title)} talebinin satın almasını kabul etti.</p>`;
    portalMessage = `"${request.title}" devrini ${deciderName} kabul etti.`;
  }
  return {
    recipients: uniqueUsers(recipients),
    subject,
    heading,
    intro,
    portalMessage,
    link: `/procurement/${request.id}`,
    badge: 'Satın alma devri',
  };
};

const deliverNotice = async (notice, { dispatchNotices }) => {
  if (!dispatchNotices || !notice?.recipients?.length) return notice;
  await notifyUsers(notice.recipients, notice.portalMessage, notice.link);
  await sendWorkflowMail({
    to: notice.recipients.map((user) => user.email).filter(Boolean),
    subject: notice.subject,
    badge: notice.badge,
    heading: notice.heading,
    intro: notice.intro,
    facts: [],
    actionPath: notice.link,
    actionLabel: 'Talebi aç',
    tone: 'neutral',
    teamCc: false,
  });
  return notice;
};

const clip = (value) => {
  const text = value == null ? '' : String(value).trim();
  return text ? text.slice(0, 2000) : null;
};

export const createHandover = async (requestId, actor, { direction, note = null, dispatchNotices = true } = {}) => {
  if (![HANDOVER_DIRECTION.TAKEOVER, HANDOVER_DIRECTION.HANDOFF].includes(direction)) {
    fail('Devir yönü anlaşılamadı.', 400);
  }
  const request = await loadRequest(requestId);
  if ((actor?.moduleId || '') === MODULE.URETIM && request.moduleId === MODULE.YEDEK_PARCA) {
    throw forbid('Üretim Planlama ile Yedek Parça arasında devir yapılamaz.', 403);
  }
  if ((actor?.moduleId || '') === MODULE.YEDEK_PARCA && request.moduleId === MODULE.URETIM) {
    throw forbid('Üretim Planlama ile Yedek Parça arasında devir yapılamaz.', 403);
  }
  assertTransferableRequest(request);
  if (direction === HANDOVER_DIRECTION.TAKEOVER && !canInitiateTakeover(actor)) {
    throw forbid('Devralma isteğini Satın Alma başlatabilir.', 403);
  }
  if (direction === HANDOVER_DIRECTION.HANDOFF && !canInitiateHandoff(actor, request.moduleId)) {
    throw forbid('Bu talebi devretme yetkiniz yok.', 403);
  }

  const pending = await prisma.procurementHandover.findFirst({
    where: { requestId, status: HANDOVER_STATUS.PENDING },
    select: { id: true },
  });
  if (pending) fail('Bu talepte zaten bekleyen bir devir isteği var.', 409);

  let handover;
  try {
    handover = await prisma.procurementHandover.create({
      data: {
        requestId,
        initiatedById: actor.id,
        direction,
        fromModuleId: request.moduleId,
        toModuleId: MODULE.SATIN_ALMA,
        status: HANDOVER_STATUS.PENDING,
        note: clip(note),
      },
    });
  } catch (err) {
    if (err?.code === 'P2002') fail('Bu talepte zaten bekleyen bir devir isteği var.', 409);
    throw err;
  }

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      action: 'HANDOVER_REQUESTED',
      note: `${actor.name} satın almayı ${direction === HANDOVER_DIRECTION.TAKEOVER ? 'devralmak' : 'devretmek'} için istek gönderdi.${clip(note) ? ` Not: ${clip(note)}` : ''}`,
    },
  });

  const notice = await deliverNotice(
    await buildHandoverNotice('CREATED', request, handover),
    { dispatchNotices },
  );
  return { ...handover, notice };
};

export const decideHandover = async (
  requestId,
  handoverId,
  actor,
  { accept, note = null, dispatchNotices = true } = {},
) => {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM procurement_requests WHERE id = ${requestId} FOR UPDATE`;
    const locked = await tx.$queryRaw`
      SELECT id, status, direction
      FROM procurement_handovers
      WHERE id = ${handoverId} AND "requestId" = ${requestId}
      FOR UPDATE
    `;
    const row = locked?.[0];
    if (!row) fail('Devir isteği bulunamadı.', 404);
    if (row.status !== HANDOVER_STATUS.PENDING) {
      fail('Bu devir isteği zaten sonuçlanmış.', 409);
    }

    const request = await tx.procurementRequest.findUnique({
      where: { id: requestId },
      include: {
        items: { include: { quotes: true, vendorPick: true, marketQuotes: true } },
        assignments: true,
        marketSources: { include: { quotes: true } },
        approvalHistories: true,
        vendorActivityLogs: true,
      },
    });
    const handover = await tx.procurementHandover.findUnique({ where: { id: handoverId } });
    if (!canDecideHandover(actor, handover, request)) {
      throw forbid('Bu devir isteğini sonuçlandırma yetkiniz yok.', 403);
    }

    if (accept) {
      if (request.status === 'PENDING_ADMIN_APPROVAL') {
        fail('Üst yönetim kararı bekleniyor. Devir isteği duruyor.', 409);
      }
      const invite = await tx.procurementDecisionInvite.findFirst({
        where: { requestId, expiresAt: { gt: new Date() }, resolvedAt: null },
        select: { id: true },
      });
      if (invite) {
        fail('Karar daveti açık. Devir isteği duruyor.', 409);
      }

      const assessment = assessPriorExecutiveApproval(request);
      const requestPatch = { purchasingResponsibleModuleId: MODULE.SATIN_ALMA };
      if (assessment.valid && !CLOSED_REQUEST.has(request.status)) {
        requestPatch.status = 'APPROVED_FOR_PURCHASE';
      }
      const updated = await tx.procurementHandover.updateMany({
        where: { id: handoverId, status: HANDOVER_STATUS.PENDING },
        data: {
          status: HANDOVER_STATUS.ACCEPTED,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: clip(note),
        },
      });
      if (updated.count !== 1) fail('Bu devir isteği zaten sonuçlanmış.', 409);
      await tx.procurementRequest.update({ where: { id: requestId }, data: requestPatch });
      await tx.procurementApprovalHistory.create({
        data: {
          requestId,
          actorUserId: actor.id,
          action: 'HANDOVER_ACCEPTED',
          note: `${actor.name} devir isteğini kabul etti.${clip(note) ? ` Not: ${clip(note)}` : ''}`,
        },
      });
      return { accept: true, assessment, status: requestPatch.status || request.status };
    }

    const updated = await tx.procurementHandover.updateMany({
      where: { id: handoverId, status: HANDOVER_STATUS.PENDING },
      data: {
        status: HANDOVER_STATUS.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: clip(note),
      },
    });
    if (updated.count !== 1) fail('Bu devir isteği zaten sonuçlanmış.', 409);
    await tx.procurementApprovalHistory.create({
      data: {
        requestId,
        actorUserId: actor.id,
        action: 'HANDOVER_REJECTED',
        note: `${actor.name} devir isteğini reddetti.${clip(note) ? ` Gerekçe: ${clip(note)}` : ''}`,
      },
    });
    return { accept: false, assessment: null, status: request.status };
  });

  const request = await loadRequest(requestId);
  const handover = await prisma.procurementHandover.findUnique({ where: { id: handoverId } });
  const notice = await deliverNotice(
    await buildHandoverNotice(outcome.accept ? 'ACCEPTED' : 'REJECTED', request, handover),
    { dispatchNotices },
  );
  return { ...handover, assessment: outcome.assessment, requestStatus: outcome.status, notice };
};
