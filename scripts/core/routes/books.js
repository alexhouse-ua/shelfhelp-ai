const express = require('express');
const router = express.Router();
const BookManager = require('../../../src/core/book-manager');
const bookCache = require('../../../src/core/book-cache');
const logger = require('../logger');

// Initialize book manager
const bookManager = new BookManager(
  require('path').join(__dirname, '../../data/books.json'),
  require('path').join(__dirname, '../../history')
);

// GET /api/books - Search and filter books
router.get('/', async (req, res) => {
  try {
    const { search, status, genre, author, limit = 50, offset = 0 } = req.query;
    
    // Use cache for performance
    let books = bookCache.getAll();
    
    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      books = books.filter(book => 
        book.book_title?.toLowerCase().includes(searchLower) ||
        book.author_name?.toLowerCase().includes(searchLower) ||
        book.genres?.some(g => g.toLowerCase().includes(searchLower))
      );
    }
    
    if (status) {
      books = books.filter(book => book.status === status);
    }
    
    if (genre) {
      books = books.filter(book => 
        book.genres?.some(g => g.toLowerCase().includes(genre.toLowerCase()))
      );
    }
    
    if (author) {
      books = books.filter(book => 
        book.author_name?.toLowerCase().includes(author.toLowerCase())
      );
    }
    
    // Apply pagination
    const total = books.length;
    books = books.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      books,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + parseInt(limit) < total
      }
    });
    
  } catch (error) {
    logger.error('Books search failed', { error: error.message, query: req.query });
    res.status(500).json({
      success: false,
      error: 'Failed to search books',
      details: error.message
    });
  }
});

// GET /api/books/unclassified - Get unclassified books (must be before /:id route)
router.get('/unclassified', async (req, res) => {
  try {
    const result = await bookManager.getUnclassifiedBooks();
    
    res.json({
      success: true,
      books: result.books,
      count: result.books.length
    });
    
  } catch (error) {
    logger.error('Unclassified books retrieval failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve unclassified books',
      details: error.message
    });
  }
});

// GET /api/books/:id - Get specific book
router.get('/:id', async (req, res) => {
  try {
    const book = bookCache.getById(req.params.id);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
        bookId: req.params.id
      });
    }
    
    res.json({
      success: true,
      book
    });
    
  } catch (error) {
    logger.error('Book retrieval failed', { error: error.message, bookId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve book',
      details: error.message
    });
  }
});

// POST /api/books - Create new book
router.post('/', async (req, res) => {
  try {
    const result = await bookManager.createBook(req.body);
    
    res.json({
      success: true,
      book: result.book,
      message: 'Book created successfully'
    });
    
  } catch (error) {
    logger.error('Book creation failed', { error: error.message, bookData: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to create book',
      details: error.message
    });
  }
});

// PATCH /api/books/:id - Update book
router.patch('/:id', async (req, res) => {
  try {
    const result = await bookManager.updateBook(req.params.id, req.body);
    
    res.json({
      success: true,
      book: result.book,
      message: 'Book updated successfully'
    });
    
  } catch (error) {
    logger.error('Book update failed', { error: error.message, bookId: req.params.id, updates: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to update book',
      details: error.message
    });
  }
});

module.exports = router;