# Express Server

Real-time multiplayer game server built with Express.js and Socket.IO.

## Features
- **Real-time communication** via Socket.IO
- **Game session management** - create, join, and auto-close sessions
- **Multi-game support** - Standard Tic-Tac-Toe and Big Tic-Tac-Toe (30x30)
- **Player tracking** - monitor active players in each session
- **CORS enabled** for React client on port 5173

## Setup
```bash
npm install
node index.js
```

Server runs on `http://localhost:3000`

## Socket Events
- `userJoin` - Register player in lobby
- `createEvent` - Create new game session
- `joinEvent` - Join existing session
- `leaveEvent` - Leave current session
- `request_to_listEvents` - Get active sessions list