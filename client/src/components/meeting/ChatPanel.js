import React, { useState, useEffect, useRef } from "react";
import { MdSend, MdClose } from "react-icons/md";

const ChatPanel = ({ meetingId, socket, user, messages = [], onClose }) => {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    socket.emit("chat-message", {
      roomId: meetingId,
      userId: user?._id,
      userName: user?.name,
      message: text.trim(),
    });
    setText("");
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>In-call messages</h3>
        <button className="chat-close-btn" onClick={onClose} title="Close chat">
          <MdClose />
        </button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span>
              Messages can only be seen by people in the call and are deleted
              when the call ends.
            </span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-message ${msg.userId === user?._id ? "chat-message-self" : ""} ${msg.userName === "System" ? "chat-message-system" : ""}`}
          >
            <strong>{msg.userId === user?._id ? "You" : msg.userName}: </strong>
            <span>{msg.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendMessage} className="chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message to everyone"
        />
        <button type="submit" title="Send">
          <MdSend />
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
