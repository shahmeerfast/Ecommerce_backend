import { v2 as cloudinary } from "cloudinary"
import Product from '../models/Product.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import { createNotification } from './notificationController.js';
import ActivityLog from '../models/ActivityLog.js';
import userModel from '../models/userModel.js';

// function for add product
const addProduct = async (req, res) => {
    try {
        console.log('=== ADD PRODUCT DEBUG ===');
        console.log('Request body:', req.body);
        console.log('Files received:', req.files);
        console.log('User from token:', req.user);

        const { name, description, price, category, condition, subCategory, sizes, bestseller } = req.body;

        // Validate required fields
        if (!name || !description || !price || !category) {
            return res.status(400).json({
                success: false,
                message: "Name, description, price, and category are required"
            });
        }

        let imagesUrl = [];
        
        // Handle image uploads
        if (req.files && req.files.length > 0) {
            try {
                imagesUrl = await Promise.all(
                    req.files.map(async (file) => {
                        console.log('Processing file:', file.originalname);
                        console.log('File path:', file.path);
                        
                        const result = await cloudinary.uploader.upload(file.path, {
                            resource_type: 'image',
                            folder: 'products'
                        });
                        console.log('Cloudinary result:', result);
                        
                        if (!result || !result.secure_url) {
                            throw new Error('Failed to get secure URL from Cloudinary');
                        }
                        
                        return result.secure_url;
                    })
                );
                console.log('Uploaded image URLs:', imagesUrl);
            } catch (error) {
                console.error('Error uploading images:', error);
                return res.status(500).json({
                    success: false,
                    message: "Error uploading images: " + error.message
                });
            }
        }

        // Use a default image if no images were uploaded or if upload failed
        if (imagesUrl.length === 0) {
            imagesUrl = ['https://via.placeholder.com/300x200?text=No+Image'];
        }

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            condition: condition || 'new',
            subCategory: subCategory || category,
            bestseller: bestseller === "true",
            sizes: sizes ? JSON.parse(sizes) : ['S', 'M', 'L'],
            images: imagesUrl,
            seller: req.user.id,
            approvalStatus: 'pending',
            createdAt: new Date()
        };

        console.log('Creating product with data:', productData);

        const product = new Product(productData);
        await product.save();

        // Notify all admins about new product submission
        const admins = await Admin.find();
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'admin',
                'product_submission',
                `New product submitted: ${name} by seller ${req.user.id}`,
                product._id
            );
        }

        // Log to ActivityLog
        await ActivityLog.create({
            action: 'product_submission', // required field
            actionType: 'product_submission',
            description: `Product submitted: ${name} by seller ${req.user.id}`,
            user: req.user.id,
            userModel: 'seller',
            relatedId: product._id,
            relatedModel: 'product',
            status: 'pending',
            timestamp: new Date()
        });

        console.log('Product saved successfully:', product);
        console.log('=== END ADD PRODUCT DEBUG ===');

        res.status(201).json({
            success: true,
            message: "Product Added Successfully",
            product
        });

    } catch (error) {
        console.error('Error in addProduct:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Error adding product"
        });
    }
};

