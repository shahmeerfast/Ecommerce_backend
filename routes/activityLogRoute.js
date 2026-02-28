import express from 'express';
import { logActivity, getLogs, getUserActivity } from '../controllers/activityLogController.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Log a new activity (any authenticated user)
router.post('/', isAuthenticated, logActivity);

// Get activity logs (admin only)
router.get('/', isAuthenticated, isAdmin, getLogs);

router.get('/user', isAuthenticated, getUserActivity);

export default router; 