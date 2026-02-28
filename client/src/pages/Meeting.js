import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import api from "../services/api";
import VideoPlayer from "../components/meeting/VideoPlayer";
import Controls from "../components/meeting/Controls";
import ChatPanel from "../components/meeting/ChatPanel";
import WatchParty from "../components/meeting/WatchParty";
import SyncVideoPlayer from "../components/meeting/SyncVideoPlayer";
import ParticipantsPanel from "../components/meeting/ParticipantsPanel";

// STUN + TURN servers for reliable NAT traversal in production.
// STUN alone fails when both peers are behind symmetric NATs.
// Free TURN relays from OpenRelay (metered.ca) — replace with your
// own credentials for a production app.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "e8dd65b92f6de3da0a26c6e4",
      credential: "RiesKkytmSsJMPkp",
    },
    {
      urls: "turn:a.relay.metered.ca:80?transport=tcp",
      username: "e8dd65b92f6de3da0a26c6e4",
      credential: "RiesKkytmSsJMPkp",
    },
    {
      urls: "turn:a.relay.metered.ca:443",
      username: "e8dd65b92f6de3da0a26c6e4",
      credential: "RiesKkytmSsJMPkp",
    },
    {
      urls: "turns:a.relay.metered.ca:443?transport=tcp",
      username: "e8dd65b92f6de3da0a26c6e4",
      credential: "RiesKkytmSsJMPkp",
    },
  ],
  iceCandidatePoolSize: 10,
};

