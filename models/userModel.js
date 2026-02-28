import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: 'Nigeria' },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String }, // Add phone field
    password: { type: String, required: true },
    cartData: { type: Object, default: {} },
    profileImage: { type: String, default: '' },
    loyaltyPoints: { type: Number, default: 0 },
    addresses: [addressSchema],
    status: { type: String, default: 'Active' }, // Add status field
    createdAt: { type: Date, default: Date.now }
}, { minimize: false })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel