const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');
const yaml = require('yaml');
const { firebaseConfig, isFirebaseConfigured, hasFirebaseCredentials } = require('./firebase-config');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin with graceful fallback
let db = null;
let firebaseEnabled = false;

try {
  if (isFirebaseConfigured() && hasFirebaseCredentials()) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: firebaseConfig.databaseURL
    });
    
    db = admin.database();
    firebaseEnabled = true;
    console.log('✅ Firebase initialized successfully');
  } else {
    console.log('⚠️ Firebase credentials not available - running in local mode only');
    console.log('   Firebase sync will be skipped. Set FIREBASE_* environment variables to enable.');
  }
} catch (error) {
  console.warn('⚠️ Firebase initialization failed:', error.message);
  console.log('   Continuing in local mode without Firebase sync');
  firebaseEnabled = false;
}

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const CLASSIFICATIONS_FILE = path.join(__dirname, '../data/classifications.yaml');
const HISTORY_DIR = path.join(__dirname, '../history');
const REPORTS_DIR = path.join(__dirname, '../reports');

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

async function readClassificationsFile() {
  try {
    const data = await fs.readFile(CLASSIFICATIONS_FILE, 'utf-8');
    return yaml.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { Genres: [], Spice_Levels: [], Tropes: [] };
    }
    throw error;
  }
}

