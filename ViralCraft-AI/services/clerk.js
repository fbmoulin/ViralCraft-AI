const logger = require('../utils/logger');

let clerk = null;
let clerkSdk = null;
let initialized = false;

/**
 * Lazy Clerk wrapper. Loads @clerk/clerk-sdk-node only if CLERK_SECRET_KEY is
 * set. When unavailable, the auth middlewares fall back to denying writes (in
 * production) or to a development bypass.
 */
function getClerk() {
  if (initialized) return clerk;
  initialized = true;

  if (!process.env.CLERK_SECRET_KEY) {
    logger.warn('Clerk: CLERK_SECRET_KEY not set, auth middleware will deny in production');
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    clerkSdk = require('@clerk/clerk-sdk-node');
    clerk = clerkSdk.createClerkClient
      ? clerkSdk.createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
      : clerkSdk;
    logger.info('Clerk: initialized');
    return clerk;
  } catch (err) {
    logger.warn('Clerk: SDK not installed — run `npm i @clerk/clerk-sdk-node`', {
      error: err.message
    });
    return null;
  }
}

/**
 * Verify a session token (JWT) issued by Clerk. Returns the decoded session or
 * null if invalid. The SDK supports both networkless verification (preferred)
 * and a fallback that hits Clerk's API.
 */
async function verifySessionToken(token) {
  if (!token) return null;
  const client = getClerk();
  if (!client) return null;

  try {
    if (clerkSdk && clerkSdk.verifyToken) {
      const payload = await clerkSdk.verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });
      return payload;
    }
    if (client.sessions && client.sessions.verifySession) {
      // Older SDK shape — requires sessionId and token separately.
      return null;
    }
    return null;
  } catch (err) {
    logger.warn('Clerk: token verification failed', { error: err.message });
    return null;
  }
}

async function getUser(clerkUserId) {
  const client = getClerk();
  if (!client) return null;
  try {
    const user = client.users
      ? await client.users.getUser(clerkUserId)
      : await clerkSdk.users.getUser(clerkUserId);
    return user;
  } catch (err) {
    logger.warn('Clerk: getUser failed', { error: err.message, clerkUserId });
    return null;
  }
}

/**
 * Verify a Clerk webhook payload using Svix signatures. Returns the parsed
 * event when valid, throws otherwise.
 */
function verifyWebhook(rawBody, headers) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('CLERK_WEBHOOK_SECRET not configured');
  }
  // eslint-disable-next-line global-require
  const { Webhook } = require('svix');
  const wh = new Webhook(secret);
  return wh.verify(rawBody, {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature']
  });
}

module.exports = { getClerk, verifySessionToken, getUser, verifyWebhook };
