/**
 * Service Registry
 * Manages availability service instances and provides dependency injection
 */
class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.configs = new Map();
    this.mocks = new Map();
    this.factories = new Map();
    this.metadata = new Map();
    this.dependencies = new Map();
    this.environment = process.env.NODE_ENV || 'development';
    this.discoveryPaths = ['./src/core/scrapers', './scripts/core/services'];
    this.autoDiscovery = true;
    this.lifecycle = {
      created: new Map(),
      initialized: new Map(),
      destroyed: new Map()
    };
    this.eventHandlers = new Map();
  }

  /**
   * Register a service instance with metadata
   * @param {string} key - Service key
   * @param {BaseAvailabilityService} service - Service instance
   * @param {Object} config - Service configuration
   * @param {Object} metadata - Service metadata
   */
  register(key, service, config = {}, metadata = {}) {
    this.services.set(key, service);
    this.configs.set(key, config);
    this.metadata.set(key, {
      name: metadata.name || key,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      tags: metadata.tags || [],
      dependencies: metadata.dependencies || [],
      capabilities: metadata.capabilities || [],
      ...metadata
    });
    this.lifecycle.created.set(key, new Date().toISOString());
    this.emit('service_registered', { key, service, config, metadata });
  }

  /**
   * Register a service factory function with metadata
   * @param {string} key - Service key
   * @param {Function} factory - Factory function that returns service instance
   * @param {Object} config - Service configuration
   * @param {Object} metadata - Service metadata
   */
  registerFactory(key, factory, config = {}, metadata = {}) {
    this.factories.set(key, factory);
    this.configs.set(key, { ...config, factory });
    this.metadata.set(key, {
      name: metadata.name || key,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      tags: metadata.tags || [],
      dependencies: metadata.dependencies || [],
      capabilities: metadata.capabilities || [],
      type: 'factory',
      ...metadata
    });
    this.emit('factory_registered', { key, factory, config, metadata });
  }

  /**
   * Create service instance from factory
   * @param {string} key - Service key
   * @returns {BaseAvailabilityService} Service instance
   */
  create(key) {
    const config = this.configs.get(key);
    if (!config || !config.factory) {
      throw new Error(`No factory registered for service: ${key}`);
    }
    
    const service = config.factory(config);
    this.register(key, service, config);
    return service;
  }

  /**
   * Get a service instance by key
   * @param {string} key - Service key
   * @returns {BaseAvailabilityService|null} Service instance or null
   */
  get(key) {
    // Return mock if in test environment and mock exists
    if (this.isTest() && this.mocks.has(key)) {
      return this.mocks.get(key);
    }
    
    // Return existing service or create from factory
    let service = this.services.get(key);
    if (!service && this.configs.has(key)) {
      service = this.create(key);
    }
    
    return service || null;
  }

  /**
   * Get all registered services
   * @returns {Map} Map of all services
   */
  getAll() {
    return new Map(this.services);
  }

  /**
   * Get all enabled services
   * @returns {Array} Array of enabled services
   */
  getEnabled() {
    return Array.from(this.services.values()).filter(service => service.isEnabled());
  }

  /**
   * Remove a service
   * @param {string} key - Service key
   */
  unregister(key) {
    this.services.delete(key);
  }

  /**
   * Check if service is registered
   * @param {string} key - Service key
   * @returns {boolean} True if registered
   */
  has(key) {
    return this.services.has(key);
  }

  /**
   * Get service statistics for all services
   * @returns {Array} Array of service statistics
   */
  getAllStats() {
    return Array.from(this.services.values()).map(service => service.getStats());
  }

  /**
   * Reset statistics for all services
   */
  resetAllStats() {
    this.services.forEach(service => service.resetStats());
  }

  /**
   * Get service registry summary
   * @returns {Object} Registry summary
   */
  getSummary() {
    const total = this.services.size;
    const enabled = this.getEnabled().length;
    const disabled = total - enabled;
    
    return {
      total,
      enabled,
      disabled,
      mocked: this.mocks.size,
      services: Array.from(this.services.keys()),
      environment: this.environment
    };
  }

  // Service Mocking Methods

  /**
   * Register a mock service for testing
   * @param {string} key - Service key
   * @param {Object} mock - Mock service implementation
   */
  registerMock(key, mock) {
    this.mocks.set(key, mock);
  }

  /**
   * Remove mock service
   * @param {string} key - Service key
   */
  removeMock(key) {
    this.mocks.delete(key);
  }

  /**
   * Clear all mocks
   */
  clearMocks() {
    this.mocks.clear();
  }

  /**
   * Check if service is mocked
   * @param {string} key - Service key
   * @returns {boolean} True if mocked
   */
  isMocked(key) {
    return this.mocks.has(key);
  }

  // Lifecycle Management

  /**
   * Initialize a service
   * @param {string} key - Service key
   * @returns {Promise} Initialization promise
   */
  async initialize(key) {
    const service = this.get(key);
    if (!service) {
      throw new Error(`Service not found: ${key}`);
    }
    
    if (service.initialize && typeof service.initialize === 'function') {
      await service.initialize();
      this.lifecycle.initialized.set(key, new Date().toISOString());
    }
    
    return service;
  }

  /**
   * Initialize all services
   * @returns {Promise} Initialization promise
   */
  async initializeAll() {
    const services = Array.from(this.services.keys());
    for (const key of services) {
      await this.initialize(key);
    }
  }

  /**
   * Destroy a service
   * @param {string} key - Service key
   */
  async destroy(key) {
    const service = this.get(key);
    if (!service) {
      return;
    }
    
    if (service.destroy && typeof service.destroy === 'function') {
      await service.destroy();
    }
    
    this.services.delete(key);
    this.configs.delete(key);
    this.mocks.delete(key);
    this.lifecycle.destroyed.set(key, new Date().toISOString());
  }

  /**
   * Destroy all services
   */
  async destroyAll() {
    const services = Array.from(this.services.keys());
    for (const key of services) {
      await this.destroy(key);
    }
    
    this.services.clear();
    this.configs.clear();
    this.mocks.clear();
  }

  // Environment Detection

  /**
   * Check if running in test environment
   * @returns {boolean} True if test environment
   */
  isTest() {
    return this.environment === 'test';
  }

  /**
   * Check if running in development environment
   * @returns {boolean} True if development environment
   */
  isDevelopment() {
    return this.environment === 'development';
  }

  /**
   * Check if running in production environment
   * @returns {boolean} True if production environment
   */
  isProduction() {
    return this.environment === 'production';
  }

  /**
   * Get lifecycle information
   * @returns {Object} Lifecycle information
   */
  getLifecycle() {
    return {
      created: Object.fromEntries(this.lifecycle.created),
      initialized: Object.fromEntries(this.lifecycle.initialized),
      destroyed: Object.fromEntries(this.lifecycle.destroyed)
    };
  }

  // Dynamic Service Discovery

  /**
   * Auto-discover services from configured paths
   * @returns {Promise<Object>} Discovery results
   */
  async discoverServices() {
    if (!this.autoDiscovery) {
      return { discovered: 0, errors: [] };
    }

    const discovered = [];
    const errors = [];

    for (const discoveryPath of this.discoveryPaths) {
      try {
        const services = await this.scanDirectory(discoveryPath);
        discovered.push(...services);
      } catch (error) {
        errors.push({
          path: discoveryPath,
          error: error.message
        });
      }
    }

    // Register discovered services
    for (const service of discovered) {
      try {
        await this.registerDiscoveredService(service);
      } catch (error) {
        errors.push({
          service: service.name,
          error: error.message
        });
      }
    }

    this.emit('discovery_complete', { discovered: discovered.length, errors });
    return { discovered: discovered.length, errors };
  }

  /**
   * Scan directory for service files
   * @param {string} directoryPath - Directory to scan
   * @returns {Promise<Array>} Found services
   */
  async scanDirectory(directoryPath) {
    const fs = require('fs').promises;
    const path = require('path');
    const services = [];

    try {
      const files = await fs.readdir(directoryPath);
      
      for (const file of files) {
        if (file.endsWith('.js') && !file.includes('test') && !file.includes('spec')) {
          const filePath = path.join(directoryPath, file);
          const serviceInfo = await this.extractServiceInfo(filePath);
          
          if (serviceInfo) {
            services.push(serviceInfo);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or is not accessible
    }

    return services;
  }

  /**
   * Extract service information from file
   * @param {string} filePath - Path to service file
   * @returns {Promise<Object|null>} Service information
   */
  async extractServiceInfo(filePath) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath, '.js');
      
      // Look for service class definitions
      const classMatch = content.match(/class\s+(\w+)\s*{/);
      const exportsMatch = content.match(/module\.exports\s*=\s*{?\s*(\w+)/);
      
      if (classMatch || exportsMatch) {
        const serviceName = classMatch ? classMatch[1] : exportsMatch[1];
        
        return {
          name: serviceName,
          fileName,
          filePath,
          key: fileName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          type: 'discovered',
          metadata: {
            discoveredAt: new Date().toISOString(),
            source: 'auto_discovery'
          }
        };
      }
    } catch (error) {
      // File cannot be read or parsed
    }

    return null;
  }

  /**
   * Register a discovered service
   * @param {Object} serviceInfo - Service information
   */
  async registerDiscoveredService(serviceInfo) {
    try {
      const ServiceClass = require(serviceInfo.filePath);
      const ServiceConstructor = ServiceClass[serviceInfo.name] || ServiceClass;
      
      if (typeof ServiceConstructor === 'function') {
        const factory = (config) => new ServiceConstructor(config);
        
        this.registerFactory(serviceInfo.key, factory, {}, {
          name: serviceInfo.name,
          fileName: serviceInfo.fileName,
          type: 'discovered',
          capabilities: ['auto_discovered'],
          ...serviceInfo.metadata
        });
      }
    } catch (error) {
      throw new Error(`Failed to register discovered service ${serviceInfo.name}: ${error.message}`);
    }
  }

  /**
   * Add discovery path
   * @param {string} path - Path to add
   */
  addDiscoveryPath(path) {
    if (!this.discoveryPaths.includes(path)) {
      this.discoveryPaths.push(path);
    }
  }

  /**
   * Remove discovery path
   * @param {string} path - Path to remove
   */
  removeDiscoveryPath(path) {
    const index = this.discoveryPaths.indexOf(path);
    if (index > -1) {
      this.discoveryPaths.splice(index, 1);
    }
  }

  /**
   * Set auto-discovery enabled/disabled
   * @param {boolean} enabled - Enable/disable auto-discovery
   */
  setAutoDiscovery(enabled) {
    this.autoDiscovery = enabled;
  }

  // Service Metadata Management

  /**
   * Get service metadata
   * @param {string} key - Service key
   * @returns {Object|null} Service metadata
   */
  getMetadata(key) {
    return this.metadata.get(key) || null;
  }

  /**
   * Update service metadata
   * @param {string} key - Service key
   * @param {Object} metadata - Metadata updates
   */
  updateMetadata(key, metadata) {
    const existing = this.metadata.get(key) || {};
    this.metadata.set(key, { ...existing, ...metadata });
    this.emit('metadata_updated', { key, metadata });
  }

  /**
   * Get services by capability
   * @param {string} capability - Capability to search for
   * @returns {Array} Services with the capability
   */
  getServicesByCapability(capability) {
    const services = [];
    
    for (const [key, metadata] of this.metadata) {
      if (metadata.capabilities && metadata.capabilities.includes(capability)) {
        services.push({
          key,
          service: this.get(key),
          metadata
        });
      }
    }
    
    return services;
  }

  /**
   * Get services by tag
   * @param {string} tag - Tag to search for
   * @returns {Array} Services with the tag
   */
  getServicesByTag(tag) {
    const services = [];
    
    for (const [key, metadata] of this.metadata) {
      if (metadata.tags && metadata.tags.includes(tag)) {
        services.push({
          key,
          service: this.get(key),
          metadata
        });
      }
    }
    
    return services;
  }

  // Dependency Management

  /**
   * Register service dependencies
   * @param {string} key - Service key
   * @param {Array} dependencies - Array of dependency keys
   */
  registerDependencies(key, dependencies) {
    this.dependencies.set(key, dependencies);
    this.emit('dependencies_registered', { key, dependencies });
  }

  /**
   * Get service dependencies
   * @param {string} key - Service key
   * @returns {Array} Service dependencies
   */
  getDependencies(key) {
    return this.dependencies.get(key) || [];
  }

  /**
   * Resolve service dependencies
   * @param {string} key - Service key
   * @returns {Promise<Object>} Resolved dependencies
   */
  async resolveDependencies(key) {
    const dependencies = this.getDependencies(key);
    const resolved = {};
    
    for (const depKey of dependencies) {
      const service = this.get(depKey);
      if (!service) {
        throw new Error(`Dependency not found: ${depKey} for service: ${key}`);
      }
      
      // Initialize dependency if needed
      if (!this.lifecycle.initialized.has(depKey)) {
        await this.initialize(depKey);
      }
      
      resolved[depKey] = service;
    }
    
    return resolved;
  }

  // Event System

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // Testing Utilities

  /**
   * Create test registry with mocked services
   * @param {Object} mocks - Mock service definitions
   * @returns {ServiceRegistry} Test registry instance
   */
  static createTestRegistry(mocks = {}) {
    const registry = new ServiceRegistry();
    registry.environment = 'test';
    
    // Register mocks
    for (const [key, mock] of Object.entries(mocks)) {
      registry.registerMock(key, mock);
    }
    
    return registry;
  }

  /**
   * Get test utilities
   * @returns {Object} Test utilities
   */
  getTestUtilities() {
    return {
      createMock: (methods = {}) => {
        const mock = {
          isEnabled: () => true,
          getStats: () => ({ calls: 0, errors: 0 }),
          resetStats: () => {},
          ...methods
        };
        
        return mock;
      },
      
      createMockFactory: (serviceConfig = {}) => {
        return (config) => {
          return {
            isEnabled: () => true,
            getStats: () => ({ calls: 0, errors: 0 }),
            resetStats: () => {},
            config: { ...serviceConfig, ...config },
            ...serviceConfig
          };
        };
      },
      
      waitForEvent: (event, timeout = 5000) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Event ${event} not received within ${timeout}ms`));
          }, timeout);
          
          this.on(event, (data) => {
            clearTimeout(timer);
            resolve(data);
          });
        });
      }
    };
  }

  /**
   * Reset registry for testing
   */
  reset() {
    this.services.clear();
    this.configs.clear();
    this.mocks.clear();
    this.factories.clear();
    this.metadata.clear();
    this.dependencies.clear();
    this.eventHandlers.clear();
    this.lifecycle.created.clear();
    this.lifecycle.initialized.clear();
    this.lifecycle.destroyed.clear();
  }
}

module.exports = { ServiceRegistry };