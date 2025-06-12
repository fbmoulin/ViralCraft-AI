
const logger = require('../utils/logger');
const performanceService = require('./performanceService');

class IntegrationManager {
  constructor() {
    this.services = new Map();
    this.healthChecks = new Map();
    this.circuitBreakers = new Map();
    this.retryPolicies = new Map();
    this.initialized = false;
  }

  // Register a service with its health check and retry policy
  registerService(name, service, config = {}) {
    const serviceConfig = {
      healthCheck: config.healthCheck || (() => Promise.resolve(true)),
      retryPolicy: config.retryPolicy || { maxRetries: 3, backoffMs: 1000 },
      circuitBreaker: config.circuitBreaker || { threshold: 5, resetTimeMs: 60000 },
      fallback: config.fallback || null,
      critical: config.critical || false,
      timeout: config.timeout || 30000
    };

    this.services.set(name, { service, config: serviceConfig });
    this.healthChecks.set(name, {
      status: 'unknown',
      lastCheck: null,
      consecutiveFailures: 0
    });
    this.circuitBreakers.set(name, {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailure: null
    });

    logger.info(`Service registered: ${name}`);
  }

  // Initialize all services with proper error handling
  async initialize() {
    logger.info('🔧 Initializing Integration Manager...');
    
    try {
      const initPromises = Array.from(this.services.entries()).map(
        ([name, { service, config }]) => this.initializeService(name, service, config)
      );

      const results = await Promise.allSettled(initPromises);
      
      let successCount = 0;
      let criticalFailures = [];

      results.forEach((result, index) => {
        const serviceName = Array.from(this.services.keys())[index];
        const serviceConfig = this.services.get(serviceName).config;
        
        if (result.status === 'fulfilled') {
          successCount++;
          logger.info(`✅ ${serviceName} initialized successfully`);
        } else {
          logger.error(`❌ ${serviceName} initialization failed:`, result.reason);
          if (serviceConfig.critical) {
            criticalFailures.push(serviceName);
          }
        }
      });

      if (criticalFailures.length > 0) {
        logger.error(`Critical services failed: ${criticalFailures.join(', ')}`);
        throw new Error(`Critical service initialization failed: ${criticalFailures.join(', ')}`);
      }

      this.initialized = true;
      logger.info(`✅ Integration Manager initialized (${successCount}/${this.services.size} services)`);
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      return true;
    } catch (error) {
      logger.error('❌ Integration Manager initialization failed:', error);
      throw error;
    }
  }

  async initializeService(name, service, config) {
    try {
      if (service.initialize && typeof service.initialize === 'function') {
        await Promise.race([
          service.initialize(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Service initialization timeout')), config.timeout)
          )
        ]);
      }
      
      // Verify service is working
      await this.performHealthCheck(name);
      return true;
    } catch (error) {
      throw new Error(`${name} initialization failed: ${error.message}`);
    }
  }

