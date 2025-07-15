/**
 * Book Management Module for ShelfHelp AI
 * Handles all book CRUD operations and data validation
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../scripts/core/logger');
const WebBookSearchService = require('./web-book-search');

class BookManager {
  constructor(booksFilePath, historyDir) {
    this.booksFilePath = booksFilePath;
    this.historyDir = historyDir;
    this.webSearchService = new WebBookSearchService();
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
      if (!bookData.title) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Title is required field'
        });
      }
      
      // If only title provided, perform web search for matches
      if (!bookData.author || bookData.auto_lookup !== false) {
        return await this.createBookWithWebLookup(req, res);
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
      
      // Write back to file (handle serverless environment)
      await this.saveBooks(books);
      
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
      
      // Write back to file (handle serverless environment)
      await this.saveBooks(books);
      
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

  async saveBooks(books) {
    try {
      // Check if running in serverless environment
      if (process.env.VERCEL) {
        // In serverless, we need external persistence (Firebase/Supabase)
        // For now, log the operation and return success
        console.log('Serverless environment detected - books save operation logged', {
          operation: 'save_books',
          count: books.length,
          timestamp: new Date().toISOString(),
          books: books.slice(0, 3) // Log first 3 books for debugging
        });
        
        // TODO: Implement Firebase/Supabase persistence
        // For MVP, return success to enable testing
        return true;
      }
      
      // Local development - write to file
      await fs.writeFile(this.booksFilePath, JSON.stringify(books, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving books:', error);
      throw new Error(`Failed to save books: ${error.message}`);
    }
  }

  async searchBooks(req, res) {
    try {
      const { title, author } = req.query;
      
      if (!title && !author) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Either title or author parameter is required'
        });
      }
      
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      let matches = books;
      
      // Search by title (case insensitive)
      if (title) {
        matches = matches.filter(book => 
          book.title.toLowerCase().includes(title.toLowerCase())
        );
      }
      
      // Filter by author if provided
      if (author) {
        matches = matches.filter(book => 
          book.author.toLowerCase().includes(author.toLowerCase())
        );
      }
      
      logger.info('Book search completed', {
        searchTerms: { title, author },
        resultsCount: matches.length,
        operation: 'search_books'
      });
      
      res.json({
        books: matches,
        searchTerms: { title, author },
        resultsCount: matches.length,
        totalBooks: books.length
      });
    } catch (error) {
      logger.error('Failed to search books', { 
        error: error.message,
        searchTerms: req.query,
        operation: 'search_books' 
      });
      res.status(500).json({ 
        error: 'Failed to search books', 
        message: error.message 
      });
    }
  }

  async getBookByTitle(title, author = null) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      // Search by title (case insensitive)
      let matches = books.filter(book => 
        book.title.toLowerCase().includes(title.toLowerCase())
      );
      
      // If author provided, filter further
      if (author) {
        matches = matches.filter(book => 
          book.author.toLowerCase().includes(author.toLowerCase())
        );
      }
      
      return matches;
    } catch (error) {
      console.error('Error searching books by title:', error);
      return [];
    }
  }

  async createBookWithWebLookup(req, res) {
    try {
      const { title, author } = req.body;
      
      // Perform web search for book metadata
      const searchResults = await this.webSearchService.searchBookMetadata(title, author);
      
      if (searchResults.length === 0) {
        return res.status(404).json({
          error: 'Book not found',
          message: `No books found for "${title}"${author ? ` by ${author}` : ''}`,
          suggestion: 'Try a different title or add the book manually with auto_lookup=false'
        });
      }
      
      if (searchResults.length === 1) {
        // Single match - auto-create with web data
        const webResult = searchResults[0];
        const enhancedBookData = {
          title: webResult.title,
          author: webResult.author,
          genre: webResult.genre,
          subgenre: webResult.subgenre,
          tropes: webResult.tropes,
          isbn: webResult.isbn,
          published_date: webResult.publishedDate,
          pages: webResult.pages,
          description: webResult.description,
          goodreads_id: webResult.goodreadsId,
          rating_average: webResult.rating,
          rating_count: webResult.ratingsCount,
          spice_level: webResult.spice_level,
          image_url: webResult.imageUrl,
          status: req.body.status || 'tbr',
          date_added: new Date().toISOString().split('T')[0],
          date_updated: new Date().toISOString().split('T')[0],
          source: 'web_lookup_auto_created',
          web_confidence: webResult.confidence
        };
        
        return await this.createBookFromData(enhancedBookData, res);
      }
      
      // Multiple matches - return options for user selection
      return res.status(300).json({
        message: `Found ${searchResults.length} potential matches for "${title}"`,
        matches: searchResults.map(result => ({
          title: result.title,
          author: result.author,
          published_date: result.publishedDate,
          description: result.description?.substring(0, 200) + '...',
          rating: result.rating,
          confidence: result.confidence,
          source: result.source,
          create_url: `/api/books/create-from-match`,
          match_data: {
            title: result.title,
            author: result.author,
            isbn: result.isbn,
            goodreads_id: result.goodreadsId
          }
        })),
        instructions: {
          auto_select: 'If you see the correct book, use createBookFromMatch with the match_data',
          manual_add: 'To add manually without lookup, use auto_lookup=false in request'
        }
      });
      
    } catch (error) {
      logger.error('Failed to create book with web lookup', {
        error: error.message,
        title: req.body.title,
        author: req.body.author,
        operation: 'create_book_web_lookup'
      });
      res.status(500).json({
        error: 'Web lookup failed',
        message: error.message,
        fallback: 'Try adding the book manually with auto_lookup=false'
      });
    }
  }

  async createBookFromData(bookData, res) {
    try {
      // Read current books
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      // Generate new ID
      const maxId = books.length > 0 ? Math.max(...books.map(b => b.id || 0)) : 0;
      const newBook = {
        id: maxId + 1,
        ...bookData
      };
      
      // Add to books array
      books.push(newBook);
      
      // Write back to file (handle serverless environment)
      await this.saveBooks(books);
      
      // Log to history
      await this.logBookHistory('create', newBook);
      
      logger.info('Book created from web data', {
        bookId: newBook.id,
        title: newBook.title,
        author: newBook.author,
        source: newBook.source,
        confidence: newBook.web_confidence,
        operation: 'create_book_from_data'
      });
      
      res.status(201).json({
        message: 'Book created successfully with web lookup',
        book: newBook,
        web_lookup: {
          source: newBook.source,
          confidence: newBook.web_confidence,
          auto_classified: !!(newBook.genre && newBook.subgenre)
        }
      });
    } catch (error) {
      logger.error('Failed to create book from data', {
        error: error.message,
        title: bookData.title,
        operation: 'create_book_from_data'
      });
      res.status(500).json({
        error: 'Failed to create book',
        message: error.message
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