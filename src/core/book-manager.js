/**
 * Book Management Module for ShelfHelp AI
 * Handles all book CRUD operations and data validation
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../scripts/logger');

class BookManager {
  constructor(booksFilePath, historyDir) {
    this.booksFilePath = booksFilePath;
    this.historyDir = historyDir;
  }

  async getAllBooks(req, res) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const { search, status, genre, year, limit } = req.query;
      let filteredBooks = books;
      
      // Apply filters
      if (search) {
        const searchLower = search.toLowerCase();
        filteredBooks = filteredBooks.filter(book => 
          book.title?.toLowerCase().includes(searchLower) ||
          book.author?.toLowerCase().includes(searchLower) ||
          book.series?.toLowerCase().includes(searchLower)
        );
      }
      
      if (status) {
        filteredBooks = filteredBooks.filter(book => book.status === status);
      }
      
      if (genre) {
        filteredBooks = filteredBooks.filter(book => book.genre === genre);
      }
      
      if (year) {
        filteredBooks = filteredBooks.filter(book => 
          book.date_added && new Date(book.date_added).getFullYear().toString() === year
        );
      }
      
      // Apply limit
      if (limit) {
        const limitNum = parseInt(limit);
        if (!isNaN(limitNum) && limitNum > 0) {
          filteredBooks = filteredBooks.slice(0, limitNum);
        }
      }
      
      logger.info('Books retrieved successfully', {
        total: books.length,
        filtered: filteredBooks.length,
        filters: { search, status, genre, year, limit },
        operation: 'get_books'
      });
      
      res.json({
        books: filteredBooks,
        total: books.length,
        filtered: filteredBooks.length,
        filters: { search, status, genre, year, limit }
      });
    } catch (error) {
      logger.error('Failed to retrieve books', { 
        error: error.message,
        operation: 'get_books' 
      });
      res.status(500).json({ 
        error: 'Failed to retrieve books', 
        message: error.message 
      });
    }
  }

  async createBook(req, res) {
    try {
      const bookData = req.body;
      
      // Validate required fields
      if (!bookData.title || !bookData.author) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Title and author are required fields'
        });
      }
      
      // Read current books
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      // Generate new ID
      const maxId = books.length > 0 ? Math.max(...books.map(b => b.id || 0)) : 0;
      const newBook = {
        id: maxId + 1,
        ...bookData,
        date_added: bookData.date_added || new Date().toISOString().split('T')[0],
        date_updated: new Date().toISOString().split('T')[0]
      };
      
      // Add to books array
      books.push(newBook);
      
      // Write back to file
      await fs.writeFile(this.booksFilePath, JSON.stringify(books, null, 2));
      
      // Log to history
      await this.logBookHistory('create', newBook);
      
      logger.info('Book created successfully', {
        bookId: newBook.id,
        title: newBook.title,
        author: newBook.author,
        operation: 'create_book'
      });
      
      res.status(201).json({
        message: 'Book created successfully',
        book: newBook
      });
    } catch (error) {
      logger.error('Failed to create book', { 
        error: error.message,
        operation: 'create_book' 
      });
      res.status(500).json({ 
        error: 'Failed to create book', 
        message: error.message 
      });
    }
  }

  async updateBook(req, res) {
    try {
      const bookId = parseInt(req.params.id);
      const updateData = req.body;
      
      if (isNaN(bookId)) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid book ID'
        });
      }
      
      // Read current books
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      // Find book index
      const bookIndex = books.findIndex(book => book.id === bookId);
      if (bookIndex === -1) {
        return res.status(404).json({
          error: 'Book not found',
          message: `Book with ID ${bookId} not found`
        });
      }
      
      // Store original for history
      const originalBook = { ...books[bookIndex] };
      
      // Update book
      books[bookIndex] = {
        ...books[bookIndex],
        ...updateData,
        id: bookId, // Ensure ID cannot be changed
        date_updated: new Date().toISOString().split('T')[0]
      };
      
      // Write back to file
      await fs.writeFile(this.booksFilePath, JSON.stringify(books, null, 2));
      
      // Log to history
      await this.logBookHistory('update', books[bookIndex], originalBook);
      
      logger.info('Book updated successfully', {
        bookId: bookId,
        title: books[bookIndex].title,
        operation: 'update_book'
      });
      
      res.json({
        message: 'Book updated successfully',
        book: books[bookIndex]
      });
    } catch (error) {
      logger.error('Failed to update book', { 
        error: error.message,
        bookId: req.params.id,
        operation: 'update_book' 
      });
      res.status(500).json({ 
        error: 'Failed to update book', 
        message: error.message 
      });
    }
  }

  async getUnclassifiedBooks(req, res) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const unclassifiedBooks = books.filter(book => 
        !book.genre || 
        !book.subgenre || 
        !book.tropes || 
        book.tropes.length === 0
      );
      
      logger.info('Unclassified books retrieved', {
        total: books.length,
        unclassified: unclassifiedBooks.length,
        operation: 'get_unclassified_books'
      });
      
      res.json({
        books: unclassifiedBooks,
        total: books.length,
        unclassified: unclassifiedBooks.length,
        classification_status: {
          missing_genre: books.filter(b => !b.genre).length,
          missing_subgenre: books.filter(b => !b.subgenre).length,
          missing_tropes: books.filter(b => !b.tropes || b.tropes.length === 0).length
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve unclassified books', { 
        error: error.message,
        operation: 'get_unclassified_books' 
      });
      res.status(500).json({ 
        error: 'Failed to retrieve unclassified books', 
        message: error.message 
      });
    }
  }

  async getBookById(req, res) {
    try {
      const bookId = parseInt(req.params.id);
      
      if (isNaN(bookId)) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid book ID'
        });
      }
      
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const book = books.find(book => book.id === bookId);
      if (!book) {
        return res.status(404).json({
          error: 'Book not found',
          message: `Book with ID ${bookId} not found`
        });
      }
      
      logger.info('Book retrieved by ID', {
        bookId: bookId,
        title: book.title,
        operation: 'get_book_by_id'
      });
      
      res.json({ book });
    } catch (error) {
      logger.error('Failed to retrieve book', { 
        error: error.message,
        bookId: req.params.id,
        operation: 'get_book_by_id' 
      });
      res.status(500).json({ 
        error: 'Failed to retrieve book', 
        message: error.message 
      });
    }
  }

  async logBookHistory(action, book, originalBook = null) {
    try {
      const historyEntry = {
        timestamp: new Date().toISOString(),
        action: action,
        book_id: book.id,
        book_title: book.title,
        book_author: book.author,
        changes: originalBook ? this.getChanges(originalBook, book) : null,
        data: action === 'create' ? book : null
      };
      
      const historyFile = path.join(this.historyDir, `books_${new Date().toISOString().split('T')[0]}.jsonl`);
      await fs.appendFile(historyFile, JSON.stringify(historyEntry) + '\n');
    } catch (error) {
      logger.error('Failed to log book history', { 
        error: error.message,
        action: action,
        bookId: book.id 
      });
    }
  }

  getChanges(original, updated) {
    const changes = {};
    for (const key in updated) {
      if (original[key] !== updated[key]) {
        changes[key] = {
          from: original[key],
          to: updated[key]
        };
      }
    }
    return changes;
  }
}

module.exports = BookManager;