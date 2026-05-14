const logger = require('../utils/logger');

const DEFAULT_PLAN_ID = 'free';

/**
 * Quota service — figures out which plan applies to a user/org, counts current
 * usage for the cycle, and records new usage events.
 *
 * Subscriptions are looked up first by org (when present), then by user. When
 * no active subscription exists, the user gets the Free plan defined in the
 * Plan table.
 */
class QuotaService {
  get db() {
    return global.db;
  }

  async resolvePlan({ userId, orgId }) {
    if (!this.db || !this.db.isConnected) return null;

    const sub = await this.db.findActiveSubscription({ userId, orgId });
    if (sub && sub.plan) return sub.plan;

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
  async checkQuota({ userId, orgId, isImage = false }) {
    const plan = await this.resolvePlan({ userId, orgId });
    if (!plan) return { allowed: false, reason: 'No plan available' };

    const limit = isImage ? plan.imageGenerations : plan.monthlyAiCalls;
    if (limit < 0) return { allowed: true, plan, used: 0, limit, scope: isImage ? 'image' : 'ai' }; // unlimited sentinel

    const since = monthStart();
    const used = await this.db.countApiUsage({ userId, orgId, since, isImage });

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
    userId,
    orgId,
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
        userId,
        orgId,
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

  async getCurrentUsage({ userId, orgId }) {
    const plan = await this.resolvePlan({ userId, orgId });
    const since = monthStart();
    const aiUsed = await this.db.countApiUsage({ userId, orgId, since, isImage: false });
    const imageUsed = await this.db.countApiUsage({ userId, orgId, since, isImage: true });
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
