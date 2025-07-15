/**
 * Unit Tests - Enhanced Book Cache
 * Tests memory caching, indexed lookups, and performance optimizations
 */

const bookCache = require('../../../src/core/book-cache');

describe('Enhanced Book Cache', () => {
  beforeEach(() => {
    // Reset cache before each test
    bookCache.cache.clear();
    bookCache.queryCache.clear();
    bookCache.indexes.clear();
  });

  describe('Cache Management', () => {
    test('should initialize indexes correctly', async () => {
      // Mock the getData method to return test data
      const testBooks = [
        { id: 1, title: 'Book 1', status: 'tbr', genre: 'romance', author: 'Author 1' },
        { id: 2, title: 'Book 2', status: 'read', genre: 'fantasy', author: 'Author 2' }
      ];
      
      jest.spyOn(bookCache, 'getData').mockResolvedValue(testBooks);
      
      await bookCache.initializeIndexes();
      
      expect(bookCache.indexes.get('status').get('tbr')).toHaveLength(1);
      expect(bookCache.indexes.get('genre').get('romance')).toHaveLength(1);
      expect(bookCache.indexes.get('author').get('Author 1')).toHaveLength(1);
    });

    test('should find books by status with O(1) lookup', () => {
      const mockBooks = [{ id: 1, status: 'tbr' }];
      bookCache.indexes.set('status', new Map([['tbr', mockBooks]]));
      
      const result = bookCache.getByStatus('tbr');
      expect(result).toEqual(mockBooks);
    });

    test('should cache query results with TTL', () => {
      const testData = [{ id: 1, title: 'Test' }];
      bookCache.setCachedQuery('test-key', testData, 1000);
      
      const cached = bookCache.getCachedQuery('test-key');
      expect(cached).toEqual(testData);
    });

    test('should expire cached queries after TTL', (done) => {
      const testData = [{ id: 1, title: 'Test' }];
      bookCache.setCachedQuery('test-key', testData, 10); // 10ms TTL
      
      setTimeout(() => {
        const cached = bookCache.getCachedQuery('test-key');
        expect(cached).toBeNull();
        done();
      }, 20);
    });
  });

  describe('Pagination', () => {
    test('should return paginated results with metadata', async () => {
      const testBooks = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        title: `Book ${i + 1}`,
        status: 'tbr'
      }));
      
      jest.spyOn(bookCache, 'filterBooks').mockResolvedValue(testBooks);
      
      const result = await bookCache.getPaginatedBooks(1, 10, {});
      
      expect(result.data).toHaveLength(10);
      expect(result.pagination.totalItems).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
    });
  });

  describe('Cache Statistics', () => {
    test('should return comprehensive cache statistics', () => {
      bookCache.indexes.set('status', new Map([['tbr', []]]));
      bookCache.cache.set('test', 'data');
      
      const stats = bookCache.getCacheStats();
      
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('queryCacheSize');
      expect(stats).toHaveProperty('indexSizes');
      expect(stats.indexSizes.status).toBe(1);
    });
  });
});