/**
 * Availability Service Interface
 * Defines contracts for all availability checking services
 */

/**
 * Service Health Status Enumeration
 */
const ServiceHealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

/**
 * Service State Enumeration
 */
const ServiceState = {
  CREATED: 'created',
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error'
};

/**
 * Core Availability Service Interface
 * @interface IAvailabilityService
 */
class IAvailabilityService {
  /**
   * Get service metadata
   * @returns {IServiceMetadata} Service metadata
   */
  getMetadata() {
    throw new Error('getMetadata must be implemented');
  }

  /**
   * Check if service is available and ready
   * @returns {Promise<boolean>} Service availability
   */
  async isAvailable() {
    throw new Error('isAvailable must be implemented');
  }

  /**
   * Check availability for a book
   * @param {Object} book - Book object
   * @param {IAvailabilityContext} context - Request context
   * @returns {Promise<IAvailabilityResult>} Availability result
   */
  async checkAvailability(book, context) {
    throw new Error('checkAvailability must be implemented');
  }

  /**
   * Validate service configuration
   * @param {Object} config - Configuration object
   * @returns {IValidationResult} Validation result
   */
  validateConfig(config) {
    throw new Error('validateConfig must be implemented');
  }

  /**
   * Get service health status
   * @returns {Promise<IHealthStatus>} Health status
   */
  async getHealthStatus() {
    throw new Error('getHealthStatus must be implemented');
  }

  /**
   * Get service metrics
   * @returns {IServiceMetrics} Service metrics
   */
  getMetrics() {
    throw new Error('getMetrics must be implemented');
  }
}

/**
 * Service Lifecycle Interface
 * @interface IServiceLifecycle
 */
class IServiceLifecycle {
  /**
   * Initialize service
   * @param {Object} config - Service configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    throw new Error('initialize must be implemented');
  }

  /**
   * Start service
   * @returns {Promise<void>}
   */
  async start() {
    throw new Error('start must be implemented');
  }

  /**
   * Stop service
   * @returns {Promise<void>}
   */
  async stop() {
    throw new Error('stop must be implemented');
  }

  /**
   * Restart service
   * @returns {Promise<void>}
   */
  async restart() {
    throw new Error('restart must be implemented');
  }

  /**
   * Get current service state
   * @returns {ServiceState} Current state
   */
  getState() {
    throw new Error('getState must be implemented');
  }
}

/**
 * Configuration Interface
 * @interface IServiceConfiguration
 */
class IServiceConfiguration {
  /**
   * Get configuration value
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value
   * @returns {*} Configuration value
   */
  get(key, defaultValue) {
    throw new Error('get must be implemented');
  }

  /**
   * Set configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   * @returns {void}
   */
  set(key, value) {
    throw new Error('set must be implemented');
  }

  /**
   * Check if configuration key exists
   * @param {string} key - Configuration key
   * @returns {boolean} True if exists
   */
  has(key) {
    throw new Error('has must be implemented');
  }

  /**
   * Get all configuration as object
   * @returns {Object} Configuration object
   */
  getAll() {
    throw new Error('getAll must be implemented');
  }

  /**
   * Validate configuration
   * @returns {IValidationResult} Validation result
   */
  validate() {
    throw new Error('validate must be implemented');
  }
}

/**
 * Service Discovery Interface
 * @interface IServiceDiscovery
 */
class IServiceDiscovery {
  /**
   * Register service
   * @param {string} serviceName - Service name
   * @param {IAvailabilityService} service - Service instance
   * @returns {Promise<void>}
   */
  async register(serviceName, service) {
    throw new Error('register must be implemented');
  }

  /**
   * Discover service by name
   * @param {string} serviceName - Service name
   * @returns {Promise<IAvailabilityService|null>} Service instance
   */
  async discover(serviceName) {
    throw new Error('discover must be implemented');
  }

  /**
   * Get all available services
   * @returns {Promise<Array<IServiceMetadata>>} Array of service metadata
   */
  async getAvailableServices() {
    throw new Error('getAvailableServices must be implemented');
  }

  /**
   * Unregister service
   * @param {string} serviceName - Service name
   * @returns {Promise<void>}
   */
  async unregister(serviceName) {
    throw new Error('unregister must be implemented');
  }
}

/**
 * Monitoring Interface
 * @interface IServiceMonitoring
 */
