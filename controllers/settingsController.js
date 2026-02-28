import Settings from '../models/settingsModel.js';

// Get current delivery settings
export const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({
      baseDeliveryFee: settings.baseDeliveryFee,
      deliveryRatePerKm: settings.deliveryRatePerKm,
      maxDeliveryFee: settings.maxDeliveryFee,
      companyName: settings.companyName,
      supportEmail: settings.supportEmail,
      notificationPreferences: settings.notificationPreferences,
      companyNetWorth: settings.companyNetWorth,
      netWorthManualAdjustments: settings.netWorthManualAdjustments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update delivery settings (admin only)
export const updateSettings = async (req, res) => {
  try {
    const { baseDeliveryFee, deliveryRatePerKm, maxDeliveryFee, companyName, supportEmail, notificationPreferences } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ baseDeliveryFee, deliveryRatePerKm, maxDeliveryFee, companyName, supportEmail, notificationPreferences });
    } else {
      if (baseDeliveryFee !== undefined) settings.baseDeliveryFee = baseDeliveryFee;
      if (deliveryRatePerKm !== undefined) settings.deliveryRatePerKm = deliveryRatePerKm;
      if (maxDeliveryFee !== undefined) settings.maxDeliveryFee = maxDeliveryFee;
      if (companyName !== undefined) settings.companyName = companyName;
      if (supportEmail !== undefined) settings.supportEmail = supportEmail;
      if (notificationPreferences !== undefined) settings.notificationPreferences = notificationPreferences;
      await settings.save();
    }
    res.json({
      baseDeliveryFee: settings.baseDeliveryFee,
      deliveryRatePerKm: settings.deliveryRatePerKm,
      maxDeliveryFee: settings.maxDeliveryFee,
      companyName: settings.companyName,
      supportEmail: settings.supportEmail,
      notificationPreferences: settings.notificationPreferences,
      companyNetWorth: settings.companyNetWorth,
      netWorthManualAdjustments: settings.netWorthManualAdjustments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get company net worth
export const getCompanyNetWorth = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json({ companyNetWorth: settings.companyNetWorth, netWorthManualAdjustments: settings.netWorthManualAdjustments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Manually adjust company net worth (admin only)
export const adjustCompanyNetWorth = async (req, res) => {
  try {
    const { amount, reason, type } = req.body;
    if (typeof amount !== 'number' || !reason) {
      return res.status(400).json({ error: 'Amount and reason are required.' });
    }
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    settings.companyNetWorth += amount;
    settings.netWorthManualAdjustments.push({ amount, reason, type: type || 'other', admin: req.user.id || req.user._id });
    await settings.save();
    res.json({ companyNetWorth: settings.companyNetWorth, netWorthManualAdjustments: settings.netWorthManualAdjustments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 