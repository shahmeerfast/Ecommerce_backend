import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    recipient: { 
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'recipientModel'
    },
    recipientModel: {
        type: String,
        required: true,
        enum: ['user', 'seller', 'admin']
    },
    type: {
        type: String,
        required: true,
        enum: ['order_placed', 'order_status_update', 'product_approval', 'new_registration', 'product_submission', 'payment_release', 'receipt_confirmed', 'payment_released']
    },
    message: {
        type: String,
        required: true
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const notificationModel = mongoose.models.notification || mongoose.model('notification', notificationSchema);
export default notificationModel;