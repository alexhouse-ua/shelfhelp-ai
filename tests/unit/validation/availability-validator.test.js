/**
 * Availability Validator Tests
 * Tests for the base availability validator
 */

const AvailabilityValidator = require('../../../src/core/validation/availability-validator');

describe('AvailabilityValidator', () => {
  let validator;
  
  beforeEach(() => {
    validator = new AvailabilityValidator({
      minConfidence: 0.6,
      enableLogging: false
    });
  });
  
  afterEach(() => {
    validator.resetStats();
  });
  
  describe('constructor', () => {
    it('should create validator with default configuration', () => {
      const defaultValidator = new AvailabilityValidator();
      expect(defaultValidator.config.minConfidence).toBe(0.6);
      expect(defaultValidator.config.enableLogging).toBe(false);
    });
    
    it('should create validator with custom configuration', () => {
      const customValidator = new AvailabilityValidator({
        minConfidence: 0.8,
        enableLogging: true
      });
      expect(customValidator.config.minConfidence).toBe(0.8);
      expect(customValidator.config.enableLogging).toBe(true);
    });
  });
  
  describe('validate', () => {
    const mockBook = {
      book_title: 'Test Book',
      author_name: 'Test Author'
    };
    
    it('should validate valid result', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.confidence).toBe(0.8);
      expect(validation.adjustedConfidence).toBe(0.8);
      expect(validation.errors).toHaveLength(0);
    });
    
    it('should handle invalid result object', () => {
      const validation = validator.validate(null, mockBook);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid result object');
    });
    
    it('should handle invalid confidence value', () => {
      const result = {
        available: true,
        confidence: 'invalid',
        details: 'Book found'
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.confidence).toBe(0);
      expect(validation.warnings).toContain('Invalid confidence value, defaulting to 0');
    });
    
    it('should normalize confidence values', () => {
      const result = {
        available: true,
        confidence: 1.5, // Above max
        details: 'Book found'
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.confidence).toBe(1.0);
      expect(validation.adjustedConfidence).toBe(1.0);
    });
    
    it('should include metadata in validation result', () => {
      const result = {
        available: true,
        confidence: 0.7,
        details: 'Book found'
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.metadata).toBeDefined();
      expect(validation.metadata.validator).toBe('AvailabilityValidator');
      expect(validation.metadata.book.title).toBe('Test Book');
      expect(validation.metadata.book.author).toBe('Test Author');
    });
  });
  
  describe('adjustConfidence', () => {
    it('should boost confidence', () => {
      const factors = [{
        type: 'boost',
        value: 0.2,
        reason: 'Test boost'
      }];
      
      const adjusted = validator.adjustConfidence(0.5, factors);
      expect(adjusted).toBe(0.7);
    });
    
    it('should apply penalty', () => {
      const factors = [{
        type: 'penalty',
        value: 0.2,
        reason: 'Test penalty'
      }];
      
      const adjusted = validator.adjustConfidence(0.5, factors);
      expect(adjusted).toBe(0.3);
    });
    
    it('should multiply confidence', () => {
      const factors = [{
        type: 'multiply',
        value: 0.8,
        reason: 'Test multiply'
      }];
      
      const adjusted = validator.adjustConfidence(0.5, factors);
      expect(adjusted).toBe(0.4);
    });
    
    it('should apply multiple factors', () => {
      const factors = [
        { type: 'boost', value: 0.2, reason: 'Test boost' },
        { type: 'penalty', value: 0.1, reason: 'Test penalty' },
        { type: 'multiply', value: 0.9, reason: 'Test multiply' }
      ];
      
      const adjusted = validator.adjustConfidence(0.5, factors);
      // (0.5 + 0.2 - 0.1) * 0.9 = 0.54
      expect(adjusted).toBe(0.54);
    });
    
    it('should cap confidence at 1.0', () => {
      const factors = [{
        type: 'boost',
        value: 0.8,
        reason: 'Large boost'
      }];
      
      const adjusted = validator.adjustConfidence(0.5, factors);
      expect(adjusted).toBe(1.0);
    });
    
    it('should floor confidence at 0.0', () => {
      const factors = [{
        type: 'penalty',
        value: 0.8,
        reason: 'Large penalty'
      }];
      
      const adjusted = validator.adjustConfidence(0.5, factors);
      expect(adjusted).toBe(0.0);
    });
  });
  
  describe('getStats', () => {
    it('should return initial statistics', () => {
      const stats = validator.getStats();
      
      expect(stats.validations).toBe(0);
      expect(stats.passed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.passRate).toBe(0);
    });
    
    it('should update statistics after validation', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const mockBook = {
        book_title: 'Test Book',
        author_name: 'Test Author'
      };
      
      validator.validate(result, mockBook);
      
      const stats = validator.getStats();
      
      expect(stats.validations).toBe(1);
      expect(stats.passed).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.passRate).toBe(100);
    });
  });
  
  describe('resetStats', () => {
    it('should reset statistics', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const mockBook = {
        book_title: 'Test Book',
        author_name: 'Test Author'
      };
      
      validator.validate(result, mockBook);
      validator.resetStats();
      
      const stats = validator.getStats();
      
      expect(stats.validations).toBe(0);
      expect(stats.passed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });
  
  describe('calculateFalsePositiveProbability', () => {
    it('should return base false positive probability', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const mockBook = {
        book_title: 'Test Book',
        author_name: 'Test Author'
      };
      
      const probability = validator.calculateFalsePositiveProbability(result, mockBook);
      expect(probability).toBe(0.1);
    });
  });
});
