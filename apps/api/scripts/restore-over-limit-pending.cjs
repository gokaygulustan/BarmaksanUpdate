const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

(async () => {
  const recent = await p.procurementApprovalHistory.findMany({
    where: { action: 'ADMIN_APPROVE' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      requestId: true,
      createdAt: true,
      note: true,
      request: { select: { id: true, title: true, status: true } },
    },
  });

  console.log('Recent ADMIN_APPROVE:');
  for (const row of recent) {
    console.log(
      `- ${row.createdAt.toISOString()} ${row.request?.status} ${row.requestId} "${row.request?.title}"`,
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toRestore = recent.filter(
    (r) =>
      r.createdAt >= since &&
      r.request?.status === 'APPROVED_FOR_PURCHASE' &&
      String(r.note || '').includes('e-posta bağlantısı'),
  );

  const seen = new Set();
  const unique = [];
  for (const r of toRestore) {
    if (seen.has(r.requestId)) continue;
    seen.add(r.requestId);
    unique.push(r);
  }

  console.log(`\nRestoring ${unique.length} request(s) to PENDING_ADMIN_APPROVAL…`);

  for (const r of unique) {
    await p.procurementRequest.update({
      where: { id: r.requestId },
      data: { status: 'PENDING_ADMIN_APPROVAL' },
    });
    await p.procurementApprovalHistory.delete({ where: { id: r.id } });
    console.log(`Restored: ${r.requestId} "${r.request?.title}"`);
  }

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
