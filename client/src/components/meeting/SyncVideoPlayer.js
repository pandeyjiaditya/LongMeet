import React, { useRef, useEffect, useState, useCallback } from "react";

const SYNC_INTERVAL = 3000;
const DRIFT_THRESHOLD = 1.5;

const SyncVideoPlayer = ({
  roomId,
  socket,
  user,
  videoUrl,
  onClose,
  isController,
  hostName,
}) => {
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const [status, setStatus] = useState("");
  const ignoreEvents = useRef(false);

  const isEmbed =
    videoUrl.includes("youtube.com/embed") ||
    videoUrl.includes("player.vimeo.com");
  const isDirectVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(videoUrl);

  useEffect(() => {
    if (!socket || !videoUrl) return;

    socket.emit("watch-party:request-sync", { roomId });

    const handleSync = (state) => {
      if (!videoRef.current) return;
      ignoreEvents.current = true;
      videoRef.current.currentTime = state.currentTime || 0;
      if (state.isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`Synced with ${state.updatedBy}`);
    };

    const handlePlay = ({ currentTime, userName }) => {
      if (!videoRef.current) return;
      ignoreEvents.current = true;
      videoRef.current.currentTime = currentTime;
      videoRef.current.play().catch(() => {});
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`▶ ${userName} pressed play`);
    };

    const handlePause = ({ currentTime, userName }) => {
      if (!videoRef.current) return;
      ignoreEvents.current = true;
      videoRef.current.currentTime = currentTime;
      videoRef.current.pause();
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`⏸ ${userName} paused`);
    };

    const handleSeek = ({ currentTime, userName }) => {
      if (!videoRef.current) return;
      ignoreEvents.current = true;
      videoRef.current.currentTime = currentTime;
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`⏩ ${userName} seeked`);
    };

    const handleTimeUpdate = ({ currentTime, isPlaying }) => {
      if (!videoRef.current || isController) return;
      const drift = Math.abs(videoRef.current.currentTime - currentTime);
      if (drift > DRIFT_THRESHOLD) {
        ignoreEvents.current = true;
        videoRef.current.currentTime = currentTime;
        setTimeout(() => {
          ignoreEvents.current = false;
        }, 300);
      }
      if (isPlaying && videoRef.current.paused) {
        ignoreEvents.current = true;
        videoRef.current.play().catch(() => {});
        setTimeout(() => {
          ignoreEvents.current = false;
        }, 300);
      } else if (!isPlaying && !videoRef.current.paused) {
        ignoreEvents.current = true;
        videoRef.current.pause();
        setTimeout(() => {
          ignoreEvents.current = false;
        }, 300);
      }
    };

    const handleStopped = ({ userName }) => {
      setStatus(`🛑 ${userName} stopped the watch party`);
      if (onClose) setTimeout(onClose, 1500);
    };

    socket.on("watch-party:sync", handleSync);
    socket.on("watch-party:play", handlePlay);
    socket.on("watch-party:pause", handlePause);
    socket.on("watch-party:seek", handleSeek);
    socket.on("watch-party:time-update", handleTimeUpdate);
    socket.on("watch-party:stopped", handleStopped);

    return () => {
      socket.off("watch-party:sync", handleSync);
      socket.off("watch-party:play", handlePlay);
      socket.off("watch-party:pause", handlePause);
      socket.off("watch-party:seek", handleSeek);
      socket.off("watch-party:time-update", handleTimeUpdate);
      socket.off("watch-party:stopped", handleStopped);
    };
  }, [socket, videoUrl, roomId, onClose, isController]);

  useEffect(() => {
    if (!isController || !socket || !videoRef.current) return;
    const interval = setInterval(() => {
      if (!videoRef.current) return;
      socket.emit("watch-party:time-update", {
        roomId,
        currentTime: videoRef.current.currentTime,
        isPlaying: !videoRef.current.paused,
      });
    }, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [isController, socket, roomId]);

  const onPlay = useCallback(() => {
    if (ignoreEvents.current || !videoRef.current || !isController) return;
    socket?.emit("watch-party:play", {
      roomId,
      currentTime: videoRef.current.currentTime,
      userName: user?.name,
    });
  }, [socket, roomId, user, isController]);

  const onPause = useCallback(() => {
    if (ignoreEvents.current || !videoRef.current || !isController) return;
    socket?.emit("watch-party:pause", {
      roomId,
      currentTime: videoRef.current.currentTime,
      userName: user?.name,
    });
  }, [socket, roomId, user, isController]);

  const onSeeked = useCallback(() => {
    if (ignoreEvents.current || !videoRef.current || !isController) return;
    socket?.emit("watch-party:seek", {
      roomId,
      currentTime: videoRef.current.currentTime,
      userName: user?.name,
    });
  }, [socket, roomId, user, isController]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(""), 3000);
    return () => clearTimeout(t);
  }, [status]);

  if (!videoUrl) return null;

  return (
    <div className="sync-player-overlay">
      <div className="sync-player-container">
        <div className="sync-player-header">
          <span>🎬 Watch Party</span>
          <span className="sync-host-label">
            {isController
              ? "🎮 You control"
              : `🎮 ${hostName || "Host"} controls`}
          </span>
          {status && <span className="sync-status">{status}</span>}
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        </div>

        <div className="sync-player-video" style={{ position: "relative" }}>
          {isDirectVideo ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls={isController}
              onPlay={onPlay}
              onPause={onPause}
              onSeeked={onSeeked}
              style={{ width: "100%", maxHeight: "70vh", background: "#000" }}
            />
          ) : isEmbed ? (
            <iframe
              ref={iframeRef}
              src={videoUrl}
              title="Watch Party"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "70vh", border: "none" }}
            />
          ) : (
            <iframe
              ref={iframeRef}
              src={videoUrl}
              title="Watch Party"
              allow="autoplay; fullscreen"
              allowFullScreen
              style={{ width: "100%", height: "70vh", border: "none" }}
            />
          )}

          {isDirectVideo && !isController && (
            <div className="sync-player-locked-overlay">
              <span>🔒 {hostName || "Host"} is controlling playback</span>
            </div>
          )}
        </div>

        <div className="sync-player-url">
          <span>Now watching:</span>
          <a href={videoUrl} target="_blank" rel="noopener noreferrer">
            {videoUrl.length > 60 ? videoUrl.slice(0, 60) + "..." : videoUrl}
          </a>
        </div>
      </div>
    </div>
  );
};

export default SyncVideoPlayer;
