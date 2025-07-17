/**
 * Validation Factory Tests
 * Tests for the validation factory and helpers
 */

const {
  ValidationFactory,
  ValidationHelpers,
  AvailabilityValidator,
  KindleUnlimitedValidator,
  HooplaValidator,
  LibraryValidator
} = require('../../../src/core/validation');

describe('ValidationFactory', () => {
  describe('createValidator', () => {
    it('should create KindleUnlimitedValidator for kindle_unlimited', () => {
      const validator = ValidationFactory.createValidator('kindle_unlimited');
      expect(validator).toBeInstanceOf(KindleUnlimitedValidator);
    });
    
    it('should create KindleUnlimitedValidator for ku', () => {
      const validator = ValidationFactory.createValidator('ku');
      expect(validator).toBeInstanceOf(KindleUnlimitedValidator);
    });
    
    it('should create HooplaValidator for hoopla', () => {
      const validator = ValidationFactory.createValidator('hoopla');
      expect(validator).toBeInstanceOf(HooplaValidator);
    });
    
    it('should create LibraryValidator for library', () => {
      const validator = ValidationFactory.createValidator('library');
      expect(validator).toBeInstanceOf(LibraryValidator);
    });
    
    it('should create LibraryValidator for public_library', () => {
      const validator = ValidationFactory.createValidator('public_library');
      expect(validator).toBeInstanceOf(LibraryValidator);
    });
    
    it('should create base AvailabilityValidator for unknown service', () => {
      const validator = ValidationFactory.createValidator('unknown');
      expect(validator).toBeInstanceOf(AvailabilityValidator);
      expect(validator.constructor.name).toBe('AvailabilityValidator');
    });
    
    it('should pass configuration to validators', () => {
      const config = {
        minConfidence: 0.8,
        enableLogging: true
      };
      
      const validator = ValidationFactory.createValidator('kindle_unlimited', config);
      expect(validator.config.minConfidence).toBe(0.8);
      expect(validator.config.enableLogging).toBe(true);
    });
  });
  
  describe('getAvailableValidators', () => {
    it('should return list of available validators', () => {
      const validators = ValidationFactory.getAvailableValidators();
      
      expect(validators).toContain('availability');
      expect(validators).toContain('kindle_unlimited');
      expect(validators).toContain('hoopla');
      expect(validators).toContain('library');
      expect(validators).toHaveLength(4);
    });
  });
  
  describe('createValidationSuite', () => {
    it('should create validation suite with multiple validators', () => {
      const services = ['kindle_unlimited', 'hoopla', 'library'];
      const suite = ValidationFactory.createValidationSuite(services);
      
      expect(suite.validators).toHaveProperty('kindle_unlimited');
      expect(suite.validators).toHaveProperty('hoopla');
      expect(suite.validators).toHaveProperty('library');
      expect(suite.validators.kindle_unlimited).toBeInstanceOf(KindleUnlimitedValidator);
      expect(suite.validators.hoopla).toBeInstanceOf(HooplaValidator);
      expect(suite.validators.library).toBeInstanceOf(LibraryValidator);
    });
    
    it('should validate with appropriate validator', () => {
      const services = ['kindle_unlimited', 'hoopla'];
      const suite = ValidationFactory.createValidationSuite(services);
      
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const mockBook = {
        book_title: 'Test Book',
        author_name: 'Test Author'
      };
      
      const validation = suite.validate('kindle_unlimited', result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.metadata.validator).toBe('KindleUnlimitedValidator');
    });
    
    it('should throw error for unknown service', () => {
      const services = ['kindle_unlimited'];
      const suite = ValidationFactory.createValidationSuite(services);
      
      expect(() => {
        suite.validate('unknown', {}, {});
      }).toThrow('No validator found for service: unknown');
    });
    
    it('should return combined statistics', () => {
      const services = ['kindle_unlimited', 'hoopla'];
      const suite = ValidationFactory.createValidationSuite(services);
      
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const mockBook = {
        book_title: 'Test Book',
        author_name: 'Test Author'
      };
      
      suite.validate('kindle_unlimited', result, mockBook);
      suite.validate('hoopla', result, mockBook);
      
      const stats = suite.getStats();
      
      expect(stats).toHaveProperty('kindle_unlimited');
      expect(stats).toHaveProperty('hoopla');
      expect(stats.kindle_unlimited.validations).toBe(1);
      expect(stats.hoopla.validations).toBe(1);
    });
    
    it('should reset all validator statistics', () => {
      const services = ['kindle_unlimited', 'hoopla'];
      const suite = ValidationFactory.createValidationSuite(services);
      
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const mockBook = {
        book_title: 'Test Book',
        author_name: 'Test Author'
      };
      
      suite.validate('kindle_unlimited', result, mockBook);
      suite.resetStats();
      
      const stats = suite.getStats();
      
      expect(stats.kindle_unlimited.validations).toBe(0);
      expect(stats.hoopla.validations).toBe(0);
    });
  });
});

