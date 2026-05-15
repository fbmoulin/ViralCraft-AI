const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { verifyWebhook } = require('../../services/clerk');

/**
 * Clerk webhook receiver. Mounted with express.raw() so we can verify the
 * Svix signature against the unparsed body. Handles user/org lifecycle events
 * and reflects them in the local DB.
 *
 * Expected events (configure in Clerk Dashboard → Webhooks):
 *   - user.created, user.updated, user.deleted
 *   - organization.created, organization.updated, organization.deleted
 *   - organizationMembership.created, organizationMembership.deleted
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.headers);
  } catch (err) {
    logger.warn('Clerk webhook: signature verification failed', { error: err.message });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const { type, data } = event;
  logger.info('Clerk webhook received', { type });

  if (!global.db || !global.db.isConnected) {
    logger.error('Clerk webhook: DB not available, dropping event', null, { type });
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    switch (type) {
      case 'user.created':
      case 'user.updated': {
        const email = data.email_addresses?.[0]?.email_address || null;
        await global.db.upsertUser({
          clerkUserId: data.id,
          email,
          name: data.first_name || null
        });
        break;
      }

      case 'user.deleted': {
        await global.db.deleteUserByClerkId(data.id);
        break;
      }

      case 'organization.created':
      case 'organization.updated': {
        // Resolve local ownerId from Clerk creator
        const owner = await global.db.findUserByClerkId(data.created_by);
        if (!owner) {
          logger.warn('Clerk webhook: org event references unknown user', {
            clerkOrgId: data.id,
            createdBy: data.created_by
          });
          break;
        }
        await global.db.upsertOrganization({
          clerkOrgId: data.id,
          name: data.name,
          slug: data.slug,
          ownerId: owner.id
        });
        break;
      }

      case 'organizationMembership.created': {
        const user = await global.db.findUserByClerkId(data.public_user_data?.user_id);
        const org = await global.db.findOrgByClerkId(data.organization?.id);
        if (user && org) {
          await global.db.addOrgMember({
            orgId: org.id,
            userId: user.id,
            role: data.role === 'admin' ? 'admin' : 'member'
          });
        }
        break;
      }

      default:
        logger.debug('Clerk webhook: unhandled event type', { type });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Clerk webhook: handler failed', err, { type });
    res.status(500).json({ error: 'Webhook handler error' });
  }
});

module.exports = router;
