const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { asyncHandler, createError } = require('../middleware/errorHandler');

/**
 * GET /api/orgs
 * Lists organizations the current user is a member of (joined locally with
 * the OrganizationMember table).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw createError('User not synchronized', 404);
    const memberships = await global.db.findMemberships(req.user.id);
    res.json({
      success: true,
      organizations: memberships.map((m) => ({
        ...m.organization,
        role: m.role
      }))
    });
  })
);

module.exports = router;
