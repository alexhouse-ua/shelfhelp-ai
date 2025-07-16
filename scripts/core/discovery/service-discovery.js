const { ServiceHealthStatus } = require('../interfaces/availability-service-interface');

/**
 * Service Discovery
 * Dynamic service discovery and registration system
 */
class ServiceDiscovery {
  constructor(options = {}) {
    this.services = new Map();
    this.serviceInstances = new Map();
    this.healthChecks = new Map();
    this.eventListeners = new Map();
    this.timers = new Map();
    
    this.options = {
      healthCheckInterval: options.healthCheckInterval || 30000,
      serviceTimeout: options.serviceTimeout || 60000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      ...options
    };
    
    // Service registry metadata
    this.registryMetadata = {
      startTime: new Date().toISOString(),
      version: '1.0.0',
      nodeId: this.generateNodeId(),
      capabilities: ['service-discovery', 'health-monitoring', 'load-balancing']
    };
  }

  /**
   * Generate unique node ID
   * @returns {string} Node ID
   */
  generateNodeId() {
    return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Register a service
   * @param {string} serviceName - Service name
   * @param {Object} serviceInstance - Service instance
   * @param {Object} metadata - Service metadata
   * @returns {Promise<void>}
   */
  async register(serviceName, serviceInstance, metadata = {}) {
    const serviceInfo = {
      name: serviceName,
      instance: serviceInstance,
      metadata: {
        version: metadata.version || '1.0.0',
        description: metadata.description || 'No description provided',
        capabilities: metadata.capabilities || [],
        endpoints: metadata.endpoints || {},
        dependencies: metadata.dependencies || [],
        tags: metadata.tags || [],
        ...metadata
      },
      health: ServiceHealthStatus.UNKNOWN,
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastHealthCheck: null,
      errorCount: 0,
      isActive: true
    };

    this.services.set(serviceName, serviceInfo);
    this.serviceInstances.set(serviceName, serviceInstance);

    // Start health monitoring
    this.startHealthMonitoring(serviceName);

    this.emit('service:registered', { serviceName, serviceInfo });
    console.log(`📡 Service registered: ${serviceName}`);
  }

  /**
   * Discover service by name
   * @param {string} serviceName - Service name
   * @returns {Promise<Object|null>} Service instance or null
   */
  async discover(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    
    if (!serviceInfo) {
      return null;
    }

    if (!serviceInfo.isActive) {
      return null;
    }

    // Update last seen
    serviceInfo.lastSeen = new Date().toISOString();
    
    this.emit('service:discovered', { serviceName, serviceInfo });
    return serviceInfo.instance;
  }

  /**
   * Discover services by capability
   * @param {string} capability - Required capability
   * @returns {Promise<Array>} Array of service instances
   */
  async discoverByCapability(capability) {
    const services = [];
    
    for (const [serviceName, serviceInfo] of this.services) {
      if (serviceInfo.isActive && 
          serviceInfo.metadata.capabilities.includes(capability)) {
        services.push({
          name: serviceName,
          instance: serviceInfo.instance,
          metadata: serviceInfo.metadata
        });
      }
    }
    
    return services;
  }

  /**
   * Discover services by tag
   * @param {string} tag - Service tag
   * @returns {Promise<Array>} Array of service instances
   */
  async discoverByTag(tag) {
    const services = [];
    
    for (const [serviceName, serviceInfo] of this.services) {
      if (serviceInfo.isActive && 
          serviceInfo.metadata.tags.includes(tag)) {
        services.push({
          name: serviceName,
          instance: serviceInfo.instance,
          metadata: serviceInfo.metadata
        });
      }
    }
    
    return services;
  }

  /**
   * Get all available services
   * @returns {Promise<Array>} Array of service metadata
   */
  async getAvailableServices() {
    const services = [];
    
    for (const [serviceName, serviceInfo] of this.services) {
      if (serviceInfo.isActive) {
        services.push({
          name: serviceName,
          metadata: serviceInfo.metadata,
          health: serviceInfo.health,
          registeredAt: serviceInfo.registeredAt,
          lastSeen: serviceInfo.lastSeen
        });
      }
    }
    
    return services;
  }

  /**
   * Get healthy services
   * @returns {Promise<Array>} Array of healthy services
   */
  async getHealthyServices() {
    const services = [];
    
    for (const [serviceName, serviceInfo] of this.services) {
      if (serviceInfo.isActive && 
          serviceInfo.health === ServiceHealthStatus.HEALTHY) {
        services.push({
          name: serviceName,
          instance: serviceInfo.instance,
          metadata: serviceInfo.metadata
        });
      }
    }
    
    return services;
  }

  /**
   * Unregister a service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async unregister(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    
    if (!serviceInfo) {
      return;
    }

    // Stop health monitoring
    this.stopHealthMonitoring(serviceName);

    // Mark as inactive
    serviceInfo.isActive = false;
    serviceInfo.unregisteredAt = new Date().toISOString();

    this.serviceInstances.delete(serviceName);
    
    this.emit('service:unregistered', { serviceName });
    console.log(`📡 Service unregistered: ${serviceName}`);
  }

  /**
   * Start health monitoring for a service
   * @param {string} serviceName - Service name
   * @returns {void}
   */
  startHealthMonitoring(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    
    if (!serviceInfo) {
      return;
    }

    // Clear existing timer
    this.stopHealthMonitoring(serviceName);
    
    // Start new health check timer
    const timer = setInterval(async () => {
      try {
        await this.checkServiceHealth(serviceName);
      } catch (error) {
        console.error(`Health check failed for ${serviceName}:`, error);
      }
    }, this.options.healthCheckInterval);
    
    this.timers.set(serviceName, timer);
  }

  /**
   * Stop health monitoring for a service
   * @param {string} serviceName - Service name
   * @returns {void}
   */
  stopHealthMonitoring(serviceName) {
    const timer = this.timers.get(serviceName);
    
    if (timer) {
      clearInterval(timer);
      this.timers.delete(serviceName);
    }
  }

  /**
   * Check service health
   * @param {string} serviceName - Service name
   * @returns {Promise<ServiceHealthStatus>} Health status
   */
  async checkServiceHealth(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    
    if (!serviceInfo) {
      return ServiceHealthStatus.UNKNOWN;
    }

    try {
      let health = ServiceHealthStatus.HEALTHY;
      
      // Check if service instance exists
      if (!serviceInfo.instance) {
        health = ServiceHealthStatus.UNHEALTHY;
      } else {
        // Check service health if it supports health checks
        if (typeof serviceInfo.instance.getHealthStatus === 'function') {
          const healthResult = await serviceInfo.instance.getHealthStatus();
          health = healthResult.status || ServiceHealthStatus.HEALTHY;
        }
        
        // Check if service is available
        if (typeof serviceInfo.instance.isAvailable === 'function') {
          const available = await serviceInfo.instance.isAvailable();
          if (!available) {
            health = ServiceHealthStatus.UNHEALTHY;
          }
        }
      }
      
      // Update service health
      const previousHealth = serviceInfo.health;
      serviceInfo.health = health;
      serviceInfo.lastHealthCheck = new Date().toISOString();
      
      // Handle health changes
      if (previousHealth !== health) {
        this.emit('service:healthChanged', { 
          serviceName, 
          previousHealth, 
          currentHealth: health 
        });
        
        if (health === ServiceHealthStatus.UNHEALTHY) {
          serviceInfo.errorCount++;
          this.emit('service:unhealthy', { serviceName, serviceInfo });
        } else if (health === ServiceHealthStatus.HEALTHY && 
                  previousHealth === ServiceHealthStatus.UNHEALTHY) {
          this.emit('service:recovered', { serviceName, serviceInfo });
        }
      }
      
      return health;
      
    } catch (error) {
      serviceInfo.health = ServiceHealthStatus.UNHEALTHY;
      serviceInfo.lastHealthCheck = new Date().toISOString();
      serviceInfo.errorCount++;
      
      this.emit('service:error', { serviceName, error });
      return ServiceHealthStatus.UNHEALTHY;
    }
  }

  /**
   * Get service health status
   * @param {string} serviceName - Service name
   * @returns {ServiceHealthStatus} Health status
   */
  getServiceHealth(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    return serviceInfo ? serviceInfo.health : ServiceHealthStatus.UNKNOWN;
  }

  /**
   * Get service metadata
   * @param {string} serviceName - Service name
   * @returns {Object|null} Service metadata
   */
  getServiceMetadata(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    return serviceInfo ? serviceInfo.metadata : null;
  }

  /**
   * Update service metadata
   * @param {string} serviceName - Service name
   * @param {Object} metadata - Updated metadata
   * @returns {Promise<void>}
   */
  async updateServiceMetadata(serviceName, metadata) {
    const serviceInfo = this.services.get(serviceName);
    
    if (!serviceInfo) {
      throw new Error(`Service '${serviceName}' not found`);
    }

    serviceInfo.metadata = { ...serviceInfo.metadata, ...metadata };
    serviceInfo.lastSeen = new Date().toISOString();
    
    this.emit('service:updated', { serviceName, metadata });
  }

  /**
   * Find services with load balancing
   * @param {string} serviceName - Service name
   * @param {string} strategy - Load balancing strategy
   * @returns {Promise<Object|null>} Selected service instance
   */
  async findWithLoadBalancing(serviceName, strategy = 'round-robin') {
    const services = await this.getHealthyServices();
    const candidates = services.filter(s => s.name === serviceName);
    
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    switch (strategy) {
      case 'round-robin':
        return this.roundRobinSelection(candidates);
      case 'random':
        return this.randomSelection(candidates);
      case 'least-errors':
        return this.leastErrorsSelection(candidates);
      default:
        return candidates[0];
    }
  }

  /**
   * Round-robin service selection
   * @param {Array} candidates - Service candidates
   * @returns {Object} Selected service
   */
  roundRobinSelection(candidates) {
    if (!this.roundRobinCounters) {
      this.roundRobinCounters = new Map();
    }
    
    const serviceName = candidates[0].name;
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selected = candidates[counter % candidates.length];
    
    this.roundRobinCounters.set(serviceName, counter + 1);
    return selected;
  }

  /**
   * Random service selection
   * @param {Array} candidates - Service candidates
   * @returns {Object} Selected service
   */
  randomSelection(candidates) {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  /**
   * Least errors service selection
   * @param {Array} candidates - Service candidates
   * @returns {Object} Selected service
   */
  leastErrorsSelection(candidates) {
    return candidates.reduce((best, current) => {
      const currentInfo = this.services.get(current.name);
      const bestInfo = this.services.get(best.name);
      
      return currentInfo.errorCount < bestInfo.errorCount ? current : best;
    });
  }

  /**
   * Get discovery statistics
   * @returns {Object} Discovery statistics
   */
  getStatistics() {
    const services = Array.from(this.services.values());
    const activeServices = services.filter(s => s.isActive);
    const healthyServices = services.filter(s => s.health === ServiceHealthStatus.HEALTHY);
    const unhealthyServices = services.filter(s => s.health === ServiceHealthStatus.UNHEALTHY);
    
    return {
      registry: this.registryMetadata,
      services: {
        total: services.length,
        active: activeServices.length,
        healthy: healthyServices.length,
        unhealthy: unhealthyServices.length,
        degraded: services.filter(s => s.health === ServiceHealthStatus.DEGRADED).length
      },
      uptime: Date.now() - new Date(this.registryMetadata.startTime).getTime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get service registry dump
   * @returns {Object} Complete registry dump
   */
  getRegistryDump() {
    const services = {};
    
    for (const [serviceName, serviceInfo] of this.services) {
      services[serviceName] = {
        metadata: serviceInfo.metadata,
        health: serviceInfo.health,
        registeredAt: serviceInfo.registeredAt,
        lastSeen: serviceInfo.lastSeen,
        lastHealthCheck: serviceInfo.lastHealthCheck,
        errorCount: serviceInfo.errorCount,
        isActive: serviceInfo.isActive
      };
    }
    
    return {
      registry: this.registryMetadata,
      services,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   * @returns {ServiceDiscovery} Discovery instance for chaining
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event).push(listener);
    return this;
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {void}
   */
  emit(event, data = {}) {
    const listeners = this.eventListeners.get(event) || [];
    
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    }
  }

  /**
   * Cleanup and shutdown
   * @returns {void}
   */
  shutdown() {
    // Stop all health monitoring
    for (const [serviceName, timer] of this.timers) {
      clearInterval(timer);
    }
    
    this.timers.clear();
    this.services.clear();
    this.serviceInstances.clear();
    this.healthChecks.clear();
    this.eventListeners.clear();
    
    this.emit('discovery:shutdown');
    console.log('📡 Service discovery shutdown');
  }
}

module.exports = { ServiceDiscovery };