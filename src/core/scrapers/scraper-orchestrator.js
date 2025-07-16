/**
 * Scraper Orchestrator
 * Coordinates multiple scrapers and manages scraping workflows
 */

const KindleUnlimitedScraper = require('./kindle-unlimited-scraper');
const HooplaScraper = require('./hoopla-scraper');
const LibraryScraper = require('./library-scraper');
const logger = require('../logger');

class ScraperOrchestrator {
  constructor(config = {}) {
    this.config = {
      batchSize: config.batchSize || 3,
      batchDelayMs: config.batchDelayMs || 5000,
      maxConcurrent: config.maxConcurrent || 2,
      enableHealthMonitoring: config.enableHealthMonitoring !== false,
      ...config
    };

    // Initialize scrapers
    this.scrapers = {
      kindle_unlimited: new KindleUnlimitedScraper(config.kindle_unlimited || {}),
      hoopla: new HooplaScraper(config.hoopla || {}),
      libraries: new LibraryScraper(config.libraries || {})
    };

    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      lastBatchTime: null
    };
  }

  /**
   * Check availability for a single book across all services
   */
  async checkBookAvailability(book) {
    const startTime = Date.now();
    const results = {
      book_id: book.goodreads_id,
      title: book.book_title || book.title,
      author: book.author_name,
      last_checked: new Date().toISOString(),
      sources: {}
    };

    try {
      // Run all scrapers concurrently
      const scraperPromises = [
        this.runScraper('kindle_unlimited', book),
        this.runScraper('hoopla', book),
        this.runScraper('libraries', book)
      ];

      const scraperResults = await Promise.allSettled(scraperPromises);
      
      // Process results
      scraperResults.forEach((result, index) => {
        const scraperNames = ['kindle_unlimited', 'hoopla', 'libraries'];
        const scraperName = scraperNames[index];
        
        if (result.status === 'fulfilled') {
          results.sources[scraperName] = result.value;
          this.stats.successfulChecks++;
        } else {
          results.sources[scraperName] = {
            error: result.reason.message,
            checked_at: new Date().toISOString(),
            source: scraperName
          };
          this.stats.failedChecks++;
        }
      });

      this.stats.totalChecks++;
      this.updateAverageResponseTime(Date.now() - startTime);
      
      return results;
      
    } catch (error) {
      this.stats.failedChecks++;
      logger.error(`Orchestrator error for book ${book.goodreads_id}:`, error);
      
      return {
        ...results,
        error: error.message
      };
    }
  }

  /**
   * Run a specific scraper with error handling
   */
  async runScraper(scraperName, book) {
    const scraper = this.scrapers[scraperName];
    if (!scraper) {
      throw new Error(`Scraper '${scraperName}' not found`);
    }

    try {
      const result = await scraper.checkAvailability(book);
      logger.info(`✅ ${scraperName}: Completed check for "${book.book_title || book.title}"`);
      return result;
    } catch (error) {
      logger.warn(`⚠️ ${scraperName}: Failed check for "${book.book_title || book.title}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Check availability for multiple books in batches
   */
  async checkBooksInBatch(books, options = {}) {
    const batchSize = options.batchSize || this.config.batchSize;
    const results = [];
    const errors = [];
    
    logger.info(`🚀 Starting batch availability check for ${books.length} books (batch size: ${batchSize})`);
    
    for (let i = 0; i < books.length; i += batchSize) {
      const batch = books.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(books.length / batchSize);
      
      logger.info(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} books)`);
      
      try {
        const batchResults = await this.processBatch(batch);
        results.push(...batchResults);
        
        // Delay between batches (except for last batch)
        if (i + batchSize < books.length) {
          logger.info(`⏳ Waiting ${this.config.batchDelayMs}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.config.batchDelayMs));
        }
        
      } catch (error) {
        logger.error(`❌ Batch ${batchNumber} failed:`, error);
        errors.push({
          batch: batchNumber,
          error: error.message,
          books: batch.map(b => b.goodreads_id)
        });
      }
    }
    
    this.stats.lastBatchTime = new Date().toISOString();
    
    return {
      results,
      errors,
      stats: this.getProcessingStats(books.length, results.length)
    };
  }

  /**
   * Process a single batch of books
   */
  async processBatch(books) {
    const concurrencyLimit = Math.min(this.config.maxConcurrent, books.length);
    const results = [];
    
    // Process books with concurrency limit
    for (let i = 0; i < books.length; i += concurrencyLimit) {
      const concurrentBooks = books.slice(i, i + concurrencyLimit);
      
      const promises = concurrentBooks.map(book => 
        this.checkBookAvailability(book).catch(error => ({
          book_id: book.goodreads_id,
          error: error.message,
          last_checked: new Date().toISOString()
        }))
      );
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      
      // Small delay between concurrent groups
      if (i + concurrencyLimit < books.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Get health status of all scrapers
   */
  getScrapersHealth() {
    const health = {};
    
    for (const [name, scraper] of Object.entries(this.scrapers)) {
      health[name] = scraper.getServiceHealth();
    }
    
    return {
      scrapers: health,
      orchestrator: {
        ...this.stats,
        status: this.getOrchestratorStatus(),
        config: {
          batch_size: this.config.batchSize,
          max_concurrent: this.config.maxConcurrent,
          batch_delay_ms: this.config.batchDelayMs
        }
      }
    };
  }

  /**
   * Get orchestrator status based on scraper health
   */
  getOrchestratorStatus() {
    const scraperHealth = Object.values(this.scrapers).map(scraper => 
      scraper.getHealthStats()
    );
    
    const healthyScrapers = scraperHealth.filter(health => 
      health.status === 'healthy'
    ).length;
    
    const totalScrapers = scraperHealth.length;
    
    if (healthyScrapers === totalScrapers) {
      return 'healthy';
    } else if (healthyScrapers >= totalScrapers / 2) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime(responseTime) {
    if (this.stats.totalChecks === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      this.stats.averageResponseTime = (
        (this.stats.averageResponseTime * (this.stats.totalChecks - 1)) + responseTime
      ) / this.stats.totalChecks;
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(totalBooks, processedBooks) {
    const successRate = this.stats.totalChecks > 0 ? 
      (this.stats.successfulChecks / this.stats.totalChecks * 100).toFixed(1) : 0;
    
    return {
      total_books: totalBooks,
      processed_books: processedBooks,
      success_rate: parseFloat(successRate),
      average_response_time_ms: Math.round(this.stats.averageResponseTime),
      total_scraper_calls: this.stats.totalChecks,
      successful_calls: this.stats.successfulChecks,
      failed_calls: this.stats.failedChecks
    };
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      lastBatchTime: null
    };
    
    // Reset scraper stats too
    Object.values(this.scrapers).forEach(scraper => {
      if (scraper.resetStats) {
        scraper.resetStats();
      }
    });
  }

  /**
   * Get specific scraper instance
   */
  getScraper(name) {
    return this.scrapers[name];
  }

  /**
   * Update scraper configuration
   */
  updateScraperConfig(scraperName, config) {
    if (this.scrapers[scraperName]) {
      Object.assign(this.scrapers[scraperName].config, config);
      logger.info(`Updated configuration for ${scraperName} scraper`);
    } else {
      throw new Error(`Scraper '${scraperName}' not found`);
    }
  }

  /**
   * Test all scrapers with a sample book
   */
  async testAllScrapers(sampleBook = null) {
    const testBook = sampleBook || {
      goodreads_id: 'test-123',
      book_title: 'Test Book',
      title: 'Test Book',
      author_name: 'Test Author'
    };

    logger.info('🧪 Testing all scrapers...');
    
    const results = {};
    
    for (const [name, scraper] of Object.entries(this.scrapers)) {
      try {
        const startTime = Date.now();
        const result = await scraper.checkAvailability(testBook);
        const responseTime = Date.now() - startTime;
        
        results[name] = {
          status: 'success',
          response_time_ms: responseTime,
          result: result
        };
        
        logger.info(`✅ ${name}: ${responseTime}ms`);
        
      } catch (error) {
        results[name] = {
          status: 'error',
          error: error.message
        };
        
        logger.error(`❌ ${name}: ${error.message}`);
      }
    }
    
    return results;
  }
}

module.exports = ScraperOrchestrator;