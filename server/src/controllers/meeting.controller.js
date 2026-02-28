const { v4: uuidv4 } = require("uuid");
const Meeting = require("../models/Meeting.model");

exports.createMeeting = async (req, res, next) => {
  try {
    const meetingId = uuidv4();
    const meeting = await Meeting.create({
      meetingId,
      title: req.body.title || "Untitled Meeting",
      host: req.user.id,
    });
    res.status(201).json({ success: true, meeting });
  } catch (err) {
    next(err);
  }
};

exports.getMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findOne({ meetingId: req.params.meetingId })
      .populate("host", "name email avatar")
      .populate("participants.user", "name email avatar");

    if (!meeting)
      return res
        .status(404)
        .json({ success: false, message: "Meeting not found" });

    res.json({ success: true, meeting });
  } catch (err) {
    next(err);
  }
};

exports.endMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findOneAndUpdate(
      { meetingId: req.params.meetingId, host: req.user.id },
      { isActive: false, endedAt: new Date() },
      { new: true },
    );
    if (!meeting)
      return res.status(404).json({
        success: false,
        message: "Meeting not found or not authorized",
      });

    res.json({ success: true, meeting });
  } catch (err) {
    next(err);
  }
};

exports.getMyMeetings = async (req, res, next) => {
  try {
    const meetings = await Meeting.find({
      $or: [{ host: req.user.id }, { "participants.user": req.user.id }],
    })
      .sort({ createdAt: -1 })
      .populate("host", "name email avatar");

    res.json({ success: true, meetings });
  } catch (err) {
    next(err);
  }
};
