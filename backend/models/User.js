import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    unique: true
  },

  username: {
    type: String,
    required: true,
    unique: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  profile: {
    type: String, 
    default: ""
  },

  status: {
    type: String,
    enum: ["online", "offline", "away", "busy"],
    default: "offline"
  }
}, { timestamps: true });

export default mongoose.model("User", UserSchema);

