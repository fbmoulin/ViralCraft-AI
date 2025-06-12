
const enhancedCache = require('../services/enhancedCacheService');

/**
 * API Response Caching Middleware
 */
function apiCache(duration = 300000) { // Default 5 minutes
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `api_${req.originalUrl}`;
    const cached = enhancedCache.get(cacheKey);

    if (cached) {
      console.log(`📦 Serving cached response for ${req.originalUrl}`);
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache response
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        enhancedCache.set(cacheKey, data, duration);
        res.setHeader('X-Cache-Status', 'MISS');
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
}

module.exports = apiCache;
