/**
 * Base Availability Service
 * Abstract base class for all availability checking services
 * Provides common interface and shared functionality
 */
class BaseAvailabilityService {
  constructor(config = {}) {
    this.name = config.name || 'Unknown Service';
    this.timeout = config.timeout || 15000;
    this.enabled = config.enabled !== false;
    this.retryCount = config.retryCount || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.userAgent = config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    
    // Service-specific configuration
    this.config = config;
    
    // Statistics
    this.stats = {
      checked: 0,
      found: 0,
      errors: 0,
      lastError: null,
      lastCheck: null
    };
  }

  /**
   * Check availability for a book - must be implemented by subclasses
   * @param {Object} book - Book object with title, author, etc.
   * @returns {Promise<Object>} Availability result
   */
  async checkAvailability(book) {
    throw new Error('checkAvailability must be implemented by subclass');
  }

  /**
   * Validate search result - must be implemented by subclasses
   * @param {string} html - Response HTML/text
   * @param {Object} book - Book object
   * @returns {Object} Validation result with confidence score
   */
  validateResult(html, book) {
    throw new Error('validateResult must be implemented by subclass');
  }

  /**
   * Build search query from book data
   * @param {Object} book - Book object
   * @returns {string} Search query string
   */
  buildSearchQuery(book) {
    const terms = [];
    if (book.book_title || book.title) {
      terms.push(book.book_title || book.title);
    }
    if (book.author_name) {
      terms.push(book.author_name);
    }
    return terms.join(' ');
  }

  /**
   * Extract searchable words from text (filter short words)
   * @param {string} text - Text to process
   * @returns {Array} Array of words
   */
  extractWords(text) {
    if (!text) {return [];}
    return text.toLowerCase()
      .split(' ')
      .filter(word => word.length > 2)
      .map(word => word.replace(/[^\w]/g, ''));
  }

  /**
   * Check if text contains any of the search words
   * @param {string} text - Text to search in
   * @param {Array} words - Words to search for
   * @returns {boolean} True if match found
   */
  containsWords(text, words) {
    if (!text || !words.length) {return false;}
    const lowerText = text.toLowerCase();
    return words.some(word => lowerText.includes(word));
  }

  /**
   * Generic HTTP request with retry logic
   * @param {string} url - URL to request
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async makeRequest(url, options = {}) {
    const requestOptions = {
      timeout: this.timeout,
      headers: {
        'User-Agent': this.userAgent,
        ...options.headers
      },
      ...options
    };

    let lastError;
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const axios = require('axios');
        const response = await axios.get(url, requestOptions);
        
        // Update stats
        this.stats.checked++;
        this.stats.lastCheck = new Date().toISOString();
        
        return response;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryCount) {
          // Wait before retry (exponential backoff)
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    this.stats.errors++;
    this.stats.lastError = lastError.message;
    throw lastError;
  }

  /**
   * Create standardized error result
   * @param {string} message - Error message
   * @returns {Object} Error result object
   */
  createErrorResult(message) {
    return {
      error: message,
      checked_at: new Date().toISOString(),
      source: this.name.toLowerCase().replace(/\s+/g, '_'),
      confidence: 0.0
    };
  }

  /**
   * Create standardized success result
   * @param {Object} data - Result data
   * @returns {Object} Success result object
   */
  createSuccessResult(data) {
    return {
      ...data,
      checked_at: new Date().toISOString(),
      source: this.name.toLowerCase().replace(/\s+/g, '_')
    };
  }

  /**
   * Get service statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      service: this.name,
      enabled: this.enabled,
      ...this.stats,
      successRate: this.stats.checked > 0 ? 
        ((this.stats.checked - this.stats.errors) / this.stats.checked * 100).toFixed(1) + '%' : 
        '0%',
      foundRate: this.stats.checked > 0 ? 
        (this.stats.found / this.stats.checked * 100).toFixed(1) + '%' : 
        '0%'
    };
  }

  /**
   * Reset service statistics
   */
  resetStats() {
    this.stats = {
      checked: 0,
      found: 0,
      errors: 0,
      lastError: null,
      lastCheck: null
    };
  }

  /**
   * Check if service is enabled and configured
   * @returns {boolean} True if service is ready
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get service configuration
   * @returns {Object} Service configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

module.exports = { BaseAvailabilityService };