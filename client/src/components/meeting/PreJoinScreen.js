import React, { useRef, useEffect, useState } from "react";

const PreJoinScreen = ({
  localStream,
  userName,
  userAvatar,
  meetingId,
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onJoin,
  onCancel,
}) => {
  const videoRef = useRef(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, videoEnabled]);

  const handleJoin = () => {
    setJoining(true);
    onJoin();
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="prejoin-container">
      <div className="prejoin-card">
        <div className="prejoin-header">
          <h2>Ready to hang? 🎉</h2>
          <p className="prejoin-room-id">
            Room: <span>{meetingId}</span>
          </p>
        </div>

        {/* Camera preview */}
        <div className="prejoin-preview">
          {videoEnabled && localStream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="prejoin-video"
            />
          ) : (
            <div className="prejoin-video-off">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="prejoin-avatar-img"
                />
              ) : (
                <div className="prejoin-avatar-initials">
                  {getInitials(userName)}
                </div>
              )}
              <span className="prejoin-cam-off-label">Camera is off</span>
            </div>
          )}

          {/* Audio indicator */}
          {audioEnabled && (
            <div className="prejoin-audio-indicator">
              <span className="prejoin-audio-wave" />
              <span className="prejoin-audio-wave" />
              <span className="prejoin-audio-wave" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="prejoin-controls">
          <button
            className={`prejoin-toggle-btn ${!audioEnabled ? "off" : ""}`}
            onClick={onToggleAudio}
            title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            <span className="prejoin-toggle-icon">
              {audioEnabled ? "🎙️" : "🔇"}
            </span>
            <span className="prejoin-toggle-label">
              {audioEnabled ? "Mic On" : "Mic Off"}
            </span>
          </button>

          <button
            className={`prejoin-toggle-btn ${!videoEnabled ? "off" : ""}`}
            onClick={onToggleVideo}
            title={videoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            <span className="prejoin-toggle-icon">
              {videoEnabled ? "📹" : "📷"}
            </span>
            <span className="prejoin-toggle-label">
              {videoEnabled ? "Cam On" : "Cam Off"}
            </span>
          </button>
        </div>

        {/* Join / Cancel buttons */}
        <div className="prejoin-actions">
          <button
            className="btn btn-primary btn-lg prejoin-join-btn"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? "Joining..." : "Join Room "}
          </button>
          <button className="btn btn-outline" onClick={onCancel}>
            Go Back
          </button>
        </div>

        <p className="prejoin-hint">
          You can change your settings anytime during the hangout
        </p>
      </div>
    </div>
  );
};

export default PreJoinScreen;
