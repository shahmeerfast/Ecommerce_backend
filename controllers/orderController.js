import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Product from "../models/Product.js";
import Stripe from 'stripe';
import razorpay from 'razorpay';
import { createNotification } from './notificationController.js';
import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';
import Settings from '../models/settingsModel.js';
import { getDrivingDistanceKm } from '../config/mapbox.js';
import ActivityLog from '../models/ActivityLog.js';
import mongoose from 'mongoose';
import { calculatePaymentDistribution } from '../controllers/paymentDistributionController.js';

// global variables
const currency = 'usd'
const deliveryCharge = 10
const PKR_TO_USD = 0.0036  // Conversion rate from PKR to USD

// gateway initialize
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const razorpayInstance = new razorpay({
    key_id : process.env.RAZORPAY_KEY_ID,
    key_secret : process.env.RAZORPAY_KEY_SECRET,
})

// Placing orders using COD Method
const placeOrder = async (req,res) => {
    try {
        const { userId, items, amount, address, deliveryAddress, deliveryLat, deliveryLng, deliveryDistanceKm, deliveryFee } = req.body;

        console.log('Received order request:', {
            userId,
            itemsCount: items?.length,
            amount,
            address
        });

        if (!items || !Array.isArray(items) || items.length === 0) {
            console.log('No items in order');
            return res.status(400).json({
                success: false,
                message: 'Order must contain at least one item'
            });
        }

        // Process items to ensure images and sellerId are properly handled
        const processedItems = await Promise.all(items.map(async (item, index) => {
            // Fetch product to get sellerId
            const product = await Product.findById(item._id);
            const sellerId = product && product.seller ? product.seller.toString() : null;
            const imageUrl = item.image || '/placeholder.png';
            return {
                _id: item._id,
                name: item.name,
                price: item.price,
                size: item.size,
                quantity: item.quantity,
                description: item.description || '',
                image: imageUrl,
                sellerId
            };
        }));

        console.log('Processed items:', processedItems);

        // Calculate commission (e.g., 10% of product subtotal)
        const productSubtotal = processedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const commissionRate = 0.10; // 10% commission
        const commission = Math.round(productSubtotal * commissionRate);

        const orderData = {
            userId,
            items: processedItems,
            address,
            amount,
            paymentMethod: "COD",
            payment: false,
            status: 'Order Placed',
            date: Date.now(),
            // Delivery info
            deliveryAddress,
            deliveryLat,
            deliveryLng,
            deliveryDistanceKm,
            deliveryFee,
            // Commission info
            productSubtotal,
            commission
        };

        console.log('Creating order with data:', {
            userId: orderData.userId,
            itemsCount: orderData.items.length,
            amount: orderData.amount,
            status: orderData.status
        });

        const newOrder = new orderModel(orderData);
        await newOrder.save();

        // Notify user about order placement
        let totalAmount = orderData.amount;
        if (orderData.deliveryFee && !String(orderData.amount).includes(orderData.deliveryFee)) {
            // If amount does not already include delivery fee, add it
            totalAmount = orderData.amount + orderData.deliveryFee;
        }
        await createNotification(
            userId,
            'user',
            'order_placed',
            `Your order #${newOrder._id} has been placed successfully. Total amount: ₦${totalAmount}`,
            newOrder._id
        );

        // Notify admin about new order
        const admins = await Admin.find();
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'admin',
                'order_placed',
                `New order placed by user ${userId}`,
                newOrder._id
            );
        }

        // Notify sellers about their products being ordered
        const sellerProducts = {};
        for (const item of processedItems) {
            try {
                const product = await Product.findById(item._id).populate('seller');
                if (!product) {
                    console.warn(`Product not found: ${item._id}`);
                    continue;
                }
                if (!product.seller) {
                    console.warn(`No seller found for product: ${item._id}`);
                    continue;
                }

                // Verify if the seller exists and is a valid seller
                const seller = await Seller.findById(product.seller._id);
                if (!seller) {
                    console.warn(`Invalid seller ID: ${product.seller._id}`);
                    continue;
                }

                if (!sellerProducts[seller._id]) {
                    sellerProducts[seller._id] = [];
                }
                sellerProducts[seller._id].push(product.name);
            } catch (error) {
                console.error(`Error processing product ${item._id}:`, error);
                continue;
            }
        }

        for (const [sellerId, products] of Object.entries(sellerProducts)) {
            // Double-check seller existence before sending notification
            const seller = await Seller.findById(sellerId);
            if (!seller) continue;

            await createNotification(
                sellerId,
                'seller',
                'order_placed',
                `New order received for products: ${products.join(', ')}.\nDelivery to: ${deliveryAddress}.\nDelivery Fee: ₦${deliveryFee}`,
                newOrder._id
            );
        }

        await userModel.findByIdAndUpdate(userId, {cartData: {}});

        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(userId),
            user: new mongoose.Types.ObjectId(userId),
            userModel: 'user',
            action: 'Placed an order',
            actionType: 'order_placed',
            description: `Order #${newOrder._id} placed by user ${userId}. Amount: ₦${totalAmount}`,
            relatedId: newOrder._id,
            relatedModel: 'order',
            status: 'Order Placed',
            amount: totalAmount,
            timestamp: new Date()
        });

        // Increment loyalty points (e.g., 10 points per order)
        await userModel.findByIdAndUpdate(userId, { $inc: { loyaltyPoints: 10 } });

        res.json({
            success: true,
            message: "Order Placed",
            orderId: newOrder._id
        });
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create order'
        });
    }
};

