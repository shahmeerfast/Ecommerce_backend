import nodemailer from 'nodemailer';
import twilio from 'twilio';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Seller from '../models/Seller.js';
import Admin from '../models/Admin.js';
import { createNotification } from './notificationController.js';

dotenv.config();

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('Email configuration error:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store OTPs temporarily (in production, use Redis or similar)
const otpStore = new Map();

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Format phone number to E.164 format
const formatPhoneNumber = (phone) => {
  // Remove any non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Add country code if not present (assuming Pakistan +92)
  if (cleaned.startsWith('0')) {
    return '+92' + cleaned.substring(1);
  } else if (!cleaned.startsWith('92')) {
    return '+92' + cleaned;
  }
  return '+' + cleaned;
};

// Send Email OTP
const sendEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const otp = generateOTP();
    
    // Store OTP with email
    otpStore.set(email, {
      otp,
      timestamp: Date.now(),
      type: 'email'
    });

    try {
      // Always attempt to send email first
      await transporter.sendMail({
        from: `"E-Commerce Verification" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Email Verification OTP',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Email Verification</h2>
            <p>Your OTP for email verification is:</p>
            <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 2px;">${otp}</h1>
            <p>This OTP is valid for 10 minutes.</p>
            <p style="color: #666; font-size: 12px;">If you didn't request this OTP, please ignore this email.</p>
          </div>
        `
      });

      console.log('Email sent successfully to:', email);
      
      res.status(200).json({ 
        success: true, 
        message: 'OTP sent successfully to your email'
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);

      // Only fallback to console in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`\n=== Development Fallback ===`);
        console.log(`Email: ${email}`);
        console.log(`OTP: ${otp}`);
        console.log(`=========================\n`);
        
        return res.status(200).json({ 
          success: true, 
          message: 'Development Mode: Check console for OTP',
          otp: otp
        });
      }

      // In production, return error
      throw new Error('Failed to send email');
    }
  } catch (error) {
    console.error('Email OTP Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send OTP',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

// Send Phone OTP
const sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const otp = generateOTP();
    
    // Store OTP with phone
    otpStore.set(phone, {
      otp,
      timestamp: Date.now(),
      type: 'phone'
    });

    // Development mode or if there are Twilio limitations
    const useDevelopmentMode = process.env.NODE_ENV === 'development' || 
                              !process.env.TWILIO_PHONE_NUMBER?.startsWith('+1');

    if (useDevelopmentMode) {
      // Log OTP to console and send in response
      console.log(`\n=== Development Mode ===`);
      console.log(`Phone: ${phone}`);
      console.log(`OTP: ${otp}`);
      console.log(`=====================\n`);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Development Mode: Check console for OTP',
        otp: otp // Only in development mode
      });
    }

    // Production mode with Twilio
    try {
      const formattedPhone = formatPhoneNumber(phone);
      
      // Check if the number is in proper E.164 format
      if (!formattedPhone.match(/^\+\d{10,15}$/)) {
        throw new Error('Invalid phone number format');
      }

      await twilioClient.messages.create({
        body: `Your OTP for phone verification is: ${otp}. Valid for 10 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone
      });

      res.status(200).json({ 
        success: true, 
        message: 'OTP sent successfully'
      });
    } catch (twilioError) {
      console.error('Twilio Error:', twilioError);
      
      // Handle specific Twilio errors
      if (twilioError.code === 63038) { // Daily message limit exceeded
        console.log(`\n=== Fallback to Development Mode (Trial Limit Reached) ===`);
        console.log(`Phone: ${phone}`);
        console.log(`OTP: ${otp}`);
        console.log(`===============================================\n`);
        
        return res.status(200).json({ 
          success: true, 
          message: 'Trial limit reached - Check console for OTP',
          otp: otp
        });
      }
      
      // For other Twilio errors, fall back to development mode
      console.log(`\n=== Fallback to Development Mode ===`);
      console.log(`Phone: ${phone}`);
      console.log(`OTP: ${otp}`);
      console.log(`================================\n`);
      
      res.status(200).json({ 
        success: true, 
        message: 'Fallback to Development Mode: Check console for OTP',
        otp: otp
      });
    }
  } catch (error) {
    console.error('Phone OTP Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate OTP',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

// Verify Email OTP
const verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const storedData = otpStore.get(email);

    if (!storedData || storedData.type !== 'email') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP request' 
      });
    }

    // Check if OTP is expired (10 minutes)
    if (Date.now() - storedData.timestamp > 10 * 60 * 1000) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        message: 'OTP expired' 
      });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    // Clear OTP after successful verification
    otpStore.delete(email);

    res.status(200).json({ 
      success: true, 
      message: 'Email verified successfully' 
    });
  } catch (error) {
    console.error('Email Verification Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
};

// Verify Phone OTP
const verifyPhoneOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const storedData = otpStore.get(phone);

    if (!storedData || storedData.type !== 'phone') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP request' 
      });
    }

    // Check if OTP is expired (10 minutes)
    if (Date.now() - storedData.timestamp > 10 * 60 * 1000) {
      otpStore.delete(phone);
      return res.status(400).json({ 
        success: false, 
        message: 'OTP expired' 
      });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    // Clear OTP after successful verification
    otpStore.delete(phone);

    res.status(200).json({ 
      success: true, 
      message: 'Phone verified successfully' 
    });
  } catch (error) {
    console.error('Phone Verification Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
};

// Login handler
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // For seller login
    if (role === 'seller') {
      const seller = await Seller.findOne({ email });
      
      if (!seller) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const isPasswordValid = await bcrypt.compare(password, seller.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
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

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: seller._id,
          fullName: seller.fullName,
          email: seller.email,
          role: 'seller',
          isVerified: seller.isVerified
        }
      });
    } 
    // For admin login
    else if (role === 'admin') {
      const admin = await Admin.findOne({ email });
      
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const isPasswordValid = await bcrypt.compare(password, admin.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: admin._id,
          role: 'admin'
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: admin._id,
          fullName: admin.fullName,
          email: admin.email,
          role: 'admin',
          profileImage: admin.profileImage
        }
      });
    }
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin registration
const registerAdmin = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Check if email already exists
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Check if this is the first admin
        const adminCount = await Admin.countDocuments();
        const isFirstAdmin = adminCount === 0;

        // If not first admin, check if request is from an existing admin
        if (!isFirstAdmin && (!req.user || req.user.role !== 'admin')) {
            return res.status(403).json({
                success: false,
                message: 'Only existing admins can create new admin accounts'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new admin
        const admin = new Admin({
            fullName,
            email,
            password: hashedPassword,
            role: 'admin'
        });

        await admin.save();

        res.status(201).json({
            success: true,
            message: isFirstAdmin ? 'First admin registered successfully' : 'Admin registered successfully'
        });
    } catch (error) {
        console.error('Admin Registration Error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin login
const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find admin by email
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: admin._id,
                role: 'admin'
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: admin._id,
                fullName: admin.fullName,
                email: admin.email,
                role: 'admin',
                profileImage: admin.profileImage
            }
        });
    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Request password reset for seller
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;

        // Find seller by email
        const seller = await Seller.findOne({ email });
        if (!seller) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email'
            });
        }

        // Generate reset token
        const resetToken = jwt.sign(
            { id: seller._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Store reset token and expiry in seller document
        await Seller.findByIdAndUpdate(
            seller._id,
            {
                resetPasswordToken: resetToken,
                resetPasswordExpires: Date.now() + 3600000 // 1 hour
            },
            { new: true, runValidators: false }
        );

        // Ensure frontend URL is properly formatted
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink = new URL('/reset-password', baseUrl).toString() + `?token=${resetToken}`;
        
        try {
            await transporter.sendMail({
                from: `"E-Commerce Support" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Password Reset Request',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Password Reset Request</h2>
                        <p>You requested to reset your password. Click the link below to reset it:</p>
                        <p><a href="${resetLink}" style="color: #4CAF50; text-decoration: none; padding: 10px 20px; background-color: #f8f9fa; border: 1px solid #4CAF50; border-radius: 5px; display: inline-block; margin: 10px 0;">Reset Password</a></p>
                        <p>Or copy and paste this URL into your browser:</p>
                        <p style="word-break: break-all; color: #666;">${resetLink}</p>
                        <p>This link is valid for 1 hour.</p>
                        <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
                    </div>
                `
            });

            res.status(200).json({
                success: true,
                message: 'Password reset instructions sent to your email'
            });
        } catch (emailError) {
            console.error('Email sending error:', emailError);
            res.status(500).json({
                success: false,
                message: 'Failed to send reset email'
            });
        }
    } catch (error) {
        console.error('Password Reset Request Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process reset request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Reset password with token
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        // Verify token and find seller
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const seller = await Seller.findOne({
            _id: decoded.id,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!seller) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password and clear reset token fields
        await Seller.findByIdAndUpdate(
            seller._id,
            {
                password: hashedPassword,
                resetPasswordToken: undefined,
                resetPasswordExpires: undefined
            },
            { new: true, runValidators: false }
        );

        res.status(200).json({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        console.error('Password Reset Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export {
    sendEmailOTP,
    sendPhoneOTP,
    verifyEmailOTP,
    verifyPhoneOTP,
    login,
    registerAdmin,
    adminLogin,
    requestPasswordReset,
    resetPassword
};