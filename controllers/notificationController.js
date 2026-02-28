import notificationModel from '../models/notificationModel.js';
import userModel from '../models/userModel.js';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';

// Create a new notification
export const createNotification = async (recipientId, recipientModel, type, message, relatedId = null) => {
    try {
        // Prevent duplicate notifications
        const exists = await notificationModel.findOne({
            recipient: recipientId,
            recipientModel,
            type,
            relatedId,
            message
        });
        if (exists) {
            console.log('Duplicate notification prevented:', { recipientId, recipientModel, type, relatedId, message });
            return exists;
        }
        const notification = new notificationModel({
            recipient: recipientId,
            recipientModel,
            type,
            message,
            relatedId
        });
        console.log('Creating notification:', {
            recipient: recipientId,
            recipientModel,
            type,
            message,
            relatedId
        });
        await notification.save();
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
};

// Get notifications for a specific recipient
export const getNotifications = async (req, res) => {
    try {
        const { userId, userType } = req.body;
        // Map frontend userType to correct recipientModel
        let recipientModel = userType;
        if (userType === 'user' && req.user && req.user.role === 'admin') {
            recipientModel = 'admin';
        } else if (userType === 'seller') {
            recipientModel = 'seller';
        }
        const notifications = await notificationModel.find({
            recipient: userId,
            recipientModel: recipientModel
        }).sort({ createdAt: -1 });
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const notification = await notificationModel.findByIdAndUpdate(
            notificationId,
            { isRead: true },
            { new: true }
        );
        res.status(200).json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error marking notification as read', error: error.message });
    }
};

// Mark all notifications as read for a user
export const markAllAsRead = async (req, res) => {
    try {
        const { userId, userType } = req.body;
        // Map frontend userType to correct recipientModel
        let recipientModel = userType;
        if (userType === 'user' && req.user && req.user.role === 'admin') {
            recipientModel = 'admin';
        } else if (userType === 'seller') {
            recipientModel = 'seller';
        }
        await notificationModel.updateMany(
            { recipient: userId, recipientModel: recipientModel },
            { isRead: true }
        );
        res.status(200).json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error marking notifications as read', error: error.message });
    }
};

// Delete a notification
export const deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        await notificationModel.findByIdAndDelete(notificationId);
        res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting notification', error: error.message });
    }
};