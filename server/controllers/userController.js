const User = require("../model/User");

const getDevices = async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ message: "Username is required." });

  const foundUser = await User.findOne({ username: username }).exec();
  if (!foundUser) return res.sendStatus(401);

  const activeSessionIds = new Set(
    foundUser.logins.filter((login) => login.sessionIsActive).map((login) => login._id.toString())
  );

  const devicesByKey = new Map();
  for (const device of foundUser.devices) {
    const isActive = device.activeSession && activeSessionIds.has(device.activeSession);
    const key = `${device.ip}|${device.userAgent}`;
    const normalized = { ...device.toObject(), sessionIsActive: isActive };
    const existing = devicesByKey.get(key);

    if (!existing || (!existing.sessionIsActive && isActive)) {
      devicesByKey.set(key, normalized);
    }
  }

  const devices = Array.from(devicesByKey.values());

  res.status(200).json({ devices });
};

const patchTrusted = async (req, res) => {
  const io = req.app.get("io");
  const { username, deviceID, sessionID, isTrusted } = req.body;
  if (!username || !deviceID || !sessionID || isTrusted === undefined) return res.status(400).json({ message: "Username, deviceID, sessionID, and isTrusted are required." });

  const foundUser = await User.findOne({ username: username }).exec();
  if (!foundUser) return res.sendStatus(401);

  const device = foundUser.devices.find((d) => d._id.toString() === deviceID);
  if (!device) {
    return res.status(404).json({ message: "Device not found." });
  }

  device.isTrusted = isTrusted;
  const result = await foundUser.save();
  console.log(result);

  const targetSession = device.activeSession;
  if (targetSession) {
    io.to(targetSession).emit("trustedStatusChanged", { isTrusted });
  }

  if (device.activeSession !== sessionID) {
    console.log("Trusted state updated, session id mismatch detected.");
  }

  return res.sendStatus(200);
};

module.exports = { getDevices, patchTrusted };
