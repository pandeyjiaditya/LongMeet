const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema(
  {
    meetingId: { type: String, required: true, unique: true },
    title: { type: String, default: "Untitled Meeting" },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        joinedAt: { type: Date, default: Date.now },
        leftAt: { type: Date },
      },
    ],
    isActive: { type: Boolean, default: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Meeting", meetingSchema);
