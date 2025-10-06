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

// check that server is alive
app.get('/', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>Server</title></head><body><h1>Hello world</h1></body></html>');
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  // user joined
  socket.on('userJoin', (userName) => {
    console.log(userName, 'just joined');
    if (typeof userName !== 'string' || !userName.trim()) return;
    if (!users.includes(userName)) users.push(userName);
    userMap[userName] = userMap[userName] || {};
    socket.userName = userName;
  });

  // join to event
  socket.on('joinEvent', (eventId) => {
    console.log(`${socket.userName} joining event ${eventId}`);
    if (!eventSockets[eventId]) eventSockets[eventId] = new Set();
    eventSockets[eventId].add(socket.id);
    socket.currentEvent = eventId;
    socket.join(eventId);
    
    // add user to event
    const event = events.find(e => e.id === eventId);
    if (event && socket.userName && !event.players.includes(socket.userName)) {
      event.players.push(socket.userName);
      console.log(`Added ${socket.userName} to event ${eventId}. Players: [${event.players.join(', ')}]`);
      io.emit('response_for_listEvents', events);
    }
  });

  // exit from event (return to Lobby)
  socket.on('leaveEvent', () => {
    if (socket.currentEvent && eventSockets[socket.currentEvent]) {
      eventSockets[socket.currentEvent].delete(socket.id);
      socket.leave(socket.currentEvent);
      
      // remove user from event
      const event = events.find(e => e.id === socket.currentEvent);
      if (event && socket.userName) {
        event.players = event.players.filter(p => p !== socket.userName);
      }
      
      // if there is no user in event, delete the event
      if (eventSockets[socket.currentEvent].size === 0) {
        const eventIndex = events.findIndex(e => e.id === socket.currentEvent);
        if (eventIndex !== -1) {
          events.splice(eventIndex, 1);
          delete eventSockets[socket.currentEvent];
          console.log(`Event ${socket.currentEvent} closed - no players left`);
        }
      }
      
      socket.currentEvent = null;
      io.emit('response_for_listEvents', events);
    }
  });

  // list of events (lobby)
  socket.on('request_to_listEvents', () => {
    console.log('Sending events list:', events.length, 'events');
    events.forEach(event => {
      console.log(`- Event ${event.id}: players [${event.players.join(', ')}], type: ${event.gameType}`);
    });
    socket.emit('response_for_listEvents', events);
  });

  // event creation
  socket.on('createEvent', (userName, gameType, callback) => {
    if (typeof userName !== 'string' || !userName.trim()) return;

    const eventId = `events-${userName}-${Date.now()}`;
    const newEvent = {
      id: eventId,
      players: [userName],
      gameType: gameType || 'standard',
      stage: 0,
      currentMove: 0,
      history: Array(1).fill(Array(9).fill(null)),
      createdAt: Date.now(),
    };
    events.push(newEvent);
    console.log(`Event ${eventId} created with player ${userName}`);

    if (typeof callback === 'function') callback(eventId);
    io.emit('response_for_listEvents', events);
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    
    // remove socket from event
    if (socket.currentEvent && eventSockets[socket.currentEvent]) {
      eventSockets[socket.currentEvent].delete(socket.id);
      
      // if there is no user in event, delete the event
      if (eventSockets[socket.currentEvent].size === 0) {
        const eventIndex = events.findIndex(e => e.id === socket.currentEvent);
        if (eventIndex !== -1) {
          events.splice(eventIndex, 1);
          delete eventSockets[socket.currentEvent];
          console.log(`Event ${socket.currentEvent} closed - no players left`);
          io.emit('response_for_listEvents', events);
        }
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});
