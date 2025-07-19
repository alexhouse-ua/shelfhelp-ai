const express = require('express');
const router = express.Router();
const { RecommendationSourcesManager } = require('../recommendation-sources');
const logger = require('../logger');

// Initialize recommendation sources manager
const recommendationSources = new RecommendationSourcesManager();

// GET /api/recommendations - Get personalized book recommendations
router.get('/', async (req, res) => {
  try {
    const { genre, mood, limit = 20 } = req.query;
    
    await recommendationSources.ensureLoaded();
    const sources = await recommendationSources.getPrioritizedSources({ genre, mood });
    
    res.json({
      success: true,
      sources: sources,
      query: { genre, mood, limit: parseInt(limit) },
      metadata: {
        sourceCount: sources.length,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Recommendations retrieval failed', { error: error.message, query: req.query });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recommendations',
      details: error.message
    });
  }
});

// POST /api/recommendations/query - Query-based recommendations
router.post('/query', async (req, res) => {
  try {
    await recommendationSources.ensureLoaded();
    const strategy = await recommendationSources.getRecommendationStrategy(req.body);
    
    res.json({
      success: true,
      strategy: strategy,
      query: req.body,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Query recommendations failed', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to process recommendation query',
      details: error.message
    });
  }
});

// GET /api/recommendations/similar/:bookId - Find similar books
router.get('/similar/:bookId', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    await recommendationSources.ensureLoaded();
    const sources = await recommendationSources.getPrioritizedSources({ 
      type: 'similar', 
      bookId: req.params.bookId 
    });
    
    res.json({
      success: true,
      sources: sources,
      bookId: req.params.bookId,
      limit: parseInt(limit),
      metadata: {
        sourceCount: sources.length,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Similar books retrieval failed', { error: error.message, bookId: req.params.bookId });
    res.status(500).json({
      success: false,
      error: 'Failed to find similar books',
      details: error.message
    });
  }
});

// POST /api/recommendations/discover - External book discovery
router.post('/discover', async (req, res) => {
  try {
    await recommendationSources.ensureLoaded();
    const strategy = await recommendationSources.getRecommendationStrategy(req.body);
    const queries = await recommendationSources.generateSearchQueries(req.body, strategy.sources);
    
    res.json({
      success: true,
      strategy: strategy,
      queries: queries,
      request: req.body,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Book discovery failed', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to discover books',
      details: error.message
    });
  }
});

// POST /api/recommendations/validate - Validate discovered books
router.post('/validate', async (req, res) => {
  try {
    await recommendationSources.ensureLoaded();
    const validation = await recommendationSources.validateDiscoveredBook(req.body);
    
    res.json({
      success: true,
      validation: validation,
      book: req.body,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Book validation failed', { error: error.message, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to validate books',
      details: error.message
    });
  }
});

// GET /api/recommendations/sources - Get recommendation sources
router.get('/sources', async (req, res) => {
  try {
    await recommendationSources.ensureLoaded();
    const sourcesInfo = await recommendationSources.getSourcesInfo();
    
    res.json({
      success: true,
      sources: sourcesInfo,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Recommendation sources retrieval failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recommendation sources',
      details: error.message
    });
  }
});

module.exports = router;