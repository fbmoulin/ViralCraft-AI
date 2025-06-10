/**
 * Query Optimizer Service for database query optimization
 */

const cacheService = require('./cacheService');

class QueryOptimizerService {
  constructor() {
    this.queryCache = new Map();
    this.stats = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  async optimizeQuery(query, params = {}) {
    const queryKey = this.generateQueryKey(query, params);
    this.stats.totalQueries++;

    // Check cache first
    const cached = await cacheService.get(queryKey);
    if (cached) {
      this.stats.cacheHits++;
      return JSON.parse(cached);
    }

    this.stats.cacheMisses++;
    return null;
  }

  async cacheQueryResult(query, params, result, ttl = 300) {
    const queryKey = this.generateQueryKey(query, params);
    await cacheService.set(queryKey, JSON.stringify(result), ttl);
  }

  generateQueryKey(query, params) {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    const paramsString = JSON.stringify(params);
    return `query_${Buffer.from(normalizedQuery + paramsString).toString('base64')}`;
  }

  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.totalQueries > 0 ? 
        (this.stats.cacheHits / this.stats.totalQueries * 100).toFixed(2) + '%' : 
        '0%'
    };
  }
}

module.exports = new QueryOptimizerService();