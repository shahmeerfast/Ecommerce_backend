import mongoose from 'mongoose';

const sellerSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'seller',
    immutable: true
  },
  age: {
    type: Number,
    required: true,
    min: 18
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  streetAddress: {
    type: String,
    required: true
  },
  zipCode: String,
  governmentId: {
    type: String,
    required: true
  },
  passport: {
    type: String,
    required: true
  },
  selfie: {
    type: String,
    required: true
  },
  businessRegNumber: {
    type: String,
    required: true
  },
  // Structured bank details
  bankDetails: {
    accountHolderName: { type: String, required: true },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankBranch: { type: String, required: true },
    ifscSwiftCode: { type: String, required: true },
    bankCountry: { type: String, required: true },
  },
  // Add profile image field
  profileImage: {
    type: String,
    default: ''
  },
  // Delivery pickup address and geolocation
  pickupAddress: {
    type: String,
    required: true
  },
  pickupLat: {
    type: Number,
    required: true
  },
  pickupLng: {
    type: Number,
    required: true
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Vendor level for badges
  level: {
    type: String,
    enum: ['new', 'trusted', 'premium'],
    default: 'new',
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Seller', sellerSchema);