const Meeting = () => {
  const { meetingId } = useParams();
  const { user } = useAuth();
  const { socket, connectSocket } = useSocket();
  const navigate = useNavigate();

  // Peers: { [socketId]: { userName, avatar, stream, peerConnection } }
  const [peers, setPeers] = useState({});
  const [memberCount, setMemberCount] = useState(1);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isWatchPartyOpen, setIsWatchPartyOpen] = useState(false);
  const [watchPartyUrl, setWatchPartyUrl] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const chatHistoryLoadedRef = useRef(false);

  // Remote media state: { [socketId]: { audioEnabled: bool, videoEnabled: bool } }
  const [remoteMediaState, setRemoteMediaState] = useState({});
  // Pinned participant socketId (null = no pin, use grid layout)
  const [pinnedPeer, setPinnedPeer] = useState(null);
  // Participants panel visibility
  const [isParticipantsPanelOpen, setIsParticipantsPanelOpen] = useState(false);
  // Room users from server (with avatar, userId, userName, socketId)
  const [roomUsers, setRoomUsers] = useState([]);

  // Permission / control state
  const [watchPartyHost, setWatchPartyHost] = useState(null); // { socketId, userName }
  const [controlRequest, setControlRequest] = useState(null); // incoming request: { type, fromSocketId, fromUserName }
  const [controlNotice, setControlNotice] = useState(""); // transient notification

  // Host / admission control state
  const [isHost, setIsHost] = useState(false);
  const [hostCheckDone, setHostCheckDone] = useState(false); // true once we know if user is host
  const [admitted, setAdmitted] = useState(false); // true once user is in the meeting
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [requestDenied, setRequestDenied] = useState(false);
  const [requestDeniedMsg, setRequestDeniedMsg] = useState("");
  const [pendingRequests, setPendingRequests] = useState([]); // host sees these
  const [hostUserId, setHostUserId] = useState(null); // meeting host's userId

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef({}); // mutable ref to track RTCPeerConnections
  const [streamReady, setStreamReady] = useState(false);
  const facingModeRef = useRef("user"); // "user" = front, "environment" = back

  // ─── Create a new RTCPeerConnection for a remote peer ─────────
  const createPeerConnection = useCallback(
    (remoteSocketId, remoteUserName, isInitiator, remoteAvatar = "") => {
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
            avatar: prev[remoteSocketId]?.avatar || remoteAvatar,
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
          avatar: remoteAvatar,
          stream: null,
          ...prev[remoteSocketId],
        },
      }));
      // Initialize remote media state (assume enabled until told otherwise)
      setRemoteMediaState((prev) => ({
        ...prev,
        [remoteSocketId]: prev[remoteSocketId] || {
          audioEnabled: true,
          videoEnabled: true,
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
    setRemoteMediaState((prev) => {
      const updated = { ...prev };
      delete updated[socketId];
      return updated;
    });
    // Unpin if the pinned peer left
    setPinnedPeer((prev) => (prev === socketId ? null : prev));
  }, []);

  // ─── Get local media stream & check host status ────────────────
  useEffect(() => {
    connectSocket();

    // Fetch meeting info to determine if the current user is the host
    const checkHostStatus = async () => {
      try {
        const res = await api.get(`/meetings/${meetingId}`);
        const meeting = res.data?.meeting;
        if (meeting) {
          const hostId = meeting.host?._id || meeting.host;
          setHostUserId(hostId);
          if (hostId === user?._id) {
            setIsHost(true);
          }
        }
      } catch (err) {
        // Meeting may not exist in DB yet (fresh room) — creator is host
        console.log("Meeting not found in DB, treating as host:", err.message);
        setIsHost(true);
      } finally {
        setHostCheckDone(true);
      }
    };

    checkHostStatus();

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
          setVideoEnabled(false); // camera not available
          setStreamReady(true);
        } catch (err2) {
          console.error("Failed to get any media:", err2);
          // Still allow joining without media
          setVideoEnabled(false);
          setAudioEnabled(false);
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
    if (!socket || !streamReady || !hostCheckDone) return;

    // Wait until socket is actually connected before joining
    const joinOrRequest = () => {
      console.log(
        `🚪 Emitting join for ${meetingId}, socket connected: ${socket.connected}, isHost: ${isHost}`,
      );
      if (isHost) {
        // Host joins directly
        socket.emit("join-room", {
          roomId: meetingId,
          userId: user?._id,
          userName: user?.name,
          avatar: user?.avatar || "",
          isHost: true,
        });
        setAdmitted(true);
      } else {
        // Non-host: send a join request and wait for approval
        socket.emit("join-request", {
          roomId: meetingId,
          userId: user?._id,
          userName: user?.name,
          avatar: user?.avatar || "",
        });
        setWaitingForApproval(true);
      }
    };

    if (socket.connected) {
      joinOrRequest();
    } else {
      console.log("⏳ Socket not connected yet, waiting...");
      socket.once("connect", joinOrRequest);
    }

    // ── Host: incoming join requests ────────────────────────────
    socket.on("join-request-received", ({ socketId, userId, userName }) => {
      setPendingRequests((prev) => {
        if (prev.find((r) => r.socketId === socketId)) return prev;
        return [...prev, { socketId, userId, userName }];
      });
    });

    socket.on("pending-requests", (list) => {
      setPendingRequests(list);
    });

    // ── Non-host: join request accepted ─────────────────────────
    socket.on("join-request-accepted", () => {
      setWaitingForApproval(false);
      setAdmitted(true);
    });

    // ── Non-host: join request rejected ─────────────────────────
    socket.on("join-request-rejected", ({ message }) => {
      setWaitingForApproval(false);
      setRequestDenied(true);
      setRequestDeniedMsg(message || "Your request to join was denied.");
    });

    // ── Participant removed by host ─────────────────────────────
    socket.on("you-were-removed", ({ message }) => {
      alert(message || "You have been removed from the meeting.");
      navigate("/dashboard");
    });

    // ── Host left the meeting ───────────────────────────────────
    socket.on("host-left", () => {
      setControlNotice("The host has left the meeting.");
    });

    // ── Receive list of existing users → create offers to each ──
    socket.on("all-users", async (users) => {
      console.log("Existing users in room:", users);
      for (const u of users) {
        const pc = createPeerConnection(
          u.socketId,
          u.userName,
          true,
          u.avatar || "",
        );
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
      // Pre-store avatar + name so it's available when the offer arrives
      setPeers((prev) => ({
        ...prev,
        [data.socketId]: {
          ...prev[data.socketId],
          userName: data.userName,
          avatar: data.avatar || "",
          stream: prev[data.socketId]?.stream || null,
        },
      }));
    });

    // ── Receive an offer → create answer ────────────────────────
    socket.on("offer", async ({ from, offer }) => {
      console.log(`📥 Received offer from ${from}`);
      // Find who this is from the room users
      const roomUsers = getRoomUsersFromPeers();
      const userName = roomUsers[from] || "Participant";
      // Retrieve pre-stored avatar from peers state
      const peerAvatar = getPeerAvatar(from);

      const pc = createPeerConnection(from, userName, false, peerAvatar);
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
      setRoomUsers(users);
    });

    // ── Media toggle from other users ───────────────────────────
    socket.on(
      "user-toggle-media",
      ({ userId, socketId: sid, type, enabled }) => {
        console.log(`User ${userId} (${sid}) toggled ${type}: ${enabled}`);
        if (sid) {
          setRemoteMediaState((prev) => {
            const updated = { ...prev };
            if (!updated[sid])
              updated[sid] = { audioEnabled: true, videoEnabled: true };
            if (type === "audio") updated[sid].audioEnabled = enabled;
            if (type === "video") updated[sid].videoEnabled = enabled;
            return updated;
          });
        }
      },
    );

    // ── Screen sharing events ───────────────────────────────────
    socket.on("screen-share-started", ({ userId, userName, hostSocketId }) => {
      console.log(`User ${userName} started screen sharing`);
    });

    socket.on("screen-share-stopped", ({ userId }) => {
      console.log(`User ${userId} stopped screen sharing`);
    });

    // ── Permission / control events ─────────────────────────────
    socket.on("control-request", ({ type, fromSocketId, fromUserName }) => {
      setControlRequest({ type, fromSocketId, fromUserName });
    });

    socket.on("control-granted", ({ type, toSocketId, toUserName }) => {
      if (type === "watch-party") {
        setWatchPartyHost({ socketId: toSocketId, userName: toUserName });
      }
      if (toSocketId === socket.id) {
        setControlNotice(`You now have ${type} control`);
      } else {
        setControlNotice(`${toUserName} now controls ${type}`);
      }
    });

    socket.on("control-denied", ({ type }) => {
      setControlNotice(`Your ${type} control request was denied`);
    });

    // ── Chat messages ────────────────────────────────────────────
    socket.on("chat-message", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    // Load chat history from API on first connect
    if (!chatHistoryLoadedRef.current) {
      chatHistoryLoadedRef.current = true;
      api
        .get(`/chat/${meetingId}/messages`)
        .then((res) => {
          if (res.data?.messages?.length) {
            setChatMessages(res.data.messages);
          }
        })
        .catch((err) => console.error("Failed to load chat history:", err));
    }

    // ── Watch party events ──────────────────────────────────────
    socket.on("watch-party:url-changed", ({ url, hostSocketId, hostName }) => {
      setWatchPartyUrl(url);
      setWatchPartyHost({ socketId: hostSocketId, userName: hostName });
    });

    socket.on("watch-party:stopped", () => {
      setWatchPartyUrl(null);
      setWatchPartyHost(null);
    });

    return () => {
      if (admitted) {
        socket.emit("leave-room", { roomId: meetingId, userId: user?._id });
      }
      socket.off("connect");
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
      socket.off("control-request");
      socket.off("control-granted");
      socket.off("control-denied");
      socket.off("chat-message");
      socket.off("watch-party:url-changed");
      socket.off("watch-party:stopped");
      socket.off("join-request-received");
      socket.off("pending-requests");
      socket.off("join-request-accepted");
      socket.off("join-request-rejected");
      socket.off("you-were-removed");
      socket.off("host-left");
    };
  }, [
    socket,
    meetingId,
    streamReady,
    hostCheckDone,
    isHost,
    admitted,
    createPeerConnection,
    cleanupPeer,
  ]);

  // Helper: get userName by socketId from current peers
  const getRoomUsersFromPeers = () => {
    const map = {};
    Object.entries(peersRef.current).forEach(([socketId]) => {
      // Use state peers for name lookup
    });
    return map;
  };

  // Helper: get avatar for a given socketId from current peers state
  const getPeerAvatar = (socketId) => {
    // Try from peers state first, as it's set from user-joined
    const peerState = peers[socketId];
    return peerState?.avatar || "";
  };

  const toggleAudio = useCallback(async () => {
    if (audioEnabled) {
      // Turn OFF: stop audio track to fully release microphone hardware
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.stop();
        // Keep ended track in stream so new peer connections still create an audio sender
      }
      setAudioEnabled(false);
      socket?.emit("toggle-media", {
        roomId: meetingId,
        userId: user?._id,
        type: "audio",
        enabled: false,
      });
    } else {
      // Turn ON: re-acquire microphone
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const newAudioTrack = newStream.getAudioTracks()[0];
        // Swap the ended track for the new live track in the local stream
        const oldTrack = localStreamRef.current?.getAudioTracks()[0];
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current?.addTrack(newAudioTrack);
        // Replace audio track on every peer connection
        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) {
            sender.replaceTrack(newAudioTrack).catch(console.error);
          }
        });
        setAudioEnabled(true);
        socket?.emit("toggle-media", {
          roomId: meetingId,
          userId: user?._id,
          type: "audio",
          enabled: true,
        });
      } catch (err) {
        console.error("Failed to re-enable audio:", err);
      }
    }
  }, [audioEnabled, meetingId, socket, user]);

  const toggleVideo = useCallback(async () => {
    if (videoEnabled) {
      // Turn OFF: stop video track to fully release camera hardware
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        // Keep ended track in stream so new peer connections still create a video sender
      }
      // Re-assign srcObject so the <video> element shows a black frame
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setVideoEnabled(false);
      socket?.emit("toggle-media", {
        roomId: meetingId,
        userId: user?._id,
        type: "video",
        enabled: false,
      });
    } else {
      // Turn ON: re-acquire camera
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        // Swap the ended track for the new live track in the local stream
        const oldTrack = localStreamRef.current?.getVideoTracks()[0];
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current?.addTrack(newVideoTrack);
        // Replace video track on every peer connection
        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(console.error);
          }
        });
        // Update local video element with the restored camera
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        setVideoEnabled(true);
        socket?.emit("toggle-media", {
          roomId: meetingId,
          userId: user?._id,
          type: "video",
          enabled: true,
        });
      } catch (err) {
        console.error("Failed to re-enable video:", err);
      }
    }
  }, [videoEnabled, meetingId, socket, user]);

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
          userName: user?.name,
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

  // ─── Flip camera (mobile only) ────────────────────────────
  const flipCamera = useCallback(async () => {
    if (!videoEnabled || screenSharing) return;
    const newFacing = facingModeRef.current === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacing } },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      // Swap track in local stream
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        localStreamRef.current.removeTrack(oldTrack);
      }
      localStreamRef.current?.addTrack(newVideoTrack);
      // Update local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      // Replace video track on every peer connection
      Object.values(peersRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(newVideoTrack).catch(console.error);
        }
      });
      facingModeRef.current = newFacing;
    } catch (err) {
      console.error("Failed to flip camera:", err);
    }
  }, [videoEnabled, screenSharing]);

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

  // Auto-dismiss control notice
  useEffect(() => {
    if (!controlNotice) return;
    const t = setTimeout(() => setControlNotice(""), 4000);
    return () => clearTimeout(t);
  }, [controlNotice]);

  // ─── Host: accept / reject / remove helpers ───────────────────
  const handleAcceptRequest = (targetSocketId) => {
    socket?.emit("join-request-accepted", {
      roomId: meetingId,
      targetSocketId,
    });
  };

  const handleRejectRequest = (targetSocketId) => {
    socket?.emit("join-request-rejected", {
      roomId: meetingId,
      targetSocketId,
    });
  };

  const handleRemoveParticipant = (targetSocketId) => {
    socket?.emit("remove-participant", { roomId: meetingId, targetSocketId });
  };

  // ─── Waiting for approval screen (non-host) ──────────────────
  if (waitingForApproval) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <div className="lobby-spinner"></div>
          <h2>Waiting for the host to let you in</h2>
          <p>You'll join the meeting once the host accepts your request.</p>
          <p className="lobby-room-id">Room: {meetingId}</p>
          <button
            className="btn btn-outline"
            onClick={() => navigate("/dashboard")}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ─── Request denied screen ────────────────────────────────────
  if (requestDenied) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <div className="lobby-icon denied">✕</div>
          <h2>Request Denied</h2>
          <p>{requestDeniedMsg}</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Build peer entries list for rendering
  const peerEntries = Object.entries(peers);
  const pinnedEntry = pinnedPeer
    ? peerEntries.find(([sid]) => sid === pinnedPeer)
    : null;
  const unpinnedEntries = pinnedPeer
    ? peerEntries.filter(([sid]) => sid !== pinnedPeer)
    : peerEntries;

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

      <div className={`video-area ${pinnedPeer ? "has-pinned" : ""}`}>
        {/* Pinned (spotlight) view */}
        {pinnedEntry && (
          <div className="pinned-video-section">
            <VideoPlayer
              stream={pinnedEntry[1].stream}
              userName={pinnedEntry[1].userName}
              avatar={pinnedEntry[1].avatar}
              videoEnabled={
                remoteMediaState[pinnedEntry[0]]?.videoEnabled ?? true
              }
              audioEnabled={
                remoteMediaState[pinnedEntry[0]]?.audioEnabled ?? true
              }
              isPinned={true}
              onPin={() => setPinnedPeer(null)}
              isHost={
                roomUsers.find((u) => u.socketId === pinnedEntry[0])?.userId ===
                hostUserId
              }
            />
            {isHost && (
              <button
                className="remove-participant-btn"
                title={`Remove ${pinnedEntry[1].userName}`}
                onClick={() => handleRemoveParticipant(pinnedEntry[0])}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Grid of unpinned + local */}
        <div className={`video-grid ${pinnedPeer ? "sidebar-grid" : ""}`}>
          <VideoPlayer
            stream={localStreamRef.current}
            muted
            userName={
              screenSharing ? "You (Screen)" : isHost ? "You (Host)" : "You"
            }
            videoRef={localVideoRef}
            isScreenShare={screenSharing}
            isLocal={true}
            avatar={user?.avatar || ""}
            videoEnabled={videoEnabled}
            audioEnabled={audioEnabled}
            isHost={isHost}
          />
          {unpinnedEntries.map(([socketId, peer]) => (
            <div key={socketId} className="video-wrapper-outer">
              <VideoPlayer
                stream={peer.stream}
                userName={peer.userName}
                avatar={peer.avatar}
                videoEnabled={remoteMediaState[socketId]?.videoEnabled ?? true}
                audioEnabled={remoteMediaState[socketId]?.audioEnabled ?? true}
                isPinned={false}
                onPin={() => setPinnedPeer(socketId)}
                isHost={
                  roomUsers.find((u) => u.socketId === socketId)?.userId ===
                  hostUserId
                }
              />
              {isHost && (
                <button
                  className="remove-participant-btn"
                  title={`Remove ${peer.userName}`}
                  onClick={() => handleRemoveParticipant(socketId)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Controls
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        screenSharing={screenSharing}
        memberCount={memberCount}
        isHost={isHost}
        pendingCount={pendingRequests.length}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onFlipCamera={flipCamera}
        onLeave={leaveMeeting}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onToggleWatchParty={() => setIsWatchPartyOpen(!isWatchPartyOpen)}
        onToggleParticipants={() =>
          setIsParticipantsPanelOpen(!isParticipantsPanelOpen)
        }
        isParticipantsPanelOpen={isParticipantsPanelOpen}
      />
      {isChatOpen && (
        <ChatPanel
          meetingId={meetingId}
          socket={socket}
          user={user}
          messages={chatMessages}
          onClose={() => setIsChatOpen(false)}
        />
      )}
      {isParticipantsPanelOpen && (
        <ParticipantsPanel
          roomUsers={roomUsers}
          peers={peers}
          remoteMediaState={remoteMediaState}
          localUser={user}
          localAudioEnabled={audioEnabled}
          localVideoEnabled={videoEnabled}
          isHost={isHost}
          hostUserId={hostUserId}
          socketId={socket?.id}
          onRemoveParticipant={handleRemoveParticipant}
          onClose={() => setIsParticipantsPanelOpen(false)}
        />
      )}
      <WatchParty
        roomId={meetingId}
        socket={socket}
        user={user}
        isOpen={isWatchPartyOpen}
        onClose={() => setIsWatchPartyOpen(false)}
        watchPartyHost={watchPartyHost}
        isController={!watchPartyHost || watchPartyHost.socketId === socket?.id}
      />
      {watchPartyUrl && (
        <SyncVideoPlayer
          roomId={meetingId}
          socket={socket}
          user={user}
          videoUrl={watchPartyUrl}
          onClose={() => setWatchPartyUrl(null)}
          isController={
            !watchPartyHost || watchPartyHost.socketId === socket?.id
          }
          hostName={watchPartyHost?.userName}
        />
      )}

      {/* Permission request modal */}
      {controlRequest && (
        <div className="permission-modal-overlay">
          <div className="permission-modal">
            <p>
              <strong>{controlRequest.fromUserName}</strong> is requesting{" "}
              <strong>
                {controlRequest.type === "watch-party"
                  ? "Watch Party"
                  : "Screen Share"}
              </strong>{" "}
              control
            </p>
            <div className="permission-modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  socket?.emit("grant-control", {
                    roomId: meetingId,
                    type: controlRequest.type,
                    toSocketId: controlRequest.fromSocketId,
                    toUserName: controlRequest.fromUserName,
                  });
                  setControlRequest(null);
                }}
              >
                Allow
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  socket?.emit("deny-control", {
                    type: controlRequest.type,
                    toSocketId: controlRequest.fromSocketId,
                  });
                  setControlRequest(null);
                }}
              >
                Deny
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control transfer notification */}
      {controlNotice && (
        <div className="control-notice" onClick={() => setControlNotice("")}>
          {controlNotice}
        </div>
      )}

      {/* Host: Pending join requests panel */}
      {isHost && pendingRequests.length > 0 && (
        <div className="pending-requests-panel">
          <h3>Join Requests ({pendingRequests.length})</h3>
          <ul className="pending-requests-list">
            {pendingRequests.map((req) => (
              <li key={req.socketId} className="pending-request-item">
                <span className="pending-request-name">{req.userName}</span>
                <div className="pending-request-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleAcceptRequest(req.socketId)}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleRejectRequest(req.socketId)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Meeting;
