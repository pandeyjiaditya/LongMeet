import React, { useRef, useEffect } from "react";

const VideoPlayer = ({
  stream,
  muted = false,
  userName,
  videoRef,
  isScreenShare = false,
}) => {
  const internalRef = useRef(null);
  const ref = videoRef || internalRef;

  useEffect(() => {
    if (stream && ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-player ${isScreenShare ? "screen-share" : ""}`}>
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="video-label">
        {isScreenShare && <span className="screen-badge">🖥️</span>}
        {userName || "Participant"}
      </span>
    </div>
  );
};

export default VideoPlayer;
