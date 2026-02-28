import orderModel from '../models/orderModel.js';
import Payout from '../models/payoutModel.js';
import Settings from '../models/settingsModel.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import ActivityLog from '../models/ActivityLog.js';
import mongoose from 'mongoose';

// Calculate payment distribution for an order
export const calculatePaymentDistribution = async (orderId) => {
    try {
        const order = await orderModel.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }

        const settings = await Settings.findOne();
        const commissionRate = settings?.platformCommissionRate || 10; // Default 10%

        // Group items by seller
        const sellerItems = {};
        let totalProductAmount = 0;

        for (const item of order.items) {
            const product = await Product.findById(item._id).populate('seller');
            if (!product || !product.seller) continue;

            const sellerId = product.seller._id.toString();
            const itemTotal = item.price * item.quantity;
            totalProductAmount += itemTotal;

            if (!sellerItems[sellerId]) {
                sellerItems[sellerId] = {
                    sellerId: product.seller._id,
                    sellerName: product.seller.fullName || product.seller.name,
                    items: [],
                    totalAmount: 0
                };
            }

            sellerItems[sellerId].items.push({
                productId: item._id,
                productName: item.name,
                price: item.price,
                quantity: item.quantity,
                total: itemTotal
            });
            sellerItems[sellerId].totalAmount += itemTotal;
        }

        // Calculate delivery fee distribution
        const deliveryFee = order.deliveryFee || 0;
        const sellerCount = Object.keys(sellerItems).length;
        const deliveryFeePerSeller = sellerCount > 0 ? deliveryFee / sellerCount : 0;

        // Calculate payouts for each seller
        const sellerPayouts = [];
        let totalCommission = 0;

        for (const [sellerId, sellerData] of Object.entries(sellerItems)) {
            const productAmount = sellerData.totalAmount;
            const commission = (productAmount * commissionRate) / 100;
            const payoutAmount = productAmount - commission + deliveryFeePerSeller;

            totalCommission += commission;

            sellerPayouts.push({
                sellerId: sellerData.sellerId,
                sellerName: sellerData.sellerName,
                productAmount: productAmount,
                deliveryFeeShare: deliveryFeePerSeller,
                commission: commission,
                payoutAmount: payoutAmount,
                payoutStatus: 'pending'
            });
        }

        // Update order with payment distribution
        const paymentDistribution = {
            totalAmount: order.amount,
            deliveryFee: deliveryFee,
            productTotal: totalProductAmount,
            platformCommission: totalCommission,
            sellerPayouts: sellerPayouts
        };

        await orderModel.findByIdAndUpdate(orderId, {
            paymentDistribution: paymentDistribution
        });

        // Create individual payout records
        for (const payout of sellerPayouts) {
            await Payout.create({
                sellerId: payout.sellerId,
                sellerName: payout.sellerName,
                orderId: orderId,
                productAmount: payout.productAmount,
                deliveryFeeShare: payout.deliveryFeeShare,
                commission: payout.commission,
                payoutAmount: payout.payoutAmount,
                status: 'pending'
            });
        }

        return paymentDistribution;
    } catch (error) {
        console.error('Error calculating payment distribution:', error);
        throw error;
    }
};

// Get all pending payouts for admin
export const getPendingPayouts = async (req, res) => {
    try {
        const payouts = await Payout.find({ status: 'pending' })
            .populate('sellerId', 'fullName email phone')
            .populate('orderId', 'amount date status')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            payouts: payouts
        });
    } catch (error) {
        console.error('Error fetching pending payouts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending payouts'
        });
    }
};

// Get all payouts (for admin dashboard)
export const getAllPayouts = async (req, res) => {
    try {
        console.log('getAllPayouts called with query:', req.query);
        const { status, sellerId, page = 1, limit = 20 } = req.query;
        
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (sellerId) filter.sellerId = sellerId;

        const skip = (page - 1) * limit;
        
        const payouts = await Payout.find(filter)
            .populate('sellerId', 'fullName email phone bankDetails')
            .populate('orderId', 'amount date status')
            .populate('approvedBy', 'fullName email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Payout.countDocuments(filter);

        console.log('getAllPayouts returning', payouts.length, 'payouts');
        res.json({
            success: true,
            payouts: payouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalPayouts: total,
                hasNext: skip + payouts.length < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching payouts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payouts'
        });
    }
};

// Approve a payout (admin action)
export const approvePayout = async (req, res) => {
    try {
        const { payoutId, payoutMethod, notes } = req.body;
        const adminId = req.user.id;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return res.status(404).json({
                success: false,
                message: 'Payout not found'
            });
        }

        if (payout.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Payout is not in pending status'
            });
        }

        // Update payout status
        payout.status = 'approved';
        payout.payoutMethod = payoutMethod || 'manual';
        payout.approvedBy = adminId;
        payout.approvedAt = new Date();
        payout.notes = notes;
        await payout.save();

        // Update order payment distribution
        await orderModel.updateOne(
            { 
                _id: payout.orderId,
                'paymentDistribution.sellerPayouts.sellerId': payout.sellerId
            },
            {
                $set: {
                    'paymentDistribution.sellerPayouts.$.payoutStatus': 'approved',
                    'paymentDistribution.sellerPayouts.$.payoutMethod': payoutMethod || 'manual',
                    'paymentDistribution.sellerPayouts.$.payoutDate': new Date()
                }
            }
        );

        // Log activity
        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(adminId),
            user: new mongoose.Types.ObjectId(adminId),
            userModel: 'admin',
            action: 'Approved payout',
            actionType: 'payout_approval',
            description: `Payout of ₦${payout.payoutAmount} approved for seller ${payout.sellerName}`,
            relatedId: payout._id,
            relatedModel: 'payout',
            status: 'approved',
            amount: payout.payoutAmount,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Payout approved successfully',
            payout: payout
        });
    } catch (error) {
        console.error('Error approving payout:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve payout'
        });
    }
};

