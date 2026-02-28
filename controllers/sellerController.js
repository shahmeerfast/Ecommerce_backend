import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';
import { createNotification } from './notificationController.js';
import ActivityLog from '../models/ActivityLog.js';
import { cloudinary } from '../config/cloudinary.js';
import orderModel from '../models/orderModel.js';
import Product from '../models/Product.js';
import { Parser } from 'json2csv'; // If not installed, fallback to manual CSV string
import Payout from '../models/payoutModel.js';
import Message from '../models/Message.js';

export const register = async (req, res) => {
  try {
    const {
      fullName,
      age,
      email,
      phone,
      username,
      password,
      country,
      state,
      streetAddress,
      zipCode,
      businessRegNumber,
      bankDetails,
      pickupAddress,
      pickupLat,
      pickupLng,
    } = req.body;

    // Check if email or username already exists
    const existingUser = await Seller.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email ? 'Email already registered' : 'Username already taken'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Get file paths
    const governmentIdPath = req.files?.governmentId?.[0]?.path;
    const passportPath = req.files?.passport?.[0]?.path;
    const selfiePath = req.files?.selfie?.[0]?.path;

    // Reconstruct bankDetails from flat fields (for FormData)
    const reconstructedBankDetails = {
      accountHolderName: req.body['bankDetails.accountHolderName'],
      bankName: req.body['bankDetails.bankName'],
      accountNumber: req.body['bankDetails.accountNumber'],
      bankBranch: req.body['bankDetails.bankBranch'],
      ifscSwiftCode: req.body['bankDetails.ifscSwiftCode'],
      bankCountry: req.body['bankDetails.bankCountry'],
    };

    // Create new seller
    const seller = new Seller({
      fullName,
      age,
      email,
      phone,
      username,
      password: hashedPassword,
      country,
      state,
      streetAddress,
      zipCode,
      governmentId: governmentIdPath,
      passport: passportPath,
      selfie: selfiePath,
      businessRegNumber,
      bankDetails: reconstructedBankDetails,
      pickupAddress,
      pickupLat,
      pickupLng,
      isVerified: false // Admin needs to verify the seller
    });

    await seller.save();

    // Notify all admins about new seller registration
    const admins = await Admin.find();
    for (const admin of admins) {
        await createNotification(
            admin._id,
            'admin',
            'new_registration',
            `New seller registration: ${fullName} (${email})`,
            seller._id
        );
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: seller._id,
        role: 'seller',
        isVerified: seller.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    await ActivityLog.create({
      action: 'seller_registration', // required field
      actionType: 'seller_registration',
      description: `Seller registered: ${fullName} (${email})`,
      user: seller._id,
      userModel: 'seller',
      relatedId: seller._id,
      relatedModel: 'seller',
      status: 'registered'
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please wait for admin verification.',
      token,
      user: {
        id: seller._id,
        fullName: seller.fullName,
        email: seller.email,
        username: seller.username,
        role: 'seller',
        isVerified: seller.isVerified
      }
    });
  } catch (error) {
    console.error('Seller Registration Error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin: List all sellers
export const adminListSellers = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const sellers = await Seller.find({}, { password: 0 });
    res.json({ success: true, sellers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
  }
};

// Admin: Add a seller (no file upload, minimal fields)
export const adminAddSeller = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { fullName, age, email, phone, username, password, country, state, streetAddress, zipCode, businessRegNumber, bankDetails, pickupAddress, pickupLat, pickupLng } = req.body;
    const exists = await Seller.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Email or username already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const seller = new Seller({
      fullName, age, email, phone, username, password: hashedPassword, country, state, streetAddress, zipCode, businessRegNumber, bankDetails, pickupAddress, pickupLat, pickupLng, isVerified: false, isActive: true
    });
    await seller.save();
    res.json({ success: true, message: 'Seller added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add seller' });
  }
};

// Admin: Edit a seller
export const adminEditSeller = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const update = req.body;
    if (update.password) {
      const salt = await bcrypt.genSalt(10);
      update.password = await bcrypt.hash(update.password, salt);
    }
    // Ensure level is included if present
    if (typeof update.level !== 'undefined') {
      update.level = update.level;
    }
    console.log('Updating seller with:', update);
    const seller = await Seller.findByIdAndUpdate(id, update, { new: true });
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, seller });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update seller' });
  }
};

// Admin: Delete a seller
export const adminDeleteSeller = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { id } = req.params;
    const seller = await Seller.findByIdAndDelete(id);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, message: 'Seller deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete seller' });
  }
};

// Admin: Get complete seller history (orders, payouts, products)
export const getSellerHistory = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { sellerId } = req.params;
    // Orders where any item belongs to this seller
    const orders = await orderModel.find({ 'items.sellerId': sellerId }).sort({ date: -1 });
    // Payouts for this seller
    const payouts = await Payout.find({ sellerId }).sort({ createdAt: -1 });
    // Products by this seller
    const products = await Product.find({ seller: sellerId }).sort({ createdAt: -1 });
    res.json({ success: true, orders, payouts, products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch seller history', error: error.message });
  }
};

