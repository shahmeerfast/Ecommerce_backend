import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  baseDeliveryFee: {
    type: Number,
    required: true,
    default: 1000
  },
  deliveryRatePerKm: {
    type: Number,
    required: true,
    default: 100
  },
  maxDeliveryFee: {
    type: Number,
    required: false
  },
  // Commission settings for payment distribution
  platformCommissionRate: {
    type: Number,
    required: true,
    default: 10, // 10% commission on product price
    min: 0,
    max: 100
  },
  companyNetWorth: {
    type: Number,
    required: true,
    default: 0
  },
  netWorthManualAdjustments: [
    {
      amount: { type: Number, required: true },
      reason: { type: String, required: true },
      type: { type: String, enum: ['refund', 'salary', 'other'], default: 'other' },
      admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
      date: { type: Date, default: Date.now }
    }
  ],
  companyName: {
    type: String,
    default: ''
  },
  supportEmail: {
    type: String,
    default: ''
  },
  notificationPreferences: {
    admin: { type: Boolean, default: true },
    user: { type: Boolean, default: true }
  }
});

export default mongoose.model('Settings', settingsSchema); 