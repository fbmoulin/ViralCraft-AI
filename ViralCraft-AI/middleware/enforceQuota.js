const quota = require('../services/quota');
const { createError } = require('./errorHandler');

/**
 * Middleware factory — wraps an AI route and enforces the user's monthly
 * quota. Pass `{ isImage: true }` for image generation endpoints (which use
 * a separate counter). Quota is keyed by org when an org context is set
 * (req.orgId), otherwise by Clerk user ID.
 *
 * On 402, the response includes the plan id, current usage and the limit so
 * the frontend can show a contextual upgrade CTA.
 */
function enforceQuota({ isImage = false } = {}) {
  return async function quotaGate(req, res, next) {
    if (!req.auth || !req.auth.clerkUserId) {
      return next(createError('Authentication required', 401));
    }

    const result = await quota.checkQuota({
      userId: req.auth.clerkUserId,
      orgId: req.auth.orgId || null,
      isImage
    });

    if (!result.allowed) {
      return res.status(402).json({
        error: 'Quota exceeded for current billing period',
        plan: result.plan?.id || 'unknown',
        scope: result.scope,
        used: result.used,
        limit: result.limit,
        upgradeUrl: '/api/billing/checkout'
      });
    }

    // Stash for the route handler so it can call quota.recordUsage() after
    // a successful AI call (with real tokens-in/out from the provider).
    req.quota = result;
    return next();
  };
}

module.exports = { enforceQuota };
