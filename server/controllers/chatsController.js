const User = require("../model/User");
const Chat = require("../model/Chat");
const Message = require("../model/Message");
const mongoose = require("mongoose");

const getChats = async (req, res) => {
  try {
    const username = req.query.username;

    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    const query = { "members.username": username };

    const chats = await Chat.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1, _id: -1 })
      .select("type name members.username lastMessageId lastMessageAt updatedAt")
      .populate({
        path: "lastMessageId",
        select: "content.text senderId createdAt",
        populate: { path: "senderId", select: "username" },
      })
      .lean();

    const items = chats.map((chat) => {
      const others = (chat.members || []).filter((m) => m.username !== username);

      const fallbackTitle = chat.type === "group" ? chat.name || others.map((m) => m.username).join(", ") : others[0]?.username || "Chat";

      const lastMessage = chat.lastMessageId
        ? {
            id: String(chat.lastMessageId._id),
            text: chat.lastMessageId.content?.text || "",
            createdAt: chat.lastMessageId.createdAt,
            sender: chat.lastMessageId.senderId
              ? {
                  id: String(chat.lastMessageId.senderId._id),
                  username: chat.lastMessageId.senderId.username,
                }
              : null,
          }
        : null;

      return {
        id: String(chat._id),
        type: chat.type, // 'chat' | 'group'
        name: chat.name || null,
        fallbackTitle,
        members: (chat.members || []).map((m) => ({ username: m.username })),
        lastMessageAt: chat.lastMessageAt || chat.updatedAt,
        lastMessage,
      };
    });

    res.json(items);
  } catch (err) {
    console.error("GET /chats error:", err);
    res.status(500).json({ message: "Failed to load chats" });
  }
};

const postChats = async (req, res) => {
  const io = req.app.get("io"); // <-- same style as your other controller
  try {
    const { mode, usernames: rawUsernames = [], name } = req.body;

    if (!mode || !["chat", "group"].includes(mode)) {
      return res.status(400).json({ message: "Invalid 'mode'. Use 'chat' or 'group'." });
    }
    if (!Array.isArray(rawUsernames) || rawUsernames.length < 2) {
      return res.status(400).json({ message: "'usernames' must include the actor at index 0 and at least one more username." });
    }

    const trimmed = rawUsernames.map((u) => String(u || "").trim()).filter(Boolean);

    const actorUsername = trimmed[0];
    const seen = new Set();
    const participantUsernames = [];
    for (const u of trimmed) {
      if (!seen.has(u)) {
        seen.add(u);
        participantUsernames.push(u);
      }
    }

    // mode-specific rules
    if (mode === "chat") {
      // actor + exactly 1 other
      if (participantUsernames.length !== 2) {
        return res.status(400).json({ message: "For 'chat', provide exactly one other username (actor + 1)." });
      }
      if (participantUsernames[1] === actorUsername) {
        return res.status(400).json({ message: "Cannot create a direct chat with yourself." });
      }
    } else {
      // group: actor + at least 2 others (>=3 total)
      if (participantUsernames.length < 3) {
        return res.status(400).json({ message: "For 'group', provide at least two other usernames (actor + 2)." });
      }
    }

    // resolve usernames -> users (to get _id for members.userId & participantsKey)
    const users = await User.find({ username: { $in: participantUsernames } })
      .select("_id username")
      .lean();

    if (users.length !== participantUsernames.length) {
      const found = new Set(users.map((u) => u.username));
      const missing = participantUsernames.filter((u) => !found.has(u));
      return res.status(404).json({ message: "Some users were not found", missing });
    }

    // build members array
    const now = new Date();
    const members = users.map((u) => ({
      userId: u._id,
      username: u.username,
      role: mode === "group" ? (u.username === actorUsername ? "admin" : "member") : "member",
      lastReadMessageId: null,
      joinedAt: now,
    }));

    // prevent duplicate direct chats using participantsKey (based on userIds)
    if (mode === "chat") {
      const sortedIds = users.map((u) => String(u._id)).sort();
      const participantsKey = sortedIds.join(":");

      const existing = await Chat.findOne({ type: "chat", participantsKey }).select("type name members lastMessageAt updatedAt").lean();

      if (existing) {
        // Return the existing chat; (no emit to avoid noise/duplication)
        return res.status(200).json({
          id: String(existing._id),
          type: existing.type,
          name: existing.name || null,
          members: existing.members.map((m) => ({ username: m.username, role: m.role })),
          lastMessageAt: existing.lastMessageAt || existing.updatedAt,
          lastMessage: null,
        });
      }
    }

    // create chat
    const chatDoc = await Chat.create({
      type: mode, // 'chat' | 'group'
      name: mode === "group" ? name || null : undefined,
      members,
      lastMessageAt: now, // bubble to top
      // participantsKey auto-set by chatSchema.pre('validate') for type 'chat'
    });

    // shape response
    const response = {
      id: String(chatDoc._id),
      type: chatDoc.type,
      name: chatDoc.name || null,
      members: members.map((m) => ({ username: m.username, role: m.role })),
      lastMessageAt: chatDoc.lastMessageAt,
      lastMessage: null,
    };

    // ----- WebSocket emit: notify ALL involved usernames -----
    try {
      const usernamesToNotify = members.map((m) => m.username);
      const payload = { chat: response };

      // emit individually to each per-user room (e.g., joined via `user:join`)
      usernamesToNotify.forEach((uname) => {
        io.to(uname).emit("chat:created", payload);
      });

      // (Optional) also emit a generic event if you have any global listeners
      // io.emit("chats:new", payload);
    } catch (emitErr) {
      // Don't break the request if emit fails; just log it
      console.warn("WS emit chat:created failed:", emitErr?.message || emitErr);
    }
    // ---------------------------------------------------------

    return res.status(201).json(response);
  } catch (err) {
    if (err?.code === 11000) {
      // unique index on (type='chat', participantsKey)
      return res.status(409).json({ message: "Direct chat already exists" });
    }
    console.error("POST /chats error:", err);
    return res.status(500).json({ message: "Failed to create chat" });
  }
};

const getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }

    // Parse/sanitize query
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const cursor = (req.query.cursor || "").trim() || null;

    // Resolve requester (best-effort: from auth middleware or ?username=)
    const requesterUsername = req.query.username || null;

    let requester = null;
    if (requesterUsername) {
      requester = await User.findOne({ username: requesterUsername }).select("_id username").lean();
    }

    // Ensure chat exists + (if we know the requester) they’re a member
    const chat = await Chat.findById(chatId).select("_id members.userId members.username").lean();

    if (!chat) return res.status(404).json({ message: "Chat not found" });

    if (requester) {
      const isMember = chat.members?.some((m) => String(m.userId) === String(requester._id) || m.username === requester.username) || false;
      if (!isMember) return res.status(403).json({ message: "Forbidden" });
    }

    // Build query
    const q = { chatId: chat._id };
    // Support cursor as ISO date OR as a message id
    if (cursor) {
      let cursorDate = null;
      const asDate = new Date(cursor);
      if (!Number.isNaN(asDate.getTime())) {
        cursorDate = asDate;
      } else if (mongoose.Types.ObjectId.isValid(cursor)) {
        const curMsg = await Message.findById(cursor).select("createdAt").lean();
        if (curMsg?.createdAt) cursorDate = curMsg.createdAt;
      }
      if (cursorDate) q.createdAt = { $lt: cursorDate };
    }

    // Hide per-user deleted messages if we know the requester
    if (requester?._id) {
      q.deletedFor = { $ne: requester._id };
    }

    // Fetch (newest→oldest in this slice)
    const docs = await Message.find(q).sort({ createdAt: -1, _id: -1 }).limit(limit).select("_id chatId senderId content createdAt editedAt").populate({ path: "senderId", select: "username" }).lean();

    // Compute next cursor (oldest item we returned)
    let nextCursor = null;
    if (docs.length === limit) {
      const oldest = docs[docs.length - 1];
      nextCursor = oldest?.createdAt ? new Date(oldest.createdAt).toISOString() : null;
    }

    // Shape for UI (your toUiMessage already understands these fields)
    const items = docs.map((d) => ({
      id: String(d._id),
      chatId: String(d.chatId),
      content: { text: d.content?.text || "" },
      sender: d.senderId ? { id: String(d.senderId._id), username: d.senderId.username } : null,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
      editedAt: d.editedAt ? new Date(d.editedAt).toISOString() : null,
    }));

    return res.json({ items, nextCursor });
  } catch (err) {
    console.error("GET /chats/:chatId/messages error:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

const postChatMessage = async (req, res) => {
  const io = req.app.get("io");
  try {
    const { chatId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }

    const text = (req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ message: "Text is required" });
    if (text.length > 4000) {
      return res.status(413).json({ message: "Message too long (max 4000 chars)" });
    }

    // Prefer username from auth middleware; fall back to body/query if needed
    const username = req.body.username || null;
    if (!username) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ username }).select("_id username").lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    // Ensure chat exists AND the user is a member
    const chat = await Chat.findOne({ _id: chatId, "members.userId": user._id }).select("_id members.userId members.username").lean();
    if (!chat) {
      return res.status(404).json({ message: "Chat not found or you are not a member" });
    }

    // Create message
    const now = new Date();
    const msgDoc = await Message.create({
      chatId: chat._id,
      senderId: user._id,
      content: { text },
      createdAt: now,
      editedAt: null,
    });

    // Update chat lastMessage + sender's lastRead
    await Chat.updateOne(
      { _id: chat._id },
      {
        $set: {
          lastMessageId: msgDoc._id,
          lastMessageAt: msgDoc.createdAt,
          "members.$[me].lastReadMessageId": msgDoc._id,
        },
      },
      { arrayFilters: [{ "me.userId": user._id }] }
    );

    // Shape response (your toUiMessage maps this perfectly)
    const payload = {
      id: String(msgDoc._id),
      chatId: String(chat._id),
      content: { text },
      sender: { id: String(user._id), username: user.username },
      createdAt: msgDoc.createdAt.toISOString(),
    };

    // WebSocket emits
    try {
      const rooms = [`chat:${chatId}`, ...chat.members.map((m) => m.username).filter((u) => u !== user.username)];
      io.to(rooms).emit("message:new", payload);
    } catch (emitErr) {
      console.warn("WS emit message:new failed:", emitErr?.message || emitErr);
    }

    return res.status(201).json(payload);
  } catch (err) {
    console.error("POST /chats/:chatId/messages error:", err);
    return res.status(500).json({ message: "Failed to send message" });
  }
};

