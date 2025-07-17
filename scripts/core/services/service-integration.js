/**
 * Service Integration Layer
 * Integrates all availability services with ServiceRegistry
 * Provides dependency injection and service coordination
 */

const { ServiceRegistry } = require('./service-registry');
const { ConfigManager } = require('./config-manager');
const AvailabilityConfig = require('../../../src/core/availability-config');
const { KindleUnlimitedService } = require('./kindle-unlimited-service');
const { HooplaService } = require('./hoopla-service');
const { LibraryService } = require('./library-service');
const logger = require('../logger');

class ServiceIntegration {
  constructor() {
    this.registry = new ServiceRegistry();
    this.configManager = new ConfigManager();
    this.availabilityConfig = new AvailabilityConfig();
    this.initialized = false;
  }

  /**
   * Initialize all services with dependency injection
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    try {
      // Initialize configuration first
      await this.availabilityConfig.initialize();
      
      // Register base dependencies with wrapper to provide isEnabled method
      this.registry.register('config-manager', {
        ...this.configManager,
        // Service interface methods
        isEnabled: () => true,
        getStats: () => ({ service: 'config-manager', enabled: true }),
        resetStats: () => {},
        // Expose original methods with different names to avoid conflicts
        getConfig: this.configManager.getConfig.bind(this.configManager),
        setConfig: this.configManager.setConfig.bind(this.configManager),
        updateConfig: this.configManager.updateConfig.bind(this.configManager),
        getAllConfigs: this.configManager.getAllConfigs.bind(this.configManager),
        enableService: this.configManager.enableService.bind(this.configManager),
        disableService: this.configManager.disableService.bind(this.configManager),
        isServiceEnabled: this.configManager.isEnabled.bind(this.configManager),
        getEnabledServices: this.configManager.getEnabledServices.bind(this.configManager),
        validateConfig: this.configManager.validateConfig.bind(this.configManager),
        getSummary: this.configManager.getSummary.bind(this.configManager)
      });
      this.registry.register('availability-config', {
        ...this.availabilityConfig,
        isEnabled: () => true,
        getStats: () => ({ service: 'availability-config', enabled: true }),
        resetStats: () => {}
      });
      this.registry.register('logger', {
        ...logger,
        isEnabled: () => true,
        getStats: () => ({ service: 'logger', enabled: true }),
        resetStats: () => {}
      });
      
      // Register service factories
      await this.registerServiceFactories();
      
      // Discover and register additional services
      await this.registry.discoverServices();
      
      // Initialize all services
      await this.initializeServices();
      
      this.initialized = true;
      logger.info('Service integration initialized successfully');
      
      return {
        success: true,
        registeredServices: this.registry.getSummary(),
        discoveredServices: (await this.registry.discoverServices()).discovered
      };
      
    } catch (error) {
      logger.error('Service integration initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register service factories with dependency injection
   */
  async registerServiceFactories() {
    // Kindle Unlimited Service Factory
    this.registry.registerFactory(
      'kindle-unlimited',
      (config) => new KindleUnlimitedService(config),
      this.configManager.getConfig('kindle_unlimited'),
      {
        name: 'Kindle Unlimited Service',
        version: '1.0.0',
        capabilities: ['availability-check', 'book-search', 'web-scraping'],
        dependencies: ['config-manager', 'logger'],
        type: 'availability-service',
        tags: ['kindle', 'amazon', 'unlimited', 'ebooks']
      }
    );

    // Hoopla Service Factory
    this.registry.registerFactory(
      'hoopla',
      (config) => new HooplaService(config),
      this.configManager.getConfig('hoopla'),
      {
        name: 'Hoopla Digital Service',
        version: '1.0.0',
        capabilities: ['availability-check', 'book-search', 'multi-format'],
        dependencies: ['config-manager', 'logger'],
        type: 'availability-service',
        tags: ['hoopla', 'digital', 'library', 'ebooks', 'audiobooks']
      }
    );

    // Library Services Factory (multiple instances)
    const libraryConfigs = [
      'tuscaloosa_public',
      'camellia_net',
      'seattle_public'
    ];

    for (const libraryKey of libraryConfigs) {
      const libraryConfig = this.configManager.getConfig(libraryKey);
      if (libraryConfig) {
        this.registry.registerFactory(
          libraryKey,
          (config) => new LibraryService(libraryKey, config),
          libraryConfig,
          {
            name: libraryConfig.name || `Library Service (${libraryKey})`,
            version: '1.0.0',
            capabilities: ['availability-check', 'book-search', 'overdrive-integration'],
            dependencies: ['config-manager', 'logger'],
            type: 'availability-service',
            tags: ['library', 'overdrive', 'libby', 'ebooks', 'audiobooks', libraryKey]
          }
        );
      }
    }

    // Register dependency relationships
    this.registry.registerDependencies('kindle-unlimited', ['config-manager', 'logger']);
    this.registry.registerDependencies('hoopla', ['config-manager', 'logger']);
    
    libraryConfigs.forEach(libraryKey => {
      this.registry.registerDependencies(libraryKey, ['config-manager', 'logger']);
    });

    logger.info('Service factories registered successfully');
  }

