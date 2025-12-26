require("dotenv").config();
const express = require("express");
const app = express();
const PORT = 3500;
const credentials = require("./middleware/credentials");
const cors = require("cors");
const corsOptions = require("./config/corsOptions");
const mongoose = require("mongoose");
const connectDB = require("./config/dbConn");
const cookieParser = require("cookie-parser");
const { logger } = require("./middleware/logEvents");
const errorHandler = require("./middleware/errorHandler");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./model/User");
const { isAllowedOrigin } = require("./config/allowedOrigins");

connectDB();

app.use(logger);

app.use(credentials);
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/register", require("./routes/register"));
app.use("/auth", require("./routes/auth"));
app.use("/reset", require("./routes/reset"));
app.use("/verifyAccess", require("./routes/verifyAccess"));
app.use("/refresh", require("./routes/refresh"));
app.use("/user", require("./routes/user"));
app.use("/chats", require("./routes/chats"));
app.use("/logout", require("./routes/logout"));

app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use(errorHandler);

mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB");
  const expressServer = app.listen(process.env.PORT || PORT, () => console.log("Server is running!"));

  const io = new Server(expressServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    },
  });
  app.set("io", io);

  io.use(async (socket, next) => {
    const { accessToken, sessionID } = socket.handshake.auth || {};
    if (!accessToken || !sessionID) return next(new Error("Unauthorized"));

    try {
      const payload = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const username = payload?.UserInfo?.username;
      if (!username) return next(new Error("Unauthorized"));
      const user = await User.findOne({ username }).lean();
      if (!user) return next(new Error("Unauthorized"));

      const session = user.devices?.find((device) => device.activeSession === sessionID && device.sessionIsActive);
      if (!session) return next(new Error("Invalid session"));

      socket.data.userID = String(user._id);
      socket.data.sessionID = sessionID;
      socket.data.username = user.username;
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { sessionID, username } = socket.data;
    socket.join(sessionID);
    socket.join(username);
    console.log("Socket connected for session", sessionID);

    socket.on("chat:join", ({ chatId }) => {
      // authorize user to access chatId before joining
      socket.join(chatId);
    });

    socket.on("chat:leave", ({ chatId }) => {
      socket.leave(chatId);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected", sessionID, reason);
    });
  });
});
