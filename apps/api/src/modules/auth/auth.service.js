import { assertOtpNotLocked, recordOtpFailure, clearOtpFailures } from '../../lib/otpLockout.js';
import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getFrontendBaseUrl, PRODUCTION_PORTAL_URL, LEGACY_PORTAL_HOSTS } from '../../config/frontendUrl.js';

/** Bu sunucu canlı portal mı? (ön yüz adresi canlı alan adlarından biriyse) */
const isProductionPortal = () => {
  try {
    const host = new URL(getFrontendBaseUrl()).hostname;
    return host === new URL(PRODUCTION_PORTAL_URL).hostname || LEGACY_PORTAL_HOSTS.includes(host);
  } catch {
    return false;
  }
};

/**
 * Generate a signed JWT token for a user.
 */
const getExpiresIn = () => process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (user, { portal = 'staff' } = {}) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      moduleId: user.moduleId || (user.role === 'DEPARTMENT' ? 'BIRIM' : 'URETIM_PLANLAMA'),
      subRole: user.subRole || 'STAFF',
      isExecutive: Boolean(user.isExecutive),
      /** birim = Taleplerim B2B kapısı; staff = yönetici / satın alma paneli */
      portal: portal === 'birim' ? 'birim' : 'staff',
    },
    process.env.JWT_SECRET,
    { expiresIn: getExpiresIn() }
  );
};

const toAuthPayload = (user, { portal = 'staff' } = {}) => ({
  token: generateToken(user, { portal }),
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    moduleId: user.moduleId || (user.role === 'DEPARTMENT' ? 'BIRIM' : 'URETIM_PLANLAMA'),
    subRole: user.subRole || 'STAFF',
    isExecutive: Boolean(user.isExecutive),
    portal: portal === 'birim' ? 'birim' : 'staff',
    vendor: user.vendor || undefined,
  },
});

/** Süresi dolmuş (veya dolmak üzere) erişim jetonunu, kullanıcı hâlâ geçerliyse yeniler. */
export const refreshAccessToken = async (bearerToken) => {
  if (!bearerToken || !process.env.JWT_SECRET) {
    const err = new Error('Token required.');
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(bearerToken, process.env.JWT_SECRET, { ignoreExpiration: true });
  } catch {
    const err = new Error('Invalid token.');
    err.statusCode = 401;
    throw err;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = decoded.exp;
  // Çok eski jetonları kabul etme (ör. süresi 30 günden fazla geçmiş)
  const maxPastSec = 30 * 24 * 60 * 60;
  if (typeof exp === 'number' && exp + maxPastSec < nowSec) {
    const err = new Error('Token too old to refresh.');
    err.statusCode = 401;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    include: { vendor: { select: { id: true, name: true } } },
  });
  if (!user || !user.isActive || user.subRole === 'WAREHOUSE') {
    const err = new Error('User not found or inactive.');
    err.statusCode = 401;
    throw err;
  }

  const portal = decoded.portal === 'birim' ? 'birim' : 'staff';
  const token = generateToken(user, { portal });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      moduleId: user.moduleId || (user.role === 'DEPARTMENT' ? 'BIRIM' : 'URETIM_PLANLAMA'),
      subRole: user.subRole || 'STAFF',
      isExecutive: Boolean(user.isExecutive),
      portal,
      vendor: user.vendor,
    },
  };
};

/**
 * Login a user with email and password.
 */
export const login = async ({ email, password }) => {
  // Yalnızca yerel geliştirme / test paneli: DEV_LOGIN_BYPASS=true ise şifre kontrolü atlanır.
  // Canlı portal adresinde (b2b.ugurpromilling.com ve eski adresler) bayrak ne olursa olsun KAPALIDIR.
  const devBypass = process.env.DEV_LOGIN_BYPASS === 'true' && !isProductionPortal();

  let user = await prisma.user.findUnique({
    where: { email },
    include: { vendor: { select: { id: true, name: true } } }
  });

  if (!user && devBypass) {
    user = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      include: { vendor: { select: { id: true, name: true } } },
    });
  }

  if (!user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated. Please contact an administrator.');
    err.statusCode = 403;
    throw err;
  }

  // Depo Sorumlusu yalnızca e-posta alıcısıdır; portal oturumu açamaz.
  if (user.subRole === 'WAREHOUSE') {
    const err = new Error('Depo Sorumlusu hesapları portala giriş yapamaz; yalnızca e-posta bildirimi alır.');
    err.statusCode = 403;
    throw err;
  }

  if (user.role === 'DEPARTMENT') {
    const err = new Error('Birim talepleri için e-posta kodu ile giriş yapın.');
    err.statusCode = 403;
    throw err;
  }

  if (!devBypass) {
    const isPasswordValid = await bcrypt.compare(password, user.password.trim());
    if (!isPasswordValid) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }
  }

  return toAuthPayload(user, { portal: 'staff' });
};

