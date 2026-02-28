import React, { useRef, useEffect, useState, useCallback } from "react";

const SYNC_INTERVAL = 2000;
const DRIFT_THRESHOLD = 1.0;

/* ── YouTube IFrame API loader ── */
const loadYouTubeAPI = () =>
  new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const id = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(id);
          resolve();
        }
      }, 100);
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });

const getYouTubeVideoId = (url) => {
  const m = url.match(
    /(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
};

/* ────────────────────────────── */

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
  const ytPlayerRef = useRef(null);
  const ytReady = useRef(false);
  const [status, setStatus] = useState("");
  const ignoreEvents = useRef(false);
  const ytContainerId = useRef(`yt-wp-${roomId}-${Date.now()}`);

  const youtubeVideoId = getYouTubeVideoId(videoUrl);
  const isYouTube = !!youtubeVideoId;
  const isDirectVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(videoUrl);

  /* ── Helper: abstract player operations ── */
  const setPlayerTime = useCallback(
    (t) => {
      if (isYouTube && ytReady.current && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(t, true);
      } else if (videoRef.current) {
        videoRef.current.currentTime = t;
      }
    },
    [isYouTube],
  );

  const playPlayer = useCallback(() => {
    if (isYouTube && ytReady.current && ytPlayerRef.current) {
      ytPlayerRef.current.playVideo();
    } else if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [isYouTube]);

  const pausePlayer = useCallback(() => {
    if (isYouTube && ytReady.current && ytPlayerRef.current) {
      ytPlayerRef.current.pauseVideo();
    } else if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [isYouTube]);

  const getPlayerTime = useCallback(() => {
    if (isYouTube && ytReady.current && ytPlayerRef.current)
      return ytPlayerRef.current.getCurrentTime() || 0;
    if (videoRef.current) return videoRef.current.currentTime || 0;
    return 0;
  }, [isYouTube]);

  const isPlayerPaused = useCallback(() => {
    if (isYouTube && ytReady.current && ytPlayerRef.current) {
      const s = ytPlayerRef.current.getPlayerState();
      return s !== window.YT.PlayerState.PLAYING;
    }
    if (videoRef.current) return videoRef.current.paused;
    return true;
  }, [isYouTube]);

  /* ── YouTube Player setup (host gets controls, viewers don't) ── */
  useEffect(() => {
    if (!isYouTube) return;
    let player = null;
    let destroyed = false;

    const init = async () => {
      await loadYouTubeAPI();
      if (destroyed) return;
      player = new window.YT.Player(ytContainerId.current, {
        videoId: youtubeVideoId,
        playerVars: {
          autoplay: 0,
          controls: isController ? 1 : 0,
          disablekb: isController ? 0 : 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            ytPlayerRef.current = player;
            ytReady.current = true;
            socket?.emit("watch-party:request-sync", { roomId });
          },
          onStateChange: (e) => {
            if (!isController || ignoreEvents.current) return;
            const ct = player.getCurrentTime();
            if (e.data === window.YT.PlayerState.PLAYING) {
              socket?.emit("watch-party:play", {
                roomId,
                currentTime: ct,
                userName: user?.name,
              });
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              socket?.emit("watch-party:pause", {
                roomId,
                currentTime: ct,
                userName: user?.name,
              });
            }
          },
        },
      });
    };
    init();

    return () => {
      destroyed = true;
      ytReady.current = false;
      if (player && typeof player.destroy === "function") {
        try {
          player.destroy();
        } catch (_) {}
      }
      ytPlayerRef.current = null;
    };
  }, [isYouTube, youtubeVideoId, isController, socket, roomId, user]);

  /* ── Socket event handlers (shared for YT + direct video) ── */
  useEffect(() => {
    if (!socket || !videoUrl) return;

    if (!isYouTube) socket.emit("watch-party:request-sync", { roomId });

    const handleSync = (state) => {
      ignoreEvents.current = true;
      setPlayerTime(state.currentTime || 0);
      state.isPlaying ? playPlayer() : pausePlayer();
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`Synced with ${state.updatedBy}`);
    };

    const handlePlay = ({ currentTime, userName }) => {
      ignoreEvents.current = true;
      setPlayerTime(currentTime);
      playPlayer();
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`▶ ${userName} pressed play`);
    };

    const handlePause = ({ currentTime, userName }) => {
      ignoreEvents.current = true;
      setPlayerTime(currentTime);
      pausePlayer();
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`⏸ ${userName} paused`);
    };

    const handleSeek = ({ currentTime, userName }) => {
      ignoreEvents.current = true;
      setPlayerTime(currentTime);
      setTimeout(() => {
        ignoreEvents.current = false;
      }, 500);
      setStatus(`⏩ ${userName} seeked`);
    };

    const handleTimeUpdate = ({ currentTime, isPlaying }) => {
      if (isController) return;
      const drift = Math.abs(getPlayerTime() - currentTime);
      if (drift > DRIFT_THRESHOLD) {
        ignoreEvents.current = true;
        setPlayerTime(currentTime);
        setTimeout(() => {
          ignoreEvents.current = false;
        }, 300);
      }
      if (isPlaying && isPlayerPaused()) {
        ignoreEvents.current = true;
        playPlayer();
        setTimeout(() => {
          ignoreEvents.current = false;
        }, 300);
      } else if (!isPlaying && !isPlayerPaused()) {
        ignoreEvents.current = true;
        pausePlayer();
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
  }, [
    socket,
    videoUrl,
    roomId,
    onClose,
    isController,
    isYouTube,
    setPlayerTime,
    playPlayer,
    pausePlayer,
    getPlayerTime,
    isPlayerPaused,
  ]);

  /* ── Periodic time-sync from controller ── */
  useEffect(() => {
    if (!isController || !socket) return;
    const interval = setInterval(() => {
      socket.emit("watch-party:time-update", {
        roomId,
        currentTime: getPlayerTime(),
        isPlaying: !isPlayerPaused(),
      });
    }, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [isController, socket, roomId, getPlayerTime, isPlayerPaused]);

  /* ── Direct-video event handlers (host only) ── */
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

  /* ── Auto-clear status ── */
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
              : `🔒 ${hostName || "Host"} controls`}
          </span>
          {status && <span className="sync-status">{status}</span>}
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        </div>

        <div className="sync-player-video" style={{ position: "relative" }}>
          {isDirectVideo ? (
            <>
              <video
                ref={videoRef}
                src={videoUrl}
                controls={isController}
                onPlay={onPlay}
                onPause={onPause}
                onSeeked={onSeeked}
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  background: "#000",
                  pointerEvents: isController ? "auto" : "none",
                }}
              />
              {!isController && (
                <div className="sync-player-locked-overlay">
                  <span>🔒 {hostName || "Host"} is controlling playback</span>
                </div>
              )}
            </>
          ) : isYouTube ? (
            <>
              <div
                id={ytContainerId.current}
                style={{ width: "100%", height: "70vh" }}
              />
              {!isController && (
                <div
                  className="sync-player-locked-overlay"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "auto",
                    background: "transparent",
                    cursor: "not-allowed",
                    zIndex: 10,
                    pointerEvents: "all",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      bottom: "16px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(0,0,0,0.75)",
                      color: "#fff",
                      padding: "8px 18px",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔒 {hostName || "Host"} is controlling playback
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <iframe
                src={videoUrl}
                title="Watch Party"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                style={{
                  width: "100%",
                  height: "70vh",
                  border: "none",
                  pointerEvents: isController ? "auto" : "none",
                }}
              />
              {!isController && (
                <div
                  className="sync-player-locked-overlay"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "auto",
                    background: "transparent",
                    cursor: "not-allowed",
                    zIndex: 10,
                    pointerEvents: "all",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      bottom: "16px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(0,0,0,0.75)",
                      color: "#fff",
                      padding: "8px 18px",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔒 {hostName || "Host"} is controlling playback
                  </span>
                </div>
              )}
            </>
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
