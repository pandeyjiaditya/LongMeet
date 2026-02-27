import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import VideoPlayer from "../components/meeting/VideoPlayer";
import Controls from "../components/meeting/Controls";
import ChatPanel from "../components/meeting/ChatPanel";
import WatchParty from "../components/meeting/WatchParty";
import SyncVideoPlayer from "../components/meeting/SyncVideoPlayer";

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
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  useEffect(() => {
    connectSocket();
    startLocalStream();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.emit("join-room", {
      roomId: meetingId,
      userId: user?._id,
      userName: user?.name,
    });

    socket.on("user-joined", (data) => {
      console.log("User joined:", data);
      setPeers((prev) => ({ ...prev, [data.socketId]: data }));
    });

    socket.on("user-left", (data) => {
      setPeers((prev) => {
        const updated = { ...prev };
        delete updated[data.socketId];
        return updated;
      });
    });

    // Room users list — update member count
    socket.on("room-users", (users) => {
      setMemberCount(users.length);
    });

    // Another user started screen sharing
    socket.on("screen-share-started", ({ userId }) => {
      console.log(`User ${userId} started screen sharing`);
    });

    // Another user stopped screen sharing
    socket.on("screen-share-stopped", ({ userId }) => {
      console.log(`User ${userId} stopped screen sharing`);
    });

    // Watch party URL set by someone
    socket.on("watch-party:url-changed", ({ url }) => {
      setWatchPartyUrl(url);
    });

    // Watch party stopped
    socket.on("watch-party:stopped", () => {
      setWatchPartyUrl(null);
    });

    return () => {
      socket.emit("leave-room", { roomId: meetingId, userId: user?._id });
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("room-users");
      socket.off("screen-share-started");
      socket.off("screen-share-stopped");
      socket.off("watch-party:url-changed");
      socket.off("watch-party:stopped");
    };
  }, [socket, meetingId]);

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Failed to get local stream:", err);
    }
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
      // Restore camera stream to the video element
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setScreenSharing(false);
      socket?.emit("screen-share-stopped", {
        roomId: meetingId,
        userId: user?._id,
      });
    } else {
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screenStream;

        // Show screen share in local video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        setScreenSharing(true);
        socket?.emit("screen-share-started", {
          roomId: meetingId,
          userId: user?._id,
        });

        // When user stops sharing via browser UI button
        screenStream.getVideoTracks()[0].onended = () => {
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
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

  const leaveMeeting = () => {
    socket?.emit("leave-room", { roomId: meetingId, userId: user?._id });
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
        {Object.values(peers).map((peer) => (
          <VideoPlayer key={peer.socketId} userName={peer.userName} />
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
