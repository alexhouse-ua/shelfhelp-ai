/**
 * Integration Tests - Books API
 * Tests complete API workflows with performance optimizations
 */

const request = require('supertest');
const app = require('../../../scripts/core/api-server');

describe('Books API Integration', () => {
  describe('GET /api/books', () => {
    test('should return books with caching metadata', async () => {
      const response = await request(app)
        .get('/api/books?limit=5')
        .set('x-api-key', process.env.API_KEY || 'test-key')
        .expect(200);

      expect(response.body).toHaveProperty('books');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('performance');
      expect(response.body.performance).toHaveProperty('cached', true);
      expect(response.body.performance).toHaveProperty('response_time');
      expect(Array.isArray(response.body.books)).toBe(true);
    });

    test('should handle filtering with cache optimization', async () => {
      const response = await request(app)
        .get('/api/books?status=tbr&limit=10')
        .set('x-api-key', 'test-key')
        .expect(200);

      expect(response.body.books.every(book => book.status === 'tbr')).toBe(true);
      expect(response.body.filters.status).toBe('tbr');
    });

    test('should support pagination correctly', async () => {
      const response = await request(app)
        .get('/api/books?page=1&limit=5')
        .set('x-api-key', 'test-key')
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 5);
      expect(response.body.pagination).toHaveProperty('totalItems');
      expect(response.body.pagination).toHaveProperty('hasNext');
    });

    test('should require API key authentication', async () => {
      await request(app)
        .get('/api/books')
        .expect(401);
    });

    test('should handle search queries efficiently', async () => {
      const response = await request(app)
        .get('/api/books?search=test&limit=5')
        .set('x-api-key', 'test-key')
        .expect(200);

      expect(response.body.filters.search).toBe('test');
      expect(response.body.performance.cached).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    test('should include response time metrics', async () => {
      const response = await request(app)
        .get('/api/books?limit=1')
        .set('x-api-key', 'test-key')
        .expect(200);

      expect(response.body.performance.response_time).toBeGreaterThan(0);
      expect(response.body.performance.response_time).toBeLessThan(5000); // Should be fast
    });

    test('should maintain cache efficiency', async () => {
      // First request (cache miss)
      await request(app)
        .get('/api/books?status=tbr&limit=5')
        .set('x-api-key', 'test-key');

      // Second request (cache hit)
      const response = await request(app)
        .get('/api/books?status=tbr&limit=5')
        .set('x-api-key', 'test-key')
        .expect(200);

      expect(response.body.performance.cached).toBe(true);
    });
  });
});