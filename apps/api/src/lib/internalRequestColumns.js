export const BOARD_COLUMNS = ['draft', 'review', 'decision', 'sourcing', 'price', 'exec', 'close'];

const sourcingStatuses = ['DRAFT', 'SENT_TO_VENDOR', 'VENDOR_QUOTED'];
const priceStatuses = ['PENDING_MANAGER_APPROVAL', 'RETURNED_TO_MANAGER'];
const closeStatuses = [
  'APPROVED_FOR_PURCHASE',
  'VENDOR_APPROVED',
  'IN_PRODUCTION',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'HAS_ISSUES',
];

/** Birden çok tedarik talebi varsa pano, en geride kalanın sütununda durur. */
export const slowestProcurementStatus = (statuses) => {
  const list = (statuses || []).filter(Boolean);
  if (!list.length) return null;
  const groups = [sourcingStatuses, priceStatuses, ['PENDING_ADMIN_APPROVAL'], closeStatuses];
  for (const group of groups) {
    const hit = list.find((status) => group.includes(status));
    if (hit) return hit;
  }
  return list[0];
};

const inSourcing = { procurementRequests: { some: { status: { in: sourcingStatuses } } } };
const inPrice = { procurementRequests: { some: { status: { in: priceStatuses } } } };
const inExec = { procurementRequests: { some: { status: 'PENDING_ADMIN_APPROVAL' } } };
const noSourcing = { procurementRequests: { none: { status: { in: sourcingStatuses } } } };
const noPrice = { procurementRequests: { none: { status: { in: priceStatuses } } } };
const noExec = { procurementRequests: { none: { status: 'PENDING_ADMIN_APPROVAL' } } };

export const columnWhere = (column) => {
  switch (column) {
    case 'draft':
      return { status: 'DRAFT' };
    case 'review':
      return { status: 'SUBMITTED' };
    case 'decision':
      return { status: { in: ['APPROVED', 'REJECTED'] } };
    case 'sourcing':
      return {
        status: 'CONVERTED',
        OR: [{ procurementRequests: { none: {} } }, inSourcing],
      };
    case 'price':
      return { status: 'CONVERTED', AND: [noSourcing, inPrice] };
    case 'exec':
      return { status: 'CONVERTED', AND: [noSourcing, noPrice, inExec] };
    case 'close':
      return {
        status: 'CONVERTED',
        AND: [{ procurementRequests: { some: {} } }, noSourcing, noPrice, noExec],
      };
    default:
      return { id: '__none__' };
  }
};
