import React, { useState } from "react";

const WatchParty = ({
  roomId,
  socket,
  user,
  isOpen,
  onClose,
  watchPartyHost,
  isController,
}) => {
  const [url, setUrl] = useState("");

  if (!isOpen) return null;

  const handleSetUrl = (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    let videoUrl = url.trim();
    const ytMatch = videoUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    if (ytMatch) {
      videoUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&enablejsapi=1`;
    }

    socket.emit("watch-party:set-url", {
      roomId,
      url: videoUrl,
      userName: user?.name,
    });
    setUrl("");
  };

  const handleStop = () => {
    socket.emit("watch-party:stop", { roomId, userName: user?.name });
  };

  const handleRequestControl = () => {
    socket.emit("request-control", {
      roomId,
      type: "watch-party",
      userName: user?.name,
    });
  };

  return (
    <div className="watch-party-panel">
      <div className="watch-party-header">
        <h3>🎬 Watch Party</h3>
        <button onClick={onClose} className="close-btn">
          ✕
        </button>
      </div>

      {watchPartyHost && (
        <div className="watch-party-host-info">
          <span className="host-badge">🎮 Controller:</span>{" "}
          <strong>{isController ? "You" : watchPartyHost.userName}</strong>
          {!isController && (
            <button
              onClick={handleRequestControl}
              className="btn btn-outline request-control-btn"
            >
              Request Control
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSetUrl} className="watch-party-form">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste video URL (YouTube, MP4, etc.)"
          required
        />
        <button type="submit" className="btn btn-primary">
          Share
        </button>
      </form>

      <div className="watch-party-info">
        <p>Paste any video URL to watch together with everyone in this room.</p>
        <p>
          <strong>Supported:</strong>
        </p>
        <ul>
          <li>YouTube links</li>
          <li>Direct video URLs (.mp4, .webm)</li>
          <li>Any embeddable video URL</li>
        </ul>
      </div>

      <button onClick={handleStop} className="btn btn-outline stop-party-btn">
        Stop Watch Party
      </button>
    </div>
  );
};

export default WatchParty;
