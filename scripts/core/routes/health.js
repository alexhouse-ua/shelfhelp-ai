const express = require('express');
const router = express.Router();
const logger = require('../logger');

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'file-based',
        cache: 'active',
        firebase: process.env.ENABLE_FIREBASE === 'true' ? 'enabled' : 'disabled',
        rag: 'ready',
        recommendations: 'ready'
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      }
    };
    
    res.json(health);
    
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Detailed status endpoint
router.get('/status', async (req, res) => {
  try {
    const bookCache = require('../../../src/core/book-cache');
    const classificationCache = require('../../../src/core/classification-cache');
    
    const status = {
      api: {
        version: '2.0.0',
        endpoints: 74,
        middleware: ['auth', 'cors', 'rate-limiting', 'compression']
      },
      data: {
        books: bookCache.getAll().length,
        classifications: Object.keys(classificationCache.getData()).length,
        cache: {
          books: bookCache.getStats(),
          classifications: classificationCache.getStats()
        }
      },
      performance: {
        responseTime: Date.now() - req.startTime,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
    
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      details: error.message
    });
  }
});

module.exports = router;