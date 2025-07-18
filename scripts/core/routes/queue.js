const express = require('express');
const router = express.Router();
const QueueManager = require('../../../src/core/queue-manager');
const logger = require('../logger');

// Initialize queue manager
const queueManager = new QueueManager(
  require('path').join(__dirname, '../../data/books.json'),
  require('path').join(__dirname, '../../history')
);

// GET /api/queue - Get reading queue
router.get('/', async (req, res) => {
  try {
    const { status = 'TBR', limit = 50, prioritized = true } = req.query;
    
    const result = await queueManager.getQueue({
      status,
      limit: parseInt(limit),
      prioritized: prioritized === 'true'
    });
    
    res.json({
      success: true,
      queue: result.queue,
      metadata: result.metadata,
      prioritization: result.prioritization
    });
    
  } catch (error) {
    logger.error('Queue retrieval failed', { error: error.message, query: req.query });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve queue',
      details: error.message
    });
  }
});

// GET /api/queue/tbr - Get TBR queue with intelligent prioritization
router.get('/tbr', async (req, res) => {
  try {
    const { limit = 20, diversityMode = 'balanced' } = req.query;
    
    const result = await queueManager.getTBRQueue({
      limit: parseInt(limit),
      diversityMode
    });
    
    res.json({
      success: true,
      queue: result.queue,
      prioritization: result.prioritization,
      analytics: result.analytics,
      recommendations: result.recommendations
    });
    
  } catch (error) {
    logger.error('TBR queue retrieval failed', { error: error.message, query: req.query });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve TBR queue',
      details: error.message
    });
  }
});

// POST /api/queue/reorder - Reorder queue items
router.post('/reorder', async (req, res) => {
  try {
    const { bookId, newPosition, reason } = req.body;
    
    const result = await queueManager.reorderQueue(bookId, newPosition, reason);
    
    res.json({
      success: true,
      queue: result.queue,
      changed: result.changed,
      message: 'Queue reordered successfully'
    });
    
  } catch (error) {
    logger.error('Queue reorder failed', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to reorder queue',
      details: error.message
    });
  }
});

// POST /api/queue/promote - Promote book to top priority
router.post('/promote', async (req, res) => {
  try {
    const { bookId, reason } = req.body;
    
    const result = await queueManager.promoteBook(bookId, reason);
    
    res.json({
      success: true,
      book: result.book,
      newPosition: result.newPosition,
      message: 'Book promoted successfully'
    });
    
  } catch (error) {
    logger.error('Book promotion failed', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to promote book',
      details: error.message
    });
  }
});

// GET /api/queue/insights - Get queue analytics and insights
router.get('/insights', async (req, res) => {
  try {
    const result = await queueManager.getQueueInsights();
    
    res.json({
      success: true,
      insights: result.insights,
      analytics: result.analytics,
      health: result.health,
      recommendations: result.recommendations
    });
    
  } catch (error) {
    logger.error('Queue insights retrieval failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve queue insights',
      details: error.message
    });
  }
});

module.exports = router;