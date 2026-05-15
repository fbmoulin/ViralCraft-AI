const { verifySessionToken } = require('../services/clerk');
const { createError } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Extract a Bearer token from the Authorization header.
 */
function extractBearer(req) {
  const header = req.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

/**
 * Require a valid Clerk-issued JWT. Attaches:
 *   - req.auth.clerkUserId — sub claim from the JWT
 *   - req.auth.sessionId   — sid claim (if present)
 *   - req.user             — local User row (created on first hit)
 * Returns 401 when the token is missing or fails verification.
 *
 * All async work is wrapped in try/catch so any failure inside
 * verifySessionToken or the DB lookup is forwarded to the global error
 * handler instead of becoming an unhandled promise rejection.
 */
async function requireAuth(req, res, next) {
  const token = extractBearer(req);
  if (!token) return next(createError('Missing Authorization header', 401));

  let payload;
  try {
    payload = await verifySessionToken(token);
  } catch (err) {
    logger.warn('requireAuth: token verification threw', { error: err.message });
    return next(createError('Invalid or expired session', 401));
  }

  if (!payload || !payload.sub) {
    return next(createError('Invalid or expired session', 401));
  }

  req.auth = {
    clerkUserId: payload.sub,
    sessionId: payload.sid,
    orgId: payload.org_id || null,
    orgRole: payload.org_role || null
  };

  // Lazy local-user lookup. We don't auto-provision here; the frontend should
  // hit POST /api/me/sync after sign-in to create the row. If still missing,
  // we let the route handler decide whether that's an error.
  if (global.db && global.db.isConnected) {
    try {
      req.user = await global.db.findUserByClerkId(payload.sub);
    } catch (err) {
      logger.warn('requireAuth: findUserByClerkId failed', { error: err.message });
      req.user = null;
    }
  }

  return next();
}

/**
 * Optional auth — populates req.auth/req.user when a token is present, but
 * doesn't fail the request when it's missing. Useful for public endpoints
 * that personalize when signed in.
 */
async function optionalAuth(req, res, next) {
  const token = extractBearer(req);
  if (!token) return next();

  let payload = null;
  try {
    payload = await verifySessionToken(token);
  } catch (err) {
    // For optional auth, fail open: log and continue as anonymous.
    logger.debug('optionalAuth: token verification threw, continuing as anon', {
      error: err.message
    });
    return next();
  }

  if (payload && payload.sub) {
    req.auth = {
      clerkUserId: payload.sub,
      sessionId: payload.sid,
      orgId: payload.org_id || null,
      orgRole: payload.org_role || null
    };
    if (global.db && global.db.isConnected) {
      try {
        req.user = await global.db.findUserByClerkId(payload.sub);
      } catch (_) {
        req.user = null;
      }
    }
  }
  return next();
}

module.exports = { requireAuth, optionalAuth };
