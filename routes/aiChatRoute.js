import express from 'express';
import { sendMessage, clearHistory } from '../controllers/aiChatController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// AI Chat routes
router.post('/send', isAuthenticated, sendMessage);
router.delete('/history/:userId', isAuthenticated, clearHistory);

export default router; 