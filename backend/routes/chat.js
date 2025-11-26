import express from 'express';
import multer from 'multer';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = express.Router();

// Multer: store image in memory
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return cb(new Error('Only image files allowed'));
    }
    cb(null, true);
  },
  storage: multer.memoryStorage(),
});

// Helper: convert Buffer → data URL
const formatImage = (image) => {
  if (!image?.data) return null;
  const base64 = image.data.toString('base64');
  return `data:${image.contentType};base64,${base64}`;
};

// ──────────────────────────────────────────────────────────────
// 1. User login / upsert (CALL THIS WHEN USER LOGS IN)
// ──────────────────────────────────────────────────────────────
router.post('/upsert-user', async (req, res) => {
  try {
    const { user_id, username, email, profile } = req.body;

    if (!user_id || !username || !email) {
      return res.status(400).json({
        error: 'user_id, username and email are required',
      });
    }

    // Upsert user (create if not exists, update fields if exists)
    const user = await User.findOneAndUpdate(
      { user_id }, // search by auth provider ID
      {
        $set: {
          username,
          email,
          profile: profile || '',
          status: 'online',              // mark as online on login
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      user: {
        _id: user._id.toString(),
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Upsert user error:', err);
    res.status(500).json({ error: 'Failed to register/login user' });
  }
});

// ──────────────────────────────────────────────────────────────
// 2. Create or get existing 1-on-1 chat
// ──────────────────────────────────────────────────────────────
router.post('/create-or-get', async (req, res) => {
  try {
    const { userId1, userId2 } = req.body;
    if (!userId1 || !userId2) return res.status(400).json({ error: 'Two user IDs required' });

    const participants = [userId1, userId2].map(id => id.toString()).sort();
    if (participants[0] === participants[1])
      return res.status(400).json({ error: 'Cannot chat with yourself' });

    // Find existing chat
    let chat = await Chat.findOne({
      participants: { $all: [userId1, userId2], $size: 2 }
    }).populate('participants', 'username avatar');

    if (!chat) {
      chat = await Chat.create({ participants });
      await chat.populate('participants', 'username avatar');
    }

    res.json({
      success: true,
      chat: {
        _id: chat._id.toString(),
        participants: chat.participants,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// 3. Get chat + paginated messages
// ──────────────────────────────────────────────────────────────
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip = (page - 1) * limit;

    const chat = await Chat.findById(chatId)
      .populate('participants', 'username avatar')
      .populate('lastMessage');

    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const messages = await Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username avatar')
      .lean(); // faster

    const formattedMessages = messages.reverse().map(msg => ({
      _id: msg._id.toString(),
      sender: msg.sender,
      text: msg.text,
      image: formatImage(msg.image),
      createdAt: msg.createdAt,
    }));

    res.json({
      success: true,
      chat: {
        _id: chat._id.toString(),
        participants: chat.participants,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      messages: formattedMessages,
      pagination: {
        page,
        hasMore: messages.length === limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// 4. Send message (text or image)
// ──────────────────────────────────────────────────────────────
router.post('/send-message', upload.single('image'), async (req, res) => {
  try {
    const { text, chatId, senderId } = req.body;
    if (!chatId || !senderId)
      return res.status(400).json({ error: 'chatId and senderId required' });

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (!chat.participants.map(p => p.toString()).includes(senderId))
      return res.status(403).json({ error: 'Not a participant' });

    const messageData = {
      chat: chatId,
      sender: senderId,
      text: text?.trim(),
    };

    if (req.file) {
      messageData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
      if (!messageData.text) messageData.text = 'Photo'; // fallback
    }

    const message = await Message.create(messageData);

    // Update chat's updatedAt and lastMessage
    await Chat.findByIdAndUpdate(chatId, {
      updatedAt: new Date(),
      lastMessage: message._id.toString()
    });

    await message.populate('sender', 'username avatar');

    const messageForClient = {
      _id: message._id.toString(),
      sender: message.sender,
      text: message.text,
      image: formatImage(message.image),
      createdAt: message.createdAt,
    };

    res.json({ success: true, message: messageForClient });

    // ── Real-time broadcast (Socket.IO) ──
    req.app.get('io')?.to(chatId).emit('message', messageForClient);

  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: err.message || 'Failed to send' });
  }
});

// ──────────────────────────────────────────────────────────────
// 5. Edit message
// ──────────────────────────────────────────────────────────────
router.patch('/message/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.body.userId;               // you must send the userId from frontend

    if (!text?.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Only the sender can edit
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Optional: prevent editing after X minutes
    const ageMs = Date.now() - new Date(message.createdAt);
    if (ageMs > 15 * 60 * 1000) { // 15 minutes
      return res.status(403).json({ error: 'Message is too old to edit' });
    }

    message.text = text.trim();
    message.edited = true;
    await message.save();

    const updated = await message.populate('sender', 'username avatar');

    const formatted = {
      _id: message._id.toString(),
      sender: updated.sender,
      text: message.text,
      image: formatImage(message.image),
      createdAt: message.createdAt,
      edited: true
    };

    res.json({ success: true, message: formatted });

    // Broadcast updated message
    req.app.get('io')?.to(message.chat.toString()).emit('message-updated', formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// 6. Delete message
// ──────────────────────────────────────────────────────────────
router.delete('/message/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.query.userId; // passed as query param

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Only the sender can delete
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await Message.deleteOne({ _id: messageId });

    // Update chat's lastMessage if needed (optional improvement)
    const chat = await Chat.findById(message.chat);
    if (chat.lastMessage && chat.lastMessage.toString() === messageId) {
      const previous = await Message.findOne({ chat: message.chat })
        .sort({ createdAt: -1 });
      chat.lastMessage = previous?._id || null;
      chat.updatedAt = new Date();
      await chat.save();
    }

    res.json({ success: true, deletedId: messageId });

    // Broadcast deletion
    req.app.get('io')?.to(message.chat.toString()).emit('message-deleted', { messageId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// 7. Get user's inbox – all their chats
// ──────────────────────────────────────────────────────────────
router.get('/inbox/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'username avatar')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      chats: chats.map(c => ({
        _id: c._id.toString(),
        participants: c.participants.filter(p => p._id.toString() !== userId),
        lastMessage: c.lastMessage ? {
          text: c.lastMessage.text,
          createdAt: c.lastMessage.createdAt
        } : null,
        updatedAt: c.updatedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;