// Validation functions
function validateBookFields(bookData, classifications) {
  const errors = [];
  
  // Validate status
  const validStatuses = ['TBR', 'Reading', 'Finished', 'DNF', 'Archived'];
  if (bookData.status && !validStatuses.includes(bookData.status)) {
    errors.push(`Invalid status: ${bookData.status}. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  // Validate genre
  if (bookData.genre && classifications.Genres) {
    const validGenres = classifications.Genres.map(g => g.Genre);
    if (!validGenres.includes(bookData.genre)) {
      errors.push(`Invalid genre: ${bookData.genre}. Must be one of the genres in classifications.yaml`);
    }
  }
  
  // Validate subgenre
  if (bookData.subgenre && classifications.Genres) {
    const validSubgenres = classifications.Genres.flatMap(g => g.Subgenre || []);
    if (!validSubgenres.includes(bookData.subgenre)) {
      errors.push(`Invalid subgenre: ${bookData.subgenre}. Must be one of the subgenres in classifications.yaml`);
    }
  }
  
  // Validate tropes
  if (bookData.tropes && Array.isArray(bookData.tropes) && classifications.Tropes) {
    const validTropes = classifications.Tropes.flatMap(t => t.Tropes || []);
    const invalidTropes = bookData.tropes.filter(trope => !validTropes.includes(trope));
    if (invalidTropes.length > 0) {
      errors.push(`Invalid tropes: ${invalidTropes.join(', ')}. Must be from classifications.yaml`);
    }
  }
  
  // Validate spice level
  if (bookData.spice !== undefined && bookData.spice !== null) {
    const spiceLevel = parseInt(bookData.spice);
    if (isNaN(spiceLevel) || spiceLevel < 1 || spiceLevel > 5) {
      errors.push('Invalid spice level. Must be an integer between 1 and 5');
    }
  }
  
  // Validate queue_position
  if (bookData.queue_position !== undefined && bookData.queue_position !== null) {
    const queuePos = parseInt(bookData.queue_position);
    if (isNaN(queuePos) || queuePos < 1) {
      errors.push('Invalid queue_position. Must be a positive integer');
    }
  }
  
  return errors;
}

async function writeBooksFile(books) {
  await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
  
  // Create history snapshot
  const timestamp = new Date().toISOString();
  const historyFile = path.join(HISTORY_DIR, `books_${timestamp}.jsonl`);
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(historyFile, JSON.stringify(books));
}

async function syncToFirebase(books) {
  // Skip Firebase sync if not enabled
  if (!firebaseEnabled || !db) {
    console.log('📝 Firebase sync skipped (not configured)');
    return { success: false, reason: 'Firebase not configured' };
  }
  
  try {
    const booksRef = db.ref('books');
    const syncData = {};
    
    books.forEach(book => {
      if (book.goodreads_id) {
        syncData[book.goodreads_id] = book;
      }
    });
    
    await booksRef.set(syncData);
    console.log('✅ Synced to Firebase successfully');
    return { success: true, count: Object.keys(syncData).length };
  } catch (error) {
    console.error('❌ Firebase sync error:', error.message);
    
    // Log specific error types for debugging
    if (error.code === 'PERMISSION_DENIED') {
      console.error('   Check Firebase security rules and authentication');
    } else if (error.code === 'NETWORK_ERROR') {
      console.error('   Check internet connection and Firebase URL');
    } else if (error.code === 'UNAUTHENTICATED') {
      console.error('   Check Firebase credentials and service account key');
    }
    
    return { success: false, error: error.message, code: error.code };
  }
}

// Routes

// GET /api/books - Get all books with optional filtering
app.get('/api/books', async (req, res) => {
  try {
    const books = await readBooksFile();
    const { 
      status, author, genre, subgenre, tropes, spice, 
      liked, series, queue_position, limit, offset,
      sort, order = 'asc'
    } = req.query;
    
    let filteredBooks = books;
    
    // Apply filters
    if (status) {
      const statusList = status.split(',').map(s => s.trim());
      filteredBooks = filteredBooks.filter(book => statusList.includes(book.status));
    }
    
    if (author) {
      filteredBooks = filteredBooks.filter(book => 
        book.author_name && book.author_name.toLowerCase().includes(author.toLowerCase())
      );
    }
    
    if (genre) {
      filteredBooks = filteredBooks.filter(book => 
        book.genre && book.genre.toLowerCase().includes(genre.toLowerCase())
      );
    }
    
    if (subgenre) {
      filteredBooks = filteredBooks.filter(book => 
        book.subgenre && book.subgenre.toLowerCase().includes(subgenre.toLowerCase())
      );
    }
    
    if (tropes) {
      const tropeList = tropes.split(',').map(t => t.trim());
      filteredBooks = filteredBooks.filter(book => 
        book.tropes && book.tropes.some(trope => 
          tropeList.some(searchTrope => 
            trope.toLowerCase().includes(searchTrope.toLowerCase())
          )
        )
      );
    }
    
    if (spice) {
      const spiceLevel = parseInt(spice);
      if (!isNaN(spiceLevel)) {
        filteredBooks = filteredBooks.filter(book => book.spice === spiceLevel);
      }
    }
    
    if (liked !== undefined) {
      const likedValue = liked === 'true';
      filteredBooks = filteredBooks.filter(book => book.liked === likedValue);
    }
    
    if (series) {
      filteredBooks = filteredBooks.filter(book => 
        book.series_name && book.series_name.toLowerCase().includes(series.toLowerCase())
      );
    }
    
    if (queue_position) {
      const queuePos = parseInt(queue_position);
      if (!isNaN(queuePos)) {
        filteredBooks = filteredBooks.filter(book => book.queue_position === queuePos);
      }
    }
    
    // Apply sorting
    if (sort) {
      filteredBooks.sort((a, b) => {
        let aValue = a[sort];
        let bValue = b[sort];
        
        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';
        
        // Convert to strings for comparison
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        
        if (order === 'desc') {
          return bValue.localeCompare(aValue);
        } else {
          return aValue.localeCompare(bValue);
        }
      });
    }
    
    // Apply pagination
    const startIndex = offset ? parseInt(offset) : 0;
    const endIndex = limit ? startIndex + parseInt(limit) : filteredBooks.length;
    const paginatedBooks = filteredBooks.slice(startIndex, endIndex);
    
    // Return results with metadata
    res.json({
      books: paginatedBooks,
      total: filteredBooks.length,
      offset: startIndex,
      limit: limit ? parseInt(limit) : null,
      filters: {
        status, author, genre, subgenre, tropes, spice,
        liked, series, queue_position, sort, order
      }
    });
  } catch (error) {
    console.error('Error reading books:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/books - Add a new book
app.post('/api/books', async (req, res) => {
  try {
    const { goodreads_id, title, author_name, status = 'TBR', ...bookData } = req.body;
    
    if (!goodreads_id || !title) {
      return res.status(400).json({ error: 'goodreads_id and title are required' });
    }
    
    // Validate fields against classifications
    const classifications = await readClassificationsFile();
    const validationErrors = validateBookFields({ status, ...bookData }, classifications);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }
    
    const books = await readBooksFile();
    
    // Check if book already exists
    const existingBook = books.find(book => book.goodreads_id === goodreads_id);
    if (existingBook) {
      return res.status(409).json({ error: 'Book already exists', book: existingBook });
    }
    
    const newBook = {
      goodreads_id,
      title,
      author_name,
      status,
      queue_position: status === 'TBR' ? books.filter(b => b.status === 'TBR').length + 1 : null,
      updated_at: new Date().toISOString(),
      added_at: new Date().toISOString(),
      ...bookData
    };
    
    books.push(newBook);
    await writeBooksFile(books);
    const syncResult = await syncToFirebase(books);
    
    res.status(201).json({ 
      message: 'Book added successfully', 
      book: newBook,
      firebase_sync: syncResult
    });
  } catch (error) {
    console.error('Error adding book:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/books/:id - Update a book
app.patch('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    // Validate fields against classifications
    const classifications = await readClassificationsFile();
    const validationErrors = validateBookFields(updates, classifications);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }
    
    const books = await readBooksFile();
    const bookIndex = books.findIndex(book => book.goodreads_id === id);
    
    if (bookIndex === -1) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const originalBook = { ...books[bookIndex] };
    
    // Apply updates
    books[bookIndex] = {
      ...books[bookIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    // Handle status changes
    if (updates.status && updates.status !== originalBook.status) {
      if (updates.status === 'TBR') {
        books[bookIndex].queue_position = books.filter(b => b.status === 'TBR').length;
      } else {
        books[bookIndex].queue_position = null;
      }
    }
    
    await writeBooksFile(books);
    const syncResult = await syncToFirebase(books);
    
    res.json({ 
      message: 'Book updated successfully',
      book: books[bookIndex],
      changes: Object.keys(updates),
      previous: Object.keys(updates).reduce((prev, key) => {
        prev[key] = originalBook[key];
        return prev;
      }, {}),
      firebase_sync: syncResult
    });
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/:id - Get a specific book
app.get('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const books = await readBooksFile();
    const book = books.find(book => book.goodreads_id === id);
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json(book);
  } catch (error) {
    console.error('Error reading book:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/queue - Get TBR queue sorted by position
app.get('/api/queue', async (req, res) => {
  try {
    const books = await readBooksFile();
    const queue = books
      .filter(book => book.status === 'TBR')
      .sort((a, b) => (a.queue_position || 999) - (b.queue_position || 999));
    
    res.json(queue);
  } catch (error) {
    console.error('Error reading queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/generate_report - Generate weekly/monthly reports
app.post('/api/generate_report', async (req, res) => {
  try {
    const { type = 'weekly', date } = req.body;
    
    if (!['weekly', 'monthly'].includes(type)) {
      return res.status(400).json({ error: 'Invalid report type. Must be "weekly" or "monthly"' });
    }
    
    const books = await readBooksFile();
    const reportDate = date ? new Date(date) : new Date();
    const report = await generateReport(books, type, reportDate);
    
    // Save report to file
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const reportDir = path.join(REPORTS_DIR, type);
    await fs.mkdir(reportDir, { recursive: true });
    
    const filename = type === 'weekly' 
      ? `${reportDate.getFullYear()}-W${getWeekNumber(reportDate)}.md`
      : `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}.md`;
    
    const reportPath = path.join(reportDir, filename);
    await fs.writeFile(reportPath, report.content);
    
    res.status(202).json({
      message: 'Report generated successfully',
      type,
      date: reportDate.toISOString(),
      filename,
      path: reportPath,
      url: `/reports/${type}/${filename}`,
      stats: report.stats
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions for report generation
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateRange(type, date) {
  const end = new Date(date);
  const start = new Date(date);
  
  if (type === 'weekly') {
    start.setDate(end.getDate() - 6);
  } else {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
  }
  
  return { start, end };
}

async function generateReport(books, type, date) {
  const { start, end } = getDateRange(type, date);
  
  // Filter books updated in the date range
  const periodBooks = books.filter(book => {
    const updatedDate = new Date(book.updated_at);
    return updatedDate >= start && updatedDate <= end;
  });
  
  // Calculate statistics
  const stats = {
    total_books: books.length,
    period_updates: periodBooks.length,
    finished_books: periodBooks.filter(b => b.status === 'Finished').length,
    tbr_books: books.filter(b => b.status === 'TBR').length,
    reading_books: books.filter(b => b.status === 'Reading').length,
    genres: {},
    authors: {},
    average_rating: null,
    top_tropes: {}
  };
  
  // Calculate genre distribution
  books.forEach(book => {
    if (book.genre) {
      stats.genres[book.genre] = (stats.genres[book.genre] || 0) + 1;
    }
  });
  
  // Calculate author distribution
  books.forEach(book => {
    if (book.author_name) {
      stats.authors[book.author_name] = (stats.authors[book.author_name] || 0) + 1;
    }
  });
  
  // Calculate average rating
  const ratedBooks = books.filter(b => b.average_rating && b.average_rating > 0);
  if (ratedBooks.length > 0) {
    stats.average_rating = ratedBooks.reduce((sum, book) => sum + book.average_rating, 0) / ratedBooks.length;
  }
  
  // Calculate top tropes
  const tropeCount = {};
  books.forEach(book => {
    if (book.tropes && Array.isArray(book.tropes)) {
      book.tropes.forEach(trope => {
        tropeCount[trope] = (tropeCount[trope] || 0) + 1;
      });
    }
  });
  
  stats.top_tropes = Object.entries(tropeCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .reduce((obj, [trope, count]) => {
      obj[trope] = count;
      return obj;
    }, {});
  
  // Generate report content
  const reportTitle = type === 'weekly' 
    ? `Weekly Reading Report - Week ${getWeekNumber(date)}, ${date.getFullYear()}`
    : `Monthly Reading Report - ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  
  const content = `# ${reportTitle}

**Generated**: ${new Date().toISOString()}
**Period**: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}

## 📊 Statistics

- **Total Books**: ${stats.total_books}
- **Books Updated This Period**: ${stats.period_updates}
- **Books Finished**: ${stats.finished_books}
- **TBR Queue**: ${stats.tbr_books}
- **Currently Reading**: ${stats.reading_books}
- **Average Rating**: ${stats.average_rating ? stats.average_rating.toFixed(1) : 'N/A'}

## 📚 Top Genres

${Object.entries(stats.genres)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 5)
  .map(([genre, count]) => `- **${genre}**: ${count} books`)
  .join('\n')}

## ✍️ Top Authors

${Object.entries(stats.authors)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 5)
  .map(([author, count]) => `- **${author}**: ${count} books`)
  .join('\n')}

## 🏷️ Top Tropes

${Object.entries(stats.top_tropes)
  .map(([trope, count]) => `- **${trope}**: ${count} books`)
  .join('\n')}

## 📖 Recent Activity

${periodBooks.length > 0 
  ? periodBooks.slice(0, 10).map(book => 
      `- **${book.title}** by ${book.author_name || 'Unknown'} - ${book.status}`
    ).join('\n')
  : 'No recent activity'}

## 📋 TBR Queue Preview

${books.filter(b => b.status === 'TBR')
  .sort((a, b) => (a.queue_position || 999) - (b.queue_position || 999))
  .slice(0, 5)
  .map((book, index) => `${index + 1}. **${book.title}** by ${book.author_name || 'Unknown'}`)
  .join('\n')}

---

*Generated by ShelfHelp AI Assistant*
`;
  
  return { content, stats };
}

// GET /api/classifications - Get available classifications
app.get('/api/classifications', async (req, res) => {
  try {
    const classifications = await readClassificationsFile();
    res.json(classifications);
  } catch (error) {
    console.error('Error reading classifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    firebase: {
      enabled: firebaseEnabled,
      configured: isFirebaseConfigured(),
      has_credentials: hasFirebaseCredentials()
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`ShelfHelp API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;