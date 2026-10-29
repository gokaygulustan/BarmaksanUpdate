import { prisma } from '../../lib/prisma.js';

/**
 * Yerinde düzenlenmiş bütün yazılar: { varsayılanYazı: yeniYazı }.
 */
export const getAll = async () => {
  const rows = await prisma.siteText.findMany({ select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};

/**
 * Yazıyı kaydeder; boş ya da varsayılanla aynıysa kayıt silinir (varsayılana dönülür). Her değişiklik geçmişe yazılır.
 */
export const save = async (key, value, author) => {
  const next = value && value.trim() && value.trim() !== key ? value.trim() : null;
  await prisma.$transaction([
    next
      ? prisma.siteText.upsert({
          where: { key },
          create: { key, value: next, updatedBy: author },
          update: { value: next, updatedBy: author },
        })
      : prisma.siteText.deleteMany({ where: { key } }),
    prisma.siteTextHistory.create({ data: { key, value: next, author } }),
  ]);
  return { key, value: next };
};

export const history = (key) =>
  prisma.siteTextHistory.findMany({
    where: { key },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { value: true, author: true, createdAt: true },
  });
