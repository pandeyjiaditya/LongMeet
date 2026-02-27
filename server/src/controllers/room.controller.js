const { v4: uuidv4 } = require("uuid");
const Room = require("../models/Room.model");

// Create a new room
exports.createRoom = async (req, res, next) => {
  try {
    const roomId = uuidv4().slice(0, 8); // short readable room code
    const room = await Room.create({
      roomId,
    });
    res.status(201).json({ success: true, room });
  } catch (err) {
    next(err);
  }
};

// Get room details by roomId
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

// Get all rooms
exports.getActiveRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });

    res.json({ success: true, rooms });
  } catch (err) {
    next(err);
  }
};

// Get rooms the current user participated in
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

// Delete a room
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
