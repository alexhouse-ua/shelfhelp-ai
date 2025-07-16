#!/usr/bin/env node

/**
 * Scraper Testing Script
 * Tests individual scrapers and orchestrator functionality
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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
  console.log('🧪 Testing Individual Scrapers\n');
  
  const scraperTypes = ['kindle_unlimited', 'hoopla', 'library'];
  
  for (const type of scraperTypes) {
    console.log(`📖 Testing ${type.toUpperCase()} Scraper:`);
    
    try {
      const scraper = createScraper(type);
      const testBook = testBooks[0];
      
      console.log(`   📚 Book: "${testBook.book_title}" by ${testBook.author_name}`);
      
      const startTime = Date.now();
      const result = await scraper.checkAvailability(testBook);
      const responseTime = Date.now() - startTime;
      
      console.log(`   ⏱️  Response time: ${responseTime}ms`);
      console.log(`   📊 Result:`, {
        source: result.source,
        availability: extractAvailabilityInfo(result, type),
        confidence: result.confidence || 'N/A',
        error: result.error || 'None'
      });
      
      // Get health stats
      const health = scraper.getServiceHealth();
      console.log(`   🏥 Health: ${health.status} (${health.successRate}% success rate)`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
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
  console.log('🎼 Testing Scraper Orchestrator\n');
  
  try {
    const orchestrator = createOrchestrator({
      batchSize: 2,
      maxConcurrent: 1
    });
    
    console.log('📋 Testing single book check:');
    const testBook = testBooks[0];
    console.log(`   📚 Book: "${testBook.book_title}" by ${testBook.author_name}`);
    
    const startTime = Date.now();
    const result = await orchestrator.checkBookAvailability(testBook);
    const responseTime = Date.now() - startTime;
    
    console.log(`   ⏱️  Total response time: ${responseTime}ms`);
    console.log(`   📊 Sources checked: ${Object.keys(result.sources).length}`);
    
    // Display results by source
    for (const [source, sourceResult] of Object.entries(result.sources)) {
      console.log(`   📖 ${source}:`, {
        status: sourceResult.error ? 'Error' : 'Success',
        availability: extractAvailabilityInfo(sourceResult, source),
        error: sourceResult.error || 'None'
      });
    }
    
    console.log('\n📦 Testing batch processing:');
    const batchResult = await orchestrator.checkBooksInBatch(testBooks.slice(0, 2));
    
    console.log(`   📚 Processed: ${batchResult.results.length} books`);
    console.log(`   ❌ Errors: ${batchResult.errors.length}`);
    console.log(`   📊 Stats:`, batchResult.stats);
    
    console.log('\n🏥 Orchestrator Health:');
    const health = orchestrator.getScrapersHealth();
    console.log(`   Status: ${health.orchestrator.status}`);
    console.log(`   Total checks: ${health.orchestrator.totalChecks}`);
    console.log(`   Success rate: ${(health.orchestrator.successfulChecks / health.orchestrator.totalChecks * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.log(`❌ Orchestrator error: ${error.message}`);
  }
}

async function testConfiguration() {
  console.log('⚙️ Testing Configuration\n');
  
  try {
    const configManager = require('../../src/core/config-manager');
    await configManager.initialize();
    
    const services = configManager.getEnabledServices();
    console.log('📋 Enabled Services:');
    console.log(`   🔧 Scraping services: ${Object.keys(services.scraping_services).filter(k => services.scraping_services[k]).length}`);
    console.log(`   📚 Library systems: ${services.library_systems.count}`);
    console.log(`   🔗 Optional services: Firebase (${services.optional_services.firebase}), Goodreads RSS (${services.optional_services.goodreads_rss})`);
    console.log(`   📡 Method: ${services.scraping_method}`);
    console.log(`   🔌 API dependencies: ${services.api_dependencies}`);
    
  } catch (error) {
    console.log(`❌ Configuration error: ${error.message}`);
  }
}

async function testPerformance() {
  console.log('🚀 Performance Testing\n');
  
  try {
    const orchestrator = createOrchestrator({
      maxConcurrent: 2
    });
    
    console.log('📊 Testing concurrent scraping performance...');
    
    const startTime = Date.now();
    const results = await Promise.all([
      orchestrator.getScraper('kindle_unlimited').checkAvailability(testBooks[0]),
      orchestrator.getScraper('hoopla').checkAvailability(testBooks[0]),
      orchestrator.getScraper('libraries').checkAvailability(testBooks[0])
    ]);
    const totalTime = Date.now() - startTime;
    
    console.log(`   ⏱️  Concurrent execution time: ${totalTime}ms`);
    console.log(`   📖 All scrapers completed: ${results.every(r => !r.error)}`);
    
    // Test rate limiting
    console.log('\n⏳ Testing rate limiting...');
    const kuScraper = orchestrator.getScraper('kindle_unlimited');
    
    const rateLimitStart = Date.now();
    await kuScraper.checkAvailability(testBooks[0]);
    await kuScraper.checkAvailability(testBooks[1]);
    const rateLimitTime = Date.now() - rateLimitStart;
    
    console.log(`   ⏱️  Two sequential requests: ${rateLimitTime}ms`);
    console.log(`   ✅ Rate limiting working: ${rateLimitTime >= kuScraper.config.rateLimitMs}`);
    
  } catch (error) {
    console.log(`❌ Performance test error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🔬 ShelfHelp AI Scraper Test Suite\n');
  console.log('═'.repeat(50));
  
  try {
    await testConfiguration();
    console.log('\n' + '═'.repeat(50));
    
    await testIndividualScrapers();
    console.log('═'.repeat(50));
    
    await testOrchestrator();
    console.log('\n' + '═'.repeat(50));
    
    await testPerformance();
    console.log('\n' + '═'.repeat(50));
    
    console.log('\n🎉 All tests completed!');
    console.log('\n💡 Notes:');
    console.log('   - Web scraping results may vary based on site changes');
    console.log('   - Rate limiting prevents overwhelming target sites');
    console.log('   - Confidence scores help filter false positives');
    console.log('   - No API keys required - all via web scraping');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { 
  testIndividualScrapers, 
  testOrchestrator, 
  testConfiguration, 
  testPerformance 
};