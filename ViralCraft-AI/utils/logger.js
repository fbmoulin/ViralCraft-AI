
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        stack,
        ...meta
      });
    })
  ),
  defaultMeta: { service: 'viralcraft-ai' },
  transports: [
    // Error log
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    // Combined log
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${message}${stack ? '\n' + stack : ''}`;
        })
      )
    })
  ]
});

// Log monitoring functions
class LogMonitor {
  constructor() {
    this.errorCount = 0;
    this.warningCount = 0;
    this.lastErrors = [];
    this.startTime = Date.now();
  }

  trackError(error) {
    this.errorCount++;
    this.lastErrors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack
    });
    
    // Keep only last 10 errors
    if (this.lastErrors.length > 10) {
      this.lastErrors.shift();
    }
    
    // Alert if too many errors
    if (this.errorCount > 10) {
      logger.warn('🚨 High error rate detected', {
        errorCount: this.errorCount,
        timeframe: Date.now() - this.startTime
      });
    }
  }

  getStats() {
    return {
      uptime: Date.now() - this.startTime,
      errorCount: this.errorCount,
      warningCount: this.warningCount,
      lastErrors: this.lastErrors,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  reset() {
    this.errorCount = 0;
    this.warningCount = 0;
    this.lastErrors = [];
    this.startTime = Date.now();
  }
}

const monitor = new LogMonitor();

// Enhanced logger with monitoring
const enhancedLogger = {
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  
  warn: (message, meta = {}) => {
    monitor.warningCount++;
    logger.warn(message, meta);
  },
  
  error: (message, error = null, meta = {}) => {
    if (error instanceof Error) {
      monitor.trackError(error);
      logger.error(message, { 
        error: error.message, 
        stack: error.stack, 
        ...meta 
      });
    } else {
      logger.error(message, meta);
    }
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  
  getStats: () => monitor.getStats(),
  resetStats: () => monitor.reset()
};

module.exports = enhancedLogger;