/**
 * Register a new user.
 */
export const register = async ({ name, email, password, role, moduleId, subRole }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('A user with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, role, moduleId: moduleId || 'URETIM_PLANLAMA', subRole: subRole || 'STAFF' },
    select: { id: true, name: true, email: true, role: true, moduleId: true, subRole: true, createdAt: true },
  });

  const token = generateToken(user, { portal: 'staff' });

  return { token, user: { ...user, portal: 'staff' } };
};

/**
 * Get the current authenticated user's profile.
 */
export const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, moduleId: true, subRole: true, isExecutive: true, phone: true, createdAt: true, vendor: { select: { id: true, name: true } } },
  });

  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  return user;
};

const profileSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  moduleId: true,
  subRole: true,
  isExecutive: true,
  phone: true,
  createdAt: true,
  vendor: { select: { id: true, name: true } },
};

/** Giriş yapan kişi kendi adını, dahili numarasını ve şifresini günceller. */
export const updateProfile = async (userId, data) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    const err = new Error('Kullanıcı bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const patch = { name: String(data.name).trim() };
  if (data.phone !== undefined) {
    const phone = String(data.phone ?? '').trim();
    patch.phone = phone || null;
  }
  if (data.newPassword) {
    const matches = await bcrypt.compare(String(data.currentPassword || ''), user.password);
    if (!matches) {
      const err = new Error('Mevcut şifre hatalı.');
      err.statusCode = 400;
      throw err;
    }
    patch.password = await bcrypt.hash(data.newPassword, 12);
  }

  return prisma.user.update({
    where: { id: userId },
    data: patch,
    select: profileSelect,
  });
};

const RESET_RESEND_MS = 3 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const resetAskedAt = new Map();

const resetLockKey = (email) => `reset:${email}`;

const assertResetCooldown = (email) => {
  const at = resetAskedAt.get(email);
  if (!at) return;
  const waitMs = RESET_RESEND_MS - (Date.now() - at);
  if (waitMs <= 0) return;
  const err = new Error('Kod az önce gönderildi. Lütfen e-postanızı kontrol edin.');
  err.statusCode = 429;
  err.retryAfterSec = Math.max(1, Math.ceil(waitMs / 1000));
  throw err;
};

const canResetPassword = (user) =>
  Boolean(user?.isActive && user.role !== 'DEPARTMENT' && user.subRole !== 'WAREHOUSE');

/**
 * Şifre sıfırlama kodunu e-postaya gönderir. Hesap yoksa da aynı yanıt döner.
 */
