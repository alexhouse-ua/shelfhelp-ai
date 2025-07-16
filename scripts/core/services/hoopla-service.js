const { BaseAvailabilityService } = require('./base-availability-service');

/**
 * Hoopla Service
 * Handles Hoopla availability checking with ebook/audio separation
 */
class HooplaService extends BaseAvailabilityService {
  constructor(config = {}) {
    super({
      name: 'Hoopla Digital',
      timeout: 10000,
      enabled: true,
      ...config
    });
    
    this.searchUrl = 'https://www.hoopladigital.com/search';
    this.searchParams = 'type=ebooks,audiobooks';
  }

  /**
   * Check Hoopla availability for both ebook and audio
   * @param {Object} book - Book object
   * @returns {Promise<Object>} Hoopla availability result
   */
  async checkAvailability(book) {
    try {
      if (!book.title && !book.author_name) {
        return this.createErrorResult('Insufficient search data');
      }

      const query = this.buildSearchQuery(book);
      const searchUrl = `${this.searchUrl}?q=${encodeURIComponent(query)}&${this.searchParams}`;
      
      const response = await this.makeRequest(searchUrl);
      const validation = this.validateResult(response.data, book);
      
      if (validation.ebookValid || validation.audiobookValid) {
        this.stats.found++;
      }
      
      return this.createSuccessResult({
        hoopla_ebook_available: validation.ebookValid,
        hoopla_audio_available: validation.audiobookValid,
        confidence: validation.confidence,
        validation_reasons: validation.reasons
      });
      
    } catch (error) {
      return this.createErrorResult(error.message);
    }
  }

  /**
   * Advanced validation for Hoopla availability
   * @param {string} html - Response HTML
   * @param {Object} book - Book object
   * @returns {Object} Validation result
   */
  validateResult(html, book) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    // Title/author matching
    const titleWords = this.extractWords(title);
    const authorWords = this.extractWords(author);
    
    const titleMatch = this.containsWords(html, titleWords);
    const authorMatch = this.containsWords(html, authorWords);
    
    // Format detection with content validation
    const hasEbook = this.detectEbookFormats(html) && (titleMatch || authorMatch);
    const hasAudiobook = this.detectAudioFormats(html) && (titleMatch || authorMatch);
    
    return {
      ebookValid: hasEbook,
      audiobookValid: hasAudiobook,
      confidence: (titleMatch && authorMatch) ? 0.9 : (titleMatch || authorMatch) ? 0.7 : 0.0,
      reasons: {
        titleMatch,
        authorMatch,
        hasEbook,
        hasAudiobook
      }
    };
  }

  /**
   * Detect ebook format indicators
   * @param {string} html - Response HTML
   * @returns {boolean} True if ebook indicators found
   */
  detectEbookFormats(html) {
    const ebookIndicators = [
      'eBook', 'ebook', 'digital book', 'epub', 'EPUB',
      'kindle', 'Kindle', 'e-book', 'E-book'
    ];
    
    return ebookIndicators.some(indicator => html.includes(indicator));
  }

  /**
   * Detect audiobook format indicators
   * @param {string} html - Response HTML
   * @returns {boolean} True if audiobook indicators found
   */
  detectAudioFormats(html) {
    const audioIndicators = [
      'Audiobook', 'audiobook', 'audio book', 'Audio Book',
      'listen', 'Listen', 'narrator', 'Narrator',
      'spoken', 'Spoken', 'voice', 'Voice'
    ];
    
    return audioIndicators.some(indicator => html.includes(indicator));
  }

  /**
   * Get Hoopla-specific service information
   * @returns {Object} Service information
   */
  getServiceInfo() {
    return {
      name: this.name,
      searchUrl: this.searchUrl,
      features: [
        'Separate ebook/audiobook detection',
        'Public search interface',
        'Format-specific validation',
        'Multi-format support'
      ],
      formats: {
        ebooks: ['EPUB', 'PDF', 'Kindle'],
        audiobooks: ['MP3', 'Streaming Audio']
      },
      limitations: [
        'No library card verification',
        'Limited search API access',
        'Public search only'
      ]
    };
  }
}

module.exports = { HooplaService };