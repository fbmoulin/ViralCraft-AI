const logger = require('../utils/logger');

/**
 * Unified cache abstraction. Uses Redis if REDIS_URL is set, otherwise falls
 * back to an in-process Map with TTL. Same interface either way so callers
 * don't need to know which backend is active.
 */
class CacheService {
  constructor() {
    this.backend = 'memory';
    this.memoryStore = new Map();
    this.redis = null;
    this.connectAttempted = false;
  }

  async initialize() {
    if (this.connectAttempted) return;
    this.connectAttempted = true;

    if (!process.env.REDIS_URL) {
      logger.info('Cache: REDIS_URL not set, using in-memory store');
      return;
    }

    try {
      const Redis = require('ioredis');
      this.redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        lazyConnect: true
      });
      this.redis.on('error', (err) => {
        logger.warn('Redis error, will fall back to memory if persistent', { error: err.message });
      });
      await this.redis.connect();
      this.backend = 'redis';
      logger.info('Cache: connected to Redis');
    } catch (err) {
      logger.warn('Cache: Redis connect failed, falling back to memory', { error: err.message });
      this.redis = null;
    }
  }

  async get(key) {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        logger.warn('Cache: redis get failed, falling back', { error: err.message });
      }
    }
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds = 300) {
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch (err) {
        logger.warn('Cache: redis set failed, falling back', { error: err.message });
      }
    }
    this.memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null
    });
  }

  async del(key) {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        logger.warn('Cache: redis del failed', { error: err.message });
      }
    }
    this.memoryStore.delete(key);
  }

  /**
   * Convenience: get-or-compute. If the key is present, returns the cached
   * value; otherwise calls `fn`, caches the result for `ttlSeconds`, and
   * returns it.
   */
  async wrap(key, ttlSeconds, fn) {
    const hit = await this.get(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async close() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (_) {
        // ignore
      }
      this.redis = null;
    }
    this.memoryStore.clear();
  }

  getBackend() {
    return this.backend;
  }
}

module.exports = new CacheService();
