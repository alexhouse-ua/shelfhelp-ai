/**
 * Library Scraper
 * Checks library availability via OverDrive catalog scraping
 */

const BaseScraper = require('./base-scraper');
const { URLSearchParams } = require('url');

class LibraryScraper extends BaseScraper {
  constructor(config = {}) {
    super({
      timeout: 15000,
      rateLimitMs: 3000,
      ...config
    });
    
    this.serviceName = 'Library Systems';
    
    // Supported library systems with their OverDrive catalog URLs
    this.librarySystems = {
      tuscaloosa_public: {
        name: 'Tuscaloosa Public Library',
        catalog_url: 'https://tuscaloosa.overdrive.com',
        search_endpoint: '/search'
      },
      camellia_net: {
        name: 'Camellia Net',
        catalog_url: 'https://camellia.overdrive.com',
        search_endpoint: '/search'
      },
      seattle_public: {
        name: 'Seattle Public Library',
        catalog_url: 'https://seattle.overdrive.com',
        search_endpoint: '/search'
      }
    };
  }

  /**
   * Check library availability across all configured systems
   */
  async checkAvailability(book) {
    try {
      const validation = this.validateBookData(book);
      if (!validation.valid) {
        return {
          library_availability: {},
          error: `Invalid book data: ${validation.errors.join(', ')}`,
          checked_at: new Date().toISOString(),
          source: 'library_scraper'
        };
      }

      const results = {};
      
      // Check each library system
      for (const [systemKey, system] of Object.entries(this.librarySystems)) {
        try {
          const systemResult = await this.checkLibrarySystem(book, systemKey, system);
          results[systemKey] = systemResult;
          
          // Rate limiting between library checks
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          results[systemKey] = {
            name: system.name,
            ebook_status: 'Error',
            audio_status: 'Error',
            error: error.message
          };
        }
      }
      
      return {
        library_availability: results,
        checked_at: new Date().toISOString(),
        source: 'library_scraper'
      };
      
    } catch (error) {
      return {
        library_availability: {},
        error: error.message,
        checked_at: new Date().toISOString(),
        source: 'library_scraper'
      };
    }
  }

  /**
   * Check availability for a specific library system
   */
  async checkLibrarySystem(book, _systemKey, system) {
    const searchQuery = this.buildSearchQuery(book);
    const searchUrl = this.buildLibrarySearchUrl(system, searchQuery);
    
    const response = await this.makeRequest(searchUrl);
    
    if (!response.success) {
      return {
        name: system.name,
        ebook_status: 'Error',
        audio_status: 'Error',
        error: response.error
      };
    }

    return this.parseLibraryResponse(response.data, book, system);
  }

  /**
   * Build library search URL
   */
  buildLibrarySearchUrl(system, query) {
    const params = new URLSearchParams({
      query: query
    });
    
    return `${system.catalog_url}${system.search_endpoint}?${params.toString()}`;
  }

  /**
   * Parse library response for availability
   */
  parseLibraryResponse(html, book, system) {
    const content = this.cleanHtmlText(html);
    
    // OverDrive status indicators
    const statusIndicators = {
      available: [
        'available now',
        'download now',
        'borrow now',
        'check out',
        'available for checkout'
      ],
      holds: [
        'place hold',
        'on hold',
        'waiting list',
        'holds queue',
        'estimated wait'
      ],
      unavailable: [
        'not available',
        'unavailable',
        'not found',
        'no results'
      ]
    };

    // Format indicators
    const formatIndicators = {
      ebook: [
        'ebook',
        'digital book',
        'kindle book',
        'epub',
        'pdf'
      ],
      audiobook: [
        'audiobook',
        'audio book',
        'digital audiobook',
        'mp3 audiobook'
      ]
    };

    // Check title/author matching first
    const titleMatch = this.checkTitleMatch(content, book);
    const authorMatch = this.checkAuthorMatch(content, book);
    const hasContentMatch = titleMatch || authorMatch;
    
    if (!hasContentMatch) {
      return {
        name: system.name,
        ebook_status: 'Not Found',
        audio_status: 'Not Found',
        confidence: 0.0,
        details: {
          title_match: false,
          author_match: false,
          search_performed: true
        }
      };
    }

    // Check availability for each format
    const ebookStatus = this.determineFormatStatus(content, formatIndicators.ebook, statusIndicators);
    const audioStatus = this.determineFormatStatus(content, formatIndicators.audiobook, statusIndicators);
    
    // Calculate overall confidence
    const confidence = this.calculateLibraryConfidence(titleMatch, authorMatch, ebookStatus, audioStatus);
    
    return {
      name: system.name,
      ebook_status: ebookStatus.status,
      audio_status: audioStatus.status,
      confidence: confidence,
      details: {
        title_match: titleMatch,
        author_match: authorMatch,
        ebook_indicators: ebookStatus.indicators,
        audio_indicators: audioStatus.indicators,
        estimated_wait: this.extractWaitTime(content)
      }
    };
  }

