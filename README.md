# LongMeet 🎥

Real-time video meeting application built with the MERN stack and Socket.IO.

## Tech Stack

| Layer    | Technology                 |
| -------- | -------------------------- |
| Frontend | React, React Router, Axios |
| Backend  | Node.js, Express           |
| Realtime | Socket.IO, WebRTC          |
| Database | MongoDB, Mongoose          |
| Auth     | JWT, bcrypt                |

## Project Structure

```
LongMeet/
├── client/                    # React frontend
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── common/        # PrivateRoute, shared UI
│       │   └── meeting/       # VideoPlayer, Controls, ChatPanel
│       ├── context/           # AuthContext, SocketContext
│       ├── pages/             # Home, Login, Register, Dashboard, Meeting
│       ├── services/          # API & meeting service
│       └── styles/            # Global CSS
├── server/                    # Express backend
│   └── src/
│       ├── config/            # DB connection, constants
│       ├── controllers/       # Auth, Meeting, User controllers
│       ├── middleware/        # Auth middleware
│       ├── models/            # User, Meeting models
│       ├── routes/            # API routes
│       └── socket/            # Socket.IO event handlers
└── package.json               # Root — runs both client & server
```

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB running locally or a MongoDB Atlas URI

### Installation

```bash
# Install all dependencies (root + server + client)
npm run install-all
```

### Running in Development

```bash
# Start both server & client concurrently
npm run dev
```

- **Server:** http://localhost:5000
- **Client:** http://localhost:3000

### Environment Variables

Copy the example env files and adjust as needed:

- `server/.env.example` → `server/.env`
- `client/.env` — already configured for local dev

## API Endpoints

| Method | Route                          | Auth | Description         |
| ------ | ------------------------------ | ---- | ------------------- |
| POST   | `/api/auth/register`           | No   | Register user       |
| POST   | `/api/auth/login`              | No   | Login user          |
| GET    | `/api/auth/me`                 | Yes  | Get current user    |
| POST   | `/api/meetings`                | Yes  | Create meeting      |
| GET    | `/api/meetings/my`             | Yes  | User's meetings     |
| GET    | `/api/meetings/:meetingId`     | Yes  | Get meeting details |
| PATCH  | `/api/meetings/:meetingId/end` | Yes  | End meeting         |

## Socket.IO Events

| Event                 | Direction       | Description               |
| --------------------- | --------------- | ------------------------- |
| `join-room`           | Client → Server | Join a meeting room       |
| `user-joined`         | Server → Client | New participant joined    |
| `offer`               | Peer → Peer     | WebRTC offer              |
| `answer`              | Peer → Peer     | WebRTC answer             |
| `ice-candidate`       | Peer → Peer     | ICE candidate exchange    |
| `toggle-media`        | Client → Server | Mute/unmute audio/video   |
| `chat-message`        | Bidirectional   | In-meeting chat           |
| `leave-room`          | Client → Server | Leave meeting             |
| `watch-party:set-url` | Client → Server | Share video URL with room |
| `watch-party:play`    | Client → Server | Sync play across room     |
| `watch-party:pause`   | Client → Server | Sync pause across room    |
| `watch-party:seek`    | Client → Server | Sync seek across room     |
| `watch-party:stop`    | Client → Server | Stop watch party          |

## Features

- **Video Meetings** — Create and join rooms with real-time WebRTC video/audio
- **In-Meeting Chat** — Persistent chat messages stored in MongoDB
- **Watch Party** — Share and sync video playback (MP4, YouTube, Vimeo) with all participants
- **Authentication** — JWT-based register/login with protected routes
- **Room Management** — Dynamic room creation, participant tracking, join/leave broadcasts

## License

All rights reserved.

---

**Made by Aditya Pandey** — © 2026 LongMeet. All rights reserved.  
Unauthorized copying, modification, distribution, or use of this software is strictly prohibited without prior written permission.
