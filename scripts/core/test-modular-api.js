#!/usr/bin/env node

/**
 * Modular API Integration & Performance Test Suite
 */

const http = require('http');
const logger = require('./logger');

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  timeout: 5000,
  concurrency: 10,
  requests: 100
};

// Test utilities
const makeRequest = (path, method = 'GET', data = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_KEY || 'test-key'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(TEST_CONFIG.timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
};

// Performance testing
const performanceTest = async (path, description) => {
  const results = [];
  const start = Date.now();
  
  try {
    const promises = Array(TEST_CONFIG.concurrency).fill().map(async () => {
      const reqStart = Date.now();
      const response = await makeRequest(path);
      const reqEnd = Date.now();
      
      return {
        responseTime: reqEnd - reqStart,
        status: response.status,
        success: response.status < 400
      };
    });

    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;
    
    const successCount = responses.filter(r => r.success).length;
    const avgResponseTime = responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length;
    
    return {
      description,
      path,
      totalTime,
      avgResponseTime,
      successRate: (successCount / responses.length) * 100,
      throughput: (responses.length / totalTime) * 1000,
      errors: responses.filter(r => !r.success).length
    };
  } catch (error) {
    return {
      description,
      path,
      error: error.message,
      success: false
    };
  }
};

// Integration tests
const integrationTests = [
  {
    name: 'Health Check',
    path: '/health',
    method: 'GET',
    expected: { status: 'healthy' }
  },
  {
    name: 'Books API - List',
    path: '/api/books',
    method: 'GET',
    expected: { success: true }
  },
  {
    name: 'Books API - Test Route',
    path: '/api/books/test',
    method: 'GET',
    expected: { success: true }
  },
  {
    name: 'Books API - POST Test',
    path: '/api/books/test',
    method: 'POST',
    data: { test: 'data' },
    expected: { success: true }
  }
];

// Run integration tests
const runIntegrationTests = async () => {
  logger.info('🧪 Running Integration Tests');
  const results = [];
  
  for (const test of integrationTests) {
    try {
      const start = Date.now();
      const response = await makeRequest(test.path, test.method, test.data);
      const responseTime = Date.now() - start;
      
      const passed = response.status < 400 && 
                    Object.keys(test.expected).every(key => 
                      response.data[key] === test.expected[key]
                    );
      
      results.push({
        name: test.name,
        path: test.path,
        method: test.method,
        status: response.status,
        responseTime,
        passed,
        data: response.data
      });
      
      logger.info(`${passed ? '✅' : '❌'} ${test.name}: ${responseTime}ms`);
    } catch (error) {
      results.push({
        name: test.name,
        path: test.path,
        method: test.method,
        error: error.message,
        passed: false
      });
      logger.info(`❌ ${test.name}: ${error.message}`);
    }
  }
  
  return results;
};

// Run performance tests
const runPerformanceTests = async () => {
  logger.info('⚡ Running Performance Tests');
  
  const tests = [
    { path: '/health', description: 'Health Check Performance' },
    { path: '/api/books', description: 'Books API Performance' },
    { path: '/api/books/test', description: 'Test Route Performance' }
  ];
  
  const results = [];
  
  for (const test of tests) {
    logger.info(`Testing: ${test.description}`);
    const result = await performanceTest(test.path, test.description);
    results.push(result);
    
    if (result.error) {
      logger.info(`❌ ${test.description}: ${result.error}`);
    } else {
      logger.info(`✅ ${test.description}: ${result.avgResponseTime.toFixed(2)}ms avg, ${result.successRate}% success`);
    }
  }
  
  return results;
};

// Start test server
const startTestServer = () => {
  return new Promise((resolve, reject) => {
    const server = require('./test-simple');
    
    // Wait for server to be ready
    setTimeout(() => {
      makeRequest('/health')
        .then(() => {
          logger.info('Test server ready');
          resolve();
        })
        .catch(reject);
    }, 1000);
  });
};

// Main test runner
const runTests = async () => {
  logger.info('🧪 Modular API Test Suite');
  logger.info('═'.repeat(50));
  
  try {
    // Start server
    await startTestServer();
    
    // Run integration tests
    const integrationResults = await runIntegrationTests();
    logger.info('');
    
    // Run performance tests
    const performanceResults = await runPerformanceTests();
    logger.info('');
    
    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      environment: 'test',
      integration: {
        total: integrationResults.length,
        passed: integrationResults.filter(r => r.passed).length,
        failed: integrationResults.filter(r => !r.passed).length,
        results: integrationResults
      },
      performance: {
        total: performanceResults.length,
        results: performanceResults
      }
    };
    
    logger.info('📊 Test Results Summary:');
    logger.info(`Integration: ${report.integration.passed}/${report.integration.total} passed`);
    logger.info(`Performance: ${performanceResults.filter(r => !r.error).length}/${performanceResults.length} completed`);
    
    // Calculate averages
    const validPerf = performanceResults.filter(r => !r.error);
    if (validPerf.length > 0) {
      const avgResponseTime = validPerf.reduce((sum, r) => sum + r.avgResponseTime, 0) / validPerf.length;
      const avgThroughput = validPerf.reduce((sum, r) => sum + r.throughput, 0) / validPerf.length;
      
      logger.info(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
      logger.info(`Average Throughput: ${avgThroughput.toFixed(2)} req/sec`);
    }
    
    return report;
    
  } catch (error) {
    logger.error('Test suite failed:', error.message);
    throw error;
  }
};

// Run if called directly
if (require.main === module) {
  runTests()
    .then(report => {
      logger.info('✅ All tests completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = { runTests, runIntegrationTests, runPerformanceTests };