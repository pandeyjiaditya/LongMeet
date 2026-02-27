import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import VideoPlayer from "../components/meeting/VideoPlayer";
import Controls from "../components/meeting/Controls";
import ChatPanel from "../components/meeting/ChatPanel";
import WatchParty from "../components/meeting/WatchParty";
import SyncVideoPlayer from "../components/meeting/SyncVideoPlayer";

// Free STUN/TURN servers for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

const Meeting = () => {
  const { meetingId } = useParams();
  const { user } = useAuth();
  const { socket, connectSocket } = useSocket();
  const navigate = useNavigate();

  // Peers: { [socketId]: { userName, stream, peerConnection } }
  const [peers, setPeers] = useState({});
  const [memberCount, setMemberCount] = useState(1);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isWatchPartyOpen, setIsWatchPartyOpen] = useState(false);
  const [watchPartyUrl, setWatchPartyUrl] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef({}); // mutable ref to track RTCPeerConnections
  const [streamReady, setStreamReady] = useState(false);

  // ─── Create a new RTCPeerConnection for a remote peer ─────────
  const createPeerConnection = useCallback(
    (remoteSocketId, remoteUserName, isInitiator) => {
      if (peersRef.current[remoteSocketId]) {
        // Already exists, skip
        return peersRef.current[remoteSocketId];
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add our local tracks to the connection
      const stream = screenStreamRef.current || localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      // When we receive remote tracks, set them on the peer's video
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setPeers((prev) => ({
          ...prev,
          [remoteSocketId]: {
            ...prev[remoteSocketId],
            userName: remoteUserName,
            stream: remoteStream,
          },
        }));
      };

      // Send ICE candidates to the remote peer
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("ice-candidate", {
            to: remoteSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `ICE state with ${remoteUserName}: ${pc.iceConnectionState}`,
        );
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          cleanupPeer(remoteSocketId);
        }
      };

      // Store it
      peersRef.current[remoteSocketId] = pc;
      setPeers((prev) => ({
        ...prev,
        [remoteSocketId]: {
          userName: remoteUserName,
          stream: null,
          ...prev[remoteSocketId],
        },
      }));

      return pc;
    },
    [socket],
  );

  // ─── Cleanup a peer connection ────────────────────────────────
  const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current[socketId];
    if (pc) {
      pc.close();
      delete peersRef.current[socketId];
    }
    setPeers((prev) => {
      const updated = { ...prev };
      delete updated[socketId];
      return updated;
    });
  }, []);

  // ─── Get local media stream ───────────────────────────────────
  useEffect(() => {
    connectSocket();

    const initStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setStreamReady(true);
      } catch (err) {
        console.error("Failed to get local stream:", err);
        // Try with just audio if video fails
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          localStreamRef.current = audioStream;
          if (localVideoRef.current)
            localVideoRef.current.srcObject = audioStream;
          setStreamReady(true);
        } catch (err2) {
          console.error("Failed to get any media:", err2);
          // Still allow joining without media
          setStreamReady(true);
        }
      }
    };

    initStream();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      // Close all peer connections
      Object.keys(peersRef.current).forEach((id) => {
        peersRef.current[id]?.close();
      });
      peersRef.current = {};
    };
  }, []);

  // ─── Socket event handlers for WebRTC signaling ───────────────
  useEffect(() => {
    if (!socket || !streamReady) return;

    // Tell the server we're joining
    socket.emit("join-room", {
      roomId: meetingId,
      userId: user?._id,
      userName: user?.name,
    });

    // ── Receive list of existing users → create offers to each ──
    socket.on("all-users", async (users) => {
      console.log("Existing users in room:", users);
      for (const u of users) {
        const pc = createPeerConnection(u.socketId, u.userName, true);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { to: u.socketId, offer });
          console.log(`📡 Sent offer to ${u.userName}`);
        } catch (err) {
          console.error("Failed to create offer:", err);
        }
      }
    });

    // ── A new user joined after us → they will send us an offer ─
    socket.on("user-joined", (data) => {
      console.log("User joined:", data.userName);
      // Don't create PC yet — wait for their offer
    });

    // ── Receive an offer → create answer ────────────────────────
    socket.on("offer", async ({ from, offer }) => {
      console.log(`📥 Received offer from ${from}`);
      // Find who this is from the room users
      const roomUsers = getRoomUsersFromPeers();
      const userName = roomUsers[from] || "Participant";

      const pc = createPeerConnection(from, userName, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: from, answer });
        console.log(`📡 Sent answer to ${from}`);
      } catch (err) {
        console.error("Failed to handle offer:", err);
      }
    });

    // ── Receive an answer ───────────────────────────────────────
    socket.on("answer", async ({ from, answer }) => {
      console.log(`📥 Received answer from ${from}`);
      const pc = peersRef.current[from];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error("Failed to set remote description:", err);
        }
      }
    });

    // ── Receive ICE candidate ───────────────────────────────────
    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Failed to add ICE candidate:", err);
        }
      }
    });

    // ── User left ───────────────────────────────────────────────
    socket.on("user-left", (data) => {
      console.log("User left:", data.userName);
      cleanupPeer(data.socketId);
    });

    // ── Room member count ───────────────────────────────────────
    socket.on("room-users", (users) => {
      setMemberCount(users.length);
    });

    // ── Media toggle from other users ───────────────────────────
    socket.on("user-toggle-media", ({ userId, type, enabled }) => {
      console.log(`User ${userId} toggled ${type}: ${enabled}`);
    });

    // ── Screen sharing events ───────────────────────────────────
    socket.on("screen-share-started", ({ userId }) => {
      console.log(`User ${userId} started screen sharing`);
    });

    socket.on("screen-share-stopped", ({ userId }) => {
      console.log(`User ${userId} stopped screen sharing`);
    });

    // ── Watch party events ──────────────────────────────────────
    socket.on("watch-party:url-changed", ({ url }) => {
      setWatchPartyUrl(url);
    });

    socket.on("watch-party:stopped", () => {
      setWatchPartyUrl(null);
    });

    return () => {
      socket.emit("leave-room", { roomId: meetingId, userId: user?._id });
      socket.off("all-users");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("room-users");
      socket.off("user-toggle-media");
      socket.off("screen-share-started");
      socket.off("screen-share-stopped");
      socket.off("watch-party:url-changed");
      socket.off("watch-party:stopped");
    };
  }, [socket, meetingId, streamReady, createPeerConnection, cleanupPeer]);

  // Helper: get userName by socketId from current peers
  const getRoomUsersFromPeers = () => {
    const map = {};
    Object.entries(peersRef.current).forEach(([socketId]) => {
      // Use state peers for name lookup
    });
    return map;
  };

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setAudioEnabled(audioTrack.enabled);
      socket?.emit("toggle-media", {
        roomId: meetingId,
        userId: user?._id,
        type: "audio",
        enabled: audioTrack.enabled,
      });
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
      socket?.emit("toggle-media", {
        roomId: meetingId,
        userId: user?._id,
        type: "video",
        enabled: videoTrack.enabled,
      });
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen sharing — revert to camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      // Replace tracks on all peer connections back to camera
      replaceTrackOnAllPeers(localStreamRef.current);
      setScreenSharing(false);
      socket?.emit("screen-share-stopped", {
        roomId: meetingId,
        userId: user?._id,
      });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screenStream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Replace video track on all peer connections with screen
        replaceTrackOnAllPeers(screenStream);

        setScreenSharing(true);
        socket?.emit("screen-share-started", {
          roomId: meetingId,
          userId: user?._id,
        });

        screenStream.getVideoTracks()[0].onended = () => {
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          replaceTrackOnAllPeers(localStreamRef.current);
          screenStreamRef.current = null;
          setScreenSharing(false);
          socket?.emit("screen-share-stopped", {
            roomId: meetingId,
            userId: user?._id,
          });
        };
      } catch (err) {
        console.error("Screen share failed:", err);
      }
    }
  };

  // Replace the video track on all active peer connections
  const replaceTrackOnAllPeers = (newStream) => {
    if (!newStream) return;
    const videoTrack = newStream.getVideoTracks()[0];
    if (!videoTrack) return;

    Object.values(peersRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(videoTrack).catch(console.error);
      }
    });
  };

  const leaveMeeting = () => {
    socket?.emit("leave-room", { roomId: meetingId, userId: user?._id });
    // Close all peer connections
    Object.keys(peersRef.current).forEach((id) => {
      peersRef.current[id]?.close();
    });
    peersRef.current = {};
    if (localStreamRef.current)
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    if (screenStreamRef.current)
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
    navigate("/dashboard");
  };

  return (
    <div className="meeting-container">
      {/* Meeting header with room info */}
      <div className="meeting-header">
        <div className="meeting-id">
          <span className="meeting-id-label">Room:</span>
          <span className="meeting-id-value">{meetingId}</span>
        </div>
        <div className="meeting-members">
          <span className="member-icon">👥</span>
          <span>
            {memberCount} participant{memberCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="video-grid">
        <VideoPlayer
          stream={localStreamRef.current}
          muted
          userName={screenSharing ? "You (Screen)" : "You"}
          videoRef={localVideoRef}
          isScreenShare={screenSharing}
        />
        {Object.entries(peers).map(([socketId, peer]) => (
          <VideoPlayer
            key={socketId}
            stream={peer.stream}
            userName={peer.userName}
          />
        ))}
      </div>
      <Controls
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        screenSharing={screenSharing}
        memberCount={memberCount}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onLeave={leaveMeeting}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onToggleWatchParty={() => setIsWatchPartyOpen(!isWatchPartyOpen)}
      />
      {isChatOpen && (
        <ChatPanel meetingId={meetingId} socket={socket} user={user} />
      )}
      <WatchParty
        roomId={meetingId}
        socket={socket}
        user={user}
        isOpen={isWatchPartyOpen}
        onClose={() => setIsWatchPartyOpen(false)}
      />
      {watchPartyUrl && (
        <SyncVideoPlayer
          roomId={meetingId}
          socket={socket}
          user={user}
          videoUrl={watchPartyUrl}
          onClose={() => setWatchPartyUrl(null)}
        />
      )}
    </div>
  );
};

export default Meeting;
