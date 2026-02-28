import PaymentMethod from '../models/paymentMethodModel.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// List all saved payment methods for the authenticated user/seller
export const getPaymentMethods = async (req, res) => {
  try {
    const ownerId = req.user._id || req.user.id;
    const ownerModel = req.user.role === 'seller' ? 'Seller' : 'User';
    const methods = await PaymentMethod.find({ owner: ownerId, ownerModel });
    res.json({ success: true, paymentMethods: methods });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch payment methods', error: err.message });
  }
};

// Add a new payment method (expects a Stripe payment method ID from frontend)
export const addPaymentMethod = async (req, res) => {
  try {
    console.log('req.user:', req.user);
    const { paymentMethodId, cardholderName } = req.body;
    const ownerId = req.user._id || req.user.id;
    const ownerModel = req.user.role === 'seller' ? 'Seller' : 'User';
    console.log('ownerId:', ownerId, 'ownerModel:', ownerModel);

    // Get or create Stripe customer for this user/seller
    let ownerDoc = ownerModel === 'Seller' ? await Seller.findById(ownerId) : await User.findById(ownerId);
    console.log('ownerDoc:', ownerDoc);
    if (!ownerDoc) return res.status(404).json({ success: false, message: 'Owner not found' });

    let stripeCustomerId = ownerDoc.stripeCustomerId;
    if (!stripeCustomerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        name: ownerDoc.fullName || ownerDoc.name,
        email: ownerDoc.email,
      });
      stripeCustomerId = customer.id;
      ownerDoc.stripeCustomerId = stripeCustomerId;
      // Ensure fullName is set before saving
      if (!ownerDoc.fullName) {
        ownerDoc.fullName = ownerDoc.name || 'Unknown';
      }
      await ownerDoc.save();
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Get card details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const { brand, last4, exp_month, exp_year } = paymentMethod.card;

    // Save in DB
    const saved = await PaymentMethod.create({
      owner: ownerId,
      ownerModel,
      stripePaymentMethodId: paymentMethodId,
      brand,
      last4,
      expMonth: exp_month,
      expYear: exp_year,
      cardholderName,
    });
    res.json({ success: true, paymentMethod: saved });
  } catch (err) {
    console.error('Error in addPaymentMethod:', err);
    res.status(500).json({ success: false, message: 'Failed to add payment method', error: err.message });
  }
};

// Delete a payment method
export const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user._id || req.user.id;
    const ownerModel = req.user.role === 'seller' ? 'Seller' : 'User';
    const method = await PaymentMethod.findOne({ _id: id, owner: ownerId, ownerModel });
    if (!method) return res.status(404).json({ success: false, message: 'Payment method not found' });

    // Detach from Stripe
    await stripe.paymentMethods.detach(method.stripePaymentMethodId);
    await method.deleteOne();
    res.json({ success: true, message: 'Payment method deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete payment method', error: err.message });
  }
}; 