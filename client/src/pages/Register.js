import React, { useState, useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/common/Logo";

const GOOGLE_CLIENT_ID =
  process.env.REACT_APP_GOOGLE_CLIENT_ID ||
  "1052308984014-ej9fggc7q9gv569enie1rtd0untt4ho1.apps.googleusercontent.com";

const Register = () => {
  const { register, googleLogin, user, error, clearError } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const googleBtnRef = useRef(null);

  useEffect(() => {
    const initGoogle = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: "100%",
          text: "signup_with",
          shape: "rectangular",
        });
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initGoogle();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  const handleGoogleResponse = (response) => {
    if (response.credential) {
      clearError();
      googleLogin(response.credential);
    }
  };

  if (user) return <Navigate to="/dashboard" />;

  const handleSubmit = (e) => {
    e.preventDefault();
    clearError();
    register(form.name, form.email, form.password);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
        </div>
        <h2>Join the crew ✌️</h2>
        <p className="auth-subtitle">Set up in seconds, hang out forever</p>
        {error && <p className="error-text">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              placeholder="Full Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <span className="input-icon">👤</span>
          </div>
          <div className="input-group">
            <input
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <span className="input-icon">✉</span>
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
            <span className="input-icon">🔒</span>
          </div>
          <button type="submit" className="btn btn-primary">
            Let's Go
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div className="google-btn-wrapper" ref={googleBtnRef}></div>

        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <footer
          className="copyright-footer"
          style={{
            marginTop: "24px",
            border: "none",
            background: "transparent",
            padding: "12px 0 0",
          }}
        >
          <p>
            © {new Date().getFullYear()} <span>LongMeet</span> — Made by{" "}
            <span>Aditya Pandey</span>. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Register;
