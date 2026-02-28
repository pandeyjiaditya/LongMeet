const { Server } = require("socket.io");
const Message = require("../models/ChatMessage.model");
const Room = require("../models/Room.model");

let io;

const rooms = new Map();
const watchParties = new Map();
const screenShares = new Map();
const meetingHosts = new Map();
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

const initSocket = (server) => {
  const rawClientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  const base = rawClientUrl.replace(/\/+$/, "");
  const origins = [base];
  if (base.startsWith("https://"))
    origins.push(base.replace("https://", "http://"));
  if (base.startsWith("http://"))
    origins.push(base.replace("http://", "https://"));

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
    const admitUserToRoom = async (
      roomId,
      targetSocket,
      userId,
      userName,
      avatar,
    ) => {
      targetSocket.join(roomId);

      addUserToRoom(roomId, targetSocket.id, {
        userId,
        userName,
        avatar: avatar || "",
      });

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

      targetSocket.to(roomId).emit("user-joined", {
        userId,
        userName,
        avatar: avatar || "",
        socketId: targetSocket.id,
      });

      const existingUsers = getRoomUsers(roomId).filter(
        (u) => u.socketId !== targetSocket.id,
      );
      targetSocket.emit("all-users", existingUsers);

      io.to(roomId).emit("room-users", getRoomUsers(roomId));

      const systemMsg = {
        roomId,
        userId,
        userName: "System",
        message: `${userName} joined the room`,
        timestamp: new Date(),
      };
      io.to(roomId).emit("chat-message", systemMsg);
    };

    socket.on(
      "join-room",
      async ({ roomId, userId, userName, avatar, isHost }) => {
        if (isHost) {
          meetingHosts.set(roomId, { socketId: socket.id, userId, userName });
        }

        await admitUserToRoom(roomId, socket, userId, userName, avatar);
      },
    );

    socket.on("join-request", ({ roomId, userId, userName, avatar }) => {
      const host = meetingHosts.get(roomId);
      if (!host) {
        socket.emit("join-request-rejected", {
          message:
            "The host has not started this meeting yet. Please try again later.",
        });
        return;
      }

      if (!pendingRequests.has(roomId)) pendingRequests.set(roomId, new Map());
      pendingRequests
        .get(roomId)
        .set(socket.id, { userId, userName, avatar: avatar || "" });

      io.to(host.socketId).emit("join-request-received", {
        socketId: socket.id,
        userId,
        userName,
      });

      const pending = Array.from(pendingRequests.get(roomId).entries()).map(
        ([sid, data]) => ({ socketId: sid, ...data }),
      );
      io.to(host.socketId).emit("pending-requests", pending);
    });

    socket.on("join-request-accepted", async ({ roomId, targetSocketId }) => {
      const host = meetingHosts.get(roomId);
      if (!host || host.socketId !== socket.id) return;

      const pending = pendingRequests.get(roomId);
      if (!pending || !pending.has(targetSocketId)) return;

      const userData = pending.get(targetSocketId);
      pending.delete(targetSocketId);

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

      const remaining = Array.from(pending.entries()).map(([sid, data]) => ({
        socketId: sid,
        ...data,
      }));
      socket.emit("pending-requests", remaining);
    });

    socket.on("join-request-rejected", ({ roomId, targetSocketId }) => {
      const host = meetingHosts.get(roomId);
      if (!host || host.socketId !== socket.id) return;

      const pending = pendingRequests.get(roomId);
      if (!pending || !pending.has(targetSocketId)) return;

      const userData = pending.get(targetSocketId);
      pending.delete(targetSocketId);

      io.to(targetSocketId).emit("join-request-rejected", {
        message: "The host denied your request to join the meeting.",
      });

      const remaining = Array.from(pending.entries()).map(([sid, data]) => ({
        socketId: sid,
        ...data,
      }));
      socket.emit("pending-requests", remaining);
    });

    socket.on("remove-participant", ({ roomId, targetSocketId }) => {
      const host = meetingHosts.get(roomId);
      if (!host || host.socketId !== socket.id) return;

      const targetSock = io.sockets.sockets.get(targetSocketId);
      if (targetSock) {
        targetSock.emit("you-were-removed", {
          message: "You have been removed from the meeting by the host.",
        });
        handleLeave(targetSock, roomId);
      }
    });

    socket.on("leave-room", ({ roomId, userId }) => {
      handleLeave(socket, roomId);
    });

    socket.on("disconnect", () => {
      const roomId = findUserRoom(socket.id);
      if (roomId) handleLeave(socket, roomId);

      for (const [rid, pending] of pendingRequests) {
        if (pending.has(socket.id)) {
          pending.delete(socket.id);

          const host = meetingHosts.get(rid);
          if (host) {
            const remaining = Array.from(pending.entries()).map(
              ([sid, data]) => ({ socketId: sid, ...data }),
            );
            io.to(host.socketId).emit("pending-requests", remaining);
          }
        }
      }
    });

    socket.on("chat-message", async ({ roomId, userId, userName, message }) => {
      const chatMsg = {
        roomId,
        userId,
        userName,
        message,
        timestamp: new Date(),
      };

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

      io.to(roomId).emit("chat-message", chatMsg);
    });

    socket.on("offer", ({ to, offer }) => {
      socket.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ to, answer }) => {
      socket.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    socket.on("toggle-media", ({ roomId, userId, type, enabled }) => {
      socket.to(roomId).emit("user-toggle-media", {
        userId,
        socketId: socket.id,
        type,
        enabled,
      });
    });

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
        socketId: socket.id,
      });
    });

    socket.on("screen-share-stopped", ({ roomId, userId }) => {
      screenShares.delete(roomId);
      io.to(roomId).emit("screen-share-stopped", {
        userId,
        socketId: socket.id,
      });
    });

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
        io.to(hostSocketId).emit("control-request", {
          type,
          fromSocketId: socket.id,
          fromUserName: userName,
        });
      }
    });

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

    socket.on("deny-control", ({ type, toSocketId }) => {
      io.to(toSocketId).emit("control-denied", { type });
    });

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
    });

    socket.on("watch-party:request-sync", ({ roomId }) => {
      const state = watchParties.get(roomId);
      if (state) {
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

    socket.on("watch-party:seek", ({ roomId, currentTime, userName }) => {
      const state = watchParties.get(roomId);
      if (state) {
        state.currentTime = currentTime;
        state.lastUpdated = Date.now();
        state.updatedBy = userName;
      }
      socket.to(roomId).emit("watch-party:seek", { currentTime, userName });
    });

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

    socket.on("watch-party:stop", ({ roomId, userName }) => {
      watchParties.delete(roomId);
      io.to(roomId).emit("watch-party:stopped", { userName });
    });
  });

  return io;
};

