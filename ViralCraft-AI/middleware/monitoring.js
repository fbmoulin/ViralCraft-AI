
const logger = require('../utils/logger');
const os = require('os');

// System monitoring middleware
const systemMonitoring = (req, res, next) => {
  // Track system resources
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  // Log high memory usage
  if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
    logger.warn('High memory usage detected', {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    });
  }
  
  // Add monitoring data to request
  req.monitoring = {
    startTime: Date.now(),
    memUsage,
    cpuUsage
  };
  
  next();
};

// Request logging middleware
const requestLogging = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
    
    // Log slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`
      });
    }
    
    originalEnd.apply(this, args);
  };
  
  next();
};

// Error tracking middleware
const errorTracking = (err, req, res, next) => {
  logger.error('Unhandled error', err, {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  } else {
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
};

// Health check endpoint data
const getHealthData = () => {
  const stats = logger.getStats();
  const memUsage = process.memoryUsage();
  
  return {
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024),
      limit: Math.round(memUsage.rss / 1024 / 1024)
    },
    cpu: {
      usage: process.cpuUsage(),
      loadAvg: os.loadavg()
    },
    logs: {
      errors: stats.errorCount,
      warnings: stats.warningCount,
      lastErrors: stats.lastErrors.slice(-3) // Last 3 errors
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  systemMonitoring,
  requestLogging,
  errorTracking,
  getHealthData
};
