const { BaseAvailabilityService } = require('./base-availability-service');

/**
 * Kindle Unlimited Service
 * Handles KU availability checking with advanced validation
 */
class KindleUnlimitedService extends BaseAvailabilityService {
  constructor(config = {}) {
    super({
      name: 'Kindle Unlimited',
      timeout: 15000,
      enabled: true,
      ...config
    });
    
    this.searchUrl = 'https://www.amazon.com/s';
    this.searchParams = 'i=digital-text&rh=n%3A133140011'; // KU filter
  }

  /**
   * Check Kindle Unlimited availability
   * @param {Object} book - Book object
   * @returns {Promise<Object>} KU availability result
   */
  async checkAvailability(book) {
    try {
      if (!book.title && !book.author_name) {
        return this.createErrorResult('Insufficient search data');
      }

      const query = this.buildSearchQuery(book);
      const searchUrl = `${this.searchUrl}?k=${encodeURIComponent(query)}&${this.searchParams}`;
      
      const response = await this.makeRequest(searchUrl);
      const validation = this.validateResult(response.data, book);
      
      let expiresOn = null;
      if (validation.isValid) {
        // Estimate KU expiration (12 months typical)
        const now = new Date();
        const estimatedExpiry = new Date(now.getTime() + (12 * 30 * 24 * 60 * 60 * 1000));
        expiresOn = estimatedExpiry.toISOString().split('T')[0];
      }

      if (validation.isValid) {
        this.stats.found++;
      }
      
      return this.createSuccessResult({
        ku_availability: validation.isValid,
        ku_expires_on: expiresOn,
        confidence: validation.confidence,
        validation_reasons: validation.reasons
      });
      
    } catch (error) {
      return this.createErrorResult(error.message);
    }
  }

  /**
   * Advanced validation for KU availability
   * @param {string} html - Response HTML
   * @param {Object} book - Book object
   * @returns {Object} Validation result
   */
  validateResult(html, book) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    // KU indicator detection
    const hasKUIndicator = html.includes('Kindle Unlimited') || 
                          html.includes('kindle-unlimited') ||
                          html.includes('KU logo') ||
                          html.includes('Read for free');
    
    const hasStrongKUIndicator = html.includes('Available on Kindle Unlimited') ||
                                html.includes('Read for $0.00') ||
                                html.includes('ku-logo') ||
                                html.includes('kindle-unlimited-logo');
    
    // Title/author matching
    const titleWords = this.extractWords(title);
    const authorWords = this.extractWords(author);
    
    const titleMatch = this.containsWords(html, titleWords);
    const authorMatch = this.containsWords(html, authorWords);
    
    // Require KU indicators AND content match
    const isValid = hasKUIndicator && hasStrongKUIndicator && (titleMatch || authorMatch);
    
    return {
      isValid,
      confidence: isValid ? (titleMatch && authorMatch ? 0.95 : 0.8) : 0.0,
      reasons: {
        hasKUIndicator,
        hasStrongKUIndicator,
        titleMatch,
        authorMatch
      }
    };
  }

  /**
   * Get KU-specific service information
   * @returns {Object} Service information
   */
  getServiceInfo() {
    return {
      name: this.name,
      searchUrl: this.searchUrl,
      features: [
        'Amazon search integration',
        'Multi-layer validation',
        'Expiration estimation',
        'Confidence scoring'
      ],
      limitations: [
        'No real-time KU catalog access',
        'Expiration dates are estimated',
        'Subject to Amazon rate limiting'
      ]
    };
  }
}

module.exports = { KindleUnlimitedService };