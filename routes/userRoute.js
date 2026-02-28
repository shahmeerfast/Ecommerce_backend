import express from 'express';
import { loginUser,registerUser,adminLogin,fetchAllUsers,deleteUser,addUser, uploadProfileImage, updateProfile, adminUpdateUser, adminDeleteUser, getProfile, addAddress, getAddresses, updateAddress, deleteAddress, setDefaultAddress, getUserHistory } from '../controllers/userController.js';
import { isAuthenticated } from '../middleware/auth.js';
import upload from '../middleware/multer.js';

const userRouter = express.Router();

userRouter.post('/register',registerUser)
userRouter.post('/login',loginUser)
userRouter.post('/admin',adminLogin)
userRouter.get('/users',fetchAllUsers)
userRouter.post('/delete',deleteUser)
userRouter.post('/add',addUser)
userRouter.post('/upload-profile-image', isAuthenticated, upload.single('image'), uploadProfileImage);
userRouter.put('/profile', isAuthenticated, updateProfile);
userRouter.put('/admin/:id', isAuthenticated, adminUpdateUser);
userRouter.delete('/admin/:id', isAuthenticated, adminDeleteUser);
userRouter.get('/profile', isAuthenticated, getProfile);

// Address management routes
userRouter.post('/addresses', isAuthenticated, addAddress);
userRouter.get('/addresses', isAuthenticated, getAddresses);
userRouter.put('/addresses/:addressId', isAuthenticated, updateAddress);
userRouter.delete('/addresses/:addressId', isAuthenticated, deleteAddress);
userRouter.put('/addresses/:addressId/default', isAuthenticated, setDefaultAddress);

userRouter.get('/admin/history/:userId', isAuthenticated, getUserHistory);

export default userRouter;