const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const users = [];
const userMap = {};
const events = [];
const eventSockets = {}; 

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', 
    methods: ['GET', 'POST'],
  },
});

app.get('/', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>Server</title></head><body><h1>Hello world</h1></body></html>');
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('userJoin', (userName) => {
    if (typeof userName !== 'string' || !userName.trim()) return;
    if (!users.includes(userName)) users.push(userName);
    userMap[userName] = userMap[userName] || {};
    socket.userName = userName;
  });

  socket.on('joinEvent', (eventId) => {
    const event = events.find(e => e.id === eventId);
    
    if (!event || !socket.userName) return;
    
    if (!eventSockets[eventId]) eventSockets[eventId] = new Set();
    eventSockets[eventId].add(socket.id);
    socket.currentEvent = eventId;
    socket.join(eventId);
    
    if (!event.players.includes(socket.userName) && event.players.length < 2) {
      event.players.push(socket.userName);
      io.emit('response_for_listEvents', events.filter(e => e.players.length < 2));
    }
    
    const gameStateData = {
      history: event.history,
      currentMove: event.currentMove,
      players: event.players,
      readyPlayers: event.readyPlayers,
      gameStarted: event.gameStarted
    };
    
    eventSockets[eventId].forEach(socketId => {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.emit('gameState', gameStateData);
      }
    });
  });

  socket.on('makeMove', (eventId, newHistory, moveIndex) => {
    const event = events.find(e => e.id === eventId);
    if (event && event.players.includes(socket.userName) && event.gameStarted) {
      const playerIndex = event.players.indexOf(socket.userName);
      const isPlayerTurn = (event.currentMove % 2) === playerIndex;
      
      if (isPlayerTurn) {
        event.history = newHistory;
        event.currentMove = moveIndex;
        
        const gameStateData = {
          history: event.history,
          currentMove: event.currentMove,
          players: event.players,
          readyPlayers: event.readyPlayers,
          gameStarted: event.gameStarted
        };
        
        eventSockets[eventId].forEach(socketId => {
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket) {
            targetSocket.emit('gameState', gameStateData);
          }
        });
      }
    }
  });

  socket.on('leaveEvent', () => {
    if (socket.currentEvent && eventSockets[socket.currentEvent]) {
      const currentEventId = socket.currentEvent;
      eventSockets[currentEventId].delete(socket.id);
      socket.leave(currentEventId);
      
      const event = events.find(e => e.id === currentEventId);
      if (event && socket.userName) {
        const wasGameStarted = event.gameStarted;
        
        event.players = event.players.filter(p => p !== socket.userName);
        event.readyPlayers = event.readyPlayers.filter(p => p !== socket.userName);
        
        // If game was started and one left, notify remaining player
        if (event.players.length === 1 && wasGameStarted) {
          eventSockets[currentEventId].forEach(socketId => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
              targetSocket.emit('playerLeft');
            }
          });
        }
        
        // Delete event only if game was started or no players left
        if (wasGameStarted || event.players.length === 0) {
          const eventIndex = events.findIndex(e => e.id === currentEventId);
          if (eventIndex !== -1) {
            events.splice(eventIndex, 1);
            delete eventSockets[currentEventId];
          }
        } else {
          // Reset ready state if game wasn't started
          event.readyPlayers = [];
          event.gameStarted = false;
          
          // Notify remaining player that opponent left
          const gameStateData = {
            history: event.history,
            currentMove: event.currentMove,
            players: event.players,
            readyPlayers: event.readyPlayers,
            gameStarted: event.gameStarted
          };
          
          eventSockets[currentEventId].forEach(socketId => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
              targetSocket.emit('gameState', gameStateData);
            }
          });
        }
        
      }
      
      socket.currentEvent = null;
      io.emit('response_for_listEvents', events.filter(e => e.players.length < 2));
    }
  });

  socket.on('request_to_listEvents', () => {
    const availableEvents = events.filter(e => e.players.length < 2);
    socket.emit('response_for_listEvents', availableEvents);
  });

  socket.on('createEvent', (userName, gameType, callback) => {
    if (typeof userName !== 'string' || !userName.trim()) return;

    const eventId = `events-${userName}-${Date.now()}`;
    const boardSize = gameType === 'big' ? 900 : 9; // 30x30 = 900 for big, 3x3 = 9 for standard
    const newEvent = {
      id: eventId,
      players: [userName],
      gameType: gameType || 'standard',
      stage: 0,
      currentMove: 0,
      history: Array(1).fill(Array(boardSize).fill(null)),
      createdAt: Date.now(),
      readyPlayers: [],
      gameStarted: false,
    };
    events.push(newEvent);

    if (typeof callback === 'function') callback(eventId);
    io.emit('response_for_listEvents', events.filter(e => e.players.length < 2));
  });

  socket.on('playerReady', (eventId) => {
    const event = events.find(e => e.id === eventId);
    if (event && socket.userName && event.players.includes(socket.userName)) {
      if (!event.readyPlayers.includes(socket.userName)) {
        event.readyPlayers.push(socket.userName);
      }
      
      // Start game if both players are ready
      if (event.players.length === 2 && event.readyPlayers.length === 2) {
        event.gameStarted = true;
      }
      
      const gameStateData = {
        history: event.history,
        currentMove: event.currentMove,
        players: event.players,
        readyPlayers: event.readyPlayers,
        gameStarted: event.gameStarted
      };
      
      eventSockets[eventId].forEach(socketId => {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.emit('gameState', gameStateData);
        }
      });
    }
  });

  socket.on('playerUnready', (eventId) => {
    const event = events.find(e => e.id === eventId);
    if (event && socket.userName) {
      event.readyPlayers = event.readyPlayers.filter(p => p !== socket.userName);
      event.gameStarted = false; // Reset game start if someone becomes unready
      
      const gameStateData = {
        history: event.history,
        currentMove: event.currentMove,
        players: event.players,
        readyPlayers: event.readyPlayers,
        gameStarted: event.gameStarted
      };
      
      eventSockets[eventId].forEach(socketId => {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.emit('gameState', gameStateData);
        }
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    
    if (socket.currentEvent && eventSockets[socket.currentEvent]) {
      eventSockets[socket.currentEvent].delete(socket.id);
      
      const event = events.find(e => e.id === socket.currentEvent);
      if (event && socket.userName) {
        const wasGameStarted = event.gameStarted;
        
        event.players = event.players.filter(p => p !== socket.userName);
        event.readyPlayers = event.readyPlayers.filter(p => p !== socket.userName);
        
        // If game was started and one left, notify remaining player
        if (event.players.length === 1 && wasGameStarted) {
          eventSockets[socket.currentEvent].forEach(socketId => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
              targetSocket.emit('playerLeft');
            }
          });
        }
        
        // Delete event only if game was started or no players left
        if (wasGameStarted || event.players.length === 0) {
          const eventIndex = events.findIndex(e => e.id === socket.currentEvent);
          if (eventIndex !== -1) {
            events.splice(eventIndex, 1);
            delete eventSockets[socket.currentEvent];
          }
        } else {
          // Reset ready state and notify remaining player
          event.readyPlayers = [];
          event.gameStarted = false;
          
          const gameStateData = {
            history: event.history,
            currentMove: event.currentMove,
            players: event.players,
            readyPlayers: event.readyPlayers,
            gameStarted: event.gameStarted
          };
          
          eventSockets[socket.currentEvent].forEach(socketId => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
              targetSocket.emit('gameState', gameStateData);
            }
          });
        }
      }
      io.emit('response_for_listEvents', events.filter(e => e.players.length < 2));
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});