describe('ValidationHelpers', () => {
  describe('calculateOverallConfidence', () => {
    it('should return 0 for empty results', () => {
      const confidence = ValidationHelpers.calculateOverallConfidence([]);
      expect(confidence).toBe(0);
    });
    
    it('should return 0 for all invalid results', () => {
      const results = [
        { valid: false, adjustedConfidence: 0.8 },
        { valid: false, adjustedConfidence: 0.7 }
      ];
      
      const confidence = ValidationHelpers.calculateOverallConfidence(results);
      expect(confidence).toBe(0);
    });
    
    it('should calculate average confidence for valid results', () => {
      const results = [
        { valid: true, adjustedConfidence: 0.8 },
        { valid: true, adjustedConfidence: 0.6 },
        { valid: false, adjustedConfidence: 0.9 }
      ];
      
      const confidence = ValidationHelpers.calculateOverallConfidence(results);
      expect(confidence).toBe(0.7); // (0.8 + 0.6) / 2
    });
    
    it('should handle missing adjustedConfidence', () => {
      const results = [
        { valid: true, adjustedConfidence: 0.8 },
        { valid: true } // Missing adjustedConfidence
      ];
      
      const confidence = ValidationHelpers.calculateOverallConfidence(results);
      expect(confidence).toBe(0.4); // (0.8 + 0) / 2
    });
  });
  
  describe('mergeValidationFactors', () => {
    it('should merge factors from multiple results', () => {
      const results = [
        {
          factors: [
            { type: 'boost', value: 0.1, reason: 'Test 1' }
          ],
          metadata: { validator: 'TestValidator1' }
        },
        {
          factors: [
            { type: 'penalty', value: 0.2, reason: 'Test 2' }
          ],
          metadata: { validator: 'TestValidator2' }
        }
      ];
      
      const factors = ValidationHelpers.mergeValidationFactors(results);
      
      expect(factors).toHaveLength(2);
      expect(factors[0].validator).toBe('TestValidator1');
      expect(factors[1].validator).toBe('TestValidator2');
    });
    
    it('should handle missing factors', () => {
      const results = [
        { factors: [{ type: 'boost', value: 0.1, reason: 'Test' }] },
        { factors: undefined }
      ];
      
      const factors = ValidationHelpers.mergeValidationFactors(results);
      
      expect(factors).toHaveLength(1);
    });
  });
  
  describe('generateSummaryReport', () => {
    it('should generate comprehensive summary report', () => {
      const results = [
        {
          valid: true,
          adjustedConfidence: 0.8,
          factors: [{ type: 'boost', value: 0.1, reason: 'Test' }],
          warnings: ['Warning 1'],
          errors: []
        },
        {
          valid: false,
          adjustedConfidence: 0.3,
          factors: [],
          warnings: [],
          errors: ['Error 1']
        }
      ];
      
      const report = ValidationHelpers.generateSummaryReport(results);
      
      expect(report.summary.total).toBe(2);
      expect(report.summary.valid).toBe(1);
      expect(report.summary.invalid).toBe(1);
      expect(report.summary.overallConfidence).toBe(0.8);
      expect(report.summary.validationRate).toBe('50.0');
      expect(report.factors).toHaveLength(1);
      expect(report.warnings).toContain('Warning 1');
      expect(report.errors).toContain('Error 1');
    });
  });
});
