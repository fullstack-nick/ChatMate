const User = require("../model/User");
const bcrypt = require("bcrypt");
const getIP = require("../helpers/getIP");

const handleNewUser = async (req, res) => {
  const { username, pwd } = req.body;
  if (!username || !pwd) return res.status(400).json({ message: "Username and password are required." });

  const duplicate = await User.findOne({ username: username }).exec();
  if (duplicate) return res.sendStatus(409);

  try {
    const hashedPwd = await bcrypt.hash(pwd, 10);

    const newUser = await User.create({
      username: username,
      password: hashedPwd,
      registeredAt: new Date(),
      registeredIP: getIP(req),
    });

    console.log(newUser);

    res.status(201).json({ success: `New user ${newUser} is created!` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { handleNewUser };
