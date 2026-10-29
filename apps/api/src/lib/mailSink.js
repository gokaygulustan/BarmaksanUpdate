/** MAIL_SINK=outbox yalnızca test içindir. Üretimde bu değişken yoktur; o zaman burası devreye girmez. */
export const mailSinkActive = () => process.env.MAIL_SINK === 'outbox';

/** İzole test kutuları. Şirket adresleri bu sonekle bitmez. */
export const isIsolatedMailbox = (email) =>
  String(email || '').trim().toLowerCase().endsWith('@invalid.test');

/** Sink kapalıyken liste aynen döner. Sink açıkken yalnız @invalid.test kullanıcıları kalır. */
export const filterNotifyUserIds = async (db, userIds) => {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!mailSinkActive() || !ids.length) return ids;
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });
  const allowed = new Set(users.filter((user) => isIsolatedMailbox(user.email)).map((user) => user.id));
  return ids.filter((id) => allowed.has(id));
};
