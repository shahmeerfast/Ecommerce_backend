import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema({
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true
    },
    sellerName: {
        type: String,
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    // Payout amounts
    productAmount: {
        type: Number,
        required: true,
        default: 0
    },
    deliveryFeeShare: {
        type: Number,
        required: true,
        default: 0
    },
    commission: {
        type: Number,
        required: true,
        default: 0
    },
    payoutAmount: {
        type: Number,
        required: true,
        default: 0
    },
    // Payout status and tracking
    status: {
        type: String,
        enum: ['pending', 'approved', 'paid', 'failed', 'cancelled'],
        default: 'pending'
    },
    // Payout method and reference
    payoutMethod: {
        type: String,
        enum: ['bank_transfer', 'stripe_connect', 'manual', 'other'],
        default: 'manual'
    },
    payoutReference: {
        type: String
    },
    // Admin tracking
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },
    approvedAt: {
        type: Date
    },
    paidAt: {
        type: Date
    },
    // Notes and comments
    notes: {
        type: String
    },
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
payoutSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Payout = mongoose.models.Payout || mongoose.model('Payout', payoutSchema);
export default Payout; 