import express from 'express';
import { getNotifications, markAsRead, markAllAsRead, deleteNotification } from '../controllers/notificationController.js';
import { isAuthenticated as auth } from '../middleware/auth.js';


const router = express.Router();

// Get notifications for a user
router.post('/get', auth, getNotifications);

// Mark a notification as read
router.put('/read/:notificationId', auth, markAsRead);

// Mark all notifications as read
router.put('/read-all', auth, markAllAsRead);

// Delete a notification
router.delete('/:notificationId', auth, deleteNotification);

export default router;