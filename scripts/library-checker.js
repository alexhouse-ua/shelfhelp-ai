const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * Library Availability Checker
 * Checks book availability across multiple library services
 * Supports Libby/OverDrive, Hoopla, and basic ISBN lookups
 */
class LibraryChecker {
  constructor() {
    this.booksFile = path.join(__dirname, '../data/books.json');
    this.libraries = {
      overdrive: {
        name: 'OverDrive/Libby',
        searchUrl: 'https://thunder.api.overdrive.com/v2/libraries/{libraryId}/media',
        enabled: false, // Requires library ID configuration
        timeout: 10000
      },
      hoopla: {
        name: 'Hoopla',
        searchUrl: 'https://hoopla-api.hoopladigital.com/v1/search',
        enabled: false, // Requires API key
        timeout: 10000
      },
      worldcat: {
        name: 'WorldCat',
        searchUrl: 'http://www.worldcat.org/webservices/catalog/search/opensearch',
        enabled: true, // Free public API
        timeout: 15000
      }
    };
    
    this.rateLimits = {
      overdrive: 100, // requests per minute
      hoopla: 60,
      worldcat: 30
    };
    
    this.requestCounts = {
      overdrive: 0,
      hoopla: 0,
      worldcat: 0
    };
    
    this.stats = {
      checked: 0,
      found: 0,
      errors: 0,
      updated: 0
    };
  }

