const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { getUser } = require('../services/clerk');

/**
 * GET /api/me
 * Returns the current authenticated user (local row joined with auth context).
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw createError('User not synchronized yet — call POST /api/me/sync', 404);
    }
    res.json({
      success: true,
      user: req.user,
      auth: req.auth
    });
  })
);

/**
 * POST /api/me/sync
 * Idempotent sync — fetches the Clerk user via SDK, upserts a local row.
 * Frontend calls this once after sign-in so subsequent /api/me works.
 */
router.post(
  '/me/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!global.db || !global.db.isConnected) {
      throw createError('Database not available', 503);
    }
    const clerkUser = await getUser(req.auth.clerkUserId);
    if (!clerkUser) {
      throw createError('Could not load user from Clerk', 502);
    }
    const email =
      clerkUser.emailAddresses?.[0]?.emailAddress ||
      clerkUser.email_addresses?.[0]?.email_address ||
      null;
    const user = await global.db.upsertUser({
      clerkUserId: req.auth.clerkUserId,
      email,
      name: clerkUser.firstName || clerkUser.first_name || null
    });
    res.json({ success: true, user });
  })
);

module.exports = router;
