const { ServiceHealthStatus, ServiceState } = require('../interfaces/availability-service-interface');

/**
 * Service Container
 * Advanced dependency injection container with lifecycle management
 */
class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
    this.configurations = new Map();
    this.bindings = new Map();
    this.interceptors = new Map();
    this.serviceStates = new Map();
    this.dependencies = new Map();
    this.eventListeners = new Map();
    
    // Container state
    this.isInitialized = false;
    this.isStarted = false;
    
    // Metrics
    this.metrics = {
      servicesRegistered: 0,
      servicesResolved: 0,
      resolutionTime: 0,
      errors: 0
    };
  }

  /**
   * Initialize container
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      throw new Error('Container already initialized');
    }

    console.log('🔧 Initializing service container...');
    
    // Initialize all registered services
    for (const [serviceName, binding] of this.bindings) {
      try {
        await this.initializeService(serviceName, binding);
      } catch (error) {
        console.error(`❌ Failed to initialize service ${serviceName}:`, error.message);
        this.metrics.errors++;
      }
    }

    this.isInitialized = true;
    this.emit('container:initialized');
    console.log('✅ Service container initialized');
  }

  /**
   * Start all services
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isStarted) {
      throw new Error('Container already started');
    }

    console.log('🚀 Starting all services...');
    
    // Start services in dependency order
    const startOrder = this.getStartOrder();
    
    for (const serviceName of startOrder) {
      try {
        await this.startService(serviceName);
      } catch (error) {
        console.error(`❌ Failed to start service ${serviceName}:`, error.message);
        this.metrics.errors++;
      }
    }

    this.isStarted = true;
    this.emit('container:started');
    console.log('✅ All services started');
  }

  /**
   * Stop all services
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isStarted) {
      return;
    }

    console.log('🛑 Stopping all services...');
    
    // Stop services in reverse dependency order
    const stopOrder = this.getStartOrder().reverse();
    
    for (const serviceName of stopOrder) {
      try {
        await this.stopService(serviceName);
      } catch (error) {
        console.error(`❌ Failed to stop service ${serviceName}:`, error.message);
        this.metrics.errors++;
      }
    }

    this.isStarted = false;
    this.emit('container:stopped');
    console.log('✅ All services stopped');
  }

  /**
   * Register a service class
   * @param {string} serviceName - Service name
   * @param {Function} serviceClass - Service class constructor
   * @param {Object} options - Registration options
   * @returns {ServiceContainer} Container instance for chaining
   */
  register(serviceName, serviceClass, options = {}) {
    const binding = {
      type: 'class',
      target: serviceClass,
      lifecycle: options.lifecycle || 'singleton',
      dependencies: options.dependencies || [],
      configuration: options.configuration || {},
      interceptors: options.interceptors || [],
      metadata: options.metadata || {}
    };

    this.bindings.set(serviceName, binding);
    this.serviceStates.set(serviceName, ServiceState.CREATED);
    this.dependencies.set(serviceName, binding.dependencies);
    this.metrics.servicesRegistered++;

    console.log(`📝 Registered service: ${serviceName} (${binding.lifecycle})`);
    this.emit('service:registered', { serviceName, binding });
    
    return this;
  }

  /**
   * Register a singleton service
   * @param {string} serviceName - Service name
   * @param {Function} serviceClass - Service class constructor
   * @param {Object} options - Registration options
   * @returns {ServiceContainer} Container instance for chaining
   */
  registerSingleton(serviceName, serviceClass, options = {}) {
    return this.register(serviceName, serviceClass, { ...options, lifecycle: 'singleton' });
  }

  /**
   * Register a transient service
   * @param {string} serviceName - Service name
   * @param {Function} serviceClass - Service class constructor
   * @param {Object} options - Registration options
   * @returns {ServiceContainer} Container instance for chaining
   */
  registerTransient(serviceName, serviceClass, options = {}) {
    return this.register(serviceName, serviceClass, { ...options, lifecycle: 'transient' });
  }

  /**
   * Register a factory function
   * @param {string} serviceName - Service name
   * @param {Function} factory - Factory function
   * @param {Object} options - Registration options
   * @returns {ServiceContainer} Container instance for chaining
   */
  registerFactory(serviceName, factory, options = {}) {
    const binding = {
      type: 'factory',
      target: factory,
      lifecycle: options.lifecycle || 'singleton',
      dependencies: options.dependencies || [],
      configuration: options.configuration || {},
      interceptors: options.interceptors || [],
      metadata: options.metadata || {}
    };

    this.bindings.set(serviceName, binding);
    this.serviceStates.set(serviceName, ServiceState.CREATED);
    this.dependencies.set(serviceName, binding.dependencies);
    this.metrics.servicesRegistered++;

    console.log(`📝 Registered factory: ${serviceName} (${binding.lifecycle})`);
    this.emit('service:registered', { serviceName, binding });
    
    return this;
  }

  /**
   * Register a service instance
   * @param {string} serviceName - Service name
   * @param {Object} instance - Service instance
   * @param {Object} options - Registration options
   * @returns {ServiceContainer} Container instance for chaining
   */
  registerInstance(serviceName, instance, options = {}) {
    const binding = {
      type: 'instance',
      target: instance,
      lifecycle: 'singleton',
      dependencies: [],
      configuration: options.configuration || {},
      interceptors: options.interceptors || [],
      metadata: options.metadata || {}
    };

    this.bindings.set(serviceName, binding);
    this.singletons.set(serviceName, instance);
    this.serviceStates.set(serviceName, ServiceState.RUNNING);
    this.dependencies.set(serviceName, []);
    this.metrics.servicesRegistered++;

    console.log(`📝 Registered instance: ${serviceName}`);
    this.emit('service:registered', { serviceName, binding });
    
    return this;
  }

  /**
   * Resolve a service by name
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Service instance
   */
  async resolve(serviceName) {
    const startTime = Date.now();
    
    try {
      if (!this.bindings.has(serviceName)) {
        throw new Error(`Service '${serviceName}' not registered`);
      }

      const binding = this.bindings.get(serviceName);
      let instance;

      // Check if singleton already exists
      if (binding.lifecycle === 'singleton' && this.singletons.has(serviceName)) {
        instance = this.singletons.get(serviceName);
      } else {
        // Create new instance
        instance = await this.createInstance(serviceName, binding);
        
        // Store singleton
        if (binding.lifecycle === 'singleton') {
          this.singletons.set(serviceName, instance);
        }
      }

      // Apply interceptors
      instance = await this.applyInterceptors(serviceName, instance, binding);

      this.metrics.servicesResolved++;
      this.metrics.resolutionTime += Date.now() - startTime;

      this.emit('service:resolved', { serviceName, instance });
      return instance;
      
    } catch (error) {
      this.metrics.errors++;
      this.emit('service:error', { serviceName, error });
      throw error;
    }
  }

  /**
   * Create service instance
   * @param {string} serviceName - Service name
   * @param {Object} binding - Service binding
   * @returns {Promise<Object>} Service instance
   */
  async createInstance(serviceName, binding) {
    // Resolve dependencies
    const dependencies = await this.resolveDependencies(binding.dependencies);
    
    let instance;
    
    switch (binding.type) {
      case 'class':
        instance = new binding.target(binding.configuration, ...dependencies);
        break;
        
      case 'factory':
        instance = await binding.target(binding.configuration, ...dependencies);
        break;
        
      case 'instance':
        instance = binding.target;
        break;
        
      default:
        throw new Error(`Unknown binding type: ${binding.type}`);
    }

    // Initialize if lifecycle interface is implemented
    if (instance && typeof instance.initialize === 'function') {
      await instance.initialize(binding.configuration);
    }

    return instance;
  }

  /**
   * Resolve service dependencies
   * @param {Array} dependencies - Dependency names
   * @returns {Promise<Array>} Resolved dependencies
   */
  async resolveDependencies(dependencies) {
    const resolved = [];
    
    for (const dependency of dependencies) {
      const instance = await this.resolve(dependency);
      resolved.push(instance);
    }
    
    return resolved;
  }

  /**
   * Apply interceptors to service instance
   * @param {string} serviceName - Service name
   * @param {Object} instance - Service instance
   * @param {Object} binding - Service binding
   * @returns {Promise<Object>} Intercepted instance
   */
  async applyInterceptors(serviceName, instance, binding) {
    let interceptedInstance = instance;
    
    for (const interceptorName of binding.interceptors) {
      const interceptor = this.interceptors.get(interceptorName);
      if (interceptor) {
        interceptedInstance = await interceptor(serviceName, interceptedInstance, binding);
      }
    }
    
    return interceptedInstance;
  }

  /**
   * Initialize a service
   * @param {string} serviceName - Service name
   * @param {Object} binding - Service binding
   * @returns {Promise<void>}
   */
  async initializeService(serviceName, binding) {
    this.serviceStates.set(serviceName, ServiceState.INITIALIZING);
    
    try {
      // Service is initialized when first resolved
      this.serviceStates.set(serviceName, ServiceState.STOPPED);
      this.emit('service:initialized', { serviceName });
    } catch (error) {
      this.serviceStates.set(serviceName, ServiceState.ERROR);
      throw error;
    }
  }

  /**
   * Start a service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async startService(serviceName) {
    const currentState = this.serviceStates.get(serviceName);
    
    if (currentState === ServiceState.RUNNING) {
      return;
    }

    try {
      const instance = await this.resolve(serviceName);
      
      // Start if lifecycle interface is implemented
      if (instance && typeof instance.start === 'function') {
        await instance.start();
      }
      
      this.serviceStates.set(serviceName, ServiceState.RUNNING);
      this.emit('service:started', { serviceName });
      
    } catch (error) {
      this.serviceStates.set(serviceName, ServiceState.ERROR);
      this.emit('service:error', { serviceName, error });
      throw error;
    }
  }

  /**
   * Stop a service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async stopService(serviceName) {
    const currentState = this.serviceStates.get(serviceName);
    
    if (currentState !== ServiceState.RUNNING) {
      return;
    }

    this.serviceStates.set(serviceName, ServiceState.STOPPING);
    
    try {
      const instance = this.singletons.get(serviceName);
      
      // Stop if lifecycle interface is implemented
      if (instance && typeof instance.stop === 'function') {
        await instance.stop();
      }
      
      this.serviceStates.set(serviceName, ServiceState.STOPPED);
      this.emit('service:stopped', { serviceName });
      
    } catch (error) {
      this.serviceStates.set(serviceName, ServiceState.ERROR);
      this.emit('service:error', { serviceName, error });
      throw error;
    }
  }

  /**
   * Get service start order based on dependencies
   * @returns {Array} Service names in start order
   */
  getStartOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];
    
    const visit = (serviceName) => {
      if (visited.has(serviceName)) {
        return;
      }
      
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected: ${serviceName}`);
      }
      
      visiting.add(serviceName);
      
      const dependencies = this.dependencies.get(serviceName) || [];
      for (const dependency of dependencies) {
        visit(dependency);
      }
      
      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };
    
    for (const serviceName of this.bindings.keys()) {
      visit(serviceName);
    }
    
    return order;
  }

  /**
   * Register an interceptor
   * @param {string} name - Interceptor name
   * @param {Function} interceptor - Interceptor function
   * @returns {ServiceContainer} Container instance for chaining
   */
  registerInterceptor(name, interceptor) {
    this.interceptors.set(name, interceptor);
    return this;
  }

  /**
   * Get container metrics
   * @returns {Object} Container metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageResolutionTime: this.metrics.servicesResolved > 0 ? 
        this.metrics.resolutionTime / this.metrics.servicesResolved : 0,
      isInitialized: this.isInitialized,
      isStarted: this.isStarted
    };
  }

  /**
   * Get service states
   * @returns {Map} Service states
   */
  getServiceStates() {
    return new Map(this.serviceStates);
  }

  /**
   * Get container health
   * @returns {Object} Container health
   */
  getHealth() {
    const states = Array.from(this.serviceStates.values());
    const errorCount = states.filter(s => s === ServiceState.ERROR).length;
    const runningCount = states.filter(s => s === ServiceState.RUNNING).length;
    const totalCount = states.length;
    
    let status = ServiceHealthStatus.HEALTHY;
    
    if (errorCount > 0) {
      status = errorCount === totalCount ? ServiceHealthStatus.UNHEALTHY : ServiceHealthStatus.DEGRADED;
    }
    
    return {
      status,
      servicesTotal: totalCount,
      servicesRunning: runningCount,
      servicesError: errorCount,
      isInitialized: this.isInitialized,
      isStarted: this.isStarted,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   * @returns {ServiceContainer} Container instance for chaining
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
   * Clear all services and reset container
   * @returns {Promise<void>}
   */
  async clear() {
    if (this.isStarted) {
      await this.stop();
    }
    
    this.services.clear();
    this.singletons.clear();
    this.factories.clear();
    this.configurations.clear();
    this.bindings.clear();
    this.interceptors.clear();
    this.serviceStates.clear();
    this.dependencies.clear();
    this.eventListeners.clear();
    
    this.isInitialized = false;
    this.isStarted = false;
    
    this.metrics = {
      servicesRegistered: 0,
      servicesResolved: 0,
      resolutionTime: 0,
      errors: 0
    };
  }
}

module.exports = { ServiceContainer };