import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  shipping_fee: {
    type: Number,
    required: true,
    default: 10
  },
  images: [{
    type: String
  }],
  category: {
    type: String,
    required: true
  },
  subCategory: {
    type: String
  },
  sizes: {
    type: [String],
    default: ['S', 'M', 'L']
  },
  bestseller: {
    type: Boolean,
    default: false
  },
  condition: {
    type: String,
    enum: ['new', 'uk_used', 'used', 'used_neat'],
    default: 'new'
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',  // Changed from 'User' to 'Seller'
    required: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'  // Changed from 'User' to 'Admin'
  },
  approvalDate: Date,
  rejectionReason: String,
  reviews: [reviewSchema],
  averageRating: {
    type: Number,
    default: 0
  },
  numReviews: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Calculate average rating before saving
productSchema.pre('save', function(next) {
  if (this.reviews.length > 0) {
    this.averageRating = this.reviews.reduce((acc, review) => acc + review.rating, 0) / this.reviews.length;
    this.numReviews = this.reviews.length;
  }
  next();
});

export default mongoose.model('Product', productSchema);