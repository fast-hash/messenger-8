const jwt = require('jsonwebtoken');
const config = require('../config/env');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.cookies && req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
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
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
