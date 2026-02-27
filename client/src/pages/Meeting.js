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
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isWatchPartyOpen, setIsWatchPartyOpen] = useState(false);
  const [watchPartyUrl, setWatchPartyUrl] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    connectSocket();
    startLocalStream();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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

  const leaveMeeting = () => {
    socket?.emit("leave-room", { roomId: meetingId, userId: user?._id });
    if (localStreamRef.current)
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    navigate("/dashboard");
  };

  return (
    <div className="meeting-container">
      <div className="video-grid">
        <VideoPlayer
          stream={localStreamRef.current}
          muted
          userName="You"
          videoRef={localVideoRef}
        />
        {Object.values(peers).map((peer) => (
          <VideoPlayer key={peer.socketId} userName={peer.userName} />
        ))}
      </div>
      <Controls
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
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