  /**
   * Initialize all registered services
   */
  async initializeServices() {
    const serviceKeys = Array.from(this.registry.services.keys());
    
    for (const key of serviceKeys) {
      try {
        // Resolve dependencies first
        const dependencies = await this.registry.resolveDependencies(key);
        
        // Initialize service
        await this.registry.initialize(key);
        
        logger.info(`Service initialized: ${key}`);
      } catch (error) {
        logger.warn(`Failed to initialize service ${key}:`, error.message);
      }
    }
  }

  /**
   * Get all enabled availability services
   * @returns {Array} Array of enabled services
   */
  getEnabledServices() {
    return this.registry.getServicesByCapability('availability-check')
      .filter(({ service }) => service && service.isEnabled());
  }

  /**
   * Get service by key with dependency injection
   * @param {string} key - Service key
   * @returns {Object} Service instance
   */
  getService(key) {
    return this.registry.get(key);
  }

  /**
   * Check availability across all enabled services
   * @param {Object} book - Book object
   * @returns {Promise<Object>} Combined availability results
   */
  async checkAvailability(book) {
    if (!this.initialized) {
      throw new Error('Service integration not initialized');
    }

    const services = this.getEnabledServices();
    const results = {};
    const errors = [];

    for (const { key, service } of services) {
      try {
        const result = await service.checkAvailability(book);
        results[key] = result;
      } catch (error) {
        errors.push({
          service: key,
          error: error.message
        });
      }
    }

    return {
      book: {
        title: book.book_title || book.title,
        author: book.author_name
      },
      results,
      errors,
      checked_at: new Date().toISOString(),
      services_checked: services.length
    };
  }

  /**
   * Get service statistics across all services
   * @returns {Object} Combined statistics
   */
  getServiceStatistics() {
    const services = this.getEnabledServices();
    const stats = services.map(({ key, service }) => ({
      key,
      ...service.getStats()
    }));

    return {
      total_services: services.length,
      enabled_services: services.filter(({ service }) => service.isEnabled()).length,
      service_stats: stats,
      registry_summary: this.registry.getSummary()
    };
  }

  /**
   * Reset statistics for all services
   */
  resetStatistics() {
    this.registry.resetAllStats();
  }

  /**
   * Get service integration health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    const services = this.getEnabledServices();
    const unhealthyServices = services.filter(({ service }) => {
      const stats = service.getStats();
      return stats.errors > 0 || !service.isEnabled();
    });

    return {
      status: unhealthyServices.length === 0 ? 'healthy' : 'degraded',
      total_services: services.length,
      healthy_services: services.length - unhealthyServices.length,
      unhealthy_services: unhealthyServices.length,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate service dependencies
   * @returns {Object} Validation results
   */
  async validateDependencies() {
    const services = Array.from(this.registry.services.keys());
    const validationResults = {};
    const errors = [];

    for (const serviceKey of services) {
      try {
        const dependencies = this.registry.getDependencies(serviceKey);
        const resolved = await this.registry.resolveDependencies(serviceKey);
        
        validationResults[serviceKey] = {
          dependencies,
          resolved: Object.keys(resolved),
          valid: dependencies.length === Object.keys(resolved).length
        };
      } catch (error) {
        errors.push({
          service: serviceKey,
          error: error.message
        });
      }
    }

    return {
      validation_results: validationResults,
      errors,
      overall_valid: errors.length === 0
    };
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown() {
    try {
      await this.registry.destroyAll();
      this.initialized = false;
      // Only log if logger is still available
      if (logger && typeof logger.info === 'function') {
        logger.info('Service integration shutdown completed');
      }
    } catch (error) {
      // Only log if logger is still available
      if (logger && typeof logger.error === 'function') {
        logger.error('Error during service shutdown:', error);
      }
      throw error;
    }
  }
}

// Create singleton instance
const serviceIntegration = new ServiceIntegration();

module.exports = { ServiceIntegration, serviceIntegration };