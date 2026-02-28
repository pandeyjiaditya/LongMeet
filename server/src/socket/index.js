const { Server } = require("socket.io");
const Message = require("../models/ChatMessage.model");
const Room = require("../models/Room.model");

let io;

// ─── In-memory room store ────────────────────────────────────────────
// rooms Map: roomId → Map<socketId, { userId, userName, joinedAt }>
const rooms = new Map();
// watchParty Map: roomId → { url, isPlaying, currentTime, lastUpdated, updatedBy, hostSocketId, hostName }
const watchParties = new Map();
// screenShare Map: roomId → { hostSocketId, hostName, hostUserId }
const screenShares = new Map();

const getRoomUsers = (roomId) => {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).values());
};

const addUserToRoom = (roomId, socketId, userData) => {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms
    .get(roomId)
    .set(socketId, { ...userData, socketId, joinedAt: new Date() });
};

const removeUserFromRoom = (roomId, socketId) => {
  if (!rooms.has(roomId)) return null;
  const user = rooms.get(roomId).get(socketId);
  rooms.get(roomId).delete(socketId);
  if (rooms.get(roomId).size === 0) rooms.delete(roomId);
  return user || null;
};

const findUserRoom = (socketId) => {
  for (const [roomId, members] of rooms) {
    if (members.has(socketId)) return roomId;
  }
  return null;
};

