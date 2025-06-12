
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Comprehensive health check endpoint
router.get('/health', async (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      services: {},
      system: {
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          limit: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        cpu: process.cpuUsage(),
        nodeVersion: process.version
      }
    };

    // Get integration manager status if available
    if (global.integrationManager) {
      const integrationStatus = await global.integrationManager.getHealthStatus();
      healthData.services = integrationStatus.services;
      healthData.status = integrationStatus.overall;
      healthData.integrationManager = {
        initialized: integrationStatus.initialized,
        servicesCount: Object.keys(integrationStatus.services).length
      };
    } else {
      // Fallback to individual service checks
      await checkIndividualServices(healthData);
    }

    // Determine overall status
    const hasUnhealthyServices = Object.values(healthData.services).some(
      service => service.status === 'unhealthy' && service.critical
    );

    if (hasUnhealthyServices) {
      healthData.status = 'critical';
      res.status(503);
    } else if (Object.values(healthData.services).some(service => service.status === 'unhealthy')) {
      healthData.status = 'degraded';
      res.status(200);
    } else {
      res.status(200);
    }

    res.json(healthData);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Individual service health checks
async function checkIndividualServices(healthData) {
  // Database check
  try {
    if (global.db && global.db.isConnected) {
      const dbHealth = await global.db.healthCheck();
      healthData.services.database = {
        status: 'healthy',
        type: dbHealth.type || 'unknown',
        contentCount: dbHealth.contentCount || 0
      };
    } else {
      healthData.services.database = {
        status: 'unhealthy',
        error: 'Database not connected'
      };
    }
  } catch (error) {
    healthData.services.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // AI Service check
  try {
    if (global.aiService) {
      const aiStatus = global.aiService.getStatus();
      healthData.services.ai = {
        status: aiStatus.initialized ? 'healthy' : 'unhealthy',
        openai: aiStatus.openai,
        anthropic: aiStatus.anthropic,
        fallbackMode: aiStatus.fallbackMode
      };
    } else {
      healthData.services.ai = {
        status: 'unhealthy',
        error: 'AI service not initialized'
      };
    }
  } catch (error) {
    healthData.services.ai = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Cache service check
  try {
    if (global.cacheService) {
      const cacheHealthy = await global.cacheService.isHealthy();
      healthData.services.cache = {
        status: cacheHealthy ? 'healthy' : 'unhealthy',
        stats: global.cacheService.getStats ? global.cacheService.getStats() : {}
      };
    } else {
      healthData.services.cache = {
        status: 'disabled',
        note: 'Cache service not available'
      };
    }
  } catch (error) {
    healthData.services.cache = {
      status: 'unhealthy',
      error: error.message
    };
  }
}

// Quick readiness probe
router.get('/ready', async (req, res) => {
  try {
    // Basic readiness check - server is running and can handle requests
    const ready = {
      ready: true,
      timestamp: new Date().toISOString(),
      services: {
        server: 'ready'
      }
    };

    // Check if critical services are available
    if (global.integrationManager) {
      const status = await global.integrationManager.getHealthStatus();
      ready.services.integrationManager = status.initialized ? 'ready' : 'not_ready';
    }

    res.json(ready);
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  // Simple liveness check - process is running
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  });
});

// Detailed service status
router.get('/services', async (req, res) => {
  try {
    if (!global.integrationManager) {
      return res.status(404).json({
        error: 'Integration manager not available'
      });
    }

    const status = await global.integrationManager.getHealthStatus();
    res.json(status);
  } catch (error) {
    logger.error('Service status check failed:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
