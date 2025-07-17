/**
 * Availability Configuration Manager
 * Centralized configuration management for availability checking services
 * Provides environment validation, service-specific configs, and production detection
 */

const logger = require('../../scripts/core/logger');
const path = require('path');
const fs = require('fs');

class AvailabilityConfig {
  constructor() {
    this.config = {};
    this.validationErrors = [];
    this.environment = process.env.NODE_ENV || 'development';
    this.initialized = false;
  }

  /**
   * Initialize and validate availability configuration
   */
  async initialize() {
    try {
      // Load base configuration
      await this.loadBaseConfiguration();
      
      // Validate environment setup
      await this.validateEnvironment();
      
      // Setup service configurations
      this.setupServiceConfigurations();
      
      this.initialized = true;
      logger.info('AvailabilityConfig initialized successfully');
      
      return {
        success: true,
        validationErrors: this.validationErrors,
        environment: this.environment,
        services: this.getEnabledServices()
      };
    } catch (error) {
      logger.error('AvailabilityConfig initialization failed:', error);
      throw new Error(`Configuration initialization failed: ${error.message}`);
    }
  }

  /**
   * Load base configuration from environment and defaults
   */
  async loadBaseConfiguration() {
    this.config = {
      // Global settings
      global: {
        timeout: parseInt(process.env.AVAILABILITY_TIMEOUT) || 15000,
        retries: parseInt(process.env.AVAILABILITY_RETRIES) || 3,
        rateLimitMs: parseInt(process.env.RATE_LIMIT_MS) || 2000,
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || 3,
        userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        enableHealthMonitoring: process.env.ENABLE_HEALTH_MONITORING !== 'false'
      },
      
      // Service-specific configurations
      services: {
        kindleUnlimited: {
          enabled: process.env.KINDLE_UNLIMITED_ENABLED !== 'false',
          baseUrl: 'https://www.amazon.com',
          searchPath: '/s',
          timeout: parseInt(process.env.KU_TIMEOUT) || 12000,
          rateLimitMs: parseInt(process.env.KU_RATE_LIMIT) || 3000,
          confidenceThreshold: parseFloat(process.env.KU_CONFIDENCE) || 0.7
        },
        
        hoopla: {
          enabled: process.env.HOOPLA_ENABLED !== 'false',
          baseUrl: 'https://www.hoopladigital.com',
          searchPath: '/search',
          timeout: parseInt(process.env.HOOPLA_TIMEOUT) || 10000,
          rateLimitMs: parseInt(process.env.HOOPLA_RATE_LIMIT) || 2000,
          confidenceThreshold: parseFloat(process.env.HOOPLA_CONFIDENCE) || 0.8
        },
        
        libraries: {
          enabled: process.env.LIBRARIES_ENABLED !== 'false',
          systems: this.getLibrarySystems(),
          timeout: parseInt(process.env.LIBRARY_TIMEOUT) || 15000,
          rateLimitMs: parseInt(process.env.LIBRARY_RATE_LIMIT) || 3000,
          confidenceThreshold: parseFloat(process.env.LIBRARY_CONFIDENCE) || 0.6
        }
      }
    };
  }

  /**
   * Get library systems configuration
   */
  getLibrarySystems() {
    return [
      {
        key: 'tuscaloosa_public',
        name: 'Tuscaloosa Public Library',
        catalogUrl: 'https://tuscaloosa.overdrive.com',
        searchEndpoint: '/search',
        enabled: process.env.TUSCALOOSA_ENABLED !== 'false'
      },
      {
        key: 'camellia_net',
        name: 'Camellia Net',
        catalogUrl: 'https://camellia.overdrive.com',
        searchEndpoint: '/search',
        enabled: process.env.CAMELLIA_ENABLED !== 'false'
      },
      {
        key: 'seattle_public',
        name: 'Seattle Public Library',
        catalogUrl: 'https://seattle.overdrive.com',
        searchEndpoint: '/search',
        enabled: process.env.SEATTLE_ENABLED !== 'false'
      }
    ];
  }

  /**
   * Validate environment configuration with early failure detection
   */
  async validateEnvironment() {
    const validationResults = [];
    
    // Check Node.js version
    const nodeVersion = process.version;
    const minNodeVersion = '18.0.0';
    if (this.compareVersions(nodeVersion.slice(1), minNodeVersion) < 0) {
      const error = `Node.js version ${nodeVersion} is below minimum required ${minNodeVersion}`;
      this.validationErrors.push(error);
      validationResults.push({ type: 'error', message: error });
    }
    
    // Validate required environment variables
    const requiredEnvVars = [
      'API_KEY'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        const error = `Missing required environment variable: ${envVar}`;
        this.validationErrors.push(error);
        validationResults.push({ type: 'error', message: error });
      }
    }
    
    // Validate optional configuration values
    this.validateOptionalConfiguration(validationResults);
    
    // Validate service configurations
    await this.validateServiceConfigurations(validationResults);
    
    // Early failure if critical errors exist
    const criticalErrors = validationResults.filter(r => r.type === 'error');
    if (criticalErrors.length > 0 && this.isProduction()) {
      throw new Error(`Critical configuration errors in production: ${criticalErrors.map(e => e.message).join(', ')}`);
    }
    
