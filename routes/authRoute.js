import express from 'express';
import { 
    login, 
    registerAdmin, 
    adminLogin, 
    verifyEmailOTP, 
    verifyPhoneOTP, 
    sendEmailOTP, 
    sendPhoneOTP,
    requestPasswordReset,
    resetPassword
} from '../controllers/authController.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/verify/email', verifyEmailOTP);
router.post('/verify/phone', verifyPhoneOTP);
router.post('/send-otp/email', sendEmailOTP);
router.post('/send-otp/phone', sendPhoneOTP);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/send-email-otp', sendEmailOTP);
router.post('/send-phone-otp', sendPhoneOTP);
router.post('/verify-email-otp', verifyEmailOTP);
router.post('/verify-phone-otp', verifyPhoneOTP);

// Admin routes
router.post('/admin/first-register', registerAdmin);
router.post('/admin/register', isAuthenticated, isAdmin, registerAdmin);
router.post('/admin/login', adminLogin);

export default router; 