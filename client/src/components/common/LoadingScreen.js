import React from "react";

const LoadingScreen = () => {
  return (
    <div className="splash-screen">
      <div className="splash-logo-wrapper">
        <span className="splash-logo-icon">
          <svg
            viewBox="0 0 64 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Left infinity loop */}
            <path
              d="M32 20
                 C32 14, 26 8, 18 8
                 C10 8, 4 14, 4 20
                 C4 26, 10 32, 18 32
                 C26 32, 32 26, 32 20Z"
              stroke="url(#splashGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="splash-infinity-left"
            />
            {/* Right infinity loop */}
            <path
              d="M32 20
                 C32 26, 38 32, 46 32
                 C54 32, 60 26, 60 20
                 C60 14, 54 8, 46 8
                 C38 8, 32 14, 32 20Z"
              stroke="url(#splashGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="splash-infinity-right"
            />
            {/* Heart at crossing */}
            <path
              d="M32 16
                 C30.5 13, 27 12.5, 27 15
                 C27 17, 32 21, 32 21
                 C32 21, 37 17, 37 15
                 C37 12.5, 33.5 13, 32 16Z"
              fill="url(#splashGrad)"
              className="splash-heart"
            />
            {/* Person dots */}
            <circle cx="16" cy="18" r="2.2" fill="#f9a8d4" opacity="0.7" />
            <circle cx="48" cy="18" r="2.2" fill="#c084fc" opacity="0.7" />
            <path
              d="M13.5 23.5a2.5 2.5 0 015 0"
              stroke="#f9a8d4"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.7"
            />
            <path
              d="M45.5 23.5a2.5 2.5 0 015 0"
              stroke="#c084fc"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.7"
            />
            <defs>
              <linearGradient
                id="splashGrad"
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
          </svg>
        </span>
      </div>
      <span className="splash-brand">LongMeet</span>
      <span className="splash-tagline">Connecting hearts</span>
      <div className="splash-dots">
        <span className="splash-dot" />
        <span className="splash-dot" />
        <span className="splash-dot" />
      </div>
    </div>
  );
};

export default LoadingScreen;