    logger.info(`Environment validation completed: ${validationResults.length} checks, ${criticalErrors.length} errors`);
    return validationResults;
  }

  /**
   * Validate optional configuration values
   */
  validateOptionalConfiguration(validationResults) {
    const checks = [
      {
        key: 'AVAILABILITY_TIMEOUT',
        value: this.config.global.timeout,
        min: 5000,
        max: 60000,
        type: 'number'
      },
      {
        key: 'MAX_CONCURRENT',
        value: this.config.global.maxConcurrent,
        min: 1,
        max: 10,
        type: 'number'
      },
      {
        key: 'RATE_LIMIT_MS',
        value: this.config.global.rateLimitMs,
        min: 1000,
        max: 10000,
        type: 'number'
      }
    ];
    
    for (const check of checks) {
      if (check.type === 'number') {
        if (check.value < check.min || check.value > check.max) {
          const warning = `${check.key}=${check.value} outside recommended range [${check.min}, ${check.max}]`;
          validationResults.push({ type: 'warning', message: warning });
        }
      }
    }
  }

  /**
   * Validate service-specific configurations
   */
  async validateServiceConfigurations(validationResults) {
    const services = this.config.services;
    
    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      if (!serviceConfig.enabled) {
        validationResults.push({ 
          type: 'info', 
          message: `Service ${serviceName} is disabled` 
        });
        continue;
      }
      
      // Validate service-specific configuration
      if (serviceConfig.baseUrl && !this.isValidUrl(serviceConfig.baseUrl)) {
        const error = `Invalid base URL for ${serviceName}: ${serviceConfig.baseUrl}`;
        this.validationErrors.push(error);
        validationResults.push({ type: 'error', message: error });
      }
      
      if (serviceConfig.timeout && (serviceConfig.timeout < 1000 || serviceConfig.timeout > 60000)) {
        const warning = `Timeout for ${serviceName} (${serviceConfig.timeout}ms) outside recommended range`;
        validationResults.push({ type: 'warning', message: warning });
      }
      
      if (serviceConfig.confidenceThreshold && (serviceConfig.confidenceThreshold < 0 || serviceConfig.confidenceThreshold > 1)) {
        const error = `Invalid confidence threshold for ${serviceName}: ${serviceConfig.confidenceThreshold}`;
        this.validationErrors.push(error);
        validationResults.push({ type: 'error', message: error });
      }
    }
  }

  /**
   * Setup service configurations with environment-specific overrides
   */
  setupServiceConfigurations() {
    // Production optimizations
    if (this.isProduction()) {
      this.config.global.timeout = Math.min(this.config.global.timeout, 20000);
      this.config.global.rateLimitMs = Math.max(this.config.global.rateLimitMs, 2000);
      this.config.global.maxConcurrent = Math.min(this.config.global.maxConcurrent, 2);
    }
    
    // Development optimizations
    if (this.isDevelopment()) {
      this.config.global.enableHealthMonitoring = true;
      this.config.global.retries = Math.min(this.config.global.retries, 2);
    }
    
    // Test environment configurations
    if (this.isTest()) {
      this.config.global.timeout = 5000;
      this.config.global.rateLimitMs = 100;
      this.config.global.maxConcurrent = 1;
      this.config.global.enableHealthMonitoring = false;
    }
  }

  /**
   * Get configuration for a specific service
   */
  getServiceConfig(serviceName) {
    if (!this.initialized) {
      throw new Error('AvailabilityConfig not initialized. Call initialize() first.');
    }
    
    const serviceConfig = this.config.services[serviceName];
    if (!serviceConfig) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    
    return {
      ...this.config.global,
      ...serviceConfig
    };
  }

  /**
   * Get all enabled services
   */
  getEnabledServices() {
    if (!this.initialized) {
      return {};
    }
    
    const enabledServices = {};
    for (const [serviceName, serviceConfig] of Object.entries(this.config.services)) {
      if (serviceConfig.enabled) {
        enabledServices[serviceName] = {
          name: serviceConfig.name || serviceName,
          enabled: true,
          baseUrl: serviceConfig.baseUrl,
          timeout: serviceConfig.timeout,
          confidenceThreshold: serviceConfig.confidenceThreshold
        };
      }
    }
    
    return enabledServices;
  }

  /**
   * Environment detection methods
   */
  isProduction() {
    return this.environment === 'production';
  }

  isDevelopment() {
    return this.environment === 'development';
  }

  isTest() {
    return this.environment === 'test';
  }

  /**
   * Get global timeout value
   */
  getDefaultTimeout() {
    return this.config.global?.timeout || 15000;
  }

  /**
   * Get validation status
   */
  getValidationStatus() {
    return {
      initialized: this.initialized,
      errors: this.validationErrors,
      environment: this.environment,
      hasErrors: this.validationErrors.length > 0
    };
  }

  /**
   * Utility methods
   */
  compareVersions(version1, version2) {
    const v1 = version1.split('.').map(Number);
    const v2 = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const n1 = v1[i] || 0;
      const n2 = v2[i] || 0;
      
      if (n1 > n2) {return 1;}
      if (n1 < n2) {return -1;}
    }
    
    return 0;
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Static factory method for singleton pattern
   */
  static getInstance() {
    if (!AvailabilityConfig.instance) {
      AvailabilityConfig.instance = new AvailabilityConfig();
    }
    return AvailabilityConfig.instance;
  }
}

module.exports = AvailabilityConfig;