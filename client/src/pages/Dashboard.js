import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createMeeting } from "../services/meeting.service";

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

  return (
    <div className="dashboard-container">
      <nav className="navbar">
        <h1 className="logo">LongMeet</h1>
        <div className="nav-links">
          <span>Hi, {user?.name}</span>
          <button onClick={logout} className="btn btn-outline">
            Logout
          </button>
        </div>
      </nav>
      <main className="dashboard-main">
        <div className="dashboard-actions">
          <button onClick={handleNewMeeting} className="btn btn-primary btn-lg">
            + New Meeting
          </button>
          <form onSubmit={handleJoinMeeting} className="join-form">
            <input
              type="text"
              placeholder="Enter meeting code"
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
