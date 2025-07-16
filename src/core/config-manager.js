/**
 * Configuration Manager
 * Handles environment variable validation, credential verification, and configuration loading
 * Supports multiple library systems with graceful degradation
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class ConfigurationManager {
  constructor() {
    this.config = {};
    this.validationErrors = [];
    this.initialized = false;
  }

  /**
   * Initialize configuration with environment validation
   */
  async initialize() {
    try {
      // Load environment-specific configuration
      await this.loadEnvironmentConfig();
      
      // Validate required environment variables
      await this.validateEnvironmentVariables();
      
      // Validate scraping configurations
      await this.validateScrapingConfigurations();
      
      // Set up service configurations
      this.setupServiceConfigurations();
      
      this.initialized = true;
      logger.info('Configuration manager initialized successfully');
      
      return {
        success: true,
        validationErrors: this.validationErrors,
        enabledServices: this.getEnabledServices()
      };
    } catch (error) {
      logger.error('Configuration initialization failed:', error);
      throw new Error(`Configuration initialization failed: ${error.message}`);
    }
  }

  /**
   * Load environment-specific configuration file
   */
  async loadEnvironmentConfig() {
    const environment = process.env.NODE_ENV || 'development';
    const configPath = path.join(__dirname, '../../config/environments', `${environment}.json`);
    
    try {
      if (fs.existsSync(configPath)) {
        const configData = await fs.promises.readFile(configPath, 'utf-8');
        this.config.environment = JSON.parse(configData);
        logger.info(`Loaded ${environment} configuration`);
      } else {
        logger.warn(`Environment config not found: ${configPath}, using defaults`);
        this.config.environment = this.getDefaultConfig();
      }
    } catch (error) {
      logger.error(`Error loading environment config: ${error.message}`);
      this.config.environment = this.getDefaultConfig();
    }
  }

  /**
   * Validate required environment variables
   */
  async validateEnvironmentVariables() {
    const requiredVars = {
      // Core API
      API_KEY: {
        required: true,
        description: 'API key for AI assistant authentication',
        validator: (value) => value && value.length >= 16
      },
      
      // Firebase (optional but recommended)
      FIREBASE_PROJECT_ID: {
        required: false,
        description: 'Firebase project ID for real-time sync',
        validator: (value) => !value || /^[a-z0-9-]+$/.test(value)
      },
      
      // Goodreads RSS
      GOODREADS_RSS_URL: {
        required: false,
        description: 'Goodreads RSS feed URL for preference learning',
        validator: (value) => !value || value.startsWith('https://www.goodreads.com/review/list_rss/')
      }
    };

    for (const [varName, config] of Object.entries(requiredVars)) {
      const value = process.env[varName];
      
      if (config.required && !value) {
        this.validationErrors.push({
          type: 'missing_required',
          variable: varName,
          description: config.description,
          severity: 'error'
        });
      } else if (value && config.validator && !config.validator(value)) {
        this.validationErrors.push({
          type: 'invalid_format',
          variable: varName,
          description: config.description,
          value: value.substring(0, 10) + '...',
          severity: 'warning'
        });
      } else if (value) {
        logger.info(`✅ ${varName}: Configured`);
      } else {
        logger.info(`ℹ️  ${varName}: Not configured (optional)`);
      }
    }

    if (this.validationErrors.filter(e => e.severity === 'error').length > 0) {
      throw new Error(`Required environment variables missing: ${this.validationErrors.filter(e => e.severity === 'error').map(e => e.variable).join(', ')}`);
    }
  }

  /**
   * Validate scraping configurations
   */
  async validateScrapingConfigurations() {
    const configurations = {
      firebase: await this.validateFirebaseCredentials(),
      scrapers: await this.validateScrapingSetup(),
      goodreads: this.validateGoodreadsRSS()
    };

    this.config.configurations = configurations;
    return configurations;
  }

  /**
   * Validate Firebase credentials
   */
  async validateFirebaseCredentials() {
    const validation = { 
      valid: false, 
      method: 'none',
      error: null 
    };

    try {
      // Check for service account file
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (fs.existsSync(credPath)) {
          validation.valid = true;
          validation.method = 'service_account_file';
          logger.info('✅ Firebase: Service account file found');
        } else {
          validation.error = 'Service account file not found';
          logger.warn('⚠️  Firebase: Service account file path invalid');
        }
      }
      // Check for direct environment variables
      else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        validation.valid = true;
        validation.method = 'environment_variables';
        logger.info('✅ Firebase: Environment variables configured');
      }
      // Check for basic Firebase config
      else if (process.env.FIREBASE_PROJECT_ID) {
        validation.valid = true;
        validation.method = 'basic_config';
        validation.limited = true;
        logger.info('ℹ️  Firebase: Basic configuration only (limited functionality)');
      } else {
        validation.error = 'No Firebase credentials configured';
        logger.info('ℹ️  Firebase: Not configured (optional service)');
      }
    } catch (error) {
      validation.error = error.message;
      logger.warn(`⚠️  Firebase validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Validate web scraping setup
   */
  async validateScrapingSetup() {
    const scrapers = {
      kindle_unlimited: {
        name: 'Kindle Unlimited Scraper',
        enabled: true,
        method: 'amazon_search',
        target_url: 'https://www.amazon.com/s'
      },
      hoopla: {
        name: 'Hoopla Scraper',
        enabled: true,
        method: 'public_search',
        target_url: 'https://www.hoopladigital.com/search'
      },
      libraries: {
        name: 'Library Systems Scraper',
        enabled: true,
        method: 'overdrive_catalog_search',
        supported_systems: [
          'tuscaloosa.overdrive.com',
          'camellia.overdrive.com', 
          'seattle.overdrive.com'
        ]
      }
    };

    logger.info('✅ Web scraping: All scrapers configured for public access');
    logger.info('ℹ️  No API credentials required - using web scraping approach');
    
    return scrapers;
  }

  /**
   * Validate Goodreads RSS configuration
   */
  validateGoodreadsRSS() {
    const validation = {
      enabled: false,
      url: null,
      error: null
    };

    const rssUrl = process.env.GOODREADS_RSS_URL;

    if (rssUrl) {
      if (rssUrl.startsWith('https://www.goodreads.com/review/list_rss/')) {
        validation.enabled = true;
        validation.url = rssUrl;
        logger.info('✅ Goodreads RSS: Configured for preference learning');
      } else {
        validation.error = 'Invalid RSS URL format';
        logger.warn('⚠️  Goodreads RSS: Invalid URL format');
      }
    } else {
      logger.info('ℹ️  Goodreads RSS: Not configured');
    }

    return validation;
  }

  /**
   * Setup service configurations based on validated scraping setup
   */
  setupServiceConfigurations() {
    this.config.services = {
      kindle_unlimited: {
        enabled: true,
        method: 'web_scraping',
        search_url: 'https://www.amazon.com/s',
        timeout: 15000,
        rate_limit_ms: 2000,
        user_agents: [
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]
      },
      
      hoopla: {
        enabled: true,
        method: 'web_scraping',
        search_url: 'https://www.hoopladigital.com/search',
        timeout: 10000,
        rate_limit_ms: 1500,
        supports_formats: ['ebook', 'audiobook']
      },
      
      libraries: this.setupLibraryScrapingConfigurations(),
      
      firebase: {
        enabled: this.config.configurations.firebase.valid,
        method: this.config.configurations.firebase.method,
        gracefulDegradation: this.config.environment.firebase?.gracefulDegradation || true
      }
    };
  }

  /**
   * Setup library scraping configurations
   */
  setupLibraryScrapingConfigurations() {
    // All major library systems available via web scraping
    const libraries = {
      tuscaloosa_public: {
        name: 'Tuscaloosa Public Library',
        method: 'overdrive_catalog_scraping',
        catalog_url: 'https://tuscaloosa.overdrive.com',
        search_endpoint: '/search',
        enabled: true,
        rate_limit_ms: 3000
      },
      camellia_net: {
        name: 'Camellia Net',
        method: 'overdrive_catalog_scraping', 
        catalog_url: 'https://camellia.overdrive.com',
        search_endpoint: '/search',
        enabled: true,
        rate_limit_ms: 3000
      },
      seattle_public: {
        name: 'Seattle Public Library',
        method: 'overdrive_catalog_scraping',
        catalog_url: 'https://seattle.overdrive.com',
        search_endpoint: '/search',
        enabled: true,
        rate_limit_ms: 3000
      }
    };
    
    logger.info(`📚 Library scrapers: ${Object.keys(libraries).length} systems configured`);
    return libraries;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      port: 3000,
      cors: {
        enabled: true,
        origins: ["http://localhost:3000", "https://chatgpt.com", "https://claude.ai"],
        credentials: true
      },
      rateLimit: {
        windowMs: 900000,
        max: 1000,
        aiOptimized: true
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json'
      },
      firebase: {
        enabled: false,
        gracefulDegradation: true
      },
      security: {
        helmet: true,
        authRequired: true
      }
    };
  }

  /**
   * Get enabled services summary
   */
  getEnabledServices() {
    if (!this.initialized) {
      return { error: 'Configuration not initialized' };
    }

    const enabledLibraries = Object.keys(this.config.services.libraries).length;
    
    return {
      scraping_services: {
        kindle_unlimited: true,
        hoopla: true,
        libraries: enabledLibraries
      },
      library_systems: {
        count: enabledLibraries,
        names: Object.values(this.config.services.libraries).map(lib => lib.name),
        method: 'web_scraping'
      },
      optional_services: {
        firebase: this.config.services.firebase.enabled,
        goodreads_rss: this.config.configurations.goodreads.enabled
      },
      scraping_method: 'web_only',
      api_dependencies: 'none'
    };
  }

  /**
   * Get configuration for service
   */
  getServiceConfig(serviceName) {
    if (!this.initialized) {
      throw new Error('Configuration not initialized');
    }
    
    return this.config.services[serviceName] || null;
  }

  /**
   * Get all configurations
   */
  getAllConfigs() {
    if (!this.initialized) {
      throw new Error('Configuration not initialized');
    }
    
    return {
      environment: this.config.environment,
      services: this.config.services,
      validation_errors: this.validationErrors,
      enabled_services: this.getEnabledServices()
    };
  }

  /**
   * Health check for configuration
   */
  healthCheck() {
    const health = {
      status: 'healthy',
      initialized: this.initialized,
      errors: this.validationErrors.filter(e => e.severity === 'error'),
      warnings: this.validationErrors.filter(e => e.severity === 'warning'),
      timestamp: new Date().toISOString()
    };

    if (health.errors.length > 0) {
      health.status = 'unhealthy';
    } else if (health.warnings.length > 0) {
      health.status = 'degraded';
    }

    return health;
  }
}

// Create singleton instance
const configManager = new ConfigurationManager();

module.exports = configManager;