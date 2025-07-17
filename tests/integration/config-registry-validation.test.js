/**
 * Configuration-Registry Integration Tests
 * Tests the integration between configuration management and service registry
 * Validates environment configuration and dependency injection
 */

const { serviceIntegration } = require('../../scripts/core/services/service-integration');
const { ConfigManager } = require('../../scripts/core/services/config-manager');
const AvailabilityConfig = require('../../src/core/availability-config');

describe('Configuration-Registry Integration Tests', () => {
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = 'test-api-key';
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Cleanup integration
    if (serviceIntegration.initialized) {
      await serviceIntegration.shutdown();
    }
  });

  describe('Environment Configuration Validation', () => {
    test('should validate required environment variables', async () => {
      await serviceIntegration.initialize();
      
      const availabilityConfig = serviceIntegration.getService('availability-config');
      expect(availabilityConfig).toBeDefined();
      expect(availabilityConfig.isEnabled()).toBe(true);
      
      // Check that configuration was properly initialized
      const validation = await serviceIntegration.validateDependencies();
      expect(validation.overall_valid).toBe(true);
    });

    test('should handle missing API_KEY gracefully', async () => {
      delete process.env.API_KEY;
      
      try {
        await serviceIntegration.initialize();
        // Should still work (API_KEY is optional for some services)
        expect(serviceIntegration.initialized).toBe(true);
      } catch (error) {
        // If it fails, should be due to missing API_KEY
        expect(error.message).toContain('API_KEY');
      }
    });

    test('should validate service configurations', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      expect(configManager).toBeDefined();
      
      // Test config manager functionality
      const kuConfig = configManager.getConfig('kindle_unlimited');
      expect(kuConfig).toBeDefined();
      expect(kuConfig.name).toBe('Kindle Unlimited');
      expect(kuConfig.enabled).toBe(true);
      
      const hooplaConfig = configManager.getConfig('hoopla');
      expect(hooplaConfig).toBeDefined();
      expect(hooplaConfig.name).toBe('Hoopla Digital');
      expect(hooplaConfig.enabled).toBe(true);
    });

    test('should handle invalid environment configurations', async () => {
      // Set invalid timeout value
      process.env.AVAILABILITY_TIMEOUT = 'invalid-number';
      
      try {
        await serviceIntegration.initialize();
        // Should handle gracefully or throw meaningful error
        expect(serviceIntegration.initialized).toBe(true);
      } catch (error) {
        // Should provide meaningful error message
        expect(error.message).toContain('Configuration');
      }
    });
  });

  describe('Dependency Injection Validation', () => {
    test('should inject configuration into services', async () => {
      await serviceIntegration.initialize();
      
      // Get Kindle Unlimited service
      const kuService = serviceIntegration.getService('kindle-unlimited');
      expect(kuService).toBeDefined();
      expect(kuService.name).toBe('Kindle Unlimited');
      expect(kuService.config).toBeDefined();
      expect(kuService.config.name).toBe('Kindle Unlimited');
      
      // Get Hoopla service
      const hooplaService = serviceIntegration.getService('hoopla');
      expect(hooplaService).toBeDefined();
      expect(hooplaService.name).toBe('Hoopla Digital');
      expect(hooplaService.config).toBeDefined();
      expect(hooplaService.config.name).toBe('Hoopla Digital');
    });

    test('should resolve service dependencies correctly', async () => {
      await serviceIntegration.initialize();
      
      const dependencyValidation = await serviceIntegration.validateDependencies();
      expect(dependencyValidation.overall_valid).toBe(true);
      
      // Check that all services have their dependencies resolved
      Object.entries(dependencyValidation.validation_results).forEach(([serviceKey, result]) => {
        if (result.dependencies && result.dependencies.length > 0) {
          expect(result.valid).toBe(true);
          expect(result.resolved).toEqual(expect.arrayContaining(result.dependencies));
        }
      });
    });

    test('should handle configuration updates', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      
      // Update configuration
      configManager.updateConfig('kindle_unlimited', 'timeout', 20000);
      
      // Verify configuration was updated
      const updatedConfig = configManager.getConfig('kindle_unlimited');
      expect(updatedConfig.timeout).toBe(20000);
    });

    test('should validate service enabling/disabling', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      
      // Initially enabled
      expect(configManager.isServiceEnabled('kindle_unlimited')).toBe(true);
      
      // Disable service
      configManager.disableService('kindle_unlimited');
      expect(configManager.isServiceEnabled('kindle_unlimited')).toBe(false);
      
      // Re-enable service
      configManager.enableService('kindle_unlimited');
      expect(configManager.isServiceEnabled('kindle_unlimited')).toBe(true);
    });
  });

  describe('Service Registry Configuration', () => {
    test('should register services with proper metadata', async () => {
      await serviceIntegration.initialize();
      
      // Check Kindle Unlimited service metadata
      const kuMetadata = serviceIntegration.registry.getMetadata('kindle-unlimited');
      expect(kuMetadata).toBeDefined();
      expect(kuMetadata.name).toBe('Kindle Unlimited Service');
      expect(kuMetadata.capabilities).toContain('availability-check');
      expect(kuMetadata.dependencies).toContain('config-manager');
      expect(kuMetadata.dependencies).toContain('logger');
      expect(kuMetadata.tags).toContain('kindle');
      
      // Check Hoopla service metadata
      const hooplaMetadata = serviceIntegration.registry.getMetadata('hoopla');
      expect(hooplaMetadata).toBeDefined();
      expect(hooplaMetadata.name).toBe('Hoopla Digital Service');
      expect(hooplaMetadata.capabilities).toContain('availability-check');
      expect(hooplaMetadata.dependencies).toContain('config-manager');
      expect(hooplaMetadata.dependencies).toContain('logger');
      expect(hooplaMetadata.tags).toContain('hoopla');
    });

    test('should support service filtering by configuration', async () => {
      await serviceIntegration.initialize();
      
      // Get all availability services
      const availabilityServices = serviceIntegration.registry.getServicesByCapability('availability-check');
      expect(availabilityServices.length).toBeGreaterThan(0);
      
      // Filter enabled services
      const enabledServices = availabilityServices.filter(({ service }) => service.isEnabled());
      expect(enabledServices.length).toBeGreaterThan(0);
      
      // All enabled services should have configuration
      enabledServices.forEach(({ service }) => {
        expect(service.config).toBeDefined();
        expect(service.name).toBeDefined();
      });
    });

    test('should handle service configuration validation', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      
      // Test configuration validation
      const kuValidation = configManager.validateConfig('kindle_unlimited');
      expect(kuValidation.valid).toBe(true);
      expect(kuValidation.errors).toHaveLength(0);
      
      const hooplaValidation = configManager.validateConfig('hoopla');
      expect(hooplaValidation.valid).toBe(true);
      expect(hooplaValidation.errors).toHaveLength(0);
    });
  });

  describe('Environment-Specific Configuration', () => {
    test('should load test environment configuration', async () => {
      process.env.NODE_ENV = 'test';
      
      await serviceIntegration.initialize();
      
      // Check that test environment is detected
      expect(serviceIntegration.registry.isTest()).toBe(true);
      expect(serviceIntegration.registry.isDevelopment()).toBe(false);
      expect(serviceIntegration.registry.isProduction()).toBe(false);
    });

    test('should load development environment configuration', async () => {
      process.env.NODE_ENV = 'development';
      
      // Create a fresh instance for this test
      const { ServiceIntegration } = require('../../scripts/core/services/service-integration');
      const devIntegration = new ServiceIntegration();
      
      await devIntegration.initialize();
      
      // Check that development environment is detected
      expect(devIntegration.registry.isTest()).toBe(false);
      expect(devIntegration.registry.isDevelopment()).toBe(true);
      expect(devIntegration.registry.isProduction()).toBe(false);
      
      await devIntegration.shutdown();
    });

    test('should handle environment-specific service configurations', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      
      // Test environment should have specific configurations
      const enabledServices = configManager.getEnabledServices();
      expect(enabledServices).toContain('kindle_unlimited');
      expect(enabledServices).toContain('hoopla');
    });
  });

  describe('Configuration Health Monitoring', () => {
    test('should provide configuration health status', async () => {
      await serviceIntegration.initialize();
      
      const health = serviceIntegration.getHealthStatus();
      expect(health.status).toMatch(/healthy|degraded/);
      expect(health.initialized).toBe(true);
      expect(health.total_services).toBeGreaterThan(0);
    });

    test('should detect configuration errors', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      
      // Test invalid configuration
      const invalidValidation = configManager.validateConfig('non-existent');
      expect(invalidValidation.valid).toBe(false);
      expect(invalidValidation.errors).toContain('Configuration not found');
    });

    test('should provide configuration summary', async () => {
      await serviceIntegration.initialize();
      
      const configManager = serviceIntegration.getService('config-manager');
      const summary = configManager.getSummary();
      
      expect(summary.total).toBeGreaterThan(0);
      expect(summary.enabled).toBeGreaterThan(0);
      expect(summary.disabled).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(summary.services)).toBe(true);
    });
  });

  describe('Integration Error Handling', () => {
    test('should handle configuration initialization errors gracefully', async () => {
      // Mock AvailabilityConfig to throw error
      const originalInit = AvailabilityConfig.prototype.initialize;
      AvailabilityConfig.prototype.initialize = jest.fn().mockRejectedValue(new Error('Config initialization failed'));
      
      await expect(serviceIntegration.initialize()).rejects.toThrow('Config initialization failed');
      
      // Restore original method
      AvailabilityConfig.prototype.initialize = originalInit;
    });

    test('should handle service registration errors gracefully', async () => {
      await serviceIntegration.initialize();
      
      // Try to register service with invalid configuration
      const configManager = serviceIntegration.getService('config-manager');
      
      // This should not throw an error
      configManager.setConfig('invalid-service', {});
      
      // Validation should catch the error
      const validation = configManager.validateConfig('invalid-service');
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});