const handleLeave = async (socket, roomId) => {
  const user = removeUserFromRoom(roomId, socket.id);
  socket.leave(roomId);

  if (user) {
    const host = meetingHosts.get(roomId);
    if (host && host.socketId === socket.id) {
      meetingHosts.delete(roomId);
      const pending = pendingRequests.get(roomId);
      if (pending) {
        for (const [sid] of pending) {
          io.to(sid).emit("join-request-rejected", {
            message: "The host has left the meeting.",
          });
        }
        pendingRequests.delete(roomId);
      }
      io.to(roomId).emit("host-left");
    }

    const ss = screenShares.get(roomId);
    if (ss && ss.hostSocketId === socket.id) {
      screenShares.delete(roomId);
      io.to(roomId).emit("screen-share-stopped", {
        userId: user.userId,
        socketId: socket.id,
      });
    }

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

    socket.to(roomId).emit("user-left", {
      userId: user.userId,
      userName: user.userName,
      socketId: socket.id,
    });

    io.to(roomId).emit("room-users", getRoomUsers(roomId));

    io.to(roomId).emit("chat-message", {
      roomId,
      userId: user.userId,
      userName: "System",
      message: `${user.userName} left the room`,
      timestamp: new Date(),
    });

    try {
      await Room.findOneAndUpdate(
        { roomId, "participants.socketId": socket.id },
        { $pull: { participants: { socketId: socket.id } } },
      );
    } catch (err) {
      console.error("DB: failed to remove participant", err.message);
    }
  }
};

const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
};

module.exports = { initSocket, getIO, getRoomUsers };
