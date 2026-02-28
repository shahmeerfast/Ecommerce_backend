import Message from '../models/Message.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import mongoose from 'mongoose';

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { senderId, senderModel, receiverId, receiverModel, message, product, order } = req.body;
    if (!senderId || !senderModel || !receiverId || !receiverModel || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const newMessage = await Message.create({
      sender: senderId,
      senderModel,
      receiver: receiverId,
      receiverModel,
      message,
      product,
      order
    });
    res.status(201).json({ success: true, message: newMessage });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send message', error: err.message });
  }
};

// Get all messages between two users (buyer and seller)
export const getMessages = async (req, res) => {
  try {
    const { user1Id, user1Model, user2Id, user2Model, product, order } = req.query;
    if (!user1Id || !user1Model || !user2Id || !user2Model) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const filter = {
      $or: [
        { sender: user1Id, senderModel: user1Model, receiver: user2Id, receiverModel: user2Model },
        { sender: user2Id, senderModel: user2Model, receiver: user1Id, receiverModel: user1Model }
      ]
    };
    if (product) filter.product = product;
    if (order) filter.order = order;
    const messages = await Message.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get messages', error: err.message });
  }
};

// Mark messages as read
export const markAsRead = async (req, res) => {
  try {
    const { user1Id, user1Model, user2Id, user2Model, product } = req.body;
    const filter = {
      sender: user2Id,
      senderModel: user2Model,
      receiver: user1Id,
      receiverModel: user1Model,
      isRead: false
    };
    if (product) filter.product = product;
    await Message.updateMany(filter, { $set: { isRead: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark as read', error: err.message });
  }
};

// Get all conversations for the current user
export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const userModel = req.user.role === 'seller' ? 'seller' : 'user';
    // Find all messages where the user is sender or receiver
    const messages = await Message.find({
      $or: [
        { sender: userId, senderModel: userModel },
        { receiver: userId, receiverModel: userModel }
      ]
    }).sort({ createdAt: -1 });
    // Build a list of unique conversations
    const convMap = {};
    for (const msg of messages) {
      let otherId, otherModel, productId, productName;
      let isReceiver = (msg.receiver.toString() === userId.toString() && msg.receiverModel === userModel);
      if (msg.sender.toString() === userId.toString() && msg.senderModel === userModel) {
        otherId = msg.receiver;
        otherModel = msg.receiverModel;
      } else {
        otherId = msg.sender;
        otherModel = msg.senderModel;
      }
      const key = `${otherId}_${otherModel}_${msg.product || ''}`;
      if (!convMap[key]) {
        convMap[key] = {
          id: otherId,
          model: otherModel,
          productId: msg.product || null,
          name: '',
          productName: '',
          unreadCount: 0
        };
      }
      // Count unread messages for this conversation
      if (isReceiver && !msg.isRead) {
        convMap[key].unreadCount = (convMap[key].unreadCount || 0) + 1;
      }
    }
    // Fetch names for users/sellers and product names
    const convs = Object.values(convMap);
    for (const conv of convs) {
      if (conv.model === 'seller') {
        const seller = await Seller.findById(conv.id);
        conv.name = (seller && seller.fullName && seller.fullName !== 'Unknown')
          ? seller.fullName
          : (seller && seller.name)
            ? seller.name
            : (seller && seller.email)
              ? seller.email
              : 'Seller';
      } else {
        const userDoc = await User.findById(conv.id);
        const user = userDoc ? userDoc.toObject() : null;
        console.log('Fetched user object:', user);
        conv.name = (user && user.fullName && user.fullName.trim().toLowerCase() !== 'unknown')
          ? user.fullName
          : (user && user.name)
            ? user.name
            : (user && user.email)
              ? user.email
              : 'User';
        console.log('Final conversation name:', conv.name);
      }
      console.log('Conversation name for', conv.id, ':', conv.name);
      if (conv.productId) {
        const product = await (await import('../models/Product.js')).default.findById(conv.productId);
        conv.productName = product ? product.name : '';
      }
    }
    res.json({ success: true, conversations: convs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get conversations', error: err.message });
  }
};

// Get all conversations involving admin
// Get all admin ↔ user/seller conversations
export const getAdminConversations = async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderModel: 'admin' },
        { receiverModel: 'admin' }
      ]
    }).sort({ createdAt: -1 });

    const convMap = {};

    for (const msg of messages) {
      const isSenderAdmin = msg.senderModel === 'admin';

      const otherId = isSenderAdmin ? msg.receiver.toString() : msg.sender.toString();
      const otherModel = isSenderAdmin ? msg.receiverModel : msg.senderModel;
      const key = `${otherId}_${otherModel}`;

      if (!convMap[key]) {
        convMap[key] = {
          _id: {
            user: otherModel === 'user' ? otherId : null,
            seller: otherModel === 'seller' ? otherId : null
          },
          userName: null,
          sellerName: null,
          lastMessage: msg
        };
      }
    }

    const convList = Object.values(convMap);

    // Fetch names
    for (const conv of convList) {
      if (conv._id.user) {
        const user = await User.findById(conv._id.user);
        conv.userName = (user && user.fullName && user.fullName.trim().toLowerCase() !== 'unknown')
          ? user.fullName
          : (user && user.name)
            ? user.name
            : (user && Array.isArray(user.addresses) && user.addresses.length > 0 && user.addresses[0].name)
              ? user.addresses[0].name
              : (user && user.email)
                ? user.email.split('@')[0]
                : 'User';
      }
      if (conv._id.seller) {
        const seller = await Seller.findById(conv._id.seller);
        conv.sellerName = seller?.fullName || seller?.name || seller?.email || 'Seller';
      }
    }

    res.json(convList);
  } catch (err) {
    console.error('Error in getAdminConversations:', err.message);
    res.status(500).json({ error: err.message });
  }
};


