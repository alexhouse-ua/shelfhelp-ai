const fs = require('fs').promises;
const path = require('path');

// Import service classes
const { ServiceRegistry } = require('./services/service-registry');
const { ConfigManager } = require('./services/config-manager');
const { KindleUnlimitedService } = require('./services/kindle-unlimited-service');
const { HooplaService } = require('./services/hoopla-service');
const { LibraryService } = require('./services/library-service');

/**
 * Refactored Availability Checker
 * Service-oriented architecture with dependency injection
 */
class RefactoredAvailabilityChecker {
  constructor() {
    this.booksFile = path.join(__dirname, '../data/books.json');
    
    // Initialize service infrastructure
    this.configManager = new ConfigManager();
    this.serviceRegistry = new ServiceRegistry();
    
    // Initialize services
    this.initializeServices();
    
    // Overall statistics
    this.stats = {
      checked: 0,
      updated: 0,
      errors: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Initialize all availability services
   */
  initializeServices() {
    // Load environment configurations
    this.configManager.loadFromEnvironment();
    
    // Register Kindle Unlimited service
    const kuConfig = this.configManager.getConfig('kindle_unlimited');
    this.serviceRegistry.register('kindle_unlimited', new KindleUnlimitedService(kuConfig));
    
    // Register Hoopla service
    const hooplaConfig = this.configManager.getConfig('hoopla');
    this.serviceRegistry.register('hoopla', new HooplaService(hooplaConfig));
    
    // Register library services
    const libraries = ['tuscaloosa_public', 'camellia_net', 'seattle_public'];
    libraries.forEach(libraryKey => {
      const config = this.configManager.getConfig(libraryKey);
      if (config) {
        this.serviceRegistry.register(libraryKey, new LibraryService(libraryKey, config));
      }
    });
  }

  /**
   * Load books from JSON file
   * @returns {Promise<Array>} Array of book objects
   */
  async loadBooks() {
    try {
      const data = await fs.readFile(this.booksFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error loading books:', error.message);
      throw error;
    }
  }

  /**
   * Save books to JSON file
   * @param {Array} books - Array of book objects
   */
  async saveBooks(books) {
    try {
      await fs.writeFile(this.booksFile, JSON.stringify(books, null, 2));
      console.log(`✅ Saved ${books.length} books with updated availability`);
    } catch (error) {
      console.error('❌ Error saving books:', error.message);
      throw error;
    }
  }

  /**
   * Check availability for a single book using all services
   * @param {Object} book - Book object
   * @returns {Promise<Object>} Availability results
   */
  async checkBookAvailability(book) {
    const results = {
      book_id: book.goodreads_id,
      title: book.book_title || book.title,
      author: book.author_name,
      last_checked: new Date().toISOString(),
      services: {}
    };

    this.stats.checked++;

    try {
      // Get all enabled services
      const enabledServices = this.serviceRegistry.getEnabled();
      
      // Check each service
      for (const service of enabledServices) {
        const serviceKey = Array.from(this.serviceRegistry.getAll().entries())
          .find(([key, svc]) => svc === service)?.[0];
        
        if (serviceKey) {
          console.log(`  🔍 Checking ${service.name} for: ${results.title}`);
          
          try {
            const result = await service.checkAvailability(book);
            results.services[serviceKey] = result;
            
            // Delay between service requests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.log(`  ❌ ${service.name} failed: ${error.message}`);
            results.services[serviceKey] = { error: error.message };
          }
        }
      }
      
      return results;
      
    } catch (error) {
      this.stats.errors++;
      return {
        ...results,
        error: error.message
      };
    }
  }

  /**
   * Update book record with availability data
   * @param {Object} book - Book object
   * @param {Object} availabilityResult - Availability results
   * @returns {boolean} True if book was updated
   */
  updateBookWithAvailability(book, availabilityResult) {
    let updated = false;
    const timestamp = new Date().toISOString();
    
    // Update from service results
    if (availabilityResult.services) {
      // Kindle Unlimited
      if (availabilityResult.services.kindle_unlimited) {
        const kuResult = availabilityResult.services.kindle_unlimited;
        if (kuResult.ku_availability !== undefined && book.ku_availability !== kuResult.ku_availability) {
          book.ku_availability = kuResult.ku_availability;
          updated = true;
        }
        if (kuResult.ku_expires_on && book.ku_expires_on !== kuResult.ku_expires_on) {
          book.ku_expires_on = kuResult.ku_expires_on;
          updated = true;
        }
      }
      
      // Hoopla
      if (availabilityResult.services.hoopla) {
        const hooplaResult = availabilityResult.services.hoopla;
        if (hooplaResult.hoopla_ebook_available !== undefined && book.hoopla_ebook_available !== hooplaResult.hoopla_ebook_available) {
          book.hoopla_ebook_available = hooplaResult.hoopla_ebook_available;
          updated = true;
        }
        if (hooplaResult.hoopla_audio_available !== undefined && book.hoopla_audio_available !== hooplaResult.hoopla_audio_available) {
          book.hoopla_audio_available = hooplaResult.hoopla_audio_available;
          updated = true;
        }
      }
      
      // Library services
      const libraries = ['tuscaloosa_public', 'camellia_net', 'seattle_public'];
      libraries.forEach(libraryKey => {
        if (availabilityResult.services[libraryKey]) {
          const libResult = availabilityResult.services[libraryKey];
          
          // Update library hold status fields
          const ebookField = `library_hold_status_${libraryKey.replace('_public', '').replace('_net', '')}_ebook`;
          const audioField = `library_hold_status_${libraryKey.replace('_public', '').replace('_net', '')}_audio`;
          
          if (libResult.ebook_status && book[ebookField] !== libResult.ebook_status) {
            book[ebookField] = libResult.ebook_status;
            updated = true;
          }
          if (libResult.audio_status && book[audioField] !== libResult.audio_status) {
            book[audioField] = libResult.audio_status;
            updated = true;
          }
        }
      });
    }
    
    // Update availability sources
    const ebookSources = [];
    const audioSources = [];
    
    // Check availability sources in priority order
    if (book.library_hold_status_tuscaloosa_ebook === 'Available') {ebookSources.push('Tuscaloosa Library');}
    if (book.library_hold_status_camellia_ebook === 'Available') {ebookSources.push('Camellia Net');}
    if (book.library_hold_status_seattle_ebook === 'Available') {ebookSources.push('Seattle Library');}
    
    if (book.library_hold_status_tuscaloosa_audio === 'Available') {audioSources.push('Tuscaloosa Library');}
    if (book.library_hold_status_camellia_audio === 'Available') {audioSources.push('Camellia Net');}
    if (book.library_hold_status_seattle_audio === 'Available') {audioSources.push('Seattle Library');}
    
    if (book.ku_availability) {ebookSources.push('Kindle Unlimited');}
    if (book.hoopla_ebook_available) {ebookSources.push('Hoopla');}
    if (book.hoopla_audio_available) {audioSources.push('Hoopla');}
    
    // Update source fields
    const newEbookSource = ebookSources.length > 0 ? ebookSources[0] : 'Purchase';
    const newAudioSource = audioSources.length > 0 ? audioSources[0] : 'Purchase';
    
    if (book.ebook_availability_source !== newEbookSource) {
      book.ebook_availability_source = newEbookSource;
      updated = true;
    }
    
    if (book.audio_availability_source !== newAudioSource) {
      book.audio_availability_source = newAudioSource;
      updated = true;
    }
    
    // Update metadata
    book.availability_last_checked = timestamp;
    
    if (updated) {
      book.updated_at = timestamp;
      this.stats.updated++;
    }
    
    return updated;
  }

  /**
   * Process books in batches
   * @param {Array} books - Books to process
   * @param {number} batchSize - Batch size
   * @returns {Promise<Array>} Array of results
   */
  async checkBooksInBatch(books, batchSize = 3) {
    console.log(`🔍 Checking availability for ${books.length} books in batches of ${batchSize}...`);
    
    const results = [];
    
    for (let i = 0; i < books.length; i += batchSize) {
      const batch = books.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(books.length / batchSize);
      
      console.log(`\\n📚 Processing batch ${batchNumber}/${totalBatches} (${batch.length} books)...`);
      
      for (let j = 0; j < batch.length; j++) {
        const book = batch[j];
        try {
          console.log(`\\n  📖 [${j + 1}/${batch.length}] Processing: ${book.book_title || book.title}`);
          const result = await this.checkBookAvailability(book);
          results.push(result);
          console.log(`  ✅ Completed: ${book.book_title || book.title}`);
        } catch (error) {
          console.log(`  ❌ Failed: ${book.book_title || book.title} - ${error.message}`);
          results.push({ book_id: book.goodreads_id, error: error.message });
          this.stats.errors++;
        }
        
        // Delay between books
        if (j < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Progress update
      console.log(`\\n✅ Batch ${batchNumber} completed. Progress: ${Math.min(i + batchSize, books.length)}/${books.length} books`);
      
      // Delay between batches
      if (i + batchSize < books.length) {
        console.log('⏳ Waiting between batches...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    return results;
  }

  /**
   * Print comprehensive statistics
   */
  printStats() {
    console.log('\\n📊 Refactored Availability Check Statistics:');
    console.log(`📚 Books processed: ${this.stats.checked}`);
    console.log(`🔄 Books updated: ${this.stats.updated}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    
    if (this.stats.startTime && this.stats.endTime) {
      const duration = (this.stats.endTime - this.stats.startTime) / 1000;
      console.log(`⏱️  Duration: ${duration.toFixed(1)}s`);
    }
    
    // Service statistics
    console.log('\\n🔧 Service Statistics:');
    const serviceStats = this.serviceRegistry.getAllStats();
    serviceStats.forEach(stat => {
      console.log(`  ${stat.service}: ${stat.checked} checked, ${stat.found} found, ${stat.errors} errors (${stat.successRate})`);
    });
    
    // Registry summary
    const registrySummary = this.serviceRegistry.getSummary();
    console.log(`\\n📋 Services: ${registrySummary.enabled}/${registrySummary.total} enabled`);
  }

  /**
   * Main execution function
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Execution result
   */
  async run(filters = {}) {
    try {
      this.stats.startTime = Date.now();
      console.log('🚀 Starting refactored availability check...\\n');
      
      // Load books
      const books = await this.loadBooks();
      console.log(`📚 Loaded ${books.length} books`);
      
      // Apply filters
      let booksToCheck = books;
      
      if (filters.status) {
        booksToCheck = booksToCheck.filter(book => filters.status.includes(book.status));
        console.log(`📋 Filtered to ${booksToCheck.length} books with status: ${filters.status.join(', ')}`);
      }
      
      if (filters.unprocessed) {
        booksToCheck = booksToCheck.filter(book => 
          !book.availability_last_checked || 
          new Date(book.availability_last_checked) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        console.log(`📋 Filtered to ${booksToCheck.length} books needing updates`);
      }
      
      if (filters.limit) {
        booksToCheck = booksToCheck.slice(0, filters.limit);
        console.log(`📋 Limited to first ${booksToCheck.length} books`);
      }
      
      if (booksToCheck.length === 0) {
        console.log('✅ No books need availability checking.');
        return { success: true, message: 'No books to process' };
      }
      
      // Check availability
      const results = await this.checkBooksInBatch(booksToCheck, 3);
      
      // Update books
      console.log('\\n🔄 Updating books with availability data...');
      for (const result of results) {
        if (result && !result.error) {
          const book = books.find(b => b.goodreads_id === result.book_id);
          if (book) {
            this.updateBookWithAvailability(book, result);
          }
        }
      }
      
      // Save books
      await this.saveBooks(books);
      
      this.stats.endTime = Date.now();
      this.printStats();
      
      console.log('\\n🎉 Refactored availability check completed successfully!');
      return {
        success: true,
        stats: this.stats,
        serviceStats: this.serviceRegistry.getAllStats(),
        processed: results.length
      };
      
    } catch (error) {
      console.error('\\n❌ Refactored availability check failed:', error.message);
      throw error;
    }
  }

  /**
   * Get service registry (for external access)
   * @returns {ServiceRegistry} Service registry instance
   */
  getServiceRegistry() {
    return this.serviceRegistry;
  }

  /**
   * Get config manager (for external access)
   * @returns {ConfigManager} Config manager instance
   */
  getConfigManager() {
    return this.configManager;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const filters = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--status':
        filters.status = args[++i]?.split(',') || ['TBR'];
        break;
      case '--unprocessed':
        filters.unprocessed = true;
        break;
      case '--limit':
        filters.limit = parseInt(args[++i]) || 10;
        break;
      case '--help':
        console.log(`
Refactored Availability Checker - Service-Oriented Architecture

Usage: node refactored-availability-checker.js [options]

Options:
  --status <statuses>    Check books with specific statuses (comma-separated)
  --unprocessed         Only check books not checked in last 7 days  
  --limit <number>      Limit number of books to check
  --help               Show this help message

Features:
  ✅ Service-oriented architecture with dependency injection
  ✅ Centralized configuration management
  ✅ Pluggable service registry
  ✅ Enhanced error handling and retry logic
  ✅ Comprehensive statistics and monitoring
  ✅ Separate ebook and audiobook tracking
  ✅ Smart source prioritization

Examples:
  node refactored-availability-checker.js --status TBR --limit 5
  node refactored-availability-checker.js --unprocessed --limit 3
        `);
        process.exit(0);
        break;
    }
  }
  
  const checker = new RefactoredAvailabilityChecker();
  checker.run(filters).catch(error => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { RefactoredAvailabilityChecker };