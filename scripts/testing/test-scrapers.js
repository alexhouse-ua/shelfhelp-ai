#!/usr/bin/env node

/**
 * Scraper Testing Script
 * Tests individual scrapers and orchestrator functionality
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const logger = require('../core/logger');

const { createOrchestrator, createScraper } = require('../../src/core/scrapers');

// Test data
const testBooks = [
  {
    goodreads_id: 'test-001',
    book_title: 'It Ends with Us',
    title: 'It Ends with Us', 
    author_name: 'Colleen Hoover'
  },
  {
    goodreads_id: 'test-002',
    book_title: 'The Seven Husbands of Evelyn Hugo',
    title: 'The Seven Husbands of Evelyn Hugo',
    author_name: 'Taylor Jenkins Reid'
  }
];

async function testIndividualScrapers() {
  logger.info('🧪 Testing Individual Scrapers\n');
  
  const scraperTypes = ['kindle_unlimited', 'hoopla', 'library'];
  
  for (const type of scraperTypes) {
    logger.info(`📖 Testing ${type.toUpperCase()} Scraper:`);
    
    try {
      const scraper = createScraper(type);
      const testBook = testBooks[0];
      
      logger.info(`   📚 Book: "${testBook.book_title}" by ${testBook.author_name}`);
      
      const startTime = Date.now();
      const result = await scraper.checkAvailability(testBook);
      const responseTime = Date.now() - startTime;
      
      logger.info(`   ⏱️  Response time: ${responseTime}ms`);
      logger.info('Result', {
        source: result.source,
        availability: extractAvailabilityInfo(result, type),
        confidence: result.confidence || 'N/A',
        error: result.error || 'None'
      });
      
      // Get health stats
      const health = scraper.getServiceHealth();
      logger.info(`   🏥 Health: ${health.status} (${health.successRate}% success rate)`);
      
    } catch (error) {
      logger.info(`   ❌ Error: ${error.message}`);
    }
    
    logger.info('');
  }
}

function extractAvailabilityInfo(result, scraperType) {
  switch (scraperType) {
    case 'kindle_unlimited':
      return {
        ku_available: result.ku_availability || false,
        expires: result.ku_expires_on || 'N/A'
      };
    case 'hoopla':
      return {
        ebook: result.hoopla_ebook_available || false,
        audiobook: result.hoopla_audio_available || false
      };
    case 'library':
      const systems = result.library_availability || {};
      return Object.keys(systems).reduce((acc, key) => {
        acc[key] = {
          ebook: systems[key].ebook_status,
          audio: systems[key].audio_status
        };
        return acc;
      }, {});
    default:
      return result;
  }
}

async function testOrchestrator() {
  logger.info('🎼 Testing Scraper Orchestrator\n');
  
  try {
    const orchestrator = createOrchestrator({
      batchSize: 2,
      maxConcurrent: 1
    });
    
    logger.info('📋 Testing single book check:');
    const testBook = testBooks[0];
    logger.info(`   📚 Book: "${testBook.book_title}" by ${testBook.author_name}`);
    
    const startTime = Date.now();
    const result = await orchestrator.checkBookAvailability(testBook);
    const responseTime = Date.now() - startTime;
    
    logger.info(`   ⏱️  Total response time: ${responseTime}ms`);
    logger.info(`   📊 Sources checked: ${Object.keys(result.sources).length}`);
    
    // Display results by source
    for (const [source, sourceResult] of Object.entries(result.sources)) {
      logger.info('Source result', {
        source: source,
        status: sourceResult.error ? 'Error' : 'Success',
        availability: extractAvailabilityInfo(sourceResult, source),
        error: sourceResult.error || 'None'
      });
    }
    
    logger.info('\n📦 Testing batch processing:');
    const batchResult = await orchestrator.checkBooksInBatch(testBooks.slice(0, 2));
    
    logger.info(`   📚 Processed: ${batchResult.results.length} books`);
    logger.info(`   ❌ Errors: ${batchResult.errors.length}`);
    logger.info(`   📊 Stats:`, batchResult.stats);
    
    logger.info('\n🏥 Orchestrator Health:');
    const health = orchestrator.getScrapersHealth();
    logger.info(`   Status: ${health.orchestrator.status}`);
    logger.info(`   Total checks: ${health.orchestrator.totalChecks}`);
    logger.info(`   Success rate: ${(health.orchestrator.successfulChecks / health.orchestrator.totalChecks * 100).toFixed(1)}%`);
    
  } catch (error) {
    logger.info(`❌ Orchestrator error: ${error.message}`);
  }
}

async function testConfiguration() {
  logger.info('⚙️ Testing Configuration\n');
  
  try {
    const configManager = require('../../src/core/config-manager');
    await configManager.initialize();
    
    const services = configManager.getEnabledServices();
    logger.info('📋 Enabled Services:');
    logger.info(`   🔧 Scraping services: ${Object.keys(services.scraping_services).filter(k => services.scraping_services[k]).length}`);
    logger.info(`   📚 Library systems: ${services.library_systems.count}`);
    logger.info(`   🔗 Optional services: Firebase (${services.optional_services.firebase}), Goodreads RSS (${services.optional_services.goodreads_rss})`);
    logger.info(`   📡 Method: ${services.scraping_method}`);
    logger.info(`   🔌 API dependencies: ${services.api_dependencies}`);
    
  } catch (error) {
    logger.info(`❌ Configuration error: ${error.message}`);
  }
}

async function testPerformance() {
  logger.info('🚀 Performance Testing\n');
  
  try {
    const orchestrator = createOrchestrator({
      maxConcurrent: 2
    });
    
    logger.info('📊 Testing concurrent scraping performance...');
    
    const startTime = Date.now();
    const results = await Promise.all([
      orchestrator.getScraper('kindle_unlimited').checkAvailability(testBooks[0]),
      orchestrator.getScraper('hoopla').checkAvailability(testBooks[0]),
      orchestrator.getScraper('libraries').checkAvailability(testBooks[0])
    ]);
    const totalTime = Date.now() - startTime;
    
    logger.info(`   ⏱️  Concurrent execution time: ${totalTime}ms`);
    logger.info(`   📖 All scrapers completed: ${results.every(r => !r.error)}`);
    
    // Test rate limiting
    logger.info('\n⏳ Testing rate limiting...');
    const kuScraper = orchestrator.getScraper('kindle_unlimited');
    
    const rateLimitStart = Date.now();
    await kuScraper.checkAvailability(testBooks[0]);
    await kuScraper.checkAvailability(testBooks[1]);
    const rateLimitTime = Date.now() - rateLimitStart;
    
    logger.info(`   ⏱️  Two sequential requests: ${rateLimitTime}ms`);
    logger.info(`   ✅ Rate limiting working: ${rateLimitTime >= kuScraper.config.rateLimitMs}`);
    
  } catch (error) {
    logger.info(`❌ Performance test error: ${error.message}`);
  }
}

async function runAllTests() {
  logger.info('🔬 ShelfHelp AI Scraper Test Suite\n');
  logger.info('═'.repeat(50));
  
  try {
    await testConfiguration();
    logger.info('\n' + '═'.repeat(50));
    
    await testIndividualScrapers();
    logger.info('═'.repeat(50));
    
    await testOrchestrator();
    logger.info('\n' + '═'.repeat(50));
    
    await testPerformance();
    logger.info('\n' + '═'.repeat(50));
    
    logger.info('\n🎉 All tests completed!');
    logger.info('\n💡 Notes:');
    logger.info('   - Web scraping results may vary based on site changes');
    logger.info('   - Rate limiting prevents overwhelming target sites');
    logger.info('   - Confidence scores help filter false positives');
    logger.info('   - No API keys required - all via web scraping');
    
  } catch (error) {
    logger.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    logger.error('Test suite failed', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = { 
  testIndividualScrapers, 
  testOrchestrator, 
  testConfiguration, 
  testPerformance 
};