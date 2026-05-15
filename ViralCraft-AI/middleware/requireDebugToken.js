const logger = require('../utils/logger');

/**
 * Protects debug/admin endpoints. In production, requires header
 * `x-debug-token` to match process.env.DEBUG_TOKEN. In development, allows
 * through with a single warning so local debugging stays frictionless.
 */
function requireDebugToken(req, res, next) {
  const expected = process.env.DEBUG_TOKEN;
  const provided = req.get('x-debug-token');

  if (process.env.NODE_ENV !== 'production') {
    if (!expected) {
      logger.warn('Debug endpoint accessed without DEBUG_TOKEN set (dev mode allows it)');
    }
    return next();
  }

  if (!expected) {
    logger.error('DEBUG_TOKEN not configured in production — denying access');
    return res.status(503).json({ error: 'Debug endpoints disabled' });
  }

  if (!provided || provided !== expected) {
    logger.warn('Unauthorized debug endpoint access attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

module.exports = { requireDebugToken };
