import React from "react";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className="home-container">
      <nav className="navbar">
        <h1 className="logo">LongMeet</h1>
        <div className="nav-links">
          <Link to="/login" className="btn btn-outline">
            Login
          </Link>
          <Link to="/register" className="btn btn-primary">
            Sign Up
          </Link>
        </div>
      </nav>
      <main className="hero">
        <h2>Video meetings for everyone</h2>
        <p>Secure, high-quality video calls. Connect with anyone, anywhere.</p>
        <Link to="/register" className="btn btn-primary btn-lg">
          Get Started — It's Free
        </Link>
      </main>
    </div>
  );
};

export default Home;
