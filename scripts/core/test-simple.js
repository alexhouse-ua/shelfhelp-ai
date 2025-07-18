const express = require('express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());

// Simple routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0-refactored'
  });
});

app.use('/api/books', require('./routes/test-books'));

// Start server
app.listen(PORT, () => {
  logger.info('Simple test server started', { 
    port: PORT,
    healthCheck: `http://localhost:${PORT}/health`
  });
});

module.exports = app;