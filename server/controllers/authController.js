const User = require("../model/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const getIP = require("../helpers/getIP");
const getUniqueDevices = require("../helpers/getUniqueDevices");

const handleLogin = async (req, res) => {
  const cookies = req.cookies;
  const { username, pwd, lastSessionID, persist } = req.body;
  if (!username || !pwd) return res.status(400).json({ message: "Username and password are required." });

  const foundUser = await User.findOne({ username: username }).exec();
  if (!foundUser) return res.sendStatus(401);

  const match = await bcrypt.compare(pwd, foundUser.password);
  if (match) {
    if (lastSessionID) {
      const sessionToDeactivate = foundUser.logins.id(lastSessionID);
      sessionToDeactivate.sessionIsActive = false;
    }

    const logInInfo = {
      ip: getIP(req),
      userAgent: req.get("User-Agent"),
      time: new Date(),
    };

    const roles = Object.values(foundUser.roles).filter(Boolean);

    const accessToken = jwt.sign(
      {
        UserInfo: { username: foundUser.username, roles: roles },
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );

    const newRefreshToken = jwt.sign({ username: foundUser.username }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "1d" });

    let newRefreshTokenArray = !cookies?.jwt ? foundUser.refreshToken : foundUser.refreshToken.filter((rt) => rt !== cookies.jwt);

    if (cookies?.jwt) {
      const refreshToken = cookies.jwt;
      const foundToken = await User.findOne({ refreshToken }).exec();
      if (!foundToken) {
        console.log("Attempted refresh token reuse at login!");
        newRefreshTokenArray = [];
      }

      res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });
    }

    foundUser.refreshToken = [...newRefreshTokenArray, newRefreshToken];
    foundUser.logins.push({
      ip: logInInfo.ip,
      userAgent: logInInfo.userAgent,
      time: logInInfo.time,
      refreshToken: newRefreshToken,
    });
    const lastLogin = foundUser.logins[foundUser.logins.length - 1];
    const sessionID = lastLogin._id.toString();
    if (foundUser.logins.length > 10) foundUser.logins.shift(); // NEED TO BE CAREFUL CAUSE MIGHT DELETE AN ACTIVE SESSION FROM DATABSE

    // HERE STARTS WORK ON DEVICES DATABSE ARRAY
    const uniqueDevices = getUniqueDevices(foundUser.logins, foundUser.devices);

    //PRESUMABLY THE CULPRIT IS RIGHT BELOW
    const allDevices = [...foundUser.devices, ...uniqueDevices];
    foundUser.devices = allDevices;

    for (const device of foundUser.devices) {
      if (device.activeSession === sessionID) {
        device.isTrusted = persist;
      }
    }
    try {
      const result = await foundUser.save();
      console.log(result);
    } catch (err) {
      if (err?.name === "VersionError") {
        console.warn("Version conflict during login save:", err.message);
        return res.sendStatus(409);
      }
      console.error(err);
      return res.sendStatus(500);
    }

    res.cookie("jwt", newRefreshToken, { httpOnly: true, secure: true, sameSite: "None", maxAge: 24 * 60 * 60 * 1000 });

    res.json({ roles, accessToken, sessionID });
  } else {
    res.sendStatus(401);
  }
};

module.exports = { handleLogin };
