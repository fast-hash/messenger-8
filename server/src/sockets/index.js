const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const Chat = require('../models/Chat');
const messageService = require('../services/messageService');

const onlineUsers = new Map();

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...val] = part.trim().split('=');
    acc[key] = decodeURIComponent(val.join('='));
    return acc;
  }, {});
};

let ioInstance = null;

const setupSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
  });

  ioInstance = io;

  io.use((socket, next) => {
    try {
      const tokenFromQuery = socket.handshake.query && socket.handshake.query.token;
      const tokenFromAuth = socket.handshake.auth && socket.handshake.auth.token;
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = tokenFromAuth || tokenFromQuery || cookies.access_token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token, config.jwtSecret);
      socket.user = {
        id: payload.id,
        email: payload.email,
        username: payload.username,
        displayName: payload.displayName,
        role: payload.role,
        department: payload.department,
        jobTitle: payload.jobTitle,
        dndEnabled: payload.dndEnabled || false,
        dndUntil: payload.dndUntil || null,
      };
      return next();
    } catch (error) {
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const incrementPresence = async () => {
      const current = onlineUsers.get(socket.user.id) || { count: 0 };
      const nextCount = (current.count || 0) + 1;
      const nextMeta = {
        count: nextCount,
        dndEnabled: socket.user.dndEnabled || false,
        dndUntil: socket.user.dndUntil || null,
      };
      onlineUsers.set(socket.user.id, nextMeta);

      if ((current.count || 0) === 0) {
        const chats = await Chat.find({ participants: socket.user.id }).select('_id');
        chats.forEach((chat) => {
          io.to(`chat:${chat._id.toString()}`).emit('presence:online', {
            userId: socket.user.id,
            dndEnabled: socket.user.dndEnabled || false,
            dndUntil: socket.user.dndUntil || null,
          });
        });
      }
    };

    const decrementPresence = async () => {
      const current = onlineUsers.get(socket.user.id) || { count: 0 };
      const nextCount = Math.max(0, (current.count || 0) - 1);
      if (nextCount === 0) {
        onlineUsers.delete(socket.user.id);
        const chats = await Chat.find({ participants: socket.user.id }).select('_id');
        chats.forEach((chat) => {
          io.to(`chat:${chat._id.toString()}`).emit('presence:offline', {
            userId: socket.user.id,
          });
        });
      } else {
        onlineUsers.set(socket.user.id, { ...current, count: nextCount });
      }
    };

    incrementPresence().catch((error) => {
      console.error('Presence increment error', error);
    });

    socket.on('chats:join', async ({ chatId }) => {
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) {
          return;
        }

        const isParticipant = chat.participants
          .map((id) => id.toString())
          .includes(socket.user.id.toString());
        if (!isParticipant) {
          return;
        }

        socket.join(`chat:${chatId}`);

        // После присоединения отправляем текущему клиенту статусы online уже подключенных участников,
        // чтобы индикаторы присутствия корректно отобразились в списке чатов.
        chat.participants
          .filter((id) => id.toString() !== socket.user.id.toString())
          .forEach((participantId) => {
            const presence = onlineUsers.get(participantId.toString());
            if (presence && (presence.count || 0) > 0) {
              socket.emit('presence:online', {
                userId: participantId.toString(),
                dndEnabled: presence.dndEnabled || false,
                dndUntil: presence.dndUntil || null,
              });
            }
          });
      } catch (error) {
        console.error('Error joining chat', error);
      }
    });

    socket.on('message:send', async ({ chatId, text, mentions, attachments }, callback) => {
      try {
        const message = await messageService.sendMessage({
          chatId,
          senderId: socket.user.id,
          senderRole: socket.user.role,
          text,
          mentions,
          attachments,
        });

        io.to(`chat:${chatId}`).emit('message:new', { message });
        if (callback) {
          callback({ ok: true });
        }
      } catch (error) {
        console.error('Error sending message', error);
        if (callback) {
          callback({ ok: false, message: error.message, status: error.status || 500 });
        }
      }
    });

    socket.on('typing:start', async ({ chatId }) => {
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) return;
        const isParticipant = chat.participants
          .map((id) => id.toString())
          .includes(socket.user.id.toString());
        if (!isParticipant) return;
        io.to(`chat:${chatId}`).emit('typing:started', {
          chatId,
          userId: socket.user.id,
        });
      } catch (error) {
        console.error('Typing start error', error);
      }
    });

    socket.on('typing:stop', async ({ chatId }) => {
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) return;
        const isParticipant = chat.participants
          .map((id) => id.toString())
          .includes(socket.user.id.toString());
        if (!isParticipant) return;
        io.to(`chat:${chatId}`).emit('typing:stopped', {
          chatId,
          userId: socket.user.id,
        });
      } catch (error) {
        console.error('Typing stop error', error);
      }
    });

    socket.on('disconnect', () => {
      decrementPresence().catch((error) => {
        console.error('Presence decrement error', error);
      });
    });
  });

  return io;
};

const getIo = () => ioInstance;

const updatePresenceMeta = (userId, meta = {}) => {
  const existing = onlineUsers.get(userId.toString());
  if (!existing) return;
  onlineUsers.set(userId.toString(), { ...existing, ...meta });
};

module.exports = setupSockets;
module.exports.getIo = getIo;
module.exports.updatePresenceMeta = updatePresenceMeta;
