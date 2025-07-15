const fetch = require('node-fetch');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const HISTORY_DIR = path.join(__dirname, '../history');

// Helper functions
async function readBooksFile() {
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

async function writeBooksFile(books) {
  await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
  
  // Create history snapshot
  const timestamp = new Date().toISOString();
  const historyFile = path.join(HISTORY_DIR, `books_${timestamp}.jsonl`);
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(historyFile, JSON.stringify(books));
}

function extractGoodreadsId(link) {
  // Extract Goodreads ID from link like https://www.goodreads.com/book/show/12345.Title
  const match = link.match(/\/book\/show\/(\d+)/);
  return match ? match[1] : null;
}

function parseSeriesInfo(title) {
  // Parse series from title like "Book Title (Series Name #1)"
  const match = title.match(/^(.+?)\s*\((.+?)\s*#(\d+)\)$/);
  if (match) {
    return {
      book_title: match[1].trim(),
      series_name: match[2].trim(),
      series_number: parseInt(match[3])
    };
  }
  return {
    book_title: title,
    series_name: null,
    series_number: null
  };
}

function mapRssItemToBook(item) {
  const { book_title, series_name, series_number } = parseSeriesInfo(item.title[0]);
  
  return {
    guid: item.guid[0],
    goodreads_id: extractGoodreadsId(item.link[0]),
    title: book_title,
    author_name: item.author_name ? item.author_name[0] : null,
    series_name,
    series_number,
    status: determineStatusFromShelf(item),
    book_description: item.book_description ? item.book_description[0] : null,
    isbn: item.isbn ? item.isbn[0] : null,
    average_rating: item.average_rating ? parseFloat(item.average_rating[0]) : null,
    book_published: item.book_published ? parseInt(item.book_published[0]) : null,
    link: item.link[0],
    pubdate: item.pubDate ? new Date(item.pubDate[0]).toISOString() : null,
    image_url: item.book_image_url ? item.book_image_url[0] : null,
    // Initialize default values for schema fields
    genre: null,
    subgenre: null,
    tropes: [],
    spice: null,
    queue_position: null,
    queue_priority: null,
    liked: null,
    disliked: null,
    notes: null,
    updated_at: new Date().toISOString(),
    added_at: new Date().toISOString()
  };
}

function determineStatusFromShelf(item) {
  // Map Goodreads shelf to our status enum
  const shelf = item.user_shelves ? item.user_shelves[0] : '';
  
  if (shelf.includes('to-read')) return 'TBR';
  if (shelf.includes('currently-reading')) return 'Reading';
  if (shelf.includes('read')) return 'Finished';
  
  // Default to TBR if unclear
  return 'TBR';
}

function hasStatusChanged(oldStatus, newStatus) {
  // Check if this is a meaningful status change that should trigger learning
  const statusTransitions = {
    'TBR': ['Reading', 'Finished'],
    'Reading': ['Finished', 'TBR'],
    'Finished': [] // Finished books don't typically change status
  };
  
  return oldStatus !== newStatus && statusTransitions[oldStatus]?.includes(newStatus);
}

async function ingestRssFeed() {
  const rssUrl = process.env.GOODREADS_RSS_URL;
  
  if (!rssUrl) {
    throw new Error('GOODREADS_RSS_URL environment variable is required');
  }
  
  console.log('Fetching RSS feed from:', rssUrl);
  
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
    console.log(`Found ${items.length} items in RSS feed`);
    
    // Read existing books
    const existingBooks = await readBooksFile();
    const booksByGuid = new Map();
    const booksByGoodreadsId = new Map();
    
    existingBooks.forEach(book => {
      if (book.guid) booksByGuid.set(book.guid, book);
      if (book.goodreads_id) booksByGoodreadsId.set(book.goodreads_id, book);
    });
    
    let newBooks = 0;
    let updatedBooks = 0;
    
    // Process each RSS item
    for (const item of items) {
      const mappedBook = mapRssItemToBook(item);
      
      // Check for existing book by guid first, then by goodreads_id
      let existingBook = booksByGuid.get(mappedBook.guid);
      if (!existingBook && mappedBook.goodreads_id) {
        existingBook = booksByGoodreadsId.get(mappedBook.goodreads_id);
      }
      
      if (existingBook) {
        // Update existing book - only update certain fields from RSS
        const fieldsToUpdate = [
          'status', 'title', 'author_name', 'series_name', 'series_number',
          'book_description', 'average_rating', 'link', 'image_url'
        ];
        
        let hasChanges = false;
        fieldsToUpdate.forEach(field => {
          if (mappedBook[field] !== existingBook[field]) {
            existingBook[field] = mappedBook[field];
            hasChanges = true;
          }
        });
        
        if (hasChanges) {
          existingBook.updated_at = new Date().toISOString();
          updatedBooks++;
        }
      } else {
        // Add new book
        // Set queue_position for TBR books
        if (mappedBook.status === 'TBR') {
          const tbrCount = existingBooks.filter(b => b.status === 'TBR').length;
          mappedBook.queue_position = tbrCount + 1;
        }
        
        existingBooks.push(mappedBook);
        booksByGuid.set(mappedBook.guid, mappedBook);
        if (mappedBook.goodreads_id) {
          booksByGoodreadsId.set(mappedBook.goodreads_id, mappedBook);
        }
        newBooks++;
      }
    }
    
    // Save updated books
    await writeBooksFile(existingBooks);
    
    console.log(`RSS ingestion complete:`);
    console.log(`- New books added: ${newBooks}`);
    console.log(`- Existing books updated: ${updatedBooks}`);
    console.log(`- Total books in database: ${existingBooks.length}`);
    
    return {
      success: true,
      newBooks,
      updatedBooks,
      totalBooks: existingBooks.length
    };
    
  } catch (error) {
    console.error('RSS ingestion failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  ingestRssFeed()
    .then(result => {
      console.log('RSS ingestion completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('RSS ingestion failed:', error);
      process.exit(1);
    });
}

module.exports = { ingestRssFeed, hasStatusChanged, determineStatusFromShelf };