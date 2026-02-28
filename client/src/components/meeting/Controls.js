import React from "react";
import {
  MdMic,
  MdMicOff,
  MdVideocam,
  MdVideocamOff,
  MdScreenShare,
  MdStopScreenShare,
  MdChatBubble,
  MdMovie,
  MdCallEnd,
  MdCameraswitch,
  MdPeople,
} from "react-icons/md";

const Controls = ({
  audioEnabled,
  videoEnabled,
  screenSharing,
  memberCount,
  isHost,
  pendingCount,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onFlipCamera,
  onLeave,
  onToggleChat,
  onToggleWatchParty,
  onToggleParticipants,
  isParticipantsPanelOpen,
}) => {
  return (
    <div className="controls-bar">
      {/* Member count badge — also toggles participants panel */}
      <div
        className={`member-count ${isParticipantsPanelOpen ? "active" : ""}`}
        title="Participants in this meeting"
        onClick={onToggleParticipants}
        style={{ cursor: "pointer" }}
      >
        <span className="member-icon">
          <MdPeople />
        </span>
        {isHost && pendingCount > 0 && (
          <span className="pending-badge">{pendingCount}</span>
        )}
        <span className="member-number">{memberCount || 1}</span>
      </div>

      <div className="controls-center">
        <button
          onClick={onToggleAudio}
          className={`control-btn ${!audioEnabled ? "off" : ""}`}
          title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          <span className="ctrl-icon">
            {audioEnabled ? <MdMic /> : <MdMicOff />}
          </span>
          <span className="ctrl-label">{audioEnabled ? "Mute" : "Unmute"}</span>
        </button>
        <button
          onClick={onToggleVideo}
          className={`control-btn ${!videoEnabled ? "off" : ""}`}
          title={videoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          <span className="ctrl-icon">
            {videoEnabled ? <MdVideocam /> : <MdVideocamOff />}
          </span>
          <span className="ctrl-label">
            {videoEnabled ? "Cam Off" : "Cam On"}
          </span>
        </button>
        <button
          onClick={onToggleScreenShare}
          className={`control-btn ${screenSharing ? "screen-active" : ""}`}
          title={screenSharing ? "Stop sharing screen" : "Share your screen"}
        >
          <span className="ctrl-icon">
            {screenSharing ? <MdStopScreenShare /> : <MdScreenShare />}
          </span>
          <span className="ctrl-label">
            {screenSharing ? "Stop Share" : "Screen"}
          </span>
        </button>
        <button
          onClick={onFlipCamera}
          className="control-btn flip-camera-btn"
          title="Switch camera"
          disabled={!videoEnabled || screenSharing}
        >
          <span className="ctrl-icon">
            <MdCameraswitch />
          </span>
          <span className="ctrl-label">Flip</span>
        </button>
        <button
          onClick={onToggleChat}
          className="control-btn"
          title="Toggle chat"
        >
          <span className="ctrl-icon">
            <MdChatBubble />
          </span>
          <span className="ctrl-label">Chat</span>
        </button>
        <button
          onClick={onToggleWatchParty}
          className="control-btn watch-btn"
          title="Watch Party"
        >
          <span className="ctrl-icon">
            <MdMovie />
          </span>
          <span className="ctrl-label">Watch</span>
        </button>
      </div>

      <button
        onClick={onLeave}
        className="control-btn leave-btn"
        title="Leave meeting"
      >
        <span className="ctrl-icon">
          <MdCallEnd />
        </span>
        <span className="ctrl-label">Leave</span>
      </button>
    </div>
  );
};

export default Controls;