  /**
   * Determine status for a specific format
   */
  determineFormatStatus(content, formatIndicators, statusIndicators) {
    // Check if format is mentioned
    const hasFormat = formatIndicators.some(indicator => 
      content.includes(indicator.toLowerCase())
    );
    
    if (!hasFormat) {
      return {
        status: 'Not Available',
        indicators: []
      };
    }

    // Check availability status
    const availableIndicators = statusIndicators.available.filter(indicator =>
      content.includes(indicator.toLowerCase())
    );
    
    const holdIndicators = statusIndicators.holds.filter(indicator =>
      content.includes(indicator.toLowerCase())
    );
    
    const unavailableIndicators = statusIndicators.unavailable.filter(indicator =>
      content.includes(indicator.toLowerCase())
    );

    // Determine status based on indicators
    let status = 'Unknown';
    
    if (availableIndicators.length > 0) {
      status = 'Available';
    } else if (holdIndicators.length > 0) {
      status = 'On Hold';
    } else if (unavailableIndicators.length > 0) {
      status = 'Not Available';
    } else if (hasFormat) {
      status = 'Available'; // Format found but status unclear - assume available
    }

    return {
      status,
      indicators: {
        available: availableIndicators,
        holds: holdIndicators,
        unavailable: unavailableIndicators,
        format_found: hasFormat
      }
    };
  }

  /**
   * Extract estimated wait time from content
   */
  extractWaitTime(content) {
    // Look for wait time patterns
    const waitPatterns = [
      /estimated wait:?\s*(\d+)\s*(weeks?|days?|months?)/i,
      /(\d+)\s*(weeks?|days?|months?)\s*wait/i,
      /wait time:?\s*(\d+)\s*(weeks?|days?|months?)/i
    ];

    for (const pattern of waitPatterns) {
      const match = content.match(pattern);
      if (match) {
        return `${match[1]} ${match[2]}`;
      }
    }

    return null;
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
   * Calculate library-specific confidence score
   */
  calculateLibraryConfidence(titleMatch, authorMatch, ebookStatus, audioStatus) {
    let confidence = 0.0;
    
    // Base confidence from content matching
    if (titleMatch && authorMatch) {
      confidence += 0.6;
    } else if (titleMatch || authorMatch) {
      confidence += 0.3;
    }
    
    // Boost for clear status indicators
    const hasEbookStatus = ebookStatus.status !== 'Unknown' && ebookStatus.status !== 'Not Available';
    const hasAudioStatus = audioStatus.status !== 'Unknown' && audioStatus.status !== 'Not Available';
    
    if (hasEbookStatus || hasAudioStatus) {
      confidence += 0.3;
    }
    
    // Additional boost for specific status matches
    if (ebookStatus.status === 'Available' || audioStatus.status === 'Available') {
      confidence += 0.1;
    }
    
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Check if word is a stop word
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
      supported_systems: Object.keys(this.librarySystems).length,
      library_systems: Object.values(this.librarySystems).map(system => ({
        name: system.name,
        catalog_url: system.catalog_url
      })),
      rate_limit_ms: this.config.rateLimitMs,
      last_request: this.lastRequestTime ? new Date(this.lastRequestTime).toISOString() : null
    };
  }

  /**
   * Get available library systems
   */
  getLibrarySystems() {
    return this.librarySystems;
  }

  /**
   * Check availability for a specific library system only
   */
  async checkSpecificLibrary(book, systemKey) {
    const system = this.librarySystems[systemKey];
    if (!system) {
      throw new Error(`Library system '${systemKey}' not found`);
    }

    const validation = this.validateBookData(book);
    if (!validation.valid) {
      throw new Error(`Invalid book data: ${validation.errors.join(', ')}`);
    }

    return await this.checkLibrarySystem(book, systemKey, system);
  }
}

module.exports = LibraryScraper;