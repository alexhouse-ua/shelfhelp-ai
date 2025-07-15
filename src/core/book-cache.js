/**
 * Enhanced Book Cache System
 * Provides optimized memory caching, indexed lookups, and query optimization
 * for the ShelfHelp AI book management system.
 */

const fs = require('fs').promises;
const path = require('path');

class EnhancedBookCache {
  constructor() {
    this.cache = new Map();
    this.indexes = new Map();
    this.lastModified = null;
    this.dataPath = path.join(__dirname, '../../data/books.json');
    this.queryCache = new Map();
    this.maxCacheSize = 1000;
  }

  /**
   * Initialize all lookup indexes for O(1) access
   */
  async initializeIndexes() {
    const books = await this.getData();
    
    // Clear existing indexes
    this.indexes.clear();
    
    // Create lookup indexes for O(1) access
    this.indexes.set('goodreads_id', new Map());
    this.indexes.set('guid', new Map());
    this.indexes.set('status', new Map());
    this.indexes.set('genre', new Map());
    this.indexes.set('author', new Map());
    
    books.forEach(book => {
      // ID indexes
      if (book.goodreads_id) {
        this.indexes.get('goodreads_id').set(book.goodreads_id, book);
      }
      if (book.guid) {
        this.indexes.get('guid').set(book.guid, book);
      }
      
      // Status index for quick filtering
      if (!this.indexes.get('status').has(book.status)) {
        this.indexes.get('status').set(book.status, []);
      }
      this.indexes.get('status').get(book.status).push(book);
      
      // Genre index
      if (book.genre) {
        if (!this.indexes.get('genre').has(book.genre)) {
          this.indexes.get('genre').set(book.genre, []);
        }
        this.indexes.get('genre').get(book.genre).push(book);
      }
      
      // Author index
      if (book.author) {
        if (!this.indexes.get('author').has(book.author)) {
          this.indexes.get('author').set(book.author, []);
        }
        this.indexes.get('author').get(book.author).push(book);
      }
    });
  }

  /**
   * Get all books data with caching
   */
  async getData() {
    try {
      const stats = await fs.stat(this.dataPath);
      const fileModified = stats.mtime;
      
      // Check if cache is still valid
      if (this.cache.has('books') && this.lastModified >= fileModified) {
        return this.cache.get('books');
      }
      
      // Load fresh data
      const data = await fs.readFile(this.dataPath, 'utf8');
      const books = JSON.parse(data);
      
      // Update cache
      this.cache.set('books', books);
      this.lastModified = fileModified;
      
      return books;
    } catch (error) {
      console.error('Error loading books data:', error);
      return [];
    }
  }

  /**
   * Find book by ID (goodreads_id or guid) - O(1) lookup
   */
  findById(id) {
    return this.indexes.get('goodreads_id').get(id) || 
           this.indexes.get('guid').get(id);
  }

  /**
   * Get books by status - O(1) lookup
   */
  getByStatus(status) {
    return this.indexes.get('status').get(status) || [];
  }

  /**
   * Get books by genre - O(1) lookup
   */
  getByGenre(genre) {
    return this.indexes.get('genre').get(genre) || [];
  }

  /**
   * Get books by author - O(1) lookup
   */
  getByAuthor(author) {
    return this.indexes.get('author').get(author) || [];
  }

  /**
   * Get TBR books with queue position calculation
   */
  getTbrBooksWithPositions() {
    const cacheKey = 'tbr_with_positions';
    const cached = this.getCachedQuery(cacheKey);
    
    if (cached) {
      return cached;
    }

    const tbrBooks = this.getByStatus('TBR');
    const booksWithPositions = tbrBooks.map((book, index) => ({
      ...book,
      queue_position: index + 1
    }));

    this.setCachedQuery(cacheKey, booksWithPositions, 300000); // 5 min cache
    return booksWithPositions;
  }

  /**
   * Query cache management
   */
  getCachedQuery(queryKey) {
    const cached = this.queryCache.get(queryKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    return null;
  }

  setCachedQuery(queryKey, result, ttl = 300000) { // 5 min default TTL
    // Implement LRU cache
    if (this.queryCache.size >= this.maxCacheSize) {
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }

    this.queryCache.set(queryKey, {
      data: result,
      expires: Date.now() + ttl
    });
  }

  /**
   * Advanced filtering with caching
   */
  async filterBooks(filters = {}) {
    const cacheKey = `filter:${JSON.stringify(filters)}`;
    const cached = this.getCachedQuery(cacheKey);
    
    if (cached) {
      return cached;
    }

    let books = await this.getData();

    // Apply filters efficiently using indexes where possible
    if (filters.status) {
      books = this.getByStatus(filters.status);
    }
    if (filters.genre) {
      books = books.filter(book => book.genre === filters.genre);
    }
    if (filters.author) {
      books = books.filter(book => book.author === filters.author);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      books = books.filter(book => 
        book.title?.toLowerCase().includes(searchLower) ||
        book.author?.toLowerCase().includes(searchLower) ||
        book.series?.toLowerCase().includes(searchLower)
      );
    }

    this.setCachedQuery(cacheKey, books, 180000); // 3 min cache
    return books;
  }

  /**
   * Paginated query with caching
   */
  async getPaginatedBooks(page = 1, limit = 20, filters = {}) {
    const cacheKey = `paginated:${page}:${limit}:${JSON.stringify(filters)}`;
    const cached = this.getCachedQuery(cacheKey);
    
    if (cached) {
      return cached;
    }

    const filteredBooks = await this.filterBooks(filters);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    const result = {
      data: filteredBooks.slice(startIndex, endIndex),
      pagination: {
        page,
        limit,
        totalItems: filteredBooks.length,
        totalPages: Math.ceil(filteredBooks.length / limit),
        hasNext: endIndex < filteredBooks.length,
        hasPrev: page > 1
      }
    };

    this.setCachedQuery(cacheKey, result, 180000); // 3 min cache
    return result;
  }

  /**
   * Clear cache when data changes
   */
  async invalidateCache() {
    this.cache.clear();
    this.queryCache.clear();
    this.lastModified = null;
    await this.initializeIndexes();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      queryCacheSize: this.queryCache.size,
      lastModified: this.lastModified,
      indexSizes: {
        goodreads_id: this.indexes.get('goodreads_id')?.size || 0,
        guid: this.indexes.get('guid')?.size || 0,
        status: this.indexes.get('status')?.size || 0,
        genre: this.indexes.get('genre')?.size || 0,
        author: this.indexes.get('author')?.size || 0
      }
    };
  }
}

// Singleton instance
const bookCache = new EnhancedBookCache();

module.exports = bookCache;