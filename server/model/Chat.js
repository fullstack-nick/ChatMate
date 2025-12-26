const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const memberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    lastReadMessageId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSchema = new Schema(
  {
    type: { type: String, enum: ["chat", "group"], required: true },
    name: { type: String }, // used for
    members: { type: [memberSchema], required: true }, // at least 2
    participantsKey: { type: String, index: true }, // unique for directs
    lastMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    lastMessageAt: { type: Date, index: true },
  },
  { timestamps: true }
);

// For "my chats" sorted by recent activity:
chatSchema.index({ "members.username": 1, lastMessageAt: -1, updatedAt: -1, _id: -1 });

// Enforce uniqueness for direct chats (two members, sorted key):
chatSchema.index({ type: 1, participantsKey: 1 }, { unique: true, partialFilterExpression: { type: "chat" } });

chatSchema.pre("validate", function (next) {
  if (this.type === "chat") {
    const ids = (this.members || []).map((m) => String(m.userId)).sort();
    // expect exactly 2 members for direct; guard if needed
    this.participantsKey = ids.join(":");
  } else {
    this.participantsKey = undefined;
  }
  next();
});

module.exports = mongoose.model("Chat", chatSchema);