// ─── Socket.IO initialisation ────────────────────────────────────────
const initSocket = (server) => {
  const rawClientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  // Build an array of allowed origins (http + https, with & without trailing slash)
  const base = rawClientUrl.replace(/\/+$/, "");
  const origins = [base];
  if (base.startsWith("https://"))
    origins.push(base.replace("https://", "http://"));
  if (base.startsWith("http://"))
    origins.push(base.replace("http://", "https://"));

  console.log("🌐 Socket.IO allowed origins:", origins);

  io = new Server(server, {
    cors: {
      origin: origins,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // ── Join room ────────────────────────────────────────────────
    socket.on("join-room", async ({ roomId, userId, userName }) => {
      // Socket.IO room
      socket.join(roomId);

      // In-memory store
      addUserToRoom(roomId, socket.id, { userId, userName });

      // Persist participant in MongoDB
      try {
        await Room.findOneAndUpdate(
          { roomId },
          {
            $addToSet: {
              participants: { userId, name: userName, socketId: socket.id },
            },
          },
          { upsert: true, new: true },
        );
      } catch (err) {
        console.error("DB: failed to add participant", err.message);
      }

      // Broadcast to others in the room
      socket.to(roomId).emit("user-joined", {
        userId,
        userName,
        socketId: socket.id,
      });

      // Send the list of ALL existing users (excluding self) so the new
      // joiner can create peer connections to each of them.
      const existingUsers = getRoomUsers(roomId).filter(
        (u) => u.socketId !== socket.id,
      );
      socket.emit("all-users", existingUsers);

      // Send the full participant list to everyone for member count
      io.to(roomId).emit("room-users", getRoomUsers(roomId));

      // System message
      const systemMsg = {
        roomId,
        userId,
        userName: "System",
        message: `${userName} joined the room`,
        timestamp: new Date(),
      };
      io.to(roomId).emit("chat-message", systemMsg);

      console.log(
        `👤 ${userName} joined room ${roomId}  (${getRoomUsers(roomId).length} users)`,
      );
    });

    // ── Leave room (explicit) ────────────────────────────────────
    socket.on("leave-room", ({ roomId, userId }) => {
      handleLeave(socket, roomId);
    });

    // ── Disconnect (implicit) ────────────────────────────────────
    socket.on("disconnect", () => {
      const roomId = findUserRoom(socket.id);
      if (roomId) handleLeave(socket, roomId);
      console.log(`❌ User disconnected: ${socket.id}`);
    });

    // ── Real-time chat ───────────────────────────────────────────
    socket.on("chat-message", async ({ roomId, userId, userName, message }) => {
      const chatMsg = {
        roomId,
        userId,
        userName,
        message,
        timestamp: new Date(),
      };

      // Persist to MongoDB
      try {
        await Message.create({
          roomId,
          userId,
          userName,
          message,
        });
      } catch (err) {
        console.error("DB: failed to save chat message", err.message);
      }

      // Broadcast to everyone in the room (including sender for confirmation)
      io.to(roomId).emit("chat-message", chatMsg);
    });

    // ── WebRTC signaling ─────────────────────────────────────────
    socket.on("offer", ({ to, offer }) => {
      socket.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ to, answer }) => {
      socket.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    // ── Media toggles ────────────────────────────────────────────
    socket.on("toggle-media", ({ roomId, userId, type, enabled }) => {
      socket.to(roomId).emit("user-toggle-media", { userId, type, enabled });
    });

    // ── Screen sharing ───────────────────────────────────────────
    socket.on("screen-share-started", ({ roomId, userId, userName }) => {
      screenShares.set(roomId, {
        hostSocketId: socket.id,
        hostName: userName,
        hostUserId: userId,
      });
      io.to(roomId).emit("screen-share-started", {
        userId,
        userName,
        hostSocketId: socket.id,
      });
    });

    socket.on("screen-share-stopped", ({ roomId, userId }) => {
      screenShares.delete(roomId);
      io.to(roomId).emit("screen-share-stopped", { userId });
    });

    // ── Control permission requests ──────────────────────────────
    // User requests control of screen share or watch party
    socket.on("request-control", ({ roomId, type, userName }) => {
      let hostSocketId = null;
      if (type === "screen") {
        const ss = screenShares.get(roomId);
        hostSocketId = ss?.hostSocketId;
      } else if (type === "watch-party") {
        const wp = watchParties.get(roomId);
        hostSocketId = wp?.hostSocketId;
      }
      if (hostSocketId && hostSocketId !== socket.id) {
        // Send request to the host
        io.to(hostSocketId).emit("control-request", {
          type,
          fromSocketId: socket.id,
          fromUserName: userName,
        });
      }
    });

    // Host grants control
    socket.on("grant-control", ({ roomId, type, toSocketId, toUserName }) => {
      if (type === "watch-party") {
        const wp = watchParties.get(roomId);
        if (wp) {
          wp.hostSocketId = toSocketId;
          wp.hostName = toUserName;
          wp.updatedBy = toUserName;
        }
      } else if (type === "screen") {
        const ss = screenShares.get(roomId);
        if (ss) {
          ss.hostSocketId = toSocketId;
          ss.hostName = toUserName;
        }
      }
      io.to(roomId).emit("control-granted", {
        type,
        toSocketId,
        toUserName,
      });
    });

    // Host denies control
    socket.on("deny-control", ({ type, toSocketId }) => {
      io.to(toSocketId).emit("control-denied", { type });
    });

    // ── Watch Party — synced video/content ───────────────────────
    // Host sets a video URL for the room
    socket.on("watch-party:set-url", ({ roomId, url, userName }) => {
      watchParties.set(roomId, {
        url,
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now(),
        updatedBy: userName,
        hostSocketId: socket.id,
        hostName: userName,
      });
      io.to(roomId).emit("watch-party:url-changed", {
        url,
        userName,
        hostSocketId: socket.id,
        hostName: userName,
      });
      console.log(`🎬 ${userName} set watch URL in ${roomId}: ${url}`);
    });

    // Someone requests current watch-party state (e.g. on join)
    socket.on("watch-party:request-sync", ({ roomId }) => {
      const state = watchParties.get(roomId);
      if (state) {
        // Adjust currentTime based on elapsed time if playing
        let adjustedTime = state.currentTime;
        if (state.isPlaying && state.lastUpdated) {
          adjustedTime += (Date.now() - state.lastUpdated) / 1000;
        }
        socket.emit("watch-party:sync", {
          ...state,
          currentTime: adjustedTime,
        });
      }
    });

    // Play event
    socket.on("watch-party:play", ({ roomId, currentTime, userName }) => {
      const state = watchParties.get(roomId);
      if (state) {
        state.isPlaying = true;
        state.currentTime = currentTime;
        state.lastUpdated = Date.now();
        state.updatedBy = userName;
      }
      socket.to(roomId).emit("watch-party:play", { currentTime, userName });
    });

    // Pause event
    socket.on("watch-party:pause", ({ roomId, currentTime, userName }) => {
      const state = watchParties.get(roomId);
      if (state) {
        state.isPlaying = false;
        state.currentTime = currentTime;
        state.lastUpdated = Date.now();
        state.updatedBy = userName;
      }
      socket.to(roomId).emit("watch-party:pause", { currentTime, userName });
    });

    // Seek event
    socket.on("watch-party:seek", ({ roomId, currentTime, userName }) => {
      const state = watchParties.get(roomId);
      if (state) {
        state.currentTime = currentTime;
        state.lastUpdated = Date.now();
        state.updatedBy = userName;
      }
      socket.to(roomId).emit("watch-party:seek", { currentTime, userName });
    });

    // Periodic time sync — controller broadcasts their current time
    socket.on(
      "watch-party:time-update",
      ({ roomId, currentTime, isPlaying }) => {
        const state = watchParties.get(roomId);
        if (state) {
          state.currentTime = currentTime;
          state.isPlaying = isPlaying;
          state.lastUpdated = Date.now();
        }
        socket
          .to(roomId)
          .emit("watch-party:time-update", { currentTime, isPlaying });
      },
    );

    // Stop / close watch party
    socket.on("watch-party:stop", ({ roomId, userName }) => {
      watchParties.delete(roomId);
      io.to(roomId).emit("watch-party:stopped", { userName });
      console.log(`🛑 ${userName} stopped watch party in ${roomId}`);
    });
  });

  return io;
};

// ─── Helper: handle user leaving a room ──────────────────────────────
const handleLeave = async (socket, roomId) => {
  const user = removeUserFromRoom(roomId, socket.id);
  socket.leave(roomId);

  if (user) {
    // If this user was the screen share host, clean up
    const ss = screenShares.get(roomId);
    if (ss && ss.hostSocketId === socket.id) {
      screenShares.delete(roomId);
      io.to(roomId).emit("screen-share-stopped", { userId: user.userId });
    }

    // If this user was the watch party host, transfer to another user or stop
    const wp = watchParties.get(roomId);
    if (wp && wp.hostSocketId === socket.id) {
      const remaining = getRoomUsers(roomId).filter(
        (u) => u.socketId !== socket.id,
      );
      if (remaining.length > 0) {
        wp.hostSocketId = remaining[0].socketId;
        wp.hostName = remaining[0].userName;
        io.to(roomId).emit("control-granted", {
          type: "watch-party",
          toSocketId: remaining[0].socketId,
          toUserName: remaining[0].userName,
        });
      } else {
        watchParties.delete(roomId);
        io.to(roomId).emit("watch-party:stopped", { userName: user.userName });
      }
    }

    // Broadcast leave event
    socket.to(roomId).emit("user-left", {
      userId: user.userId,
      userName: user.userName,
      socketId: socket.id,
    });

    // Updated participant list
    io.to(roomId).emit("room-users", getRoomUsers(roomId));

    // System message
    io.to(roomId).emit("chat-message", {
      roomId,
      userId: user.userId,
      userName: "System",
      message: `${user.userName} left the room`,
      timestamp: new Date(),
    });

    // Update MongoDB
    try {
      await Room.findOneAndUpdate(
        { roomId, "participants.socketId": socket.id },
        { $pull: { participants: { socketId: socket.id } } },
      );
    } catch (err) {
      console.error("DB: failed to remove participant", err.message);
    }

    console.log(
      `👋 ${user.userName} left room ${roomId}  (${getRoomUsers(roomId).length} users)`,
    );
  }
};

// ─── Exports ─────────────────────────────────────────────────────────
const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
};

module.exports = { initSocket, getIO, getRoomUsers };