  async loadBooks() {
    try {
      const data = await fs.readFile(this.booksFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error loading books:', error.message);
      throw error;
    }
  }

  async saveBooks(books) {
    try {
      await fs.writeFile(this.booksFile, JSON.stringify(books, null, 2));
      console.log(`✅ Saved ${books.length} books with updated availability`);
    } catch (error) {
      console.error('❌ Error saving books:', error.message);
      throw error;
    }
  }

  async checkWorldCatAvailability(book) {
    try {
      const searchTerms = [];
      
      // Add title search
      if (book.book_title || book.title) {
        const title = book.book_title || book.title;
        searchTerms.push(`ti:${encodeURIComponent(title)}`);
      }
      
      // Add author search
      if (book.author_name) {
        searchTerms.push(`au:${encodeURIComponent(book.author_name)}`);
      }
      
      // Add ISBN if available
      if (book.isbn && book.isbn.length >= 10) {
        searchTerms.push(`bn:${book.isbn}`);
      }
      
      if (searchTerms.length === 0) {
        return { available: false, source: 'worldcat', error: 'No searchable fields' };
      }
      
      const query = searchTerms.join(' AND ');
      const url = `${this.libraries.worldcat.searchUrl}?q=${encodeURIComponent(query)}&format=atom&count=5`;
      
      const response = await axios.get(url, {
        timeout: this.libraries.worldcat.timeout,
        headers: {
          'User-Agent': 'ShelfHelp-AI/1.0 (Reading Assistant)'
        }
      });
      
      // Parse XML response to check for results
      const hasResults = response.data.includes('<entry>') && 
                        response.data.includes('<title type="text">');
      
      return {
        available: hasResults,
        source: 'worldcat',
        checked_at: new Date().toISOString(),
        details: hasResults ? 'Found in WorldCat catalog' : 'Not found in WorldCat'
      };
      
    } catch (error) {
      return {
        available: false,
        source: 'worldcat',
        error: error.message,
        checked_at: new Date().toISOString()
      };
    }
  }

  async checkOverDriveAvailability(book, libraryId) {
    // This would require OverDrive API credentials and library configuration
    // Placeholder implementation for future integration
    try {
      if (!libraryId || !this.libraries.overdrive.enabled) {
        return {
          available: false,
          source: 'overdrive',
          error: 'OverDrive integration not configured'
        };
      }
      
      // Implementation would go here with proper API calls
      return {
        available: false,
        source: 'overdrive',
        error: 'Not implemented - requires API credentials'
      };
      
    } catch (error) {
      return {
        available: false,
        source: 'overdrive',
        error: error.message
      };
    }
  }

  async checkHooplaAvailability(book) {
    // Placeholder for Hoopla integration
    try {
      if (!this.libraries.hoopla.enabled) {
        return {
          available: false,
          source: 'hoopla',
          error: 'Hoopla integration not configured'
        };
      }
      
      // Implementation would go here with proper API calls
      return {
        available: false,
        source: 'hoopla',
        error: 'Not implemented - requires API credentials'
      };
      
    } catch (error) {
      return {
        available: false,
        source: 'hoopla',
        error: error.message
      };
    }
  }

  async checkBookAvailability(book) {
    const results = {
      book_id: book.goodreads_id,
      title: book.book_title || book.title,
      availability: {},
      last_checked: new Date().toISOString()
    };
    
    this.stats.checked++;
    
    // Check WorldCat (always enabled)
    if (this.libraries.worldcat.enabled) {
      try {
        await this.rateLimitDelay('worldcat');
        const worldcatResult = await this.checkWorldCatAvailability(book);
        results.availability.worldcat = worldcatResult;
        
        if (worldcatResult.available) {
          this.stats.found++;
        }
      } catch (error) {
        results.availability.worldcat = {
          available: false,
          source: 'worldcat',
          error: error.message
        };
        this.stats.errors++;
      }
    }
    
    // Check OverDrive (if configured)
    if (this.libraries.overdrive.enabled && process.env.OVERDRIVE_LIBRARY_ID) {
      try {
        await this.rateLimitDelay('overdrive');
        const overdriveResult = await this.checkOverDriveAvailability(book, process.env.OVERDRIVE_LIBRARY_ID);
        results.availability.overdrive = overdriveResult;
      } catch (error) {
        results.availability.overdrive = {
          available: false,
          source: 'overdrive',
          error: error.message
        };
        this.stats.errors++;
      }
    }
    
    // Check Hoopla (if configured)
    if (this.libraries.hoopla.enabled && process.env.HOOPLA_API_KEY) {
      try {
        await this.rateLimitDelay('hoopla');
        const hooplaResult = await this.checkHooplaAvailability(book);
        results.availability.hoopla = hooplaResult;
      } catch (error) {
        results.availability.hoopla = {
          available: false,
          source: 'hoopla',
          error: error.message
        };
        this.stats.errors++;
      }
    }
    
    return results;
  }

  async rateLimitDelay(service) {
    const limit = this.rateLimits[service];
    const currentCount = this.requestCounts[service];
    
    if (currentCount >= limit) {
      console.log(`⏱️ Rate limit reached for ${service}, waiting 60 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
      this.requestCounts[service] = 0;
    }
    
    this.requestCounts[service]++;
  }

  updateBookWithAvailability(book, availabilityResult) {
    let updated = false;
    
    // Update availability fields
    if (availabilityResult.availability.worldcat?.available) {
      if (!book.library_availability || !book.library_availability.includes('WorldCat')) {
        book.library_availability = book.library_availability ? 
          `${book.library_availability}, WorldCat` : 'WorldCat';
        updated = true;
      }
    }
    
    if (availabilityResult.availability.overdrive?.available) {
      if (!book.library_availability || !book.library_availability.includes('OverDrive')) {
        book.library_availability = book.library_availability ? 
          `${book.library_availability}, OverDrive` : 'OverDrive';
        updated = true;
      }
    }
    
    if (availabilityResult.availability.hoopla?.available) {
      if (!book.library_availability || !book.library_availability.includes('Hoopla')) {
        book.library_availability = book.library_availability ? 
          `${book.library_availability}, Hoopla` : 'Hoopla';
        updated = true;
      }
    }
    
    // Update metadata
    book.availability_last_checked = availabilityResult.last_checked;
    book.availability_source = 'library-checker';
    
    if (updated) {
      book.updated_at = new Date().toISOString();
      this.stats.updated++;
    }
    
    return updated;
  }

  async checkBooksInBatch(books, batchSize = 10) {
    console.log(`🔍 Checking availability for ${books.length} books in batches of ${batchSize}...`);
    
    const results = [];
    
    for (let i = 0; i < books.length; i += batchSize) {
      const batch = books.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(books.length / batchSize);
      
      console.log(`\n📚 Processing batch ${batchNumber}/${totalBatches} (${batch.length} books)...`);
      
      const batchPromises = batch.map(async (book, index) => {
        try {
          const result = await this.checkBookAvailability(book);
          console.log(`  ✅ ${index + 1}/${batch.length}: ${book.book_title || book.title}`);
          return result;
        } catch (error) {
          console.log(`  ❌ ${index + 1}/${batch.length}: ${book.book_title || book.title} - ${error.message}`);
          this.stats.errors++;
          return null;
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean));
      
      // Progress update
      console.log(`✅ Batch ${batchNumber} completed. Progress: ${Math.min(i + batchSize, books.length)}/${books.length} books`);
      
      // Small delay between batches to be respectful to APIs
      if (i + batchSize < books.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }

  async run(filters = {}) {
    try {
      console.log('🚀 Starting library availability check...\n');
      
      const books = await this.loadBooks();
      console.log(`📚 Loaded ${books.length} books`);
      
      // Filter books based on criteria
      let booksToCheck = books;
      
      if (filters.status) {
        booksToCheck = booksToCheck.filter(book => 
          filters.status.includes(book.status)
        );
        console.log(`📋 Filtered to ${booksToCheck.length} books with status: ${filters.status.join(', ')}`);
      }
      
      if (filters.unprocessed) {
        booksToCheck = booksToCheck.filter(book => 
          !book.availability_last_checked || 
          new Date(book.availability_last_checked) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Older than 7 days
        );
        console.log(`📋 Filtered to ${booksToCheck.length} books needing availability updates`);
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
      const availabilityResults = await this.checkBooksInBatch(booksToCheck, 10);
      
      // Update books with availability data
      console.log('\n🔄 Updating books with availability data...');
      for (const result of availabilityResults) {
        if (result) {
          const book = books.find(b => b.goodreads_id === result.book_id);
          if (book) {
            this.updateBookWithAvailability(book, result);
          }
        }
      }
      
      // Save updated books
      await this.saveBooks(books);
      
      // Print statistics
      this.printStats();
      
      console.log('\n🎉 Library availability check completed successfully!');
      return {
        success: true,
        stats: this.stats,
        processed: availabilityResults.length
      };
      
    } catch (error) {
      console.error('\n❌ Library availability check failed:', error.message);
      throw error;
    }
  }

  printStats() {
    console.log('\n📊 Library Availability Check Statistics:');
    console.log(`📚 Books checked: ${this.stats.checked}`);
    console.log(`✅ Availability found: ${this.stats.found}`);
    console.log(`🔄 Books updated: ${this.stats.updated}`);
    console.log(`❌ Errors encountered: ${this.stats.errors}`);
    
    if (this.stats.checked > 0) {
      const successRate = ((this.stats.checked - this.stats.errors) / this.stats.checked * 100).toFixed(1);
      const foundRate = (this.stats.found / this.stats.checked * 100).toFixed(1);
      console.log(`📈 Success rate: ${successRate}%`);
      console.log(`📖 Found rate: ${foundRate}%`);
    }
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
        filters.limit = parseInt(args[++i]) || 50;
        break;
      case '--help':
        console.log(`
Library Availability Checker

Usage: node library-checker.js [options]

Options:
  --status <statuses>    Check books with specific statuses (comma-separated)
                        Default: all statuses
  --unprocessed         Only check books not checked in last 7 days
  --limit <number>      Limit number of books to check
  --help               Show this help message

Examples:
  node library-checker.js --status TBR --limit 20
  node library-checker.js --unprocessed
  node library-checker.js --status "TBR,Reading" --limit 50
        `);
        process.exit(0);
        break;
    }
  }
  
  const checker = new LibraryChecker();
  checker.run(filters).catch(error => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { LibraryChecker };