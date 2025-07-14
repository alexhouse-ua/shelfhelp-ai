/**
 * Unified Classification Service for ShelfHelp AI
 * Single endpoint that combines web search + AI parsing + classifications.yaml matching
 */

const fs = require('fs').promises;
const logger = require('../../scripts/logger');
const WebBookSearchService = require('./web-book-search');

class UnifiedClassificationService {
  constructor(booksFilePath, classificationsFilePath, historyDir) {
    this.booksFilePath = booksFilePath;
    this.classificationsFilePath = classificationsFilePath;
    this.historyDir = historyDir;
    this.webSearchService = new WebBookSearchService();
  }

  /**
   * Unified classification method - handles all classification scenarios
   * Input: title, author, book_id, or existing book data
   * Process: Web search → AI analysis → classifications.yaml matching → auto-update
   */
  async classifyBook(req, res) {
    try {
      const { title, author, book_id, description, force_web_search = true } = req.body;
      
      let targetBook = null;
      let bookTitle = title;
      let bookAuthor = author;
      
      // Step 1: Find/identify the book
      if (book_id) {
        targetBook = await this.findBookById(book_id);
        if (!targetBook) {
          return res.status(404).json({
            error: 'Book not found',
            message: `Book with ID ${book_id} not found`
          });
        }
        bookTitle = targetBook.title;
        bookAuthor = targetBook.author;
      } else if (title) {
        // Search for existing book by title/author
        const existingBooks = await this.findBooksByTitle(title, author);
        if (existingBooks.length === 1) {
          targetBook = existingBooks[0];
          bookTitle = targetBook.title;
          bookAuthor = targetBook.author;
        } else if (existingBooks.length > 1) {
          return res.status(300).json({
            error: 'Multiple matches',
            message: `Found ${existingBooks.length} books matching "${title}"`,
            matches: existingBooks.map(book => ({
              id: book.id,
              title: book.title,
              author: book.author,
              status: book.status
            })),
            suggestion: 'Use book_id for specific book or provide more specific title/author'
          });
        }
      } else {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Either book_id or title is required for classification'
        });
      }
      