// function for list product
const listProducts = async (req, res) => {
    try {
        const products = await Product.find({})
          .populate('seller', 'fullName name email level');
        // Debug: log each product's seller field
        products.forEach((p, i) => {
          console.log(`Product[${i}]: name=${p.name}, seller=`, p.seller ? { fullName: p.seller.fullName, level: p.seller.level } : null);
        });
        // Ensure every product has a seller object with at least level and fullName
        const productsWithSeller = products.map(product => {
          let seller = product.seller;
          if (!seller || typeof seller !== 'object') {
            seller = {
              fullName: 'Unknown Seller',
              level: 'new'
            };
          }
          // Ensure seller is set on the returned object
          const prodObj = product.toObject ? product.toObject() : { ...product };
          prodObj.seller = seller;
          return prodObj;
        });
        res.json({ success: true, products: productsWithSeller });
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.body.id)
        res.json({success:true, message:"Product Removed"})
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('\n=== SINGLE PRODUCT DEBUG START ===');
        console.log('Request params:', req.params);
        console.log('Fetching product with ID:', id);

        // Check database connection
        console.log('Checking database connection...');
        const dbState = mongoose.connection.readyState;
        const dbStates = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        console.log('Database connection state:', dbStates[dbState]);

        if (dbState !== 1) {
            console.error('Database is not connected!');
            return res.status(500).json({
                success: false,
                message: "Database connection error",
                debug: { connectionState: dbStates[dbState] }
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log('Invalid MongoDB ObjectId format:', id);
            return res.status(400).json({
                success: false,
                message: "Invalid product ID format",
                debug: { providedId: id }
            });
        }

        // First check if the product exists without population
        console.log('Checking if product exists...');
        const exists = await Product.exists({ _id: id });
        console.log('Product exists check result:', exists);

        if (!exists) {
            console.log('Product not found in initial check');
            // List all products for debugging
            const allProducts = await Product.find({})
                .select('_id name approvalStatus category')
                .sort({ createdAt: -1 })
                .lean();
            
            console.log('Available products:', allProducts);
            
            return res.status(404).json({
                success: false,
                message: "Product not found",
                debug: {
                    searchedId: id,
                    totalProducts: allProducts.length,
                    availableIds: allProducts.map(p => ({
                        id: p._id.toString(),
                        name: p.name,
                        status: p.approvalStatus,
                        category: p.category
                    }))
                }
            });
        }

        // Log the query being made
        console.log('Product exists, fetching full details...');

        // Find the product and populate seller (include level)
        const product = await Product.findById(id).populate('seller', 'fullName email level').lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found after initial fetch",
                debug: { searchedId: id }
            });
        }

        // Attempt to populate seller and approver information
        let sellerInfo = null;
        if (product.seller && typeof product.seller === 'object') {
                    sellerInfo = {
                _id: product.seller._id ? product.seller._id.toString() : product.seller,
                fullName: product.seller.fullName || 'Unknown Seller',
                email: product.seller.email || undefined,
                level: product.seller.level || 'new'
            };
        } else {
            sellerInfo = {
                fullName: 'Unknown Seller',
                level: 'new'
            };
        }

        // Transform product for frontend
        const transformedProduct = {
            ...product,
            seller: sellerInfo
        };
        console.log('Transformed product:', JSON.stringify(transformedProduct, null, 2));
        console.log('=== SINGLE PRODUCT DEBUG END ===\n');
        res.json({ success: true, product: transformedProduct });
    } catch (error) {
        console.error('Error in singleProduct:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

// function for updating product
const updateProduct = async (req, res) => {
    try {
      console.log("Request Body: ", req.body);
  
      const { id, name, description, price, category, subCategory, sizes, bestseller } = req.body;
  
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
  
      product.name = name || product.name;
      product.description = description || product.description;
      product.price = price ? Number(price) : product.price;
      product.category = category || product.category;
      product.subCategory = subCategory || product.subCategory;
      product.sizes = sizes ? JSON.parse(sizes) : product.sizes;
      product.bestseller = bestseller ? bestseller === 'true' : product.bestseller;
  
      await product.save();
      res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
      console.log(error);
      res.json({ success: false, message: error.message });
    }
  };
  
  

// Get all products (only approved ones for public view)
const getProducts = async (req, res) => {
  try {
    const products = await Product.find({ approvalStatus: 'approved' })
      .sort({ createdAt: -1 })
      .lean();

    // Safely populate seller information
    const populatedProducts = await Promise.all(products.map(async (product) => {
      let sellerInfo = null;
      if (product.seller) {
        try {
          const seller = await User.findById(product.seller).select('fullName').lean();
          if (seller) {
            sellerInfo = {
              _id: seller._id.toString(),
              fullName: seller.fullName || 'Unknown Seller'
            };
          }
        } catch (error) {
          console.error('Error populating seller for product:', product._id, error);
        }
      }
      return { ...product, seller: sellerInfo };
    }));
    
    res.status(200).json({
      success: true,
      products: populatedProducts
    });
  } catch (error) {
    console.error('Error in getProducts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get pending products (for admin)
const getPendingProducts = async (req, res) => {
  try {
    const products = await Product.find({ approvalStatus: 'pending' })
      .sort({ createdAt: -1 })
      .lean();

    // Safely populate seller information
    const populatedProducts = await Promise.all(products.map(async (product) => {
      let sellerInfo = null;
      if (product.seller) {
        try {
          const seller = await User.findById(product.seller).select('fullName email').lean();
          if (seller) {
            sellerInfo = {
              _id: seller._id.toString(),
              fullName: seller.fullName || 'Unknown Seller',
              email: seller.email
            };
          }
        } catch (error) {
          console.error('Error populating seller for product:', product._id, error);
        }
      }
      return { ...product, seller: sellerInfo };
    }));
    
    res.status(200).json({
      success: true,
      products: populatedProducts
    });
  } catch (error) {
    console.error('Error in getPendingProducts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Approve or reject product (requires admin authentication)
const updateProductStatus = async (req, res) => {
  try {
    const { productId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const product = await Product.findById(productId).populate('seller');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.approvalStatus = status;
    product.approvedBy = req.user.id; // From auth middleware
    product.approvalDate = new Date();
    
    if (status === 'rejected' && rejectionReason) {
      product.rejectionReason = rejectionReason;
    }

    await product.save();

    // Send notification to seller
    const notificationMessage = status === 'approved'
      ? `Your product ${product.name} has been approved`
      : `Your product ${product.name} has been rejected. Reason: ${rejectionReason || 'No reason provided'}`;

    await createNotification(
      product.seller._id,
      'seller',
      'product_approval',
      notificationMessage,
      productId
    );

    // Log to ActivityLog
    console.log('About to log to ActivityLog:', {
      actionType: 'product_approval',
      description: `Product "${product.name}" ${status} by admin ${req.user.fullName || req.user.id}. Seller: ${product.seller.fullName || product.seller._id}`,
      user: req.user.id,
      userModel: 'admin',
      relatedId: product._id,
      relatedModel: 'product',
      status: status
    });
    await ActivityLog.create({
      action: 'product_approval', // required field
      actionType: 'product_approval',
      description: `Product "${product.name}" ${status} by admin ${req.user.fullName || req.user.id}. Seller: ${product.seller.fullName || product.seller._id}`,
      user: req.user.id,
      userModel: 'admin',
      relatedId: product._id,
      relatedModel: 'product',
      status: status
    });
    console.log('ActivityLog entry created successfully');

    res.status(200).json({
      success: true,
      message: `Product ${status} successfully`,
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating product status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get seller's products (including pending and rejected)
const getSellerProducts = async (req, res) => {
  try {
    console.log('\n=== GET SELLER PRODUCTS DEBUG START ===');
    
    // Validate user from request
    if (!req.user || !req.user.id) {
      console.error('No user found in request:', req.user);
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        debug: { user: req.user }
      });
    }

    console.log('User from token:', {
      id: req.user.id,
      role: req.user.role
    });
    
    // Validate seller ID format
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      console.error('Invalid seller ID format:', req.user.id);
      return res.status(400).json({
        success: false,
        message: 'Invalid seller ID format',
        debug: { sellerId: req.user.id }
      });
    }

    console.log('Searching for products with seller ID:', req.user.id);
    
    // Check database connection
    const dbState = mongoose.connection.readyState;
    console.log('Database connection state:', dbState);
    if (dbState !== 1) {
      return res.status(500).json({
        success: false,
        message: 'Database connection error',
        debug: { connectionState: dbState }
      });
    }

    // Find products first
    const products = await Product.find({ seller: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`Found ${products.length} products for seller`);

    // Try to get seller info, but don't fail if not found
    let sellerInfo = null;
    try {
      const seller = await User.findById(req.user.id).select('fullName email').lean();
      if (seller) {
        sellerInfo = {
          _id: seller._id.toString(),
          fullName: seller.fullName || 'Unknown Seller',
          email: seller.email
        };
        console.log('Found seller info:', sellerInfo);
      } else {
        console.log('Seller not found in database, using token info');
        sellerInfo = {
          _id: req.user.id,
          fullName: 'Unknown Seller',
          email: 'N/A'
        };
      }
    } catch (error) {
      console.error('Error fetching seller info:', error);
      // Use token info as fallback
      sellerInfo = {
        _id: req.user.id,
        fullName: 'Unknown Seller',
        email: 'N/A'
      };
    }

    // Transform products
    const transformedProducts = products.map(product => ({
      _id: product._id.toString(),
      name: product.name || '',
      description: product.description || '',
      price: typeof product.price === 'number' ? product.price : 0,
      category: product.category || '',
      subCategory: product.subCategory || product.category || '',
      sizes: Array.isArray(product.sizes) ? product.sizes : ['S', 'M', 'L'],
      bestseller: Boolean(product.bestseller),
      condition: product.condition || 'new',
      approvalStatus: product.approvalStatus || 'pending',
      images: Array.isArray(product.images) ? product.images : 
              product.images ? [product.images] : 
              product.image ? (Array.isArray(product.image) ? product.image : [product.image]) : 
              ['https://via.placeholder.com/400x400?text=No+Image'],
      createdAt: product.createdAt,
      approvalDate: product.approvalDate,
      seller: sellerInfo,
      averageRating: typeof product.averageRating === 'number' ? product.averageRating : 0,
      numReviews: typeof product.numReviews === 'number' ? product.numReviews : 0
    }));

    console.log('Successfully transformed products');
    console.log('=== GET SELLER PRODUCTS DEBUG END ===\n');
    
    return res.status(200).json({
      success: true,
      products: transformedProducts,
      debug: {
        sellerFound: !!sellerInfo,
        productCount: products.length,
        sellerId: req.user.id
      }
    });
  } catch (error) {
    console.error('\n=== GET SELLER PRODUCTS ERROR ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    console.error('=== ERROR END ===\n');
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching seller products',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      debug: {
        errorName: error.name,
        errorMessage: error.message,
        dbState: mongoose.connection.readyState
      }
    });
  }
};

// Update seller's product
const updateSellerProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, description, price, condition } = req.body;
    
    const product = await Product.findOne({ _id: productId, seller: req.user.id });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or you do not have permission to update it'
      });
    }

    // Update basic fields
    product.name = name || product.name;
    product.description = description || product.description;
    product.price = price || product.price;
    product.condition = condition || product.condition;

    // Update images if new ones are uploaded
    if (req.files && req.files.length > 0) {
      // Ensure image paths are properly formatted
      product.images = req.files.map(file => {
        const path = file.path.replace(/\\/g, '/');
        return path.startsWith('/') ? path : `/${path}`;
      });
    }

    // Set status back to pending if product was previously approved
    if (product.approvalStatus === 'approved') {
      product.approvalStatus = 'pending';
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete seller's product
const deleteSellerProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findOne({ _id: productId, seller: req.user.id });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or you do not have permission to delete it'
      });
    }

    await Product.deleteOne({ _id: productId });

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get products for admin by status
const getAdminProducts = async (req, res) => {
  try {
    const { status } = req.params;
    let query = {};
    
    // If status is specified and not 'all', add it to the query
    if (status && status !== 'all') {
      query.approvalStatus = status;
    }

    const products = await Product.find(query)
      .populate('seller', 'fullName email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all approved products
export const getApprovedProducts = async (req, res) => {
    try {
        const products = await Product.find({ 
            approvalStatus: 'approved' 
        }).populate('seller', 'fullName');

        res.status(200).json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error fetching approved products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// @desc    Get all products (with optional seller level filtering)
// @route   GET /api/product/list
// @access  Public or Protected (depending on your middleware)
const getAllProducts = async (req, res) => {
  try {
    const { level } = req.query;

    let products;

    if (level) {
      // If filtering by seller level
      const rawProducts = await Product.find()
        .populate({
          path: "seller",
          match: { level },
          select: "fullName email level",
        })
        .sort({ createdAt: -1 });

      // Remove products where seller doesn't match level
      products = rawProducts.filter(product => product.seller !== null);
    } else {
      // No filtering - return all products with seller info
      products = await Product.find()
        .populate("seller", "fullName email level")
        .sort({ createdAt: -1 });
    }

    res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Error fetching products:", error.message);
    res.status(500).json({
      success: false,
      message: "Server Error: Could not fetch products.",
        });
    }
};

export {
    listProducts,
    addProduct,
    removeProduct,
    singleProduct,
    updateProduct,
    getProducts,
    getPendingProducts,
    updateProductStatus,
    getSellerProducts,
    updateSellerProduct,
    deleteSellerProduct,
    getAdminProducts,
    getAllProducts
}

// Add review to a product
const addReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const { productId } = req.params;
        const userId = req.user.id;

        // Validate input
        if (!rating || !comment) {
            return res.status(400).json({
                success: false,
                message: "Rating and comment are required"
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Check if user has already reviewed this product
        const existingReview = product.reviews.find(
            review => review.user.toString() === userId
        );

        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: "You have already reviewed this product"
            });
        }

        // Add the review
        product.reviews.push({
            user: userId,
            rating,
            comment
        });

        // Save the product (this will trigger the pre-save hook to update averageRating)
        await product.save();

        res.status(201).json({
            success: true,
            message: "Review added successfully",
            reviews: product.reviews,
            averageRating: product.averageRating,
            numReviews: product.numReviews
        });

    } catch (error) {
        console.error('Error in addReview:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Error adding review"
        });
    }
};

// Get reviews for a product
const getReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Manually populate user for each review
        const populatedReviews = await Promise.all(
            product.reviews.map(async (review) => {
                let user = null;
                try {
                    user = await userModel.findById(review.user).select('fullName name email');
                } catch {}
                return {
                    ...review.toObject(),
                    user: user ? user.toObject() : null
                };
            })
        );

        res.status(200).json({
            success: true,
            reviews: populatedReviews,
            averageRating: product.averageRating,
            numReviews: product.numReviews
        });

    } catch (error) {
        console.error('Error in getReviews:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Error getting reviews"
        });
    }
};

// Update a review
const updateReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const { productId, reviewId } = req.params;
        const userId = req.user.id;

        // Validate input
        if (!rating || !comment) {
            return res.status(400).json({
                success: false,
                message: "Rating and comment are required"
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Find the review
        const review = product.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if the review belongs to the user
        if (review.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You can only update your own reviews"
            });
        }

        // Update the review
        review.rating = rating;
        review.comment = comment;

        // Save the product (this will trigger the pre-save hook to update averageRating)
        await product.save();

        res.status(200).json({
            success: true,
            message: "Review updated successfully",
            reviews: product.reviews,
            averageRating: product.averageRating,
            numReviews: product.numReviews
        });

    } catch (error) {
        console.error('Error in updateReview:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Error updating review"
        });
    }
};

// Delete a review
const deleteReview = async (req, res) => {
    try {
        const { productId, reviewId } = req.params;
        const userId = req.user.id;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Find the review
        const review = product.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        // Check if the review belongs to the user
        if (review.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own reviews"
            });
        }

        // Remove the review
        product.reviews.pull(reviewId);

        // Save the product (this will trigger the pre-save hook to update averageRating)
        await product.save();

        res.status(200).json({
            success: true,
            message: "Review deleted successfully",
            reviews: product.reviews,
            averageRating: product.averageRating,
            numReviews: product.numReviews
        });

    } catch (error) {
        console.error('Error in deleteReview:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Error deleting review"
        });
    }
};
// Export the review functions
export { addReview, getReviews, updateReview, deleteReview };
