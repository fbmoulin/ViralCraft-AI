/**
 * Seeds the Plan table with the three tiers used by ViralCraft-AI. Run after
 * each schema migration; safe to run repeatedly (uses upsert).
 *
 * Set STRIPE_PRICE_PRO / STRIPE_PRICE_TEAM env vars to wire each plan to the
 * matching Stripe price. The Free plan has no Stripe price.
 *
 *   npm run seed-plans
 */
require('dotenv').config();
const databaseService = require('../services/database');

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    stripePriceId: null,
    priceCents: 0,
    monthlyAiCalls: 20,
    imageGenerations: 5,
    maxOrgMembers: 1,
    features: { support: 'community', exportFormats: ['txt'] }
  },
  {
    id: 'pro',
    name: 'Pro',
    stripePriceId: process.env.STRIPE_PRICE_PRO || null,
    priceCents: 1900,
    monthlyAiCalls: 500,
    imageGenerations: 100,
    maxOrgMembers: 3,
    features: { support: 'email', exportFormats: ['txt', 'pdf', 'docx'], brandVoice: true }
  },
  {
    id: 'team',
    name: 'Team',
    stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
    priceCents: 4900,
    monthlyAiCalls: 2000,
    imageGenerations: 400,
    maxOrgMembers: 10,
    features: {
      support: 'priority',
      exportFormats: ['txt', 'pdf', 'docx'],
      brandVoice: true,
      collaboration: true,
      analytics: true
    }
  }
];

async function seed() {
  const ok = await databaseService.initialize();
  if (!ok) {
    console.error('Database did not initialize');
    process.exit(1);
  }
  global.db = databaseService;

  for (const plan of PLANS) {
    const result = await databaseService.upsertPlan(plan);
    console.log(
      `✓ ${result.id} (${result.name}) — ${result.monthlyAiCalls} AI / ${result.imageGenerations} images / $${(result.priceCents / 100).toFixed(2)}`
    );
  }

  await databaseService.close();
  process.exit(0);
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { seed, PLANS };
