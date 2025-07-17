/**
 * Book Repository Implementation
 * Concrete implementation of BookRepositoryInterface using JSON file storage
 */

const { BookRepositoryInterface } = require('./interfaces/book-repository-interface');
const { JSONFileDataSource } = require('./data-sources/json-file-data-source');
const logger = require('../../../scripts/core/logger');
const path = require('path');

class BookRepository extends BookRepositoryInterface {
  constructor(dataSource = null, options = {}) {
    super();
    
    // Initialize data source
    if (dataSource) {
      this.dataSource = dataSource;
    } else {
      const defaultPath = path.join(process.cwd(), 'data', 'books.json');
      this.dataSource = new JSONFileDataSource(defaultPath, options);
    }
    
    this.options = {
      cacheEnabled: options.cacheEnabled !== false,
      cacheTimeout: options.cacheTimeout || 60000, // 1 minute
      ...options
    };
    
    this.cache = new Map();
    this.lastCacheUpdate = null;
    this.initialized = false;
  }

  /**
   * Initialize repository
   */
  async initialize() {
    if (this.initialized) {return;}
    
    await this.dataSource.connect();
    this.initialized = true;
    logger.info('BookRepository initialized');
  }

  /**
   * Ensure repository is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get all books with caching
   */
  async getAllBooks() {
    await this.ensureInitialized();
    
    if (this.options.cacheEnabled && this.isCacheValid()) {
      return this.cache.get('allBooks') || [];
    }
    
    const books = await this.dataSource.read();
    
    if (this.options.cacheEnabled) {
      this.cache.set('allBooks', books);
      this.lastCacheUpdate = Date.now();
    }
    
    return books;
  }

