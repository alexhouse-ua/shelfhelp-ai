/**
 * Data Source Interface
 * Defines common data source operations for different storage backends
 */

class DataSourceInterface {
  constructor() {
    if (this.constructor === DataSourceInterface) {
      throw new Error('DataSourceInterface is an abstract class');
    }
  }

  /**
   * Initialize data source connection
   * @returns {Promise<boolean>} Success status
   */
  async connect() {
    throw new Error('connect must be implemented by subclass');
  }

  /**
   * Close data source connection
   * @returns {Promise<boolean>} Success status
   */
  async disconnect() {
    throw new Error('disconnect must be implemented by subclass');
  }

  /**
   * Read data from source
   * @returns {Promise<Array>} Data array
   */
  async read() {
    throw new Error('read must be implemented by subclass');
  }

  /**
   * Write data to source
   * @param {Array} data - Data to write
   * @returns {Promise<boolean>} Success status
   */
  async write(data) {
    throw new Error('write must be implemented by subclass');
  }

  /**
   * Append data to source
   * @param {Object} item - Item to append
   * @returns {Promise<boolean>} Success status
   */
  async append(item) {
    throw new Error('append must be implemented by subclass');
  }

  /**
   * Update data in source
   * @param {string} id - Item ID
   * @param {Object} data - Updated data
   * @returns {Promise<boolean>} Success status
   */
  async update(id, data) {
    throw new Error('update must be implemented by subclass');
  }

  /**
   * Delete data from source
   * @param {string} id - Item ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(id) {
    throw new Error('delete must be implemented by subclass');
  }

  /**
   * Check if data source is available
   * @returns {Promise<boolean>} Availability status
   */
  async isAvailable() {
    throw new Error('isAvailable must be implemented by subclass');
  }

  /**
   * Get data source health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    throw new Error('getHealth must be implemented by subclass');
  }

  /**
   * Create backup of data source
   * @returns {Promise<Object>} Backup data
   */
  async backup() {
    throw new Error('backup must be implemented by subclass');
  }

  /**
   * Restore data source from backup
   * @param {Object} backupData - Backup data
   * @returns {Promise<boolean>} Success status
   */
  async restore(backupData) {
    throw new Error('restore must be implemented by subclass');
  }

  /**
   * Get data source statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    throw new Error('getStats must be implemented by subclass');
  }

  /**
   * Validate data integrity
   * @returns {Promise<Object>} Validation results
   */
  async validateIntegrity() {
    throw new Error('validateIntegrity must be implemented by subclass');
  }
}

module.exports = { DataSourceInterface };