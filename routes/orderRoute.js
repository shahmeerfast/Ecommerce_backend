import express from 'express'
import {placeOrder, placeOrderStripe, placeOrderRazorpay, allOrders, userOrders, updateStatus, verifyStripe, verifyRazorpay, calculateDeliveryFee, getSellerOrders, updatePaymentStatusBySeller, getMyOrders, confirmReceipt} from '../controllers/orderController.js'
import adminAuth  from '../middleware/adminAuth.js'
import { isAuthenticated } from '../middleware/auth.js'

const orderRouter = express.Router()

// Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)

// Payment Features
orderRouter.post('/place', isAuthenticated, placeOrder)
orderRouter.post('/stripe', isAuthenticated, placeOrderStripe)
orderRouter.post('/razorpay', isAuthenticated, placeOrderRazorpay)

// User Feature 
orderRouter.post('/userorders', isAuthenticated, userOrders)

// verify payment
orderRouter.post('/verifyStripe', isAuthenticated, verifyStripe)
orderRouter.post('/verifyRazorpay', isAuthenticated, verifyRazorpay)

// Delivery Fee Calculation
orderRouter.post('/calculate-delivery-fee', calculateDeliveryFee)

// Seller Feature: update order status
orderRouter.post('/seller-status', isAuthenticated, updateStatus)

// Seller Feature: get seller orders
orderRouter.get('/seller-orders', isAuthenticated, getSellerOrders)

// Seller Feature: update payment status
orderRouter.post('/seller-payment-status', isAuthenticated, updatePaymentStatusBySeller)

// User Feature: get my orders
orderRouter.get('/my-orders', isAuthenticated, getMyOrders)

// User Feature: confirm receipt of delivered order
orderRouter.post('/confirm-receipt', isAuthenticated, confirmReceipt)

export default orderRouter