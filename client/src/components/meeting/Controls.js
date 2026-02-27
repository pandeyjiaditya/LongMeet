import React from "react";

const Controls = ({
  audioEnabled,
  videoEnabled,
  screenSharing,
  memberCount,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
  onToggleChat,
  onToggleWatchParty,
}) => {
  return (
    <div className="controls-bar">
      {/* Member count badge */}
      <div className="member-count" title="Participants in this meeting">
        <span className="member-icon">👥</span>
        <span className="member-number">{memberCount || 1}</span>
      </div>

      <div className="controls-center">
        <button
          onClick={onToggleAudio}
          className={`control-btn ${!audioEnabled ? "off" : ""}`}
          title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          <span className="ctrl-icon">{audioEnabled ? "🎤" : "🔇"}</span>
          <span className="ctrl-label">{audioEnabled ? "Mute" : "Unmute"}</span>
        </button>
        <button
          onClick={onToggleVideo}
          className={`control-btn ${!videoEnabled ? "off" : ""}`}
          title={videoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          <span className="ctrl-icon">{videoEnabled ? "📹" : "📷"}</span>
          <span className="ctrl-label">
            {videoEnabled ? "Cam Off" : "Cam On"}
          </span>
        </button>
        <button
          onClick={onToggleScreenShare}
          className={`control-btn ${screenSharing ? "screen-active" : ""}`}
          title={screenSharing ? "Stop sharing screen" : "Share your screen"}
        >
          <span className="ctrl-icon">{screenSharing ? "🚫" : "🖥️"}</span>
          <span className="ctrl-label">
            {screenSharing ? "Stop Share" : "Screen"}
          </span>
        </button>
        <button
          onClick={onToggleChat}
          className="control-btn"
          title="Toggle chat"
        >
          <span className="ctrl-icon">💬</span>
          <span className="ctrl-label">Chat</span>
        </button>
        <button
          onClick={onToggleWatchParty}
          className="control-btn watch-btn"
          title="Watch Party"
        >
          <span className="ctrl-icon">🎬</span>
          <span className="ctrl-label">Watch</span>
        </button>
      </div>

      <button
        onClick={onLeave}
        className="control-btn leave-btn"
        title="Leave meeting"
      >
        <span className="ctrl-icon">📞</span>
        <span className="ctrl-label">Leave</span>
      </button>
    </div>
  );
};

export default Controls;
