import React, { useRef, useEffect, useState } from "react";
import {
  MdMicOff,
  MdVideocamOff,
  MdPushPin,
  MdOutlinePushPin,
} from "react-icons/md";

const VideoPlayer = ({
  stream,
  muted = false,
  userName,
  videoRef,
  isScreenShare = false,
  isLocal = false,
  avatar = "",
  videoEnabled = true,
  audioEnabled = true,
  isPinned = false,
  onPin,
  isHost = false,
}) => {
  const internalRef = useRef(null);
  const ref = videoRef || internalRef;
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (stream && ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream, ref]);

  // Derive initials from userName
  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const showCameraOff = !videoEnabled && !isScreenShare;

  return (
    <div
      className={`video-tile ${isScreenShare ? "screen-share" : ""} ${isPinned ? "pinned" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video element — always mounted so ref stays stable */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={showCameraOff ? "video-hidden" : ""}
      />

      {/* Camera-off avatar fallback */}
      {showCameraOff && (
        <div className="video-avatar-fallback">
          {avatar ? (
            <img src={avatar} alt={userName} className="avatar-img" />
          ) : (
            <div className="avatar-initials">{getInitials(userName)}</div>
          )}
          <span className="avatar-name">{userName || "Participant"}</span>
        </div>
      )}

      {/* Bottom bar — always visible */}
      <div className="video-bottom-bar">
        <div className="video-name-row">
          {!audioEnabled && (
            <span className="media-indicator muted-icon">
              <MdMicOff />
            </span>
          )}
          {!videoEnabled && !isScreenShare && (
            <span className="media-indicator cam-off-icon">
              <MdVideocamOff />
            </span>
          )}
          <span className="video-name-text">
            {isScreenShare && "🖥️ "}
            {userName || "Participant"}
            {isHost && <span className="host-tag">Host</span>}
          </span>
        </div>
      </div>

      {/* Pin/Unpin controls */}
      {onPin && (
        <>
          {/* Hover overlay — pin button for unpinned tiles */}
          {!isPinned && hovered && (
            <div className="video-hover-overlay">
              <button
                className="pin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                }}
                title="Pin this participant"
              >
                <MdOutlinePushPin />
              </button>
            </div>
          )}
          {/* Always-visible unpin bar for pinned tile */}
          {isPinned && (
            <div className="video-unpin-overlay">
              <button
                className="unpin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                }}
                title="Unpin"
              >
                <MdPushPin />
                <span className="unpin-text">Unpin</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Pinned badge */}
      {isPinned && (
        <div className="pinned-indicator">
          <MdPushPin />
          <span>Pinned</span>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
