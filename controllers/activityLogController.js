import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';

// Log a new activity
export const logActivity = async (req, res) => {
  try {
    const log = await ActivityLog.create(req.body);
    res.status(201).json({ success: true, log });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to log activity', error: err.message });
  }
};

// Get activity logs (optionally filter by type, user, date)
export const getLogs = async (req, res) => {
  try {
    const { actionType, user, userModel, from, to, status } = req.query;
    const filter = {};
    if (actionType) filter.actionType = actionType;
    if (user) filter.user = user;
    if (userModel) filter.userModel = userModel;
    if (status) filter.status = status;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }
    let logs = await ActivityLog.find(filter).sort({ timestamp: -1 }).limit(500).lean();
    // Populate user names
    for (const log of logs) {
      if (log.user && log.userModel) {
        console.log('ActivityLog user lookup:', { user: log.user, userModel: log.userModel });
        if (log.userModel === 'user') {
          const u = await User.findById(log.user);
          console.log('User lookup result:', u);
          log.userName = u
            ? (u.fullName && u.fullName !== 'Unknown'
                ? u.fullName
                : u.name || u.email)
            : log.user;
        } else if (log.userModel === 'seller') {
          const s = await Seller.findById(log.user);
          console.log('Seller lookup result:', s);
          log.userName = s ? s.fullName || s.email : log.user;
        } else if (log.userModel === 'admin') {
          const a = await Admin.findById(log.user);
          console.log('Admin lookup result:', a);
          log.userName = a ? a.fullName || a.email : log.user;
        }
      }
    }
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch logs', error: err.message });
  }
};

export const getUserActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const activities = await ActivityLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(10);
    res.json({ success: true, activities });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch activity log' });
  }
}; 