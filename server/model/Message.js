const mongoose = require("mongoose");
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { text: { type: String, trim: true } },
    createdAt: { type: Date, default: Date.now, index: true },
    editedAt: { type: Date, default: null },
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User" }], // optional per-user hide
  },
  { timestamps: false }
);

// Efficient pagination by chat
messageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
