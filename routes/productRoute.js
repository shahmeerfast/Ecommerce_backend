import express from 'express'
import { listProducts, addProduct, removeProduct, singleProduct, updateProduct, getProducts, getPendingProducts, updateProductStatus, getSellerProducts, updateSellerProduct, deleteSellerProduct, getAdminProducts, getApprovedProducts, addReview, getReviews, updateReview, deleteReview, getAllProducts } from '../controllers/productController.js'
import multer from 'multer'
import { isAuthenticated, isAdmin, isSeller } from '../middleware/auth.js'

const router = express.Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop())
  }
})

const upload = multer({ storage: storage })

// Public routes
router.get('/list', getAllProducts) // Get all products with optional seller level filtering
router.get('/product/:id', singleProduct) // Get single product details
router.get('/approved', getApprovedProducts)

// Review routes
router.get('/product/:productId/reviews', getReviews) // Get all reviews for a product
router.post('/product/:productId/reviews', isAuthenticated, addReview) // Add a review
router.put('/product/:productId/reviews/:reviewId', isAuthenticated, updateReview) // Update a review
router.delete('/product/:productId/reviews/:reviewId', isAuthenticated, deleteReview) // Delete a review

// Add fallback route for /:productId/reviews to support direct product review fetch
router.get('/:productId/reviews', getReviews);

// Seller routes
router.get('/seller/products', isAuthenticated, isSeller, getSellerProducts)
router.put('/seller/update/:productId', isAuthenticated, isSeller, upload.array('images', 4), updateSellerProduct)
router.delete('/seller/delete/:productId', isAuthenticated, isSeller, deleteSellerProduct)
router.post('/seller/add', isAuthenticated, isSeller, upload.array('images', 4), addProduct)

// Admin routes
router.get('/admin/pending', isAuthenticated, isAdmin, getPendingProducts)
router.get('/admin/:status', isAuthenticated, isAdmin, getAdminProducts)
router.put('/admin/product/:productId/status', isAuthenticated, isAdmin, updateProductStatus)
router.delete('/admin/product/:productId', isAuthenticated, isAdmin, removeProduct)

export default router