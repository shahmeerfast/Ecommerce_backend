import express from 'express';
import { sendMessage, getMessages, markAsRead, getConversations, getAdminConversations, getAdminThread, sendAdminMessage, getAllConversations, getThread, adminSendMessage } from '../controllers/messageController.js';
import { isAuthenticated } from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

// Send a message
router.post('/send', isAuthenticated, sendMessage);

// Get messages between two users
router.get('/', isAuthenticated, getMessages);

// Mark messages as read
router.post('/mark-read', isAuthenticated, markAsRead);

// Get conversations
router.get('/conversations', isAuthenticated, getConversations);

// Admin-specific routes
router.get('/admin/conversations', adminAuth, getAdminConversations);
router.get('/admin/thread/:otherId/:otherModel', adminAuth, getAdminThread);
router.post('/admin/send', adminAuth, sendAdminMessage);
router.get('/admin/all-conversations', adminAuth, getAllConversations);
router.get('/admin/thread/:userId/:sellerId', adminAuth, getThread);
router.post('/admin/send', adminAuth, adminSendMessage);

export default router; 