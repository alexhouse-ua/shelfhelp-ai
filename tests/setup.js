/**
 * Jest Test Setup - ShelfHelp AI
 * Global test configuration and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ENABLE_FIREBASE = 'false';
process.env.TEST_MODE = 'true';

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies that shouldn't run in tests
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  database: jest.fn(() => ({
    ref: jest.fn(() => ({
      set: jest.fn(),
      once: jest.fn()
    }))
  }))
}));

// Global test utilities
global.testHelpers = {
  createMockBook: (overrides = {}) => ({
    id: 1,
    title: 'Test Book',
    author: 'Test Author',
    status: 'tbr',
    genre: 'romance',
    date_added: new Date().toISOString(),
    ...overrides
  }),
  
  createMockRequest: (body = {}, query = {}, params = {}) => ({
    body,
    query,
    params,
    headers: { 'x-api-key': 'test-key' }
  }),
  
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  }
};

// Console suppression for cleaner test output
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes && args[0].includes('Warning')) return;
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});