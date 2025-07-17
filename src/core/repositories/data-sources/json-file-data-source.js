/**
 * JSON File Data Source
 * Handles JSON file-based data storage with atomic operations
 */

const fs = require('fs').promises;
const path = require('path');
const { DataSourceInterface } = require('../interfaces/data-source-interface');
const logger = require('../../../../scripts/core/logger');

class JSONFileDataSource extends DataSourceInterface {
  constructor(filePath, options = {}) {
    super();
    this.filePath = path.resolve(filePath);
    this.options = {
      encoding: 'utf8',
      backupEnabled: true,
      backupDir: options.backupDir || path.dirname(this.filePath),
      prettyPrint: options.prettyPrint !== false,
      ...options
    };
    this.data = [];
    this.connected = false;
    this.lastModified = null;
  }

  /**
   * Initialize connection to JSON file
   */
  async connect() {
    try {
      // Check if file exists, create if not
      if (!await this.fileExists()) {
        await this.createFile();
      }

      // Read initial data
      await this.loadData();
      
      this.connected = true;
      logger.info(`JSON data source connected: ${this.filePath}`);
      return true;
    } catch (error) {
      logger.error('Failed to connect to JSON data source:', error);
      throw error;
    }
  }

  /**
   * Disconnect from data source
   */
  async disconnect() {
    this.connected = false;
    this.data = [];
    this.lastModified = null;
    logger.info('JSON data source disconnected');
    return true;
  }

  /**
   * Read data from JSON file
   */
  async read() {
    if (!this.connected) {
      throw new Error('Data source not connected');
    }

    // Reload if file has been modified
    if (await this.hasFileChanged()) {
      await this.loadData();
    }

    return [...this.data];
  }

  /**
   * Write data to JSON file
   */
  async write(data) {
    if (!this.connected) {
      throw new Error('Data source not connected');
    }

    try {
      // Create backup if enabled
      if (this.options.backupEnabled) {
        await this.createBackup();
      }

      // Write data atomically
      const jsonData = this.options.prettyPrint ? 
        JSON.stringify(data, null, 2) : 
        JSON.stringify(data);

      const tempFile = `${this.filePath}.tmp`;
      await fs.writeFile(tempFile, jsonData, this.options.encoding);
      await fs.rename(tempFile, this.filePath);

      // Update internal state
      this.data = [...data];
      this.lastModified = new Date();

      logger.info(`Data written to ${this.filePath}, ${data.length} items`);
      return true;
    } catch (error) {
      logger.error('Failed to write data:', error);
      throw error;
    }
  }

  /**
   * Append item to data
   */
  async append(item) {
    const data = await this.read();
    data.push(item);
    return await this.write(data);
  }

  /**
   * Update item in data
   */
  async update(id, updateData) {
    const data = await this.read();
    const index = data.findIndex(item => item.id === id || item.guid === id);
    
    if (index === -1) {
      throw new Error(`Item with id ${id} not found`);
    }

    data[index] = { ...data[index], ...updateData };
    await this.write(data);
    
    return true;
  }

  /**
   * Delete item from data
   */
  async delete(id) {
    const data = await this.read();
    const initialLength = data.length;
    const filteredData = data.filter(item => item.id !== id && item.guid !== id);
    
    if (filteredData.length === initialLength) {
      throw new Error(`Item with id ${id} not found`);
    }

    await this.write(filteredData);
    return true;
  }

