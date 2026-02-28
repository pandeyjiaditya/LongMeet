const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const meetingRoutes = require("./routes/meeting.routes");
const userRoutes = require("./routes/user.routes");
const roomRoutes = require("./routes/room.routes");
const chatRoutes = require("./routes/chat.routes");

const app = express();

const rawClientUrl = (
  process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/+$/, "");
const allowedOrigins = [rawClientUrl];
if (rawClientUrl.startsWith("https://"))
  allowedOrigins.push(rawClientUrl.replace("https://", "http://"));
if (rawClientUrl.startsWith("http://"))
  allowedOrigins.push(rawClientUrl.replace("http://", "https://"));

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "LongMeet API" });
});

app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/chat", chatRoutes);

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
