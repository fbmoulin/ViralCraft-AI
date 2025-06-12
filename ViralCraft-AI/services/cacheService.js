/**
 * Cache Service with Redis fallback to memory
 */

const Redis = require('ioredis');
const { performance } = require('perf_hooks');

class CacheService {
  constructor() {
    this.redis = null;
    this.memoryCache = new Map();
    this.connected = false;
    this.initRedis();
  }

  async initRedis() {
    try {
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL);
        this.redis.on('connect', () => {
          this.connected = true;
          console.log('✅ Redis connected');
        });
        this.redis.on('error', (err) => {
          console.warn('⚠️ Redis error, falling back to memory cache:', err.message);
          this.connected = false;
        });
      } else {
        console.log('📝 Using memory cache (Redis not configured)');
      }
    } catch (error) {
      console.warn('⚠️ Redis initialization failed, using memory cache:', error.message);
      this.connected = false;
    }
  }

  async get(key) {
    try {
      if (this.connected && this.redis) {
        return await this.redis.get(key);
      }
      return this.memoryCache.get(key);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      if (this.connected && this.redis) {
        await this.redis.setex(key, ttl, value);
      } else {
        this.memoryCache.set(key, value);
        // Simple TTL for memory cache
        setTimeout(() => {
          this.memoryCache.delete(key);
        }, ttl * 1000);
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async delete(key) {
    try {
      if (this.connected && this.redis) {
        await this.redis.del(key);
      } else {
        this.memoryCache.delete(key);
      }
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async clear() {
    try {
      if (this.connected && this.redis) {
        await this.redis.flushdb();
      } else {
        this.memoryCache.clear();
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  getStats() {
    return {
      size: this.memoryCache.size,
      hitRate: '0%',
      hits: 0,
      misses: 0,
      requests: 0,
      evictions: 0
    };
  }

  async isHealthy() {
    try {
      // Test cache functionality
      const testKey = '__health_check__';
      const testValue = { timestamp: Date.now() };

      await this.set(testKey, testValue, 1); // 1 second TTL
      const retrieved = await this.get(testKey);
      if (retrieved) {
        const parsedRetrieved = JSON.parse(retrieved);
        return parsedRetrieved.timestamp === testValue.timestamp;
      }

      return false;
    } catch (error) {
      console.error('Cache health check failed:', error);
      return false;
    }
  }
}

module.exports = new CacheService();