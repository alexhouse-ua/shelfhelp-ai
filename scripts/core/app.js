const express = require('express');
const logger = require('./logger');
const { setupMiddleware } = require('./middleware');

// Import route modules
// const booksRouter = require('./routes/books');
// const classificationsRouter = require('./routes/classifications');
// const queueRouter = require('./routes/queue');
// const healthRouter = require('./routes/health');
// const recommendationsRouter = require('./routes/recommendations-simple');
// const backfillRouter = require('./routes/backfill');
// const availabilityRouter = require('./routes/availability');
// const preferencesRouter = require('./routes/preferences');
// const insightsRouter = require('./routes/insights');
// const knowledgeRouter = require('./knowledge-api');

// Import cache initialization
const bookCache = require('../../src/core/book-cache');
const classificationCache = require('../../src/core/classification-cache');

class APIServer {
  constructor() {
    this.app = express();
    this.PORT = process.env.PORT || 3000;
    this.setupApp();
  }

  setupApp() {
    // Configure middleware
    setupMiddleware(this.app);

    // Initialize performance caches
    this.initializeCaches();

    // Register route modules
    this.registerRoutes();

    // Setup error handling
    this.setupErrorHandling();
  }

  async initializeCaches() {
    try {
      logger.info('Initializing performance caches...');
      
      await bookCache.initializeIndexes();
      logger.info('Book cache initialized with indexes');
      
      await classificationCache.getData();
      logger.info('Classification cache initialized');
      
      const tbrBooks = bookCache.getByStatus('TBR');
      logger.info(`TBR queue cached: ${tbrBooks.length} books`);
      
      logger.info('Performance optimization active');
    } catch (error) {
      logger.error('Cache initialization failed', { 
        error: error.message, 
        stack: error.stack 
      });
    }
  }

  registerRoutes() {
    // Health check (no auth required)
    // this.app.use('/health', healthRouter);
    
    // API routes (with auth)
    // this.app.use('/api/books', booksRouter);
    // this.app.use('/api/classifications', classificationsRouter);
    // this.app.use('/api/queue', queueRouter);
    // this.app.use('/api/recommendations', recommendationsRouter);
    // this.app.use('/api/backfill', backfillRouter);
    // this.app.use('/api/availability', availabilityRouter);
    // this.app.use('/api/preferences', preferencesRouter);
    // this.app.use('/api/insights', insightsRouter);
    // this.app.use('/api', knowledgeRouter);
    
    // Legacy v2 routes (temporary compatibility)
    // this.app.use('/api/v2/books', booksRouter);
    // this.app.use('/api/v2/classifications', classificationsRouter);
    // this.app.use('/api/v2/queue', queueRouter);
    
    logger.info('Routes registered successfully');
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: {
          books: 'GET/POST/PATCH /api/books',
          classifications: 'GET/POST /api/classifications',
          queue: 'GET/POST /api/queue',
          recommendations: 'GET/POST /api/recommendations',
          backfill: 'GET/POST /api/backfill',
          availability: 'GET/POST /api/availability',
          preferences: 'GET/POST /api/preferences',
          insights: 'GET /api/insights',
          health: 'GET /health'
        }
      });
    });
  }

  start() {
    this.app.listen(this.PORT, () => {
      logger.info('ShelfHelp API server started', { 
        port: this.PORT,
        healthCheck: `http://localhost:${this.PORT}/health`,
        environment: process.env.NODE_ENV || 'development',
        authentication: !!process.env.API_KEY,
        architecture: 'modular'
      });
    });
  }

  getApp() {
    return this.app;
  }
}

module.exports = APIServer;