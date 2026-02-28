import express from 'express';
import orderModel from '../models/orderModel.js';

const router = express.Router();

router.get('/analytics', async (req, res) => {
    try {
        const salesByDate = await orderModel.aggregate([
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, totalSales: { $sum: "$amount" } } },
            { $sort: { _id: 1 } }
        ]);

        const statusCounts = await orderModel.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        res.json({ salesByDate, statusCounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
