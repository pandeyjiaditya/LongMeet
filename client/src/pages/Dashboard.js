import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createMeeting } from "../services/meeting.service";
import Logo from "../components/common/Logo";

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState("");

  const handleNewMeeting = async () => {
    try {
      const res = await createMeeting("New Meeting");
      navigate(`/meeting/${res.data.meeting.meetingId}`);
    } catch (err) {
      console.error("Failed to create meeting", err);
    }
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    if (joinId.trim()) navigate(`/meeting/${joinId.trim()}`);
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 5) return "Still up? \uD83C\uDF19";
    if (h < 12) return "Morning";
    if (h < 17) return "Hey there";
    if (h < 21) return "Evening vibes";
    return "Night owl? \uD83E\uDD89";
  };

  return (
    <div className="dashboard-container">
      <nav className="navbar">
        <Logo />
        <div className="nav-links">
          <span>Hi, {user?.name}</span>
          <Link to="/profile" className="btn btn-outline btn-sm">
            Profile
          </Link>
          <button onClick={logout} className="btn btn-outline">
            Logout
          </button>
        </div>
      </nav>
      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h2>
            {getGreeting()}, {user?.name?.split(" ")[0]} 👋
          </h2>
          <p>Ready to hang? Start a room or jump into one</p>
        </div>

        <div className="dashboard-actions">
          <div className="dashboard-tile" onClick={handleNewMeeting}>
            <span className="dashboard-tile-icon">🛋️</span>
            <h3>Start a Room</h3>
            <p>Create a hangout space</p>
          </div>
          <div
            className="dashboard-tile"
            onClick={() => document.getElementById("join-input")?.focus()}
          >
            <span className="dashboard-tile-icon">🤝</span>
            <h3>Join Friends</h3>
            <p>Hop into an existing room</p>
          </div>
          <div className="dashboard-tile" onClick={() => navigate("/profile")}>
            <span className="dashboard-tile-icon">✨</span>
            <h3>My Profile</h3>
            <p>Customize your vibe</p>
          </div>
        </div>

        <div className="dashboard-join-section">
          <span className="join-label">Got a room code?</span>
          <form onSubmit={handleJoinMeeting} className="join-form">
            <input
              id="join-input"
              type="text"
              placeholder="Paste room code here..."
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Join
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
