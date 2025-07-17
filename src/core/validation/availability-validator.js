/**
 * Availability Validator Interface
 * Defines the contract for validating availability check results
 */

class AvailabilityValidator {
  constructor(config = {}) {
    this.config = {
      minConfidence: config.minConfidence || 0.6,
      maxConfidence: config.maxConfidence || 1.0,
      enableLogging: config.enableLogging || false,
      ...config
    };
    
    this.stats = {
      validations: 0,
      passed: 0,
      failed: 0,
      falsePositives: 0,
      falseNegatives: 0
    };
  }

  /**
   * Validate availability check result
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {Object} Validation result
   */
  validate(result, book) {
    this.stats.validations++;
    
    const validation = {
      valid: true,
      confidence: 0,
      adjustedConfidence: 0,
      factors: [],
      warnings: [],
      errors: [],
      metadata: {
        validator: this.constructor.name,
        timestamp: new Date().toISOString(),
        book: {
          title: book?.book_title || book?.title,
          author: book?.author_name
        }
      }
    };

    // Basic result validation
    if (!result || typeof result !== 'object') {
      validation.valid = false;
      validation.errors.push('Invalid result object');
      this.stats.failed++;
      return validation;
    }

    // Confidence validation
    if (typeof result.confidence !== 'number' || isNaN(result.confidence)) {
      validation.warnings.push('Invalid confidence value, defaulting to 0');
      validation.confidence = 0;
      validation.adjustedConfidence = 0;
    } else {
      validation.confidence = Math.max(0, Math.min(1, result.confidence));
      validation.adjustedConfidence = validation.confidence;
    }

    // Service-specific validation
    const serviceValidation = this.validateServiceSpecific(result, book);
    validation.adjustedConfidence = serviceValidation.adjustedConfidence;
    validation.factors.push(...serviceValidation.factors);
    validation.warnings.push(...serviceValidation.warnings);
    validation.errors.push(...serviceValidation.errors);

    // Final validation
    if (validation.errors.length > 0) {
      validation.valid = false;
      this.stats.failed++;
    } else {
      this.stats.passed++;
    }

    return validation;
  }

  /**
   * Service-specific validation - must be implemented by subclasses
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {Object} Service-specific validation result
   */
  validateServiceSpecific(result, _book) {
    // Use normalized confidence from the validation process
    const normalizedConfidence = Math.max(0, Math.min(1, result.confidence || 0));
    
    return {
      adjustedConfidence: normalizedConfidence,
      factors: [],
      warnings: [],
      errors: []
    };
  }

  /**
   * Calculate false positive likelihood
   * @param {Object} result - Availability check result
   * @param {Object} book - Book data
   * @returns {number} False positive probability (0-1)
   */
  calculateFalsePositiveProbability(_result, _book) {
    // Base implementation - override in subclasses
    return 0.1; // 10% base false positive rate
  }

  /**
   * Apply confidence adjustments based on validation factors
   * @param {number} baseConfidence - Original confidence
   * @param {Array} factors - Validation factors
   * @returns {number} Adjusted confidence
   */
  adjustConfidence(baseConfidence, factors) {
    let adjusted = baseConfidence;
    
    for (const factor of factors) {
      switch (factor.type) {
        case 'boost':
          adjusted = Math.min(adjusted + factor.value, 1.0);
          break;
        case 'penalty':
          adjusted = Math.max(adjusted - factor.value, 0.0);
          break;
        case 'multiply':
          adjusted = adjusted * factor.value;
          break;
      }
    }
    
    return Math.round(adjusted * 100) / 100;
  }

  /**
   * Get validator statistics
   * @returns {Object} Validation statistics
   */
  getStats() {
    const { validations, passed } = this.stats;
    const passRate = validations > 0 ? (passed / validations * 100).toFixed(1) : 0;
    
    return {
      ...this.stats,
      passRate: parseFloat(passRate),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset validation statistics
   */
  resetStats() {
    this.stats = {
      validations: 0,
      passed: 0,
      failed: 0,
      falsePositives: 0,
      falseNegatives: 0
    };
  }

  /**
   * Log validation result if logging is enabled
   * @param {Object} validation - Validation result
   */
  logValidation(validation) {
    if (this.config.enableLogging) {
      const level = validation.valid ? 'info' : 'warn';
      // Use structured logging instead of console
      const logger = require('../../scripts/core/logger');
      logger[level](`Validation ${validation.valid ? 'passed' : 'failed'}`, {
        confidence: validation.confidence,
        adjustedConfidence: validation.adjustedConfidence,
        factors: validation.factors.length,
        warnings: validation.warnings.length,
        errors: validation.errors.length
      });
    }
  }
}

module.exports = AvailabilityValidator;
