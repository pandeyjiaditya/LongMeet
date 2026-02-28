import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { MdContentCopy, MdCheck } from "react-icons/md";
import api from "../services/api";
import VideoPlayer from "../components/meeting/VideoPlayer";
import Controls from "../components/meeting/Controls";
import ChatPanel from "../components/meeting/ChatPanel";
import WatchParty from "../components/meeting/WatchParty";
import SyncVideoPlayer from "../components/meeting/SyncVideoPlayer";
import ParticipantsPanel from "../components/meeting/ParticipantsPanel";
import PreJoinScreen from "../components/meeting/PreJoinScreen";

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
  const hasJoinedRef = useRef(false);
  const [chatNotification, setChatNotification] = useState(null);

  const [remoteMediaState, setRemoteMediaState] = useState({});
  const [remoteScreenSharing, setRemoteScreenSharing] = useState({});
  const [pinnedPeer, setPinnedPeer] = useState(null);
  const [isParticipantsPanelOpen, setIsParticipantsPanelOpen] = useState(false);
  const [roomUsers, setRoomUsers] = useState([]);

  const [watchPartyHost, setWatchPartyHost] = useState(null);
  const [controlRequest, setControlRequest] = useState(null);
  const [controlNotice, setControlNotice] = useState("");

  const [isHost, setIsHost] = useState(false);
  const [hostCheckDone, setHostCheckDone] = useState(false);
  const [admitted, setAdmitted] = useState(false);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [requestDenied, setRequestDenied] = useState(false);
  const [requestDeniedMsg, setRequestDeniedMsg] = useState("");
  const [pendingRequests, setPendingRequests] = useState([]);
  const [hostUserId, setHostUserId] = useState(null);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localCameraPreviewRef = useRef(null);
  const peersRef = useRef({});
  const [streamReady, setStreamReady] = useState(false);
  const facingModeRef = useRef("user");
  const [readyToJoin, setReadyToJoin] = useState(false);
  const [preJoinAudio, setPreJoinAudio] = useState(true);
  const [preJoinVideo, setPreJoinVideo] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [layoutMode, setLayoutMode] = useState("gallery");

  useEffect(() => {
    const el = document.getElementById("meeting-clock");
    if (!el) return;
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [admitted]);

  const createPeerConnection = useCallback(
    (remoteSocketId, remoteUserName, isInitiator, remoteAvatar = "") => {
      if (peersRef.current[remoteSocketId])
        return peersRef.current[remoteSocketId];

      const pc = new RTCPeerConnection(ICE_SERVERS);

      const stream = screenStreamRef.current || localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

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

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("ice-candidate", {
            to: remoteSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          cleanupPeer(remoteSocketId);
        }
      };

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
    setRemoteScreenSharing((prev) => {
      const updated = { ...prev };
      delete updated[socketId];
      return updated;
    });
    setPinnedPeer((prev) => (prev === socketId ? null : prev));
  }, []);

  useEffect(() => {
    connectSocket();

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
      } catch {
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
      } catch {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          localStreamRef.current = audioStream;
          if (localVideoRef.current)
            localVideoRef.current.srcObject = audioStream;
          setVideoEnabled(false);
          setPreJoinVideo(false);
          setStreamReady(true);
        } catch {
          setVideoEnabled(false);
          setAudioEnabled(false);
          setPreJoinVideo(false);
          setPreJoinAudio(false);
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
      Object.keys(peersRef.current).forEach((id) => {
        peersRef.current[id]?.close();
      });
      peersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!socket || !streamReady || !hostCheckDone || !readyToJoin) return;

    if (!preJoinAudio) {
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) audioTrack.stop();
      setAudioEnabled(false);
    }
    if (!preJoinVideo) {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) videoTrack.stop();
      setVideoEnabled(false);
    }

    const joinOrRequest = () => {
      if (hasJoinedRef.current) return;
      hasJoinedRef.current = true;
      if (isHost) {
        socket.emit("join-room", {
          roomId: meetingId,
          userId: user?._id,
          userName: user?.name,
          avatar: user?.avatar || "",
          isHost: true,
        });
        setAdmitted(true);
      } else {
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
      socket.once("connect", joinOrRequest);
    }

    socket.on("join-request-received", ({ socketId, userId, userName }) => {
      setPendingRequests((prev) => {
        if (prev.find((r) => r.socketId === socketId)) return prev;
        return [...prev, { socketId, userId, userName }];
      });
    });

    socket.on("pending-requests", (list) => {
      setPendingRequests(list);
    });

    socket.on("join-request-accepted", () => {
      setWaitingForApproval(false);
      setAdmitted(true);
    });

    socket.on("join-request-rejected", ({ message }) => {
      setWaitingForApproval(false);
      setRequestDenied(true);
      setRequestDeniedMsg(message || "Your request to join was denied.");
    });

    socket.on("you-were-removed", ({ message }) => {
      alert(message || "You have been removed from the meeting.");
      navigate("/dashboard");
    });

    socket.on("host-left", () => {
      setControlNotice("The host has left the meeting.");
    });

    socket.on("all-users", async (users) => {
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
        } catch {}
      }
    });

    socket.on("user-joined", (data) => {
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

    socket.on("offer", async ({ from, offer }) => {
      const roomUsers = getRoomUsersFromPeers();
      const userName = roomUsers[from] || "Participant";
      const peerAvatar = getPeerAvatar(from);

      const pc = createPeerConnection(from, userName, false, peerAvatar);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: from, answer });
      } catch {}
    });

    socket.on("answer", async ({ from, answer }) => {
      const pc = peersRef.current[from];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch {}
      }
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      }
    });

    socket.on("user-left", (data) => {
      cleanupPeer(data.socketId);
    });

    socket.on("room-users", (users) => {
      setMemberCount(users.length);
      setRoomUsers(users);
    });

    socket.on(
      "user-toggle-media",
      ({ userId, socketId: sid, type, enabled }) => {
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

    socket.on("screen-share-started", ({ userId, userName, socketId: sId }) => {
      if (sId) {
        setRemoteScreenSharing((prev) => ({ ...prev, [sId]: true }));
      }
    });

    socket.on("screen-share-stopped", ({ userId, socketId: sId }) => {
      if (sId) {
        setRemoteScreenSharing((prev) => ({ ...prev, [sId]: false }));
      }
    });

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

    socket.on("chat-message", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (msg.userName !== "System" && msg.userId !== user?._id) {
        setChatNotification({ userName: msg.userName, message: msg.message });
      }
    });

    if (!chatHistoryLoadedRef.current) {
      chatHistoryLoadedRef.current = true;
      api
        .get(`/chat/${meetingId}/messages`)
        .then((res) => {
          if (res.data?.messages?.length) {
            setChatMessages(res.data.messages);
          }
        })
        .catch(() => {});
    }

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
    readyToJoin,
    isHost,
    createPeerConnection,
    cleanupPeer,
  ]);

  const getRoomUsersFromPeers = () => {
    const map = {};
    Object.entries(peersRef.current).forEach(([socketId]) => {});
    return map;
  };

  const getPeerAvatar = (socketId) => {
    const peerState = peers[socketId];
    return peerState?.avatar || "";
  };

  const toggleAudio = useCallback(async () => {
    if (audioEnabled) {
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) audioTrack.stop();
      setAudioEnabled(false);
      socket?.emit("toggle-media", {
        roomId: meetingId,
        userId: user?._id,
        type: "audio",
        enabled: false,
      });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const newAudioTrack = newStream.getAudioTracks()[0];
        const oldTrack = localStreamRef.current?.getAudioTracks()[0];
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current?.addTrack(newAudioTrack);
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
      } catch {}
    }
  }, [audioEnabled, meetingId, socket, user]);

  const toggleVideo = useCallback(async () => {
    if (screenSharing) {
      if (videoEnabled) {
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        if (camTrack) camTrack.stop();
        setVideoEnabled(false);
      } else {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          const newVideoTrack = newStream.getVideoTracks()[0];
          const oldTrack = localStreamRef.current?.getVideoTracks()[0];
          if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
          localStreamRef.current?.addTrack(newVideoTrack);
          if (localCameraPreviewRef.current) {
            localCameraPreviewRef.current.srcObject = localStreamRef.current;
          }
          setVideoEnabled(true);
        } catch {}
      }
      return;
    }

    if (videoEnabled) {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) videoTrack.stop();
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
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldTrack = localStreamRef.current?.getVideoTracks()[0];
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current?.addTrack(newVideoTrack);
        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(console.error);
          }
        });
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
      } catch {}
    }
  }, [videoEnabled, screenSharing, meetingId, socket, user]);

  const toggleScreenShare = async () => {
    if (screenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (
        camTrack &&
        !camTrack.readyState?.includes?.("ended") &&
        videoEnabled
      ) {
        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(camTrack).catch(console.error);
          }
        });
      } else if (videoEnabled) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          const newTrack = newStream.getVideoTracks()[0];
          const oldTrack = localStreamRef.current?.getVideoTracks()[0];
          if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
          localStreamRef.current?.addTrack(newTrack);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          Object.values(peersRef.current).forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (sender) {
              sender.replaceTrack(newTrack).catch(console.error);
            }
          });
        } catch {}
      } else {
        replaceTrackOnAllPeers(localStreamRef.current);
      }

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

        const screenTrack = screenStream.getVideoTracks()[0];
        if (screenTrack) {
          Object.values(peersRef.current).forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (sender) {
              sender.replaceTrack(screenTrack).catch(console.error);
            }
          });
        }

        setScreenSharing(true);
        socket?.emit("screen-share-started", {
          roomId: meetingId,
          userId: user?._id,
          userName: user?.name,
        });

        screenTrack.onended = () => {
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack && camTrack.readyState === "live") {
            Object.values(peersRef.current).forEach((pc) => {
              const sender = pc
                .getSenders()
                .find((s) => s.track?.kind === "video");
              if (sender) {
                sender.replaceTrack(camTrack).catch(console.error);
              }
            });
          } else {
            replaceTrackOnAllPeers(localStreamRef.current);
          }
          screenStreamRef.current = null;
          setScreenSharing(false);
          socket?.emit("screen-share-stopped", {
            roomId: meetingId,
            userId: user?._id,
          });
        };
      } catch {}
    }
  };

  const flipCamera = useCallback(async () => {
    if (!videoEnabled || screenSharing) return;
    const newFacing = facingModeRef.current === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacing } },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        localStreamRef.current.removeTrack(oldTrack);
      }
      localStreamRef.current?.addTrack(newVideoTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      Object.values(peersRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(newVideoTrack).catch(console.error);
        }
      });
      facingModeRef.current = newFacing;
    } catch {}
  }, [videoEnabled, screenSharing]);

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

  useEffect(() => {
    if (!controlNotice) return;
    const t = setTimeout(() => setControlNotice(""), 4000);
    return () => clearTimeout(t);
  }, [controlNotice]);

  useEffect(() => {
    if (!chatNotification) return;
    const t = setTimeout(() => setChatNotification(null), 4000);
    return () => clearTimeout(t);
  }, [chatNotification]);

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

  const preJoinToggleAudio = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setPreJoinAudio(audioTrack.enabled);
    } else {
      setPreJoinAudio(false);
    }
  };

  const preJoinToggleVideo = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (preJoinVideo && videoTrack) {
      videoTrack.stop();
      setPreJoinVideo(false);
    } else if (!preJoinVideo) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = stream.getVideoTracks()[0];
        if (oldTrack) stream.removeTrack(oldTrack);
        stream.addTrack(newTrack);
        setPreJoinVideo(true);
      } catch {}
    }
  };

  const handlePreJoinReady = () => setReadyToJoin(true);

  useEffect(() => {
    if (
      screenSharing &&
      videoEnabled &&
      localCameraPreviewRef.current &&
      localStreamRef.current
    ) {
      localCameraPreviewRef.current.srcObject = localStreamRef.current;
    }
    if ((!screenSharing || !videoEnabled) && localCameraPreviewRef.current) {
      localCameraPreviewRef.current.srcObject = null;
    }
  }, [screenSharing, videoEnabled]);

  const peerEntries = Object.entries(peers);
  const isLocalPinned = pinnedPeer === "local";
  const pinnedEntry =
    pinnedPeer && pinnedPeer !== "local"
      ? peerEntries.find(([sid]) => sid === pinnedPeer)
      : null;
  const unpinnedEntries =
    pinnedPeer && pinnedPeer !== "local"
      ? peerEntries.filter(([sid]) => sid !== pinnedPeer)
      : peerEntries;

  const anyoneScreenSharing =
    screenSharing || Object.values(remoteScreenSharing).some((v) => v);

  const screenSharerSocketId = Object.entries(remoteScreenSharing).find(
    ([, v]) => v,
  )?.[0];

  const effectiveLayout =
    layoutMode === "screenOnly" && !anyoneScreenSharing
      ? "gallery"
      : layoutMode;

  const spotlightPinned =
    effectiveLayout === "spotlight"
      ? screenSharing
        ? "local"
        : screenSharerSocketId || peerEntries[0]?.[0] || null
      : null;

  const resolvedPin =
    effectiveLayout === "screenOnly"
      ? screenSharing
        ? "local"
        : screenSharerSocketId || null
      : effectiveLayout === "spotlight"
        ? spotlightPinned
        : pinnedPeer;

  const resolvedPinnedEntry =
    resolvedPin && resolvedPin !== "local"
      ? peerEntries.find(([sid]) => sid === resolvedPin)
      : null;
  const resolvedIsLocalPinned = resolvedPin === "local";
  const resolvedUnpinnedEntries =
    resolvedPin && resolvedPin !== "local"
      ? peerEntries.filter(([sid]) => sid !== resolvedPin)
      : peerEntries;

  const totalInGrid = resolvedIsLocalPinned
    ? resolvedUnpinnedEntries.length
    : resolvedUnpinnedEntries.length + 1;
  const gridCountClass = resolvedPin
    ? "sidebar-grid"
    : `count-${Math.min(totalInGrid, 10)}`;

  if (!streamReady || !hostCheckDone) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <div className="lobby-spinner"></div>
          <h2>Setting things up...</h2>
          <p>Getting your camera & mic ready</p>
        </div>
      </div>
    );
  }

  if (streamReady && hostCheckDone && !readyToJoin) {
    return (
      <PreJoinScreen
        localStream={localStreamRef.current}
        userName={user?.name}
        userAvatar={user?.avatar}
        meetingId={meetingId}
        audioEnabled={preJoinAudio}
        videoEnabled={preJoinVideo}
        onToggleAudio={preJoinToggleAudio}
        onToggleVideo={preJoinToggleVideo}
        onJoin={handlePreJoinReady}
        onCancel={() => navigate("/dashboard")}
      />
    );
  }

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

  return (
    <div className="meeting-container">
      <div className="meeting-header">
        <div className="meeting-header-left">
          <span className="meeting-header-title">LongMeet</span>
          <div className="meeting-id-badge">
            <code>{meetingId}</code>
            <button
              className={`copy-id-btn${copiedId ? " copied" : ""}`}
              title="Copy meeting ID"
              onClick={() => {
                navigator.clipboard.writeText(meetingId).then(() => {
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 2000);
                });
              }}
            >
              {copiedId ? <MdCheck /> : <MdContentCopy />}
            </button>
          </div>
        </div>
        <div className="meeting-header-right">
          <span className="meeting-clock" id="meeting-clock" />
        </div>
      </div>

      <div
        className={`meeting-body${isChatOpen ? " chat-open" : ""}${isParticipantsPanelOpen ? " participants-open" : ""}`}
      >
        <div
          className={`video-area ${resolvedPin ? "has-pinned" : ""} layout-${effectiveLayout}`}
        >
          {resolvedPinnedEntry && (
            <div className="pinned-video-section">
              <VideoPlayer
                stream={resolvedPinnedEntry[1].stream}
                userName={resolvedPinnedEntry[1].userName}
                avatar={resolvedPinnedEntry[1].avatar}
                videoEnabled={
                  remoteMediaState[resolvedPinnedEntry[0]]?.videoEnabled ?? true
                }
                audioEnabled={
                  remoteMediaState[resolvedPinnedEntry[0]]?.audioEnabled ?? true
                }
                isScreenShare={!!remoteScreenSharing[resolvedPinnedEntry[0]]}
                isPinned={true}
                onPin={
                  effectiveLayout === "gallery"
                    ? () => setPinnedPeer(null)
                    : undefined
                }
                isHost={
                  roomUsers.find((u) => u.socketId === resolvedPinnedEntry[0])
                    ?.userId === hostUserId
                }
              />
              {isHost && (
                <button
                  className="remove-participant-btn"
                  title={`Remove ${resolvedPinnedEntry[1].userName}`}
                  onClick={() =>
                    handleRemoveParticipant(resolvedPinnedEntry[0])
                  }
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {resolvedIsLocalPinned && (
            <div className="pinned-video-section">
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
                isPinned={true}
                onPin={
                  effectiveLayout === "gallery"
                    ? () => setPinnedPeer(null)
                    : undefined
                }
                isHost={isHost}
              />
            </div>
          )}

          {screenSharing && videoEnabled && (
            <div className="screen-share-pip">
              <video
                ref={(el) => {
                  localCameraPreviewRef.current = el;
                  if (el && localStreamRef.current) {
                    el.srcObject = localStreamRef.current;
                  }
                }}
                autoPlay
                muted
                playsInline
              />
              <span className="pip-label">You</span>
            </div>
          )}

          {effectiveLayout !== "screenOnly" && (
            <div className={`video-grid ${gridCountClass}`}>
              {!resolvedIsLocalPinned && (
                <VideoPlayer
                  stream={localStreamRef.current}
                  muted
                  userName={
                    screenSharing
                      ? "You (Screen)"
                      : isHost
                        ? "You (Host)"
                        : "You"
                  }
                  videoRef={localVideoRef}
                  isScreenShare={screenSharing}
                  isLocal={true}
                  avatar={user?.avatar || ""}
                  videoEnabled={videoEnabled}
                  audioEnabled={audioEnabled}
                  onPin={() => setPinnedPeer("local")}
                  isHost={isHost}
                />
              )}
              {resolvedUnpinnedEntries.map(([socketId, peer]) => (
                <div key={socketId} className="video-wrapper-outer">
                  <VideoPlayer
                    stream={peer.stream}
                    userName={peer.userName}
                    avatar={peer.avatar}
                    videoEnabled={
                      remoteMediaState[socketId]?.videoEnabled ?? true
                    }
                    audioEnabled={
                      remoteMediaState[socketId]?.audioEnabled ?? true
                    }
                    isScreenShare={!!remoteScreenSharing[socketId]}
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
          )}
        </div>

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
        layoutMode={layoutMode}
        onChangeLayout={setLayoutMode}
        anyoneScreenSharing={anyoneScreenSharing}
      />
      <WatchParty
        roomId={meetingId}
        socket={socket}
        user={user}
        isOpen={isWatchPartyOpen}
        onClose={() => setIsWatchPartyOpen(false)}
        watchPartyHost={watchPartyHost}
        isController={isHost}
      />
      {watchPartyUrl && (
        <SyncVideoPlayer
          roomId={meetingId}
          socket={socket}
          user={user}
          videoUrl={watchPartyUrl}
          onClose={() => setWatchPartyUrl(null)}
          isController={isHost}
          hostName={watchPartyHost?.userName}
        />
      )}

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

      {controlNotice && (
        <div className="control-notice" onClick={() => setControlNotice("")}>
          {controlNotice}
        </div>
      )}

      {chatNotification && !isChatOpen && (
        <div
          className="chat-notification-toast"
          onClick={() => {
            setIsChatOpen(true);
            setChatNotification(null);
          }}
        >
          <strong>{chatNotification.userName}</strong>
          <span>
            {chatNotification.message.length > 60
              ? chatNotification.message.slice(0, 60) + "..."
              : chatNotification.message}
          </span>
        </div>
      )}

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
