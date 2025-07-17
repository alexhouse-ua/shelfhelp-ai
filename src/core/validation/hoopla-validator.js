/**
 * Hoopla Validator
 * Validates Hoopla availability check results
 */

const AvailabilityValidator = require('./availability-validator');

class HooplaValidator extends AvailabilityValidator {
  constructor(config = {}) {
    super({
      minConfidence: 0.6,
      maxConfidence: 1.0,
      enableLogging: config.enableLogging || false,
      ...config
    });
    
    // Hoopla-specific configuration
    this.hooplaConfig = {
      strongIndicators: [
        'hoopla',
        'available on hoopla',
        'hoopla digital',
        'borrow from hoopla',
        'hoopla instant'
      ],
      weakIndicators: [
        'digital library',
        'library ebook',
        'digital collection',
        'instant access'
      ],
      falsePositivePatterns: [
        'not available',
        'unavailable',
        'coming soon',
        'pre-order',
        'out of stock',
        'temporarily unavailable'
      ],
      formatIndicators: [
        'ebook',
        'audiobook',
        'digital',
        'streaming'
      ],
      libraryPatterns: [
        'library card',
        'public library',
        'library system',
        'library network'
      ]
    };
  }

  /**
   * Validate Hoopla-specific availability result
   * @param {Object} result - Hoopla availability check result
   * @param {Object} book - Book data
   * @returns {Object} Hoopla-specific validation result
   */
  validateServiceSpecific(result, book) {
    const validation = {
      adjustedConfidence: result.confidence || 0,
      factors: [],
      warnings: [],
      errors: []
    };

    // Validate Hoopla result structure
    if (result.available === undefined) {
      validation.errors.push('Missing availability status');
      return validation;
    }

    // Check for strong Hoopla indicators
    const strongIndicators = this.findStrongIndicators(result);
    if (strongIndicators.length > 0) {
      validation.factors.push({
        type: 'boost',
        value: 0.25,
        reason: `Strong Hoopla indicators found: ${strongIndicators.join(', ')}`
      });
    }

    // Check for weak indicators
    const weakIndicators = this.findWeakIndicators(result);
    if (weakIndicators.length > 0 && strongIndicators.length === 0) {
      validation.factors.push({
        type: 'penalty',
        value: 0.15,
        reason: `Only weak indicators found: ${weakIndicators.join(', ')}`
      });
    }

    // Check for false positive patterns
    const falsePositivePatterns = this.findFalsePositivePatterns(result);
    if (falsePositivePatterns.length > 0) {
      validation.factors.push({
        type: 'penalty',
        value: 0.4,
        reason: `False positive patterns detected: ${falsePositivePatterns.join(', ')}`
      });
    }

    // Format validation (Hoopla supports multiple formats)
    const formatValidation = this.validateFormat(result, book);
    if (formatValidation.supported) {
      validation.factors.push({
        type: 'boost',
        value: 0.1,
        reason: `Supported format detected: ${formatValidation.format}`
      });
    }

    // Library context validation
    const libraryValidation = this.validateLibraryContext(result);
    if (libraryValidation.hasLibraryContext) {
      validation.factors.push({
        type: 'boost',
        value: 0.15,
        reason: 'Library context indicators found'
      });
    }

    // Title/Author matching validation
    const matchingValidation = this.validateMatching(result, book);
    if (matchingValidation.confidence < 0.4) {
      validation.factors.push({
        type: 'penalty',
        value: 0.25,
        reason: `Poor title/author matching: ${matchingValidation.confidence}`
      });
    } else if (matchingValidation.confidence > 0.8) {
      validation.factors.push({
        type: 'boost',
        value: 0.1,
        reason: `Strong title/author matching: ${matchingValidation.confidence}`
      });
    }

    // Genre-specific validation (Hoopla has strong romance/fiction collection)
    const genreValidation = this.validateGenre(result, book);
    if (genreValidation.strongGenre) {
      validation.factors.push({
        type: 'boost',
        value: 0.05,
        reason: `Strong genre for Hoopla: ${genreValidation.genre}`
      });
    }

    // Apply confidence adjustments
    validation.adjustedConfidence = this.adjustConfidence(
      result.confidence || 0,
      validation.factors
    );

    return validation;
  }

  /**
   * Find strong Hoopla indicators in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found strong indicators
   */
  findStrongIndicators(result) {
    const content = this.extractContent(result);
    return this.hooplaConfig.strongIndicators.filter(indicator => 
      content.includes(indicator)
    );
  }

  /**
   * Find weak Hoopla indicators in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found weak indicators
   */
  findWeakIndicators(result) {
    const content = this.extractContent(result);
    return this.hooplaConfig.weakIndicators.filter(indicator => 
      content.includes(indicator)
    );
  }

  /**
   * Find false positive patterns in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found false positive patterns
   */
  findFalsePositivePatterns(result) {
    const content = this.extractContent(result);
    return this.hooplaConfig.falsePositivePatterns.filter(pattern => 
      content.includes(pattern)
    );
  }

  /**
   * Validate format compatibility
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {Object} Format validation result
   */
  validateFormat(result, _book) {
    const content = this.extractContent(result);
    const supportedFormats = this.hooplaConfig.formatIndicators.filter(format => 
      content.includes(format)
    );
    
    return {
      supported: supportedFormats.length > 0,
      format: supportedFormats[0] || 'unknown',
      allFormats: supportedFormats
    };
  }

  /**
   * Validate library context
   * @param {Object} result - Availability check result
   * @returns {Object} Library context validation result
   */
  validateLibraryContext(result) {
    const content = this.extractContent(result);
    const libraryPatterns = this.hooplaConfig.libraryPatterns.filter(pattern => 
      content.includes(pattern)
    );
    
    return {
      hasLibraryContext: libraryPatterns.length > 0,
      patterns: libraryPatterns
    };
  }

  /**
   * Validate genre compatibility with Hoopla
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {Object} Genre validation result
   */
  validateGenre(_result, book) {
    const strongGenres = ['romance', 'fiction', 'mystery', 'thriller', 'contemporary'];
    const bookGenres = book.genres || [];
    
    // Check if book has genres that are strong on Hoopla
    const matchingGenres = bookGenres.filter(genre => 
      strongGenres.some(strong => genre.toLowerCase().includes(strong))
    );
    
    return {
      strongGenre: matchingGenres.length > 0,
      genre: matchingGenres[0] || 'unknown',
      allMatching: matchingGenres
    };
  }

  /**
   * Validate title/author matching
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {Object} Matching validation result
   */
  validateMatching(result, book) {
    const content = this.extractContent(result);
    const title = (book.book_title || book.title || '').toLowerCase();
    const author = (book.author_name || '').toLowerCase();
    
    // Enhanced matching for Hoopla (case-insensitive, partial matches)
    const titleWords = title.split(' ').filter(word => word.length > 2);
    const authorWords = author.split(' ').filter(word => word.length > 2);
    
    const titleMatches = titleWords.filter(word => content.includes(word));
    const authorMatches = authorWords.filter(word => content.includes(word));
    
    const titleScore = titleWords.length > 0 ? titleMatches.length / titleWords.length : 0;
    const authorScore = authorWords.length > 0 ? authorMatches.length / authorWords.length : 0;
    
    // Weight title more heavily for Hoopla
    const confidence = (titleScore * 0.7) + (authorScore * 0.3);
    
    return {
      confidence: Math.round(confidence * 100) / 100,
      titleScore,
      authorScore,
      titleMatches: titleMatches.length,
      authorMatches: authorMatches.length
    };
  }

  /**
   * Extract content from result for analysis
   * @param {Object} result - Availability check result
   * @returns {string} Extracted content
   */
  extractContent(result) {
    const content = [];
    
    if (result.details) {
      content.push(result.details);
    }
    
    if (result.metadata && result.metadata.searchContent) {
      content.push(result.metadata.searchContent);
    }
    
    if (result.source) {
      content.push(result.source);
    }
    
    if (result.url) {
      content.push(result.url);
    }
    
    return content.join(' ').toLowerCase();
  }

  /**
   * Calculate Hoopla-specific false positive probability
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {number} False positive probability (0-1)
   */
  calculateFalsePositiveProbability(result, book) {
    let probability = 0.15; // Base 15% (higher than KU due to library complexity)
    
    // Increase probability if only weak indicators found
    const strongIndicators = this.findStrongIndicators(result);
    const weakIndicators = this.findWeakIndicators(result);
    
    if (strongIndicators.length === 0 && weakIndicators.length > 0) {
      probability += 0.25; // +25% for weak indicators only
    }
    
    // Increase probability if false positive patterns found
    const falsePositivePatterns = this.findFalsePositivePatterns(result);
    if (falsePositivePatterns.length > 0) {
      probability += 0.35; // +35% for false positive patterns
    }
    
    // Increase probability for poor matching
    const matchingValidation = this.validateMatching(result, book);
    if (matchingValidation.confidence < 0.4) {
      probability += 0.25; // +25% for poor matching
    }
    
    // Decrease probability for library context
    const libraryValidation = this.validateLibraryContext(result);
    if (libraryValidation.hasLibraryContext) {
      probability -= 0.1; // -10% for library context
    }
    
    return Math.min(Math.max(probability, 0.05), 0.95); // Cap between 5-95%
  }

  /**
   * Get Hoopla-specific validation statistics
   * @returns {Object} Hoopla validation statistics
   */
  getHooplaStats() {
    const baseStats = this.getStats();
    
    return {
      ...baseStats,
      service: 'hoopla',
      config: {
        strongIndicators: this.hooplaConfig.strongIndicators.length,
        weakIndicators: this.hooplaConfig.weakIndicators.length,
        falsePositivePatterns: this.hooplaConfig.falsePositivePatterns.length,
        formatIndicators: this.hooplaConfig.formatIndicators.length
      }
    };
  }
}

module.exports = HooplaValidator;
