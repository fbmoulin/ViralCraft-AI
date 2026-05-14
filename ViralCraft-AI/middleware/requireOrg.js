const { createError } = require('./errorHandler');

/**
 * Requires that the authenticated user belongs to an organization. Resolves
 * the org from the JWT's `org_id` claim first, then falls back to the
 * `X-Org-Id` header or `?orgId=` query, and validates membership via the
 * OrganizationMember table.
 *
 * On success, attaches:
 *   - req.orgId   — Clerk org ID (string)
 *   - req.orgRole — role from JWT or 'member' fallback
 */
async function requireOrg(req, res, next) {
  if (!req.auth || !req.auth.clerkUserId) {
    return next(createError('Authentication required', 401));
  }

  const orgId = req.auth.orgId || req.get('x-org-id') || (req.query && req.query.orgId) || null;
  if (!orgId) {
    return next(createError('Organization context required (set X-Org-Id header)', 400));
  }

  if (global.db && global.db.isConnected && req.user) {
    const localOrg = await global.db.findOrgByClerkId(orgId);
    if (!localOrg) return next(createError('Unknown organization', 404));
    const membership = await global.db.assertMembership(req.user.id, localOrg.id);
    if (!membership) return next(createError('Forbidden: not a member of this organization', 403));
    req.orgRole = req.auth.orgRole || membership.role;
  } else {
    // Fallback: trust the JWT claim if DB isn't available
    req.orgRole = req.auth.orgRole || 'member';
  }

  req.orgId = orgId;
  return next();
}

module.exports = { requireOrg };