const deleteChat = async (req, res) => {
  const io = req.app.get("io");
  try {
    const { chatId } = req.params;
    // Get requesting user (from auth middleware ideally; fallback body.username)
    const username = req.body?.username;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    if (!username) return res.status(401).json({ message: "Unauthorized" });

    const chat = await Chat.findById(chatId).select("_id members.username").lean();
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    // Only members can delete (you can tighten this to 'admin only' if you want)
    const isMember = chat.members?.some((m) => m.username === username);
    if (!isMember) return res.status(403).json({ message: "Forbidden" });

    // 1) Delete messages
    await Message.deleteMany({ chatId: chat._id });

    // 2) Delete chat
    await Chat.deleteOne({ _id: chat._id });

    // 3) Single event to all members' personal rooms
    const payload = { chatId: String(chat._id) };
    for (const m of chat.members) {
      io.to(m.username).emit("chat:deleted", payload);
    }

    return res.sendStatus(204);
  } catch (err) {
    console.error("DELETE /chats/:chatId error:", err);
    return res.status(500).json({ message: "Failed to delete chat" });
  }
};

const deleteMessage = async (req, res) => {
  const io = req.app.get("io");
  try {
    const { chatId, messageId } = req.params;
    const username = req.body?.username;

    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid ids" });
    }
    if (!username) return res.status(401).json({ message: "Unauthorized" });

    // Ensure requester is a member and get member ids
    const chat = await Chat.findById(chatId).select("_id members.userId members.username lastMessageId updatedAt").lean();
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members?.some((m) => m.username === username);
    if (!isMember) return res.status(403).json({ message: "Forbidden" });

    const memberIds = chat.members.map((m) => m.userId);

    // Soft-delete for ALL: fill deletedFor with all member ids
    const msg = await Message.findOneAndUpdate({ _id: messageId, chatId: chat._id }, { $set: { deletedFor: memberIds } }, { new: true })
      .select("_id chatId createdAt")
      .lean();
    if (!msg) return res.status(404).json({ message: "Message not found" });

    // If that was the chat's lastMessage, compute a new one
    let newLast = null;
    if (String(chat.lastMessageId) === String(msg._id)) {
      const firstMemberId = memberIds[0]; // since we only delete-for-all, this is enough
      const next = await Message.findOne({
        chatId: chat._id,
        deletedFor: { $ne: firstMemberId },
      })
        .sort({ createdAt: -1, _id: -1 })
        .populate({ path: "senderId", select: "username" })
        .lean();

      await Chat.updateOne(
        { _id: chat._id },
        {
          $set: {
            lastMessageId: next ? next._id : null,
            lastMessageAt: next ? next.createdAt : chat.updatedAt,
          },
        }
      );

      if (next) {
        newLast = {
          id: String(next._id),
          text: next.content?.text || "",
          author: next.senderId?.username || null,
          createdAt: new Date(next.createdAt).toISOString(),
        };
      }
    }

    // Notify everyone (per-chat room + per-user rooms)
    const payload = { chatId: String(chat._id), messageId: String(msg._id), newLastMessage: newLast };
    const rooms = [`chat:${chatId}`, ...chat.members.map((m) => m.username)];
    io.to(rooms).emit("message:deleted", payload);

    return res.sendStatus(204);
  } catch (err) {
    console.error("DELETE /chats/:chatId/messages/:messageId error:", err);
    return res.status(500).json({ message: "Failed to delete message" });
  }
};

