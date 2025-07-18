const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Enhanced Availability Checker
 * Comprehensive library and subscription service availability checking
 * Supports KU, Hoopla, and multiple library systems with ebook/audio separation
 */
class EnhancedAvailabilityChecker {
  constructor() {
    this.booksFile = path.join(__dirname, '../data/books.json');
    
    // Library systems configuration
    this.libraries = {
      tuscaloosa_public: {
        name: 'Tuscaloosa Public Library',
        overdrive_id: process.env.TUSCALOOSA_OVERDRIVE_ID || null,
        libby_catalog_url: 'https://tuscaloosa.overdrive.com',
        enabled: false // Requires configuration
      },
      camellia_net: {
        name: 'Camellia Net',
        overdrive_id: process.env.CAMELLIA_OVERDRIVE_ID || null,
        libby_catalog_url: 'https://camellia.overdrive.com',
        enabled: false // Requires configuration  
      },
      seattle_public: {
        name: 'Seattle Public Library',
        overdrive_id: process.env.SEATTLE_OVERDRIVE_ID || null,
        libby_catalog_url: 'https://seattle.overdrive.com',
        enabled: false // Requires configuration
      }
    };
    
    // Service configurations
    this.services = {
      kindle_unlimited: {
        name: 'Kindle Unlimited',
        search_url: 'https://www.amazon.com/s',
        enabled: true, // Public search available
        timeout: 15000
      },
      hoopla: {
        name: 'Hoopla Digital',
        api_url: 'https://hoopla-api.hoopladigital.com/v1',
        public_search_url: 'https://www.hoopladigital.com/search',
        enabled: true, // Public search available
        timeout: 10000
      },
      worldcat: {
        name: 'WorldCat',
        search_url: 'http://www.worldcat.org/webservices/catalog/search/opensearch',
        enabled: true,
        timeout: 15000
      }
    };
    
    this.stats = {
      checked: 0,
      ku_found: 0,
      library_found: 0,
      hoopla_found: 0,
      errors: 0,
      updated: 0
    };
  }

