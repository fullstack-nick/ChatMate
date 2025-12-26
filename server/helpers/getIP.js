const getIP = (req) => {
  return req.headers["x-forwarded-for"]?.split(",").shift().trim() || req.socket.remoteAddress;
};

module.exports = getIP;
