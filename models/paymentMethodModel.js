import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'ownerModel',
  },
  ownerModel: {
    type: String,
    required: true,
    enum: ['User', 'Seller'],
  },
  stripePaymentMethodId: {
    type: String,
    required: true,
  },
  brand: {
    type: String,
    required: true,
  },
  last4: {
    type: String,
    required: true,
  },
  expMonth: {
    type: Number,
    required: true,
  },
  expYear: {
    type: Number,
    required: true,
  },
  cardholderName: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);
export default PaymentMethod; 