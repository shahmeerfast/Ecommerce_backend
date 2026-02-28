import mongoose from 'mongoose'

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    items: { type: Array, required: true },
    amount: { type: Number, required: true },
    address: { type: Object, required: true },
    // Delivery address and geolocation
    deliveryAddress: { type: String, required: true },
    deliveryLat: { type: Number, required: true },
    deliveryLng: { type: Number, required: true },
    // Delivery distance and fee
    deliveryDistanceKm: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    status: { type: String, required: true, default:'Order Placed' },
    paymentMethod: { type: String, required: true },
    payment: { type: Boolean, required: true , default: false },
    date: {type: Number, required:true},
    // Payment release tracking
    receiptConfirmed: { type: Boolean, default: false },
    receiptConfirmedAt: { type: Date },
    paymentReleaseScheduled: { type: Boolean, default: false },
    paymentReleaseDate: { type: Date },
    // Payment distribution tracking
    paymentDistribution: {
        totalAmount: { type: Number, default: 0 },
        deliveryFee: { type: Number, default: 0 },
        productTotal: { type: Number, default: 0 },
        platformCommission: { type: Number, default: 0 },
        sellerPayouts: [{
            sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
            sellerName: { type: String },
            productAmount: { type: Number, default: 0 },
            deliveryFeeShare: { type: Number, default: 0 },
            commission: { type: Number, default: 0 },
            payoutAmount: { type: Number, default: 0 },
            payoutStatus: { 
                type: String, 
                enum: ['pending', 'approved', 'paid', 'failed'],
                default: 'pending'
            },
            payoutDate: { type: Date },
            payoutMethod: { type: String },
            payoutReference: { type: String }
        }]
    }
})

const orderModel = mongoose.models.Order || mongoose.model('Order', orderSchema)
export default orderModel;