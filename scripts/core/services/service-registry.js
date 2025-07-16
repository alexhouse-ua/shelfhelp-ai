/**
 * Service Registry
 * Manages availability service instances and provides dependency injection
 */
class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.configs = new Map();
  }

  /**
   * Register a service instance
   * @param {string} key - Service key
   * @param {BaseAvailabilityService} service - Service instance
   */
  register(key, service) {
    this.services.set(key, service);
  }

  /**
   * Get a service instance by key
   * @param {string} key - Service key
   * @returns {BaseAvailabilityService|null} Service instance or null
   */
  get(key) {
    return this.services.get(key) || null;
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
      services: Array.from(this.services.keys())
    };
  }
}

module.exports = { ServiceRegistry };