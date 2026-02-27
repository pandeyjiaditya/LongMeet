const express = require("express");
const router = express.Router();
const {
  createRoom,
  getRoom,
  getActiveRooms,
  getMyRooms,
  closeRoom,
} = require("../controllers/room.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, createRoom);
router.get("/active", auth, getActiveRooms);
router.get("/my", auth, getMyRooms);
router.get("/:roomId", auth, getRoom);
router.patch("/:roomId/close", auth, closeRoom);

module.exports = router;
