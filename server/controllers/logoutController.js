const User = require("../model/User");
const mongoose = require("mongoose");

const deactivateSession = (user, sessionID) => {
  if (!mongoose.Types.ObjectId.isValid(sessionID)) return false;

  const loginId = new mongoose.Types.ObjectId(sessionID);
  const sessionToDeactivate = user.logins.id(loginId);
  if (sessionToDeactivate) {
    sessionToDeactivate.sessionIsActive = false;
  }

  for (const device of user.devices.filter((d) => d.activeSession === sessionID)) {
    device.activeSession = "";
    device.sessionIsActive = false;
    device.isTrusted = false;
    if (!device.pastSessions.includes(sessionID)) {
      device.pastSessions.push(sessionID);
    }
  }

  return true;
};

const handleLogout = async (req, res) => {
  const { lastSessionID } = req.body;
  if (lastSessionID && lastSessionID !== null) {
    if (mongoose.Types.ObjectId.isValid(lastSessionID)) {
      const loginId = new mongoose.Types.ObjectId(lastSessionID);
      const user = await User.findOne({ "logins._id": loginId }).exec();

      if (user) {
        deactivateSession(user, lastSessionID);

        const result = await user.save();
        console.log(result);
      }
    } else {
      console.log("Invalid session id for logout:", lastSessionID);
    }
  }

  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(204);

  const refreshToken = cookies.jwt;
  const foundUser = await User.findOne({ refreshToken }).exec();
  if (!foundUser) {
    res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });
    return res.sendStatus(204);
  }

  foundUser.refreshToken = foundUser.refreshToken.filter((rt) => rt !== refreshToken);
  const result = await foundUser.save();
  console.log(result);

  res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });
  res.sendStatus(204);
};

const handleLogoutOnId = async (req, res) => {
  const io = req.app.get("io");
  const { sessionID } = req.body;
  if (!sessionID) return res.status(400).json({ message: "Id is required." });
  if (!mongoose.Types.ObjectId.isValid(sessionID)) {
    return res.status(400).json({ message: "Invalid session id." });
  }

  if (sessionID && sessionID !== null) {
    const loginId = new mongoose.Types.ObjectId(sessionID);
    const user = await User.findOne({ "logins._id": loginId }).exec();

    if (user) {
      deactivateSession(user, sessionID);

      const result = await user.save();
      console.log(result);
    }

    io.to(sessionID).emit("forceLogout");
    for (const socket of await io.in(sessionID).fetchSockets()) {
      socket.disconnect(true);
    }

    res.sendStatus(204);
  }
};

module.exports = { handleLogout, handleLogoutOnId };