class IServiceMonitoring {
  /**
   * Record metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} tags - Metric tags
   * @returns {void}
   */
  recordMetric(name, value, tags = {}) {
    throw new Error('recordMetric must be implemented');
  }

  /**
   * Increment counter
   * @param {string} name - Counter name
   * @param {Object} tags - Counter tags
   * @returns {void}
   */
  incrementCounter(name, tags = {}) {
    throw new Error('incrementCounter must be implemented');
  }

  /**
   * Record timing
   * @param {string} name - Timer name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} tags - Timer tags
   * @returns {void}
   */
  recordTiming(name, duration, tags = {}) {
    throw new Error('recordTiming must be implemented');
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getMetricsSummary() {
    throw new Error('getMetricsSummary must be implemented');
  }
}

/**
 * Error Handling Interface
 * @interface IErrorHandler
 */
class IErrorHandler {
  /**
   * Handle error
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @returns {Promise<void>}
   */
  async handleError(error, context) {
    throw new Error('handleError must be implemented');
  }

  /**
   * Check if error is recoverable
   * @param {Error} error - Error object
   * @returns {boolean} True if recoverable
   */
  isRecoverable(error) {
    throw new Error('isRecoverable must be implemented');
  }

  /**
   * Get recovery strategy
   * @param {Error} error - Error object
   * @returns {IRecoveryStrategy} Recovery strategy
   */
  getRecoveryStrategy(error) {
    throw new Error('getRecoveryStrategy must be implemented');
  }
}

/**
 * Type Definitions for Interface Contracts
 */

/**
 * Service Metadata
 * @typedef {Object} IServiceMetadata
 * @property {string} name - Service name
 * @property {string} version - Service version
 * @property {string} description - Service description
 * @property {Array<string>} capabilities - Service capabilities
 * @property {Object} endpoints - Service endpoints
 * @property {Object} dependencies - Service dependencies
 * @property {Object} configuration - Service configuration schema
 */

/**
 * Availability Context
 * @typedef {Object} IAvailabilityContext
 * @property {string} requestId - Request identifier
 * @property {Object} user - User context
 * @property {Object} preferences - User preferences
 * @property {number} timeout - Request timeout
 * @property {Object} headers - Request headers
 * @property {string} correlationId - Correlation identifier
 */

/**
 * Availability Result
 * @typedef {Object} IAvailabilityResult
 * @property {boolean} available - Availability status
 * @property {string} source - Source identifier
 * @property {number} confidence - Confidence score (0-1)
 * @property {Object} metadata - Result metadata
 * @property {string} checkedAt - Check timestamp
 * @property {string} expiresAt - Expiration timestamp
 * @property {Array<string>} formats - Available formats
 * @property {Object} details - Additional details
 */

/**
 * Validation Result
 * @typedef {Object} IValidationResult
 * @property {boolean} valid - Validation status
 * @property {Array<string>} errors - Validation errors
 * @property {Array<string>} warnings - Validation warnings
 * @property {Object} details - Validation details
 */

/**
 * Health Status
 * @typedef {Object} IHealthStatus
 * @property {ServiceHealthStatus} status - Health status
 * @property {string} message - Status message
 * @property {Object} details - Health details
 * @property {string} timestamp - Status timestamp
 * @property {Object} dependencies - Dependency health
 */

/**
 * Service Metrics
 * @typedef {Object} IServiceMetrics
 * @property {number} totalRequests - Total requests
 * @property {number} successfulRequests - Successful requests
 * @property {number} failedRequests - Failed requests
 * @property {number} averageResponseTime - Average response time
 * @property {number} uptime - Service uptime
 * @property {Object} customMetrics - Custom metrics
 */

/**
 * Recovery Strategy
 * @typedef {Object} IRecoveryStrategy
 * @property {string} type - Strategy type
 * @property {number} maxAttempts - Maximum attempts
 * @property {number} backoffDelay - Backoff delay
 * @property {boolean} exponentialBackoff - Use exponential backoff
 * @property {Function} shouldRetry - Retry predicate
 */

module.exports = {
  // Interfaces
  IAvailabilityService,
  IServiceLifecycle,
  IServiceConfiguration,
  IServiceDiscovery,
  IServiceMonitoring,
  IErrorHandler,
  
  // Enums
  ServiceHealthStatus,
  ServiceState
};