  // Execute operation with circuit breaker and retry logic
  async executeWithResilience(serviceName, operation, ...args) {
    const serviceData = this.services.get(serviceName);
    if (!serviceData) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    const { service, config } = serviceData;
    const circuitBreaker = this.circuitBreakers.get(serviceName);

    // Check circuit breaker
    if (circuitBreaker.state === 'open') {
      if (Date.now() - circuitBreaker.lastFailure < config.circuitBreaker.resetTimeMs) {
        if (config.fallback) {
          logger.warn(`Circuit breaker open for ${serviceName}, using fallback`);
          return await config.fallback(...args);
        }
        throw new Error(`Service ${serviceName} is temporarily unavailable (circuit breaker open)`);
      } else {
        circuitBreaker.state = 'half-open';
        logger.info(`Circuit breaker for ${serviceName} entering half-open state`);
      }
    }

    // Execute with retry logic
    let lastError;
    for (let attempt = 0; attempt <= config.retryPolicy.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          operation.call(service, ...args),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), config.timeout)
          )
        ]);

        // Success - reset circuit breaker
        if (circuitBreaker.state === 'half-open') {
          circuitBreaker.state = 'closed';
          circuitBreaker.failures = 0;
          logger.info(`Circuit breaker for ${serviceName} reset to closed state`);
        }

        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`${serviceName} operation failed (attempt ${attempt + 1}):`, error.message);

        // Update circuit breaker
        circuitBreaker.failures++;
        if (circuitBreaker.failures >= config.circuitBreaker.threshold) {
          circuitBreaker.state = 'open';
          circuitBreaker.lastFailure = Date.now();
          logger.error(`Circuit breaker opened for ${serviceName}`);
        }

        // Wait before retry (exponential backoff)
        if (attempt < config.retryPolicy.maxRetries) {
          const delay = config.retryPolicy.backoffMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - try fallback
    if (config.fallback) {
      logger.warn(`All retries failed for ${serviceName}, using fallback`);
      try {
        return await config.fallback(...args);
      } catch (fallbackError) {
        logger.error(`Fallback also failed for ${serviceName}:`, fallbackError.message);
      }
    }

    throw lastError;
  }

  // Perform health check on a service
  async performHealthCheck(serviceName) {
    const serviceData = this.services.get(serviceName);
    const healthData = this.healthChecks.get(serviceName);
    
    if (!serviceData) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    try {
      const startTime = Date.now();
      await serviceData.config.healthCheck();
      const responseTime = Date.now() - startTime;

      healthData.status = 'healthy';
      healthData.lastCheck = new Date();
      healthData.consecutiveFailures = 0;
      healthData.responseTime = responseTime;

      return true;
    } catch (error) {
      healthData.status = 'unhealthy';
      healthData.lastCheck = new Date();
      healthData.consecutiveFailures++;
      healthData.lastError = error.message;

      logger.warn(`Health check failed for ${serviceName}:`, error.message);
      return false;
    }
  }

  // Start periodic health monitoring
  startHealthMonitoring() {
    setInterval(async () => {
      const healthPromises = Array.from(this.services.keys()).map(
        serviceName => this.performHealthCheck(serviceName).catch(() => false)
      );
      
      await Promise.allSettled(healthPromises);
    }, 30000); // Check every 30 seconds

    logger.info('🔍 Health monitoring started');
  }

  // Get comprehensive health status
  async getHealthStatus() {
    const status = {
      overall: 'healthy',
      services: {},
      timestamp: new Date(),
      initialized: this.initialized
    };

    for (const [name, healthData] of this.healthChecks.entries()) {
      const circuitBreaker = this.circuitBreakers.get(name);
      const serviceConfig = this.services.get(name).config;

      status.services[name] = {
        status: healthData.status,
        lastCheck: healthData.lastCheck,
        consecutiveFailures: healthData.consecutiveFailures,
        responseTime: healthData.responseTime,
        circuitBreakerState: circuitBreaker.state,
        critical: serviceConfig.critical,
        lastError: healthData.lastError
      };

      // Update overall status
      if (healthData.status === 'unhealthy' && serviceConfig.critical) {
        status.overall = 'critical';
      } else if (healthData.status === 'unhealthy' && status.overall === 'healthy') {
        status.overall = 'degraded';
      }
    }

    return status;
  }

  // Get service instance with resilience wrapper
  getService(serviceName) {
    const serviceData = this.services.get(serviceName);
    if (!serviceData) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    return new Proxy(serviceData.service, {
      get: (target, prop) => {
        if (typeof target[prop] === 'function' && prop !== 'initialize') {
          return (...args) => this.executeWithResilience(serviceName, target[prop], ...args);
        }
        return target[prop];
      }
    });
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('🔄 Shutting down Integration Manager...');
    
    const shutdownPromises = Array.from(this.services.entries()).map(
      async ([name, { service }]) => {
        try {
          if (service.close && typeof service.close === 'function') {
            await service.close();
            logger.info(`✅ ${name} shut down gracefully`);
          }
        } catch (error) {
          logger.error(`❌ Error shutting down ${name}:`, error.message);
        }
      }
    );

    await Promise.allSettled(shutdownPromises);
    this.initialized = false;
    logger.info('✅ Integration Manager shutdown complete');
  }
}

module.exports = new IntegrationManager();
