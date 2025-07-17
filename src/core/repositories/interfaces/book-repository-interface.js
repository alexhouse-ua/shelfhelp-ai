/**
 * Book Repository Interface
 * Defines book-specific repository operations
 */

const { BaseRepository } = require('./base-repository');

class BookRepositoryInterface extends BaseRepository {
  constructor() {
    super();
    if (this.constructor === BookRepositoryInterface) {
      throw new Error('BookRepositoryInterface is an abstract class');
    }
  }

  /**
   * Find books by status
   * @param {string} status - Book status (read, to-read, currently-reading, etc.)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books with matching status
   */
  async findByStatus(status, options = {}) {
    throw new Error('findByStatus must be implemented by subclass');
  }

  /**
   * Find books by author
   * @param {string} author - Author name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books by author
   */
  async findByAuthor(author, options = {}) {
    throw new Error('findByAuthor must be implemented by subclass');
  }

  /**
   * Find books by genre
   * @param {string} genre - Book genre
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books in genre
   */
  async findByGenre(genre, options = {}) {
    throw new Error('findByGenre must be implemented by subclass');
  }

  /**
   * Find books by series
   * @param {string} series - Series name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books in series
   */
  async findBySeries(series, options = {}) {
    throw new Error('findBySeries must be implemented by subclass');
  }

  /**
   * Find books by rating range
   * @param {number} minRating - Minimum rating
   * @param {number} maxRating - Maximum rating
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books within rating range
   */
  async findByRatingRange(minRating, maxRating, options = {}) {
    throw new Error('findByRatingRange must be implemented by subclass');
  }

  /**
   * Find books by publication year
   * @param {number} year - Publication year
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books published in year
   */
  async findByPublicationYear(year, options = {}) {
    throw new Error('findByPublicationYear must be implemented by subclass');
  }

  /**
   * Find books by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} dateField - Date field to filter by (date_added, date_read, etc.)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of books within date range
   */
  async findByDateRange(startDate, endDate, dateField, options = {}) {
    throw new Error('findByDateRange must be implemented by subclass');
  }

  /**
   * Search books by text query
   * @param {string} query - Search query
   * @param {Array} fields - Fields to search in (title, author, description, etc.)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of matching books
   */
  async searchBooks(query, fields = ['title', 'author_name', 'description'], options = {}) {
    throw new Error('searchBooks must be implemented by subclass');
  }

  /**
   * Find books by goodreads ID
   * @param {string} goodreadsId - Goodreads ID
   * @returns {Promise<Object|null>} Book or null
   */
  async findByGoodreadsId(goodreadsId) {
    throw new Error('findByGoodreadsId must be implemented by subclass');
  }

  /**
   * Find books by ISBN
   * @param {string} isbn - ISBN
   * @returns {Promise<Object|null>} Book or null
   */
  async findByISBN(isbn) {
    throw new Error('findByISBN must be implemented by subclass');
  }

  /**
   * Update book status
   * @param {string} id - Book ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated book
   */
  async updateStatus(id, status) {
    throw new Error('updateStatus must be implemented by subclass');
  }

  /**
   * Update book rating
   * @param {string} id - Book ID
   * @param {number} rating - New rating
   * @returns {Promise<Object>} Updated book
   */
  async updateRating(id, rating) {
    throw new Error('updateRating must be implemented by subclass');
  }

  /**
   * Add book to collection
   * @param {Object} bookData - Book data
   * @returns {Promise<Object>} Added book
   */
  async addToCollection(bookData) {
    throw new Error('addToCollection must be implemented by subclass');
  }

  /**
   * Remove book from collection
   * @param {string} id - Book ID
   * @returns {Promise<boolean>} Success status
   */
  async removeFromCollection(id) {
    throw new Error('removeFromCollection must be implemented by subclass');
  }

  /**
   * Get collection statistics
   * @returns {Promise<Object>} Collection statistics
   */
  async getCollectionStats() {
    throw new Error('getCollectionStats must be implemented by subclass');
  }

  /**
   * Get reading progress
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Reading progress data
   */
  async getReadingProgress(filters = {}) {
    throw new Error('getReadingProgress must be implemented by subclass');
  }

  /**
   * Get genre distribution
   * @returns {Promise<Object>} Genre distribution data
   */
  async getGenreDistribution() {
    throw new Error('getGenreDistribution must be implemented by subclass');
  }

  /**
   * Get author statistics
   * @returns {Promise<Object>} Author statistics
   */
  async getAuthorStats() {
    throw new Error('getAuthorStats must be implemented by subclass');
  }

  /**
   * Backup collection data
   * @returns {Promise<Object>} Backup data
   */
  async backupCollection() {
    throw new Error('backupCollection must be implemented by subclass');
  }

  /**
   * Restore collection data
   * @param {Object} backupData - Backup data
   * @returns {Promise<boolean>} Success status
   */
  async restoreCollection(backupData) {
    throw new Error('restoreCollection must be implemented by subclass');
  }
}

module.exports = { BookRepositoryInterface };