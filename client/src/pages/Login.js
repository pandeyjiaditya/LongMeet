import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const { login, user, error, clearError } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });

  if (user) return <Navigate to="/dashboard" />;

  const handleSubmit = (e) => {
    e.preventDefault();
    clearError();
    login(form.email, form.password);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Sign in to LongMeet</h2>
        {error && <p className="error-text">{error}</p>}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <button type="submit" className="btn btn-primary">
            Login
          </button>
        </form>
        <p>
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
