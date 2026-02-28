import mongoose from 'mongoose';
import orderModel from '../models/orderModel.js';
import { calculatePaymentDistribution } from '../controllers/paymentDistributionController.js';
import { createNotification } from '../controllers/notificationController.js';
import ActivityLog from '../models/ActivityLog.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected for payment release scheduler');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Function to release payments for confirmed receipts after 24 hours
const releaseScheduledPayments = async () => {
    try {
        const now = new Date();
        
        // Find orders where payment release is scheduled and the time has passed
        const ordersToRelease = await orderModel.find({
            receiptConfirmed: true,
            paymentReleaseScheduled: true,
            paymentReleaseDate: { $lte: now },
            status: 'Delivered'
        });

        console.log(`Found ${ordersToRelease.length} orders ready for payment release`);

        for (const order of ordersToRelease) {
            try {
                console.log(`Processing payment release for order: ${order._id}`);
                
                // Calculate and generate payouts
                await calculatePaymentDistribution(order._id);
                
                // Update order status to indicate payment has been released
                order.paymentReleaseScheduled = false;
                order.paymentReleaseDate = null;
                await order.save();

                // Create activity log
                await ActivityLog.create({
                    userId: new mongoose.Types.ObjectId(order.userId),
                    user: new mongoose.Types.ObjectId(order.userId),
                    userModel: 'user',
                    action: 'Payment released to seller',
                    actionType: 'payment_released',
                    description: `Payment for order #${order._id} has been automatically released to seller after 24 hours of receipt confirmation.`,
                    relatedId: order._id,
                    relatedModel: 'order',
                    status: 'Payment Released',
                    amount: order.amount,
                    timestamp: new Date()
                });

                // Notify user about payment release
                await createNotification(
                    order.userId,
                    'user',
                    'payment_released',
                    `Payment for your order #${order._id} has been automatically released to the seller. Thank you for confirming receipt!`,
                    order._id
                );

                // Notify sellers about payment release
                const sellerProducts = {};
                for (const item of order.items) {
                    try {
                        const product = await Product.findById(item._id).populate('seller');
                        if (product && product.seller) {
                            const seller = await Seller.findById(product.seller._id);
                            if (!seller) continue;

                            if (!sellerProducts[seller._id]) {
                                sellerProducts[seller._id] = [];
                            }
                            sellerProducts[seller._id].push(product.name);
                        }
                    } catch (error) {
                        console.error(`Error processing product ${item._id}:`, error);
                        continue;
                    }
                }

                // Send notifications to sellers
                for (const [sellerId, products] of Object.entries(sellerProducts)) {
                    const seller = await Seller.findById(sellerId);
                    if (!seller) continue;

                    await createNotification(
                        sellerId,
                        'seller',
                        'payment_released',
                        `Payment for order #${order._id} containing your products (${products.join(', ')}) has been released after buyer confirmation.`,
                        order._id
                    );
                }

                console.log(`Successfully processed payment release for order: ${order._id}`);
                
            } catch (error) {
                console.error(`Error processing payment release for order ${order._id}:`, error);
                // Continue with other orders even if one fails
                continue;
            }
        }

        console.log('Payment release processing completed');
        
    } catch (error) {
        console.error('Error in payment release scheduler:', error);
    }
};

// Main function to run the scheduler
const runScheduler = async () => {
    await connectDB();
    
    console.log('Payment release scheduler started');
    
    // Run immediately on startup
    await releaseScheduledPayments();
    
    // Then run every hour to check for orders ready for release
    setInterval(async () => {
        await releaseScheduledPayments();
    }, 60 * 60 * 1000); // Every hour
    
    // Keep the process running
    process.on('SIGINT', async () => {
        console.log('Shutting down payment release scheduler...');
        await mongoose.connection.close();
        process.exit(0);
    });
};

// Run the scheduler if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runScheduler().catch(console.error);
}

export { runScheduler, releaseScheduledPayments };
