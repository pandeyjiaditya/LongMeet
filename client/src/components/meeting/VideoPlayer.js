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
    if (stream && ref.current) ref.current.srcObject = stream;
  }, [stream, ref]);

  const getInitials = (name) =>
    name
      ? name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "?";

  const showCameraOff = !videoEnabled && !isScreenShare;

  return (
    <div
      className={`video-tile ${isScreenShare ? "screen-share" : ""} ${isPinned ? "pinned" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={showCameraOff ? "video-hidden" : ""}
      />

      {showCameraOff && (
        <div className="video-avatar-fallback">
          <div className="avatar-circle">
            {avatar ? (
              <img src={avatar} alt={userName} className="avatar-img" />
            ) : (
              <div className="avatar-initials">{getInitials(userName)}</div>
            )}
          </div>
          <span className="avatar-name">{userName || "Participant"}</span>
          {isHost && <span className="avatar-host-tag">Host</span>}
          {!audioEnabled && (
            <span className="avatar-muted-badge">
              <MdMicOff /> Muted
            </span>
          )}
        </div>
      )}

      <div className="video-bottom-bar">
        <div className="video-name-row">
          {!isScreenShare && (
            <span className="bottom-bar-avatar">
              {avatar ? (
                <img src={avatar} alt={userName} />
              ) : (
                <span className="bottom-bar-initials">
                  {getInitials(userName)}
                </span>
              )}
            </span>
          )}
          <span className="video-name-text">
            {isScreenShare && "🖥️ "}
            {userName || "Participant"}
            {isHost && <span className="host-tag">Host</span>}
          </span>
          <span className="media-indicators">
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
          </span>
        </div>
      </div>

      {onPin && (
        <>
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
