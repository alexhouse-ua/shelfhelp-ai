/**
 * Kindle Unlimited Validator
 * Validates Kindle Unlimited availability check results
 */

const AvailabilityValidator = require('./availability-validator');

class KindleUnlimitedValidator extends AvailabilityValidator {
  constructor(config = {}) {
    super({
      minConfidence: 0.7,
      maxConfidence: 1.0,
      enableLogging: config.enableLogging || false,
      ...config
    });
    
    // KU-specific configuration
    this.kuConfig = {
      strongIndicators: [
        'kindle unlimited',
        'included with kindle unlimited',
        'read for free',
        'ku eligible',
        'unlimited reading'
      ],
      weakIndicators: [
        'kindle edition',
        'available on kindle',
        'digital book'
      ],
      falsePositivePatterns: [
        'not available',
        'out of print',
        'temporarily unavailable',
        'pre-order',
        'coming soon'
      ],
      priceKeywords: [
        '$0.00',
        'free',
        'included'
      ]
    };
  }

  /**
   * Validate KU-specific availability result
   * @param {Object} result - KU availability check result
   * @param {Object} book - Book data
   * @param {number} normalizedConfidence - Normalized confidence from base validator
   * @returns {Object} KU-specific validation result
   */
  validateServiceSpecific(result, book, normalizedConfidence = 0) {
    const validation = {
      adjustedConfidence: normalizedConfidence,
      factors: [],
      warnings: [],
      errors: []
    };

    // Validate KU result structure
    if (result.available === undefined) {
      validation.errors.push('Missing availability status');
      return validation;
    }

    // Check for strong KU indicators
    const strongIndicators = this.findStrongIndicators(result);
    if (strongIndicators.length > 0) {
      validation.factors.push({
        type: 'boost',
        value: 0.2,
        reason: `Strong KU indicators found: ${strongIndicators.join(', ')}`
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

    // Price validation
    const priceValidation = this.validatePricing(result);
    if (priceValidation.suspicious) {
      validation.warnings.push(`Price validation: ${priceValidation.reason}`);
      validation.factors.push({
        type: 'penalty',
        value: 0.1,
        reason: priceValidation.reason
      });
    }

    // Title/Author matching validation
    const matchingValidation = this.validateMatching(result, book);
    if (matchingValidation.confidence < 0.5) {
      validation.factors.push({
        type: 'penalty',
        value: 0.2,
        reason: `Poor title/author matching: ${matchingValidation.confidence}`
      });
    } else if (matchingValidation.confidence > 0.8) {
      validation.factors.push({
        type: 'boost',
        value: 0.1,
        reason: `Strong title/author matching: ${matchingValidation.confidence}`
      });
    }

    // Apply confidence adjustments
    validation.adjustedConfidence = this.adjustConfidence(
      normalizedConfidence,
      validation.factors
    );

    return validation;
  }

  /**
   * Find strong KU indicators in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found strong indicators
   */
  findStrongIndicators(result) {
    const content = this.extractContent(result);
    return this.kuConfig.strongIndicators.filter(indicator => 
      content.includes(indicator)
    );
  }

  /**
   * Find weak KU indicators in result
   * @param {Object} result - Availability check result
   * @returns {Array} Found weak indicators
   */
  findWeakIndicators(result) {
    const content = this.extractContent(result);
    return this.kuConfig.weakIndicators.filter(indicator => 
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
    return this.kuConfig.falsePositivePatterns.filter(pattern => 
      content.includes(pattern)
    );
  }

  /**
   * Validate pricing information
   * @param {Object} result - Availability check result
   * @returns {Object} Price validation result
   */
  validatePricing(result) {
    const content = this.extractContent(result);
    
    // If no metadata searchContent available, skip pricing validation
    if (!result.metadata || !result.metadata.searchContent) {
      return { suspicious: false };
    }
    
    const priceFound = this.kuConfig.priceKeywords.some(keyword => 
      content.includes(keyword)
    );
    
    // If claiming KU availability but no free/included pricing found
    if (result.available && !priceFound) {
      return {
        suspicious: true,
        reason: 'KU availability claimed but no free pricing indicators found'
      };
    }
    
    return { suspicious: false };
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
    
    // If no metadata searchContent available, return neutral score to avoid penalties
    if (!result.metadata || !result.metadata.searchContent) {
      return {
        confidence: 0.5, // Neutral score - no penalty or boost
        titleScore: 0,
        authorScore: 0,
        titleMatches: 0,
        authorMatches: 0
      };
    }
    
    // Simple matching logic
    const titleWords = title.split(' ').filter(word => word.length > 2);
    const authorWords = author.split(' ').filter(word => word.length > 2);
    
    const titleMatches = titleWords.filter(word => content.includes(word));
    const authorMatches = authorWords.filter(word => content.includes(word));
    
    const titleScore = titleWords.length > 0 ? titleMatches.length / titleWords.length : 0;
    const authorScore = authorWords.length > 0 ? authorMatches.length / authorWords.length : 0;
    
    const confidence = (titleScore * 0.6) + (authorScore * 0.4);
    
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
    
    return content.join(' ').toLowerCase();
  }

  /**
   * Calculate KU-specific false positive probability
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {number} False positive probability (0-1)
   */
  calculateFalsePositiveProbability(result, book) {
    let probability = 0.1; // Base 10%
    
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
    if (matchingValidation.confidence < 0.5) {
      probability += 0.2; // +20% for poor matching
    }
    
    return Math.min(probability, 0.9); // Cap at 90%
  }

  /**
   * Get KU-specific validation statistics
   * @returns {Object} KU validation statistics
   */
  getKUStats() {
    const baseStats = this.getStats();
    
    return {
      ...baseStats,
      service: 'kindle_unlimited',
      config: {
        strongIndicators: this.kuConfig.strongIndicators.length,
        weakIndicators: this.kuConfig.weakIndicators.length,
        falsePositivePatterns: this.kuConfig.falsePositivePatterns.length
      }
    };
  }
}

module.exports = KindleUnlimitedValidator;
