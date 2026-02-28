import React from "react";
import { Link } from "react-router-dom";
import Logo from "../components/common/Logo";

const NotFound = () => (
  <div className="not-found">
    <Logo size="large" style={{ marginBottom: 32 }} />
    <h1>404</h1>
    <p>Oops! You wandered too far 🧭</p>
    <Link to="/" className="btn btn-primary btn-lg">
      Head Back Home
    </Link>
  </div>
);

export default NotFound;
