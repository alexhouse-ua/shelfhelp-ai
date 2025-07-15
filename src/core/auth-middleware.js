/**
 * Authentication middleware for ShelfHelp AI
 * Handles API key validation for AI assistant access
 */

const logger = require('../../scripts/core/logger');

/**
 * Mandatory API key authentication for AI assistants
 */
function requireApiKey(req, res, next) {
  // Health checks remain public
  if (req.path === '/health' || req.path === '/status') {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;
  
  // STRICT MODE: API key is mandatory for AI assistant deployment
  if (!expectedKey) {
    logger.error('DEPLOYMENT_ERROR: API_KEY environment variable required for AI assistant deployment', {
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({
      error: 'Configuration Error',
      message: 'API key configuration required for AI assistant access',
      deployment_status: 'failed',
      hint: 'Set API_KEY environment variable'
    });
  }
  
  if (!apiKey || apiKey !== expectedKey) {
    logger.security('AI assistant unauthorized access attempt', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      hasApiKey: !!apiKey
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required for AI assistant access',
      hint: 'Include x-api-key header with your API key'
    });
  }
  
  // Log successful AI assistant access
  logger.info('AI assistant authenticated access', {
    path: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  next();
}

module.exports = {
  requireApiKey
};