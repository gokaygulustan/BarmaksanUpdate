import * as authService from './auth.service.js';
import { loginSchema, registerSchema, passwordResetRequestSchema, passwordResetSchema, otpRequestSchema, otpVerifySchema, otpLinkSchema, updateProfileSchema } from './auth.schema.js';

/**
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body || {});
    const user = await authService.updateProfile(req.user.id, {
      ...data,
      newPassword: data.newPassword || undefined,
      phone: data.phone === '' ? null : data.phone,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = passwordResetRequestSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    res.json({
      message: 'Hesap varsa doğrulama kodu e-postaya gönderildi.',
      resendInSec: result.resendInSec,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    const data = passwordResetSchema.parse(req.body);
    await authService.resetPassword(data);
    res.json({ message: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-password
 * Protected route to verify current user's password
 */
export const verifyPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    const isValid = await authService.verifyPassword({ userId: req.user.id, password });
    res.json({ isValid });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh — Authorization: Bearer (süresi dolmuş olabilir)
 */
export const refresh = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    const result = await authService.refreshAccessToken(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const requestOtp = async (req, res, next) => {
  try {
    const { email } = otpRequestSchema.parse(req.body);
    res.json(await authService.requestDepartmentOtp(email));
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const data = otpVerifySchema.parse(req.body);
    res.json(await authService.verifyDepartmentOtp(data));
  } catch (error) {
    next(error);
  }
};

export const verifyOtpLink = async (req, res, next) => {
  try {
    const { token } = otpLinkSchema.parse(req.body);
    res.json(await authService.verifyDepartmentLoginLink(token));
  } catch (error) {
    next(error);
  }
};
