import { prisma } from '../../lib/prisma.js';

/**
 * Tüm birimleri döndürür (sistem + kullanıcı tanımlı).
 */
export const getAll = async () => {
  return prisma.unit.findMany({ orderBy: { name: 'asc' } });
};

/**
 * Yeni birim oluşturur. Eğer case-insensitive aynı isimde birim varsa hata fırlatır.
 */
export const create = async (name) => {
  const trimmed = name.trim();
  if (!trimmed) {
    const err = new Error('Birim adı boş olamaz.');
    err.statusCode = 400;
    throw err;
  }

  // Case-insensitive kontrol
  const existing = await prisma.unit.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  });
  if (existing) {
    return existing; // Zaten var, mevcut olanı döndür
  }

  return prisma.unit.create({ data: { name: trimmed, isSystem: false } });
};

/**
 * Birim sil (sadece isSystem === false olanlar silinebilir).
 */
export const remove = async (id) => {
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) {
    const err = new Error('Birim bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (unit.isSystem) {
    const err = new Error('Sistem birimi silinemez.');
    err.statusCode = 403;
    throw err;
  }
  await prisma.unit.delete({ where: { id } });
};

function formatNewUnitName(name) {
  const t = String(name || '').trim();
  if (!t) return 'Adet';
  const lower = t.toLocaleLowerCase('tr-TR');
  return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
}

/**
 * Akıllı birim eşleşme:
 *   1. Gelen adı trim et
 *   2. Case-insensitive tam eşleşme ara → bulursa kayıtlı adı döndür (adet → Adet)
 *   3. Bulamazsa ilk harfi büyük yeni birim oluştur (sargı → Sargı)
 */
export const resolve = async (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { name: 'Adet', isNew: false };

  const existing = await prisma.unit.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
  });
  if (existing) {
    return { ...existing, isNew: false };
  }

  const created = await prisma.unit.create({
    data: { name: formatNewUnitName(trimmed), isSystem: false },
  });
  return { ...created, isNew: true };
};

/**
 * Birden fazla birim adını toplu resolve eder.
 * Aynı anda birçok satır import edildiğinde (Excel) kullanılır.
 */
export const resolveMany = async (names) => {
  if (!Array.isArray(names) || names.length === 0) return [];

  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const results = [];

  for (const name of uniqueNames) {
    const resolved = await resolve(name);
    results.push(resolved);
  }

  return results;
};
