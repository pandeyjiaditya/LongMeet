import React from "react";

const Logo = ({ size = "default", onClick, style }) => {
  const sizes = {
    small: { icon: 30, font: "1.2rem" },
    default: { icon: 38, font: "1.5rem" },
    large: { icon: 46, font: "1.8rem" },
  };
  const s = sizes[size] || sizes.default;

  return (
    <h1
      className="logo"
      onClick={onClick}
      style={{ fontSize: s.font, ...style }}
    >
      <span className="logo-icon" style={{ width: s.icon, height: s.icon }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: s.icon * 0.55, height: s.icon * 0.55 }}
        >
          {/* Cozy couch / hangout icon */}
          <path
            d="M4 14V10a2 2 0 012-2h12a2 2 0 012 2v4"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M2 14a2 2 0 012-2h0a2 2 0 012 2v2H2v-2zM18 14a2 2 0 012-2h0a2 2 0 012 2v2h-4v-2z"
            stroke="#fff"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M4 16h16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z"
            stroke="#fff"
            strokeWidth="2"
            fill="none"
          />
          {/* Small heart accent */}
          <path
            d="M12 7.5c-.5-1-2-1.5-2.5-.5s.5 2 2.5 3.5c2-1.5 3-2.5 2.5-3.5s-2-.5-2.5.5z"
            fill="#fff"
            opacity="0.85"
          />
        </svg>
      </span>
      LongMeet
    </h1>
  );
};

export default Logo;
