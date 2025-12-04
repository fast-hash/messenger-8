const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const asyncHandler = require('../utils/asyncHandler');
const chatService = require('../services/chatService');

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get(
  '/chats/direct',
  asyncHandler(async (req, res) => {
    const chats = await chatService.listDirectChatsForAdmin();
    res.json({ chats });
  })
);

router.delete(
  '/chats/:id/blocks',
  asyncHandler(async (req, res) => {
    const chat = await chatService.removeAllBlocksFromDirectChat(req.params.id);
    res.json({ chat });
  })
);

module.exports = router;
