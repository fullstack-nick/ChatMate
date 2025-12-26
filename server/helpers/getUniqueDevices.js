function getUniqueDevices(logins, devices) {
  const result = [];
  const activeSessionIds = new Set();

  for (const login of logins) {
    if (login.sessionIsActive) {
      activeSessionIds.add(login._id.toString());
    }
  }

  for (const device of devices) {
    if (!device.activeSession || !activeSessionIds.has(device.activeSession)) {
      device.sessionIsActive = false;
    }
  }

  for (const login of logins) {
    if (!login.sessionIsActive) continue;

    const { _id, ip, userAgent, sessionIsActive, time, ...rest } = login;
    const stringID = _id.toString();
    const matchingDevices = devices.filter((device) => device.ip === ip && device.userAgent === userAgent);
    const device = matchingDevices[0];

    if (device) {
      device.lastLoginTime = time;
      device.sessionIsActive = true;
      device.activeSession = stringID;

      for (const dup of matchingDevices.slice(1)) {
        dup.sessionIsActive = false;
        dup.activeSession = "";
      }
    } else {
      const modifiedLogin = {
        ...rest,
        lastLoginTime: time,
        ip,
        userAgent,
        sessionIsActive,
        activeSession: stringID,
        pastSessions: [],
        isTrusted: false,
      };

      result.push(modifiedLogin);
    }
  }

  return result;
}

module.exports = getUniqueDevices;
