const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { verifyWebhook } = require('../../services/stripe');

/**
 * Stripe webhook receiver. Mounted with express.raw() so the signature can be
 * verified against the unparsed payload. Handles the lifecycle events needed
 * to keep the local Subscription table in sync.
 *
 * Configure these events in the Stripe Dashboard → Developers → Webhooks:
 *   - checkout.session.completed
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_failed
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.headers['stripe-signature']);
  } catch (err) {
    logger.warn('Stripe webhook: signature verification failed', { error: err.message });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (!global.db || !global.db.isConnected) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { clerkUserId, localUserId, planId } = session.metadata || {};
        if (!localUserId || !planId) {
          logger.warn('Stripe webhook: checkout.session.completed missing metadata', {
            sessionId: session.id
          });
          break;
        }
        await global.db.upsertSubscription({
          userId: localUserId,
          planId,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          status: 'active'
        });
        logger.info('Stripe webhook: checkout completed', { clerkUserId, planId });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        // Resolve planId by Stripe price ID lookup
        const plans = await global.db.listPlans();
        const matchingPlan = plans.find((p) => p.stripePriceId === sub.items?.data?.[0]?.price?.id);
        const planId = matchingPlan ? matchingPlan.id : null;
        await global.db.upsertSubscription({
          stripeSubscriptionId: sub.id,
          stripeCustomerId: sub.customer,
          planId,
          status: sub.status,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await global.db.upsertSubscription({
          stripeSubscriptionId: sub.id,
          stripeCustomerId: sub.customer,
          planId: 'free',
          status: 'canceled'
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await global.db.upsertSubscription({
            stripeSubscriptionId: invoice.subscription,
            stripeCustomerId: invoice.customer,
            planId: null,
            status: 'past_due'
          });
        }
        break;
      }

      default:
        logger.debug('Stripe webhook: unhandled event type', { type: event.type });
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook: handler failed', err, { type: event.type });
    res.status(500).json({ error: 'Webhook handler error' });
  }
});

module.exports = router;
