
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getHealthData } = require('../middleware/monitoring');

// Debug information endpoint
router.get('/debug', (req, res) => {
  try {
    const debugInfo = {
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        workingDirectory: process.cwd(),
        environment: process.env.NODE_ENV
      },
      memory: process.memoryUsage(),
      environment: {
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
        databaseUrl: process.env.DATABASE_URL || 'SQLite (default)',
        logLevel: process.env.LOG_LEVEL || 'info'
      },
      health: getHealthData(),
      logs: logger.getStats(),
      routes: {
        available: ['/api/health', '/api/debug', '/api/youtube', '/api/logs'],
        static: ['/static/css', '/static/js', '/static/images']
      }
    };

    logger.info('Debug information requested', { ip: req.ip });
    res.json({ success: true, debug: debugInfo });
  } catch (error) {
    logger.error('Debug endpoint error', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to gather debug information',
      message: error.message 
    });
  }
});

// Test AI services endpoint
router.get('/test-ai', async (req, res) => {
  try {
    const aiService = require('../services/ai');
    
    const testResults = {
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        status: 'not_tested'
      },
      anthropic: {
        configured: !!process.env.ANTHROPIC_API_KEY,
        status: 'not_tested'
      },
      fallback: {
        available: true,
        status: 'ready'
      }
    };

    // Test OpenAI if configured
    if (process.env.OPENAI_API_KEY) {
      try {
        // This would test the actual API - for now just mark as configured
        testResults.openai.status = 'configured';
        logger.info('OpenAI service test - configured');
      } catch (error) {
        testResults.openai.status = 'error';
        testResults.openai.error = error.message;
        logger.error('OpenAI service test failed', error);
      }
    }

    // Test Anthropic if configured
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        testResults.anthropic.status = 'configured';
        logger.info('Anthropic service test - configured');
      } catch (error) {
        testResults.anthropic.status = 'error';
        testResults.anthropic.error = error.message;
        logger.error('Anthropic service test failed', error);
      }
    }

    res.json({ success: true, tests: testResults });
  } catch (error) {
    logger.error('AI test endpoint error', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test AI services',
      message: error.message 
    });
  }
});

// Clear logs endpoint
router.post('/clear-logs', (req, res) => {
  try {
    logger.resetStats();
    logger.info('Debug logs cleared', { ip: req.ip });
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    logger.error('Clear logs error', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear logs',
      message: error.message 
    });
  }
});

module.exports = router;