  async loadBooks() {
    try {
      const data = await fs.readFile(this.booksFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error loading books', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async saveBooks(books) {
    try {
      await fs.writeFile(this.booksFile, JSON.stringify(books, null, 2));
      logger.info('Saved books with updated availability', { booksCount: books.length });
    } catch (error) {
      logger.error('Error saving books', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Advanced validation for KU availability to reduce false positives
   */
  validateKUResult(html, book) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    // Multi-layer validation
    const hasKUIndicator = html.includes('Kindle Unlimited') || 
                          html.includes('kindle-unlimited') ||
                          html.includes('KU logo') ||
                          html.includes('Read for free');
    
    const hasStrongKUIndicator = html.includes('Available on Kindle Unlimited') ||
                                html.includes('Read for $0.00') ||
                                html.includes('ku-logo') ||
                                html.includes('kindle-unlimited-logo');
    
    // Title/author matching validation
    const titleWords = title ? title.toLowerCase().split(' ').filter(word => word.length > 2) : [];
    const authorWords = author ? author.toLowerCase().split(' ').filter(word => word.length > 2) : [];
    
    let titleMatch = false;
    let authorMatch = false;
    
    if (titleWords.length > 0) {
      titleMatch = titleWords.some(word => html.toLowerCase().includes(word));
    }
    
    if (authorWords.length > 0) {
      authorMatch = authorWords.some(word => html.toLowerCase().includes(word));
    }
    
    // Require both KU indicators AND title/author match
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
   * Check Kindle Unlimited availability using public Amazon search
   */
  async checkKindleUnlimitedAvailability(book) {
    try {
      if (!book.title && !book.author_name) {
        return {
          ku_availability: false,
          ku_expires_on: null,
          error: 'Insufficient search data'
        };
      }

      // Build search query
      const searchTerms = [];
      if (book.book_title || book.title) {
        searchTerms.push(book.book_title || book.title);
      }
      if (book.author_name) {
        searchTerms.push(book.author_name);
      }
      
      const query = searchTerms.join(' ');
      const searchUrl = `${this.services.kindle_unlimited.search_url}?k=${encodeURIComponent(query)}&i=digital-text&rh=n%3A133140011`;
      
      const response = await axios.get(searchUrl, {
        timeout: this.services.kindle_unlimited.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // Use advanced validation to reduce false positives
      const html = response.data;
      const validation = this.validateKUResult(html, book);
      
      // Note: Real KU expiration dates require Amazon API access
      // For now, we'll use a placeholder system
      let expiresOn = null;
      if (validation.isValid) {
        // Estimate typical KU rotation (books usually stay 6-18 months)
        const now = new Date();
        const estimatedExpiry = new Date(now.getTime() + (12 * 30 * 24 * 60 * 60 * 1000)); // 12 months
        expiresOn = estimatedExpiry.toISOString().split('T')[0];
      }
      
      return {
        ku_availability: validation.isValid,
        ku_expires_on: expiresOn,
        checked_at: new Date().toISOString(),
        source: 'amazon_search',
        confidence: validation.confidence,
        validation_reasons: validation.reasons
      };
      
    } catch (error) {
      return {
        ku_availability: false,
        ku_expires_on: null,
        error: error.message,
        checked_at: new Date().toISOString()
      };
    }
  }

  /**
   * Advanced validation for Hoopla availability to reduce false positives
   */
  validateHooplaResult(html, book) {
    const title = book.book_title || book.title;
    const author = book.author_name;
    
    // Title/author matching validation
    const titleWords = title ? title.toLowerCase().split(' ').filter(word => word.length > 2) : [];
    const authorWords = author ? author.toLowerCase().split(' ').filter(word => word.length > 2) : [];
    
    let titleMatch = false;
    let authorMatch = false;
    
    if (titleWords.length > 0) {
      titleMatch = titleWords.some(word => html.toLowerCase().includes(word));
    }
    
    if (authorWords.length > 0) {
      authorMatch = authorWords.some(word => html.toLowerCase().includes(word));
    }
    
    // Format detection with validation
    const hasEbook = (html.includes('eBook') || 
                     html.includes('ebook') ||
                     html.includes('digital book') ||
                     html.includes('epub')) && (titleMatch || authorMatch);
                     
    const hasAudiobook = (html.includes('Audiobook') || 
                         html.includes('audiobook') ||
                         html.includes('audio book') ||
                         html.includes('listen')) && (titleMatch || authorMatch);
    
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
   * Check Hoopla availability with ebook/audio separation
   */
  async checkHooplaAvailability(book) {
    try {
      if (!book.title && !book.author_name) {
        return {
          hoopla_ebook_available: false,
          hoopla_audio_available: false,
          error: 'Insufficient search data'
        };
      }

      const searchTerms = [];
      if (book.book_title || book.title) {
        searchTerms.push(book.book_title || book.title);
      }
      if (book.author_name) {
        searchTerms.push(book.author_name);
      }
      
      const query = searchTerms.join(' ');
      const searchUrl = `${this.services.hoopla.public_search_url}?q=${encodeURIComponent(query)}&type=ebooks,audiobooks`;
      
      const response = await axios.get(searchUrl, {
        timeout: this.services.hoopla.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const html = response.data;
      const validation = this.validateHooplaResult(html, book);
      
      return {
        hoopla_ebook_available: validation.ebookValid,
        hoopla_audio_available: validation.audiobookValid,
        checked_at: new Date().toISOString(),
        source: 'hoopla_search',
        confidence: validation.confidence,
        validation_reasons: validation.reasons
      };
      
    } catch (error) {
      return {
        hoopla_ebook_available: false,
        hoopla_audio_available: false,
        error: error.message,
        checked_at: new Date().toISOString()
      };
    }
  }

  /**
   * Check library availability for specific library system
   * Returns status for both ebook and audiobook formats
   */
  async checkLibraryAvailability(book, libraryKey) {
    try {
      const library = this.libraries[libraryKey];
      if (!library || !library.enabled) {
        return {
          ebook_status: 'Unavailable',
          audio_status: 'Unavailable',
          error: `${library?.name || libraryKey} not configured`
        };
      }

      // For now, simulate library checking with public catalog search
      // Real implementation would use OverDrive API or library-specific APIs
      
      const searchTerms = [];
      if (book.book_title || book.title) {
        searchTerms.push(book.book_title || book.title);
      }
      if (book.author_name) {
        searchTerms.push(book.author_name);
      }
      
      if (searchTerms.length === 0) {
        return {
          ebook_status: 'Unavailable',
          audio_status: 'Unavailable',
          error: 'Insufficient search data'
        };
      }

      const query = searchTerms.join(' ');
      const catalogUrl = `${library.libby_catalog_url}/search?query=${encodeURIComponent(query)}`;
      
      try {
        const response = await axios.get(catalogUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        const html = response.data;
        const title = book.book_title || book.title;
        const author = book.author_name;
        
        // Parse availability indicators with better validation
        let ebookStatus = 'Unavailable';
        let audioStatus = 'Unavailable';
        
        // More precise availability checking
        const hasBookMatch = title && (html.includes(title.split(' ')[0]) || 
                            (author && html.includes(author.split(' ')[0])));
        
        if (hasBookMatch) {
          // Look for availability indicators
          if (html.includes('available') || html.includes('Available')) {
            if (html.includes('ebook') || html.includes('eBook')) {
              ebookStatus = 'Available';
            }
            if (html.includes('audiobook') || html.includes('Audiobook')) {
              audioStatus = 'Available';
            }
          }
          
          // Look for wait time indicators
          const waitTimeMatch = html.match(/(\\d+)\\s*(week|month)s?\\s*wait/i);
          if (waitTimeMatch) {
            const waitTime = `${waitTimeMatch[1]} ${waitTimeMatch[2]}s`;
            if (ebookStatus !== 'Available') {ebookStatus = waitTime;}
            if (audioStatus !== 'Available') {audioStatus = waitTime;}
          }
        }
        
        return {
          ebook_status: ebookStatus,
          audio_status: audioStatus,
          checked_at: new Date().toISOString(),
          source: `${libraryKey}_catalog`
        };
        
      } catch (searchError) {
        return {
          ebook_status: 'Unavailable',
          audio_status: 'Unavailable',
          error: `Search failed: ${searchError.message}`,
          checked_at: new Date().toISOString()
        };
      }
      
    } catch (error) {
      return {
        ebook_status: 'Unavailable',
        audio_status: 'Unavailable',
        error: error.message,
        checked_at: new Date().toISOString()
      };
    }
  }

  /**
   * Comprehensive availability check for a single book
   */
  async checkBookAvailability(book) {
    const results = {
      book_id: book.goodreads_id,
      title: book.book_title || book.title,
      author: book.author_name,
      last_checked: new Date().toISOString()
    };
    
    this.stats.checked++;
    
    try {
      // Check Kindle Unlimited
      logger.debug('Checking KU for book', { title: results.title });
      const kuResult = await this.checkKindleUnlimitedAvailability(book);
      results.ku = kuResult;
      if (kuResult.ku_availability) {
        this.stats.ku_found++;
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check Hoopla
      logger.debug('Checking Hoopla for book', { title: results.title });
      const hooplaResult = await this.checkHooplaAvailability(book);
      results.hoopla = hooplaResult;
      if (hooplaResult.hoopla_ebook_available || hooplaResult.hoopla_audio_available) {
        this.stats.hoopla_found++;
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check each library system
      results.libraries = {};
      
      for (const [libraryKey, library] of Object.entries(this.libraries)) {
        logger.debug('Checking library for book', { libraryName: library.name, title: results.title });
        const libraryResult = await this.checkLibraryAvailability(book, libraryKey);
        results.libraries[libraryKey] = libraryResult;
        
        if (libraryResult.ebook_status === 'Available' || libraryResult.audio_status === 'Available') {
          this.stats.library_found++;
        }
        
        // Small delay between library checks
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return results;
      
    } catch (error) {
      this.stats.errors++;
      return {
        ...results,
        error: error.message
      };
    }
  }

  /**
   * Update book record with new availability data according to field dictionary
   */
  updateBookWithAvailability(book, availabilityResult) {
    let updated = false;
    const timestamp = new Date().toISOString();
    
    // Update KU fields
    if (availabilityResult.ku) {
      if (book.ku_availability !== availabilityResult.ku.ku_availability) {
        book.ku_availability = availabilityResult.ku.ku_availability;
        updated = true;
      }
      if (availabilityResult.ku.ku_expires_on && book.ku_expires_on !== availabilityResult.ku.ku_expires_on) {
        book.ku_expires_on = availabilityResult.ku.ku_expires_on;
        updated = true;
      }
    }
    
    // Update Hoopla fields
    if (availabilityResult.hoopla) {
      if (book.hoopla_ebook_available !== availabilityResult.hoopla.hoopla_ebook_available) {
        book.hoopla_ebook_available = availabilityResult.hoopla.hoopla_ebook_available;
        updated = true;
      }
      if (book.hoopla_audio_available !== availabilityResult.hoopla.hoopla_audio_available) {
        book.hoopla_audio_available = availabilityResult.hoopla.hoopla_audio_available;
        updated = true;
      }
    }
    
    // Update library hold status fields (6 variants as per field dictionary)
    if (availabilityResult.libraries) {
      // Tuscaloosa Public Library - ebook and audio
      if (availabilityResult.libraries.tuscaloosa_public) {
        const tuscaloosaResult = availabilityResult.libraries.tuscaloosa_public;
        if (book.library_hold_status_tuscaloosa_ebook !== tuscaloosaResult.ebook_status) {
          book.library_hold_status_tuscaloosa_ebook = tuscaloosaResult.ebook_status;
          updated = true;
        }
        if (book.library_hold_status_tuscaloosa_audio !== tuscaloosaResult.audio_status) {
          book.library_hold_status_tuscaloosa_audio = tuscaloosaResult.audio_status;
          updated = true;
        }
      }
      
      // Camellia Net - ebook and audio  
      if (availabilityResult.libraries.camellia_net) {
        const camelliaResult = availabilityResult.libraries.camellia_net;
        if (book.library_hold_status_camellia_ebook !== camelliaResult.ebook_status) {
          book.library_hold_status_camellia_ebook = camelliaResult.ebook_status;
          updated = true;
        }
        if (book.library_hold_status_camellia_audio !== camelliaResult.audio_status) {
          book.library_hold_status_camellia_audio = camelliaResult.audio_status;
          updated = true;
        }
      }
      
      // Seattle Public Library - ebook and audio
      if (availabilityResult.libraries.seattle_public) {
        const seattleResult = availabilityResult.libraries.seattle_public;
        if (book.library_hold_status_seattle_ebook !== seattleResult.ebook_status) {
          book.library_hold_status_seattle_ebook = seattleResult.ebook_status;
          updated = true;
        }
        if (book.library_hold_status_seattle_audio !== seattleResult.audio_status) {
          book.library_hold_status_seattle_audio = seattleResult.audio_status;
          updated = true;
        }
      }
    }
    
    // Determine preferred ebook and audio sources
    const ebookSources = [];
    const audioSources = [];
    
    // Check each source in priority order: Library → KU → Hoopla → Purchase
    
    // Libraries first (highest priority)
    if (book.library_hold_status_tuscaloosa_ebook === 'Available') {ebookSources.push('Tuscaloosa Library');}
    if (book.library_hold_status_camellia_ebook === 'Available') {ebookSources.push('Camellia Net');}
    if (book.library_hold_status_seattle_ebook === 'Available') {ebookSources.push('Seattle Library');}
    
    if (book.library_hold_status_tuscaloosa_audio === 'Available') {audioSources.push('Tuscaloosa Library');}
    if (book.library_hold_status_camellia_audio === 'Available') {audioSources.push('Camellia Net');}
    if (book.library_hold_status_seattle_audio === 'Available') {audioSources.push('Seattle Library');}
    
    // KU (second priority for ebooks only)
    if (book.ku_availability) {ebookSources.push('Kindle Unlimited');}
    
    // Hoopla (third priority)
    if (book.hoopla_ebook_available) {ebookSources.push('Hoopla');}
    if (book.hoopla_audio_available) {audioSources.push('Hoopla');}
    
    // Update availability source fields (split as requested)
    const newEbookSource = ebookSources.length > 0 ? ebookSources[0] : 'Purchase';
    const newAudioSource = audioSources.length > 0 ? audioSources[0] : 'Purchase';
    
    if (book.ebook_availability_source !== newEbookSource) {
      book.ebook_availability_source = newEbookSource;
      updated = true;
    }
    
    if (book.audio_availability_source !== newAudioSource) {
      book.audio_availability_source = newAudioSource;
      updated = true;
    }
    
    // Update metadata
    book.availability_last_checked = timestamp;
    
    if (updated) {
      book.updated_at = timestamp;
      this.stats.updated++;
    }
    
    return updated;
  }

  async validateBatchResults(results) {
    const validation = {
      total: results.length,
      valid: 0,
      invalid: 0,
      kuFound: 0,
      hooplaFound: 0,
      libraryFound: 0,
      highConfidence: 0,
      lowConfidence: 0,
      errors: 0
    };
    
    results.forEach(result => {
      if (result.error) {
        validation.errors++;
        validation.invalid++;
        return;
      }
      
      validation.valid++;
      
      // Count findings
      if (result.ku?.ku_availability) {
        validation.kuFound++;
        if (result.ku.confidence >= 0.8) {validation.highConfidence++;}
        else {validation.lowConfidence++;}
      }
      
      if (result.hoopla?.hoopla_ebook_available || result.hoopla?.hoopla_audio_available) {
        validation.hooplaFound++;
        if (result.hoopla.confidence >= 0.8) {validation.highConfidence++;}
        else {validation.lowConfidence++;}
      }
      
      if (result.libraries) {
        Object.values(result.libraries).forEach(lib => {
          if (lib.ebook_status === 'Available' || lib.audio_status === 'Available') {
            validation.libraryFound++;
          }
        });
      }
    });
    
    return validation;
  }

  async checkBooksInBatch(books, batchSize = 5) {
    logger.info('Starting comprehensive availability check', { booksCount: books.length, batchSize });
    
    const results = [];
    const batchValidations = [];
    
    for (let i = 0; i < books.length; i += batchSize) {
      const batch = books.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(books.length / batchSize);
      
      logger.info('Processing batch', { batchNumber, totalBatches, batchSize: batch.length });
      
      const batchResults = [];
      
      for (let j = 0; j < batch.length; j++) {
        const book = batch[j];
        try {
                    logger.debug('Processing book', { bookIndex: j + 1, batchSize: batch.length, title: book.book_title || book.title });
          const result = await this.checkBookAvailability(book);
          results.push(result);
          batchResults.push(result);
          logger.debug('Completed book processing', { title: book.book_title || book.title });
        } catch (error) {
          logger.error('Failed book processing', { title: book.book_title || book.title, error: error.message });
          const errorResult = { book_id: book.goodreads_id, error: error.message };
          results.push(errorResult);
          batchResults.push(errorResult);
          this.stats.errors++;
        }
        
        // Longer delay between books to be respectful to services
        if (j < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Validate batch results
      const batchValidation = await this.validateBatchResults(batchResults);
      batchValidations.push({
        batch: batchNumber,
        validation: batchValidation,
        timestamp: new Date().toISOString()
      });
      
      // Progress update with validation
      logger.info('Batch completed', { batchNumber, progress: Math.min(i + batchSize, books.length), totalBooks: books.length });
            logger.info('Batch validation', { valid: batchValidation.valid, total: batchValidation.total, kuFound: batchValidation.kuFound, hooplaFound: batchValidation.hooplaFound, libraryFound: batchValidation.libraryFound });
            logger.info('Confidence metrics', { highConfidence: batchValidation.highConfidence, lowConfidence: batchValidation.lowConfidence });
      
      // Longer delay between batches
      if (i + batchSize < books.length) {
        logger.debug('Waiting between batches to respect rate limits');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Overall validation summary
    const overallValidation = await this.validateBatchResults(results);
    logger.info('Overall batch validation summary');
        logger.info('Total processed', { total: overallValidation.total });
        logger.info('Valid results', { valid: overallValidation.valid, percentage: (overallValidation.valid/overallValidation.total*100).toFixed(1) });
        logger.info('KU found', { kuFound: overallValidation.kuFound, percentage: (overallValidation.kuFound/overallValidation.total*100).toFixed(1) });
        logger.info('Hoopla found', { hooplaFound: overallValidation.hooplaFound, percentage: (overallValidation.hooplaFound/overallValidation.total*100).toFixed(1) });
        logger.info('Library found', { libraryFound: overallValidation.libraryFound, percentage: (overallValidation.libraryFound/overallValidation.total*100).toFixed(1) });
        logger.info('High confidence', { highConfidence: overallValidation.highConfidence, percentage: (overallValidation.highConfidence/overallValidation.total*100).toFixed(1) });
        logger.warn('Low confidence', { lowConfidence: overallValidation.lowConfidence, percentage: (overallValidation.lowConfidence/overallValidation.total*100).toFixed(1) });
        logger.error('Processing errors', { errors: overallValidation.errors, percentage: (overallValidation.errors/overallValidation.total*100).toFixed(1) });
    
    return {
      results,
      batchValidations,
      overallValidation
    };
  }

  printStats() {
    logger.info('Enhanced availability check statistics');
        logger.info('Books checked', { checked: this.stats.checked });
        logger.info('KU available', { kuFound: this.stats.ku_found });
        logger.info('Library available', { libraryFound: this.stats.library_found });
        logger.info('Hoopla available', { hooplaFound: this.stats.hoopla_found });
        logger.info('Books updated', { updated: this.stats.updated });
        logger.error('Errors encountered', { errors: this.stats.errors });
    
    if (this.stats.checked > 0) {
      const successRate = ((this.stats.checked - this.stats.errors) / this.stats.checked * 100).toFixed(1);
      const totalFound = this.stats.ku_found + this.stats.library_found + this.stats.hoopla_found;
      const foundRate = (totalFound / this.stats.checked * 100).toFixed(1);
            logger.info('Success rate', { successRate });
            logger.info('Total availability found', { foundRate });
    }
  }

  async run(filters = {}) {
    try {
      logger.info('Starting enhanced availability check');
      
      const books = await this.loadBooks();
            logger.info('Loaded books', { booksCount: books.length });
      
      // Filter books based on criteria
      let booksToCheck = books;
      
      if (filters.status) {
        booksToCheck = booksToCheck.filter(book => 
          filters.status.includes(book.status)
        );
                logger.info('Filtered books by status', { filteredCount: booksToCheck.length, statusFilters: filters.status });
      }
      
      if (filters.unprocessed) {
        booksToCheck = booksToCheck.filter(book => 
          !book.availability_last_checked || 
          new Date(book.availability_last_checked) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        logger.info('Filtered books needing updates', { filteredCount: booksToCheck.length });
      }
      
      if (filters.limit) {
        booksToCheck = booksToCheck.slice(0, filters.limit);
        logger.info('Limited books', { limitedCount: booksToCheck.length });
      }
      
      if (booksToCheck.length === 0) {
        logger.info('No books need availability checking');
        return { success: true, message: 'No books to process' };
      }
      
      // Check availability with enhanced batch processing
      const batchResults = await this.checkBooksInBatch(booksToCheck, 3); // Smaller batches for comprehensive checking
      const availabilityResults = batchResults.results;
      
      // Update books with availability data
      logger.info('Updating books with availability data');
      for (const result of availabilityResults) {
        if (result && !result.error) {
          const book = books.find(b => b.goodreads_id === result.book_id);
          if (book) {
            this.updateBookWithAvailability(book, result);
          }
        }
      }
      
      // Save updated books
      await this.saveBooks(books);
      
      // Print statistics
      this.printStats();
      
      logger.info('Enhanced availability check completed successfully');
      return {
        success: true,
        stats: this.stats,
        processed: availabilityResults.length,
        batchValidations: batchResults.batchValidations,
        overallValidation: batchResults.overallValidation
      };
      
    } catch (error) {
      logger.error('Enhanced availability check failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const filters = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--status':
        filters.status = args[++i]?.split(',') || ['TBR'];
        break;
      case '--unprocessed':
        filters.unprocessed = true;
        break;
      case '--limit':
        filters.limit = parseInt(args[++i]) || 10;
        break;
      case '--help':
        logger.info('Enhanced Availability Checker Help', {
          usage: 'node enhanced-availability-checker.js [options]',
          options: {
            '--status <statuses>': 'Check books with specific statuses (comma-separated)',
            '--unprocessed': 'Only check books not checked in last 7 days'
          }
        });
        process.exit(0);
        break;
    }
  }
  
  const checker = new EnhancedAvailabilityChecker();
  checker.run(filters).catch(error => {
    logger.error('Script failed', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = { EnhancedAvailabilityChecker };