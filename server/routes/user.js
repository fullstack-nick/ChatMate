const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.get("/devices", userController.getDevices);
router.patch("/patch", userController.patchTrusted);

module.exports = router;
