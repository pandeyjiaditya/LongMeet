const express = require("express");
const router = express.Router();
const {
  getRoomMessages,
  clearRoomMessages,
} = require("../controllers/chat.controller");
const auth = require("../middleware/auth.middleware");

router.get("/:roomId/messages", auth, getRoomMessages);
router.delete("/:roomId/messages", auth, clearRoomMessages);

module.exports = router;
