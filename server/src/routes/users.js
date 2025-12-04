const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/userService');
const { getIo, updatePresenceMeta } = require('../sockets');
const Chat = require('../models/Chat');
const config = require('../config/env');

const router = express.Router();

const setAuthCookie = (res, payload) => {
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

router.use(authMiddleware);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.user.id);
    res.json({ user });
  })
);

router.patch(
  '/me/preferences',
  asyncHandler(async (req, res) => {
    const { dndEnabled, dndUntil } = req.body || {};
    const user = await userService.updatePreferences({
      userId: req.user.id,
      dndEnabled,
      dndUntil,
    });

    setAuthCookie(res, user);

    const io = getIo && getIo();
    if (io) {
      const chats = await Chat.find({ participants: req.user.id }).select('_id');
      chats.forEach((chat) => {
        io.to(`chat:${chat._id.toString()}`).emit('presence:dnd', {
          userId: req.user.id,
          dndEnabled: user.dndEnabled || false,
          dndUntil: user.dndUntil || null,
        });
      });
    }

    if (updatePresenceMeta) {
      updatePresenceMeta(req.user.id, {
        dndEnabled: user.dndEnabled || false,
        dndUntil: user.dndUntil || null,
      });
    }

    res.json({ user });
  })
);

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { query } = req.query;
    const users = await userService.searchUsers({ query, excludeUserId: req.user.id });
    res.json({ users });
  })
);

module.exports = router;
