// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http'; 
import chatRoutes from './routes/chat.js';  
import Message from './models/Message.js'; 
import Chat from './models/Chat.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: "http://localhost:5173", 
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/chat', chatRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Create HTTP server (required for Socket.IO)
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// ────────────────────────────── Socket.IO Setup ──────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

// Store active users (optional, for typing/online status later)
const activeUsers = new Map(); // socket.id → userId

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Optional: identify user
  socket.on('authenticate', (userId) => {
    activeUsers.set(socket.id, userId);
    console.log(`User ${userId} authenticated as ${socket.id}`);
  });

  // Join a specific chat room
  socket.on('join-chat', (chatId) => {
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat: ${chatId}`);
  });

  socket.on('leave-chat', (chatId) => {
    socket.leave(chatId);
  });

  // ────────────────────────── SEND MESSAGE (Real-time) ──────────────────────────
  socket.on('send-message', async (data) => {
    const { chatId, senderId, text, image } = data;

    try {
      // Create message in DB (this matches your /send-message route)
      const message = await Message.create({
        chat: chatId,
        sender: senderId,
        text: text || (image ? 'Photo' : ''),
        ...(image && { 
          image: {
            data: Buffer.from(image.split(',')[1], 'base64'), // if sending base64
            contentType: image.match(/data:(image\/[a-z]+);/)[1]
          }
        })
      });

      await message.populate('sender', 'username avatar');

      // Update chat's lastMessage and updatedAt
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id,
        updatedAt: new Date()
      });

      // Format for frontend (same shape as API)
      const messageForClient = {
        _id: message._id.toString(),
        sender: {
          _id: message.sender._id.toString(),
          username: message.sender.username || message.sender._id
        },
        text: message.text,
        image: image ? image : null, // frontend already has data URL
        createdAt: message.createdAt
      };

      // Broadcast to everyone in the chat room
      io.to(chatId).emit('message', messageForClient);

    } catch (err) {
      console.error('Socket send-message error:', err);
      socket.emit('error', { error: 'Failed to send message' });
    }
  });

  // Optional: typing indicator
  socket.on('typing', ({ chatId, isTyping }) => {
    socket.to(chatId).emit('typing', { userId: activeUsers.get(socket.id), isTyping });
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible in routes (for broadcasting from API if needed)
app.set('io', io);