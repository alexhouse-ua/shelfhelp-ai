/**
 * Rate limiting configuration for AI assistants
 */

const rateLimit = require('express-rate-limit');

const aiAssistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,              // 15 minutes
  max: 1000,                             // 1000 requests per 15 min (generous for AI)
  message: {
    error: 'Rate limit exceeded',
    message: 'AI assistant rate limit reached. Please wait before making more requests.',
    retryAfter: '15 minutes',
    maxRequests: 1000,
    windowMs: 900000,
    hint: 'Reduce request frequency or wait for rate limit window to reset'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator for AI assistants
  keyGenerator: (req) => {
    // Use User-Agent + IP for better AI assistant identification
    const userAgent = req.headers['user-agent'] || 'unknown';
    const isAI = userAgent.includes('GPT') || userAgent.includes('Claude') || userAgent.includes('AI');
    return isAI ? `ai_${userAgent}_${req.ip}` : req.ip;
  },
  // Skip rate limiting for health checks
  skip: (req) => {
    return req.path === '/health' || req.path === '/status';
  }
});

module.exports = aiAssistantLimiter;