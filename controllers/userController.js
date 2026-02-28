import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'
import userModel from "../models/userModel.js";
import Admin from '../models/Admin.js';
import { createNotification } from '../controllers/notificationController.js';
import ActivityLog from '../models/ActivityLog.js';
import { cloudinary } from '../config/cloudinary.js';
import orderModel from '../models/orderModel.js';
import Message from '../models/Message.js';

const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET)
}

// Route for user login
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: "User doesn't exists" })
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            const token = createToken(user._id)
            // Log activity
            await ActivityLog.create({
                userId: user._id,
                user: user._id,
                userModel: 'user',
                action: 'Logged in',
                actionType: 'user_login',
                description: `User ${user.name || user.email} logged in successfully`,
                relatedId: user._id,
                relatedModel: 'user',
                status: 'success',
                timestamp: new Date()
            });
            res.json({ success: true, token })
        }
        else {
            res.json({ success: false, message: 'Invalid credentials' })
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {
        const { name, email, password, role, phone } = req.body;

        // Prevent creating user with admin role
        if (role === 'admin') {
            return res.status(403).json({ success: false, message: "Cannot assign admin role to user" });
        }

        // checking user already exists or not
        const exists = await userModel.findOne({ email });
        if (exists) {
            return res.json({ success: false, message: "User already exists" })
        }

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!strongPasswordRegex.test(password)) {
            return res.json({ success: false, message: "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character." })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({
            name,
            fullName: name, // Ensure fullName is set to the real name
            email,
            phone, // Save phone number if provided
            password: hashedPassword,
            role: role || 'user'
        })

        const user = await newUser.save()

        // Notify all admins about new user registration
        const admins = await Admin.find();
        for (const admin of admins) {
            await createNotification(
                admin._id,
                'admin',
                'new_registration',
                `New user registered: ${name} (${email})`,
                user._id
            );
        }

        await ActivityLog.create({
            action: 'user_registration', // required field
            actionType: 'user_registration',
            description: `User registered: ${name} (${email})`,
            user: user._id,
            userModel: 'user',
            relatedId: user._id,
            relatedModel: 'user',
            status: 'registered'
        });

        const token = createToken(user._id)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for admin login
const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Find admin in database
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.json({ success: false, message: 'Admin not found' });
        }
        // Check password
        const isMatch = password === process.env.ADMIN_PASSWORD || (admin.password && password === admin.password);
        if (!isMatch) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        const token = jwt.sign(email + password, process.env.JWT_SECRET);
        console.log('Admin object in adminLogin:', admin);
        res.json({ 
          success: true, 
          token, 
          user: {
            id: admin._id,
            fullName: admin.fullName,
            email: admin.email,
            role: admin.role,
            profileImage: admin.profileImage
          }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Function to fetch all users
 const fetchAllUsers = async (req, res) => {
    try {
        const users = await userModel.find({}, { password: 0 });
        console.log("Fetched users:", users); // Log users to debug
        res.json({ success: true, users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
};

// Function to delete a user
const deleteUser = async (req, res) => {
    try {
        const { email } = req.body; // Expecting email in the request body

        const user = await userModel.findOneAndDelete({ email }); // Find and delete by email
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Failed to delete user' });
    }
};


const addUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        // Prevent creating user with admin role
        if (role === 'admin') {
            return res.status(403).json({ success: false, message: "Cannot assign admin role to user" });
        }
        const exists = await userModel.findOne({ email });
        if (exists) {
            return res.json({ success: false, message: "User already exists" });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new userModel({
            name,
            email,
            password: hashedPassword,
            role: role || 'user'
        });
        await newUser.save();
        res.json({ success: true, message: "User added successfully" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'profile_images',
      resource_type: 'image'
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email, profileImage } = req.body;
    const userId = req.user.id;

    // Try to update in userModel
    let user = await userModel.findByIdAndUpdate(
      userId,
      { name, email, profileImage },
      { new: true }
    );

    // If not found, try Admin (use fullName and profileImage)
    if (!user) {
      // Try by _id
      user = await Admin.findByIdAndUpdate(
        userId,
        { fullName: name, email, profileImage },
        { new: true }
      );
      // If still not found, try by email
      if (!user && email) {
        user = await Admin.findOneAndUpdate(
          { email },
          { fullName: name, email, profileImage },
          { new: true }
        );
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Log activity
    await ActivityLog.create({
      userId: user._id || user.id || userId,
      user: user._id || user.id || userId,
      userModel: 'user',
      action: 'Updated profile',
      actionType: 'profile_update',
      description: `User ${user.name || user.fullName || user.email} updated their profile`,
      relatedId: user._id || user.id || userId,
      relatedModel: 'user',
      status: 'success',
      timestamp: new Date()
    });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Admin: Update any user by ID
export const adminUpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, profileImage, status } = req.body;
    // Only allow admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    // Prevent updating user to admin role
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: "Cannot assign admin role to user" });
    }
    const updatedUser = await userModel.findByIdAndUpdate(
      id,
      { name, email, role, profileImage, status },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

// Admin: Delete any user by ID
export const adminDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    // Only allow admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const deletedUser = await userModel.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

export const getProfile = async (req, res) => {
  console.log('getProfile called, userId:', req.user.id);
  try {
    const userId = req.user.id;
    let user = await userModel.findById(userId);
    if (!user) {
      user = await Admin.findById(userId);
    }
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log('getProfile user:', user);
    res.json({ success: true, user });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

// Address Management
export const addAddress = async (req, res) => {
    try {
        const { name, phone, address, city, state, postalCode, country = 'Nigeria', isDefault = false } = req.body;
        const userId = req.user.id;

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // If this is the first address or isDefault is true, set it as default
        if (user.addresses.length === 0 || isDefault) {
            // Set all existing addresses to non-default
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        const newAddress = {
            name,
            phone,
            address,
            city,
            state,
            postalCode,
            country,
            isDefault: user.addresses.length === 0 || isDefault
        };

        user.addresses.push(newAddress);
        await user.save();

        res.status(201).json({
            success: true,
            message: 'Address added successfully',
            address: newAddress
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ success: false, message: 'Error adding address', error: error.message });
    }
};

export const getAddresses = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await userModel.findById(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            addresses: user.addresses
        });
    } catch (error) {
        console.error('Error getting addresses:', error);
        res.status(500).json({ success: false, message: 'Error getting addresses', error: error.message });
    }
};

export const updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const { name, phone, address, city, state, postalCode, country, isDefault } = req.body;
        const userId = req.user.id;

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        // If setting this address as default, unset others
        if (isDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        // Update the address
        user.addresses[addressIndex] = {
            ...user.addresses[addressIndex],
            name,
            phone,
            address,
            city,
            state,
            postalCode,
            country,
            isDefault
        };

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            address: user.addresses[addressIndex]
        });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ success: false, message: 'Error updating address', error: error.message });
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.id;

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        // Remove the address
        user.addresses.splice(addressIndex, 1);

        // If we deleted the default address and there are other addresses, set the first one as default
        if (user.addresses.length > 0 && !user.addresses.some(addr => addr.isDefault)) {
            user.addresses[0].isDefault = true;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Address deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ success: false, message: 'Error deleting address', error: error.message });
    }
};

export const setDefaultAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.id;

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Set all addresses to non-default
        user.addresses.forEach(addr => addr.isDefault = false);

        // Set the specified address as default
        const address = user.addresses.find(addr => addr._id.toString() === addressId);
        if (!address) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        address.isDefault = true;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Default address updated successfully'
        });
    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).json({ success: false, message: 'Error setting default address', error: error.message });
    }
};

// Admin: Get complete user history (orders, messages)
export const getUserHistory = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { userId } = req.params;
    // Orders for this user
    const orders = await orderModel.find({ userId }).sort({ date: -1 });
    // Messages where user is sender or receiver
    const messages = await Message.find({
      $or: [
        { sender: userId, senderModel: 'user' },
        { receiver: userId, receiverModel: 'user' }
      ]
    }).sort({ createdAt: -1 });
    res.json({ success: true, orders, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user history', error: error.message });
  }
};

export { loginUser, registerUser, adminLogin,fetchAllUsers,deleteUser,addUser }