const editMessage = async (req, res) => {
  const io = req.app.get("io");
  try {
    const { chatId, messageId } = req.params;
    const username = req.body?.username;
    const text = (req.body?.text ?? "").trim();

    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid ids" });
    }
    if (!username) return res.status(401).json({ message: "Unauthorized" });
    if (!text) return res.status(400).json({ message: "Text is required" });
    if (text.length > 4000) return res.status(413).json({ message: "Message too long (max 4000)" });

    // Ensure requester is a member (author-only edit? keep or drop this block below)
    const chat = await Chat.findById(chatId).select("_id members.userId members.username lastMessageId").lean();
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members?.some((m) => m.username === username);
    if (!isMember) return res.status(403).json({ message: "Forbidden" });

    // Enforce author-only edit:
    const user = await User.findOne({ username }).select("_id username").lean();
    if (!user) return res.status(401).json({ message: "User not found" });
    const msgDoc = await Message.findOne({ _id: messageId, chatId: chat._id }).select("senderId createdAt").lean();
    if (!msgDoc) return res.status(404).json({ message: "Message not found" });
    if (String(msgDoc.senderId) !== String(user._id)) return res.status(403).json({ message: "Only the author can edit this message" });

    const now = new Date();
    await Message.updateOne({ _id: messageId, chatId: chat._id }, { $set: { "content.text": text, editedAt: now } });

    // Bump chat.updatedAt (not lastMessageAt)
    await Chat.updateOne({ _id: chat._id }, { $set: { updatedAt: new Date() } });

    const payload = {
      chatId: String(chat._id),
      messageId: String(messageId),
      text,
      editedAt: now.toISOString(),
    };

    // WS: per-chat room + per-user rooms
    const rooms = [`chat:${chatId}`, ...chat.members.map((m) => m.username)];
    io.to(rooms).emit("message:edited", payload);

    // Response can include updated fields for clients doing request-response
    return res.status(200).json({ id: String(messageId), chatId: String(chat._id), text, editedAt: payload.editedAt });
  } catch (err) {
    console.error("PUT /chats/:chatId/messages/:messageId error:", err);
    return res.status(500).json({ message: "Failed to edit message" });
  }
};

module.exports = { getChats, postChats, getChatMessages, postChatMessage, deleteChat, deleteMessage, editMessage };
