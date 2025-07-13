/**
 * Vercel Serverless Function: Books API (2025 Standards)
 * Handles all book-related operations using modular BookManager
 */

const path = require('path');
const { requireApiKey } = require('../src/core/auth-middleware');
const BookManager = require('../src/core/book-manager');

// Initialize BookManager (reused across invocations for performance)
let bookManager = null;

function getBookManager() {
  if (!bookManager) {
    const BOOKS_FILE = path.join(process.cwd(), 'data/books.json');
    const HISTORY_DIR = path.join(process.cwd(), 'history');
    bookManager = new BookManager(BOOKS_FILE, HISTORY_DIR);
  }
  return bookManager;
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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
    
    // Get BookManager instance
    const manager = getBookManager();
    
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
        if (pathSegments.length === 1 && pathSegments[0] === 'books') {
          result = await manager.getAllBooks(req, res);
        } else if (pathSegments.length === 2 && pathSegments[1] === 'unclassified') {
          result = await manager.getUnclassifiedBooks(req, res);
        } else if (pathSegments.length === 2) {
          result = await manager.getBookById(req, res);
        } else {
          throw new Error('Invalid GET endpoint');
        }
        break;
        
      case 'POST':
        if (pathSegments.length === 1) {
          result = await manager.createBook(req, res);
        } else {
          throw new Error('Invalid POST endpoint');
        }
        break;
        
      case 'PATCH':
        if (pathSegments.length === 2) {
          result = await manager.updateBook(req, res);
        } else {
          throw new Error('Invalid PATCH endpoint');
        }
        break;
        
      default:
        throw new Error('Method not allowed');
    }
    
    // Add performance headers (2025 feature)
    const duration = Date.now() - startTime;
    res.setHeader('X-Response-Time', `${duration}ms`);
    res.setHeader('X-Function-Region', process.env.VERCEL_REGION || 'dev');
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Enhanced error handling for 2025
    console.error('Books API Error:', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
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
      available_endpoints: statusCode === 404 ? [
        'GET /api/books - List all books with filtering',
        'POST /api/books - Create new book',
        'GET /api/books/:id - Get specific book by ID',
        'PATCH /api/books/:id - Update existing book',
        'GET /api/books/unclassified - Get books needing classification'
      ] : undefined
    });
  }
};