export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user._id || req.user.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, seller });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch seller profile', error: err.message });
  }
};

export const updateSellerProfile = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const { name, fullName, email, phone, profileImage, password, businessRegNumber, streetAddress, state, country, zipCode, bankDetails } = req.body;
    const updateFields = {};
    if (name) updateFields.name = name;
    if (fullName) updateFields.fullName = fullName;
    if (email) updateFields.email = email;
    if (phone) updateFields.phone = phone;
    if (profileImage) updateFields.profileImage = profileImage;
    if (password) updateFields.password = password; // Assume password is hashed in a pre-save hook
    if (businessRegNumber) updateFields.businessRegNumber = businessRegNumber;
    if (streetAddress) updateFields.streetAddress = streetAddress;
    if (state) updateFields.state = state;
    if (country) updateFields.country = country;
    if (zipCode) updateFields.zipCode = zipCode;
    // Handle structured bank details
    if (bankDetails) {
      updateFields.bankDetails = {};
      if (bankDetails.accountHolderName) updateFields.bankDetails['accountHolderName'] = bankDetails.accountHolderName;
      if (bankDetails.bankName) updateFields.bankDetails['bankName'] = bankDetails.bankName;
      if (bankDetails.accountNumber) updateFields.bankDetails['accountNumber'] = bankDetails.accountNumber;
      if (bankDetails.bankBranch) updateFields.bankDetails['bankBranch'] = bankDetails.bankBranch;
      if (bankDetails.ifscSwiftCode) updateFields.bankDetails['ifscSwiftCode'] = bankDetails.ifscSwiftCode;
      if (bankDetails.bankCountry) updateFields.bankDetails['bankCountry'] = bankDetails.bankCountry;
    }
    const seller = await Seller.findByIdAndUpdate(sellerId, updateFields, { new: true });
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, seller });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update seller profile', error: err.message });
  }
};

export const uploadSellerProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'profile_images',
      resource_type: 'image',
    });
    const imageUrl = result.secure_url;
    res.json({ success: true, url: imageUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to upload image', error: err.message });
  }
};

// Seller Analytics: Overview (all-time)
export const getSellerAnalyticsOverview = async (req, res) => {
  try {
    const sellerId = req.user.id || req.user._id;
    // Find all orders containing this seller's products
    const orders = await orderModel.find({ "items.sellerId": sellerId });
    let totalSales = 0, totalOrders = 0, totalRevenue = 0;
    orders.forEach(order => {
      totalOrders++;
      (order.items || []).forEach(item => {
        if (item.sellerId?.toString() === sellerId.toString()) {
          totalSales += item.quantity || 1;
          totalRevenue += (item.price || 0) * (item.quantity || 1);
        }
      });
    });
    res.json({ totalSales, totalOrders, totalRevenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Seller Analytics: Product Performance (all-time)
export const getSellerProductPerformance = async (req, res) => {
  try {
    const sellerId = req.user.id || req.user._id;
    // Get all products for this seller
    const products = await Product.find({ seller: sellerId });
    // Aggregate sales for each product
    const orders = await orderModel.find({ "items.sellerId": sellerId });
    const productSales = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        if (item.sellerId?.toString() === sellerId.toString()) {
          const pid = item._id?.toString() || item.productId?.toString();
          if (!pid) return;
          productSales[pid] = (productSales[pid] || 0) + (item.quantity || 1);
        }
      });
    });
    // Map to product info
    const result = products.map(prod => ({
      productId: prod._id,
      name: prod.name,
      totalSold: productSales[prod._id.toString()] || 0
    }));
    // Sort for best/least performing
    result.sort((a, b) => b.totalSold - a.totalSold);
    res.json({ best: result.slice(0, 5), least: result.slice(-5).reverse(), all: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Seller Analytics: Export as CSV
export const exportSellerAnalyticsCSV = async (req, res) => {
  try {
    const sellerId = req.user.id || req.user._id;
    // Get all products for this seller
    const products = await Product.find({ seller: sellerId });
    // Aggregate sales for each product
    const orders = await orderModel.find({ "items.sellerId": sellerId });
    const productSales = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        if (item.sellerId?.toString() === sellerId.toString()) {
          const pid = item._id?.toString() || item.productId?.toString();
          if (!pid) return;
          productSales[pid] = (productSales[pid] || 0) + (item.quantity || 1);
        }
      });
    });
    // Prepare CSV data
    const csvRows = [
      ['Product Name', 'Product ID', 'Total Sold'],
      ...products.map(prod => [prod.name, prod._id, productSales[prod._id.toString()] || 0])
    ];
    const csvString = csvRows.map(row => row.join(',')).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('seller-analytics.csv');
    res.send(csvString);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};