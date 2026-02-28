import React, { useState, useRef, useEffect } from "react";
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
  MdGridView,
  MdFeaturedVideo,
  MdTv,
} from "react-icons/md";

const LAYOUT_OPTIONS = [
  {
    key: "gallery",
    label: "Gallery",
    icon: <MdGridView />,
    desc: "Equal grid for everyone",
  },
  {
    key: "spotlight",
    label: "Spotlight",
    icon: <MdFeaturedVideo />,
    desc: "One large + sidebar",
  },
  {
    key: "screenOnly",
    label: "Screen Only",
    icon: <MdTv />,
    desc: "Only shared screen",
  },
];

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
  layoutMode = "gallery",
  onChangeLayout,
  anyoneScreenSharing,
}) => {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layoutRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (layoutRef.current && !layoutRef.current.contains(e.target)) {
        setLayoutOpen(false);
      }
    };
    if (layoutOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [layoutOpen]);

  return (
    <div className="controls-bar">
      {/* Left: meeting info */}
      <div className="controls-left">
        <button
          className={`member-count ${isParticipantsPanelOpen ? "active" : ""}`}
          title="Participants"
          onClick={onToggleParticipants}
        >
          <span className="member-icon">
            <MdPeople />
          </span>
          {isHost && pendingCount > 0 && (
            <span className="pending-badge">{pendingCount}</span>
          )}
          <span className="member-number">{memberCount || 1}</span>
        </button>
      </div>

      {/* Center: main controls */}
      <div className="controls-center">
        <button
          onClick={onToggleAudio}
          className={`control-btn ${!audioEnabled ? "off" : ""}`}
          title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          <span className="ctrl-icon">
            {audioEnabled ? <MdMic /> : <MdMicOff />}
          </span>
        </button>
        <button
          onClick={onToggleVideo}
          className={`control-btn ${!videoEnabled ? "off" : ""}`}
          title={videoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          <span className="ctrl-icon">
            {videoEnabled ? <MdVideocam /> : <MdVideocamOff />}
          </span>
        </button>
        <button
          onClick={onToggleScreenShare}
          className={`control-btn ${screenSharing ? "screen-active" : ""}`}
          title={screenSharing ? "Stop sharing" : "Share screen"}
        >
          <span className="ctrl-icon">
            {screenSharing ? <MdStopScreenShare /> : <MdScreenShare />}
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
        </button>

        {/* Layout switcher */}
        <div className="layout-switcher-wrapper" ref={layoutRef}>
          <button
            onClick={() => setLayoutOpen((v) => !v)}
            className={`control-btn ${layoutOpen ? "active-panel" : ""}`}
            title="Change layout"
          >
            <span className="ctrl-icon">
              {LAYOUT_OPTIONS.find((o) => o.key === layoutMode)?.icon || (
                <MdGridView />
              )}
            </span>
          </button>
          {layoutOpen && (
            <div className="layout-dropdown">
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  className={`layout-option ${layoutMode === opt.key ? "active" : ""} ${opt.key === "screenOnly" && !anyoneScreenSharing ? "disabled" : ""}`}
                  onClick={() => {
                    if (opt.key === "screenOnly" && !anyoneScreenSharing)
                      return;
                    onChangeLayout(opt.key);
                    setLayoutOpen(false);
                  }}
                  title={
                    opt.key === "screenOnly" && !anyoneScreenSharing
                      ? "No screen share active"
                      : opt.desc
                  }
                >
                  <span className="layout-option-icon">{opt.icon}</span>
                  <div className="layout-option-text">
                    <span className="layout-option-label">{opt.label}</span>
                    <span className="layout-option-desc">{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onToggleChat}
          className={`control-btn ${false ? "active-panel" : ""}`}
          title="Chat"
        >
          <span className="ctrl-icon">
            <MdChatBubble />
          </span>
        </button>
        <button
          onClick={onToggleWatchParty}
          className="control-btn"
          title="Watch Party"
        >
          <span className="ctrl-icon">
            <MdMovie />
          </span>
        </button>

        {/* Leave button inline like GMeet */}
        <button
          onClick={onLeave}
          className="control-btn leave-btn"
          title="Leave meeting"
        >
          <span className="ctrl-icon">
            <MdCallEnd />
          </span>
        </button>
      </div>

      {/* Right: empty or future actions */}
      <div className="controls-right" />
    </div>
  );
};

export default Controls;
