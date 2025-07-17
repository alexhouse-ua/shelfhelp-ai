/**
 * Validation Framework Index
 * Exports all validation components
 */

const AvailabilityValidator = require('./availability-validator');
const KindleUnlimitedValidator = require('./kindle-unlimited-validator');
const HooplaValidator = require('./hoopla-validator');
const LibraryValidator = require('./library-validator');

/**
 * Validation Factory
 * Creates appropriate validator instances based on service type
 */
class ValidationFactory {
  /**
   * Create validator for specific service
   * @param {string} service - Service type ('kindle_unlimited', 'hoopla', 'library')
   * @param {Object} config - Validator configuration
   * @returns {AvailabilityValidator} Validator instance
   */
  static createValidator(service, config = {}) {
    switch (service.toLowerCase()) {
      case 'kindle_unlimited':
      case 'ku':
        return new KindleUnlimitedValidator(config);
      
      case 'hoopla':
        return new HooplaValidator(config);
      
      case 'library':
      case 'public_library':
        return new LibraryValidator(config);
      
      default:
        return new AvailabilityValidator(config);
    }
  }

  /**
   * Get all available validator types
   * @returns {Array} Available validator types
   */
  static getAvailableValidators() {
    return [
      'availability',
      'kindle_unlimited',
      'hoopla',
      'library'
    ];
  }

  /**
   * Create validation suite with multiple validators
   * @param {Array} services - Array of service names
   * @param {Object} config - Shared configuration
   * @returns {Object} Validation suite
   */
  static createValidationSuite(services, config = {}) {
    const validators = {};
    
    for (const service of services) {
      validators[service] = this.createValidator(service, config);
    }
    
    return {
      validators,
      
      /**
       * Validate result with appropriate validator
       * @param {string} service - Service name
       * @param {Object} result - Availability check result
       * @param {Object} book - Book data
       * @returns {Object} Validation result
       */
      validate(service, result, book) {
        const validator = validators[service];
        if (!validator) {
          throw new Error(`No validator found for service: ${service}`);
        }
        return validator.validate(result, book);
      },
      
      /**
       * Get statistics for all validators
       * @returns {Object} Combined statistics
       */
      getStats() {
        const stats = {};
        for (const [service, validator] of Object.entries(validators)) {
          stats[service] = validator.getStats();
        }
        return stats;
      },
      
      /**
       * Reset statistics for all validators
       */
      resetStats() {
        for (const validator of Object.values(validators)) {
          validator.resetStats();
        }
      }
    };
  }
}

/**
 * Validation Helper Functions
 */
class ValidationHelpers {
  /**
   * Calculate overall confidence from multiple validation results
   * @param {Array} validationResults - Array of validation results
   * @returns {number} Overall confidence score
   */
  static calculateOverallConfidence(validationResults) {
    if (!validationResults || validationResults.length === 0) {
      return 0;
    }
    
    const validResults = validationResults.filter(result => result.valid);
    if (validResults.length === 0) {
      return 0;
    }
    
    // Weight by adjusted confidence
    const totalConfidence = validResults.reduce((sum, result) => {
      return sum + (result.adjustedConfidence || 0);
    }, 0);
    
    return Math.round((totalConfidence / validResults.length) * 100) / 100;
  }
  
  /**
   * Merge validation factors from multiple results
   * @param {Array} validationResults - Array of validation results
   * @returns {Array} Merged factors
   */
  static mergeValidationFactors(validationResults) {
    const allFactors = [];
    
    for (const result of validationResults) {
      if (result.factors) {
        allFactors.push(...result.factors.map(factor => ({
          ...factor,
          validator: result.metadata?.validator || 'unknown'
        })));
      }
    }
    
    return allFactors;
  }
  
  /**
   * Generate validation summary report
   * @param {Array} validationResults - Array of validation results
   * @returns {Object} Summary report
   */
  static generateSummaryReport(validationResults) {
    const total = validationResults.length;
    const valid = validationResults.filter(result => result.valid).length;
    const invalid = total - valid;
    
    const overallConfidence = this.calculateOverallConfidence(validationResults);
    const allFactors = this.mergeValidationFactors(validationResults);
    
    const warnings = [];
    const errors = [];
    
    for (const result of validationResults) {
      if (result.warnings) {
        warnings.push(...result.warnings);
      }
      if (result.errors) {
        errors.push(...result.errors);
      }
    }
    
    return {
      summary: {
        total,
        valid,
        invalid,
        overallConfidence,
        validationRate: total > 0 ? (valid / total * 100).toFixed(1) : 0
      },
      factors: allFactors,
      warnings,
      errors,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  AvailabilityValidator,
  KindleUnlimitedValidator,
  HooplaValidator,
  LibraryValidator,
  ValidationFactory,
  ValidationHelpers
};
