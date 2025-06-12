
const EventEmitter = require('events');
const logger = require('../utils/logger');

class EnhancedCacheService extends EventEmitter {
  constructor() {
    super();
    this.cache = new Map();
    this.timers = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      requests: 0,
      evictions: 0,
      errors: 0
    };
    this.config = {
      maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
      defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300000, // 5 minutes
      cleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 60000, // 1 minute
      compressionThreshold: 1024 // Compress entries larger than 1KB
    };
    this.startCleanupTimer();
  }

  async set(key, value, ttlSeconds = null) {
    try {
      this.stats.requests++;
      
      if (!key) {
        throw new Error('Cache key cannot be empty');
      }

      // Check cache size limit
      if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
        this.evictLRU();
      }

      const ttl = ttlSeconds ? ttlSeconds * 1000 : this.config.defaultTTL;
      const expiresAt = Date.now() + ttl;
      
      // Prepare cache entry
      let processedValue = value;
      let compressed = false;

      // Compress large objects
      if (this.shouldCompress(value)) {
        try {
          processedValue = JSON.stringify(value);
          compressed = true;
        } catch (error) {
          logger.warn('Failed to compress cache value:', error.message);
        }
      }

      const entry = {
        value: processedValue,
        expiresAt,
        accessCount: 0,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        compressed
      };

      // Clear existing timer if key exists
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }

      // Set cache entry
      this.cache.set(key, entry);

      // Set expiration timer
      const timer = setTimeout(() => {
        this.delete(key);
      }, ttl);
      this.timers.set(key, timer);

      this.emit('set', { key, ttl, compressed });
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async get(key) {
    try {
      this.stats.requests++;

      if (!key) {
        this.stats.misses++;
        return null;
      }

      const entry = this.cache.get(key);
      
      if (!entry) {
        this.stats.misses++;
        return null;
      }

      // Check expiration
      if (Date.now() > entry.expiresAt) {
        this.delete(key);
        this.stats.misses++;
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = Date.now();

      this.stats.hits++;
      this.emit('hit', { key, accessCount: entry.accessCount });

      // Decompress if needed
      if (entry.compressed) {
        try {
          return JSON.parse(entry.value);
        } catch (error) {
          logger.warn('Failed to decompress cache value:', error.message);
          this.delete(key);
          return null;
        }
      }

      return entry.value;
    } catch (error) {
      this.stats.errors++;
      this.stats.misses++;
      logger.error('Cache get error:', error);
      return null;
    }
  }

  delete(key) {
    try {
      if (this.cache.has(key)) {
        this.cache.delete(key);
        
        if (this.timers.has(key)) {
          clearTimeout(this.timers.get(key));
          this.timers.delete(key);
        }
        
        this.emit('delete', { key });
        return true;
      }
      return false;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  has(key) {
    try {
      const entry = this.cache.get(key);
      if (!entry) return false;
      
      if (Date.now() > entry.expiresAt) {
        this.delete(key);
        return false;
      }
      
      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  clear() {
    try {
      // Clear all timers
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      
      this.cache.clear();
      this.timers.clear();
      
      this.emit('clear');
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache clear error:', error);
      return false;
    }
  }

  evictLRU() {
    try {
      let oldestKey = null;
      let oldestTime = Date.now();
      
      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.delete(oldestKey);
        this.stats.evictions++;
        this.emit('evict', { key: oldestKey, reason: 'LRU' });
      }
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache eviction error:', error);
    }
  }

  shouldCompress(value) {
    try {
      const size = JSON.stringify(value).length;
      return size > this.config.compressionThreshold;
    } catch (error) {
      return false;
    }
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  cleanup() {
    try {
      const now = Date.now();
      const keysToDelete = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => this.delete(key));
      
      if (keysToDelete.length > 0) {
        this.emit('cleanup', { expiredKeys: keysToDelete.length });
      }
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache cleanup error:', error);
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: this.stats.requests > 0 ? 
        ((this.stats.hits / this.stats.requests) * 100).toFixed(2) + '%' : '0%',
      hits: this.stats.hits,
      misses: this.stats.misses,
      requests: this.stats.requests,
      evictions: this.stats.evictions,
      errors: this.stats.errors,
      memoryUsage: this.getMemoryUsage()
    };
  }

  getMemoryUsage() {
    try {
      let totalSize = 0;
      for (const entry of this.cache.values()) {
        totalSize += JSON.stringify(entry).length;
      }
      return {
        entriesBytes: totalSize,
        entriesKB: (totalSize / 1024).toFixed(2),
        entriesMB: (totalSize / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      return { error: 'Unable to calculate memory usage' };
    }
  }

  async isHealthy() {
    try {
      const testKey = '__health_check__';
      const testValue = { 
        timestamp: Date.now(),
        test: 'health_check_data'
      };
      
      // Test set operation
      const setResult = await this.set(testKey, testValue, 1);
      if (!setResult) return false;
      
      // Test get operation
      const retrieved = await this.get(testKey);
      if (!retrieved || retrieved.timestamp !== testValue.timestamp) {
        return false;
      }
      
      // Test delete operation
      const deleteResult = this.delete(testKey);
      if (!deleteResult) return false;
      
      // Check error rate
      const errorRate = this.stats.requests > 0 ? 
        (this.stats.errors / this.stats.requests) : 0;
      
      return errorRate < 0.1; // Less than 10% error rate
    } catch (error) {
      logger.error('Cache health check failed:', error);
      return false;
    }
  }

  // Batch operations
  async setMultiple(entries, ttlSeconds = null) {
    const results = [];
    for (const [key, value] of Object.entries(entries)) {
      const result = await this.set(key, value, ttlSeconds);
      results.push({ key, success: result });
    }
    return results;
  }

  async getMultiple(keys) {
    const results = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  // Performance monitoring
  getPerformanceMetrics() {
    const stats = this.getStats();
    return {
      ...stats,
      efficiency: {
        hitRate: parseFloat(stats.hitRate),
        avgAccessPerEntry: this.cache.size > 0 ? 
          Array.from(this.cache.values())
            .reduce((sum, entry) => sum + entry.accessCount, 0) / this.cache.size : 0,
        errorRate: this.stats.requests > 0 ? 
          ((this.stats.errors / this.stats.requests) * 100).toFixed(2) + '%' : '0%'
      }
    };
  }
}

module.exports = new EnhancedCacheService();
