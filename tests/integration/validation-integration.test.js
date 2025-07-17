/**
 * Validation Integration Tests
 * Tests for validation framework integration with scrapers
 */

const { ValidationFactory, ValidationHelpers } = require('../../src/core/validation');
const KindleUnlimitedScraper = require('../../src/core/scrapers/kindle-unlimited-scraper');
const HooplaScraper = require('../../src/core/scrapers/hoopla-scraper');
const LibraryScraper = require('../../src/core/scrapers/library-scraper');

describe('Validation Integration', () => {
  const mockBook = {
    book_title: 'Test Romance Novel',
    author_name: 'Jane Author',
    genres: ['romance', 'contemporary'],
    isbn: '1234567890'
  };
  
  describe('KindleUnlimited Integration', () => {
    let validator;
    let scraper;
    
    beforeEach(() => {
      validator = ValidationFactory.createValidator('kindle_unlimited', {
        enableLogging: false
      });
      
      scraper = new KindleUnlimitedScraper({
        timeout: 5000,
        rateLimitMs: 100
      });
    });
    
    it('should validate high confidence KU result', () => {
      const result = {
        available: true,
        confidence: 0.9,
        details: 'Book found on Kindle Unlimited with strong indicators',
        metadata: {
          searchContent: 'kindle unlimited included with kindle unlimited read for free'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBeGreaterThan(0.9);
      expect(validation.factors.some(f => f.type === 'boost')).toBe(true);
    });
    
    it('should penalize weak KU indicators', () => {
      const result = {
        available: true,
        confidence: 0.7,
        details: 'Book found on Kindle',
        metadata: {
          searchContent: 'kindle edition available on kindle digital book'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBeLessThan(0.7);
      expect(validation.factors.some(f => f.type === 'penalty')).toBe(true);
    });
    
    it('should detect false positive patterns', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book temporarily unavailable',
        metadata: {
          searchContent: 'not available temporarily unavailable pre-order'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBeLessThan(0.5);
      expect(validation.factors.some(f => f.reason.includes('false positive'))).toBe(true);
    });
  });
  
  describe('Hoopla Integration', () => {
    let validator;
    let scraper;
    
    beforeEach(() => {
      validator = ValidationFactory.createValidator('hoopla', {
        enableLogging: false
      });
      
      scraper = new HooplaScraper({
        timeout: 5000,
        rateLimitMs: 100
      });
    });
    
    it('should validate strong Hoopla result', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book available on Hoopla',
        metadata: {
          searchContent: 'hoopla available on hoopla borrow from hoopla library card'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBeGreaterThan(0.8);
      expect(validation.factors.some(f => f.reason.includes('Strong Hoopla indicators'))).toBe(true);
    });
    
    it('should boost confidence for supported formats', () => {
      const result = {
        available: true,
        confidence: 0.7,
        details: 'Ebook available',
        metadata: {
          searchContent: 'hoopla ebook audiobook digital streaming'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.factors.some(f => f.reason.includes('Supported format'))).toBe(true);
    });
    
    it('should boost confidence for strong romance genre', () => {
      const result = {
        available: true,
        confidence: 0.7,
        details: 'Romance novel available',
        metadata: {
          searchContent: 'hoopla romance fiction contemporary'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.factors.some(f => f.reason.includes('Strong genre for Hoopla'))).toBe(true);
    });
  });
  
  describe('Library Integration', () => {
    let validator;
    let scraper;
    
    beforeEach(() => {
      validator = ValidationFactory.createValidator('library', {
        enableLogging: false
      });
      
      scraper = new LibraryScraper({
        timeout: 5000,
        rateLimitMs: 100
      });
    });
    
    it('should validate immediate library availability', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book available on shelf',
        metadata: {
          searchContent: 'available now on shelf in stock check out'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBeGreaterThan(0.8);
      expect(validation.factors.some(f => f.reason.includes('Immediate availability'))).toBe(true);
    });
    
    it('should penalize wait time indicators', () => {
      const result = {
        available: true,
        confidence: 0.7,
        details: 'Book on hold',
        metadata: {
          searchContent: 'hold waiting queue estimated wait next available'
        }
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBeLessThan(0.7);
      expect(validation.factors.some(f => f.reason.includes('Wait time detected'))).toBe(true);
      expect(validation.warnings.some(w => w.includes('wait time'))).toBe(true);
    });
  });
  
  describe('Multi-Service Validation', () => {
    let validationSuite;
    
    beforeEach(() => {
      validationSuite = ValidationFactory.createValidationSuite([
        'kindle_unlimited',
        'hoopla',
        'library'
      ]);
    });
    
    it('should validate results from multiple services', () => {
      const kuResult = {
        available: true,
        confidence: 0.9,
        details: 'Available on KU',
        metadata: {
          searchContent: 'kindle unlimited included with kindle unlimited'
        }
      };
      
      const hooplaResult = {
        available: true,
        confidence: 0.8,
        details: 'Available on Hoopla',
        metadata: {
          searchContent: 'hoopla available on hoopla ebook'
        }
      };
      
      const libraryResult = {
        available: false,
        confidence: 0.2,
        details: 'Not found in library',
        metadata: {
          searchContent: 'not available unavailable'
        }
      };
      
      const kuValidation = validationSuite.validate('kindle_unlimited', kuResult, mockBook);
      const hooplaValidation = validationSuite.validate('hoopla', hooplaResult, mockBook);
      const libraryValidation = validationSuite.validate('library', libraryResult, mockBook);
      
      expect(kuValidation.valid).toBe(true);
      expect(hooplaValidation.valid).toBe(true);
      expect(libraryValidation.valid).toBe(true);
      
      // Test overall confidence calculation
      const results = [kuValidation, hooplaValidation, libraryValidation];
      const overallConfidence = ValidationHelpers.calculateOverallConfidence(results);
      
      expect(overallConfidence).toBeGreaterThan(0.5);
    });
    
    it('should generate comprehensive summary report', () => {
      const results = [
        {
          valid: true,
          adjustedConfidence: 0.9,
          factors: [{ type: 'boost', value: 0.2, reason: 'KU indicators' }],
          warnings: [],
          errors: [],
          metadata: { validator: 'KindleUnlimitedValidator' }
        },
        {
          valid: true,
          adjustedConfidence: 0.8,
          factors: [{ type: 'boost', value: 0.1, reason: 'Hoopla indicators' }],
          warnings: ['Format warning'],
          errors: [],
          metadata: { validator: 'HooplaValidator' }
        },
        {
          valid: false,
          adjustedConfidence: 0.2,
          factors: [{ type: 'penalty', value: 0.3, reason: 'False positive' }],
          warnings: [],
          errors: ['Low confidence'],
          metadata: { validator: 'LibraryValidator' }
        }
      ];
      
      const report = ValidationHelpers.generateSummaryReport(results);
      
      expect(report.summary.total).toBe(3);
      expect(report.summary.valid).toBe(2);
      expect(report.summary.invalid).toBe(1);
      expect(report.summary.validationRate).toBe('66.7');
      expect(report.summary.overallConfidence).toBe(0.85); // (0.9 + 0.8) / 2
      expect(report.factors).toHaveLength(3);
      expect(report.warnings).toContain('Format warning');
      expect(report.errors).toContain('Low confidence');
    });
  });
  
  describe('Edge Cases', () => {
    let validator;
    
    beforeEach(() => {
      validator = ValidationFactory.createValidator('kindle_unlimited');
    });
    
    it('should handle missing book data', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
      };
      
      const incompleteBook = {};
      
      const validation = validator.validate(result, incompleteBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.metadata.book.title).toBeUndefined();
      expect(validation.metadata.book.author).toBeUndefined();
    });
    
    it('should handle missing result metadata', () => {
      const result = {
        available: true,
        confidence: 0.8,
        details: 'Book found'
        // No metadata
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.adjustedConfidence).toBe(0.8);
    });
    
    it('should handle extreme confidence values', () => {
      const result = {
        available: true,
        confidence: -0.5, // Below minimum
        details: 'Book found'
      };
      
      const validation = validator.validate(result, mockBook);
      
      expect(validation.valid).toBe(true);
      expect(validation.confidence).toBe(0.0);
      expect(validation.adjustedConfidence).toBe(0.0);
    });
  });
});
