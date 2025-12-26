const express = require("express");
const router = express.Router();
const chatsController = require("../controllers/chatsController");

router.get("/", chatsController.getChats);
router.post("/", chatsController.postChats);
router.get("/:chatId/messages", chatsController.getChatMessages);
router.post("/:chatId/messages", chatsController.postChatMessage);
router.delete("/:chatId", chatsController.deleteChat);
router.delete("/:chatId/messages/:messageId", chatsController.deleteMessage);
router.put("/:chatId/messages/:messageId", chatsController.editMessage);

module.exports = router;
