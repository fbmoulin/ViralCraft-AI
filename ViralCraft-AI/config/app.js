
const path = require('path');

module.exports = {
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'sqlite:./soulclap.db',
    options: {
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  },
  
  // Content configuration
  content: {
    contentTypes: ['post', 'story', 'reel', 'video', 'short', 'article', 'thread'],
    platforms: ['instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'facebook'],
    tones: ['professional', 'casual', 'humorous', 'inspiring', 'educational', 'persuasive']
  },
  
  // AI configuration
  ai: {
    timeout: 30000,
    maxRetries: 3,
    rateLimits: {
      openai: { rpm: 3500, tpm: 90000 },
      anthropic: { rpm: 50, tpm: 40000 }
    }
  },
  
  // Cache configuration
  cache: {
    ttl: 300000, // 5 minutes
    maxSize: 1000,
    enabled: true
  },
  
  // Server configuration
  server: {
    port: process.env.PORT || 5000,
    host: '0.0.0.0',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  }
};
