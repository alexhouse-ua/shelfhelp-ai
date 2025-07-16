/**
 * Configuration Manager
 * Centralized configuration management for availability services
 */
class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.loadDefaultConfigs();
  }

  /**
   * Load default service configurations
   */
  loadDefaultConfigs() {
    // Kindle Unlimited configuration
    this.configs.set('kindle_unlimited', {
      name: 'Kindle Unlimited',
      enabled: true,
      timeout: 15000,
      retryCount: 3,
      retryDelay: 1000,
      search_url: 'https://www.amazon.com/s',
      search_params: 'i=digital-text&rh=n%3A133140011'
    });

    // Hoopla configuration
    this.configs.set('hoopla', {
      name: 'Hoopla Digital',
      enabled: true,
      timeout: 10000,
      retryCount: 3,
      retryDelay: 1000,
      search_url: 'https://www.hoopladigital.com/search',
      search_params: 'type=ebooks,audiobooks'
    });

    // Library system configurations
    this.configs.set('tuscaloosa_public', {
      name: 'Tuscaloosa Public Library',
      enabled: false,
      timeout: 15000,
      retryCount: 3,
      retryDelay: 1000,
      overdrive_id: process.env.TUSCALOOSA_OVERDRIVE_ID || null,
      libby_catalog_url: 'https://tuscaloosa.overdrive.com'
    });

    this.configs.set('camellia_net', {
      name: 'Camellia Net',
      enabled: false,
      timeout: 15000,
      retryCount: 3,
      retryDelay: 1000,
      overdrive_id: process.env.CAMELLIA_OVERDRIVE_ID || null,
      libby_catalog_url: 'https://camellia.overdrive.com'
    });

    this.configs.set('seattle_public', {
      name: 'Seattle Public Library',
      enabled: false,
      timeout: 15000,
      retryCount: 3,
      retryDelay: 1000,
      overdrive_id: process.env.SEATTLE_OVERDRIVE_ID || null,
      libby_catalog_url: 'https://seattle.overdrive.com'
    });

    // WorldCat configuration
    this.configs.set('worldcat', {
      name: 'WorldCat',
      enabled: true,
      timeout: 15000,
      retryCount: 3,
      retryDelay: 1000,
      search_url: 'http://www.worldcat.org/webservices/catalog/search/opensearch'
    });
  }

  /**
   * Get configuration for a service
   * @param {string} key - Service key
   * @returns {Object|null} Configuration object or null
   */
  getConfig(key) {
    return this.configs.get(key) || null;
  }

  /**
   * Set configuration for a service
   * @param {string} key - Service key
   * @param {Object} config - Configuration object
   */
  setConfig(key, config) {
    this.configs.set(key, { ...this.configs.get(key), ...config });
  }

  /**
   * Update specific configuration property
   * @param {string} key - Service key
   * @param {string} property - Property name
   * @param {*} value - Property value
   */
  updateConfig(key, property, value) {
    const config = this.configs.get(key);
    if (config) {
      config[property] = value;
      this.configs.set(key, config);
    }
  }

  /**
   * Get all configurations
   * @returns {Map} All configurations
   */
  getAllConfigs() {
    return new Map(this.configs);
  }

  /**
   * Enable a service
   * @param {string} key - Service key
   */
  enableService(key) {
    this.updateConfig(key, 'enabled', true);
  }

  /**
   * Disable a service
   * @param {string} key - Service key
   */
  disableService(key) {
    this.updateConfig(key, 'enabled', false);
  }

  /**
   * Check if service is enabled
   * @param {string} key - Service key
   * @returns {boolean} True if enabled
   */
  isEnabled(key) {
    const config = this.configs.get(key);
    return config ? config.enabled : false;
  }

  /**
   * Get enabled service keys
   * @returns {Array} Array of enabled service keys
   */
  getEnabledServices() {
    return Array.from(this.configs.keys()).filter(key => this.isEnabled(key));
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnvironment() {
    // Library system environment variables
    const libraries = ['tuscaloosa_public', 'camellia_net', 'seattle_public'];
    
    libraries.forEach(library => {
      const envKey = library.toUpperCase() + '_OVERDRIVE_ID';
      const overdriveId = process.env[envKey];
      
      if (overdriveId) {
        this.updateConfig(library, 'overdrive_id', overdriveId);
        this.updateConfig(library, 'enabled', true);
      }
    });
  }

  /**
   * Validate configuration
   * @param {string} key - Service key
   * @returns {Object} Validation result
   */
  validateConfig(key) {
    const config = this.configs.get(key);
    if (!config) {
      return { valid: false, errors: ['Configuration not found'] };
    }

    const errors = [];
    
    // Basic validation
    if (!config.name) {errors.push('Service name is required');}
    if (!config.timeout || config.timeout <= 0) {errors.push('Valid timeout is required');}
    if (!config.retryCount || config.retryCount < 0) {errors.push('Valid retry count is required');}
    
    // Service-specific validation
    if (key.includes('library') && config.enabled) {
      if (!config.libby_catalog_url) {errors.push('Library catalog URL is required');}
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration summary
   * @returns {Object} Configuration summary
   */
  getSummary() {
    const total = this.configs.size;
    const enabled = this.getEnabledServices().length;
    const disabled = total - enabled;
    
    const services = Array.from(this.configs.entries()).map(([key, config]) => ({
      key,
      name: config.name,
      enabled: config.enabled,
      configured: this.validateConfig(key).valid
    }));
    
    return {
      total,
      enabled,
      disabled,
      services
    };
  }
}

module.exports = { ConfigManager };