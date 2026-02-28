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
          viewBox="0 0 64 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: s.icon * 0.7, height: s.icon * 0.44 }}
        >
          <defs>
            <linearGradient
              id="logoGrad"
              x1="0"
              y1="0"
              x2="64"
              y2="40"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="50%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
          </defs>
          <path
            d="M32 20
               C32 14, 26 8, 18 8
               C10 8, 4 14, 4 20
               C4 26, 10 32, 18 32
               C26 32, 32 26, 32 20Z"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M32 20
               C32 26, 38 32, 46 32
               C54 32, 60 26, 60 20
               C60 14, 54 8, 46 8
               C38 8, 32 14, 32 20Z"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M32 16
               C30.5 13, 27 12.5, 27 15
               C27 17, 32 21, 32 21
               C32 21, 37 17, 37 15
               C37 12.5, 33.5 13, 32 16Z"
            fill="#fff"
          />
          <circle cx="16" cy="18" r="2.2" fill="#fff" opacity="0.7" />
          <circle cx="48" cy="18" r="2.2" fill="#fff" opacity="0.7" />
          <path
            d="M13.5 23.5a2.5 2.5 0 015 0"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />
          <path
            d="M45.5 23.5a2.5 2.5 0 015 0"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />
        </svg>
      </span>
      LongMeet
    </h1>
  );
};

export default Logo;
