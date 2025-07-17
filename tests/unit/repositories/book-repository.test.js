/**
 * BookRepository Unit Tests
 * Tests the BookRepository implementation and data layer abstraction
 */

const { BookRepository } = require('../../../src/core/repositories/book-repository');
const { JSONFileDataSource } = require('../../../src/core/repositories/data-sources/json-file-data-source');
const fs = require('fs').promises;
const path = require('path');

describe('BookRepository Tests', () => {
  let repository;
  let testDataSource;
  let testFilePath;

  beforeEach(async () => {
    // Create temporary test file
    testFilePath = path.join(__dirname, '../../temp/test-books.json');
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
    
    // Initialize with test data
    const testData = [
      {
        id: 'book1',
        title: 'Test Book 1',
        author_name: 'Test Author',
        status: 'read',
        genre: 'Fiction',
        user_rating: 4,
        book_published: 2023,
        user_read_at: '2024-01-15T10:00:00Z',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z'
      },
      {
        id: 'book2',
        title: 'Test Book 2',
        author_name: 'Another Author',
        status: 'to-read',
        genre: 'Mystery',
        book_published: 2022,
        user_date_added: '2024-02-01T10:00:00Z',
        created_at: '2024-02-01T10:00:00Z',
        updated_at: '2024-02-01T10:00:00Z'
      }
    ];
    
    await fs.writeFile(testFilePath, JSON.stringify(testData, null, 2));
    
    // Create data source and repository
    testDataSource = new JSONFileDataSource(testFilePath);
    repository = new BookRepository(testDataSource, { cacheEnabled: false });
    
    await repository.initialize();
  });

  afterEach(async () => {
    // Clean up test file
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // File might not exist, ignore
    }
  });

  describe('Initialization', () => {
    test('should initialize repository correctly', async () => {
      expect(repository.initialized).toBe(true);
      expect(repository.dataSource).toBe(testDataSource);
    });

    test('should handle initialization errors', async () => {
      const invalidDataSource = new JSONFileDataSource('/invalid/path.json');
      const invalidRepository = new BookRepository(invalidDataSource);
      
      await expect(invalidRepository.initialize()).rejects.toThrow();
    });
  });

  describe('Basic CRUD Operations', () => {
    test('should find book by ID', async () => {
      const book = await repository.findById('book1');
      
      expect(book).toBeDefined();
      expect(book.title).toBe('Test Book 1');
      expect(book.author_name).toBe('Test Author');
    });

    test('should return null for non-existent ID', async () => {
      const book = await repository.findById('non-existent');
      expect(book).toBeNull();
    });

    test('should find all books', async () => {
      const books = await repository.findAll();
      
      expect(books).toHaveLength(2);
      expect(books[0].title).toBe('Test Book 1');
      expect(books[1].title).toBe('Test Book 2');
    });

    test('should create new book', async () => {
      const newBook = {
        title: 'New Book',
        author_name: 'New Author',
        status: 'currently-reading',
        genre: 'Romance'
      };
      
      const createdBook = await repository.create(newBook);
      
      expect(createdBook.title).toBe('New Book');
      expect(createdBook.id).toBeDefined();
      expect(createdBook.created_at).toBeDefined();
      expect(createdBook.updated_at).toBeDefined();
      
      // Verify it was actually added
      const books = await repository.findAll();
      expect(books).toHaveLength(3);
    });

    test('should update existing book', async () => {
      const updatedBook = await repository.update('book1', {
        status: 'currently-reading',
        user_rating: 5
      });
      
      expect(updatedBook.status).toBe('currently-reading');
      expect(updatedBook.user_rating).toBe(5);
      expect(updatedBook.updated_at).toBeDefined();
      
      // Verify original fields are preserved
      expect(updatedBook.title).toBe('Test Book 1');
      expect(updatedBook.author_name).toBe('Test Author');
    });

    test('should delete book', async () => {
      const result = await repository.delete('book1');
      expect(result).toBe(true);
      
      // Verify deletion
      const books = await repository.findAll();
      expect(books).toHaveLength(1);
      expect(books[0].id).toBe('book2');
    });

    test('should throw error when deleting non-existent book', async () => {
      await expect(repository.delete('non-existent')).rejects.toThrow();
    });
  });

  describe('Query Operations', () => {
    test('should find books by criteria', async () => {
      const books = await repository.findBy({ status: 'read' });
      
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Test Book 1');
    });

    test('should find books by status', async () => {
      const readBooks = await repository.findByStatus('read');
      const toReadBooks = await repository.findByStatus('to-read');
      
      expect(readBooks).toHaveLength(1);
      expect(toReadBooks).toHaveLength(1);
      expect(readBooks[0].title).toBe('Test Book 1');
      expect(toReadBooks[0].title).toBe('Test Book 2');
    });

    test('should find books by author', async () => {
      const books = await repository.findByAuthor('Test Author');
      
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Test Book 1');
    });

    test('should find books by genre', async () => {
      const fictionBooks = await repository.findByGenre('Fiction');
      const mysteryBooks = await repository.findByGenre('Mystery');
      
      expect(fictionBooks).toHaveLength(1);
      expect(mysteryBooks).toHaveLength(1);
      expect(fictionBooks[0].title).toBe('Test Book 1');
      expect(mysteryBooks[0].title).toBe('Test Book 2');
    });

    test('should find books by rating range', async () => {
      const books = await repository.findByRatingRange(3, 5);
      
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Test Book 1');
      expect(books[0].user_rating).toBe(4);
    });

    test('should find books by publication year', async () => {
      const books2023 = await repository.findByPublicationYear(2023);
      const books2022 = await repository.findByPublicationYear(2022);
      
      expect(books2023).toHaveLength(1);
      expect(books2022).toHaveLength(1);
      expect(books2023[0].title).toBe('Test Book 1');
      expect(books2022[0].title).toBe('Test Book 2');
    });

    test('should search books by text query', async () => {
      const books = await repository.searchBooks('Test');
      
      expect(books).toHaveLength(2);
      
      const authorSearch = await repository.searchBooks('Another');
      expect(authorSearch).toHaveLength(1);
      expect(authorSearch[0].title).toBe('Test Book 2');
    });
  });

  describe('Query Options', () => {
    test('should apply limit option', async () => {
      const books = await repository.findAll({ limit: 1 });
      
      expect(books).toHaveLength(1);
    });

    test('should apply offset option', async () => {
      const books = await repository.findAll({ offset: 1 });
      
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Test Book 2');
    });

    test('should apply sort option', async () => {
      const booksAsc = await repository.findAll({ sort: 'title:asc' });
      const booksDesc = await repository.findAll({ sort: 'title:desc' });
      
      expect(booksAsc[0].title).toBe('Test Book 1');
      expect(booksAsc[1].title).toBe('Test Book 2');
      
      expect(booksDesc[0].title).toBe('Test Book 2');
      expect(booksDesc[1].title).toBe('Test Book 1');
    });

    test('should combine multiple options', async () => {
      const books = await repository.findAll({
        sort: 'title:asc',
        offset: 1,
        limit: 1
      });
      
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Test Book 2');
    });
  });

  describe('Batch Operations', () => {
    test('should create multiple books', async () => {
      const newBooks = [
        {
          title: 'Batch Book 1',
          author_name: 'Batch Author',
          status: 'to-read'
        },
        {
          title: 'Batch Book 2',
          author_name: 'Batch Author',
          status: 'to-read'
        }
      ];
      
      const createdBooks = await repository.createMany(newBooks);
      
      expect(createdBooks).toHaveLength(2);
      expect(createdBooks[0].title).toBe('Batch Book 1');
      expect(createdBooks[1].title).toBe('Batch Book 2');
      
      // Verify they were added
      const allBooks = await repository.findAll();
      expect(allBooks).toHaveLength(4);
    });

    test('should update multiple books', async () => {
      const updatedCount = await repository.updateMany(
        { author_name: 'Test Author' },
        { status: 'reviewed' }
      );
      
      expect(updatedCount).toBe(1);
      
      const book = await repository.findById('book1');
      expect(book.status).toBe('reviewed');
    });

    test('should delete multiple books', async () => {
      const deletedCount = await repository.deleteMany({ status: 'read' });
      
      expect(deletedCount).toBe(1);
      
      const books = await repository.findAll();
      expect(books).toHaveLength(1);
      expect(books[0].id).toBe('book2');
    });
  });

  describe('Collection Management', () => {
    test('should add book to collection', async () => {
      const book = await repository.addToCollection({
        title: 'Added Book',
        author_name: 'Added Author',
        genre: 'Fantasy'
      });
      
      expect(book.status).toBe('to-read');
      expect(book.user_date_added).toBeDefined();
      
      const books = await repository.findAll();
      expect(books).toHaveLength(3);
    });

    test('should remove book from collection', async () => {
      const result = await repository.removeFromCollection('book1');
      expect(result).toBe(true);
      
      const books = await repository.findAll();
      expect(books).toHaveLength(1);
    });

    test('should update book status', async () => {
      const book = await repository.updateStatus('book2', 'read');
      
      expect(book.status).toBe('read');
      expect(book.user_read_at).toBeDefined();
    });

    test('should update book rating', async () => {
      const book = await repository.updateRating('book2', 3);
      
      expect(book.user_rating).toBe(3);
    });
  });

  describe('Statistics and Analytics', () => {
    test('should get collection statistics', async () => {
      const stats = await repository.getCollectionStats();
      
      expect(stats.total).toBe(2);
      expect(stats.byStatus.read).toBe(1);
      expect(stats.byStatus['to-read']).toBe(1);
      expect(stats.byGenre.Fiction).toBe(1);
      expect(stats.byGenre.Mystery).toBe(1);
      expect(stats.byYear[2023]).toBe(1);
      expect(stats.byYear[2022]).toBe(1);
    });

    test('should get reading progress', async () => {
      const progress = await repository.getReadingProgress();
      
      expect(progress.totalRead).toBe(1);
      expect(progress.currentlyReading).toBe(0);
      expect(progress.toRead).toBe(1);
      expect(progress.monthlyProgress).toBeDefined();
    });

    test('should get genre distribution', async () => {
      const distribution = await repository.getGenreDistribution();
      
      expect(distribution.Fiction).toBe(1);
      expect(distribution.Mystery).toBe(1);
    });

    test('should get author statistics', async () => {
      const stats = await repository.getAuthorStats();
      
      expect(stats).toHaveLength(2);
      
      const testAuthor = stats.find(author => author.name === 'Test Author');
      expect(testAuthor.bookCount).toBe(1);
      expect(testAuthor.averageRating).toBe(4);
    });
  });

  describe('Data Integrity', () => {
    test('should count books correctly', async () => {
      const totalCount = await repository.count();
      const readCount = await repository.count({ status: 'read' });
      
      expect(totalCount).toBe(2);
      expect(readCount).toBe(1);
    });

    test('should check book existence', async () => {
      const exists = await repository.exists('book1');
      const notExists = await repository.exists('non-existent');
      
      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    test('should validate repository integrity', async () => {
      const validation = await repository.validateIntegrity();
      
      expect(validation.overall).toBe(true);
      expect(validation.dataSource.valid).toBe(true);
      expect(validation.books.valid).toBe(true);
    });

    test('should get repository health', async () => {
      const health = await repository.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.repository.initialized).toBe(true);
      expect(health.itemCount).toBe(2);
    });
  });

  describe('Backup and Restore', () => {
    test('should create backup', async () => {
      const backup = await repository.backupCollection();
      
      expect(backup.data).toHaveLength(2);
      expect(backup.itemCount).toBe(2);
      expect(backup.timestamp).toBeDefined();
      expect(backup.backupPath).toBeDefined();
    });

    test('should restore from backup', async () => {
      const backup = {
        data: [
          {
            id: 'restored1',
            title: 'Restored Book',
            author_name: 'Restored Author',
            status: 'read'
          }
        ]
      };
      
      const result = await repository.restoreCollection(backup);
      expect(result).toBe(true);
      
      const books = await repository.findAll();
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Restored Book');
    });
  });

  describe('Error Handling', () => {
    test('should handle update of non-existent book', async () => {
      await expect(repository.update('non-existent', { title: 'Updated' }))
        .rejects.toThrow();
    });

    test('should handle invalid backup data', async () => {
      await expect(repository.restoreCollection({ invalid: 'data' }))
        .rejects.toThrow();
    });
  });
});