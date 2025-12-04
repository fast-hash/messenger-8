const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const attachmentService = require('../services/attachmentService');

const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const chatId = req.params.chatId;
    const dest = path.join(attachmentService.uploadsRoot, chatId);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      const error = new Error('Недопустимый тип файла');
      error.status = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

router.use(authMiddleware);

const validateChatAccess = asyncHandler(async (req, res, next) => {
  await attachmentService.ensureChatAccess(req.params.chatId, req.user.id);
  next();
});

router.post(
  '/chats/:chatId/attachments',
  validateChatAccess,
  upload.array('files', MAX_FILES),
  asyncHandler(async (req, res) => {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ message: 'Нет файлов для загрузки' });
    }

    const attachments = await attachmentService.saveMetadata({
      chatId: req.params.chatId,
      uploaderId: req.user.id,
      files: req.files,
    });

    return res.status(201).json({ attachments });
  })
);

router.get(
  '/attachments/:id',
  asyncHandler(async (req, res) => {
    const { attachment, filePath } = await attachmentService.getAttachmentForDownload({
      attachmentId: req.params.id,
      requesterId: req.user.id,
    });

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.originalName || 'file')}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      res.status(404).end();
    });
    stream.pipe(res);
  })
);

module.exports = router;
