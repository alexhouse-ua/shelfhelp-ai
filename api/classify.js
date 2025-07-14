/**
 * Vercel Serverless Function: Classification API (2025 Standards)
 * Handles book classification and fuzzy matching using modular ClassificationHandler
 */

const path = require('path');
const { requireApiKey } = require('../src/core/auth-middleware');
const ClassificationHandler = require('../src/core/classification-handler');
const FuzzyClassificationMatcher = require('../scripts/fuzzy-classifier');

// Initialize systems (reused across invocations for performance)
let fuzzyMatcher = null;
let classificationHandler = null;
let initPromise = null;

// Initialize classification systems (once per cold start)
async function initializeClassificationSystems() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const BOOKS_FILE = path.join(process.cwd(), 'data/books.json');
    const HISTORY_DIR = path.join(process.cwd(), 'history');
    const CLASSIFICATIONS_FILE = path.join(process.cwd(), 'data/classifications.yaml');
    
    fuzzyMatcher = new FuzzyClassificationMatcher();
    await fuzzyMatcher.initialize(CLASSIFICATIONS_FILE);
    classificationHandler = new ClassificationHandler(fuzzyMatcher, BOOKS_FILE, HISTORY_DIR);
    console.log('Classification systems initialized for serverless');
  })();
  
  return initPromise;
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
    
    // Initialize classification systems if needed
    await initializeClassificationSystems();
    
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
        if (pathSegments.length === 1 && pathSegments[0] === 'classify') {
          result = await classificationHandler.getClassifications(req, res);
        } else if (pathSegments.length === 2 && pathSegments[1] === 'analysis') {
          result = await classificationHandler.getBackfillAnalysis(req, res);
        } else {
          throw new Error('Invalid GET endpoint');
        }
        break;
        
      case 'POST':
        if (pathSegments.length === 1 && pathSegments[0] === 'classify') {
          result = await classificationHandler.classifyBook(req, res);
        } else if (pathSegments.length === 2 && pathSegments[1] === 'match') {
          result = await classificationHandler.matchClassification(req, res);
        } else if (pathSegments.length === 2 && pathSegments[1] === 'ai') {
          result = await classificationHandler.aiClassifyBook(req, res);
        } else if (pathSegments.length === 2 && pathSegments[1] === 'title') {
          result = await classificationHandler.classifyBookByTitle(req, res);
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
    res.setHeader('X-Classification-Ready', fuzzyMatcher ? 'true' : 'false');
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Enhanced error handling for 2025
    console.error('Classification API Error:', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      classification_ready: !!fuzzyMatcher
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
      classification_ready: !!fuzzyMatcher,
      available_endpoints: statusCode === 404 ? [
        'GET /api/classify - Get available classifications',
        'POST /api/classify - Classify book with fuzzy matching',
        'POST /api/classify/match - Match specific classification field',
        'POST /api/classify/ai - AI-powered book classification',
        'GET /api/classify/analysis - Get classification backfill analysis'
      ] : undefined
    });
  }
};