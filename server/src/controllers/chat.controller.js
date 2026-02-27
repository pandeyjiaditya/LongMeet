const Message = require("../models/ChatMessage.model");

// Get chat history for a room (paginated)
exports.getRoomMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({ roomId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name avatar");

    const total = await Message.countDocuments({ roomId });

    res.json({
      success: true,
      messages: messages.reverse(), // oldest first for display
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// Delete all messages in a room
exports.clearRoomMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    await Message.deleteMany({ roomId });
    res.json({ success: true, message: "Chat history cleared" });
  } catch (err) {
    next(err);
  }
};