export const requestPasswordReset = async (emailRaw) => {
  const email = normalizeEmail(emailRaw);
  assertResetCooldown(email);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (!canResetPassword(user)) {
    resetAskedAt.set(email, Date.now());
    return { ok: true, resendInSec: Math.floor(RESET_RESEND_MS / 1000) };
  }

  const existing = await prisma.passwordResetToken.findUnique({ where: { userId: user.id } });
  if (existing && existing.expiresAt > new Date()) {
    const waitMs = RESET_RESEND_MS - (Date.now() - new Date(existing.createdAt).getTime());
    if (waitMs > 0) {
      const err = new Error('Kod az önce gönderildi. Lütfen e-postanızı kontrol edin.');
      err.statusCode = 429;
      err.retryAfterSec = Math.max(1, Math.ceil(waitMs / 1000));
      throw err;
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.passwordResetToken.upsert({
    where: { userId: user.id },
    update: { token: codeHash, expiresAt, createdAt: new Date() },
    create: { userId: user.id, token: codeHash, expiresAt },
  });

  const { sendPasswordResetMail } = await import('../mail/mail-settings.service.js');
  try {
    await sendPasswordResetMail(user.email, code);
  } catch (e) {
    await prisma.passwordResetToken.delete({ where: { userId: user.id } }).catch(() => {});
    console.error('Şifre sıfırlama maili gönderilemedi:', e.message);
    const err = new Error('Doğrulama kodu gönderilemedi. SMTP ayarlarını kontrol edin.');
    err.statusCode = 503;
    throw err;
  }

  resetAskedAt.set(email, Date.now());
  clearOtpFailures(resetLockKey(email));
  return { ok: true, resendInSec: Math.floor(RESET_RESEND_MS / 1000) };
};

/**
 * E-postadaki 6 haneli kod ile yeni şifre belirler.
 */
export const resetPassword = async ({ email: emailRaw, code, password }) => {
  const email = normalizeEmail(emailRaw);
  assertOtpNotLocked(resetLockKey(email));

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  const resetToken =
    user && canResetPassword(user)
      ? await prisma.passwordResetToken.findUnique({ where: { userId: user.id } })
      : null;
  const fresh = Boolean(resetToken && resetToken.expiresAt > new Date());
  const matches = fresh && (await bcrypt.compare(String(code || ''), resetToken.token));

  if (!matches) {
    const fail = recordOtpFailure(resetLockKey(email));
    if (fail.lockedUntil && user) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    }
    const err = new Error(
      fresh ? 'Kod hatalı.' : 'Kod geçersiz veya süresi doldu. Yeni kod isteyin.',
    );
    err.statusCode = 400;
    throw err;
  }

  clearOtpFailures(resetLockKey(email));
  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.delete({ where: { userId: user.id } }),
  ]);
};

/**
 * Verify a user's password for security check.
 */
export const verifyPassword = async ({ userId, password }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return await bcrypt.compare(password, user.password);
};

const COMPANY_EMAIL_DOMAIN = (process.env.DEPARTMENT_EMAIL_DOMAIN || 'ugurpromilling.com').toLowerCase();
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 3 * 60 * 1000;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const assertCompanyEmail = (email) => {
  const domain = email.split('@')[1] || '';
  if (domain !== COMPANY_EMAIL_DOMAIN) {
    const err = new Error(`Yalnızca @${COMPANY_EMAIL_DOMAIN} e-postaları ile giriş yapılabilir.`);
    err.statusCode = 403;
    throw err;
  }
};

const nameFromEmail = (email) => {
  const local = String(email || '').split('@')[0] || 'birim';
  const parts = local
    .toLowerCase()
    .slice(0, 80)
    .split(/[._-]+/)
    .filter(Boolean);
  if (!parts.length) return 'Birim';
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

const isLegacyHyphenName = (name, email) => {
  const local = String(email || '').split('@')[0].toLowerCase();
  if (!local || local.length < 2) return false;
  return String(name || '').toLowerCase() === `${local[0]}-${local.slice(1)}`;
};

const DEPT_LOGIN_TYP = 'dept_login';

const signDepartmentLoginToken = (otp) =>
  jwt.sign(
    { typ: DEPT_LOGIN_TYP, otpId: otp.id, email: otp.email },
    process.env.JWT_SECRET,
    { expiresIn: Math.floor(OTP_TTL_MS / 1000) }
  );

const completeDepartmentLogin = async (email, name) => {
  let user = await prisma.user.findUnique({
    where: { email },
    include: { vendor: { select: { id: true, name: true } } },
  });

  // Tedarikçi hesabı birim kapısından giremez; ADMIN / PURCHASING / DEPARTMENT girebilir.
  if (user && user.role === 'SUPPLIER') {
    const err = new Error('Tedarikçi hesapları birim girişini kullanamaz. Tedarikçi kapısından giriş yapın.');
    err.statusCode = 403;
    throw err;
  }

  const displayName = (name && name.trim()) || nameFromEmail(email);

  if (!user) {
    const hashedPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
    user = await prisma.user.create({
      data: {
        name: displayName,
        email,
        password: hashedPassword,
        role: 'DEPARTMENT',
        moduleId: 'BIRIM',
        subRole: 'STAFF',
        isExecutive: false,
      },
      include: { vendor: { select: { id: true, name: true } } },
    });
  } else if (!user.name || isLegacyHyphenName(user.name, email)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: displayName },
      include: { vendor: { select: { id: true, name: true } } },
    });
  }

  if (!user.isActive) {
    const err = new Error('Hesabınız pasif. Lütfen yöneticinizle görüşün.');
    err.statusCode = 403;
    throw err;
  }

  return toAuthPayload(user, { portal: 'birim' });
};

