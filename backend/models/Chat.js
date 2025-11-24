import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  participants: [
    {
      type: String,
      required: true,
    }
  ],

  // Optional: keep track of last message for preview
  lastMessage: {
    type: String,
    default: null
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure exactly 2 distinct participants
ChatSchema.path('participants').validate(function (v) {
  return v && v.length === 2 && new Set(v.map(id => id.toString())).size === 2;
}, 'Chat must have exactly 2 different participants');

// Optional: index for fast lookup
ChatSchema.index({ participants: 1 });

export default mongoose.model('Chat', ChatSchema);