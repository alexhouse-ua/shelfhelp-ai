const APIServer = require('./app');
const logger = require('./logger');

// Test minimal server without knowledge-api
const app = new APIServer();

// Override registerRoutes to exclude problematic routes
app.registerRoutes = function() {
  // Health check (no auth required)
  this.app.use('/health', require('./routes/health'));
  
  // API routes (with auth)
  this.app.use('/api/books', require('./routes/books'));
  this.app.use('/api/classifications', require('./routes/classifications'));
  this.app.use('/api/queue', require('./routes/queue'));
  
  logger.info('Minimal routes registered successfully');
};

// Re-setup app with minimal routes
app.setupApp();

// Test server startup
console.log('Testing modular server startup...');
app.start();