const consumeOtpOrThrow = async (otp, fallbackMessage) => {
  if (!otp || otp.consumedAt || otp.expiresAt <= new Date()) {
    const err = new Error(fallbackMessage);
    err.statusCode = 400;
    throw err;
  }
  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
};

/**
 * Birim portalı: e-postaya 6 haneli kod + 10 dk tek kullanımlık giriş linki gönder.
 */
export const requestDepartmentOtp = async (emailRaw) => {
  const email = normalizeEmail(emailRaw);
  assertCompanyEmail(email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isActive) {
      const err = new Error('Hesabınız pasif. Lütfen yöneticinizle görüşün.');
      err.statusCode = 403;
      throw err;
    }
    if (existing.role === 'SUPPLIER') {
      const err = new Error('Tedarikçi hesapları birim girişini kullanamaz. Tedarikçi kapısından giriş yapın.');
      err.statusCode = 403;
      throw err;
    }
  }

  const recent = await prisma.emailOtp.findFirst({
    where: { email, consumedAt: null, createdAt: { gte: new Date(Date.now() - OTP_RESEND_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    const waitMs = OTP_RESEND_MS - (Date.now() - new Date(recent.createdAt).getTime());
    const err = new Error('Kod az önce gönderildi. Lütfen e-postanızı kontrol edin.');
    err.statusCode = 429;
    err.retryAfterSec = Math.max(1, Math.ceil(waitMs / 1000));
    throw err;
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const otp = await prisma.emailOtp.create({
    data: {
      email,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const { getFrontendBaseUrl } = await import('../../config/frontendUrl.js');
  const loginToken = signDepartmentLoginToken(otp);
  const loginUrl = `${getFrontendBaseUrl().replace(/\/$/, '')}/login?giris=${encodeURIComponent(loginToken)}`;

  const { sendOtpMail } = await import('../mail/mail-settings.service.js');
  try {
    await sendOtpMail(email, code, loginUrl);
  } catch (e) {
    console.error('OTP mail gönderilemedi:', e.message);
    const err = new Error('Doğrulama kodu gönderilemedi. SMTP ayarlarını kontrol edin.');
    err.statusCode = 503;
    throw err;
  }

  return { ok: true, expiresInSec: Math.floor(OTP_TTL_MS / 1000), resendInSec: Math.floor(OTP_RESEND_MS / 1000) };
};

export const verifyDepartmentOtp = async ({ email: emailRaw, code, name }) => {
  const email = normalizeEmail(emailRaw);
  assertCompanyEmail(email);
  assertOtpNotLocked(email);

  const otp = await prisma.emailOtp.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  const ok = otp && (await bcrypt.compare(String(code || ''), otp.codeHash));
  if (!ok) {
    recordOtpFailure(email);
    const err = new Error(otp ? 'Kod hatalı.' : 'Kod geçersiz veya süresi doldu. Yeni kod isteyin.');
    err.statusCode = 400;
    throw err;
  }

  clearOtpFailures(email);
  await consumeOtpOrThrow(otp, 'Kod geçersiz veya süresi doldu. Yeni kod isteyin.');
  return completeDepartmentLogin(email, name);
};

export const verifyDepartmentLoginLink = async (tokenRaw) => {
  let payload;
  try {
    payload = jwt.verify(String(tokenRaw || ''), process.env.JWT_SECRET);
  } catch {
    const err = new Error('Giriş bağlantısı geçersiz veya süresi doldu. Yeni kod isteyin.');
    err.statusCode = 400;
    throw err;
  }

  if (payload?.typ !== DEPT_LOGIN_TYP || !payload.otpId || !payload.email) {
    const err = new Error('Giriş bağlantısı geçersiz.');
    err.statusCode = 400;
    throw err;
  }

  const email = normalizeEmail(payload.email);
  assertCompanyEmail(email);

  const otp = await prisma.emailOtp.findUnique({ where: { id: String(payload.otpId) } });
  if (!otp || otp.email !== email) {
    const err = new Error('Giriş bağlantısı geçersiz.');
    err.statusCode = 400;
    throw err;
  }
  if (otp.consumedAt) {
    const err = new Error('Bu bağlantı daha önce kullanıldı. Yeni kod isteyin.');
    err.statusCode = 400;
    throw err;
  }

  await consumeOtpOrThrow(otp, 'Giriş bağlantısının süresi doldu. Yeni kod isteyin.');
  return completeDepartmentLogin(email);
};
