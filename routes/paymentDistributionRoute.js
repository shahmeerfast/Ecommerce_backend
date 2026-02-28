import express from 'express';
import { 
    getPendingPayouts, 
    getAllPayouts, 
    approvePayout, 
    markPayoutAsPaid, 
    getPayoutStats, 
    getSellerPayouts, 
    markPayoutAsFailed,
    markPayoutAsCancelled
} from '../controllers/paymentDistributionController.js';
import adminAuth from '../middleware/adminAuth.js';
import { isAuthenticated as auth } from '../middleware/auth.js';

const router = express.Router();

// Admin routes (require admin authentication)
router.get('/admin/pending', adminAuth, getPendingPayouts);
router.get('/admin/all', adminAuth, getAllPayouts);
router.get('/admin/stats', adminAuth, getPayoutStats);
router.post('/admin/approve', adminAuth, approvePayout);
router.post('/admin/mark-paid', adminAuth, markPayoutAsPaid);
router.post('/admin/mark-failed', adminAuth, markPayoutAsFailed);
router.post('/admin/mark-cancelled', adminAuth, markPayoutAsCancelled);

// Seller routes (require seller authentication)
router.get('/seller/history', auth, getSellerPayouts);

export default router; 