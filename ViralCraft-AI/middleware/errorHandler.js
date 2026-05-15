const logger = require('../utils/logger');
const { createError } = require('../utils/error-handler');

/**
 * Express 4 async wrapper — bubbles rejections to the global error handler so
 * route bodies can stay free of explicit try/catch.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Final error-handling middleware. Logs with the request ID and returns a JSON
 * envelope without leaking stack traces in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  logger.error('Request failed', err, {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode
  });

  const body = {
    error: isServerError ? 'Internal server error' : err.message || 'Bad request',
    requestId: req.id
  };

  if (process.env.NODE_ENV !== 'production' && isServerError) {
    body.message = err.message;
    body.stack = err.stack;
  }

  if (err.details && !isServerError) {
    body.details = err.details;
  }

  res.status(statusCode).json(body);
}

/**
 * 404 fallback — registered after all routes so unmatched paths land in the
 * global error handler with a friendly message.
 */
function notFoundHandler(req, res, next) {
  next(createError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

module.exports = { asyncHandler, errorHandler, notFoundHandler, createError };
