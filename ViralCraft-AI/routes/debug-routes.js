
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
      fallback: {
        available: true,
        status: 'ready'
      }
    };

    // Test OpenAI if configured
    if (process.env.OPENAI_API_KEY) {
      try {
        // Test actual OpenAI connection
        const aiService = require('../services/ai');
        const openaiWorking = await aiService.testOpenAI();
        testResults.openai.status = openaiWorking ? 'working' : 'configured_but_failed';
        logger.info(`OpenAI service test - ${testResults.openai.status}`);
      } catch (error) {
        testResults.openai.status = 'error';
        testResults.openai.error = error.message;
        logger.error('OpenAI service test failed', error);
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

// Reinitialize AI service endpoint
router.post('/reinit-ai', async (req, res) => {
  try {
    console.log('🔄 Manual AI service reinitialization requested');
    const aiService = require('../services/ai');
    
    // Reset AI service state
    aiService.openai = null;
    aiService.initialized = false;
    aiService.fallbackMode = false;
    
    // Reinitialize
    const result = await aiService.initialize();
    
    logger.info('AI service reinitialization completed', { 
      ip: req.ip, 
      success: result,
      fallbackMode: aiService.fallbackMode 
    });
    
    res.json({ 
      success: true, 
      message: 'AI service reinitialized',
      status: {
        openaiWorking: result && !aiService.fallbackMode,
        fallbackMode: aiService.fallbackMode,
        initialized: aiService.initialized
      }
    });
  } catch (error) {
    logger.error('AI service reinitialization error', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reinitialize AI service',
      message: error.message 
    });
  }
});

module.exports = router;
