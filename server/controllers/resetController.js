const User = require("../model/User");
const bcrypt = require("bcrypt");

const handleReset = async (req, res) => {
  const io = req.app.get("io");
  const { username, pwd } = req.body;
  if (!username || !pwd) return res.status(400).json({ message: "Username and password are required." });

  const user = await User.findOne({ username: username }).exec();
  if (!user) return res.status(400).json({ message: "User with the specified username does not exist." });

  if (user) {
    try {
      const activeSessions = user.logins.filter((login) => login.sessionIsActive).map((login) => login._id.toString());
      const newPwd = await bcrypt.hash(pwd, 10);
      user.password = newPwd;
      user.refreshToken = [];
      for (const login of user.logins) {
        login.refreshToken = "";
        login.sessionIsActive = false;
      }
      for (const device of user.devices) {
        device.activeSession = "";
        device.sessionIsActive = false;
        device.isTrusted = false;
      }
      const result = await user.save();
      console.log(result);

      if (io) {
        for (const sessionID of activeSessions) {
          io.to(sessionID).emit("forceLogout");
          for (const socket of await io.in(sessionID).fetchSockets()) {
            socket.disconnect(true);
          }
        }
      }

      res.status(200).json({ message: "Password reset successfully." });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
};

module.exports = { handleReset };
