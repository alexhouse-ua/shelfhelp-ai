/**
 * CORS configuration for AI assistant platforms
 */

// AI Assistant CORS Configuration
const corsOptions = {
  origin: [
    // AI Platform Origins
    'https://chat.openai.com',           // CustomGPT
    'https://chatgpt.com',               // ChatGPT interface
    'https://claude.ai',                 // Claude interface
    'https://api.openai.com',            // OpenAI API calls
    'https://api.anthropic.com',         // Anthropic API calls
    
    // Development & Deployment
    'http://localhost:3000',             // Local development
    'http://localhost:8080',             // Alternative local port
    /^https:\/\/.*\.railway\.app$/,      // Railway deployments
    /^https:\/\/.*\.render\.com$/,       // Render deployments
    /^https:\/\/.*\.vercel\.app$/,       // Vercel deployments
  ],
  credentials: false,                    // API key in headers, not cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'x-api-key', 
    'Authorization',
    'User-Agent'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  optionsSuccessStatus: 200
};

module.exports = corsOptions;