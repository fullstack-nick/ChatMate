const User = require("../model/User");
const jwt = require("jsonwebtoken");

const handleVersionError = (err, res, context) => {
  if (err?.name !== "VersionError") return false;
  console.warn(`Version conflict during ${context}:`, err.message);
  if (!res.headersSent) res.sendStatus(409);
  return true;
};

const saveUser = async (user, res, context) => {
  try {
    const result = await user.save();
    console.log(result);
    return true;
  } catch (err) {
    if (handleVersionError(err, res, context)) return false;
    console.error(err);
    if (!res.headersSent) res.sendStatus(500);
    return false;
  }
};

const handleRefreshToken = async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });

  const foundUser = await User.findOne({ refreshToken }).exec();

  if (!foundUser) {
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
      if (err || decoded === undefined) return res.sendStatus(403);
      console.log("Attempted refresh token reuse!");
      const hackedUser = await User.findOne({ username: decoded.username }).exec();
      hackedUser.refreshToken = [];
      for (const login of hackedUser.logins) {
        login.refreshToken = "";
        login.sessionIsActive = false;
      }
      await saveUser(hackedUser, res, "refresh reuse cleanup");
    });
    return res.sendStatus(403);
  }

  const newRefreshTokenArray = foundUser.refreshToken.filter((rt) => rt !== refreshToken);

  // BELOW IS THE NEWLY WRITTEN BLOCK

  const idx = foundUser.logins.findIndex((login) => login.refreshToken === refreshToken);
  if (idx < 0) {
    foundUser.refreshToken = [...newRefreshTokenArray];
    const result = await foundUser.save();
    console.log(result);
    return res.sendStatus(403);
  }

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) {
      console.log("Expired refresh token");
      foundUser.refreshToken = [...newRefreshTokenArray];
      foundUser.logins[idx].refreshToken = "";
      foundUser.logins[idx].sessionIsActive = false;
      const saved = await saveUser(foundUser, res, "refresh expiry cleanup");
      if (!saved) return;
    }
    if (err || foundUser.username !== decoded.username || decoded === undefined) return res.sendStatus(403);

    const sessionID = foundUser.logins[idx]._id.toString();
    const device = foundUser.devices.find((d) => d.activeSession === sessionID);
    const isTrusted = Boolean(device?.isTrusted);

    if (!isTrusted) {
      foundUser.refreshToken = [...newRefreshTokenArray];
      foundUser.logins[idx].refreshToken = "";
      foundUser.logins[idx].sessionIsActive = false;
      if (device) {
        device.activeSession = "";
        device.sessionIsActive = false;
        device.isTrusted = false;
        if (!device.pastSessions.includes(sessionID)) {
          device.pastSessions.push(sessionID);
        }
      }
      const result = await foundUser.save();
      console.log(result);
      return res.sendStatus(403);
    }

    const roles = Object.values(foundUser.roles).filter(Boolean);
    const accessToken = jwt.sign(
      {
        UserInfo: {
          username: decoded.username,
          roles: roles,
        },
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    const newRefreshToken = jwt.sign({ username: foundUser.username }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "1d" });

    foundUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
    foundUser.logins[idx].refreshToken = newRefreshToken;
    foundUser.logins[idx].sessionIsActive = true;
    const saved = await saveUser(foundUser, res, "refresh rotation");
    if (!saved) return;

    res.cookie("jwt", newRefreshToken, { httpOnly: true, secure: true, sameSite: "None", maxAge: 24 * 60 * 60 * 1000 });

    res.json({ roles, accessToken, sessionID, isTrusted });
  });
};

module.exports = { handleRefreshToken };
