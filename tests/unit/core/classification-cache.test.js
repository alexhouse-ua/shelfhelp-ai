/**
 * Unit Tests - Classification Cache
 * Tests fuzzy matching cache and classification data optimization
 */

const classificationCache = require('../../../src/core/classification-cache');

describe('Classification Cache', () => {
  beforeEach(() => {
    classificationCache.cache.clear();
    classificationCache.fuzzyMatchCache.clear();
  });

  describe('Data Caching', () => {
    test('should cache classification data', async () => {
      const mockData = { genres: { romance: { subgenres: ['contemporary'] } } };
      
      // Mock file operations
      jest.spyOn(require('fs').promises, 'stat').mockResolvedValue({ mtime: new Date() });
      jest.spyOn(require('fs').promises, 'readFile').mockResolvedValue(JSON.stringify(mockData));
      
      const result = await classificationCache.getData();
      expect(result).toEqual(mockData);
      expect(classificationCache.cache.get('classifications')).toEqual(mockData);
    });

    test('should return cached data on subsequent calls', async () => {
      const mockData = { test: 'data' };
      classificationCache.cache.set('classifications', mockData);
      classificationCache.lastModified = new Date();
      
      jest.spyOn(require('fs').promises, 'stat').mockResolvedValue({ mtime: new Date(Date.now() - 1000) });
      
      const result = await classificationCache.getData();
      expect(result).toEqual(mockData);
    });
  });

  describe('Fuzzy Match Caching', () => {
    test('should cache fuzzy match results', async () => {
      const mockResult = { match: 'romance', confidence: 0.9 };
      
      jest.spyOn(classificationCache, 'performFuzzyMatch').mockResolvedValue(mockResult);
      
      const result = await classificationCache.getFuzzyMatch('genre', 'romanse', 0.6);
      expect(result).toEqual(mockResult);
      
      // Verify caching
      const cacheKey = 'genre:romanse:0.6';
      expect(classificationCache.fuzzyMatchCache.has(cacheKey)).toBe(true);
    });

    test('should return cached fuzzy match results', async () => {
      const mockResult = { match: 'fantasy', confidence: 0.8 };
      const cacheKey = 'genre:fantasy:0.6';
      
      classificationCache.setFuzzyMatchCache(cacheKey, mockResult, 3600000);
      
      const result = await classificationCache.getFuzzyMatch('genre', 'fantasy', 0.6);
      expect(result).toEqual(mockResult);
    });

    test('should implement LRU cache eviction', () => {
      const originalMaxSize = classificationCache.maxCacheSize;
      classificationCache.maxCacheSize = 2;
      
      classificationCache.setFuzzyMatchCache('key1', 'value1');
      classificationCache.setFuzzyMatchCache('key2', 'value2');
      classificationCache.setFuzzyMatchCache('key3', 'value3');
      
      expect(classificationCache.fuzzyMatchCache.size).toBe(2);
      expect(classificationCache.fuzzyMatchCache.has('key1')).toBe(false);
      
      classificationCache.maxCacheSize = originalMaxSize;
    });
  });

  describe('Field Values', () => {
    test('should extract genre values correctly', async () => {
      const mockData = {
        genres: {
          romance: { subgenres: ['contemporary'] },
          fantasy: { subgenres: ['urban'] }
        }
      };
      
      jest.spyOn(classificationCache, 'getData').mockResolvedValue(mockData);
      
      const genres = await classificationCache.getFieldValues('genre');
      expect(genres).toEqual(['romance', 'fantasy']);
    });

    test('should extract subgenre values correctly', async () => {
      const mockData = {
        genres: {
          romance: { subgenres: ['contemporary', 'historical'] },
          fantasy: { subgenres: ['urban', 'epic'] }
        }
      };
      
      jest.spyOn(classificationCache, 'getData').mockResolvedValue(mockData);
      
      const subgenres = await classificationCache.getFieldValues('subgenre');
      expect(subgenres).toEqual(['contemporary', 'historical', 'urban', 'epic']);
    });
  });

  describe('Cache Invalidation', () => {
    test('should clear all caches on invalidation', async () => {
      classificationCache.cache.set('test', 'data');
      classificationCache.fuzzyMatchCache.set('test', 'data');
      
      await classificationCache.invalidateCache();
      
      expect(classificationCache.cache.size).toBe(0);
      expect(classificationCache.fuzzyMatchCache.size).toBe(0);
      expect(classificationCache.lastModified).toBeNull();
    });
  });
});