const { BaseAvailabilityService } = require('./base-availability-service');

/**
 * Library Service
 * Handles library system availability checking (OverDrive/Libby)
 */
class LibraryService extends BaseAvailabilityService {
  constructor(libraryKey, config = {}) {
    super({
      name: config.name || 'Library System',
      timeout: 15000,
      enabled: config.enabled || false,
      ...config
    });
    
    this.libraryKey = libraryKey;
    this.overdriveId = config.overdrive_id || null;
    this.catalogUrl = config.libby_catalog_url || null;
    
    // Status mappings
    this.statusMappings = {
      available: 'Available',
      waitlist: 'Waitlist',
      unavailable: 'Unavailable'
    };
  }

  /**
   * Check library availability for both ebook and audio
   * @param {Object} book - Book object
   * @returns {Promise<Object>} Library availability result
   */
  async checkAvailability(book) {
    try {
      if (!this.isConfigured()) {
        return this.createErrorResult(`${this.name} not configured`);
      }

      if (!book.title && !book.author_name) {
        return this.createErrorResult('Insufficient search data');
      }

      const query = this.buildSearchQuery(book);
      const searchUrl = `${this.catalogUrl}/search?query=${encodeURIComponent(query)}`;
      
      const response = await this.makeRequest(searchUrl);
      const availability = this.parseAvailability(response.data, book);
      
      if (availability.ebook_status === 'Available' || availability.audio_status === 'Available') {
        this.stats.found++;
      }
      
      return this.createSuccessResult(availability);
      
    } catch (error) {
      return this.createErrorResult(`Search failed: ${error.message}`);
    }
  }

  /**
   * Parse availability from library catalog response
   * @param {string} html - Response HTML
   * @param {Object} book - Book object
   * @returns {Object} Availability status
   */
  parseAvailability(html, book) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    // Basic book matching
    const hasBookMatch = this.hasBookMatch(html, title, author);
    
    let ebookStatus = 'Unavailable';
    let audioStatus = 'Unavailable';
    
    if (hasBookMatch) {
      ebookStatus = this.parseEbookStatus(html);
      audioStatus = this.parseAudioStatus(html);
    }
    
    return {
      ebook_status: ebookStatus,
      audio_status: audioStatus,
      library_key: this.libraryKey,
      library_name: this.name
    };
  }

  /**
   * Check if book matches in catalog
   * @param {string} html - Response HTML
   * @param {string} title - Book title
   * @param {string} author - Author name
   * @returns {boolean} True if match found
   */
  hasBookMatch(html, title, author) {
    const titleWords = this.extractWords(title);
    const authorWords = this.extractWords(author);
    
    const titleMatch = this.containsWords(html, titleWords);
    const authorMatch = this.containsWords(html, authorWords);
    
    return titleMatch || authorMatch;
  }

  /**
   * Parse ebook availability status
   * @param {string} html - Response HTML
   * @returns {string} Availability status
   */
  parseEbookStatus(html) {
    // Look for ebook availability indicators
    if (this.isAvailable(html, 'ebook')) {
      return 'Available';
    }
    
    const waitTime = this.parseWaitTime(html);
    if (waitTime) {
      return waitTime;
    }
    
    return 'Unavailable';
  }

  /**
   * Parse audiobook availability status
   * @param {string} html - Response HTML
   * @returns {string} Availability status
   */
  parseAudioStatus(html) {
    // Look for audiobook availability indicators
    if (this.isAvailable(html, 'audiobook')) {
      return 'Available';
    }
    
    const waitTime = this.parseWaitTime(html);
    if (waitTime) {
      return waitTime;
    }
    
    return 'Unavailable';
  }

  /**
   * Check if format is available
   * @param {string} html - Response HTML
   * @param {string} format - Format type (ebook/audiobook)
   * @returns {boolean} True if available
   */
  isAvailable(html, format) {
    const availableIndicators = ['available', 'Available', 'AVAILABLE'];
    const formatIndicators = format === 'ebook' ? 
      ['ebook', 'eBook', 'e-book', 'E-book'] : 
      ['audiobook', 'Audiobook', 'audio book', 'Audio Book'];
    
    return availableIndicators.some(avail => html.includes(avail)) &&
           formatIndicators.some(fmt => html.includes(fmt));
  }

  /**
   * Parse wait time from HTML
   * @param {string} html - Response HTML
   * @returns {string|null} Wait time string or null
   */
  parseWaitTime(html) {
    const waitTimeMatch = html.match(/(\d+)\s*(week|month)s?\s*wait/i);
    if (waitTimeMatch) {
      return `${waitTimeMatch[1]} ${waitTimeMatch[2]}s`;
    }
    return null;
  }

  /**
   * Check if service is properly configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return this.enabled && this.catalogUrl;
  }

  /**
   * Validate search result (placeholder for advanced validation)
   * @param {string} html - Response HTML
   * @param {Object} book - Book object
   * @returns {Object} Validation result
   */
  validateResult(html, book) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    const titleWords = this.extractWords(title);
    const authorWords = this.extractWords(author);
    
    const titleMatch = this.containsWords(html, titleWords);
    const authorMatch = this.containsWords(html, authorWords);
    
    return {
      isValid: titleMatch || authorMatch,
      confidence: (titleMatch && authorMatch) ? 0.9 : (titleMatch || authorMatch) ? 0.7 : 0.0,
      reasons: {
        titleMatch,
        authorMatch,
        hasBookMatch: titleMatch || authorMatch
      }
    };
  }

  /**
   * Get library-specific service information
   * @returns {Object} Service information
   */
  getServiceInfo() {
    return {
      name: this.name,
      libraryKey: this.libraryKey,
      catalogUrl: this.catalogUrl,
      overdriveId: this.overdriveId,
      configured: this.isConfigured(),
      features: [
        'OverDrive/Libby integration',
        'Ebook and audiobook support',
        'Wait time detection',
        'Multi-format availability'
      ],
      limitations: [
        'Requires library configuration',
        'Public catalog search only',
        'No real-time hold status'
      ]
    };
  }
}

module.exports = { LibraryService };