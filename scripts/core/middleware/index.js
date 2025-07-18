const express = require('express');
const helmet = require('helmet');
const corsOptions = require('../../../src/core/cors-config');
const { requireApiKey } = require('../../../src/core/auth-middleware');
const aiAssistantLimiter = require('../../../src/core/rate-limiter');
const logger = require('../logger');

// Performance timing middleware
const performanceMiddleware = (req, res, next) => {
  req.startTime = Date.now();
  next();
};

// Claude Pro response optimization middleware
const aiOptimizationMiddleware = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Optimize response for Claude Pro consumption
    if (data && typeof data === 'object') {
      // Add metadata for AI assistant context
      if (!data.metadata) {
        data.metadata = {
          responseTime: Date.now() - req.startTime,
          endpoint: req.path,
          method: req.method,
          aiOptimized: true
        };
      }
      
      // Add success indicator for clear AI interpretation
      if (!data.success && !data.error) {
        data.success = true;
      }
      
      // Add helpful user-facing messages for key endpoints
      if (req.path.includes('/queue/tbr')) {
        data.userMessage = `Found ${data.queue?.length || 0} books in your TBR queue, prioritized by your reading preferences.`;
      } else if (req.path.includes('/recommendations/discover')) {
        data.userMessage = `Found ${data.recommendations?.length || 0} book recommendations based on your preferences.`;
      } else if (req.path.includes('/classify')) {
        data.userMessage = data.book ? `Successfully classified "${data.book.title}" by ${data.book.author}` : 'Book classification completed';
      } else if (req.path.includes('/books/search')) {
        data.userMessage = `Found ${data.books?.length || 0} books matching your search.`;
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  logger.error('Request error', { 
    error: err.message, 
    stack: err.stack, 
    path: req.path, 
    method: req.method,
    body: req.body,
    query: req.query
  });
  
  // Determine error type and status
  let status = 500;
  let message = 'Internal server error';
  
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Invalid request data';
  } else if (err.name === 'NotFoundError') {
    status = 404;
    message = 'Resource not found';
  } else if (err.name === 'AuthenticationError') {
    status = 401;
    message = 'Authentication required';
  } else if (err.name === 'AuthorizationError') {
    status = 403;
    message = 'Access forbidden';
  }
  
  const errorResponse = {
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: new Date().toISOString(),
    path: req.path
  };
  
  res.status(status).json(errorResponse);
};

// Configure all middleware
const setupMiddleware = (app) => {
  // Security
  app.use(helmet());
  
  // CORS
  app.use(require('cors')(corsOptions));
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Rate limiting for API routes
  app.use('/api/', aiAssistantLimiter);
  
  // Performance timing
  app.use('/api', performanceMiddleware);
  
  // Authentication
  app.use('/api', requireApiKey);
  
  // AI optimization
  app.use('/api', aiOptimizationMiddleware);
  
  // Error handling (must be last)
  app.use(errorHandler);
};

module.exports = {
  setupMiddleware,
  performanceMiddleware,
  aiOptimizationMiddleware,
  errorHandler
};