// Mark payout as paid (admin action)
export const markPayoutAsPaid = async (req, res) => {
    try {
        const { payoutId, payoutReference, notes } = req.body;
        const adminId = req.user.id;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return res.status(404).json({
                success: false,
                message: 'Payout not found'
            });
        }

        if (payout.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Payout must be approved before marking as paid'
            });
        }

        // Update payout status
        payout.status = 'paid';
        payout.payoutReference = payoutReference;
        payout.paidAt = new Date();
        if (notes) payout.notes = notes;
        await payout.save();

        // Update order payment distribution
        await orderModel.updateOne(
            { 
                _id: payout.orderId,
                'paymentDistribution.sellerPayouts.sellerId': payout.sellerId
            },
            {
                $set: {
                    'paymentDistribution.sellerPayouts.$.payoutStatus': 'paid',
                    'paymentDistribution.sellerPayouts.$.payoutReference': payoutReference,
                    'paymentDistribution.sellerPayouts.$.payoutDate': new Date()
                }
            }
        );

        // Log activity
        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(adminId),
            user: new mongoose.Types.ObjectId(adminId),
            userModel: 'admin',
            action: 'Marked payout as paid',
            actionType: 'payout_paid',
            description: `Payout of ₦${payout.payoutAmount} marked as paid for seller ${payout.sellerName}`,
            relatedId: payout._id,
            relatedModel: 'payout',
            status: 'paid',
            amount: payout.payoutAmount,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Payout marked as paid successfully',
            payout: payout
        });
    } catch (error) {
        console.error('Error marking payout as paid:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark payout as paid'
        });
    }
};

// Get payout statistics for admin dashboard
export const getPayoutStats = async (req, res) => {
    try {
        const stats = await Payout.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$payoutAmount' }
                }
            }
        ]);

        const totalPayouts = await Payout.countDocuments();
        const totalAmount = await Payout.aggregate([
            { $group: { _id: null, total: { $sum: '$payoutAmount' } } }
        ]);

        const statsObject = {
            totalPayouts: totalPayouts,
            totalAmount: totalAmount[0]?.total || 0,
            byStatus: {}
        };

        stats.forEach(stat => {
            statsObject.byStatus[stat._id] = {
                count: stat.count,
                amount: stat.totalAmount
            };
        });

        res.json({
            success: true,
            stats: statsObject
        });
    } catch (error) {
        console.error('Error fetching payout stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payout statistics'
        });
    }
};

// Get seller payout history
export const getSellerPayouts = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;

        const filter = { sellerId: sellerId };
        if (status) filter.status = status;

        const skip = (page - 1) * limit;

        const payouts = await Payout.find(filter)
            .populate('orderId', 'amount date status')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Payout.countDocuments(filter);

        res.json({
            success: true,
            payouts: payouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalPayouts: total
            }
        });
    } catch (error) {
        console.error('Error fetching seller payouts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payout history'
        });
    }
};

// Mark payout as failed (admin action)
export const markPayoutAsFailed = async (req, res) => {
    try {
        const { payoutId, notes } = req.body;
        const adminId = req.user.id;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return res.status(404).json({ success: false, message: 'Payout not found' });
        }
        if (payout.status === 'failed') {
            return res.status(400).json({ success: false, message: 'Payout is already marked as failed' });
        }
        payout.status = 'failed';
        if (notes) payout.notes = notes;
        await payout.save();

        // Log activity
        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(adminId),
            user: new mongoose.Types.ObjectId(adminId),
            userModel: 'admin',
            action: 'Marked payout as failed',
            actionType: 'payout_failed',
            description: `Payout of ₦${payout.payoutAmount} marked as failed for seller ${payout.sellerName}`,
            relatedId: payout._id,
            relatedModel: 'payout',
            status: 'failed',
            amount: payout.payoutAmount,
            timestamp: new Date()
        });

        res.json({ success: true, message: 'Payout marked as failed', payout });
    } catch (error) {
        console.error('Error marking payout as failed:', error);
        res.status(500).json({ success: false, message: 'Failed to mark payout as failed' });
    }
};

// Mark payout as cancelled (admin action)
export const markPayoutAsCancelled = async (req, res) => {
    try {
        const { payoutId, notes } = req.body;
        const adminId = req.user.id;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return res.status(404).json({ success: false, message: 'Payout not found' });
        }
        if (payout.status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Payout is already marked as cancelled' });
        }
        payout.status = 'cancelled';
        if (notes) payout.notes = notes;
        await payout.save();

        // Log activity
        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(adminId),
            user: new mongoose.Types.ObjectId(adminId),
            userModel: 'admin',
            action: 'Marked payout as cancelled',
            actionType: 'payout_cancelled',
            description: `Payout of ₦${payout.payoutAmount} marked as cancelled for seller ${payout.sellerName}`,
            relatedId: payout._id,
            relatedModel: 'payout',
            status: 'cancelled',
            amount: payout.payoutAmount,
            timestamp: new Date()
        });

        res.json({ success: true, message: 'Payout marked as cancelled', payout });
    } catch (error) {
        console.error('Error marking payout as cancelled:', error);
        res.status(500).json({ success: false, message: 'Failed to mark payout as cancelled' });
    }
}; 