import React, { useState } from "react";
import {
  MdClose,
  MdMic,
  MdMicOff,
  MdVideocam,
  MdVideocamOff,
  MdPersonRemove,
} from "react-icons/md";

const ParticipantsPanel = ({
  roomUsers = [],
  peers = {},
  remoteMediaState = {},
  localUser,
  localAudioEnabled,
  localVideoEnabled,
  isHost,
  hostUserId,
  socketId,
  onRemoveParticipant,
  onClose,
}) => {
  const [search, setSearch] = useState("");

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isUserHost = (userId) => userId === hostUserId;

  // Sort: host first, then self, then alphabetical
  const sortedUsers = [...roomUsers]
    .sort((a, b) => {
      if (isUserHost(a.userId) && !isUserHost(b.userId)) return -1;
      if (!isUserHost(a.userId) && isUserHost(b.userId)) return 1;
      if (a.socketId === socketId) return -1;
      if (b.socketId === socketId) return 1;
      return (a.userName || "").localeCompare(b.userName || "");
    })
    .filter((u) =>
      search
        ? (u.userName || "").toLowerCase().includes(search.toLowerCase())
        : true,
    );

  return (
    <div className="participants-panel">
      <div className="participants-header">
        <h3>People ({roomUsers.length})</h3>
        <button className="participants-close-btn" onClick={onClose}>
          <MdClose />
        </button>
      </div>
      <div className="participants-search">
        <input
          type="text"
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="participants-section-label">In this call</div>
      <ul className="participants-list">
        {sortedUsers.map((u) => {
          const isSelf = u.socketId === socketId;
          const isThisHost = isUserHost(u.userId);
          const media = isSelf
            ? {
                audioEnabled: localAudioEnabled,
                videoEnabled: localVideoEnabled,
              }
            : remoteMediaState[u.socketId] || {
                audioEnabled: true,
                videoEnabled: true,
              };

          return (
            <li key={u.socketId} className="participant-item">
              <div className="participant-avatar-small">
                {u.avatar ? (
                  <img src={u.avatar} alt={u.userName} />
                ) : (
                  <span className="participant-initials">
                    {getInitials(u.userName)}
                  </span>
                )}
              </div>
              <div className="participant-info">
                <span className="participant-name">
                  {u.userName || "Participant"}
                  {isSelf && " (You)"}
                </span>
                {isThisHost && <span className="host-badge-small">Host</span>}
              </div>
              <div className="participant-media-icons">
                <span className={media.audioEnabled ? "media-on" : "media-off"}>
                  {media.audioEnabled ? <MdMic /> : <MdMicOff />}
                </span>
                <span className={media.videoEnabled ? "media-on" : "media-off"}>
                  {media.videoEnabled ? <MdVideocam /> : <MdVideocamOff />}
                </span>
              </div>
              {isHost && !isSelf && (
                <button
                  className="participant-remove-btn"
                  title={`Remove ${u.userName}`}
                  onClick={() => onRemoveParticipant(u.socketId)}
                >
                  <MdPersonRemove />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ParticipantsPanel;
