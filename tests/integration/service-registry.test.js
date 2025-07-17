/**
 * Integration Tests for Service Registry
 * Tests service registry functionality, mocking, and lifecycle management
 */

const { ServiceRegistry } = require('../../scripts/core/services/service-registry');
const AvailabilityConfig = require('../../src/core/availability-config');

describe('ServiceRegistry Integration Tests', () => {
  let registry;
  let config;

  beforeEach(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = 'test-api-key';
    
    registry = new ServiceRegistry();
    config = new AvailabilityConfig();
    await config.initialize();
  });

  afterEach(async () => {
    await registry.destroyAll();
  });

  describe('Service Registration and Retrieval', () => {
    test('should register and retrieve services', () => {
      const mockService = {
        name: 'test-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('test', mockService);
      
      const retrieved = registry.get('test');
      expect(retrieved).toBe(mockService);
      expect(registry.has('test')).toBe(true);
    });

    test('should register service with configuration', () => {
      const mockService = {
        name: 'configured-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      const serviceConfig = {
        timeout: 5000,
        retries: 3
      };

      registry.register('configured', mockService, serviceConfig);
      
      const retrieved = registry.get('configured');
      expect(retrieved).toBe(mockService);
      expect(registry.configs.get('configured')).toEqual(serviceConfig);
    });

    test('should return null for non-existent service', () => {
      const retrieved = registry.get('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Factory Pattern', () => {
    test('should register and create service from factory', () => {
      const mockFactory = jest.fn(() => ({
        name: 'factory-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      }));

      registry.registerFactory('factory-test', mockFactory, { timeout: 10000 });
      
      const service = registry.get('factory-test');
      expect(mockFactory).toHaveBeenCalled();
      expect(service.name).toBe('factory-service');
    });

    test('should create service with factory configuration', () => {
      const factoryConfig = { timeout: 15000, retries: 5 };
      const mockFactory = jest.fn((config) => ({
        name: 'config-service',
        config: config,
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      }));

      registry.registerFactory('config-factory', mockFactory, factoryConfig);
      
      const service = registry.get('config-factory');
      expect(mockFactory).toHaveBeenCalledWith(expect.objectContaining(factoryConfig));
      expect(service.config).toEqual(expect.objectContaining(factoryConfig));
    });

    test('should throw error for factory without registration', () => {
      expect(() => registry.create('missing-factory')).toThrow('No factory registered for service: missing-factory');
    });
  });

  describe('Service Mocking', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      registry = new ServiceRegistry();
    });

    afterEach(() => {
      process.env.NODE_ENV = 'development';
    });

    test('should register and use mock services in test environment', () => {
      const mockService = {
        name: 'mock-service',
        mockMethod: () => 'mocked-result',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.registerMock('test-service', mockService);
      
      const retrieved = registry.get('test-service');
      expect(retrieved).toBe(mockService);
      expect(retrieved.mockMethod()).toBe('mocked-result');
      expect(registry.isMocked('test-service')).toBe(true);
    });

    test('should prefer real service over mock in non-test environment', () => {
      process.env.NODE_ENV = 'development';
      registry = new ServiceRegistry();

      const realService = {
        name: 'real-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      const mockService = {
        name: 'mock-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('service', realService);
      registry.registerMock('service', mockService);
      
      const retrieved = registry.get('service');
      expect(retrieved).toBe(realService);
    });

    test('should remove mock services', () => {
      const mockService = {
        name: 'mock-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.registerMock('test-service', mockService);
      expect(registry.isMocked('test-service')).toBe(true);
      
      registry.removeMock('test-service');
      expect(registry.isMocked('test-service')).toBe(false);
    });

    test('should clear all mocks', () => {
      const mockService1 = { name: 'mock1', isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const mockService2 = { name: 'mock2', isEnabled: () => true, getStats: () => ({ calls: 0 }) };

      registry.registerMock('service1', mockService1);
      registry.registerMock('service2', mockService2);
      
      expect(registry.isMocked('service1')).toBe(true);
      expect(registry.isMocked('service2')).toBe(true);
      
      registry.clearMocks();
      
      expect(registry.isMocked('service1')).toBe(false);
      expect(registry.isMocked('service2')).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    test('should initialize service with initialize method', async () => {
      const mockService = {
        name: 'lifecycle-service',
        initialized: false,
        initialize: jest.fn(async () => {
          mockService.initialized = true;
        }),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('lifecycle', mockService);
      
      await registry.initialize('lifecycle');
      
      expect(mockService.initialize).toHaveBeenCalled();
      expect(mockService.initialized).toBe(true);
    });

    test('should handle service without initialize method', async () => {
      const mockService = {
        name: 'simple-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('simple', mockService);
      
      await expect(registry.initialize('simple')).resolves.toBe(mockService);
    });

    test('should initialize all services', async () => {
      const mockService1 = {
        name: 'service1',
        initialized: false,
        initialize: jest.fn(async () => { mockService1.initialized = true; }),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      const mockService2 = {
        name: 'service2',
        initialized: false,
        initialize: jest.fn(async () => { mockService2.initialized = true; }),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('service1', mockService1);
      registry.register('service2', mockService2);
      
      await registry.initializeAll();
      
      expect(mockService1.initialize).toHaveBeenCalled();
      expect(mockService2.initialize).toHaveBeenCalled();
      expect(mockService1.initialized).toBe(true);
      expect(mockService2.initialized).toBe(true);
    });

    test('should destroy service with destroy method', async () => {
      const mockService = {
        name: 'destroyable-service',
        destroyed: false,
        destroy: jest.fn(async () => {
          mockService.destroyed = true;
        }),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('destroyable', mockService);
      
      await registry.destroy('destroyable');
      
      expect(mockService.destroy).toHaveBeenCalled();
      expect(mockService.destroyed).toBe(true);
      expect(registry.has('destroyable')).toBe(false);
    });

    test('should handle service without destroy method', async () => {
      const mockService = {
        name: 'simple-service',
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('simple', mockService);
      
      await expect(registry.destroy('simple')).resolves.toBeUndefined();
      expect(registry.has('simple')).toBe(false);
    });

    test('should destroy all services', async () => {
      const mockService1 = {
        name: 'service1',
        destroyed: false,
        destroy: jest.fn(async () => { mockService1.destroyed = true; }),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      const mockService2 = {
        name: 'service2',
        destroyed: false,
        destroy: jest.fn(async () => { mockService2.destroyed = true; }),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('service1', mockService1);
      registry.register('service2', mockService2);
      
      await registry.destroyAll();
      
      expect(mockService1.destroy).toHaveBeenCalled();
      expect(mockService2.destroy).toHaveBeenCalled();
      expect(mockService1.destroyed).toBe(true);
      expect(mockService2.destroyed).toBe(true);
      expect(registry.services.size).toBe(0);
    });

    test('should track lifecycle events', async () => {
      const mockService = {
        name: 'tracked-service',
        initialize: jest.fn(),
        destroy: jest.fn(),
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('tracked', mockService);
      await registry.initialize('tracked');
      await registry.destroy('tracked');
      
      const lifecycle = registry.getLifecycle();
      expect(lifecycle.created).toHaveProperty('tracked');
      expect(lifecycle.initialized).toHaveProperty('tracked');
      expect(lifecycle.destroyed).toHaveProperty('tracked');
    });
  });

  describe('Environment Detection', () => {
    test('should detect test environment', () => {
      process.env.NODE_ENV = 'test';
      const testRegistry = new ServiceRegistry();
      
      expect(testRegistry.isTest()).toBe(true);
      expect(testRegistry.isDevelopment()).toBe(false);
      expect(testRegistry.isProduction()).toBe(false);
    });

    test('should detect development environment', () => {
      process.env.NODE_ENV = 'development';
      const devRegistry = new ServiceRegistry();
      
      expect(devRegistry.isTest()).toBe(false);
      expect(devRegistry.isDevelopment()).toBe(true);
      expect(devRegistry.isProduction()).toBe(false);
    });

    test('should detect production environment', () => {
      process.env.NODE_ENV = 'production';
      const prodRegistry = new ServiceRegistry();
      
      expect(prodRegistry.isTest()).toBe(false);
      expect(prodRegistry.isDevelopment()).toBe(false);
      expect(prodRegistry.isProduction()).toBe(true);
    });
  });

  describe('Service Management', () => {
    test('should get all services', () => {
      const service1 = { name: 'service1', isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const service2 = { name: 'service2', isEnabled: () => false, getStats: () => ({ calls: 0 }) };

      registry.register('service1', service1);
      registry.register('service2', service2);
      
      const allServices = registry.getAll();
      expect(allServices.size).toBe(2);
      expect(allServices.get('service1')).toBe(service1);
      expect(allServices.get('service2')).toBe(service2);
    });

    test('should get enabled services only', () => {
      const enabledService = { name: 'enabled', isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const disabledService = { name: 'disabled', isEnabled: () => false, getStats: () => ({ calls: 0 }) };

      registry.register('enabled', enabledService);
      registry.register('disabled', disabledService);
      
      const enabledServices = registry.getEnabled();
      expect(enabledServices.length).toBe(1);
      expect(enabledServices[0]).toBe(enabledService);
    });

    test('should unregister services', () => {
      const service = { name: 'service', isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      
      registry.register('service', service);
      expect(registry.has('service')).toBe(true);
      
      registry.unregister('service');
      expect(registry.has('service')).toBe(false);
    });

    test('should get service statistics', () => {
      const service1 = { name: 'service1', isEnabled: () => true, getStats: () => ({ calls: 5 }) };
      const service2 = { name: 'service2', isEnabled: () => true, getStats: () => ({ calls: 10 }) };

      registry.register('service1', service1);
      registry.register('service2', service2);
      
      const stats = registry.getAllStats();
      expect(stats).toHaveLength(2);
      expect(stats[0]).toEqual({ calls: 5 });
      expect(stats[1]).toEqual({ calls: 10 });
    });

    test('should reset all service statistics', () => {
      const service1 = { name: 'service1', isEnabled: () => true, getStats: () => ({ calls: 5 }), resetStats: jest.fn() };
      const service2 = { name: 'service2', isEnabled: () => true, getStats: () => ({ calls: 10 }), resetStats: jest.fn() };

      registry.register('service1', service1);
      registry.register('service2', service2);
      
      registry.resetAllStats();
      
      expect(service1.resetStats).toHaveBeenCalled();
      expect(service2.resetStats).toHaveBeenCalled();
    });

    test('should get registry summary', () => {
      const enabledService = { name: 'enabled', isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const disabledService = { name: 'disabled', isEnabled: () => false, getStats: () => ({ calls: 0 }) };

      registry.register('enabled', enabledService);
      registry.register('disabled', disabledService);
      registry.registerMock('mocked', { name: 'mocked', isEnabled: () => true, getStats: () => ({ calls: 0 }) });
      
      const summary = registry.getSummary();
      expect(summary.total).toBe(2);
      expect(summary.enabled).toBe(1);
      expect(summary.disabled).toBe(1);
      expect(summary.mocked).toBe(1);
      expect(summary.services).toEqual(['enabled', 'disabled']);
      expect(summary.environment).toBe('test');
    });
  });

  describe('Integration with AvailabilityConfig', () => {
    test('should integrate with AvailabilityConfig for service configuration', async () => {
      const serviceConfig = config.getServiceConfig('kindleUnlimited');
      
      const mockService = {
        name: 'kindle-unlimited',
        config: serviceConfig,
        isEnabled: () => true,
        getStats: () => ({ calls: 0 })
      };

      registry.register('kindleUnlimited', mockService);
      
      const retrieved = registry.get('kindleUnlimited');
      expect(retrieved.config).toBeDefined();
      expect(retrieved.config.timeout).toBe(serviceConfig.timeout);
      expect(retrieved.config.confidenceThreshold).toBe(serviceConfig.confidenceThreshold);
    });

    test('should handle config initialization errors', async () => {
      const invalidConfig = new AvailabilityConfig();
      
      // Force an error by setting invalid environment
      process.env.AVAILABILITY_TIMEOUT = 'invalid';
      
      try {
        await invalidConfig.initialize();
      } catch (error) {
        expect(error.message).toContain('Configuration initialization failed');
      }
      
      // Restore valid environment
      delete process.env.AVAILABILITY_TIMEOUT;
    });
  });

  describe('Dynamic Service Discovery', () => {
    test('should add and remove discovery paths', () => {
      const newPath = './test/services';
      registry.addDiscoveryPath(newPath);
      expect(registry.discoveryPaths).toContain(newPath);
      
      registry.removeDiscoveryPath(newPath);
      expect(registry.discoveryPaths).not.toContain(newPath);
    });

    test('should enable/disable auto-discovery', () => {
      registry.setAutoDiscovery(false);
      expect(registry.autoDiscovery).toBe(false);
      
      registry.setAutoDiscovery(true);
      expect(registry.autoDiscovery).toBe(true);
    });

    test('should return empty results when auto-discovery is disabled', async () => {
      registry.setAutoDiscovery(false);
      const result = await registry.discoverServices();
      expect(result.discovered).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Service Metadata Management', () => {
    test('should get and update service metadata', () => {
      const service = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const metadata = { name: 'Test Service', version: '1.0.0', capabilities: ['test'] };
      
      registry.register('test-service', service, {}, metadata);
      
      const retrievedMetadata = registry.getMetadata('test-service');
      expect(retrievedMetadata.name).toBe('Test Service');
      expect(retrievedMetadata.capabilities).toContain('test');
      
      registry.updateMetadata('test-service', { version: '2.0.0' });
      const updatedMetadata = registry.getMetadata('test-service');
      expect(updatedMetadata.version).toBe('2.0.0');
    });

    test('should find services by capability', () => {
      const service1 = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const service2 = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      
      registry.register('service1', service1, {}, { capabilities: ['search', 'filter'] });
      registry.register('service2', service2, {}, { capabilities: ['search'] });
      
      const searchServices = registry.getServicesByCapability('search');
      expect(searchServices).toHaveLength(2);
      
      const filterServices = registry.getServicesByCapability('filter');
      expect(filterServices).toHaveLength(1);
    });

    test('should find services by tag', () => {
      const service1 = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      const service2 = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      
      registry.register('service1', service1, {}, { tags: ['library', 'external'] });
      registry.register('service2', service2, {}, { tags: ['library'] });
      
      const libraryServices = registry.getServicesByTag('library');
      expect(libraryServices).toHaveLength(2);
      
      const externalServices = registry.getServicesByTag('external');
      expect(externalServices).toHaveLength(1);
    });
  });

  describe('Dependency Management', () => {
    test('should register and resolve dependencies', async () => {
      const depService = { isEnabled: () => true, getStats: () => ({ calls: 0 }), initialize: jest.fn() };
      const mainService = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      
      registry.register('dependency', depService);
      registry.register('main-service', mainService);
      registry.registerDependencies('main-service', ['dependency']);
      
      const dependencies = registry.getDependencies('main-service');
      expect(dependencies).toContain('dependency');
      
      const resolved = await registry.resolveDependencies('main-service');
      expect(resolved.dependency).toBe(depService);
      expect(depService.initialize).toHaveBeenCalled();
    });

    test('should throw error for missing dependency', async () => {
      const mainService = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      
      registry.register('main-service', mainService);
      registry.registerDependencies('main-service', ['missing-dependency']);
      
      await expect(registry.resolveDependencies('main-service'))
        .rejects.toThrow('Dependency not found: missing-dependency for service: main-service');
    });
  });

  describe('Event System', () => {
    test('should emit and handle events', () => {
      const handler = jest.fn();
      const eventData = { key: 'test-service', action: 'registered' };
      
      registry.on('test-event', handler);
      registry.emit('test-event', eventData);
      
      expect(handler).toHaveBeenCalledWith(eventData);
    });

    test('should remove event handlers', () => {
      const handler = jest.fn();
      
      registry.on('test-event', handler);
      registry.off('test-event', handler);
      registry.emit('test-event', {});
      
      expect(handler).not.toHaveBeenCalled();
    });

    test('should handle errors in event handlers gracefully', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      registry.on('test-event', errorHandler);
      registry.emit('test-event', {});
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Testing Utilities', () => {
    test('should create test registry with mocks', () => {
      const mocks = {
        'test-service': { isEnabled: () => true, getStats: () => ({ calls: 0 }), mockMethod: jest.fn() }
      };
      
      const testRegistry = ServiceRegistry.createTestRegistry(mocks);
      expect(testRegistry.environment).toBe('test');
      expect(testRegistry.isMocked('test-service')).toBe(true);
      
      const service = testRegistry.get('test-service');
      expect(service.mockMethod).toBeDefined();
    });

    test('should provide test utilities', () => {
      const utils = registry.getTestUtilities();
      
      expect(typeof utils.createMock).toBe('function');
      expect(typeof utils.createMockFactory).toBe('function');
      expect(typeof utils.waitForEvent).toBe('function');
      
      const mock = utils.createMock({ customMethod: jest.fn() });
      expect(mock.isEnabled()).toBe(true);
      expect(mock.customMethod).toBeDefined();
    });

    test('should wait for events with timeout', async () => {
      const utils = registry.getTestUtilities();
      
      // Test successful event
      const eventPromise = utils.waitForEvent('test-event', 1000);
      setTimeout(() => registry.emit('test-event', { data: 'test' }), 100);
      
      const result = await eventPromise;
      expect(result.data).toBe('test');
    });

    test('should reset registry for testing', () => {
      const service = { isEnabled: () => true, getStats: () => ({ calls: 0 }) };
      registry.register('test-service', service);
      registry.registerMock('mock-service', { isEnabled: () => false, getStats: () => ({ calls: 0 }) });
      
      expect(registry.services.size).toBeGreaterThan(0);
      
      registry.reset();
      
      expect(registry.services.size).toBe(0);
      expect(registry.mocks.size).toBe(0);
      expect(registry.factories.size).toBe(0);
      expect(registry.metadata.size).toBe(0);
    });
  });
});