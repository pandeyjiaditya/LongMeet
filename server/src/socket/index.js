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
// meetingHosts Map: roomId → { socketId, userId, userName }
const meetingHosts = new Map();
// pendingRequests Map: roomId → Map<socketId, { userId, userName }>
const pendingRequests = new Map();

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

    // ── Helper: actually add a user to the room (shared by host join & accepted join) ──
    const admitUserToRoom = async (
      roomId,
      targetSocket,
      userId,
      userName,
      avatar,
    ) => {
      // Socket.IO room
      targetSocket.join(roomId);

      // In-memory store
      addUserToRoom(roomId, targetSocket.id, {
        userId,
        userName,
        avatar: avatar || "",
      });

      // Persist participant in MongoDB
      try {
        await Room.findOneAndUpdate(
          { roomId },
          {
            $addToSet: {
              participants: {
                userId,
                name: userName,
                socketId: targetSocket.id,
              },
            },
          },
          { upsert: true, new: true },
        );
      } catch (err) {
        console.error("DB: failed to add participant", err.message);
      }

      // Broadcast to others in the room
      targetSocket.to(roomId).emit("user-joined", {
        userId,
        userName,
        avatar: avatar || "",
        socketId: targetSocket.id,
      });

      // Send the list of ALL existing users (excluding self) so the new
      // joiner can create peer connections to each of them.
      const existingUsers = getRoomUsers(roomId).filter(
        (u) => u.socketId !== targetSocket.id,
      );
      targetSocket.emit("all-users", existingUsers);

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
    };

    // ── Join room (host joins directly) ──────────────────────────
    socket.on(
      "join-room",
      async ({ roomId, userId, userName, avatar, isHost }) => {
        if (isHost) {
          // Register this user as the meeting host
          meetingHosts.set(roomId, { socketId: socket.id, userId, userName });
          console.log(`👑 ${userName} is the host of room ${roomId}`);
        }

        await admitUserToRoom(roomId, socket, userId, userName, avatar);
      },
    );

    // ── Join request (non-host participants) ─────────────────────
    socket.on("join-request", ({ roomId, userId, userName, avatar }) => {
      const host = meetingHosts.get(roomId);
      if (!host) {
        // No host connected yet — reject
        socket.emit("join-request-rejected", {
          message:
            "The host has not started this meeting yet. Please try again later.",
        });
        return;
      }

      // Store the pending request
      if (!pendingRequests.has(roomId)) pendingRequests.set(roomId, new Map());
      pendingRequests
        .get(roomId)
        .set(socket.id, { userId, userName, avatar: avatar || "" });

      // Notify the host about the join request
      io.to(host.socketId).emit("join-request-received", {
        socketId: socket.id,
        userId,
        userName,
      });

      // Send current pending list to host
      const pending = Array.from(pendingRequests.get(roomId).entries()).map(
        ([sid, data]) => ({ socketId: sid, ...data }),
      );
      io.to(host.socketId).emit("pending-requests", pending);

      console.log(`📩 ${userName} requested to join room ${roomId}`);
    });

    // ── Host accepts a join request ──────────────────────────────
    socket.on("join-request-accepted", async ({ roomId, targetSocketId }) => {
      const host = meetingHosts.get(roomId);
      if (!host || host.socketId !== socket.id) return; // only host can accept

      const pending = pendingRequests.get(roomId);
      if (!pending || !pending.has(targetSocketId)) return;

      const userData = pending.get(targetSocketId);
      pending.delete(targetSocketId);

      // Notify the accepted user
      const targetSock = io.sockets.sockets.get(targetSocketId);
      if (targetSock) {
        targetSock.emit("join-request-accepted", { roomId });
        await admitUserToRoom(
          roomId,
          targetSock,
          userData.userId,
          userData.userName,
          userData.avatar,
        );
      }

      // Send updated pending list to host
      const remaining = Array.from(pending.entries()).map(([sid, data]) => ({
        socketId: sid,
        ...data,
      }));
      socket.emit("pending-requests", remaining);

      console.log(`✅ Host accepted ${userData.userName} into room ${roomId}`);
    });

    // ── Host rejects a join request ──────────────────────────────
    socket.on("join-request-rejected", ({ roomId, targetSocketId }) => {
      const host = meetingHosts.get(roomId);
      if (!host || host.socketId !== socket.id) return; // only host can reject

      const pending = pendingRequests.get(roomId);
      if (!pending || !pending.has(targetSocketId)) return;

      const userData = pending.get(targetSocketId);
      pending.delete(targetSocketId);

      // Notify the rejected user
      io.to(targetSocketId).emit("join-request-rejected", {
        message: "The host denied your request to join the meeting.",
      });

      // Send updated pending list to host
      const remaining = Array.from(pending.entries()).map(([sid, data]) => ({
        socketId: sid,
        ...data,
      }));
      socket.emit("pending-requests", remaining);

      console.log(`❌ Host rejected ${userData.userName} from room ${roomId}`);
    });

    // ── Host removes a participant ───────────────────────────────
    socket.on("remove-participant", ({ roomId, targetSocketId }) => {
      const host = meetingHosts.get(roomId);
      if (!host || host.socketId !== socket.id) return; // only host can remove

      const targetSock = io.sockets.sockets.get(targetSocketId);
      if (targetSock) {
        // Notify the removed user
        targetSock.emit("you-were-removed", {
          message: "You have been removed from the meeting by the host.",
        });
        // Perform the leave
        handleLeave(targetSock, roomId);
      }

      console.log(
        `🚫 Host removed participant ${targetSocketId} from room ${roomId}`,
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

      // Also clean up any pending requests from this socket
      for (const [rid, pending] of pendingRequests) {
        if (pending.has(socket.id)) {
          pending.delete(socket.id);
          // Notify host that the pending request is gone
          const host = meetingHosts.get(rid);
          if (host) {
            const remaining = Array.from(pending.entries()).map(
              ([sid, data]) => ({ socketId: sid, ...data }),
            );
            io.to(host.socketId).emit("pending-requests", remaining);
          }
        }
      }

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
      socket
        .to(roomId)
        .emit("user-toggle-media", {
          userId,
          socketId: socket.id,
          type,
          enabled,
        });
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
    // If this user was the meeting host, clean up host & pending requests
    const host = meetingHosts.get(roomId);
    if (host && host.socketId === socket.id) {
      meetingHosts.delete(roomId);
      // Reject all pending requests since host left
      const pending = pendingRequests.get(roomId);
      if (pending) {
        for (const [sid] of pending) {
          io.to(sid).emit("join-request-rejected", {
            message: "The host has left the meeting.",
          });
        }
        pendingRequests.delete(roomId);
      }
      // Notify remaining participants that host left
      io.to(roomId).emit("host-left");
    }

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
