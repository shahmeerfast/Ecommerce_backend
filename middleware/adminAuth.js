import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'

const adminAuth = async (req,res,next) => {
    try {
        console.log('adminAuth: incoming headers:', req.headers);
        // Support both 'token' and 'authorization' headers
        let token = req.headers.token;
        if (!token && req.headers.authorization) {
            // Bearer <token>
            const parts = req.headers.authorization.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                token = parts[1];
            }
        }
        console.log('adminAuth: extracted token:', token);
        if (!token) {
            return res.status(401).json({ success: false, message: "Not Authorized Login Again" })
        }
        const decoded = jwt.verify(token,process.env.JWT_SECRET);
        console.log('adminAuth: decoded payload:', decoded);

        // Check for admin role in the token payload
        if (!decoded || decoded.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not Authorized Login Again" })
        }

        // Fetch the full admin user from the database
        const admin = await Admin.findById(decoded.id);
        if (!admin) {
            return res.status(401).json({ success: false, message: "Admin not found" });
        }

        req.user = admin; // Attach the full admin user object

        next()
    } catch (error) {
        console.log('adminAuth error:', error);
        res.status(401).json({ success: false, message: "Not Authorized Login Again" })
    }
}

export default adminAuth