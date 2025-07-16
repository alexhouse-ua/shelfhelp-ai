const { ServiceState, ServiceHealthStatus } = require('../interfaces/availability-service-interface');

/**
 * Service Lifecycle Manager
 * Manages service lifecycle states and transitions
 */
class ServiceLifecycleManager {
  constructor() {
    this.services = new Map();
    this.stateTransitions = new Map();
    this.healthChecks = new Map();
    this.eventListeners = new Map();
    this.timers = new Map();
    
    // Define valid state transitions
    this.defineStateTransitions();
  }

  /**
   * Define valid state transitions
   */
  defineStateTransitions() {
    const transitions = new Map([
      [ServiceState.CREATED, [ServiceState.INITIALIZING, ServiceState.ERROR]],
      [ServiceState.INITIALIZING, [ServiceState.STOPPED, ServiceState.ERROR]],
      [ServiceState.STOPPED, [ServiceState.RUNNING, ServiceState.ERROR]],
      [ServiceState.RUNNING, [ServiceState.STOPPING, ServiceState.ERROR]],
      [ServiceState.STOPPING, [ServiceState.STOPPED, ServiceState.ERROR]],
      [ServiceState.ERROR, [ServiceState.INITIALIZING, ServiceState.STOPPED]]
    ]);
    
    this.stateTransitions = transitions;
  }

  /**
   * Register a service for lifecycle management
   * @param {string} serviceName - Service name
   * @param {Object} service - Service instance
   * @param {Object} options - Registration options
   * @returns {void}
   */
  register(serviceName, service, options = {}) {
    const serviceInfo = {
      name: serviceName,
      instance: service,
      state: ServiceState.CREATED,
      health: ServiceHealthStatus.UNKNOWN,
      lastStateChange: new Date().toISOString(),
      lastHealthCheck: null,
      startTime: null,
      stopTime: null,
      restartCount: 0,
      errorCount: 0,
      options: {
        healthCheckInterval: options.healthCheckInterval || 30000,
        restartOnFailure: options.restartOnFailure || false,
        maxRestarts: options.maxRestarts || 3,
        gracefulShutdownTimeout: options.gracefulShutdownTimeout || 10000,
        ...options
      }
    };

    this.services.set(serviceName, serviceInfo);
    this.emit('service:registered', { serviceName, serviceInfo });
    
    // Start health check if enabled
    if (serviceInfo.options.healthCheckInterval > 0) {
      this.startHealthCheck(serviceName);
    }
  }

  /**
   * Initialize a service
   * @param {string} serviceName - Service name
   * @param {Object} config - Service configuration
   * @returns {Promise<void>}
   */
  async initialize(serviceName, config = {}) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    await this.transitionTo(serviceName, ServiceState.INITIALIZING);
    
