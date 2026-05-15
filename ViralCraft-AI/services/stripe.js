const logger = require('../utils/logger');

let stripeClient = null;
let initialized = false;

function getStripe() {
  if (initialized) return stripeClient;
  initialized = true;

  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn('Stripe: STRIPE_SECRET_KEY not set, billing endpoints will return 503');
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia'
    });
    logger.info('Stripe: initialized');
    return stripeClient;
  } catch (err) {
    logger.warn('Stripe: SDK not installed — run `npm i stripe`', { error: err.message });
    return null;
  }
}

/**
 * Create a Checkout Session for the given plan. Reuses the existing Stripe
 * customer if one is recorded on the subscription, otherwise lets Stripe
 * create one with the user's email.
 */
async function createCheckoutSession({
  priceId,
  customerEmail,
  customerId,
  successUrl,
  cancelUrl,
  metadata = {}
}) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const params = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    allow_promotion_codes: true
  };
  if (customerId) {
    params.customer = customerId;
  } else if (customerEmail) {
    params.customer_email = customerEmail;
  }
  return stripe.checkout.sessions.create(params);
}

/**
 * Create a Customer Portal session for managing/canceling subscriptions.
 */
async function createPortalSession({ customerId, returnUrl }) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
}

/**
 * Verify a Stripe webhook payload using STRIPE_WEBHOOK_SECRET. Pass the raw
 * body (Buffer) and the value of the `stripe-signature` header.
 */
function verifyWebhook(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = {
  getStripe,
  createCheckoutSession,
  createPortalSession,
  verifyWebhook
};
