import React from "react";
import { Link } from "react-router-dom";
import Logo from "../components/common/Logo";

const Home = () => {
  return (
    <div className="home-container">
      <nav className="navbar">
        <Logo />
        <div className="nav-links">
          <Link to="/login" className="btn btn-outline">
            Log In
          </Link>
          <Link to="/register" className="btn btn-primary">
            Join Free
          </Link>
        </div>
      </nav>
      <main className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />✨ Watch parties, screen share &
          more
        </div>
        <h2>
          Hang out,{" "}
          <span className="hero-gradient-text">no matter the distance</span>
        </h2>
        <p>
          Video hangs, watch parties, and late-night chats with your favorite
          people — no matter where they are. Always free.
        </p>
        <Link to="/register" className="btn btn-primary btn-lg">
          Start Hanging Out 🚀
        </Link>

        <div className="hero-tiles">
          <div className="hero-tile">
            <span className="hero-tile-icon">📹</span>
            <div>
              <h4>Video Hangouts</h4>
              <p>See your friends in crystal-clear quality</p>
            </div>
          </div>
          <div className="hero-tile">
            <span className="hero-tile-icon">🍿</span>
            <div>
              <h4>Movie Nights</h4>
              <p>Watch movies & videos together in sync</p>
            </div>
          </div>
          <div className="hero-tile">
            <span className="hero-tile-icon">🎮</span>
            <div>
              <h4>Just Vibes</h4>
              <p>Chat, share screens, and just hang out</p>
            </div>
          </div>
        </div>
      </main>
      <footer className="copyright-footer">
        <p>
          © {new Date().getFullYear()} <span>LongMeet</span> — Made by{" "}
          <span>Aditya Pandey</span>. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Home;
