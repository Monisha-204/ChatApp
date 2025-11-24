import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  chat: {
    type: String,
    required: true,
    index: true     
  },

  sender: {
    type: String,
    required: true,
    index: true
  },

  text: { type: String },

  image: {
    data: { type: Buffer },
    contentType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    }
  },

  createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient pagination
MessageSchema.index({ chat: 1, createdAt: -1 });

export default mongoose.model('Message', MessageSchema);