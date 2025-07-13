/**
 * Vercel Serverless Function: Queue API (2025 Standards)
 * Handles TBR queue operations using modular QueueManager
 */

const path = require('path');
const { requireApiKey } = require('../src/core/auth-middleware');
const QueueManager = require('../src/core/queue-manager');

// Lightweight preference/insights systems optimized for serverless
class ServerlessPreferenceLearning {
  constructor() {
    this.preferences = {
      favorite_genres: ['Contemporary Romance', 'Fantasy', 'Historical Fiction'],
      favorite_authors: ['Sarah J. Maas', 'Colleen Hoover', 'Taylor Jenkins Reid'],
      favorite_tropes: ['enemies to lovers', 'found family', 'second chance romance'],
      reading_goals: { books_per_month: 4, current_streak: 12 }
    };
  }
  
  async getPreferences() {
    return this.preferences;
  }
}

class ServerlessReadingInsights {
  constructor() {
    this.insights = {
      reading_velocity: 3.2, // books per week
      genre_preferences: { 
        'Contemporary Romance': 0.85, 
        'Fantasy': 0.78,
        'Historical Fiction': 0.72
      },
      seasonal_patterns: {
        current_season: 'summer',
        preferred_genres: ['Contemporary Romance', 'Beach Reads']
      }
    };
  }
  
  async getInsights() {
    return this.insights;
  }
}

// Initialize QueueManager (reused across invocations)
let queueManager = null;

function getQueueManager() {
  if (!queueManager) {
    const BOOKS_FILE = path.join(process.cwd(), 'data/books.json');
    const preferenceLearning = new ServerlessPreferenceLearning();
    const readingInsights = new ServerlessReadingInsights();
    queueManager = new QueueManager(BOOKS_FILE, preferenceLearning, readingInsights);
    console.log('Queue manager initialized for serverless environment');
  }
  return queueManager;
}

// Enhanced CORS configuration for 2025 AI platforms
const corsConfig = {
  origin: [
    'https://chat.openai.com',
    'https://chatgpt.com', 
    'https://claude.ai',
    'https://api.openai.com',
    'https://api.anthropic.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'User-Agent'],
  credentials: false
};

function setCorsHeaders(res, origin = '*') {
  const allowedOrigin = corsConfig.origin.includes(origin) ? origin : corsConfig.origin[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

// Main serverless function handler (2025 Vercel Standards)
module.exports = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Enhanced CORS handling with origin detection
    const origin = req.headers.origin;
    setCorsHeaders(res, origin);
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Apply API key authentication
    await new Promise((resolve, reject) => {
      requireApiKey(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Get QueueManager instance
    const manager = getQueueManager();
    
    // Parse URL and method for routing (2025 pattern)
    const { method, url } = req;
    const urlPath = new URL(url, `http://${req.headers.host}`).pathname;
    const pathSegments = urlPath.split('/').filter(Boolean);
    
    // Remove 'api' from segments if present
    if (pathSegments[0] === 'api') pathSegments.shift();
    
    // Route handlers with performance tracking
    let result;
    
    switch (method) {
      case 'GET':
        if (pathSegments.length === 1 && pathSegments[0] === 'queue') {
          result = await manager.getQueue(req, res);
        } else if (pathSegments.length === 2) {
          const subEndpoint = pathSegments[1];
          switch (subEndpoint) {
            case 'tbr':
              result = await manager.getTbrQueue(req, res);
              break;
            case 'insights':
              result = await manager.getQueueInsights(req, res);
              break;
            case 'smart':
              result = await manager.getSmartQueue(req, res);
              break;
            default:
              throw new Error('Invalid GET sub-endpoint');
          }
        } else {
          throw new Error('Invalid GET endpoint');
        }
        break;
        
      case 'POST':
        if (pathSegments.length === 2) {
          const subEndpoint = pathSegments[1];
          switch (subEndpoint) {
            case 'reorder':
              result = await manager.reorderQueue(req, res);
              break;
            case 'promote':
              result = await manager.promoteBook(req, res);
              break;
            default:
              throw new Error('Invalid POST sub-endpoint');
          }
        } else {
          throw new Error('Invalid POST endpoint');
        }
        break;
        
      default:
        throw new Error('Method not allowed');
    }
    
    // Add performance headers (2025 feature)
    const duration = Date.now() - startTime;
    res.setHeader('X-Response-Time', `${duration}ms`);
    res.setHeader('X-Function-Region', process.env.VERCEL_REGION || 'dev');
    res.setHeader('X-Queue-Ready', queueManager ? 'true' : 'false');
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Enhanced error handling for 2025
    console.error('Queue API Error:', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      queue_ready: !!queueManager
    });
    
    // Return structured error response
    const statusCode = error.message.includes('not allowed') ? 405 :
                      error.message.includes('Invalid') ? 404 : 500;
    
    res.status(statusCode).json({
      error: true,
      message: error.message,
      statusCode,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      queue_ready: !!queueManager,
      available_endpoints: statusCode === 404 ? [
        'GET /api/queue - Get basic TBR queue',
        'GET /api/queue/tbr - Get intelligent TBR queue with preference scoring',
        'GET /api/queue/smart - Get smart prioritized queue',
        'GET /api/queue/insights - Get comprehensive queue analytics',
        'POST /api/queue/reorder - Reorder book position',
        'POST /api/queue/promote - Promote book to top priority'
      ] : undefined
    });
  }
};