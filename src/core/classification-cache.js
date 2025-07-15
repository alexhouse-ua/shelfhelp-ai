/**
 * Classification Cache System
 * Optimizes fuzzy matching and classification data access
 */

const fs = require('fs').promises;
const path = require('path');

class ClassificationCache {
  constructor() {
    this.cache = new Map();
    this.fuzzyMatchCache = new Map();
    this.lastModified = null;
    this.dataPath = path.join(__dirname, '../../data/classifications.yaml');
    this.maxCacheSize = 1000;
  }

  /**
   * Get classification data with caching
   */
  async getData() {
    try {
      const stats = await fs.stat(this.dataPath);
      const fileModified = stats.mtime;
      
      // Check if cache is still valid
      if (this.cache.has('classifications') && this.lastModified >= fileModified) {
        return this.cache.get('classifications');
      }
      
      // Load fresh data
      const yaml = require('yaml');
      const data = await fs.readFile(this.dataPath, 'utf8');
      const classifications = yaml.parse(data);
      
      // Update cache
      this.cache.set('classifications', classifications);
      this.lastModified = fileModified;
      
      return classifications;
    } catch (error) {
      console.error('Error loading classifications data:', error);
      return {};
    }
  }

  /**
   * Get fuzzy match results with caching
   */
  async getFuzzyMatch(field, value, threshold = 0.6) {
    const cacheKey = `${field}:${value}:${threshold}`;
    
    // Check cache first
    if (this.fuzzyMatchCache.has(cacheKey)) {
      const cached = this.fuzzyMatchCache.get(cacheKey);
      if (cached.expires > Date.now()) {
        return cached.data;
      }
    }

    // Perform fuzzy match
    const result = await this.performFuzzyMatch(field, value, threshold);
    
    // Cache result with TTL
    this.setFuzzyMatchCache(cacheKey, result, 3600000); // 1 hour cache
    
    return result;
  }

  /**
   * Perform actual fuzzy matching
   */
  async performFuzzyMatch(field, value, threshold = 0.6) {
    const classifications = await this.getData();
    const FuzzyClassificationMatcher = require('../../scripts/core/fuzzy-classifier');
    
    const matcher = new FuzzyClassificationMatcher(classifications);
    return matcher.findMatch(field, value, threshold);
  }

  /**
   * Cache fuzzy match results
   */
  setFuzzyMatchCache(cacheKey, result, ttl = 3600000) { // 1 hour default
    // Implement LRU cache
    if (this.fuzzyMatchCache.size >= this.maxCacheSize) {
      const firstKey = this.fuzzyMatchCache.keys().next().value;
      this.fuzzyMatchCache.delete(firstKey);
    }

    this.fuzzyMatchCache.set(cacheKey, {
      data: result,
      expires: Date.now() + ttl
    });
  }

  /**
   * Get all available values for a field
   */
  async getFieldValues(field) {
    const cacheKey = `field_values:${field}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const classifications = await this.getData();
    let values = [];

    switch (field) {
      case 'genre':
        values = Object.keys(classifications.genres || {});
        break;
      case 'subgenre':
        values = Object.values(classifications.genres || {})
          .flatMap(genre => genre.subgenres || []);
        break;
      case 'tropes':
        values = classifications.tropes || [];
        break;
      case 'spice_level':
        values = classifications.spice_levels || [];
        break;
      default:
        values = [];
    }

    this.cache.set(cacheKey, values);
    return values;
  }

  /**
   * Batch fuzzy matching for multiple values
   */
  async batchFuzzyMatch(field, values, threshold = 0.6) {
    const results = {};
    
    for (const value of values) {
      results[value] = await this.getFuzzyMatch(field, value, threshold);
    }
    
    return results;
  }

  /**
   * Clear cache when data changes
   */
  async invalidateCache() {
    this.cache.clear();
    this.fuzzyMatchCache.clear();
    this.lastModified = null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      fuzzyMatchCacheSize: this.fuzzyMatchCache.size,
      lastModified: this.lastModified,
      hitRate: this.calculateHitRate()
    };
  }

  /**
   * Calculate cache hit rate
   */
  calculateHitRate() {
    // This would require tracking hits/misses in a real implementation
    return 0.85; // Placeholder
  }
}

// Singleton instance
const classificationCache = new ClassificationCache();

module.exports = classificationCache;