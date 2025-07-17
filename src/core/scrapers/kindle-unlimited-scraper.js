/**
 * Kindle Unlimited Scraper
 * Checks KU availability via Amazon search scraping
 */

const BaseScraper = require('./base-scraper');
const { URLSearchParams } = require('url');

class KindleUnlimitedScraper extends BaseScraper {
  constructor(config = {}) {
    super({
      timeout: 15000,
      rateLimitMs: 2000,
      searchUrl: 'https://www.amazon.com/s',
      ...config
    });
    
    this.serviceName = 'Kindle Unlimited';
  }

  /**
   * Check Kindle Unlimited availability for a book
   */
  async checkAvailability(book) {
    try {
      const validation = this.validateBookData(book);
      if (!validation.valid) {
        return {
          ku_availability: false,
          ku_expires_on: null,
          error: `Invalid book data: ${validation.errors.join(', ')}`,
          checked_at: new Date().toISOString(),
          source: 'kindle_unlimited_scraper'
        };
      }

      const searchQuery = this.buildSearchQuery(book);
      const searchUrl = this.buildSearchUrl(searchQuery);
      
      const response = await this.makeRequest(searchUrl);
      
      if (!response.success) {
        return {
          ku_availability: false,
          ku_expires_on: null,
          error: response.error,
          checked_at: new Date().toISOString(),
          source: 'kindle_unlimited_scraper'
        };
      }

      const availabilityResult = this.parseKUResponse(response.data, book);
      
      return {
        ...availabilityResult,
        checked_at: new Date().toISOString(),
        source: 'kindle_unlimited_scraper'
      };
      
    } catch (error) {
      return {
        ku_availability: false,
        ku_expires_on: null,
        error: error.message,
        checked_at: new Date().toISOString(),
        source: 'kindle_unlimited_scraper'
      };
    }
  }

  /**
   * Build Amazon search URL for KU books
   */
  buildSearchUrl(query) {
    const params = new URLSearchParams({
      k: query,
      i: 'digital-text',
      rh: 'n:133140011' // Kindle store filter
    });
    
    return `${this.config.searchUrl}?${params.toString()}`;
  }

  /**
   * Parse Amazon response for KU indicators
   */
  parseKUResponse(html, book) {
    const content = this.cleanHtmlText(html);
    
    // KU indicator patterns
    const kuIndicators = {
      strong: [
        'kindle unlimited',
        'read for free',
        'available on kindle unlimited',
        'read for $0.00',
        'ku-logo',
        'kindle-unlimited-logo'
      ],
      medium: [
        'unlimited',
        'read free',
        'free with kindle unlimited'
      ],
      weak: [
        'kindle',
        'digital'
      ]
    };

    // Check for indicators
    const foundIndicators = {
      strong: kuIndicators.strong.some(indicator => content.includes(indicator)),
      medium: kuIndicators.medium.some(indicator => content.includes(indicator)),
      weak: kuIndicators.weak.some(indicator => content.includes(indicator))
    };

    // Validate title/author matching
    const titleMatch = this.checkTitleMatch(content, book);
    const authorMatch = this.checkAuthorMatch(content, book);
    
    // Determine availability based on indicators and matching
    const hasKUIndicator = foundIndicators.strong || foundIndicators.medium;
    const hasContentMatch = titleMatch || authorMatch;
    const isAvailable = hasKUIndicator && hasContentMatch;
    
    // Calculate confidence score
    const confidence = this.calculateKUConfidence(foundIndicators, titleMatch, authorMatch);
    
    // Estimate expiration date (KU books typically stay 6-18 months)
    let expiresOn = null;
    if (isAvailable && confidence >= 0.7) {
      const now = new Date();
      const estimatedExpiry = new Date(now.getTime() + (12 * 30 * 24 * 60 * 60 * 1000)); // 12 months
      expiresOn = estimatedExpiry.toISOString().split('T')[0];
    }
    
    return {
      ku_availability: isAvailable,
      ku_expires_on: expiresOn,
      confidence: confidence,
      validation_details: {
        strong_indicators: foundIndicators.strong,
        medium_indicators: foundIndicators.medium,
        title_match: titleMatch,
        author_match: authorMatch,
        content_match: hasContentMatch
      }
    };
  }

  /**
   * Check if title matches in content
   */
  checkTitleMatch(content, book) {
    const title = book.book_title || book.title;
    if (!title) {return false;}
    
    const titleWords = title.toLowerCase()
      .split(' ')
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'its', 'said', 'each', 'make', 'most', 'over', 'said', 'some', 'time', 'very', 'what', 'with', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were'].includes(word));
    
    if (titleWords.length === 0) {return false;}
    
    const matchedWords = titleWords.filter(word => content.includes(word));
    return matchedWords.length >= Math.ceil(titleWords.length * 0.6);
  }

  /**
   * Check if author matches in content
   */
  checkAuthorMatch(content, book) {
    const author = book.author_name;
    if (!author) {return false;}
    
    const authorWords = author.toLowerCase()
      .split(' ')
      .filter(word => word.length > 2);
    
    if (authorWords.length === 0) {return false;}
    
    const matchedWords = authorWords.filter(word => content.includes(word));
    return matchedWords.length >= Math.ceil(authorWords.length * 0.7);
  }

  /**
   * Calculate KU-specific confidence score with enhanced validation
   */
  calculateKUConfidence(indicators, titleMatch, authorMatch) {
    let confidence = 0.0;
    
    // Base confidence from indicators (reduced to prevent false positives)
    if (indicators.strong) {
      confidence += 0.4; // Reduced from 0.5
    } else if (indicators.medium) {
      confidence += 0.2; // Reduced from 0.3
    } else if (indicators.weak) {
      confidence += 0.05; // Reduced from 0.1
    }
    
    // Boost for content matching (increased importance)
    if (titleMatch && authorMatch) {
      confidence += 0.5; // Increased from 0.4
    } else if (titleMatch || authorMatch) {
      confidence += 0.2; // Same
    }
    
    // Strong indicators + strong matching = high confidence (capped lower)
    if (indicators.strong && titleMatch && authorMatch) {
      confidence = Math.min(confidence + 0.05, 0.9); // Capped at 0.9 instead of 1.0
    }
    
    // Stricter requirements for positive results
    if (!titleMatch && !authorMatch) {
      confidence = 0.0; // Zero confidence without content match
    }
    
    // Additional validation: require both strong indicator AND content match for high confidence
    if (confidence > 0.7 && (!indicators.strong || (!titleMatch && !authorMatch))) {
      confidence = Math.max(confidence * 0.6, 0.3);
    }
    
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Get service-specific health information
   */
  getServiceHealth() {
    const baseHealth = this.getHealthStats();
    
    return {
      ...baseHealth,
      service: this.serviceName,
      search_url: this.config.searchUrl,
      rate_limit_ms: this.config.rateLimitMs,
      last_request: this.lastRequestTime ? new Date(this.lastRequestTime).toISOString() : null
    };
  }
}

module.exports = KindleUnlimitedScraper;