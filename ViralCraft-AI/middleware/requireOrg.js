const { createError } = require('./errorHandler');

/**
 * Requires that the authenticated user belongs to an organization. The org is
 * resolved in this priority order:
 *   1. JWT `org_id` claim (trusted — Clerk signed it)
 *   2. `X-Org-Id` header / `?orgId=` query (untrusted — must verify membership)
 *
 * On success, attaches:
 *   - req.orgId   — Clerk org ID (string)
 *   - req.orgRole — role from JWT or DB membership
 *
 * Security: when the DB is unavailable we only trust the JWT claim. We never
 * fall back to "trust the header" because the header is attacker-controllable.
 */
async function requireOrg(req, res, next) {
  if (!req.auth || !req.auth.clerkUserId) {
    return next(createError('Authentication required', 401));
  }

  try {
    const jwtOrgId = req.auth.orgId || null;
    const requestedOrgId = req.get('x-org-id') || (req.query && req.query.orgId) || null;
    const orgId = jwtOrgId || requestedOrgId || null;

    if (!orgId) {
      return next(createError('Organization context required (set X-Org-Id header)', 400));
    }

    if (global.db && global.db.isConnected && req.user) {
      const localOrg = await global.db.findOrgByClerkId(orgId);
      if (!localOrg) return next(createError('Unknown organization', 404));
      const membership = await global.db.assertMembership(req.user.id, localOrg.id);
      if (!membership) {
        return next(createError('Forbidden: not a member of this organization', 403));
      }
      req.orgRole = req.auth.orgRole || membership.role;
    } else {
      // DB unavailable — only trust org context that's embedded in the signed JWT.
      // Header/query values are attacker-controllable so we refuse them here.
      if (!jwtOrgId) {
        return next(createError('Organization membership cannot be verified', 503));
      }
      req.orgRole = req.auth.orgRole || 'member';
    }

    req.orgId = orgId;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireOrg };
