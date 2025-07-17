/**
 * Library Validator
 * Validates library system availability check results
 */

const AvailabilityValidator = require('./availability-validator');

class LibraryValidator extends AvailabilityValidator {
  constructor(config = {}) {
    super({
      minConfidence: 0.5,
      maxConfidence: 1.0,
      enableLogging: config.enableLogging || false,
      ...config
    });
    
    // Library-specific configuration
    this.libraryConfig = {
      strongIndicators: [
        'available',
        'in stock',
        'on shelf',
        'available now',
        'check out',
        'borrow',
        'reserve'
      ],
      weakIndicators: [
        'library',
        'catalog',
        'collection',
        'branch',
        'location'
      ],
      falsePositivePatterns: [
        'not available',
        'unavailable',
        'checked out',
        'on hold',
        'waiting list',
        'reserve',
        'coming soon',
        'on order',
        'processing'
      ],
      waitTimeIndicators: [
        'hold',
        'waiting',
        'queue',
        'estimated wait',
        'next available'
      ],
      formatIndicators: [
        'book',
        'ebook',
        'audiobook',
        'large print',
        'digital',
        'physical'
      ]
    };
  }

  /**
   * Validate Library-specific availability result
   * @param {Object} result - Library availability check result
   * @param {Object} book - Book data
   * @returns {Object} Library-specific validation result
   */
  validateServiceSpecific(result, book) {
    const validation = {
      adjustedConfidence: result.confidence || 0,
      factors: [],
      warnings: [],
      errors: []
    };

    // Validate Library result structure
    if (result.available === undefined) {
      validation.errors.push('Missing availability status');
      return validation;
    }

    // Check for strong library indicators
    const strongIndicators = this.findStrongIndicators(result);
    if (strongIndicators.length > 0) {
      validation.factors.push({
        type: 'boost',
        value: 0.2,
        reason: `Strong library indicators found: ${strongIndicators.join(', ')}`
      });
    }

    // Check for weak indicators
    const weakIndicators = this.findWeakIndicators(result);
    if (weakIndicators.length > 0 && strongIndicators.length === 0) {
      validation.factors.push({
        type: 'penalty',
        value: 0.1,
        reason: `Only weak indicators found: ${weakIndicators.join(', ')}`
      });
    }

    // Check for false positive patterns
    const falsePositivePatterns = this.findFalsePositivePatterns(result);
    if (falsePositivePatterns.length > 0) {
      validation.factors.push({
        type: 'penalty',
        value: 0.3,
        reason: `False positive patterns detected: ${falsePositivePatterns.join(', ')}`
      });
    }

    // Wait time analysis
    const waitTimeValidation = this.validateWaitTime(result);
    if (waitTimeValidation.hasWaitTime) {
      validation.factors.push({
        type: 'penalty',
        value: 0.2,
        reason: `Wait time detected: ${waitTimeValidation.waitTimeInfo}`
      });
      validation.warnings.push(`Book may have wait time: ${waitTimeValidation.waitTimeInfo}`);
    }

    // Format validation
    const formatValidation = this.validateFormat(result, book);
    if (formatValidation.supported) {
      validation.factors.push({
        type: 'boost',
        value: 0.05,
        reason: `Format detected: ${formatValidation.format}`
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

    // Library-specific availability logic
    const availabilityValidation = this.validateLibraryAvailability(result);
    if (availabilityValidation.immediateAvailable) {
      validation.factors.push({
        type: 'boost',
        value: 0.15,
        reason: 'Immediate availability confirmed'
      });
    } else if (availabilityValidation.futureAvailable) {
      validation.factors.push({
        type: 'boost',
        value: 0.05,
        reason: 'Future availability confirmed'
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
   * Find strong library indicators in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found strong indicators
   */
  findStrongIndicators(result) {
    const content = this.extractContent(result);
    return this.libraryConfig.strongIndicators.filter(indicator => 
      content.includes(indicator)
    );
  }

  /**
   * Find weak library indicators in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found weak indicators
   */
  findWeakIndicators(result) {
    const content = this.extractContent(result);
    return this.libraryConfig.weakIndicators.filter(indicator => 
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
    return this.libraryConfig.falsePositivePatterns.filter(pattern => 
      content.includes(pattern)
    );
  }

  /**
   * Validate wait time information
   * @param {Object} result - Availability check result
   * @returns {Object} Wait time validation result
   */
  validateWaitTime(result) {
    const content = this.extractContent(result);
    const waitTimeIndicators = this.libraryConfig.waitTimeIndicators.filter(indicator => 
      content.includes(indicator)
    );
    
    return {
      hasWaitTime: waitTimeIndicators.length > 0,
      waitTimeInfo: waitTimeIndicators.join(', ') || 'None',
      indicators: waitTimeIndicators
    };
  }

  /**
   * Validate format information
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {Object} Format validation result
   */
  validateFormat(result, _book) {
    const content = this.extractContent(result);
    const detectedFormats = this.libraryConfig.formatIndicators.filter(format => 
      content.includes(format)
    );
    
    return {
      supported: detectedFormats.length > 0,
      format: detectedFormats[0] || 'unknown',
      allFormats: detectedFormats
    };
  }

  /**
   * Validate library-specific availability logic
   * @param {Object} result - Availability check result
   * @returns {Object} Library availability validation result
   */
  validateLibraryAvailability(result) {
    const content = this.extractContent(result);
    
    // Check for immediate availability
    const immediateIndicators = ['available now', 'on shelf', 'in stock', 'check out'];
    const immediateAvailable = immediateIndicators.some(indicator => 
      content.includes(indicator)
    );
    
    // Check for future availability
    const futureIndicators = ['on order', 'coming soon', 'processing'];
    const futureAvailable = futureIndicators.some(indicator => 
      content.includes(indicator)
    );
    
    return {
      immediateAvailable,
      futureAvailable,
      statusInfo: immediateAvailable ? 'immediate' : futureAvailable ? 'future' : 'unknown'
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
    
    // Library systems often have exact matches
    const titleWords = title.split(' ').filter(word => word.length > 2);
    const authorWords = author.split(' ').filter(word => word.length > 2);
    
    const titleMatches = titleWords.filter(word => content.includes(word));
    const authorMatches = authorWords.filter(word => content.includes(word));
    
    const titleScore = titleWords.length > 0 ? titleMatches.length / titleWords.length : 0;
    const authorScore = authorWords.length > 0 ? authorMatches.length / authorWords.length : 0;
    
    // Equal weighting for library systems
    const confidence = (titleScore * 0.5) + (authorScore * 0.5);
    
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
    
    if (result.status) {
      content.push(result.status);
    }
    
    return content.join(' ').toLowerCase();
  }

  /**
   * Calculate Library-specific false positive probability
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {number} False positive probability (0-1)
   */
  calculateFalsePositiveProbability(result, book) {
    let probability = 0.2; // Base 20% (higher due to library system complexity)
    
    // Increase probability if only weak indicators found
    const strongIndicators = this.findStrongIndicators(result);
    const weakIndicators = this.findWeakIndicators(result);
    
    if (strongIndicators.length === 0 && weakIndicators.length > 0) {
      probability += 0.2; // +20% for weak indicators only
    }
    
    // Increase probability if false positive patterns found
    const falsePositivePatterns = this.findFalsePositivePatterns(result);
    if (falsePositivePatterns.length > 0) {
      probability += 0.3; // +30% for false positive patterns
    }
    
    // Increase probability for poor matching
    const matchingValidation = this.validateMatching(result, book);
    if (matchingValidation.confidence < 0.4) {
      probability += 0.2; // +20% for poor matching
    }
    
    // Increase probability for wait time indicators
    const waitTimeValidation = this.validateWaitTime(result);
    if (waitTimeValidation.hasWaitTime) {
      probability += 0.15; // +15% for wait time
    }
    
    return Math.min(Math.max(probability, 0.1), 0.9); // Cap between 10-90%
  }

  /**
   * Get Library-specific validation statistics
   * @returns {Object} Library validation statistics
   */
  getLibraryStats() {
    const baseStats = this.getStats();
    
    return {
      ...baseStats,
      service: 'library',
      config: {
        strongIndicators: this.libraryConfig.strongIndicators.length,
        weakIndicators: this.libraryConfig.weakIndicators.length,
        falsePositivePatterns: this.libraryConfig.falsePositivePatterns.length,
        waitTimeIndicators: this.libraryConfig.waitTimeIndicators.length
      }
    };
  }
}

module.exports = LibraryValidator;
