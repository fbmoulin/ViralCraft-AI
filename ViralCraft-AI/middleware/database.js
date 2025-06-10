
const databaseService = require('../services/database');

// Middleware to ensure database connection
const ensureDatabaseConnection = async (req, res, next) => {
  try {
    if (!global.db || !global.db.isConnected) {
      console.log('🔄 Reconnecting to database...');
      const connected = await databaseService.initialize();
      if (connected) {
        global.db = databaseService;
      }
    }
    
    // Add database to request context
    req.db = global.db;
    next();
  } catch (error) {
    console.error('Database middleware error:', error);
    // Continue without database for graceful degradation
    req.db = null;
    next();
  }
};

// Health check middleware
const databaseHealthCheck = async (req, res, next) => {
  if (req.db && req.db.isConnected) {
    try {
      await req.db.healthCheck();
    } catch (error) {
      console.warn('Database health check failed:', error.message);
      req.db = null;
    }
  }
  next();
};

module.exports = {
  ensureDatabaseConnection,
  databaseHealthCheck
};
