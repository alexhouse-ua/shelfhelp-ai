/**
 * Base Repository Interface
 * Defines common CRUD operations for all repository implementations
 */

class BaseRepository {
  constructor() {
    if (this.constructor === BaseRepository) {
      throw new Error('BaseRepository is an abstract class');
    }
  }

  /**
   * Find entity by ID
   * @param {string} id - Entity ID
   * @returns {Promise<Object|null>} Entity or null
   */
  async findById(id) {
    throw new Error('findById must be implemented by subclass');
  }

  /**
   * Find multiple entities by criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options (limit, offset, sort)
   * @returns {Promise<Array>} Array of entities
   */
  async findBy(criteria, options = {}) {
    throw new Error('findBy must be implemented by subclass');
  }

  /**
   * Find all entities
   * @param {Object} options - Query options (limit, offset, sort)
   * @returns {Promise<Array>} Array of all entities
   */
  async findAll(options = {}) {
    throw new Error('findAll must be implemented by subclass');
  }

  /**
   * Create new entity
   * @param {Object} data - Entity data
   * @returns {Promise<Object>} Created entity
   */
  async create(data) {
    throw new Error('create must be implemented by subclass');
  }

  /**
   * Update existing entity
   * @param {string} id - Entity ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated entity
   */
  async update(id, data) {
    throw new Error('update must be implemented by subclass');
  }

  /**
   * Delete entity
   * @param {string} id - Entity ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(id) {
    throw new Error('delete must be implemented by subclass');
  }

  /**
   * Count entities by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<number>} Count of matching entities
   */
  async count(criteria = {}) {
    throw new Error('count must be implemented by subclass');
  }

  /**
   * Check if entity exists
   * @param {string} id - Entity ID
   * @returns {Promise<boolean>} Existence status
   */
  async exists(id) {
    throw new Error('exists must be implemented by subclass');
  }

  /**
   * Batch create entities
   * @param {Array} dataArray - Array of entity data
   * @returns {Promise<Array>} Array of created entities
   */
  async createMany(dataArray) {
    throw new Error('createMany must be implemented by subclass');
  }

  /**
   * Batch update entities
   * @param {Object} criteria - Update criteria
   * @param {Object} data - Updated data
   * @returns {Promise<number>} Number of updated entities
   */
  async updateMany(criteria, data) {
    throw new Error('updateMany must be implemented by subclass');
  }

  /**
   * Batch delete entities
   * @param {Object} criteria - Delete criteria
   * @returns {Promise<number>} Number of deleted entities
   */
  async deleteMany(criteria) {
    throw new Error('deleteMany must be implemented by subclass');
  }
}

module.exports = { BaseRepository };