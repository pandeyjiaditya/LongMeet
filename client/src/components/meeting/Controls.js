import React from "react";

const Controls = ({
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onLeave,
  onToggleChat,
  onToggleWatchParty,
}) => {
  return (
    <div className="controls-bar">
      <button
        onClick={onToggleAudio}
        className={`control-btn ${!audioEnabled ? "off" : ""}`}
      >
        {audioEnabled ? "🎤" : "🔇"}
      </button>
      <button
        onClick={onToggleVideo}
        className={`control-btn ${!videoEnabled ? "off" : ""}`}
      >
        {videoEnabled ? "📹" : "📷"}
      </button>
      <button onClick={onToggleChat} className="control-btn">
        💬
      </button>
      <button onClick={onToggleWatchParty} className="control-btn watch-btn">
        🎬
      </button>
      <button onClick={onLeave} className="control-btn leave-btn">
        📞 Leave
      </button>
    </div>
  );
};

export default Controls;
