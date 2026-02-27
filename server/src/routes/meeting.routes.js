const express = require("express");
const router = express.Router();
const {
  createMeeting,
  getMeeting,
  endMeeting,
  getMyMeetings,
} = require("../controllers/meeting.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, createMeeting);
router.get("/my", auth, getMyMeetings);
router.get("/:meetingId", auth, getMeeting);
router.patch("/:meetingId/end", auth, endMeeting);

module.exports = router;
