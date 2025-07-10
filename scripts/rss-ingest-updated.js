/**
 * Updated RSS Ingestion Script for ShelfHelp AI
 * 
 * Key Changes:
 * 1. Maps 'read' shelf to 'Read' status instead of 'Finished'
 * 2. Ensures Read books have no queue_position or queue_priority
 * 3. Converts all date fields to proper Date objects
 * 4. Auto-populates goal_year from user_read_at year
 * 5. Uses updated field names from Field Dictionary migration
 */

const fetch = require('node-fetch');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
const TitleParser = require('./title-parser');
require('dotenv').config();

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const HISTORY_DIR = path.join(__dirname, '../history');

class UpdatedRssIngestor {
  constructor() {
    this.titleParser = new TitleParser();
    this.stats = {
      newBooks: 0,
      updatedBooks: 0,
      totalBooks: 0,
      errors: 0
    };
  }

  async readBooksFile() {
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

  async writeBooksFile(books) {
    await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
    
    // Create history snapshot
    const timestamp = new Date().toISOString();
    const historyFile = path.join(HISTORY_DIR, `books_rss_refresh_${timestamp.replace(/[:.]/g, '-')}.jsonl`);
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    
    const historyEntry = {
      timestamp,
      operation: 'rss_refresh',
      stats: this.stats,
      books: books.length
    };
    
    await fs.writeFile(historyFile, JSON.stringify(historyEntry) + '\n');
  }

  extractGoodreadsId(link) {
    // Extract Goodreads ID from review link like https://www.goodreads.com/review/show/7714008089
    const reviewMatch = link.match(/\/review\/show\/(\d+)/);
    if (reviewMatch) {
      return reviewMatch[1];
    }
    
    // Fallback to book ID extraction
    const bookMatch = link.match(/\/book\/show\/(\d+)/);
    return bookMatch ? bookMatch[1] : null;
  }

  determineStatusFromShelf(item, rssUrl) {
    // Since we're fetching from a specific shelf URL, determine status from the URL
    if (rssUrl.includes('shelf=read')) return 'Read';
    if (rssUrl.includes('shelf=to-read')) return 'TBR';
    if (rssUrl.includes('shelf=currently-reading')) return 'Reading';
    
    // Fallback to checking user_shelves field if available
    const shelf = item.user_shelves ? item.user_shelves[0] : '';
    if (shelf.includes('to-read')) return 'TBR';
    if (shelf.includes('currently-reading')) return 'Reading';
    if (shelf.includes('read')) return 'Read';
    
    // Default to Read since most RSS feeds are from the read shelf
    return 'Read';
  }

  parseDate(dateString) {
    // Convert date strings to proper Date objects
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.warn(`Invalid date format: ${dateString}`);
      return null;
    }
  }

  extractGoalYear(userReadAt) {
    // Auto-populate goal_year from user_read_at year
    if (!userReadAt) return null;
    
    try {
      const date = new Date(userReadAt);
      return isNaN(date.getTime()) ? null : date.getFullYear();
    } catch (error) {
      return null;
    }
  }

  mapRssItemToBook(item, rssUrl) {
    // Parse title using the comprehensive title parser
    const parsed = this.titleParser.parse(item.title[0]);
    
    // Extract dates and convert to proper Date objects
    const pubDate = this.parseDate(item.pubDate ? item.pubDate[0] : null);
    const currentTime = new Date();
    
    // Determine status from shelf
    const status = this.determineStatusFromShelf(item, rssUrl);
    
    // For Read books, use RSS user_read_at if available, otherwise use pubdate
    const userReadAt = status === 'Read' ? 
      this.parseDate(item.user_read_at ? item.user_read_at[0] : item.pubDate ? item.pubDate[0] : null) : 
      null;
    
    return {
      // Identifiers & Metadata (using updated field names)
      guid: item.guid[0],
      goodreads_id: this.extractGoodreadsId(item.link[0]),
      isbn: item.isbn ? item.isbn[0] : "",
      title: item.title[0], // Keep original RSS title
      book_title: parsed.book_title, // Parsed clean title
      author_name: item.author_name ? item.author_name[0] : "",
      link: item.link[0],
      book_image_url: item.book_image_url ? item.book_image_url[0] : "", // Updated field name
      book_description: item.book_description ? item.book_description[0] : "",
      pubdate: pubDate,
      book_published: item.book_published ? parseInt(item.book_published[0]) : null,
      average_rating: item.average_rating ? parseFloat(item.average_rating[0]) : null,
      updated_at: currentTime,

      // Reading Status & Timing (using updated field names)
      status: status,
      user_rating: item.user_rating ? parseInt(item.user_rating[0]) : null,
      user_read_at: userReadAt, // Updated field name
      user_date_added: this.parseDate(item.user_date_added ? item.user_date_added[0] : null) || currentTime, // Updated field name
      user_date_created: null,
      reflection_pending: status === 'Read' ? true : false,

      // Series Information (from title parser)
      series_name: parsed.series_name,
      series_number: parsed.series_number,

      // Enrichment (default values)
      tone: null,
      genre: null,
      subgenre: null,
      tropes: [],
      spice: null,
      pages_source: null,
      next_release_date: null,
      hype_flag: "None",

      // Availability (default values)
      ku_availability: false,
      ku_expires_on: null,
      availability_source: null,

      // Dynamic GPT-Assigned Fields
      queue_position: status === 'Read' ? null : null, // Read books get no queue position
      queue_priority: status === 'Read' ? null : null, // Read books get no queue priority
      liked: null,
      disliked: null,
      notes: null,
      rating_scale_tag: null,
      inferred_score: null,
      goal_year: this.extractGoalYear(userReadAt) // Auto-filled from user_read_at year
    };
  }