// Placing orders using Stripe Method
const placeOrderStripe = async (req,res) => {
    try {
        const { userId, items, amount, address, deliveryAddress, deliveryLat, deliveryLng, deliveryDistanceKm, deliveryFee } = req.body;
        const { origin } = req.headers;

        console.log('Creating order with items:', items);

        // Ensure items have all necessary fields and sellerId
        const processedItems = await Promise.all(items.map(async (item) => {
            const product = await Product.findById(item._id);
            const sellerId = product && product.seller ? product.seller.toString() : null;
            return {
                _id: item._id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                size: item.size,
                image: item.image || item.images || item.imageUrl || item.imageUrls || [],
                description: item.description || '',
                sellerId
            };
        }));

        console.log('Processed items:', processedItems);

        const orderData = {
            userId,
            items: processedItems,
            address,
            amount,
            paymentMethod: "Stripe",
            payment: false,
            date: Date.now(),
            status: 'Order Placed',
            // Delivery info
            deliveryAddress,
            deliveryLat,
            deliveryLng,
            deliveryDistanceKm,
            deliveryFee
        };

        console.log('Saving order with data:', orderData);

        const newOrder = new orderModel(orderData);
        await newOrder.save();

        // Notify user about order placement
        let totalAmountStripe = orderData.amount;
        if (orderData.deliveryFee && !String(orderData.amount).includes(orderData.deliveryFee)) {
            totalAmountStripe = orderData.amount + orderData.deliveryFee;
        }
        await createNotification(
            userId,
            'user',
            'order_placed',
            `Your order #${newOrder._id} has been placed successfully. Total amount: ₦${totalAmountStripe}`,
            newOrder._id
        );

        // Notify admin about new order
        const admins = await Admin.find();
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'admin',
                'order_placed',
                `New order placed by user ${userId}`,
                newOrder._id
            );
        }

        // Notify sellers about their products being ordered
        const sellerProducts = {};
        for (const item of processedItems) {
            try {
                const product = await Product.findById(item._id).populate('seller');
                if (!product) {
                    console.warn(`Product not found: ${item._id}`);
                    continue;
                }
                if (!product.seller) {
                    console.warn(`No seller found for product: ${item._id}`);
                    continue;
                }

                // Verify if the seller exists and is a valid seller
                const seller = await Seller.findById(product.seller._id);
                if (!seller) {
                    console.warn(`Invalid seller ID: ${product.seller._id}`);
                    continue;
                }

                if (!sellerProducts[seller._id]) {
                    sellerProducts[seller._id] = [];
                }
                sellerProducts[seller._id].push(product.name);
            } catch (error) {
                console.error(`Error processing product ${item._id}:`, error);
                continue;
            }
        }

        for (const [sellerId, products] of Object.entries(sellerProducts)) {
            // Double-check seller existence before sending notification
            const seller = await Seller.findById(sellerId);
            if (!seller) continue;

            await createNotification(
                sellerId,
                'seller',
                'order_placed',
                `New order received for products: ${products.join(', ')}`,
                newOrder._id
            );
        }

        // Ensure minimum unit_amount is at least 50 cents while keeping relative prices
        const minUnitAmount = 50;
        const rawAmounts = items.map(item => Math.round(item.price * PKR_TO_USD * 100));
        // Use dynamic deliveryFee from the order, fallback to deliveryCharge if missing
        const deliveryFeeNaira = typeof deliveryFee === 'number' ? deliveryFee : deliveryCharge;
        const deliveryAmount = Math.round(deliveryFeeNaira * PKR_TO_USD * 100);
        const minAmount = Math.min(...rawAmounts, deliveryAmount);
        
        // Calculate scaling factor if needed
        const scalingFactor = minAmount < minUnitAmount ? minUnitAmount / minAmount : 1;

        // Create line items including products and delivery charges
        const line_items = [
            ...items.map((item) => ({
                price_data: {
                    currency: currency,
                    product_data: {
                        name: item.name,
                        description: item.description || `Size: ${item.size}`
                    },
                    unit_amount: Math.max(minUnitAmount, Math.round(item.price * PKR_TO_USD * 100 * scalingFactor))
                },
                quantity: item.quantity
            })),
            {
                price_data: {
                    currency: currency,
                    product_data: {
                        name: 'Delivery Charges'
                    },
                    unit_amount: Math.max(minUnitAmount, Math.round(deliveryFeeNaira * PKR_TO_USD * 100 * scalingFactor))
                },
                quantity: 1
            }
        ];

        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url: `${origin}/verify?success=false&orderId=${newOrder._id}`,
            line_items,
            mode: 'payment',
        });

        // For Stripe, amounts must be in USD, but display Naira (₦) to the user
        // Calculate Naira values for display
        const productBreakdownNaira = items.map(item => ({
            name: item.name,
            description: item.description || `Size: ${item.size}`,
            quantity: item.quantity,
            unit_amount_naira: item.price,
            total_naira: item.price * item.quantity
        }));
        const deliveryFeeDisplay = typeof deliveryFee === 'number' ? deliveryFee : deliveryCharge;
        const totalNaira = productBreakdownNaira.reduce((sum, item) => sum + item.total_naira, 0) + deliveryFeeDisplay;

        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(userId),
            user: new mongoose.Types.ObjectId(userId),
            userModel: 'user',
            action: 'Placed an order',
            actionType: 'order_placed',
            description: `Order #${newOrder._id} placed by user ${userId} (Stripe). Amount: ₦${totalAmountStripe}`,
            relatedId: newOrder._id,
            relatedModel: 'order',
            status: 'Order Placed',
            amount: totalAmountStripe,
            timestamp: new Date()
        });

        // Increment loyalty points (e.g., 10 points per order)
        await userModel.findByIdAndUpdate(userId, { $inc: { loyaltyPoints: 10 } });

        res.json({ success: true, session_url: session.url, breakdown: { products: productBreakdownNaira, deliveryFee: deliveryFeeDisplay, total: totalNaira } });

    } catch (error) {
        console.log('Stripe order error:', error);
        res.json({success:false,message:error.message});
    }
};

