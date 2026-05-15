const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { createCheckoutSession, createPortalSession, getStripe } = require('../services/stripe');
const quota = require('../services/quota');

/**
 * GET /api/billing/plans
 * Public list of available plans for the frontend's pricing page.
 */
router.get(
  '/plans',
  asyncHandler(async (req, res) => {
    const plans = await global.db.listPlans();
    res.json({ success: true, plans });
  })
);

/**
 * GET /api/billing/usage
 * Returns the authenticated user's current cycle usage and plan caps.
 */
router.get(
  '/usage',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw createError('User not synchronized', 404);
    const usage = await quota.getCurrentUsage({
      clerkUserId: req.auth.clerkUserId,
      clerkOrgId: req.auth.orgId || null
    });
    res.json({ success: true, usage });
  })
);

/**
 * POST /api/billing/checkout
 * Body: { planId }
 * Returns: { url } — redirect the browser to the Stripe Checkout session.
 */
router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!getStripe()) throw createError('Billing not configured', 503);
    if (!req.user) throw createError('User not synchronized', 404);

    const { planId } = req.body;
    const plan = await global.db.getPlan(planId);
    if (!plan || !plan.stripePriceId) {
      throw createError('Plan not found or missing Stripe price', 400);
    }

    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const session = await createCheckoutSession({
      priceId: plan.stripePriceId,
      customerEmail: req.user.email,
      successUrl: `${baseUrl}/billing?status=success`,
      cancelUrl: `${baseUrl}/billing?status=cancel`,
      metadata: {
        clerkUserId: req.auth.clerkUserId,
        localUserId: req.user.id,
        planId
      }
    });
    res.json({ success: true, url: session.url });
  })
);

/**
 * POST /api/billing/portal
 * Returns: { url } — redirect to Stripe Customer Portal for cancellations,
 * payment-method updates, etc.
 */
router.post(
  '/portal',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!getStripe()) throw createError('Billing not configured', 503);
    if (!req.user) throw createError('User not synchronized', 404);

    // Translate Clerk org ID → local UUID for the Subscription lookup.
    let localOrgId = null;
    if (req.auth.orgId) {
      const org = await global.db.findOrgByClerkId(req.auth.orgId);
      localOrgId = org?.id || null;
    }

    const sub = await global.db.findActiveSubscription({
      userId: localOrgId ? null : req.user.id,
      orgId: localOrgId
    });
    if (!sub || !sub.stripeCustomerId) {
      throw createError('No active subscription found', 404);
    }

    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const session = await createPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: `${baseUrl}/billing`
    });
    res.json({ success: true, url: session.url });
  })
);

module.exports = router;