  async ingestRssFeed() {
    const rssUrl = process.env.GOODREADS_RSS_URL;
    
    if (!rssUrl) {
      throw new Error('GOODREADS_RSS_URL environment variable is required');
    }
    
    console.log('🔄 Fetching RSS feed from:', rssUrl);
    
    try {
      // Fetch RSS feed
      const response = await fetch(rssUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const xmlData = await response.text();
      
      // Parse XML
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlData);
      
      if (!result.rss || !result.rss.channel || !result.rss.channel[0].item) {
        throw new Error('Invalid RSS feed structure');
      }
      
      const items = result.rss.channel[0].item;
      console.log(`📚 Found ${items.length} items in RSS feed`);
      
      // Read existing books
      const existingBooks = await this.readBooksFile();
      const booksByGuid = new Map();
      const booksByGoodreadsId = new Map();
      
      existingBooks.forEach(book => {
        if (book.guid) booksByGuid.set(book.guid, book);
        if (book.goodreads_id) booksByGoodreadsId.set(book.goodreads_id, book);
      });
      
      // Process each RSS item
      for (const item of items) {
        try {
          const mappedBook = this.mapRssItemToBook(item, rssUrl);
          
          // Check for existing book by guid first, then by goodreads_id
          let existingBook = booksByGuid.get(mappedBook.guid);
          if (!existingBook && mappedBook.goodreads_id) {
            existingBook = booksByGoodreadsId.get(mappedBook.goodreads_id);
          }
          
          if (existingBook) {
            // Update existing book - only update certain fields from RSS
            const fieldsToUpdate = [
              'status', 'title', 'book_title', 'author_name', 'series_name', 'series_number',
              'book_description', 'average_rating', 'link', 'book_image_url',
              'user_read_at', 'reflection_pending', 'goal_year'
            ];
            
            let hasChanges = false;
            fieldsToUpdate.forEach(field => {
              if (JSON.stringify(mappedBook[field]) !== JSON.stringify(existingBook[field])) {
                existingBook[field] = mappedBook[field];
                hasChanges = true;
              }
            });
            
            // Clear queue fields for Read books
            if (mappedBook.status === 'Read') {
              if (existingBook.queue_position !== null || existingBook.queue_priority !== null) {
                existingBook.queue_position = null;
                existingBook.queue_priority = null;
                hasChanges = true;
              }
            }
            
            if (hasChanges) {
              existingBook.updated_at = new Date();
              this.stats.updatedBooks++;
            }
          } else {
            // Add new book
            // Set queue_position for TBR books only
            if (mappedBook.status === 'TBR') {
              const tbrCount = existingBooks.filter(b => b.status === 'TBR').length;
              mappedBook.queue_position = tbrCount + 1;
            }
            
            existingBooks.push(mappedBook);
            booksByGuid.set(mappedBook.guid, mappedBook);
            if (mappedBook.goodreads_id) {
              booksByGoodreadsId.set(mappedBook.goodreads_id, mappedBook);
            }
            this.stats.newBooks++;
          }
        } catch (error) {
          console.warn(`⚠️ Error processing RSS item: ${error.message}`);
          this.stats.errors++;
        }
      }
      
      this.stats.totalBooks = existingBooks.length;
      
      // Save updated books
      await this.writeBooksFile(existingBooks);
      
      console.log(`✅ RSS ingestion complete:`);
      console.log(`- New books added: ${this.stats.newBooks}`);
      console.log(`- Existing books updated: ${this.stats.updatedBooks}`);
      console.log(`- Errors encountered: ${this.stats.errors}`);
      console.log(`- Total books in database: ${this.stats.totalBooks}`);
      
      return {
        success: true,
        ...this.stats
      };
      
    } catch (error) {
      console.error('❌ RSS ingestion failed:', error);
      throw error;
    }
  }

  // Method to completely repopulate from RSS (removes existing books)
  async repopulateFromRss() {
    console.log('🔄 Starting complete repopulation from RSS feed...');
    
    // Backup existing books
    const existingBooks = await this.readBooksFile();
    if (existingBooks.length > 0) {
      const backupPath = path.join(__dirname, `../data/books_backup_before_repopulation_${Date.now()}.json`);
      await fs.writeFile(backupPath, JSON.stringify(existingBooks, null, 2));
      console.log(`💾 Backup created: ${backupPath}`);
    }
    
    // Clear existing books and start fresh
    await fs.writeFile(BOOKS_FILE, JSON.stringify([], null, 2));
    
    // Run normal RSS ingestion (will treat all as new books)
    const result = await this.ingestRssFeed();
    
    console.log('✅ Complete repopulation from RSS completed successfully');
    return result;
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const ingestor = new UpdatedRssIngestor();
  
  try {
    if (args.includes('--repopulate')) {
      await ingestor.repopulateFromRss();
    } else {
      await ingestor.ingestRssFeed();
    }
    
    console.log('✅ RSS processing completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ RSS processing failed:', error);
    process.exit(1);
  }
}

// Export for use in other modules
module.exports = { UpdatedRssIngestor };

// Run if called directly
if (require.main === module) {
  main();
}