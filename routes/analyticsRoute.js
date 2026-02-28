import express from 'express';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

router.get('/summary', analyticsController.getSummary);
router.get('/orders-over-time', analyticsController.getOrdersOverTime);
router.get('/revenue-over-time', analyticsController.getRevenueOverTime);
router.get('/top-products', analyticsController.getTopProducts);
router.get('/user-signups-over-time', analyticsController.getUserSignupsOverTime);

export default router; 