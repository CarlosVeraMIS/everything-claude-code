const { logger } = require('../utils/logger');

class APIError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function errorHandler(err, req, res, next) {
  logger.error('Error:', err);

  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
      requestId: req.id,
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON',
      requestId: req.id,
    });
  }

  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error',
    requestId: req.id,
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
}

module.exports = {
  APIError,
  errorHandler,
  notFoundHandler,
};
