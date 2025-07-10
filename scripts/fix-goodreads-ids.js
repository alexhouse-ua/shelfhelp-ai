#!/usr/bin/env node

/**
 * Fix Goodreads IDs for RSS-imported books
 * Extracts goodreads_id from RSS URLs and updates books.json
 */

const fs = require('fs').promises;
const path = require('path');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');

function extractGoodreadsId(url) {
  if (!url) return null;
  
  // Extract from URLs like: https://www.goodreads.com/review/show/7714008089?utm_medium=api&utm_source=rss
  // Or from book URLs like: https://www.goodreads.com/book/show/123456
  const patterns = [
    /goodreads\.com\/review\/show\/(\d+)/,
    /goodreads\.com\/book\/show\/(\d+)/,
    /\/show\/(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

async function fixGoodreadsIds() {
  try {
    console.log('🔍 Reading books.json...');
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    const books = JSON.parse(data);
    
    let updatedCount = 0;
    
    console.log(`📚 Processing ${books.length} books...`);
    
    for (const book of books) {
      if (!book.goodreads_id && (book.link || book.guid)) {
        // Try to extract from link first, then guid
        const extractedId = extractGoodreadsId(book.link) || extractGoodreadsId(book.guid);
        
        if (extractedId) {
          book.goodreads_id = extractedId;
          book.updated_at = new Date().toISOString();
          updatedCount++;
          console.log(`✅ Updated "${book.title}" → goodreads_id: ${extractedId}`);
        } else {
          console.log(`⚠️  Could not extract ID for "${book.title}" from: ${book.link || book.guid}`);
        }
      }
    }
    
    if (updatedCount > 0) {
      console.log(`\n💾 Saving updated books.json with ${updatedCount} fixes...`);
      await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
      
      // Create history snapshot
      const timestamp = new Date().toISOString();
      const historyDir = path.join(__dirname, '../history');
      await fs.mkdir(historyDir, { recursive: true });
      const historyFile = path.join(historyDir, `books_goodreads_fix_${timestamp}.jsonl`);
      await fs.writeFile(historyFile, JSON.stringify(books));
      
      console.log(`✅ Successfully updated ${updatedCount} books with Goodreads IDs`);
      console.log(`📄 History saved to: ${historyFile}`);
    } else {
      console.log('ℹ️  No books needed Goodreads ID fixes');
    }
    
  } catch (error) {
    console.error('❌ Error fixing Goodreads IDs:', error.message);
    process.exit(1);
  }
}

// Run the fix
fixGoodreadsIds();
