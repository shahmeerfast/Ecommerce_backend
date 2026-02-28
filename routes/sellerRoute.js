import express from 'express';
import { register } from '../controllers/sellerController.js';
import multer from 'multer';
import { adminListSellers, adminAddSeller, adminEditSeller, adminDeleteSeller, getSellerProfile, updateSellerProfile, uploadSellerProfileImage, getSellerAnalyticsOverview, getSellerProductPerformance, exportSellerAnalyticsCSV, getSellerHistory } from '../controllers/sellerController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  }
});

const upload = multer({ storage: storage });

// Handle multiple file uploads
const uploadFields = upload.fields([
  { name: 'governmentId', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]);

// Register route with file upload
router.post('/register', uploadFields, register);

router.get('/admin/all', isAuthenticated, adminListSellers);
router.post('/admin/add', isAuthenticated, adminAddSeller);
router.put('/admin/:id', isAuthenticated, adminEditSeller);
router.delete('/admin/:id', isAuthenticated, adminDeleteSeller);
router.get('/admin/history/:sellerId', isAuthenticated, getSellerHistory);

router.get('/profile', isAuthenticated, getSellerProfile);
router.put('/profile', isAuthenticated, updateSellerProfile);
router.post('/upload-profile-image', upload.single('image'), uploadSellerProfileImage);

// Seller Analytics Endpoints
router.get('/analytics/overview', isAuthenticated, getSellerAnalyticsOverview);
router.get('/analytics/products', isAuthenticated, getSellerProductPerformance);
router.get('/analytics/export', isAuthenticated, exportSellerAnalyticsCSV);

export default router; 