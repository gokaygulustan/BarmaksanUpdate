import crypto from 'crypto';
import { prisma } from './prisma.js';

/** SMS’te okunabilir, karışmayan karakterler (0/O, 1/l yok). */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

export const generateShortCode = (length = 8) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
};

/** Çakışmada yeniden dener; atamaya kısa kod yazar. */
export const ensureQuoteShortCode = async (assignment) => {
  if (!assignment?.id) return null;
  if (assignment.quoteShortCode) return assignment.quoteShortCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateShortCode();
    try {
      const updated = await prisma.requestVendorAssignment.update({
        where: { id: assignment.id },
        data: { quoteShortCode: code },
        select: { quoteShortCode: true },
      });
      return updated.quoteShortCode;
    } catch (err) {
      if (err?.code === 'P2002') continue;
      throw err;
    }
  }

  const err = new Error('Kısa teklif kodu üretilemedi.');
  err.statusCode = 500;
  throw err;
};

export const ensureQuoteShortCodeByToken = async (quoteToken) => {
  if (!quoteToken) return null;
  const row = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken },
    select: { id: true, quoteShortCode: true },
  });
  if (!row) return null;
  return ensureQuoteShortCode(row);
};

export const resolveQuoteTokenByShortCode = async (code) => {
  const normalized = String(code || '').trim();
  if (!normalized || normalized.length < 6 || normalized.length > 16) return null;
  const row = await prisma.requestVendorAssignment.findUnique({
    where: { quoteShortCode: normalized },
    select: {
      quoteToken: true,
      tokenExpires: true,
    },
  });
  if (!row?.quoteToken) return null;
  if (row.tokenExpires && new Date(row.tokenExpires) < new Date()) {
    const err = new Error('Teklif bağlantısının süresi dolmuş.');
    err.statusCode = 410;
    throw err;
  }
  return row.quoteToken;
};
