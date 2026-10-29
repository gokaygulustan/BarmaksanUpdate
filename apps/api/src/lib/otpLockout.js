/** In-memory OTP fail / lockout (tek süreç; Redis yok). */
const fails = new Map();

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

const keyOf = (email) => String(email || '').trim().toLowerCase();

export const assertOtpNotLocked = (email) => {
  const k = keyOf(email);
  const row = fails.get(k);
  if (!row?.lockedUntil) return;
  if (Date.now() < row.lockedUntil) {
    const waitSec = Math.ceil((row.lockedUntil - Date.now()) / 1000);
    const err = new Error(`Çok fazla hatalı deneme. ${waitSec} sn sonra tekrar deneyin.`);
    err.statusCode = 429;
    throw err;
  }
  fails.delete(k);
};

export const recordOtpFailure = (email) => {
  const k = keyOf(email);
  const row = fails.get(k) || { count: 0, lockedUntil: 0 };
  row.count += 1;
  if (row.count >= MAX_FAILS) {
    row.lockedUntil = Date.now() + LOCK_MS;
    row.count = 0;
  }
  fails.set(k, row);
  return row;
};

export const clearOtpFailures = (email) => {
  fails.delete(keyOf(email));
};
