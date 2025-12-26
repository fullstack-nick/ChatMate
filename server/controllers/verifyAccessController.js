const jwt = require("jsonwebtoken");

const handleVerification = async (req, res) => {
  const accessToken = req.headers["authorization"]?.split(" ")[1];
  if (!accessToken) return res.sendStatus(401);

  jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, async (err, decoded) => {
    if (err || decoded === undefined) return res.sendStatus(401);
    if (decoded && decoded !== undefined) return res.sendStatus(200);
  });
};

module.exports = { handleVerification };
