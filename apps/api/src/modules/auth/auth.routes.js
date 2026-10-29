import { Router } from 'express';
import * as authController from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

// Public routes
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh', authController.refresh);
router.post('/otp/request', authController.requestOtp);
router.post('/otp/verify', authController.verifyOtp);
router.post('/otp/link', authController.verifyOtpLink);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.patch('/me', authenticate, authController.updateProfile);
router.post('/verify-password', authenticate, authController.verifyPassword);

export default router;
