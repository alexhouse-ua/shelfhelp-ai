const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Goodreads CSV to Books.json Merge Script
class ExportMerger {
  constructor() {
    this.csvFile = '/Users/alhouse2/Documents/GitHub/shelfhelp-ai/goodreads_library_export-4.csv';
    this.booksFile = path.join(__dirname, '../data/books.json');
    this.existingBooks = [];
    this.exportBooks = [];
    this.mergedBooks = [];
    this.stats = {
      existing_count: 0,
      export_count: 0,
      matched_count: 0,
      new_count: 0,
      preserved_fields_count: 0,
      ai_classifications_preserved: 0
    };
  }

  async loadExistingBooks() {
    try {
      const data = fs.readFileSync(this.booksFile, 'utf-8');
      this.existingBooks = JSON.parse(data);
      this.stats.existing_count = this.existingBooks.length;
      console.log(`✅ Loaded ${this.existingBooks.length} existing books`);
    } catch (error) {
      console.error('❌ Error loading existing books:', error.message);
      throw error;
    }
  }

  async parseCSVExport() {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(this.csvFile)
        .pipe(csv())
        .on('data', (row) => {
          // Parse and normalize the CSV row
          const book = this.parseCSVRow(row);
          if (book) {
            results.push(book);
          }
        })
        .on('end', () => {
          this.exportBooks = results;
          this.stats.export_count = results.length;
          console.log(`✅ Parsed ${results.length} books from CSV export`);
          resolve(results);
        })
        .on('error', reject);
    });
  }

  parseCSVRow(row) {
    try {
      // Create GUID from Book Id (same format as RSS)
      const guid = `https://www.goodreads.com/review/show/${row['Book Id']}?utm_medium=api&utm_source=rss`;
      
      // Parse dates
      const dateRead = this.parseDate(row['Date Read']);
      const dateAdded = this.parseDate(row['Date Added']);
      
      // Determine status from shelf
      let status = 'TBR';
      if (row['Exclusive Shelf']) {
        const shelf = row['Exclusive Shelf'].toLowerCase();
        if (shelf === 'read' || dateRead) {
          status = 'Read';
        } else if (shelf === 'currently-reading') {
          status = 'Reading';
        } else if (shelf === 'to-read') {
          status = 'TBR';
        }
      }

      // Parse series info from title
      const { cleanTitle, seriesName, seriesNumber } = this.parseTitle(row['Title']);

      // Create book object with RSS-like structure
      const book = {
        guid: guid,
        goodreads_id: row['Book Id'],
        isbn: row['ISBN'] || '',
        title: row['Title'] || '',
        book_title: cleanTitle,
        author_name: row['Author'] || '',
        link: `https://www.goodreads.com/book/show/${row['Book Id']}`,
        book_image_url: '', // Not available in CSV
        book_description: '', // Not available in CSV  
        pubdate: dateAdded ? dateAdded.toISOString() : null,
        book_published: this.parseYear(row['Year Published'] || row['Original Publication Year']),
        average_rating: this.parseFloat(row['Average Rating']),
        updated_at: new Date().toISOString(),
        status: status,
        user_rating: this.parseInt(row['My Rating']) || null,
        user_read_at: dateRead ? dateRead.toISOString() : null,
        user_date_added: dateAdded ? dateAdded.toISOString() : null,
        user_date_created: null,
        reflection_pending: false,
        series_name: seriesName,
        series_number: seriesNumber,
        pages_source: this.parseInt(row['Number of Pages']) || null,
        goal_year: dateRead ? dateRead.getFullYear() : new Date().getFullYear()
      };

      return book;
    } catch (error) {
      console.warn('⚠️ Error parsing CSV row:', error.message, row);
      return null;
    }
  }

  parseDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') {return null;}
    
    try {
      // Handle various date formats from Goodreads export
      // Format: "7/9/25" or "2025/07/09"
      const cleaned = dateStr.trim();
      let date;
      
      if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        if (parts.length === 3) {
          const month = parseInt(parts[0]);
          const day = parseInt(parts[1]);
          let year = parseInt(parts[2]);
          
          // Handle 2-digit years
          if (year < 100) {
            year += year < 50 ? 2000 : 1900;
          }
          
          date = new Date(year, month - 1, day);
        }
      } else {
        date = new Date(cleaned);
      }
      
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.warn('⚠️ Could not parse date:', dateStr);
      return null;
    }
  }

  parseYear(yearStr) {
    if (!yearStr) {return null;}
    const year = parseInt(yearStr);
    return (year > 1800 && year <= new Date().getFullYear() + 5) ? year : null;
  }

  parseFloat(str) {
    if (!str) {return null;}
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  }

  parseInt(str) {
    if (!str) {return null;}
    const num = parseInt(str);
    return isNaN(num) ? null : num;
  }

  parseTitle(title) {
    if (!title) {return { cleanTitle: '', seriesName: null, seriesNumber: null };}
    
    // Extract series info from title like "Title (Series Name, #1)"
    const seriesMatch = title.match(/^(.+?)\s*\(([^,]+),?\s*#?(\d+(?:\.\d+)?)\)$/);
    
    if (seriesMatch) {
      return {
        cleanTitle: seriesMatch[1].trim(),
        seriesName: seriesMatch[2].trim(),
        seriesNumber: parseFloat(seriesMatch[3])
      };
    }
    
    // Try another pattern: "Title: Series Name Book 1"
    const altMatch = title.match(/^(.+?):\s*(.+?)\s+(?:Book|Vol\.?)\s+(\d+(?:\.\d+)?)$/i);
    if (altMatch) {
      return {
        cleanTitle: altMatch[1].trim(),
        seriesName: altMatch[2].trim(),
        seriesNumber: parseFloat(altMatch[3])
      };
    }
    
    return {
      cleanTitle: title.trim(),
      seriesName: null,
      seriesNumber: null
    };
  }

  findMatchingBook(exportBook) {
    // Try multiple matching strategies
    
    // 1. Match by goodreads_id (most reliable)
    let match = this.existingBooks.find(book => 
      book.goodreads_id === exportBook.goodreads_id
    );
    if (match) {return { book: match, method: 'goodreads_id' };}
    
    // 2. Match by GUID
    match = this.existingBooks.find(book => 
      book.guid === exportBook.guid
    );
    if (match) {return { book: match, method: 'guid' };}
    
    // 3. Match by title + author (fuzzy)
    match = this.existingBooks.find(book => 
      book.title && exportBook.title &&
      book.author_name && exportBook.author_name &&
      this.normalizeString(book.title) === this.normalizeString(exportBook.title) &&
      this.normalizeString(book.author_name) === this.normalizeString(exportBook.author_name)
    );
    if (match) {return { book: match, method: 'title_author' };}
    
    // 4. Match by book_title + author (in case title formatting differs)
    match = this.existingBooks.find(book => 
      book.book_title && exportBook.book_title &&
      book.author_name && exportBook.author_name &&
      this.normalizeString(book.book_title) === this.normalizeString(exportBook.book_title) &&
      this.normalizeString(book.author_name) === this.normalizeString(exportBook.author_name)
    );
    if (match) {return { book: match, method: 'book_title_author' };}
    
    return null;
  }

  normalizeString(str) {
    return str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  mergeBooks() {
    console.log('\n🔄 Starting book merge process...');
    
    // Fields that contain AI-generated data to preserve
    const aiFields = [
      'tone', 'genre', 'subgenre', 'tropes', 'spice', 'hype_flag',
      'ku_availability', 'ku_expires_on', 'availability_source',
      'queue_position', 'queue_priority', 'liked', 'disliked', 'notes',
      'rating_scale_tag', 'inferred_score', 'next_release_date'
    ];

    for (const exportBook of this.exportBooks) {
      const matchResult = this.findMatchingBook(exportBook);
      
      if (matchResult) {
        // Book exists - merge data
        const existingBook = matchResult.book;
        const mergedBook = { ...exportBook }; // Start with export data
        
        // Preserve non-null existing values when export has null/empty
        for (const [key, value] of Object.entries(existingBook)) {
          if (value !== null && value !== undefined && value !== '' &&
              (exportBook[key] === null || exportBook[key] === undefined || exportBook[key] === '')) {
            mergedBook[key] = value;
            this.stats.preserved_fields_count++;
          }
        }
        
        // Always preserve AI-generated classifications
        for (const field of aiFields) {
          if (existingBook[field] !== null && existingBook[field] !== undefined) {
            mergedBook[field] = existingBook[field];
            if (field === 'genre' || field === 'tropes') {
              this.stats.ai_classifications_preserved++;
            }
          }
        }
        
        // Update metadata
        mergedBook.updated_at = new Date().toISOString();
        
        this.mergedBooks.push(mergedBook);
        this.stats.matched_count++;
        
        console.log(`✅ Merged: ${exportBook.title} (${matchResult.method})`);
      } else {
        // New book - add as-is with defaults for missing fields
        const newBook = {
          ...exportBook,
          tone: null,
          genre: null,
          subgenre: null,
          tropes: null,
          spice: null,
          hype_flag: "None",
          ku_availability: false,
          ku_expires_on: null,
          availability_source: null,
          queue_position: null,
          queue_priority: null,
          liked: null,
          disliked: null,
          notes: null,
          rating_scale_tag: null,
          inferred_score: null,
          next_release_date: null
        };
        
        this.mergedBooks.push(newBook);
        this.stats.new_count++;
        
        console.log(`➕ New book: ${exportBook.title}`);
      }
    }
    
    console.log(`\n📊 Merge completed: ${this.mergedBooks.length} total books`);
  }

  async saveMergedBooks() {
    try {
      // Sort books by read date (most recent first)
      this.mergedBooks.sort((a, b) => {
        const dateA = a.user_read_at ? new Date(a.user_read_at) : new Date(0);
        const dateB = b.user_read_at ? new Date(b.user_read_at) : new Date(0);
        return dateB - dateA;
      });

      fs.writeFileSync(this.booksFile, JSON.stringify(this.mergedBooks, null, 2));
      console.log(`✅ Saved ${this.mergedBooks.length} books to ${this.booksFile}`);
    } catch (error) {
      console.error('❌ Error saving merged books:', error.message);
      throw error;
    }
  }

  printStats() {
    console.log('\n📈 Merge Statistics:');
    console.log(`📚 Original books.json: ${this.stats.existing_count}`);
    console.log(`📥 Export books: ${this.stats.export_count}`);
    console.log(`🔗 Matched books: ${this.stats.matched_count}`);
    console.log(`➕ New books: ${this.stats.new_count}`);
    console.log(`💾 Preserved fields: ${this.stats.preserved_fields_count}`);
    console.log(`🤖 AI classifications preserved: ${this.stats.ai_classifications_preserved}`);
    console.log(`📊 Final total: ${this.mergedBooks.length}`);
    
    // Validation
    const expectedTotal = this.stats.export_count;
    if (this.mergedBooks.length === expectedTotal) {
      console.log('✅ Validation passed: All export books included');
    } else {
      console.log(`⚠️ Validation warning: Expected ${expectedTotal}, got ${this.mergedBooks.length}`);
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Goodreads export merge...\n');
      
      await this.loadExistingBooks();
      await this.parseCSVExport();
      this.mergeBooks();
      await this.saveMergedBooks();
      this.printStats();
      
      console.log('\n🎉 Export merge completed successfully!');
    } catch (error) {
      console.error('\n❌ Export merge failed:', error.message);
      throw error;
    }
  }
}

// Check if csv-parser is available
try {
  require.resolve('csv-parser');
} catch (e) {
  console.error('❌ csv-parser module not found. Installing...');
  require('child_process').execSync('npm install csv-parser', { stdio: 'inherit' });
  console.log('✅ csv-parser installed');
}

// Run the merger
if (require.main === module) {
  const merger = new ExportMerger();
  merger.run().catch(console.error);
}

module.exports = { ExportMerger };