const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID
};

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: firebaseConfig.databaseURL
});

const db = admin.database();

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

async function syncToFirebase(books) {
  try {
    const booksRef = db.ref('books');
    const syncData = {};
    
    books.forEach(book => {
      if (book.goodreads_id) {
        syncData[book.goodreads_id] = book;
      }
    });
    
    await booksRef.set(syncData);
    console.log('Synced to Firebase successfully');
  } catch (error) {
    console.error('Firebase sync error:', error);
  }
}

// Routes

// GET /api/books - Get all books with optional filtering
app.get('/api/books', async (req, res) => {
  try {
    const books = await readBooksFile();
    const { status, author, genre, limit } = req.query;
    
    let filteredBooks = books;
    
    if (status) {
      filteredBooks = filteredBooks.filter(book => book.status === status);
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
    
    if (limit) {
      filteredBooks = filteredBooks.slice(0, parseInt(limit));
    }
    
    res.json(filteredBooks);
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
    await syncToFirebase(books);
    
    res.status(201).json({ 
      message: 'Book added successfully', 
      book: newBook 
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
    await syncToFirebase(books);
    
    res.json({ 
      message: 'Book updated successfully',
      book: books[bookIndex],
      changes: Object.keys(updates)
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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