    try {
      // Initialize service if it supports lifecycle
      if (serviceInfo.instance && typeof serviceInfo.instance.initialize === 'function') {
        await serviceInfo.instance.initialize(config);
      }
      
      await this.transitionTo(serviceName, ServiceState.STOPPED);
      this.emit('service:initialized', { serviceName });
      
    } catch (error) {
      await this.transitionTo(serviceName, ServiceState.ERROR);
      this.emit('service:error', { serviceName, error, phase: 'initialize' });
      throw error;
    }
  }

  /**
   * Start a service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async start(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    if (serviceInfo.state === ServiceState.RUNNING) {
      return;
    }

    try {
      // Start service if it supports lifecycle
      if (serviceInfo.instance && typeof serviceInfo.instance.start === 'function') {
        await serviceInfo.instance.start();
      }
      
      serviceInfo.startTime = new Date().toISOString();
      await this.transitionTo(serviceName, ServiceState.RUNNING);
      this.emit('service:started', { serviceName });
      
    } catch (error) {
      await this.transitionTo(serviceName, ServiceState.ERROR);
      serviceInfo.errorCount++;
      this.emit('service:error', { serviceName, error, phase: 'start' });
      
      // Auto-restart if enabled
      if (serviceInfo.options.restartOnFailure && 
          serviceInfo.restartCount < serviceInfo.options.maxRestarts) {
        setTimeout(() => this.restart(serviceName), 5000);
      }
      
      throw error;
    }
  }

  /**
   * Stop a service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async stop(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    if (serviceInfo.state === ServiceState.STOPPED) {
      return;
    }

    await this.transitionTo(serviceName, ServiceState.STOPPING);
    
    try {
      // Stop service if it supports lifecycle
      if (serviceInfo.instance && typeof serviceInfo.instance.stop === 'function') {
        // Use timeout for graceful shutdown
        const stopPromise = serviceInfo.instance.stop();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Stop timeout')), 
            serviceInfo.options.gracefulShutdownTimeout);
        });
        
        await Promise.race([stopPromise, timeoutPromise]);
      }
      
      serviceInfo.stopTime = new Date().toISOString();
      await this.transitionTo(serviceName, ServiceState.STOPPED);
      this.emit('service:stopped', { serviceName });
      
    } catch (error) {
      await this.transitionTo(serviceName, ServiceState.ERROR);
      this.emit('service:error', { serviceName, error, phase: 'stop' });
      throw error;
    }
  }

  /**
   * Restart a service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async restart(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    try {
      await this.stop(serviceName);
      await this.start(serviceName);
      
      serviceInfo.restartCount++;
      this.emit('service:restarted', { serviceName, restartCount: serviceInfo.restartCount });
      
    } catch (error) {
      this.emit('service:error', { serviceName, error, phase: 'restart' });
      throw error;
    }
  }

  /**
   * Transition service to new state
   * @param {string} serviceName - Service name
   * @param {ServiceState} newState - New state
   * @returns {Promise<void>}
   */
  async transitionTo(serviceName, newState) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    const currentState = serviceInfo.state;
    const validTransitions = this.stateTransitions.get(currentState) || [];
    
    if (!validTransitions.includes(newState)) {
      throw new Error(`Invalid state transition from ${currentState} to ${newState} for service ${serviceName}`);
    }

    const previousState = serviceInfo.state;
    serviceInfo.state = newState;
    serviceInfo.lastStateChange = new Date().toISOString();
    
    this.emit('service:stateChanged', {
      serviceName,
      previousState,
      newState,
      timestamp: serviceInfo.lastStateChange
    });
  }

  /**
   * Get service state
   * @param {string} serviceName - Service name
   * @returns {ServiceState} Service state
   */
  getState(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    return serviceInfo ? serviceInfo.state : null;
  }

  /**
   * Get service health
   * @param {string} serviceName - Service name
   * @returns {ServiceHealthStatus} Service health
   */
  getHealth(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    return serviceInfo ? serviceInfo.health : ServiceHealthStatus.UNKNOWN;
  }

  /**
   * Check service health
   * @param {string} serviceName - Service name
   * @returns {Promise<ServiceHealthStatus>} Health status
   */
  async checkHealth(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      return ServiceHealthStatus.UNKNOWN;
    }

    try {
      let health = ServiceHealthStatus.HEALTHY;
      
      // Check if service is running
      if (serviceInfo.state !== ServiceState.RUNNING) {
        health = ServiceHealthStatus.UNHEALTHY;
      }
      
      // Check service health if it supports health checks
      if (serviceInfo.instance && typeof serviceInfo.instance.getHealthStatus === 'function') {
        const healthResult = await serviceInfo.instance.getHealthStatus();
        health = healthResult.status || health;
      }
      
      // Update health status
      serviceInfo.health = health;
      serviceInfo.lastHealthCheck = new Date().toISOString();
      
      this.emit('service:healthChecked', { serviceName, health });
      return health;
      
    } catch (error) {
      serviceInfo.health = ServiceHealthStatus.UNHEALTHY;
      serviceInfo.lastHealthCheck = new Date().toISOString();
      
      this.emit('service:error', { serviceName, error, phase: 'healthCheck' });
      return ServiceHealthStatus.UNHEALTHY;
    }
  }

  /**
   * Start health check for a service
   * @param {string} serviceName - Service name
   * @returns {void}
   */
  startHealthCheck(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      return;
    }

    // Clear existing timer
    this.stopHealthCheck(serviceName);
    
    // Start new timer
    const timer = setInterval(async () => {
      try {
        const health = await this.checkHealth(serviceName);
        
        // Handle unhealthy services
        if (health === ServiceHealthStatus.UNHEALTHY && 
            serviceInfo.options.restartOnFailure &&
            serviceInfo.restartCount < serviceInfo.options.maxRestarts) {
          await this.restart(serviceName);
        }
        
      } catch (error) {
        console.error(`Health check failed for ${serviceName}:`, error);
      }
    }, serviceInfo.options.healthCheckInterval);
    
    this.timers.set(serviceName, timer);
  }

  /**
   * Stop health check for a service
   * @param {string} serviceName - Service name
   * @returns {void}
   */
  stopHealthCheck(serviceName) {
    const timer = this.timers.get(serviceName);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(serviceName);
    }
  }

  /**
   * Get service information
   * @param {string} serviceName - Service name
   * @returns {Object|null} Service information
   */
  getServiceInfo(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    return serviceInfo ? { ...serviceInfo } : null;
  }

  /**
   * Get all services information
   * @returns {Array} Array of service information
   */
  getAllServicesInfo() {
    return Array.from(this.services.entries()).map(([name, info]) => ({
      name,
      ...info
    }));
  }

  /**
   * Get services by state
   * @param {ServiceState} state - Service state
   * @returns {Array} Array of service names
   */
  getServicesByState(state) {
    return Array.from(this.services.entries())
      .filter(([_, info]) => info.state === state)
      .map(([name, _]) => name);
  }

  /**
   * Get services by health
   * @param {ServiceHealthStatus} health - Health status
   * @returns {Array} Array of service names
   */
  getServicesByHealth(health) {
    return Array.from(this.services.entries())
      .filter(([_, info]) => info.health === health)
      .map(([name, _]) => name);
  }

  /**
   * Get lifecycle summary
   * @returns {Object} Lifecycle summary
   */
  getSummary() {
    const services = this.getAllServicesInfo();
    const total = services.length;
    
    const stateCount = {};
    const healthCount = {};
    
    Object.values(ServiceState).forEach(state => {
      stateCount[state] = 0;
    });
    
    Object.values(ServiceHealthStatus).forEach(health => {
      healthCount[health] = 0;
    });
    
    services.forEach(service => {
      stateCount[service.state]++;
      healthCount[service.health]++;
    });
    
    return {
      total,
      states: stateCount,
      health: healthCount,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   * @returns {ServiceLifecycleManager} Manager instance for chaining
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
   * Unregister a service
   * @param {string} serviceName - Service name
   * @returns {void}
   */
  unregister(serviceName) {
    this.stopHealthCheck(serviceName);
    this.services.delete(serviceName);
    this.emit('service:unregistered', { serviceName });
  }

  /**
   * Shutdown all services
   * @returns {Promise<void>}
   */
  async shutdown() {
    const runningServices = this.getServicesByState(ServiceState.RUNNING);
    
    // Stop all running services
    for (const serviceName of runningServices) {
      try {
        await this.stop(serviceName);
      } catch (error) {
        console.error(`Failed to stop service ${serviceName}:`, error);
      }
    }
    
    // Clear all timers
    for (const [serviceName, timer] of this.timers) {
      clearInterval(timer);
    }
    
    this.timers.clear();
    this.services.clear();
    this.eventListeners.clear();
    
    this.emit('manager:shutdown');
  }
}

module.exports = { ServiceLifecycleManager };