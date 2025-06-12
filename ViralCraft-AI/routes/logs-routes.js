const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Get recent logs
router.get('/recent', (req, res) => {
  try {
    const stats = logger.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching log stats', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get error logs specifically
router.get('/errors', (req, res) => {
  try {
    const stats = logger.getStats();
    const recentErrors = stats.lastErrors || [];

    res.json({
      success: true,
      data: {
        totalErrors: stats.errorCount,
        recentErrors: recentErrors,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching error logs', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get log files list
router.get('/files', (req, res) => {
  try {
    const logsDir = path.join(__dirname, '../logs');

    if (!fs.existsSync(logsDir)) {
      return res.json({
        success: true,
        files: []
      });
    }

    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json({
      success: true,
      files
    });
  } catch (error) {
    logger.error('Error fetching log files', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear logs (reset stats)
router.post('/clear', (req, res) => {
  try {
    logger.resetStats();
    res.json({
      success: true,
      message: 'Log stats reset successfully'
    });
  } catch (error) {
    logger.error('Error clearing log stats', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;