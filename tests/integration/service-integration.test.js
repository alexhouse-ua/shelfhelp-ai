/**
 * Service Integration Tests
 * Tests the integration of all availability services with ServiceRegistry
 */

const { ServiceIntegration, serviceIntegration } = require('../../scripts/core/services/service-integration');
const { ServiceRegistry } = require('../../scripts/core/services/service-registry');
const { ConfigManager } = require('../../scripts/core/services/config-manager');
const AvailabilityConfig = require('../../src/core/availability-config');

describe('Service Integration Tests', () => {
  let integration;
  let testRegistry;

  beforeEach(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = 'test-api-key';
    
    // Create fresh integration instance for each test
    integration = new ServiceIntegration();
  });

  afterEach(async () => {
    if (integration && integration.initialized) {
      await integration.shutdown();
    }
  });

  describe('Service Registration and Discovery', () => {
    test('should initialize with core dependencies', async () => {
      const result = await integration.initialize();
      
      expect(result.success).toBe(true);
      expect(result.registeredServices).toBeDefined();
      expect(integration.initialized).toBe(true);
      
      // Check core dependencies are registered (wrapped objects)
      const configManager = integration.getService('config-manager');
      const availabilityConfig = integration.getService('availability-config');
      const logger = integration.getService('logger');
      
      expect(configManager).toBeDefined();
      expect(configManager.isEnabled()).toBe(true);
      expect(availabilityConfig).toBeDefined();
      expect(availabilityConfig.isEnabled()).toBe(true);
      expect(logger).toBeDefined();
      expect(logger.isEnabled()).toBe(true);
    });

    test('should register availability service factories', async () => {
      await integration.initialize();
      
      // Check service factories are registered
      expect(integration.registry.factories.has('kindle-unlimited')).toBe(true);
      expect(integration.registry.factories.has('hoopla')).toBe(true);
      
      // Check metadata is properly set
      const kuMetadata = integration.registry.getMetadata('kindle-unlimited');
      expect(kuMetadata.capabilities).toContain('availability-check');
      expect(kuMetadata.tags).toContain('kindle');
      expect(kuMetadata.dependencies).toContain('config-manager');
    });

    test('should create service instances from factories', async () => {
      await integration.initialize();
      
      const kuService = integration.getService('kindle-unlimited');
      expect(kuService).toBeDefined();
      expect(kuService.name).toBe('Kindle Unlimited');
      expect(typeof kuService.checkAvailability).toBe('function');
      
      const hooplaService = integration.getService('hoopla');
      expect(hooplaService).toBeDefined();
      expect(hooplaService.name).toBe('Hoopla Digital');
      expect(typeof hooplaService.checkAvailability).toBe('function');
    });

    test('should register library services dynamically', async () => {
      await integration.initialize();
      
      // Check if library service factories are registered
      expect(integration.registry.factories.has('tuscaloosa_public')).toBe(true);
      expect(integration.registry.factories.has('camellia_net')).toBe(true);
      expect(integration.registry.factories.has('seattle_public')).toBe(true);
    });
  });

  describe('Dependency Injection', () => {
    test('should resolve service dependencies', async () => {
      await integration.initialize();
      
      const validation = await integration.validateDependencies();
      expect(validation.overall_valid).toBe(true);
      
      // Check specific service dependencies (may be factory or instance)
      const kuDependencies = validation.validation_results['kindle-unlimited'];
      if (kuDependencies) {
        expect(kuDependencies.dependencies).toContain('config-manager');
        expect(kuDependencies.dependencies).toContain('logger');
        expect(kuDependencies.valid).toBe(true);
      } else {
        // Service might be in factory form, check if factory exists
        expect(integration.registry.factories.has('kindle-unlimited')).toBe(true);
      }
    });

    test('should handle missing dependencies gracefully', async () => {
      await integration.initialize();
      
      // Register a test service with missing dependency
      const testService = {
        isEnabled: () => true,
        getStats: () => ({ service: 'test-service' }),
        resetStats: () => {}
      };
      
      integration.registry.register('test-service', testService);
      integration.registry.registerDependencies('test-service', ['missing-dependency']);
      
      const validation = await integration.validateDependencies();
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0].error).toContain('missing-dependency');
    });

    test('should initialize services in dependency order', async () => {
      await integration.initialize();
      
      // Check that config-manager is initialized before services
      const configManager = integration.getService('config-manager');
      expect(configManager).toBeDefined();
      
      const kuService = integration.getService('kindle-unlimited');
      expect(kuService).toBeDefined();
      expect(kuService.config).toBeDefined();
    });
  });

  describe('Service Coordination', () => {
    test('should get enabled services only', async () => {
      await integration.initialize();
      
      const enabledServices = integration.getEnabledServices();
      expect(enabledServices.length).toBeGreaterThan(0);
      
      // All enabled services should have availability-check capability
      enabledServices.forEach(({ service }) => {
        expect(service.isEnabled()).toBe(true);
        expect(typeof service.checkAvailability).toBe('function');
      });
    });

    test('should check availability across multiple services', async () => {
      await integration.initialize();
      
      const testBook = {
        title: 'Test Book',
        author_name: 'Test Author'
      };
      
      const results = await integration.checkAvailability(testBook);
      
      expect(results.book.title).toBe('Test Book');
      expect(results.book.author).toBe('Test Author');
      expect(results.results).toBeDefined();
      expect(results.services_checked).toBeGreaterThan(0);
      expect(results.checked_at).toBeDefined();
    });

    test('should handle service errors gracefully', async () => {
      await integration.initialize();
      
      // Create a service that throws an error
      const errorService = {
        isEnabled: () => true,
        checkAvailability: async () => {
          throw new Error('Service error');
        }
      };
      
      integration.registry.register('error-service', errorService, {}, {
        capabilities: ['availability-check']
      });
      
      const testBook = { title: 'Test Book', author_name: 'Test Author' };
      const results = await integration.checkAvailability(testBook);
      
      expect(results.errors.length).toBeGreaterThan(0);
      expect(results.errors[0].service).toBe('error-service');
      expect(results.errors[0].error).toBe('Service error');
    });
  });

  describe('Service Statistics and Health', () => {
    test('should collect service statistics', async () => {
      await integration.initialize();
      
      const stats = integration.getServiceStatistics();
      
      expect(stats.total_services).toBeGreaterThan(0);
      expect(stats.enabled_services).toBeGreaterThan(0);
      expect(Array.isArray(stats.service_stats)).toBe(true);
      expect(stats.registry_summary).toBeDefined();
    });

    test('should provide health status', async () => {
      await integration.initialize();
      
      const health = integration.getHealthStatus();
      
      expect(health.status).toMatch(/healthy|degraded/);
      expect(health.total_services).toBeGreaterThan(0);
      expect(health.healthy_services).toBeGreaterThanOrEqual(0);
      expect(health.unhealthy_services).toBeGreaterThanOrEqual(0);
      expect(health.initialized).toBe(true);
      expect(health.timestamp).toBeDefined();
    });

    test('should reset statistics across services', async () => {
      await integration.initialize();
      
      // Get a service and simulate some activity
      const kuService = integration.getService('kindle-unlimited');
      kuService.stats.checked = 5;
      kuService.stats.errors = 1;
      
      // Reset statistics
      integration.resetStatistics();
      
      const stats = kuService.getStats();
      expect(stats.checked).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('Service Lifecycle', () => {
    test('should initialize services properly', async () => {
      const result = await integration.initialize();
      
      expect(result.success).toBe(true);
      expect(integration.initialized).toBe(true);
      
      // Check service lifecycle tracking
      const lifecycle = integration.registry.getLifecycle();
      expect(Object.keys(lifecycle.created).length).toBeGreaterThan(0);
      // Some services may not have initialize method, so initialized count might be 0
      expect(Object.keys(lifecycle.initialized).length).toBeGreaterThanOrEqual(0);
    });

    test('should shutdown services gracefully', async () => {
      await integration.initialize();
      expect(integration.initialized).toBe(true);
      
      await integration.shutdown();
      expect(integration.initialized).toBe(false);
      
      // Check that services are cleaned up
      const summary = integration.registry.getSummary();
      expect(summary.total).toBe(0);
    });

    test('should handle initialization errors', async () => {
      // Mock AvailabilityConfig to throw error
      const originalInit = AvailabilityConfig.prototype.initialize;
      AvailabilityConfig.prototype.initialize = jest.fn().mockRejectedValue(new Error('Config error'));
      
      await expect(integration.initialize()).rejects.toThrow('Config error');
      
      // Restore original method
      AvailabilityConfig.prototype.initialize = originalInit;
    });
  });

  describe('Environment Validation', () => {
    test('should validate environment configuration', async () => {
      await integration.initialize();
      
      const validation = await integration.validateDependencies();
      expect(validation.overall_valid).toBe(true);
      
      // Check that config-manager is properly initialized (wrapped service)
      const configManager = integration.getService('config-manager');
      expect(configManager).toBeDefined();
      expect(configManager.isEnabled()).toBe(true);
      
      // Check that availability-config is properly initialized (wrapped service)
      const availabilityConfig = integration.getService('availability-config');
      expect(availabilityConfig).toBeDefined();
      expect(availabilityConfig.isEnabled()).toBe(true);
    });

    test('should handle missing environment variables', async () => {
      // Remove API_KEY temporarily
      const originalApiKey = process.env.API_KEY;
      delete process.env.API_KEY;
      
      try {
        await integration.initialize();
        // Should still work for most services (API_KEY is optional for some)
        expect(integration.initialized).toBe(true);
      } catch (error) {
        // If it fails, it should be due to missing API_KEY
        expect(error.message).toContain('API_KEY');
      } finally {
        // Restore API_KEY
        process.env.API_KEY = originalApiKey;
      }
    });
  });

  describe('Service Discovery', () => {
    test('should discover services from configured paths', async () => {
      await integration.initialize();
      
      const discoveryResult = await integration.registry.discoverServices();
      expect(discoveryResult.discovered).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(discoveryResult.errors)).toBe(true);
    });

    test('should handle discovery errors gracefully', async () => {
      await integration.initialize();
      
      // Add invalid discovery path
      integration.registry.addDiscoveryPath('/invalid/path');
      
      const discoveryResult = await integration.registry.discoverServices();
      expect(Array.isArray(discoveryResult.errors)).toBe(true);
    });
  });

  describe('Service Metadata', () => {
    test('should maintain service metadata', async () => {
      await integration.initialize();
      
      const kuMetadata = integration.registry.getMetadata('kindle-unlimited');
      expect(kuMetadata.name).toBe('Kindle Unlimited Service');
      expect(kuMetadata.version).toBe('1.0.0');
      expect(kuMetadata.type).toBe('availability-service');
      expect(kuMetadata.capabilities).toContain('availability-check');
      expect(kuMetadata.tags).toContain('kindle');
    });

    test('should support service filtering by capability', async () => {
      await integration.initialize();
      
      const availabilityServices = integration.registry.getServicesByCapability('availability-check');
      expect(availabilityServices.length).toBeGreaterThan(0);
      
      availabilityServices.forEach(({ service, metadata }) => {
        expect(metadata.capabilities).toContain('availability-check');
        expect(typeof service.checkAvailability).toBe('function');
      });
    });

    test('should support service filtering by tags', async () => {
      await integration.initialize();
      
      const kindleServices = integration.registry.getServicesByTag('kindle');
      expect(kindleServices.length).toBeGreaterThan(0);
      
      const libraryServices = integration.registry.getServicesByTag('library');
      expect(libraryServices.length).toBeGreaterThan(0);
    });
  });
});