import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: false },
  user: { type: mongoose.Schema.Types.ObjectId, required: false }, // for admin/seller logs
  userModel: { type: String, required: false }, // 'user', 'seller', 'admin'
  action: { type: String, required: true },
  actionType: { type: String },
  description: { type: String },
  relatedId: { type: mongoose.Schema.Types.ObjectId },
  relatedModel: { type: String },
  status: { type: String },
  amount: { type: Number },
  timestamp: { type: Date, default: Date.now },
  meta: { type: Object, default: {} }
});

const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog; 