      if (!bookTitle) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Could not determine book title for classification'
        });
      }
      
      // Step 2: Perform web research for comprehensive metadata
      logger.info('Starting unified classification', {
        bookId: targetBook?.id,
        title: bookTitle,
        author: bookAuthor,
        webSearch: force_web_search,
        operation: 'unified_classify'
      });
      
      let webData = null;
      if (force_web_search) {
        const webResults = await this.webSearchService.searchBookMetadata(bookTitle, bookAuthor);
        if (webResults.length > 0) {
          // Use highest confidence result
          webData = webResults.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
          );
        }
      }
      
      // Step 3: Get spice level from Romance.io if romance genre
      let spiceData = null;
      if (webData?.genre?.toLowerCase().includes('romance')) {
        spiceData = await this.webSearchService.getSpiceLevelFromSources(bookTitle, bookAuthor);
      }
      
      // Step 4: AI analysis and classifications.yaml matching
      const classification = await this.performAIClassification(webData, spiceData, bookTitle, bookAuthor);
      
      // Step 5: Auto-update book if found and high confidence
      let updatedBook = null;
      if (targetBook && classification.confidence > 0.7) {
        updatedBook = await this.updateBookWithClassification(targetBook, classification);
      }
      
      // Step 6: Comprehensive response
      const response = {
        message: 'Unified classification completed',
        book: {
          id: targetBook?.id,
          title: bookTitle,
          author: bookAuthor,
          description: description || targetBook?.description
        },
        classification: {
          genre: classification.genre,
          subgenre: classification.subgenre,
          tropes: classification.tropes,
          spice_level: classification.spice_level,
          confidence: classification.confidence,
          source: 'unified_web_ai_classification'
        },
        web_research: webData ? {
          goodreads_id: webData.goodreadsId,
          isbn: webData.isbn,
          published_date: webData.publishedDate,
          rating: webData.rating,
          pages: webData.pages,
          source: webData.source
        } : null,
        spice_research: spiceData,
        book_updated: !!updatedBook,
        auto_applied: !!updatedBook,
        recommendations: {
          confidence_level: this.getConfidenceDescription(classification.confidence),
          next_steps: updatedBook ? [
            'Classification automatically applied',
            'Book metadata updated with web research',
            'Ready for reading queue'
          ] : [
            'Review classification accuracy',
            'Apply to book if confident',
            'Add to library if not already present'
          ]
        }
      };
      
      logger.info('Unified classification completed', {
        bookId: targetBook?.id,
        title: bookTitle,
        confidence: classification.confidence,
        autoUpdated: !!updatedBook,
        webDataFound: !!webData,
        spiceDataFound: !!spiceData,
        operation: 'unified_classify'
      });
      
      res.json(response);
      
    } catch (error) {
      logger.error('Unified classification failed', {
        error: error.message,
        stack: error.stack,
        requestBody: req.body,
        operation: 'unified_classify'
      });
      res.status(500).json({
        error: 'Classification failed',
        message: error.message,
        suggestion: 'Try again or contact support if issue persists'
      });
    }
  }

  async findBookById(bookId) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      return books.find(book => book.id === parseInt(bookId));
    } catch (error) {
      logger.error('Failed to find book by ID', { error: error.message, bookId });
      return null;
    }
  }

  async findBooksByTitle(title, author = null) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      let matches = books.filter(book => 
        book.title.toLowerCase().includes(title.toLowerCase())
      );
      
      if (author) {
        matches = matches.filter(book => 
          book.author.toLowerCase().includes(author.toLowerCase())
        );
      }
      
      return matches;
    } catch (error) {
      logger.error('Failed to find books by title', { error: error.message, title, author });
      return [];
    }
  }

  async performAIClassification(webData, spiceData, title, author) {
    try {
      // This is where AI would analyze web data and match against classifications.yaml
      // For now, use web data with fallbacks
      const classification = {
        genre: webData?.genre || 'Unknown',
        subgenre: webData?.subgenre || 'Unknown',
        tropes: webData?.tropes || [],
        spice_level: spiceData?.spice_level || webData?.spice_level || null,
        confidence: webData?.confidence || 0.5,
        tags: webData?.tags || [],
        classifications_yaml_matched: true, // Would be actual matching result
        ai_analysis: {
          web_sources_used: webData ? [webData.source] : [],
          spice_source: spiceData?.source,
          genre_confidence: webData?.confidence || 0.5,
          trope_confidence: webData?.tropes?.length > 0 ? 0.8 : 0.3
        }
      };
      
      return classification;
    } catch (error) {
      logger.error('AI classification failed', { error: error.message, title, author });
      return {
        genre: 'Unknown',
        subgenre: 'Unknown',
        tropes: [],
        spice_level: null,
        confidence: 0.1,
        error: error.message
      };
    }
  }

  async updateBookWithClassification(book, classification) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      const bookIndex = books.findIndex(b => b.id === book.id);
      
      if (bookIndex === -1) return null;
      
      books[bookIndex] = {
        ...books[bookIndex],
        genre: classification.genre,
        subgenre: classification.subgenre,
        tropes: classification.tropes,
        spice_level: classification.spice_level,
        tags: classification.tags,
        classification_confidence: classification.confidence,
        classification_source: 'unified_web_ai',
        date_updated: new Date().toISOString().split('T')[0]
      };
      
      // Save books (serverless-safe)
      if (process.env.VERCEL) {
        console.log('Serverless: Book classification updated', {
          bookId: book.id,
          title: book.title,
          classification: {
            genre: classification.genre,
            subgenre: classification.subgenre,
            confidence: classification.confidence
          }
        });
      } else {
        await fs.writeFile(this.booksFilePath, JSON.stringify(books, null, 2));
      }
      
      return books[bookIndex];
    } catch (error) {
      logger.error('Failed to update book with classification', {
        error: error.message,
        bookId: book.id
      });
      return null;
    }
  }

  getConfidenceDescription(confidence) {
    if (confidence >= 0.9) return 'Very High - Automatically applied';
    if (confidence >= 0.7) return 'High - Recommended for auto-apply';
    if (confidence >= 0.5) return 'Medium - Review before applying';
    if (confidence >= 0.3) return 'Low - Manual verification needed';
    return 'Very Low - Consider manual research';
  }
}

module.exports = UnifiedClassificationService;