  /**
   * Invalidate cache
   */
  invalidateCache() {
    this.cache.clear();
    this.lastCacheUpdate = null;
  }

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    return this.lastCacheUpdate && 
           (Date.now() - this.lastCacheUpdate) < this.options.cacheTimeout;
  }

  // BaseRepository implementation

  /**
   * Find book by ID
   */
  async findById(id) {
    const books = await this.getAllBooks();
    return books.find(book => book.id === id || book.guid === id) || null;
  }

  /**
   * Find books by criteria
   */
  async findBy(criteria, options = {}) {
    const books = await this.getAllBooks();
    let filteredBooks = books;

    // Apply criteria filters
    Object.entries(criteria).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        filteredBooks = filteredBooks.filter(book => {
          // For exact match fields, use strict equality
          if (['status', 'genre', 'series', 'isbn', 'goodreads_id', 'book_published'].includes(key)) {
            return book[key] === value;
          }
          // For text fields, use case-insensitive partial matching
          if (typeof value === 'string') {
            return book[key]?.toLowerCase().includes(value.toLowerCase());
          }
          return book[key] === value;
        });
      }
    });

    return this.applyOptions(filteredBooks, options);
  }

  /**
   * Find all books
   */
  async findAll(options = {}) {
    const books = await this.getAllBooks();
    return this.applyOptions(books, options);
  }

  /**
   * Create new book
   */
  async create(data) {
    await this.ensureInitialized();
    
    const book = {
      ...data,
      id: data.id || data.guid || this.generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.dataSource.append(book);
    this.invalidateCache();
    
    logger.info(`Book created: ${book.title} (${book.id})`);
    return book;
  }

  /**
   * Update existing book
   */
  async update(id, data) {
    await this.ensureInitialized();
    
    const updateData = {
      ...data,
      updated_at: new Date().toISOString()
    };

    await this.dataSource.update(id, updateData);
    this.invalidateCache();
    
    const updatedBook = await this.findById(id);
    logger.info(`Book updated: ${updatedBook?.title} (${id})`);
    
    return updatedBook;
  }

  /**
   * Delete book
   */
  async delete(id) {
    await this.ensureInitialized();
    
    const book = await this.findById(id);
    if (!book) {
      throw new Error(`Book with id ${id} not found`);
    }

    await this.dataSource.delete(id);
    this.invalidateCache();
    
    logger.info(`Book deleted: ${book.title} (${id})`);
    return true;
  }

  /**
   * Count books by criteria
   */
  async count(criteria = {}) {
    const books = await this.findBy(criteria);
    return books.length;
  }

  /**
   * Check if book exists
   */
  async exists(id) {
    const book = await this.findById(id);
    return book !== null;
  }

  /**
   * Create multiple books
   */
  async createMany(dataArray) {
    await this.ensureInitialized();
    
    const books = dataArray.map(data => ({
      ...data,
      id: data.id || data.guid || this.generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const allBooks = await this.getAllBooks();
    const updatedBooks = [...allBooks, ...books];
    
    await this.dataSource.write(updatedBooks);
    this.invalidateCache();
    
    logger.info(`${books.length} books created`);
    return books;
  }

  /**
   * Update multiple books
   */
  async updateMany(criteria, updateData) {
    const books = await this.findBy(criteria);
    let updatedCount = 0;

    for (const book of books) {
      await this.update(book.id || book.guid, updateData);
      updatedCount++;
    }

    logger.info(`${updatedCount} books updated`);
    return updatedCount;
  }

  /**
   * Delete multiple books
   */
  async deleteMany(criteria) {
    const books = await this.findBy(criteria);
    let deletedCount = 0;

    for (const book of books) {
      await this.delete(book.id || book.guid);
      deletedCount++;
    }

    logger.info(`${deletedCount} books deleted`);
    return deletedCount;
  }

  // BookRepositoryInterface implementation

  /**
   * Find books by status
   */
  async findByStatus(status, options = {}) {
    return await this.findBy({ status }, options);
  }

  /**
   * Find books by author
   */
  async findByAuthor(author, options = {}) {
    return await this.findBy({ author_name: author }, options);
  }

  /**
   * Find books by genre
   */
  async findByGenre(genre, options = {}) {
    return await this.findBy({ genre }, options);
  }

  /**
   * Find books by series
   */
  async findBySeries(series, options = {}) {
    return await this.findBy({ series }, options);
  }

  /**
   * Find books by rating range
   */
  async findByRatingRange(minRating, maxRating, options = {}) {
    const books = await this.getAllBooks();
    const filteredBooks = books.filter(book => {
      const rating = book.user_rating || book.average_rating;
      return rating >= minRating && rating <= maxRating;
    });
    
    return this.applyOptions(filteredBooks, options);
  }

  /**
   * Find books by publication year
   */
  async findByPublicationYear(year, options = {}) {
    return await this.findBy({ book_published: year }, options);
  }

  /**
   * Find books by date range
   */
  async findByDateRange(startDate, endDate, dateField, options = {}) {
    const books = await this.getAllBooks();
    const filteredBooks = books.filter(book => {
      const date = new Date(book[dateField]);
      return date >= startDate && date <= endDate;
    });
    
    return this.applyOptions(filteredBooks, options);
  }

  /**
   * Search books by text query
   */
  async searchBooks(query, fields = ['title', 'author_name', 'book_description'], options = {}) {
    const books = await this.getAllBooks();
    const searchTerm = query.toLowerCase();
    
    const filteredBooks = books.filter(book => {
      return fields.some(field => {
        const value = book[field];
        return value && value.toLowerCase().includes(searchTerm);
      });
    });
    
    return this.applyOptions(filteredBooks, options);
  }

  /**
   * Find book by Goodreads ID
   */
  async findByGoodreadsId(goodreadsId) {
    return await this.findBy({ goodreads_id: goodreadsId });
  }

  /**
   * Find book by ISBN
   */
  async findByISBN(isbn) {
    const books = await this.getAllBooks();
    return books.find(book => book.isbn === isbn) || null;
  }

  /**
   * Update book status
   */
  async updateStatus(id, status) {
    const updateData = { 
      status,
      user_read_at: status === 'read' ? new Date().toISOString() : undefined
    };
    
    return await this.update(id, updateData);
  }

  /**
   * Update book rating
   */
  async updateRating(id, rating) {
    return await this.update(id, { user_rating: rating });
  }

  /**
   * Add book to collection
   */
  async addToCollection(bookData) {
    const book = {
      ...bookData,
      status: bookData.status || 'to-read',
      user_date_added: new Date().toISOString()
    };
    
    return await this.create(book);
  }

  /**
   * Remove book from collection
   */
  async removeFromCollection(id) {
    return await this.delete(id);
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats() {
    const books = await this.getAllBooks();
    
    const stats = {
      total: books.length,
      byStatus: {},
      byGenre: {},
      byYear: {},
      averageRating: 0,
      totalPages: 0
    };

    books.forEach(book => {
      // Status distribution
      stats.byStatus[book.status] = (stats.byStatus[book.status] || 0) + 1;
      
      // Genre distribution
      if (book.genre) {
        stats.byGenre[book.genre] = (stats.byGenre[book.genre] || 0) + 1;
      }
      
      // Year distribution
      if (book.book_published) {
        stats.byYear[book.book_published] = (stats.byYear[book.book_published] || 0) + 1;
      }
      
      // Average rating calculation
      if (book.user_rating) {
        stats.averageRating += book.user_rating;
      }
      
      // Total pages
      if (book.pages) {
        stats.totalPages += book.pages;
      }
    });

    // Calculate average rating
    const ratedBooks = books.filter(book => book.user_rating);
    stats.averageRating = ratedBooks.length > 0 ? 
      stats.averageRating / ratedBooks.length : 0;

    return stats;
  }

  /**
   * Get reading progress
   */
  async getReadingProgress(filters = {}) {
    const books = await this.findBy(filters);
    const currentYear = new Date().getFullYear();
    
    const readBooks = books.filter(book => book.status === 'read');
    const readThisYear = readBooks.filter(book => {
      const readDate = new Date(book.user_read_at);
      return readDate.getFullYear() === currentYear;
    });

    return {
      totalRead: readBooks.length,
      readThisYear: readThisYear.length,
      currentlyReading: books.filter(book => book.status === 'currently-reading').length,
      toRead: books.filter(book => book.status === 'to-read').length,
      monthlyProgress: this.calculateMonthlyProgress(readBooks)
    };
  }

  /**
   * Get genre distribution
   */
  async getGenreDistribution() {
    const books = await this.getAllBooks();
    const distribution = {};
    
    books.forEach(book => {
      if (book.genre) {
        distribution[book.genre] = (distribution[book.genre] || 0) + 1;
      }
    });
    
    return distribution;
  }

  /**
   * Get author statistics
   */
  async getAuthorStats() {
    const books = await this.getAllBooks();
    const authors = {};
    
    books.forEach(book => {
      if (book.author_name) {
        if (!authors[book.author_name]) {
          authors[book.author_name] = {
            name: book.author_name,
            bookCount: 0,
            averageRating: 0,
            totalRating: 0,
            ratedBooks: 0
          };
        }
        
        authors[book.author_name].bookCount++;
        
        if (book.user_rating) {
          authors[book.author_name].totalRating += book.user_rating;
          authors[book.author_name].ratedBooks++;
          authors[book.author_name].averageRating = 
            authors[book.author_name].totalRating / authors[book.author_name].ratedBooks;
        }
      }
    });
    
    return Object.values(authors);
  }

  /**
   * Backup collection
   */
  async backupCollection() {
    await this.ensureInitialized();
    return await this.dataSource.backup();
  }

  /**
   * Restore collection
   */
  async restoreCollection(backupData) {
    await this.ensureInitialized();
    const result = await this.dataSource.restore(backupData);
    this.invalidateCache();
    return result;
  }

  // Private helper methods

  /**
   * Apply query options (limit, offset, sort)
   */
  applyOptions(books, options) {
    let result = [...books];

    // Apply sorting
    if (options.sort) {
      const [field, direction = 'asc'] = options.sort.split(':');
      result.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        
        if (aVal < bVal) {return direction === 'asc' ? -1 : 1;}
        if (aVal > bVal) {return direction === 'asc' ? 1 : -1;}
        return 0;
      });
    }

    // Apply offset
    if (options.offset) {
      result = result.slice(options.offset);
    }

    // Apply limit
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate monthly reading progress
   */
  calculateMonthlyProgress(readBooks) {
    const currentYear = new Date().getFullYear();
    const months = {};
    
    readBooks.forEach(book => {
      if (book.user_read_at) {
        const date = new Date(book.user_read_at);
        if (date.getFullYear() === currentYear) {
          const month = date.getMonth();
          months[month] = (months[month] || 0) + 1;
        }
      }
    });
    
    return months;
  }

  /**
   * Get data source health
   */
  async getHealth() {
    await this.ensureInitialized();
    const sourceHealth = await this.dataSource.getHealth();
    
    return {
      ...sourceHealth,
      repository: {
        initialized: this.initialized,
        cacheEnabled: this.options.cacheEnabled,
        cacheValid: this.isCacheValid(),
        lastCacheUpdate: this.lastCacheUpdate
      }
    };
  }

  /**
   * Validate repository integrity
   */
  async validateIntegrity() {
    await this.ensureInitialized();
    const sourceIntegrity = await this.dataSource.validateIntegrity();
    
    // Additional book-specific validation
    const books = await this.getAllBooks();
    const bookValidation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check for required fields
    books.forEach((book, index) => {
      if (!book.title && !book.book_title) {
        bookValidation.warnings.push(`Book at index ${index} has no title`);
      }
      
      if (!book.author_name) {
        bookValidation.warnings.push(`Book at index ${index} has no author`);
      }
    });

    return {
      dataSource: sourceIntegrity,
      books: bookValidation,
      overall: sourceIntegrity.valid && bookValidation.valid
    };
  }
}

module.exports = { BookRepository };