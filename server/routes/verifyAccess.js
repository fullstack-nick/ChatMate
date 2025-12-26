const express = require("express");
const router = express.Router();
const verifyAccessController = require("../controllers/verifyAccessController");

router.get("/", verifyAccessController.handleVerification);

module.exports = router;
