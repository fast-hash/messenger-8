const express = require('express');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/userService');

const router = express.Router();

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
