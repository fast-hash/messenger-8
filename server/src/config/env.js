const dotenv = require('dotenv');

dotenv.config();

const toBool = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
};

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/messenger_basic',
  jwtSecret: process.env.JWT_SECRET || 'change_me_to_a_long_random_string',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  cookieSecure: toBool(process.env.COOKIE_SECURE, false),
};

module.exports = config;