// Verify Stripe 
const verifyStripe = async (req,res) => {

    const { orderId, success, userId } = req.body

    try {
        if (success === "true") {
            const order = await orderModel.findByIdAndUpdate(orderId, {payment: true});
            
            // Send notifications after successful payment
            if (order) {
                // Notify user about successful payment
                await createNotification(
                    userId,
                    'user',
                    'order_status_update',
                    `Payment successful for order #${orderId}. Your order has been confirmed.`,
                    orderId
                );

                // Notify sellers about successful payment
                const sellerProducts = {};
                for (const item of order.items) {
                    try {
                        const product = await Product.findById(item._id).populate('seller');
                        if (product && product.seller) {
                            // Verify if the seller exists
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
                        'order_status_update',
                        `Payment received for order #${orderId} containing your products (${products.join(', ')})`,
                        orderId
                    );
                }

                // Log payment to ActivityLog
                // Check if a "paid" activity log already exists for this order
                const existingLog = await ActivityLog.findOne({
                    relatedId: orderId,
                    status: 'paid',
                    actionType: 'order_status_update'
                });
                
                if (!existingLog) {
                    await ActivityLog.create({
                        userId: new mongoose.Types.ObjectId(userId),
                        user: new mongoose.Types.ObjectId(userId),
                        userModel: 'user',
                        action: 'Received payment',
                        actionType: 'order_status_update',
                        description: `Payment successful for order #${orderId} by user ${userId}`,
                        relatedId: orderId,
                        relatedModel: 'order',
                        status: 'paid',
                        amount: order.amount,
                        timestamp: new Date()
                    });
                }

                // Calculate payment distribution and create payout records
                try {
                    await calculatePaymentDistribution(orderId);
                    console.log(`Payment distribution calculated for order ${orderId}`);
                } catch (error) {
                    console.error(`Error calculating payment distribution for order ${orderId}:`, error);
                    // Don't fail the payment verification if distribution calculation fails
                }
            }

            await userModel.findByIdAndUpdate(userId, {cartData: {}})
            res.json({success: true});
        } else {
            await orderModel.findByIdAndDelete(orderId)
            res.json({success: false})
        }
        
    } catch (error) {
        console.log(error)
        res.json({success: false, message: error.message})
    }

}

// Placing orders using Razorpay Method
const placeOrderRazorpay = async (req,res) => {
    try {
        
        const { userId, items, amount, address} = req.body

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"Razorpay",
            payment:false,
            date: Date.now()
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const options = {
            amount: amount * 100,
            currency: currency.toUpperCase(),
            receipt : newOrder._id.toString()
        }

        await razorpayInstance.orders.create(options, (error,order)=>{
            if (error) {
                console.log(error)
                return res.json({success:false, message: error})
            }
            res.json({success:true,order})
        })

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

const verifyRazorpay = async (req,res) => {
    try {
        
        const { userId, razorpay_order_id  } = req.body

        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)
        if (orderInfo.status === 'paid') {
            const order = await orderModel.findByIdAndUpdate(orderInfo.receipt,{payment:true});
            
            // Calculate payment distribution and create payout records
            if (order) {
                try {
                    await calculatePaymentDistribution(orderInfo.receipt);
                    console.log(`Payment distribution calculated for Razorpay order ${orderInfo.receipt}`);
                } catch (error) {
                    console.error(`Error calculating payment distribution for Razorpay order ${orderInfo.receipt}:`, error);
                    // Don't fail the payment verification if distribution calculation fails
                }
            }
            
            await userModel.findByIdAndUpdate(userId,{cartData:{}})
            res.json({ success: true, message: "Payment Successful" })
        } else {
             res.json({ success: false, message: 'Payment Failed' });
        }

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}


// All Orders data for Admin Panel
const allOrders = async (req,res) => {

    try {
        
        const orders = await orderModel.find({})
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// User Order Data For Frontend
const userOrders = async (req,res) => {
    try {
        const { userId } = req.body;
        
        console.log('Fetching orders for userId:', userId);
        
        if (!userId) {
            console.log('No userId provided in request');
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const orders = await orderModel.find({ userId }).sort({ date: -1 });
        console.log(`Found ${orders.length} orders for user ${userId}`);
        
        if (!orders || orders.length === 0) {
            console.log('No orders found for user:', userId);
            return res.json({
                success: true,
                orders: []
            });
        }

        res.json({
            success: true,
            orders
        });

    } catch (error) {
        console.error('Error in userOrders:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch orders'
        });
    }
};
// update order status from Admin Panel
const updateStatus = async (req,res) => {
    try {
        const { orderId, status } = req.body

        const order = await orderModel.findById(orderId).populate('userId');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        order.status = status;
        await order.save();

        // Generate payouts if order is delivered or completed
        if (status === 'Delivered' || status === 'Completed') {
            try {
                await calculatePaymentDistribution(orderId);
            } catch (err) {
                console.error('Error generating payouts:', err);
            }
        }

        // Send notification to user about order status update
        let statusMessage = '';
        switch (status) {
            case 'Processing':
                statusMessage = 'Your order is being processed and will be shipped soon.';
                break;
            case 'Shipped':
                statusMessage = 'Great news! Your order has been shipped and is on its way.';
                break;
            case 'Delivered':
                statusMessage = 'Your order has been delivered successfully. Enjoy your purchase!';
                break;
            case 'Cancelled':
                statusMessage = 'Your order has been cancelled. Please contact support if this was not intended.';
                break;
            default:
                statusMessage = `Your order status has been updated to: ${status}`;
        }

        // Fix: always use a valid recipient ID
        let recipientId = order.userId && order.userId._id ? order.userId._id : order.userId;
        if (recipientId) {
            await createNotification(
                recipientId,
                'user',
                'order_status_update',
                `Order #${orderId}: ${statusMessage}`,
                orderId
            );
        }

        // If the order has products from sellers, notify them as well
        const sellerProducts = {};
        for (const item of order.items) {
            try {
                const product = await Product.findById(item._id).populate('seller');
                if (product && product.seller) {
                    // Verify if the seller exists and is a valid seller
                    const seller = await Seller.findById(product.seller._id);
                    if (!seller) {
                        console.warn(`Invalid seller ID: ${product.seller._id}`);
                        continue;
                    }

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
            // Double-check seller existence before sending notification
            const seller = await Seller.findById(sellerId);
            if (!seller) continue;

            await createNotification(
                sellerId,
                'seller',
                'order_status_update',
                `Order #${orderId} containing your products (${products.join(', ')}) has been updated to: ${status}`,
                orderId
            );
        }

        const seller = await Seller.findById(req.user._id || req.user.id);
        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(order.userId && order.userId._id ? order.userId._id : order.userId),
            user: new mongoose.Types.ObjectId(req.user._id || req.user.id),
            userModel: 'seller',
            action: 'Updated order status',
            actionType: 'order_status_update',
            description: `Order #${orderId} status updated to ${status} by seller ${seller ? seller.fullName : req.user._id || req.user.id}`,
            relatedId: orderId,
            relatedModel: 'order',
            status: status,
            amount: order.amount,
            timestamp: new Date()
        });

        res.json({success: true, message: 'Status Updated'});

    } catch (error) {
        console.log(error)
        res.json({success: false, message: error.message})
    }
}

const calculateDeliveryFee = async (req, res) => {
  try {
    const { sellerId, deliveryLat, deliveryLng } = req.body;
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    const settings = await Settings.findOne();
    if (!settings) return res.status(500).json({ error: 'Delivery settings not found' });
    const distance = await getDrivingDistanceKm(
      [seller.pickupLng, seller.pickupLat],
      [deliveryLng, deliveryLat]
    );
    let fee = settings.baseDeliveryFee + (distance * settings.deliveryRatePerKm);
    if (settings.maxDeliveryFee && fee > settings.maxDeliveryFee) fee = settings.maxDeliveryFee;
    res.json({ distance: Number(distance.toFixed(2)), fee: Math.round(fee) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user.id || req.user._id;
    // Find all orders where any item belongs to this seller
    const orders = await orderModel.find({ "items.sellerId": sellerId }).sort({ date: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Seller can update payment status
const updatePaymentStatusBySeller = async (req, res) => {
  try {
    const { orderId, payment } = req.body;
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    order.payment = payment;
    await order.save();
    const seller = await Seller.findById(req.user._id || req.user.id);
    await ActivityLog.create({
      userId: new mongoose.Types.ObjectId(order.userId),
      user: new mongoose.Types.ObjectId(req.user._id || req.user.id),
      userModel: 'seller',
      action: 'Updated payment status',
      actionType: 'payment_status_update',
      description: `Order #${orderId} payment status updated to ${payment ? 'Paid' : 'Unpaid'} by seller ${seller ? seller.fullName : req.user._id || req.user.id}`,
      relatedId: orderId,
      relatedModel: 'order',
      status: payment ? 'Paid' : 'Unpaid',
      amount: order.amount,
      timestamp: new Date()
    });
    res.json({ success: true, message: 'Payment status updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get orders for the logged-in user
export const getMyOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({ userId: req.user.id });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Buyer confirms receipt of items
const confirmReceipt = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.user.id || req.user._id;

        // Find the order and verify it belongs to the user
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only confirm receipt of your own orders'
            });
        }

        // Check if order is delivered
        if (order.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'You can only confirm receipt of delivered orders'
            });
        }

        // Check if receipt is already confirmed
        if (order.receiptConfirmed) {
            return res.status(400).json({
                success: false,
                message: 'Receipt has already been confirmed for this order'
            });
        }

        // Update order with receipt confirmation
        order.receiptConfirmed = true;
        order.receiptConfirmedAt = new Date();
        
        // Schedule payment release for 24 hours from now
        const paymentReleaseDate = new Date();
        paymentReleaseDate.setHours(paymentReleaseDate.getHours() + 24);
        order.paymentReleaseScheduled = true;
        order.paymentReleaseDate = paymentReleaseDate;

        await order.save();

        // Create activity log
        await ActivityLog.create({
            userId: new mongoose.Types.ObjectId(userId),
            user: new mongoose.Types.ObjectId(userId),
            userModel: 'user',
            action: 'Confirmed receipt of order',
            actionType: 'receipt_confirmed',
            description: `Order #${orderId} receipt confirmed. Payment will be released to seller after 24 hours.`,
            relatedId: orderId,
            relatedModel: 'order',
            status: 'Receipt Confirmed',
            amount: order.amount,
            timestamp: new Date()
        });

        // Notify user about payment release schedule
        await createNotification(
            userId,
            'user',
            'receipt_confirmed',
            `Thank you for confirming receipt of your order #${orderId}. Payment will be automatically released to the seller after 24 hours if no issues are reported.`,
            orderId
        );

        // Notify sellers about receipt confirmation
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
                'receipt_confirmed',
                `Order #${orderId} containing your products (${products.join(', ')}) has been confirmed received by the buyer. Payment will be released after 24 hours.`,
                orderId
            );
        }

        res.json({
            success: true,
            message: 'Receipt confirmed successfully. Payment will be released to seller after 24 hours.',
            paymentReleaseDate: paymentReleaseDate
        });

    } catch (error) {
        console.error('Error confirming receipt:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to confirm receipt'
        });
    }
};

export {verifyRazorpay, verifyStripe ,placeOrder, placeOrderStripe, placeOrderRazorpay, allOrders, userOrders, updateStatus, calculateDeliveryFee, getSellerOrders, updatePaymentStatusBySeller, confirmReceipt}
