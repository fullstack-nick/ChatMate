const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
  },
  roles: {
    User: {
      type: Number,
      default: 2001,
    },
    Admin: Number,
  },
  password: {
    type: String,
    required: true,
  },
  refreshToken: [String],
  registeredAt: { type: Date, index: true },
  registeredIP: { type: String },
  logins: [
    {
      ip: String,
      userAgent: String,
      time: { type: Date, index: true },
      sessionIsActive: {
        type: Boolean,
        default: true,
      },
      refreshToken: String,
    },
  ],
  devices: [
    {
      ip: String,
      userAgent: String,
      lastLoginTime: { type: Date, index: true },
      sessionIsActive: {
        type: Boolean,
        default: true,
      },
      activeSession: String,
      pastSessions: [String],
      isTrusted: {
        type: Boolean,
        default: false,
      },
    },
  ],
});

module.exports = mongoose.model("User", userSchema);
