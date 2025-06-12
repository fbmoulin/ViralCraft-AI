
/**
 * Performance Service for monitoring application performance
 */

class PerformanceService {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0
      },
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0
      },
      database: {
        queries: 0,
        averageQueryTime: 0,
        errors: 0
      },
      ai: {
        requests: 0,
        averageResponseTime: 0,
        errors: 0,
        tokens: 0
      }
    };
    
    this.startTime = Date.now();
    this.responseTimes = [];
    this.queryTimes = [];
    this.aiResponseTimes = [];
  }

  recordRequest(responseTime, success = true) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
    
    // Track response times (keep last 100)
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    this.metrics.requests.averageResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  recordDatabaseQuery(queryTime, success = true) {
    this.metrics.database.queries++;
    
    if (!success) {
      this.metrics.database.errors++;
    }
    
    this.queryTimes.push(queryTime);
    if (this.queryTimes.length > 100) {
      this.queryTimes.shift();
    }
    
    this.metrics.database.averageQueryTime = 
      this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
  }

  recordAIRequest(responseTime, tokens = 0, success = true) {
    this.metrics.ai.requests++;
    this.metrics.ai.tokens += tokens;
    
    if (!success) {
      this.metrics.ai.errors++;
    }
    
    this.aiResponseTimes.push(responseTime);
    if (this.aiResponseTimes.length > 50) {
      this.aiResponseTimes.shift();
    }
    
    this.metrics.ai.averageResponseTime = 
      this.aiResponseTimes.reduce((a, b) => a + b, 0) / this.aiResponseTimes.length;
  }

  updateMemoryMetrics() {
    const memUsage = process.memoryUsage();
    this.metrics.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024) // MB
    };
  }

  getMetrics() {
    this.updateMemoryMetrics();
    
    return {
      ...this.metrics,
      uptime: Math.floor((Date.now() - this.startTime) / 1000), // seconds
      timestamp: new Date().toISOString(),
      health: this.calculateHealthScore()
    };
  }

  calculateHealthScore() {
    let score = 100;
    
    // Penalize for high error rate
    const errorRate = this.metrics.requests.failed / Math.max(this.metrics.requests.total, 1);
    if (errorRate > 0.05) score -= 20; // > 5% error rate
    if (errorRate > 0.1) score -= 30; // > 10% error rate
    
    // Penalize for slow response times
    if (this.metrics.requests.averageResponseTime > 2000) score -= 15; // > 2s
    if (this.metrics.requests.averageResponseTime > 5000) score -= 25; // > 5s
    
    // Penalize for high memory usage
    if (this.metrics.memory.heapUsed > 500) score -= 10; // > 500MB
    if (this.metrics.memory.heapUsed > 1000) score -= 20; // > 1GB
    
    return Math.max(0, score);
  }

  getHealthStatus() {
    const score = this.calculateHealthScore();
    
    if (score >= 80) return 'healthy';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  reset() {
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0, averageResponseTime: 0 },
      memory: { heapUsed: 0, heapTotal: 0, external: 0 },
      database: { queries: 0, averageQueryTime: 0, errors: 0 },
      ai: { requests: 0, averageResponseTime: 0, errors: 0, tokens: 0 }
    };
    
    this.responseTimes = [];
    this.queryTimes = [];
    this.aiResponseTimes = [];
    this.startTime = Date.now();
  }

  getServiceHealth() {
    return {
      database: global.db ? (global.db.isConnected ? 'healthy' : 'disconnected') : 'not_configured',
      ai: global.aiService ? (global.aiService.fallbackMode ? 'fallback' : 'healthy') : 'not_configured',
      cache: 'healthy',
      overall: this.getHealthStatus()
    };
  }

  async runHealthChecks() {
    const checks = {};
    
    // Database health
    if (global.db && global.db.isConnected) {
      try {
        await global.db.healthCheck();
        checks.database = { status: 'healthy', latency: 0 };
      } catch (error) {
        checks.database = { status: 'unhealthy', error: error.message };
      }
    } else {
      checks.database = { status: 'disconnected' };
    }
    
    // AI service health
    if (global.aiService) {
      checks.ai = {
        status: global.aiService.fallbackMode ? 'fallback' : 'healthy',
        providers: global.aiService.getStatus()
      };
    } else {
      checks.ai = { status: 'not_configured' };
    }
    
    // Memory health
    const memUsage = process.memoryUsage();
    checks.memory = {
      status: memUsage.heapUsed > 1024 * 1024 * 1024 ? 'warning' : 'healthy', // 1GB threshold
      usage: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
    };
    
    return checks;
  }
}

module.exports = new PerformanceService();