  /**
   * Check if data source is available
   */
  async isAvailable() {
    try {
      await fs.access(this.filePath, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get data source health status
   */
  async getHealth() {
    try {
      const stats = await fs.stat(this.filePath);
      const data = await this.read();
      
      return {
        status: 'healthy',
        connected: this.connected,
        filePath: this.filePath,
        fileSize: stats.size,
        lastModified: stats.mtime,
        itemCount: data.length,
        readable: await this.isAvailable(),
        writable: await this.isWritable()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: this.connected,
        filePath: this.filePath
      };
    }
  }

  /**
   * Create backup of data
   */
  async backup() {
    const data = await this.read();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      this.options.backupDir,
      `${path.basename(this.filePath, '.json')}_backup_${timestamp}.json`
    );

    await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
    
    return {
      backupPath,
      timestamp,
      itemCount: data.length,
      data: data
    };
  }

  /**
   * Restore data from backup
   */
  async restore(backupData) {
    if (!backupData.data || !Array.isArray(backupData.data)) {
      throw new Error('Invalid backup data format');
    }

    await this.write(backupData.data);
    logger.info(`Data restored from backup: ${backupData.itemCount} items`);
    
    return true;
  }

  /**
   * Get data source statistics
   */
  async getStats() {
    const data = await this.read();
    const stats = await fs.stat(this.filePath);
    
    return {
      itemCount: data.length,
      fileSize: stats.size,
      filePath: this.filePath,
      lastModified: stats.mtime,
      connected: this.connected,
      encoding: this.options.encoding
    };
  }

  /**
   * Validate data integrity
   */
  async validateIntegrity() {
    const results = {
      valid: true,
      errors: [],
      warnings: []
    };

    try {
      // Check file exists and is readable
      if (!await this.fileExists()) {
        results.valid = false;
        results.errors.push('Data file does not exist');
        return results;
      }

      // Check if file is valid JSON
      const rawData = await fs.readFile(this.filePath, this.options.encoding);
      let data;
      
      try {
        data = JSON.parse(rawData);
      } catch (error) {
        results.valid = false;
        results.errors.push(`Invalid JSON format: ${error.message}`);
        return results;
      }

      // Check if data is array
      if (!Array.isArray(data)) {
        results.valid = false;
        results.errors.push('Data is not an array');
        return results;
      }

      // Check for duplicate IDs
      const ids = new Set();
      const duplicates = [];
      
      data.forEach((item, index) => {
        const id = item.id || item.guid;
        if (id) {
          if (ids.has(id)) {
            duplicates.push({ id, index });
          } else {
            ids.add(id);
          }
        } else {
          results.warnings.push(`Item at index ${index} has no ID`);
        }
      });

      if (duplicates.length > 0) {
        results.warnings.push(`Found ${duplicates.length} duplicate IDs`);
      }

      results.itemCount = data.length;
      results.uniqueIds = ids.size;
      
    } catch (error) {
      results.valid = false;
      results.errors.push(`Integrity check failed: ${error.message}`);
    }

    return results;
  }

  // Private helper methods

  /**
   * Check if file exists
   */
  async fileExists() {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create empty JSON file
   */
  async createFile() {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, '[]', this.options.encoding);
    logger.info(`Created new JSON file: ${this.filePath}`);
  }

  /**
   * Load data from file
   */
  async loadData() {
    const rawData = await fs.readFile(this.filePath, this.options.encoding);
    this.data = JSON.parse(rawData);
    
    const stats = await fs.stat(this.filePath);
    this.lastModified = stats.mtime;
  }

  /**
   * Check if file has been modified
   */
  async hasFileChanged() {
    if (!this.lastModified) {return true;}
    
    try {
      const stats = await fs.stat(this.filePath);
      return stats.mtime > this.lastModified;
    } catch {
      return true;
    }
  }

  /**
   * Check if file is writable
   */
  async isWritable() {
    try {
      await fs.access(this.filePath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create backup with timestamp
   */
  async createBackup() {
    if (!this.options.backupEnabled) {return;}
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(
        this.options.backupDir,
        `${path.basename(this.filePath, '.json')}_${timestamp}.json`
      );
      
      await fs.copyFile(this.filePath, backupPath);
      logger.debug(`Backup created: ${backupPath}`);
    } catch (error) {
      logger.warn('Failed to create backup:', error);
    }
  }
}

module.exports = { JSONFileDataSource };