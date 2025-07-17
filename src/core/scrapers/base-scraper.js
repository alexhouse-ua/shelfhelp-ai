/**
 * Base Scraper Class
 * Common functionality for all web scrapers
 */

const axios = require('axios');
const logger = require('../../../scripts/core/logger');

class BaseScraper {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 15000,
      rateLimitMs: config.rateLimitMs || 2000,
      maxRetries: config.maxRetries || 3,
      userAgents: config.userAgents || [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ],
      ...config
    };
    
    this.lastRequestTime = 0;
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0
    };
  }

  /**
   * Rate limiting - ensure minimum delay between requests
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.config.rateLimitMs) {
      const delay = this.config.rateLimitMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get random user agent for requests
   */
  getRandomUserAgent() {
    const userAgents = this.config.userAgents;
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(url, options = {}) {
    await this.enforceRateLimit();
    
    const requestConfig = {
      timeout: this.config.timeout,
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...options.headers
      },
      ...options
    };

    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      this.stats.requests++;
      
      try {
        const response = await axios.get(url, requestConfig);
        this.stats.successes++;
        
        return {
          success: true,
          data: response.data,
          status: response.status,
          headers: response.headers
        };
        
      } catch (error) {
        lastError = error;
        this.stats.failures++;
        
        if (attempt < this.config.maxRetries) {
          this.stats.retries++;
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          logger.warn(`Request failed (attempt ${attempt}/${this.config.maxRetries}), retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return {
      success: false,
      error: lastError.message,
      status: lastError.response?.status,
      retries: this.config.maxRetries
    };
  }

  /**
   * Extract text content and clean HTML
   */
  cleanHtmlText(html) {
    if (!html) {return '';}
    
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Validate book data for searching
   */
  validateBookData(book) {
    const validation = {
      valid: false,
      title: null,
      author: null,
      errors: []
    };

    // Extract title
    const title = book.book_title || book.title;
    if (!title || title.trim().length === 0) {
      validation.errors.push('Missing or empty title');
    } else {
      validation.title = title.trim();
    }

    // Extract author  
    const author = book.author_name;
    if (!author || author.trim().length === 0) {
      validation.errors.push('Missing or empty author');
    } else {
      validation.author = author.trim();
    }

    validation.valid = validation.errors.length === 0;
    return validation;
  }

  /**
   * Build search query from book data
   */
  buildSearchQuery(book) {
    const validation = this.validateBookData(book);
    if (!validation.valid) {
      throw new Error(`Invalid book data: ${validation.errors.join(', ')}`);
    }

    const searchTerms = [];
    if (validation.title) {
      searchTerms.push(validation.title);
    }
    if (validation.author) {
      searchTerms.push(validation.author);
    }

    return searchTerms.join(' ');
  }

  /**
   * Calculate confidence score based on text matching
   */
  calculateConfidence(htmlContent, book, foundIndicators = {}) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    if (!title || !author) {
      return 0.0;
    }

    const content = this.cleanHtmlText(htmlContent);
    
    // Title matching
    const titleWords = title.toLowerCase().split(' ').filter(word => word.length > 2);
    const titleMatches = titleWords.filter(word => content.includes(word));
    const titleScore = titleWords.length > 0 ? titleMatches.length / titleWords.length : 0;
    
    // Author matching
    const authorWords = author.toLowerCase().split(' ').filter(word => word.length > 2);
    const authorMatches = authorWords.filter(word => content.includes(word));
    const authorScore = authorWords.length > 0 ? authorMatches.length / authorWords.length : 0;
    
    // Base confidence from title/author matching
    let confidence = (titleScore * 0.6) + (authorScore * 0.4);
    
    // Boost confidence for strong indicators
    if (foundIndicators.strong) {
      confidence = Math.min(confidence + 0.2, 1.0);
    }
    
    // Reduce confidence for weak signals
    if (foundIndicators.weak && !foundIndicators.strong) {
      confidence = Math.max(confidence - 0.1, 0.0);
    }
    
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Get scraper health statistics
   */
  getHealthStats() {
    const total = this.stats.requests;
    const successRate = total > 0 ? (this.stats.successes / total * 100).toFixed(1) : 0;
    
    return {
      ...this.stats,
      successRate: parseFloat(successRate),
      status: successRate >= 80 ? 'healthy' : successRate >= 60 ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0
    };
  }

  /**
   * Abstract method - must be implemented by subclasses
   */
  async checkAvailability(_book) {
    throw new Error('checkAvailability must be implemented by subclass');
  }
}

module.exports = BaseScraper;