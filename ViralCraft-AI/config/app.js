
module.exports = {
  database: {
    url: process.env.DATABASE_URL || 'sqlite:./database.sqlite',
    options: {
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  },
  server: {
    port: process.env.PORT || 5000,
    host: '0.0.0.0'
  },
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY
    }
  },
  cache: {
    redis: {
      url: process.env.REDIS_URL,
      enabled: !!process.env.REDIS_URL
    }
  },
  content: {
    contentTypes: ['social', 'blog', 'video', 'email', 'ad'],
    platforms: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'linkedin']
  }
};
