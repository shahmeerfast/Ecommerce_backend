import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';

// Helper to convert timestamp to YYYY-MM
function toYearMonth(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Get summary: total sales, total orders, total users
export const getSummary = async (req, res) => {
  try {
    const orders = await Order.find();
    const totalSales = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const totalOrders = orders.length;
    const totalUsers = await User.countDocuments();
    res.json({
      totalSales,
      totalOrders,
      totalUsers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Orders per month (last 12 months)
export const getOrdersOverTime = async (req, res) => {
  try {
    const since = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const orders = await Order.find({ date: { $gte: since } });
    const counts = {};
    orders.forEach(o => {
      const ym = toYearMonth(o.date);
      counts[ym] = (counts[ym] || 0) + 1;
    });
    const result = Object.entries(counts).map(([k, v]) => ({ _id: k, count: v }));
    result.sort((a, b) => a._id.localeCompare(b._id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Revenue per month (last 12 months)
export const getRevenueOverTime = async (req, res) => {
  try {
    const since = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const orders = await Order.find({ date: { $gte: since } });
    const sums = {};
    orders.forEach(o => {
      const ym = toYearMonth(o.date);
      sums[ym] = (sums[ym] || 0) + (o.amount || 0);
    });
    const result = Object.entries(sums).map(([k, v]) => ({ _id: k, total: v }));
    result.sort((a, b) => a._id.localeCompare(b._id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Top 5 products by quantity sold (from items array)
export const getTopProducts = async (req, res) => {
  try {
    const orders = await Order.find();
    const productSales = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const pid = item.productId || item.product || item._id;
        if (!pid) return;
        productSales[pid] = (productSales[pid] || 0) + (item.quantity || 1);
      });
    });
    // Get product info
    const sorted = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const products = await Product.find({ _id: { $in: sorted.map(([id]) => id) } });
    const result = sorted.map(([id, totalSold]) => {
      const prod = products.find(p => p._id.toString() === id.toString());
      return { productId: id, name: prod ? prod.name : id, totalSold };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// User signups over time (not available, no createdAt field)
export const getUserSignupsOverTime = async (req, res) => {
  try {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);

    const users = await User.find({ createdAt: { $gte: since } });
    const counts = {};
    users.forEach(u => {
      const ym = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, '0')}`;
      counts[ym] = (counts[ym] || 0) + 1;
    });
    const result = Object.entries(counts).map(([k, v]) => ({ _id: k, count: v }));
    result.sort((a, b) => a._id.localeCompare(b._id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 