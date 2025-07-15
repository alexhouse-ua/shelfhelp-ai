/**
 * Historical Data Import Script for ShelfHelp AI
 * Imports CSV historical export and merges with existing RSS data
 */

const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const HISTORY_DIR = path.join(__dirname, '../history');

class HistoricalDataImporter {
  constructor() {
    this.stats = {
      totalRows: 0,
      newBooks: 0,
      updatedBooks: 0,
      skippedRows: 0,
      errors: 0,
      duplicates: 0
    };
    this.conflicts = [];
  }

  async loadExistingBooks() {
    try {
      const data = await fs.readFile(BOOKS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  parseDate(dateStr) {
    if (!dateStr || dateStr === '' || dateStr === 'null') {return null;}
    
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  parseNumber(numStr) {
    if (!numStr || numStr === '' || numStr === 'null') {return null;}
    
    const num = parseFloat(numStr);
    return isNaN(num) ? null : num;
  }

  parseInteger(intStr) {
    if (!intStr || intStr === '' || intStr === 'null') {return null;}
    
    const int = parseInt(intStr);
    return isNaN(int) ? null : int;
  }

  parseArray(str) {
    if (!str || str === '' || str === 'null') {return [];}
    
    try {
      // Handle various array formats: "item1,item2" or "item1; item2" or JSON array
      if (str.startsWith('[') && str.endsWith(']')) {
        return JSON.parse(str);
      }
      
      // Split by comma or semicolon and clean up
      return str.split(/[,;]/).map(item => item.trim()).filter(item => item !== '');
    } catch (error) {
      return [str]; // Fallback to single item array
    }
  }

  mapCsvRowToBook(row) {
    // Map CSV fields to our Field Dictionary structure
    return {
      // Identifiers & Metadata
      guid: row.guid || null,
      goodreads_id: row.goodreads_id || row['Book Id'] || null,
      isbn: row.ISBN || null,
      title: row.Title || null,
      book_title: row.book_title || row.Title || null,
      author_name: row.Author || null,
      link: row.link || null,
      book_image_url: row.book_image_url || null,
      book_description: row.book_description || row.description || null,
      pubdate: this.parseDate(row.pubdate),
      book_published: this.parseInteger(row['Original Publication Year'] || row['Year Published']),
      average_rating: this.parseNumber(row['Average Rating']),
      updated_at: new Date(),

      // Reading Status & Timing
      status: 'Read', // All historical data is read books
      user_rating: this.parseInteger(row['My Rating']),
      user_read_at: this.parseDate(row['Date Read']),
      user_date_added: this.parseDate(row['Date Added']),
      user_date_created: this.parseDate(row.user_date_created),
      reflection_pending: true, // All imported books need reflections

      // Series Information
      series_name: row.series_name || null,
      series_number: this.parseNumber(row.series_number),

      // Enrichment
      tone: row.tone || null,
      genre: null, // Will be populated by classification later
      subgenre: null, // Will be populated by classification later
      tropes: this.parseArray(row.trope), // Parse trope field as array
      spice: null, // Will be populated by classification later
      pages_source: this.parseInteger(row['Number of Pages'] || row.pages_source),
      next_release_date: this.parseDate(row.next_release_date),
      hype_flag: row.hype_flag || "None",

      // Availability
      ku_availability: false, // Default for historical data
      ku_expires_on: this.parseDate(row.ku_expires_on),
      availability_source: row.availability_source || null,

      // Dynamic GPT-Assigned Fields
      queue_position: null, // Read books don't have queue positions
      queue_priority: null, // Read books don't have queue priority
      liked: row.liked || null,
      disliked: row.disliked || null,
      notes: row['My Review'] || row.extras || null,
      rating_scale_tag: row.rating_scale_tag || null,
      inferred_score: this.parseNumber(row.inferred_score),
      goal_year: this.parseInteger(row.goal_year) || this.extractGoalYear(row['Date Read'])
    };
  }

  extractGoalYear(dateReadStr) {
    const date = this.parseDate(dateReadStr);
    return date ? date.getFullYear() : null;
  }

  async importCsv(csvFilePath) {
    console.log(`📂 Importing historical data from: ${csvFilePath}`);
    
    // Load existing books
    const existingBooks = await this.loadExistingBooks();
    const booksByGuid = new Map();
    const booksByGoodreadsId = new Map();
    
    existingBooks.forEach(book => {
      if (book.guid) {booksByGuid.set(book.guid, book);}
      if (book.goodreads_id) {booksByGoodreadsId.set(book.goodreads_id, book);}
    });

    console.log(`📚 Found ${existingBooks.length} existing books`);

    // Parse CSV and process rows
    const csvRows = [];
    
    return new Promise((resolve, reject) => {
      createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          csvRows.push(row);
        })
        .on('end', async () => {
          try {
            console.log(`📊 Processing ${csvRows.length} CSV rows...`);
            this.stats.totalRows = csvRows.length;

            for (const row of csvRows) {
              try {
                const mappedBook = this.mapCsvRowToBook(row);
                
                // Skip rows with missing critical data
                if (!mappedBook.goodreads_id && !mappedBook.guid) {
                  this.stats.skippedRows++;
                  continue;
                }

                // Check for existing book
                let existingBook = null;
                if (mappedBook.guid) {
                  existingBook = booksByGuid.get(mappedBook.guid);
                }
                if (!existingBook && mappedBook.goodreads_id) {
                  existingBook = booksByGoodreadsId.get(mappedBook.goodreads_id);
                }

                if (existingBook) {
                  // Merge historical data with existing book
                  await this.mergeHistoricalData(existingBook, mappedBook);
                  this.stats.updatedBooks++;
                } else {
                  // Add new historical book
                  existingBooks.push(mappedBook);
                  if (mappedBook.guid) {booksByGuid.set(mappedBook.guid, mappedBook);}
                  if (mappedBook.goodreads_id) {booksByGoodreadsId.set(mappedBook.goodreads_id, mappedBook);}
                  this.stats.newBooks++;
                }

              } catch (error) {
                console.warn(`⚠️ Error processing row: ${error.message}`);
                this.stats.errors++;
              }
            }

            // Save updated books
            await this.saveBooks(existingBooks);
            await this.logImportHistory();
            
            resolve(this.stats);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  async mergeHistoricalData(existingBook, historicalBook) {
    // Strategy: Fill in missing information from historical data, enhance existing data
    
    // Note: Core RSS fields (guid, link, pubdate, updated_at, status) are preserved automatically

    // Always use historical data if available (enrichment and user data)
    const fieldsToAlwaysUseHistorical = [
      'user_rating', 'user_date_created', 'tone', 'pages_source',
      'liked', 'disliked', 'notes', 'rating_scale_tag', 'inferred_score',
      'hype_flag', 'availability_source', 'ku_expires_on'
    ];

    // Fill in if missing or enhance with historical data
    const fieldsToFillOrEnhance = [
      'isbn', 'title', 'book_title', 'author_name', 'book_image_url',
      'book_description', 'book_published', 'average_rating',
      'series_name', 'series_number', 'next_release_date', 'goal_year'
    ];

    // Special handling for date fields - detect conflicts but allow historical override
    const dateFields = ['user_read_at', 'user_date_added'];
    dateFields.forEach(field => {
      if (existingBook[field] && historicalBook[field]) {
        const rssDate = new Date(existingBook[field]);
        const histDate = new Date(historicalBook[field]);
        
        if (rssDate.getTime() !== histDate.getTime()) {
          this.conflicts.push({
            goodreads_id: existingBook.goodreads_id,
            field: field,
            rss_value: existingBook[field],
            historical_value: historicalBook[field],
            resolution: 'used_historical'
          });
        }
      }
      
      // Use historical date if available (it's usually more accurate)
      if (historicalBook[field] !== null && historicalBook[field] !== undefined) {
        existingBook[field] = historicalBook[field];
      }
    });

    // Always use historical enrichment data
    fieldsToAlwaysUseHistorical.forEach(field => {
      if (historicalBook[field] !== null && historicalBook[field] !== undefined) {
        if (field === 'tropes' && Array.isArray(historicalBook[field])) {
          // Merge trope arrays - combine RSS and historical tropes
          const existingTropes = existingBook[field] || [];
          const newTropes = historicalBook[field] || [];
          existingBook[field] = [...new Set([...existingTropes, ...newTropes])];
        } else {
          existingBook[field] = historicalBook[field];
        }
      }
    });

    // Fill in missing fields or enhance with better historical data
    fieldsToFillOrEnhance.forEach(field => {
      if (historicalBook[field] !== null && historicalBook[field] !== undefined) {
        // Fill if missing
        if (!existingBook[field] || existingBook[field] === null || existingBook[field] === '') {
          existingBook[field] = historicalBook[field];
        } else {
          // For certain fields, historical data might be more complete
          if (field === 'book_description' && historicalBook[field].length > existingBook[field].length) {
            this.conflicts.push({
              goodreads_id: existingBook.goodreads_id,
              field: field,
              rss_value: `${existingBook[field].substring(0, 50)}...`,
              historical_value: `${historicalBook[field].substring(0, 50)}...`,
              resolution: 'used_longer_description'
            });
            existingBook[field] = historicalBook[field];
          } else if (field === 'book_title' && historicalBook[field] !== existingBook[field]) {
            // Keep track of title differences but use historical (usually cleaner)
            this.conflicts.push({
              goodreads_id: existingBook.goodreads_id,
              field: field,
              rss_value: existingBook[field],
              historical_value: historicalBook[field],
              resolution: 'used_historical'
            });
            existingBook[field] = historicalBook[field];
          }
        }
      }
    });

    existingBook.updated_at = new Date();
  }

  async saveBooks(books) {
    await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
    console.log(`💾 Saved ${books.length} books to books.json`);
  }

  async logImportHistory() {
    const timestamp = new Date().toISOString();
    const historyEntry = {
      timestamp,
      operation: 'historical_import',
      stats: this.stats,
      conflicts: this.conflicts.length
    };

    const historyFile = path.join(HISTORY_DIR, `historical_import_${timestamp.replace(/[:.]/g, '-')}.jsonl`);
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    await fs.writeFile(historyFile, JSON.stringify(historyEntry) + '\n');

    if (this.conflicts.length > 0) {
      const conflictFile = path.join(__dirname, '../reports/historical_import_conflicts.json');
      await fs.writeFile(conflictFile, JSON.stringify(this.conflicts, null, 2));
      console.log(`⚠️ ${this.conflicts.length} conflicts logged to: ${conflictFile}`);
    }
  }

  printReport() {
    console.log('\n📊 Historical Import Summary');
    console.log('============================');
    console.log(`Total CSV Rows: ${this.stats.totalRows}`);
    console.log(`New Books Added: ${this.stats.newBooks}`);
    console.log(`Existing Books Updated: ${this.stats.updatedBooks}`);
    console.log(`Rows Skipped: ${this.stats.skippedRows}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`Conflicts Detected: ${this.conflicts.length}`);
    
    if (this.conflicts.length > 0) {
      console.log('\n⚠️ Sample Conflicts (RSS data preserved):');
      this.conflicts.slice(0, 3).forEach(conflict => {
        console.log(`  ${conflict.field}: RSS="${conflict.rss_value}" vs Historical="${conflict.historical_value}"`);
      });
    }
  }

  // Preview mode
  async preview(csvFilePath, limit = 5) {
    console.log('👁️ Preview Mode: Analyzing CSV structure...\n');
    
    const rows = [];
    return new Promise((resolve, reject) => {
      createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          if (rows.length < limit) {
            rows.push(row);
          }
        })
        .on('end', () => {
          console.log(`📋 CSV Headers (${Object.keys(rows[0] || {}).length} fields):`);
          console.log(Object.keys(rows[0] || {}).join(', '));
          
          console.log(`\n📚 Sample Mappings (first ${rows.length} rows):`);
          rows.forEach((row, index) => {
            const mapped = this.mapCsvRowToBook(row);
            console.log(`\n${index + 1}. "${mapped.title}"`);
            console.log(`   Goodreads ID: ${mapped.goodreads_id}`);
            console.log(`   Author: ${mapped.author_name}`);
            console.log(`   Date Read: ${mapped.user_read_at}`);
            console.log(`   Rating: ${mapped.user_rating}`);
            console.log(`   Goal Year: ${mapped.goal_year}`);
            console.log(`   Tropes: ${mapped.tropes.join(', ') || 'None'}`);
          });
          
          resolve();
        })
        .on('error', reject);
    });
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const importer = new HistoricalDataImporter();
  
  if (args.length === 0) {
    console.log('Usage: node import-historical-data.js <csv-file-path> [--preview]');
    console.log('  --preview: Show CSV structure and sample mappings without importing');
    process.exit(1);
  }

  const csvFilePath = args[0];
  const isPreview = args.includes('--preview');

  try {
    if (isPreview) {
      await importer.preview(csvFilePath);
    } else {
      await importer.importCsv(csvFilePath);
      importer.printReport();
      console.log('\n✅ Historical data import completed successfully!');
    }
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

module.exports = { HistoricalDataImporter };

if (require.main === module) {
  main();
}