// Get all messages between admin and a specific user/seller
export const getAdminThread = async (req, res) => {
  const { otherId, otherModel } = req.params;
  try {
    const messages = await Message.find({
      $or: [
        { senderModel: 'admin', receiver: otherId, receiverModel: otherModel },
        { sender: otherId, senderModel: otherModel, receiverModel: 'admin' }
      ]
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Send a message as admin
export const sendAdminMessage = async (req, res) => {
  const { userId, sellerId, message } = req.body;
  try {
    const adminId = req.user?._id; // Make sure adminAuth sets req.user
    if (!adminId) {
      return res.status(401).json({ error: 'Admin authentication required.' });
    }
    const results = [];
    if (userId) {
      const newMsgToUser = await Message.create({
        sender: adminId,
        senderModel: 'admin',
        receiver: userId,
        receiverModel: 'user',
        message,
        createdAt: new Date()
      });
      results.push(newMsgToUser);
    }
    if (sellerId) {
      const newMsgToSeller = await Message.create({
        sender: adminId,
        senderModel: 'admin',
        receiver: sellerId,
        receiverModel: 'seller',
        message,
        createdAt: new Date()
      });
      results.push(newMsgToSeller);
    }
    if (results.length === 0) {
      return res.status(400).json({ error: 'No valid userId or sellerId provided.' });
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all buyer-seller conversations (for admin monitoring)
export const getAllConversations = async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderModel: 'user', receiverModel: 'seller' },
            { senderModel: 'seller', receiverModel: 'user' }
          ]
        }
      },
      {
        $group: {
          _id: {
            user: {
              $cond: [
                { $eq: ['$senderModel', 'user'] },
                '$sender',
                '$receiver'
              ]
            },
            seller: {
              $cond: [
                { $eq: ['$senderModel', 'seller'] },
                '$sender',
                '$receiver'
              ]
            }
          },
          lastMessage: { $last: '$$ROOT' }
        }
      },
      // Lookup user name
      {
        $lookup: {
          from: 'users',
          localField: '_id.user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $lookup: {
          from: 'sellers',
          localField: '_id.seller',
          foreignField: '_id',
          as: 'sellerInfo'
        }
      },
      {
        $addFields: {
          userName: { $arrayElemAt: ['$userInfo.name', 0] },
          sellerName: { $arrayElemAt: ['$sellerInfo.fullName', 0] }
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all messages between a user and seller (for admin monitoring)
export const getThread = async (req, res) => {
  const { userId, sellerId } = req.params;
  try {
    const userObjId = mongoose.Types.ObjectId(userId);
    const sellerObjId = mongoose.Types.ObjectId(sellerId);
    console.log('getThread userId:', userId, typeof userId, 'userObjId:', userObjId, typeof userObjId);
    console.log('getThread sellerId:', sellerId, typeof sellerId, 'sellerObjId:', sellerObjId, typeof sellerObjId);
    const adminId = req.user?._id;
    const messages = await Message.find({
      $or: [
        // User <-> Seller messages
        { sender: userObjId, receiver: sellerObjId },
        { sender: sellerObjId, receiver: userObjId },
        // Admin messages to user or seller
        { senderModel: 'admin', receiver: userObjId, receiverModel: 'user' },
        { senderModel: 'admin', receiver: userId, receiverModel: 'user' },
        { senderModel: 'admin', receiver: sellerObjId, receiverModel: 'seller' },
        { senderModel: 'admin', receiver: sellerId, receiverModel: 'seller' },
        // Admin messages sent to either user or seller (broadcast)
        { senderModel: 'admin', receiverModel: { $in: ['user', 'seller'] }, receiver: { $in: [userObjId, sellerObjId, userId, sellerId] } }
      ]
    }).sort({ createdAt: 1 });
    console.log('getThread userId:', userId, 'sellerId:', sellerId, 'messages:', messages);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin sends a message in a user-seller thread
export const adminSendMessage = async (req, res) => {
  const { userId, sellerId, message } = req.body;
  try {
    const adminId = req.user?._id; // Make sure adminAuth sets req.user
    if (!adminId) {
      return res.status(401).json({ error: 'Admin authentication required.' });
    }
    // Send to user
    const newMsgToUser = await Message.create({
      sender: adminId,
      senderModel: 'admin',
      receiver: userId,
      receiverModel: 'user',
      message,
      createdAt: new Date()
    });
    // Send to seller
    const newMsgToSeller = await Message.create({
      sender: adminId,
      senderModel: 'admin',
      receiver: sellerId,
      receiverModel: 'seller',
      message,
      createdAt: new Date()
    });
    res.json([newMsgToUser, newMsgToSeller]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 