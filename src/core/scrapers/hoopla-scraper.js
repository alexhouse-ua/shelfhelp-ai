/**
 * Hoopla Scraper
 * Checks Hoopla availability via public search scraping
 */

const BaseScraper = require('./base-scraper');
const { URLSearchParams } = require('url');

class HooplaScraper extends BaseScraper {
  constructor(config = {}) {
    super({
      timeout: 10000,
      rateLimitMs: 1500,
      searchUrl: 'https://www.hoopladigital.com/search',
      ...config
    });
    
    this.serviceName = 'Hoopla Digital';
  }

  /**
   * Check Hoopla availability for a book (both ebook and audiobook)
   */
  async checkAvailability(book) {
    try {
      const validation = this.validateBookData(book);
      if (!validation.valid) {
        return {
          hoopla_ebook_available: false,
          hoopla_audio_available: false,
          error: `Invalid book data: ${validation.errors.join(', ')}`,
          checked_at: new Date().toISOString(),
          source: 'hoopla_scraper'
        };
      }

      const searchQuery = this.buildSearchQuery(book);
      const searchUrl = this.buildSearchUrl(searchQuery);
      
      const response = await this.makeRequest(searchUrl);
      
      if (!response.success) {
        return {
          hoopla_ebook_available: false,
          hoopla_audio_available: false,
          error: response.error,
          checked_at: new Date().toISOString(),
          source: 'hoopla_scraper'
        };
      }

      const availabilityResult = this.parseHooplaResponse(response.data, book);
      
      return {
        ...availabilityResult,
        checked_at: new Date().toISOString(),
        source: 'hoopla_scraper'
      };
      
    } catch (error) {
      return {
        hoopla_ebook_available: false,
        hoopla_audio_available: false,
        error: error.message,
        checked_at: new Date().toISOString(),
        source: 'hoopla_scraper'
      };
    }
  }

  /**
   * Build Hoopla search URL
   */
  buildSearchUrl(query) {
    const params = new URLSearchParams({
      q: query,
      type: 'ebooks,audiobooks'
    });
    
    return `${this.config.searchUrl}?${params.toString()}`;
  }

  /**
   * Parse Hoopla response for availability indicators
   */
  parseHooplaResponse(html, book) {
    const content = this.cleanHtmlText(html);
    
    // Format-specific indicators
    const formatIndicators = {
      ebook: {
        strong: [
          'ebook',
          'digital book',
          'epub',
          'pdf book',
          'kindle book'
        ],
        medium: [
          'book',
          'digital',
          'electronic book'
        ],
        patterns: [
          /ebook\s*available/i,
          /digital\s*book/i,
          /read\s*online/i
        ]
      },
      audiobook: {
        strong: [
          'audiobook',
          'audio book',
          'narrated by',
          'listen online',
          'audio edition'
        ],
        medium: [
          'audio',
          'listen',
          'narrator',
          'mp3'
        ],
        patterns: [
          /audiobook\s*available/i,
          /listen\s*online/i,
          /audio\s*edition/i
        ]
      }
    };

    // Check for format availability
    const ebookResult = this.checkFormatAvailability(content, book, formatIndicators.ebook);
    const audiobookResult = this.checkFormatAvailability(content, book, formatIndicators.audiobook);
    
    return {
      hoopla_ebook_available: ebookResult.available,
      hoopla_audio_available: audiobookResult.available,
      confidence: Math.max(ebookResult.confidence, audiobookResult.confidence),
      format_details: {
        ebook: ebookResult,
        audiobook: audiobookResult
      }
    };
  }

  /**
   * Check availability for specific format (ebook or audiobook)
   */
  checkFormatAvailability(content, book, indicators) {
    // Check for format indicators
    const strongMatches = indicators.strong.filter(indicator => 
      content.includes(indicator.toLowerCase())
    );
    
    const mediumMatches = indicators.medium.filter(indicator => 
      content.includes(indicator.toLowerCase())
    );
    
    const patternMatches = indicators.patterns.filter(pattern => 
      pattern.test(content)
    );
    
    // Check title/author matching
    const titleMatch = this.checkTitleMatch(content, book);
    const authorMatch = this.checkAuthorMatch(content, book);
    
    // Determine availability
    const hasFormatIndicator = strongMatches.length > 0 || patternMatches.length > 0;
    const hasContentMatch = titleMatch || authorMatch;
    const isAvailable = hasFormatIndicator && hasContentMatch;
    
    // Calculate confidence
    const confidence = this.calculateFormatConfidence({
      strongMatches: strongMatches.length,
      mediumMatches: mediumMatches.length,
      patternMatches: patternMatches.length,
      titleMatch,
      authorMatch
    });
    
    return {
      available: isAvailable,
      confidence: confidence,
      indicators: {
        strong: strongMatches,
        medium: mediumMatches,
        patterns: patternMatches.length,
        title_match: titleMatch,
        author_match: authorMatch
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
      .filter(word => !this.isStopWord(word));
    
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
   * Calculate format-specific confidence score
   */
  calculateFormatConfidence(metrics) {
    let confidence = 0.0;
    
    // Base confidence from format indicators
    if (metrics.strongMatches > 0) {
      confidence += 0.4;
    } else if (metrics.mediumMatches > 0) {
      confidence += 0.2;
    }
    
    // Pattern matching bonus
    if (metrics.patternMatches > 0) {
      confidence += 0.2;
    }
    
    // Content matching
    if (metrics.titleMatch && metrics.authorMatch) {
      confidence += 0.3;
    } else if (metrics.titleMatch || metrics.authorMatch) {
      confidence += 0.1;
    }
    
    // Strong format + strong matching = high confidence
    if (metrics.strongMatches > 0 && metrics.titleMatch && metrics.authorMatch) {
      confidence = Math.min(confidence + 0.1, 1.0);
    }
    
    // Require content matching for positive results
    if (!metrics.titleMatch && !metrics.authorMatch) {
      confidence = Math.max(confidence - 0.2, 0.0);
    }
    
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Check if word is a stop word (common words to ignore)
   */
  isStopWord(word) {
    const stopWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 
      'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'its', 
      'said', 'each', 'make', 'most', 'over', 'some', 'time', 'very', 'what', 
      'with', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 
      'when', 'come', 'here', 'just', 'like', 'long', 'many', 'such', 'take', 
      'than', 'them', 'well', 'were'
    ];
    
    return stopWords.includes(word.toLowerCase());
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
      supported_formats: ['ebook', 'audiobook'],
      last_request: this.lastRequestTime ? new Date(this.lastRequestTime).toISOString() : null
    };
  }
}

module.exports = HooplaScraper;