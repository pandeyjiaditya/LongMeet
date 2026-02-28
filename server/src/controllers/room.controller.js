const { v4: uuidv4 } = require("uuid");
const Room = require("../models/Room.model");

exports.createRoom = async (req, res, next) => {
  try {
    const roomId = uuidv4().slice(0, 8);
    const room = await Room.create({
      roomId,
    });
    res.status(201).json({ success: true, room });
  } catch (err) {
    next(err);
  }
};

exports.getRoom = async (req, res, next) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId }).populate(
      "participants.userId",
      "name email avatar",
    );

    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    res.json({ success: true, room });
  } catch (err) {
    next(err);
  }
};

exports.getActiveRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });

    res.json({ success: true, rooms });
  } catch (err) {
    next(err);
  }
};

exports.getMyRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find({
      "participants.userId": req.user.id,
    }).sort({ createdAt: -1 });

    res.json({ success: true, rooms });
  } catch (err) {
    next(err);
  }
};

exports.closeRoom = async (req, res, next) => {
  try {
    const room = await Room.findOneAndDelete({ roomId: req.params.roomId });
    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }
    res.json({ success: true, message: "Room deleted" });
  } catch (err) {
    next(err);
  }
};
