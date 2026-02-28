import express from 'express';
import { getPaymentMethods, addPaymentMethod, deletePaymentMethod } from '../controllers/paymentMethodsController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication (user or seller)
router.get('/', isAuthenticated, getPaymentMethods);
router.post('/', isAuthenticated, addPaymentMethod);
router.delete('/:id', isAuthenticated, deletePaymentMethod);

export default router; 