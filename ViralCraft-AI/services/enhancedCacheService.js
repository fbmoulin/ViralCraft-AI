
/**
 * Enhanced Cache Service with intelligent memory management and TTL
 */

class EnhancedCacheService {
  constructor(options = {}) {
    this.cache = new Map();
    this.timers = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0
    };
    
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
    this.maxSize = options.maxSize || 1000;
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    
    // Start periodic cleanup
    this.startCleanup();
  }

  set(key, value, ttl = this.defaultTTL) {
    try {
      // Check size limit
      if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
        this.evictOldest();
      }

      // Clear existing timer if key exists
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }

      // Store value with metadata
      const item = {
        value,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
      };

      this.cache.set(key, item);
      this.stats.sets++;
      this.stats.size = this.cache.size;

      // Set TTL timer
      if (ttl > 0) {
        const timer = setTimeout(() => {
          this.delete(key);
        }, ttl);
        this.timers.set(key, timer);
      }

      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  get(key) {
    try {
      const item = this.cache.get(key);
      
      if (!item) {
        this.stats.misses++;
        return null;
      }

      // Update access metadata
      item.lastAccessed = Date.now();
      item.accessCount++;
      
      this.stats.hits++;
      return item.value;
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  delete(key) {
    try {
      const deleted = this.cache.delete(key);
      
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
      
      if (deleted) {
        this.stats.deletes++;
        this.stats.size = this.cache.size;
      }
      
      return deleted;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    try {
      // Clear all timers
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      
      this.cache.clear();
      this.timers.clear();
      this.stats.size = 0;
      
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  evictOldest() {
    try {
      if (this.cache.size === 0) return;

      let oldestKey = null;
      let oldestTime = Date.now();

      // Find least recently used item
      for (const [key, item] of this.cache.entries()) {
        if (item.lastAccessed < oldestTime) {
          oldestTime = item.lastAccessed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.delete(oldestKey);
      }
    } catch (error) {
      console.error('Cache eviction error:', error);
    }
  }

  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  cleanup() {
    try {
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes max age
      
      const keysToDelete = [];
      
      for (const [key, item] of this.cache.entries()) {
        if (now - item.lastAccessed > maxAge) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => this.delete(key));
      
      if (keysToDelete.length > 0) {
        console.log(`🧹 Cache cleanup: removed ${keysToDelete.length} expired items`);
      }
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryUsage: this.getMemoryUsage()
    };
  }

  getMemoryUsage() {
    try {
      let totalSize = 0;
      
      for (const item of this.cache.values()) {
        totalSize += JSON.stringify(item).length;
      }
      
      return `${(totalSize / 1024).toFixed(2)}KB`;
    } catch (error) {
      return 'Unknown';
    }
  }

  // Get cache contents for debugging
  inspect() {
    const items = [];
    
    for (const [key, item] of this.cache.entries()) {
      items.push({
        key,
        size: JSON.stringify(item.value).length,
        age: Date.now() - item.createdAt,
        accessCount: item.accessCount,
        lastAccessed: new Date(item.lastAccessed).toISOString()
      });
    }
    
    return items.sort((a, b) => b.lastAccessed.localeCompare(a.lastAccessed));
  }
}

module.exports = new EnhancedCacheService({
  defaultTTL: 300000, // 5 minutes
  maxSize: 500,
  cleanupInterval: 60000 // 1 minute
});
