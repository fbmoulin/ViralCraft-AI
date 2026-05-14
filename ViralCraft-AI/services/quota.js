const logger = require('../utils/logger');

const DEFAULT_PLAN_ID = 'free';

/**
 * Quota service — figures out which plan applies to a user/org, counts current
 * usage for the cycle, and records new usage events.
 *
 * Callers pass Clerk IDs (`clerkUserId`, `clerkOrgId`) because that's what they
 * have on `req.auth`. Internally we translate to local UUIDs when we need to
 * look up Subscriptions (which FK to User.id / Organization.id), and we use the
 * Clerk IDs as-is for ApiUsage (which stores Clerk strings for ownership).
 */
class QuotaService {
  get db() {
    return global.db;
  }

  async resolvePlan({ clerkUserId, clerkOrgId }) {
    if (!this.db || !this.db.isConnected) return null;

    // Translate Clerk IDs → local UUIDs for Subscription lookup.
    let localUserId = null;
    let localOrgId = null;
    if (clerkOrgId) {
      const org = await this.db.findOrgByClerkId(clerkOrgId);
      localOrgId = org?.id || null;
    }
    if (!localOrgId && clerkUserId) {
      const user = await this.db.findUserByClerkId(clerkUserId);
      localUserId = user?.id || null;
    }

    if (localUserId || localOrgId) {
      const sub = await this.db.findActiveSubscription({
        userId: localUserId,
        orgId: localOrgId
      });
      if (sub && sub.plan) return sub.plan;
    }

    const free = await this.db.getPlan(DEFAULT_PLAN_ID);
    if (!free) {
      logger.warn('Quota: Free plan not seeded; allowing request with default caps');
      return { id: 'unknown', monthlyAiCalls: 5, imageGenerations: 1, maxOrgMembers: 1 };
    }
    return free;
  }

  /**
   * Returns { allowed, plan, used, limit, scope }. `scope` is either 'ai' or
   * 'image' depending on the endpoint.
   */
  async checkQuota({ clerkUserId, clerkOrgId, isImage = false }) {
    const plan = await this.resolvePlan({ clerkUserId, clerkOrgId });
    if (!plan) return { allowed: false, reason: 'No plan available' };

    const limit = isImage ? plan.imageGenerations : plan.monthlyAiCalls;
    if (limit < 0) {
      return { allowed: true, plan, used: 0, limit, scope: isImage ? 'image' : 'ai' };
    }

    const since = monthStart();
    const used = await this.db.countApiUsage({
      userId: clerkUserId,
      orgId: clerkOrgId,
      since,
      isImage
    });

    return {
      allowed: used < limit,
      plan,
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      scope: isImage ? 'image' : 'ai'
    };
  }

  async recordUsage({
    clerkUserId,
    clerkOrgId,
    endpoint,
    model,
    tokensIn = 0,
    tokensOut = 0,
    costUsd = 0,
    isImage = false
  }) {
    if (!this.db || !this.db.isConnected) return null;
    try {
      return await this.db.recordApiUsage({
        userId: clerkUserId,
        orgId: clerkOrgId,
        endpoint,
        model,
        tokensIn,
        tokensOut,
        costUsd,
        isImage
      });
    } catch (err) {
      logger.warn('Quota: failed to record usage', { error: err.message });
      return null;
    }
  }

  async getCurrentUsage({ clerkUserId, clerkOrgId }) {
    const plan = await this.resolvePlan({ clerkUserId, clerkOrgId });
    const since = monthStart();
    const aiUsed = await this.db.countApiUsage({
      userId: clerkUserId,
      orgId: clerkOrgId,
      since,
      isImage: false
    });
    const imageUsed = await this.db.countApiUsage({
      userId: clerkUserId,
      orgId: clerkOrgId,
      since,
      isImage: true
    });
    return {
      plan,
      cycleStart: since.toISOString(),
      ai: { used: aiUsed, limit: plan.monthlyAiCalls },
      image: { used: imageUsed, limit: plan.imageGenerations }
    };
  }
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

module.exports = new QuotaService();
