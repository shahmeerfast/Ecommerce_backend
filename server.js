import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import { connectCloudinary } from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import router from './routes/chartRoute.js'
import authRoute from './routes/authRoute.js'
import sellerRoute from './routes/sellerRoute.js'
import aiChatRouter from './routes/aiChatRoute.js'
import notificationRoute from './routes/notificationRoute.js'
import testRoute from './test-route.js'
import settingsRoute from './routes/settingsRoute.js'
import messageRoute from './routes/messageRoute.js'
import activityLogRoute from './routes/activityLogRoute.js'
import analyticsRoute from './routes/analyticsRoute.js'
import categoryRoute from './routes/categoryRoute.js'
import paymentMethodsRoute from './routes/paymentMethodsRoute.js'
import paymentDistributionRoute from './routes/paymentDistributionRoute.js'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// App Config
const app = express()
const port = process.env.PORT || 4000
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Connect to MongoDB
connectDB().then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Connect to Cloudinary
connectCloudinary()

// middlewares
app.use(express.json())
app.use(cors())
app.use('/uploads', express.static('uploads'))

// api endpoints
app.use('/api/test', testRoute)
app.use('/api/auth', authRoute)
app.use('/api/user', userRouter)
app.use('/api/product', productRouter)
app.use('/api/cart', cartRouter)
app.use('/api/order', orderRouter)
app.use('/api', router)
app.use('/api/seller', sellerRoute)
app.use('/api/ai-chat', aiChatRouter)
app.use('/api/notifications', notificationRoute)
app.use('/api/settings', settingsRoute)
app.use('/api/messages', messageRoute)
app.use('/api/activity-logs', activityLogRoute)
app.use('/api/analytics', analyticsRoute)
app.use('/api/category', categoryRoute)
app.use('/api/payment-methods', paymentMethodsRoute)
app.use('/api/payment-distribution', paymentDistributionRoute)

console.log('✅ Notification routes should be mounted now');

app.get('/',(req,res)=>{
    res.send("API Working")
})

io.on('connection', (socket) => {
  socket.on('sendMessage', (msg) => {
    // Emit to receiver (could be improved with rooms)
    io.emit('newMessage', msg);
  });
});

server.listen(port, ()=> console.log('Server started on PORT : '+ port));