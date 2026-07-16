const authService = require('../services/auth');
const { APIError } = require('./error');
const { logger } = require('../utils/logger');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new APIError(401, 'Missing authorization header');
  }

  const token = authService.extractToken(authHeader);
  if (!token) {
    throw new APIError(401, 'Invalid authorization header format');
  }

  const payload = authService.verifyJWT(token);
  if (!payload) {
    throw new APIError(401, 'Invalid or expired token');
  }

  req.user = payload;
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  requireAuth,
  asyncHandler,
};
