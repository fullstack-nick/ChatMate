const express = require("express");
const router = express.Router();
const logoutController = require("../controllers/logoutController");

router.post("/", logoutController.handleLogout);
router.post("/id", logoutController.handleLogoutOnId);

module.exports = router;
