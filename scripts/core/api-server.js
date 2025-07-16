const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');
const yaml = require('yaml');
const logger = require('./logger');
const { firebaseConfig, isFirebaseConfigured, hasFirebaseCredentials } = require('./firebase-config');
const FuzzyClassificationMatcher = require('./fuzzy-classifier');
const { SimpleVectorStore, SimpleEmbedder } = require('./rag-ingest');
const { RecommendationSourcesManager } = require('./recommendation-sources');
const { PreferenceLearningSystem } = require('./preference-learning');
const { ReadingInsightsSystem } = require('./reading-insights');
const { LibraryChecker } = require('./library-checker');
const { EnhancedAvailabilityChecker } = require('./enhanced-availability-checker');
const { ingestRssFeed } = require('./rss-ingest');

// Import modular components
const corsOptions = require('../../src/core/cors-config');
const { requireApiKey } = require('../../src/core/auth-middleware');
const aiAssistantLimiter = require('../../src/core/rate-limiter');
const BookManager = require('../../src/core/book-manager');
const ClassificationHandler = require('../../src/core/classification-handler');
const QueueManager = require('../../src/core/queue-manager');

// Performance optimization - Enhanced caching system
const bookCache = require('../../src/core/book-cache');
const classificationCache = require('../../src/core/classification-cache');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
const helmet = require('helmet');
app.use(helmet());

// Middleware configuration replaced with modular imports
// Auth, CORS, and Rate Limiting now imported from src/core/

// Basic middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Increased limit for knowledge files

// Apply rate limiting to API routes
app.use('/api/', aiAssistantLimiter);

// Add request timing middleware
app.use('/api', (req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Import knowledge management API
const knowledgeRouter = require('./knowledge-api');

// Apply authentication to all API routes
app.use('/api', requireApiKey);

// Claude Pro response optimization middleware
app.use('/api', (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Optimize response for Claude Pro consumption
    if (data && typeof data === 'object') {
      // Add metadata for AI assistant context
      if (!data.metadata) {
        data.metadata = {
          responseTime: Date.now(),
          endpoint: req.path,
          method: req.method,
          aiOptimized: true
        };
      }
      
      // Add success indicator for clear AI interpretation
      if (!data.success && !data.error) {
        data.success = true;
      }
      
      // Add helpful user-facing messages for key endpoints
      if (req.path.includes('/queue/tbr')) {
        data.userMessage = `Found ${data.queue?.length || 0} books in your TBR queue, prioritized by your reading preferences.`;
      } else if (req.path.includes('/recommendations/discover')) {
        data.userMessage = `Found ${data.recommendations?.length || 0} book recommendations based on your preferences.`;
      } else if (req.path.includes('/classify')) {
        data.userMessage = data.book ? `Successfully classified "${data.book.title}" by ${data.book.author}` : 'Book classification completed';
      } else if (req.path.includes('/books/search')) {
        data.userMessage = `Found ${data.books?.length || 0} books matching your search.`;
      } else if (req.path.includes('/rss/ingest')) {
        data.userMessage = data.userMessage || `RSS feed processed: ${data.newBooks} new books, ${data.updatedBooks} updated books. ${data.newlyReadBooks?.length || 0} newly completed books ready for preference learning.`;
      } else if (req.path.includes('/preferences/learn')) {
        data.userMessage = data.userMessage || `Preference learning recorded successfully. Your recommendations have been updated based on your feedback.`;
      } else if (req.path.includes('/preferences/prompts')) {
        data.userMessage = data.userMessage || `Generated ${data.prompts?.length || 0} conversation prompts for preference learning.`;
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
});

// Register knowledge management endpoints
app.use('/api', knowledgeRouter);

// Initialize performance caches
(async () => {
  try {
    logger.info('Initializing performance caches...');
    await bookCache.initializeIndexes();
    logger.info('Book cache initialized with indexes');
    
    // Pre-warm classification cache with common queries
    await classificationCache.getData();
    logger.info('Classification cache initialized');
    
    // Cache TBR queue for immediate availability
    const tbrBooks = bookCache.getByStatus('TBR');
    logger.info(`TBR queue cached: ${tbrBooks.length} books`);
    
    logger.info('Performance optimization active');
  } catch (error) {
    console.error('Cache initialization failed:', error);
  }
})();

// Firebase configuration - disabled by default to prevent socket hangs
let db = null;
let firebaseEnabled = false;

// Only initialize Firebase if explicitly requested via environment variable
if (process.env.ENABLE_FIREBASE === 'true') {
  try {
    if (isFirebaseConfigured() && hasFirebaseCredentials()) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: firebaseConfig.databaseURL
      });
      
      db = admin.database();
      firebaseEnabled = true;
      logger.info('Firebase initialized successfully', { status: 'connected' });
    } else {
      logger.warn('Firebase credentials not properly configured', { 
        hasConfig: isFirebaseConfigured(),
        hasCredentials: hasFirebaseCredentials()
      });
    }
  } catch (error) {
    logger.error('Firebase initialization failed', { error: error.message });
    firebaseEnabled = false;
  }
} else {
  logger.info('Running in local-only mode (Firebase disabled)', { 
    mode: 'local-only',
    tip: 'Set ENABLE_FIREBASE=true to enable Firebase sync'
  });
}

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const CLASSIFICATIONS_FILE = path.join(__dirname, '../data/classifications.yaml');
const VECTORSTORE_DIR = path.join(__dirname, '../vectorstore');
const HISTORY_DIR = path.join(__dirname, '../history');
const REFLECTIONS_DIR = path.join(__dirname, '../reflections');
const REFLECTION_TEMPLATE = path.join(__dirname, '../reflections/template.md');
const REPORTS_DIR = path.join(__dirname, '../reports');

// Initialize fuzzy matcher
const fuzzyMatcher = new FuzzyClassificationMatcher();
let fuzzyMatcherReady = false;

// Initialize modular handlers
const bookManager = new BookManager(BOOKS_FILE, HISTORY_DIR);
const classificationHandler = new ClassificationHandler(fuzzyMatcher, BOOKS_FILE, HISTORY_DIR);
let queueManager = null; // Will initialize after preference systems are ready

// Initialize RAG system
let vectorStore = null;
let embedder = null;
let ragReady = false;

// Initialize recommendation sources manager
const recommendationSources = new RecommendationSourcesManager();
let sourcesReady = false;

// Initialize preference learning system
const preferenceLearner = new PreferenceLearningSystem();
let preferencesReady = false;

// Initialize reading insights system
const readingInsights = new ReadingInsightsSystem();
let insightsReady = false;

// Initialize fuzzy matcher on startup
fuzzyMatcher.initialize(CLASSIFICATIONS_FILE)
  .then(() => {
    fuzzyMatcherReady = true;
    logger.info('Fuzzy classification matcher ready', { 
      genres: fuzzyMatcher.genres?.length || 0,
      subgenres: fuzzyMatcher.subgenres?.length || 0,
      tropes: fuzzyMatcher.tropes?.length || 0
    });
  })
  .catch(error => {
    logger.error('Failed to initialize fuzzy matcher', { error: error.message });
  });

// Initialize RAG system on startup
async function initializeRAG() {
  try {
    vectorStore = new SimpleVectorStore();
    embedder = new SimpleEmbedder();
    
    // Load existing vector store
    const indexPath = path.join(VECTORSTORE_DIR, 'index.json');
    const vocabPath = path.join(VECTORSTORE_DIR, 'vocabulary.json');
    
    const indexLoaded = await vectorStore.load(indexPath);
    
    if (indexLoaded) {
      // Load embedder vocabulary
      const vocabData = JSON.parse(await fs.readFile(vocabPath, 'utf-8'));
      embedder.vocabulary = new Map(vocabData.vocabulary);
      embedder.idf = new Map(vocabData.idf);
      
      ragReady = true;
      logger.info('RAG system ready for recommendations', { status: 'ready' });
    } else {
      logger.warn('No existing vector store found', { recommendation: 'run RAG ingestion first' });
    }
  } catch (error) {
    logger.error('Failed to initialize RAG system', { error: error.message });
    ragReady = false;
  }
}

initializeRAG();

// Initialize recommendation sources on startup
async function initializeSources() {
  try {
    await recommendationSources.loadSources();
    sourcesReady = true;
    const info = await recommendationSources.getSourcesInfo();
    logger.info('Recommendation sources ready', { totalSources: info.totalSources });
  } catch (error) {
    logger.error('Failed to initialize recommendation sources', { error: error.message });
    sourcesReady = false;
  }
}

initializeSources();

// Initialize preference learning system on startup
async function initializePreferences() {
  try {
    await preferenceLearner.loadData();
    preferencesReady = true;
    logger.info('Preference learning system ready', { status: 'ready' });
    
    // Initialize queue manager now that preferences are ready
    if (insightsReady && !queueManager) {
      queueManager = new QueueManager(BOOKS_FILE, preferenceLearner, readingInsights);
      logger.info('Queue manager initialized with preference systems');
    }
  } catch (error) {
    logger.error('Failed to initialize preference learning', { error: error.message });
    preferencesReady = false;
  }
}

initializePreferences();

// Initialize reading insights system on startup
async function initializeInsights() {
  try {
    await readingInsights.loadData();
    insightsReady = true;
    logger.info('Reading insights system ready', { status: 'ready' });
    
    // Initialize queue manager now that insights are ready
    if (preferencesReady && !queueManager) {
      queueManager = new QueueManager(BOOKS_FILE, preferenceLearner, readingInsights);
      logger.info('Queue manager initialized with preference systems');
    }
  } catch (error) {
    logger.error('Failed to initialize reading insights', { error: error.message });
    insightsReady = false;
  }
}

initializeInsights();

// File caching system for performance optimization
class FileDataCache {
  constructor(filePath, parser = JSON.parse) {
    this.filePath = filePath;
    this.parser = parser;
    this.cache = null;
    this.lastModified = null;
  }
  
  async getData() {
    try {
      const stats = await fs.stat(this.filePath);
      
      // Check if cache is stale or doesn't exist
      if (!this.cache || !this.lastModified || stats.mtime > this.lastModified) {
        logger.cache(`Loading file into cache`, { filePath: this.filePath });
        const data = await fs.readFile(this.filePath, 'utf-8');
        this.cache = this.parser(data);
        this.lastModified = stats.mtime;
      }
      
      return this.cache;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Return appropriate empty structure based on file type
        if (this.filePath.includes('books.json')) {
          return [];
        } else if (this.filePath.includes('classifications.yaml')) {
          return { Genres: [], Spice_Levels: [], Tropes: [] };
        }
        return null;
      }
      throw error;
    }
  }
  
  // Force cache refresh (useful for testing or after writes)
  async refresh() {
    this.cache = null;
    this.lastModified = null;
    return await this.getData();
  }
}

// Initialize file caches
const classificationsCache = new FileDataCache(CLASSIFICATIONS_FILE, yaml.parse);

// Helper functions - now use caching
async function readBooksFile() {
  return await bookCache.getData();
}

async function readClassificationsFile() {
  return await classificationsCache.getData();
}

// Enhanced validation with fuzzy matching
function validateBookFields(bookData, classifications, options = {}) {
  const errors = [];
  const warnings = [];
  const matched = {};
  
  // Validate status (keep strict validation)
  const validStatuses = ['TBR', 'Reading', 'Read', 'Finished', 'DNF', 'Archived'];
  if (bookData.status && !validStatuses.includes(bookData.status)) {
    errors.push(`Invalid status: ${bookData.status}. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  // Use fuzzy matcher if available, otherwise fall back to strict validation
  if (fuzzyMatcherReady) {
    const validation = fuzzyMatcher.validateBookData(bookData, {
      genreThreshold: options.genreThreshold || 0.7,
      subgenreThreshold: options.subgenreThreshold || 0.6,
      tropeThreshold: options.tropeThreshold || 0.6,
      allowSuggestions: true
    });
    
    if (!validation.isValid) {
      errors.push(...validation.errors);
    }
    warnings.push(...validation.warnings);
    Object.assign(matched, validation.matched);
    
    // Add suggestions to help AI agents
    if (Object.keys(validation.suggestions).length > 0) {
      matched._suggestions = validation.suggestions;
    }
  } else {
    // Fallback to strict validation
    logger.warn('Fuzzy matcher not ready, using strict validation', { fallback: 'strict_validation' });
    
    // Validate genre (strict)
    if (bookData.genre && classifications.Genres) {
      const validGenres = classifications.Genres.map(g => g.Genre);
      if (!validGenres.includes(bookData.genre)) {
        errors.push(`Invalid genre: ${bookData.genre}. Must be one of the genres in classifications.yaml`);
      }
    }
    
    // Validate subgenre (strict)
    if (bookData.subgenre && classifications.Genres) {
      const validSubgenres = classifications.Genres.flatMap(g => g.Subgenre || []);
      if (!validSubgenres.includes(bookData.subgenre)) {
        errors.push(`Invalid subgenre: ${bookData.subgenre}. Must be one of the subgenres in classifications.yaml`);
      }
    }
    
    // Validate tropes (strict)
    if (bookData.tropes && Array.isArray(bookData.tropes) && classifications.Tropes) {
      const validTropes = [];
      classifications.Tropes.forEach(genreGroup => {
        if (genreGroup.Tropes && Array.isArray(genreGroup.Tropes)) {
          genreGroup.Tropes.forEach(trope => {
            validTropes.push(trope.toLowerCase());
          });
        }
      });
      
      const invalidTropes = bookData.tropes.filter(trope => {
        const lowerTrope = trope.toLowerCase();
        return !validTropes.includes(lowerTrope);
      });
      
      if (invalidTropes.length > 0) {
        errors.push(`Invalid tropes: ${invalidTropes.join(', ')}. Must be from classifications.yaml`);
      }
    }
  }
  
  // Validate spice level (enhanced with fuzzy matching)
  if (bookData.spice !== undefined && bookData.spice !== null) {
    if (fuzzyMatcherReady) {
      const spiceMatch = fuzzyMatcher.matchSpiceLevel(bookData.spice);
      if (spiceMatch) {
        matched.spice = spiceMatch.value;
        if (spiceMatch.confidence < 0.8) {
          warnings.push(`Spice level "${bookData.spice}" matched with ${(spiceMatch.confidence * 100).toFixed(0)}% confidence`);
        }
      } else {
        errors.push(`Could not interpret spice level: "${bookData.spice}". Use 1-5 or descriptive terms.`);
      }
    } else {
      // Strict validation for spice
      const spiceLevel = parseInt(bookData.spice);
      if (isNaN(spiceLevel) || spiceLevel < 1 || spiceLevel > 5) {
        errors.push('Invalid spice level. Must be an integer between 1 and 5');
      }
    }
  }
  
  // Validate queue_position
  if (bookData.queue_position !== undefined && bookData.queue_position !== null) {
    const queuePos = parseInt(bookData.queue_position);
    if (isNaN(queuePos) || queuePos < 1) {
      errors.push('Invalid queue_position. Must be a positive integer');
    }
  }
  
  return { 
    errors, 
    warnings, 
    matched,
    fuzzyMatchingEnabled: fuzzyMatcherReady 
  };
}

async function writeBooksFile(books) {
  await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
  
  // Invalidate cache after write
  await bookCache.refresh();
  
  // Create history snapshot
  const timestamp = new Date().toISOString();
  const historyFile = path.join(HISTORY_DIR, `books_${timestamp}.jsonl`);
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(historyFile, JSON.stringify(books));
}

async function syncToFirebase(books) {
  // Skip Firebase sync if not enabled
  if (!firebaseEnabled || !db) {
    return { 
      success: true, 
      mode: 'local-only', 
      message: 'Data saved locally (Firebase sync disabled)',
      count: books.length 
    };
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
    logger.info('Firebase sync successful', { operation: 'sync_books_to_firebase' });
    return { 
      success: true, 
      mode: 'firebase-sync', 
      message: 'Data saved locally and synced to Firebase',
      count: Object.keys(syncData).length 
    };
  } catch (error) {
    logger.error('Firebase sync failed', { error: error.message, operation: 'sync_books_to_firebase' });
    
    // Log specific error types for debugging
    if (error.code === 'PERMISSION_DENIED') {
    logger.error('Firebase authentication issue', { 
      hint: 'Check Firebase security rules and authentication',
      troubleshooting: 'Verify GOOGLE_APPLICATION_CREDENTIALS is set'
    });
    } else if (error.code === 'NETWORK_ERROR') {
      logger.error('Firebase network error', { 
        hint: 'Check internet connection and Firebase URL',
        firebaseURL: firebaseConfig.databaseURL 
      });
    } else if (error.code === 'UNAUTHENTICATED') {
      logger.error('Firebase authentication failed', { 
        hint: 'Check Firebase credentials and service account key',
        hasCredentials: hasFirebaseCredentials()
      });
    }
    
    return { 
      success: false, 
      mode: 'local-fallback',
      message: 'Data saved locally (Firebase sync failed)',
      error: error.message, 
      code: error.code 
    };
  }
}

// Reflection system functions
async function createReflectionFile(book) {
  try {
    // Create book-specific reflection directory
    const bookReflectionDir = path.join(REFLECTIONS_DIR, book.goodreads_id);
    await fs.mkdir(bookReflectionDir, { recursive: true });
    
    // Generate timestamp for reflection file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reflectionFile = path.join(bookReflectionDir, `${timestamp}.md`);
    
    // Read and process template
    const template = await fs.readFile(REFLECTION_TEMPLATE, 'utf8');
    const processedTemplate = processReflectionTemplate(template, book);
    
    // Write reflection file
    await fs.writeFile(reflectionFile, processedTemplate);
    
    console.log(`✅ Created reflection file: ${reflectionFile}`);
    return {
      success: true,
      file: reflectionFile,
      message: 'Reflection file created successfully'
    };
  } catch (error) {
    console.error('❌ Error creating reflection file:', error.message);
    return {
      success: false,
      error: error.message,
      message: 'Failed to create reflection file'
    };
  }
}

function processReflectionTemplate(template, book) {
  const completionDate = new Date().toISOString().split('T')[0];
  const reflectionDate = new Date().toISOString();
  
  // Basic template substitutions
  let processed = template
    .replace(/\{\{title\}\}/g, book.title || 'Unknown Title')
    .replace(/\{\{author_name\}\}/g, book.author_name || 'Unknown Author')
    .replace(/\{\{series_name\}\}/g, book.series_name || 'N/A')
    .replace(/\{\{series_number\}\}/g, book.series_number || '')
    .replace(/\{\{genre\}\}/g, book.genre || 'Unspecified')
    .replace(/\{\{subgenre\}\}/g, book.subgenre || 'Unspecified')
    .replace(/\{\{completion_date\}\}/g, completionDate)
    .replace(/\{\{spice\}\}/g, book.spice || 'Not rated')
    .replace(/\{\{tropes\}\}/g, book.tropes ? book.tropes.join(', ') : 'None listed')
    .replace(/\{\{book_id\}\}/g, book.goodreads_id)
    .replace(/\{\{reflection_date\}\}/g, reflectionDate);
  
  // Genre-specific conditional sections
  const isRomance = book.genre && book.genre.toLowerCase().includes('romance');
  const isFantasy = book.genre && book.genre.toLowerCase().includes('fantasy');
  const isMystery = book.genre && (book.genre.toLowerCase().includes('mystery') || book.genre.toLowerCase().includes('crime'));
  
  // Process conditional sections
  processed = processConditionalSection(processed, 'if_romance', isRomance);
  processed = processConditionalSection(processed, 'if_fantasy', isFantasy);
  processed = processConditionalSection(processed, 'if_mystery', isMystery);
  
  return processed;
}

function processConditionalSection(template, condition, shouldInclude) {
  const startTag = `{{#${condition}}}`;
  const endTag = `{{/${condition}}}`;
  
  const startIndex = template.indexOf(startTag);
  const endIndex = template.indexOf(endTag);
  
  if (startIndex === -1 || endIndex === -1) {
    return template;
  }
  
  const beforeSection = template.substring(0, startIndex);
  const sectionContent = template.substring(startIndex + startTag.length, endIndex);
  const afterSection = template.substring(endIndex + endTag.length);
  
  if (shouldInclude) {
    return beforeSection + sectionContent + afterSection;
  } else {
    return beforeSection + afterSection;
  }
}

// Weekly Report Generation Functions
async function generateWeeklyReport(weekOffset = 0) {
  try {
    const books = await readBooksFile();
    const { startDate, endDate, weekNumber, year } = getWeekRange(weekOffset);
    
    // Filter books finished this week
    const finishedThisWeek = books.filter(book => {
      if ((book.status !== 'Finished' && book.status !== 'Read') || !book.user_read_at) {return false;}
      const completedDate = new Date(book.user_read_at);
      return completedDate >= startDate && completedDate <= endDate;
    });
    
    // Calculate statistics
    const stats = calculateWeeklyStats(books, finishedThisWeek);
    
    // Get reflection highlights and analytics
    const reflectionHighlights = await getReflectionHighlights(finishedThisWeek);
    const reflectionAnalytics = await getReflectionAnalytics(books);
    
    // Generate comprehensive reading analytics
    const readingAnalytics = await generateReadingAnalytics(books, 'all');
    
    // Generate report content
    const reportContent = generateWeeklyReportContent({
      weekNumber,
      year,
      startDate,
      endDate,
      finishedThisWeek,
      stats,
      reflectionHighlights,
      reflectionAnalytics,
      readingAnalytics
    });
    
    // Save report
    const reportPath = await saveWeeklyReport(weekNumber, year, reportContent);
    
    return {
      success: true,
      reportPath,
      stats,
      finishedBooks: finishedThisWeek.length,
      message: `Weekly report generated for week ${weekNumber}, ${year}`
    };
  } catch (error) {
    console.error('❌ Error generating weekly report:', error.message);
    return {
      success: false,
      error: error.message,
      message: 'Failed to generate weekly report'
    };
  }
}

function getWeekRange(weekOffset = 0) {
  const now = new Date();
  const currentWeek = new Date(now);
  currentWeek.setDate(currentWeek.getDate() - (weekOffset * 7));
  
  // Get start of week (Monday)
  const startOfWeek = new Date(currentWeek);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Get end of week (Sunday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  // Calculate week number
  const weekNumber = getWeekNumber(startOfWeek);
  const year = startOfWeek.getFullYear();
  
  return {
    startDate: startOfWeek,
    endDate: endOfWeek,
    weekNumber,
    year
  };
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function calculateWeeklyStats(allBooks, finishedThisWeek) {
  const stats = {
    totalBooks: allBooks.length,
    finishedThisWeek: finishedThisWeek.length,
    totalPages: 0,
    averageRating: 0,
    topGenres: {},
    topAuthors: {},
    topTropes: {},
    statusBreakdown: {},
    classificationInsights: {}
  };
  
  // Calculate total pages for finished books this week
  finishedThisWeek.forEach(book => {
    if (book.pages) {
      stats.totalPages += parseInt(book.pages) || 0;
    }
  });
  
  // Calculate average spice level for finished books
  const ratedBooks = finishedThisWeek.filter(book => book.spice);
  if (ratedBooks.length > 0) {
    stats.averageRating = (ratedBooks.reduce((sum, book) => sum + book.spice, 0) / ratedBooks.length).toFixed(1);
  }
  
  // Count genres, authors, and tropes
  finishedThisWeek.forEach(book => {
    // Genres
    if (book.genre) {
      stats.topGenres[book.genre] = (stats.topGenres[book.genre] || 0) + 1;
    }
    
    // Authors
    if (book.author_name) {
      stats.topAuthors[book.author_name] = (stats.topAuthors[book.author_name] || 0) + 1;
    }
    
    // Tropes
    if (book.tropes && Array.isArray(book.tropes)) {
      book.tropes.forEach(trope => {
        stats.topTropes[trope] = (stats.topTropes[trope] || 0) + 1;
      });
    }
  });
  
  // Status breakdown for all books
  allBooks.forEach(book => {
    const status = book.status || 'Unknown';
    stats.statusBreakdown[status] = (stats.statusBreakdown[status] || 0) + 1;
  });
  
  // Enhanced fuzzy classification analysis
  if (fuzzyMatcherReady) {
    stats.classificationInsights = analyzeBooksForClassificationOpportunities(allBooks, finishedThisWeek);
  }
  
  return stats;
}

// Analyze books for classification opportunities using fuzzy matching
function analyzeBooksForClassificationOpportunities(allBooks, finishedThisWeek) {
  const insights = {
    totalAnalyzed: allBooks.length,
    missingClassification: {
      total: 0,
      genre: 0,
      subgenre: 0,
      tropes: 0,
      spice: 0
    },
    improvementOpportunities: [],
    weeklyFinishedNeedsWork: [],
    topMissingFields: {},
    classificationCompleteness: 0
  };

  let totalClassifiableFields = 0;
  let completedFields = 0;

  allBooks.forEach(book => {
    const analysis = analyzeBookClassification(book);
    
    // Count total and completed classification fields
    totalClassifiableFields += 4; // genre, subgenre, tropes, spice
    completedFields += analysis.completedFields;
    
    // Track missing classifications
    if (!book.genre) {insights.missingClassification.genre++;}
    if (!book.subgenre) {insights.missingClassification.subgenre++;}
    if (!book.tropes || book.tropes.length === 0) {insights.missingClassification.tropes++;}
    if (!book.spice) {insights.missingClassification.spice++;}
    
    if (analysis.missingFields > 0) {
      insights.missingClassification.total++;
      
      // If this book needs work and was finished this week, highlight it
      if (finishedThisWeek.includes(book)) {
        insights.weeklyFinishedNeedsWork.push({
          title: book.title,
          author: book.author_name,
          missing: analysis.missing,
          suggestions: analysis.suggestions
        });
      }
      
      // Track improvement opportunities for highly incomplete books
      if (analysis.missingFields >= 3) {
        insights.improvementOpportunities.push({
          title: book.title,
          author: book.author_name,
          goodreads_id: book.goodreads_id,
          missing: analysis.missing,
          suggestions: analysis.suggestions,
          priority: analysis.missingFields >= 4 ? 'high' : 'medium'
        });
      }
    }
    
    // Track which fields are missing most often
    analysis.missing.forEach(field => {
      insights.topMissingFields[field] = (insights.topMissingFields[field] || 0) + 1;
    });
  });

  // Calculate overall completeness percentage
  insights.classificationCompleteness = Math.round((completedFields / totalClassifiableFields) * 100);

  // Sort improvement opportunities by priority and limit to top 10
  insights.improvementOpportunities = insights.improvementOpportunities
    .sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') {return -1;}
      if (b.priority === 'high' && a.priority !== 'high') {return 1;}
      return b.missing.length - a.missing.length;
    })
    .slice(0, 10);

  return insights;
}

// Analyze a single book for classification completeness
function analyzeBookClassification(book) {
  const analysis = {
    completedFields: 0,
    missingFields: 0,
    missing: [],
    suggestions: {}
  };

  // Check core classification fields
  if (book.genre) {
    analysis.completedFields++;
  } else {
    analysis.missingFields++;
    analysis.missing.push('genre');
    
    // Try to suggest genre from description/title if fuzzy matcher is available
    if (fuzzyMatcherReady && (book.book_description || book.title)) {
      const genreMatch = fuzzyMatcher.classifyBook({
        title: book.title,
        description: book.book_description,
        author: book.author_name
      });
      if (genreMatch.matched.genre) {
        analysis.suggestions.genre = genreMatch.matched.genre;
      }
    }
  }

  if (book.subgenre) {
    analysis.completedFields++;
  } else {
    analysis.missingFields++;
    analysis.missing.push('subgenre');
  }

  if (book.tropes && book.tropes.length > 0) {
    analysis.completedFields++;
  } else {
    analysis.missingFields++;
    analysis.missing.push('tropes');
  }

  if (book.spice) {
    analysis.completedFields++;
  } else {
    analysis.missingFields++;
    analysis.missing.push('spice');
  }

  return analysis;
}

async function getReflectionHighlights(finishedBooks) {
  const highlights = [];
  
  for (const book of finishedBooks) {
    if (!book.goodreads_id) {continue;}
    
    try {
      const reflectionDir = path.join(REFLECTIONS_DIR, book.goodreads_id);
      const files = await fs.readdir(reflectionDir);
      
      // Get the most recent reflection file
      if (files.length > 0) {
        const latestFile = files.sort().reverse()[0];
        const reflectionPath = path.join(reflectionDir, latestFile);
        const reflectionContent = await fs.readFile(reflectionPath, 'utf8');
        
        // Enhanced reflection analysis
        const analysis = analyzeReflectionContent(reflectionContent, book);
        
        if (analysis.hasContent) {
          highlights.push({
            book: book.title,
            author: book.author_name,
            goodreads_id: book.goodreads_id,
            highlights: analysis.highlights,
            completeness: analysis.completeness,
            sentiment: analysis.sentiment,
            recommendation: analysis.recommendation,
            reflectionPath: reflectionPath
          });
        }
      }
    } catch (error) {
      console.log(`⚠️  Could not read reflection for ${book.title}: ${error.message}`);
    }
  }
  
  return highlights;
}

// Enhanced reflection content analysis with sentiment and completeness scoring
function analyzeReflectionContent(content, book) {
  const analysis = {
    hasContent: false,
    completeness: 0,
    highlights: [],
    sentiment: 'neutral',
    recommendation: null,
    sectionsCompleted: 0,
    totalSections: 0,
    insights: {}
  };

  const lines = content.split('\n');
  const sections = [
    'Overall Experience', 'Story Elements', 'Genre-Specific Questions',
    'Tropes & Themes', 'Personal Impact', 'Recommendations', 
    'Reading Journey', 'Future Reading', 'Final Thoughts'
  ];

  let currentSection = '';
  let sectionContent = [];
  const completedSections = [];
  
  // Sentiment indicators
  const positiveWords = ['love', 'loved', 'amazing', 'fantastic', 'wonderful', 'great', 'excellent', 'enjoyed', 'favorite', 'perfect', 'brilliant', 'captivating', 'engaging', 'compelling'];
  const negativeWords = ['hate', 'hated', 'terrible', 'awful', 'boring', 'disappointing', 'confusing', 'slow', 'frustrating', 'annoying', 'worst', 'dislike'];
  
  let sentimentScore = 0;
  let wordCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Track sections
    if (line.startsWith('## ') && !line.includes('---')) {
      // Process previous section if it had content
      if (currentSection && sectionContent.length > 0) {
        const hasRealContent = sectionContent.some(l => 
          l.length > 20 && 
          !l.startsWith('*') && 
          !l.includes('{{') &&
          !l.includes('Rate your') &&
          !l.includes('explain why') &&
          !l.toLowerCase().includes('how was') &&
          !l.toLowerCase().includes('did you')
        );
        
        if (hasRealContent) {
          completedSections.push(currentSection);
          analysis.highlights.push({
            section: currentSection,
            content: sectionContent.filter(l => l.length > 20).slice(0, 2).join(' ')
          });
        }
      }
      
      currentSection = line.replace('## ', '');
      sectionContent = [];
      analysis.totalSections++;
    }
    
    // Collect content for current section
    if (currentSection && line && !line.startsWith('#') && !line.startsWith('*') && !line.startsWith('**') && !line.includes('{{')) {
      sectionContent.push(line);
      wordCount += line.split(' ').length;
      
      // Simple sentiment analysis
      const lowerLine = line.toLowerCase();
      positiveWords.forEach(word => {
        if (lowerLine.includes(word)) {sentimentScore++;}
      });
      negativeWords.forEach(word => {
        if (lowerLine.includes(word)) {sentimentScore--;}
      });
      
      // Extract recommendation intent
      if (lowerLine.includes('recommend') || lowerLine.includes('suggestion')) {
        if (lowerLine.includes('would recommend') || lowerLine.includes('definitely')) {
          analysis.recommendation = 'positive';
        } else if (lowerLine.includes('would not') || lowerLine.includes("wouldn't")) {
          analysis.recommendation = 'negative';
        }
      }
    }
  }
  
  // Process final section
  if (currentSection && sectionContent.length > 0) {
    const hasRealContent = sectionContent.some(l => 
      l.length > 20 && 
      !l.startsWith('*') && 
      !l.includes('{{')
    );
    
    if (hasRealContent) {
      completedSections.push(currentSection);
      analysis.highlights.push({
        section: currentSection,
        content: sectionContent.filter(l => l.length > 20).slice(0, 2).join(' ')
      });
    }
  }

  // Calculate metrics
  analysis.sectionsCompleted = completedSections.length;
  analysis.completeness = analysis.totalSections > 0 ? 
    Math.round((analysis.sectionsCompleted / analysis.totalSections) * 100) : 0;
  
  analysis.hasContent = analysis.sectionsCompleted > 0 && wordCount > 100;
  
  // Determine sentiment
  if (sentimentScore > 2) {
    analysis.sentiment = 'positive';
  } else if (sentimentScore < -2) {
    analysis.sentiment = 'negative';
  } else {
    analysis.sentiment = 'neutral';
  }

  // Generate insights
  analysis.insights = {
    wordCount: wordCount,
    detailLevel: wordCount > 500 ? 'detailed' : wordCount > 200 ? 'moderate' : 'brief',
    sectionsCompleted: completedSections,
    hasRecommendation: analysis.recommendation !== null,
    engagementLevel: analysis.completeness > 70 ? 'high' : analysis.completeness > 30 ? 'medium' : 'low'
  };

  return analysis;
}

// Get comprehensive reflection analytics for all books
async function getReflectionAnalytics(allBooks) {
  const analytics = {
    totalReflections: 0,
    completedReflections: 0,
    pendingReflections: 0,
    averageCompleteness: 0,
    sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
    recommendationPatterns: { positive: 0, negative: 0, none: 0 },
    engagementLevels: { high: 0, medium: 0, low: 0 },
    topCompleteReflections: [],
    pendingBooks: []
  };

  let totalCompleteness = 0;
  const reflectionAnalyses = [];

  for (const book of allBooks) {
    if (!book.goodreads_id) {continue;}
    
    try {
      const reflectionDir = path.join(REFLECTIONS_DIR, book.goodreads_id);
      const files = await fs.readdir(reflectionDir);
      
      if (files.length > 0) {
        analytics.totalReflections++;
        
        const latestFile = files.sort().reverse()[0];
        const reflectionPath = path.join(reflectionDir, latestFile);
        const reflectionContent = await fs.readFile(reflectionPath, 'utf8');
        
        const analysis = analyzeReflectionContent(reflectionContent, book);
        
        if (analysis.hasContent) {
          analytics.completedReflections++;
          totalCompleteness += analysis.completeness;
          
          analytics.sentimentDistribution[analysis.sentiment]++;
          analytics.recommendationPatterns[analysis.recommendation || 'none']++;
          analytics.engagementLevels[analysis.insights.engagementLevel]++;
          
          reflectionAnalyses.push({
            book: book.title,
            author: book.author_name,
            completeness: analysis.completeness,
            sentiment: analysis.sentiment,
            wordCount: analysis.insights.wordCount
          });
        } else {
          analytics.pendingReflections++;
          analytics.pendingBooks.push({
            title: book.title,
            author: book.author_name,
            goodreads_id: book.goodreads_id
          });
        }
      } else if (book.reflection_pending) {
        analytics.pendingReflections++;
        analytics.pendingBooks.push({
          title: book.title,
          author: book.author_name,
          goodreads_id: book.goodreads_id
        });
      }
    } catch (error) {
      // Directory doesn't exist or other error - count as pending if reflection_pending is true
      if (book.reflection_pending) {
        analytics.pendingReflections++;
        analytics.pendingBooks.push({
          title: book.title,
          author: book.author_name,
          goodreads_id: book.goodreads_id
        });
      }
    }
  }

  // Calculate averages and sort results
  analytics.averageCompleteness = analytics.completedReflections > 0 ? 
    Math.round(totalCompleteness / analytics.completedReflections) : 0;
  
  analytics.topCompleteReflections = reflectionAnalyses
    .sort((a, b) => b.completeness - a.completeness)
    .slice(0, 5);

  return analytics;
}

// Comprehensive reading analytics and trend detection
async function generateReadingAnalytics(allBooks, timeframe = 'all') {
  const analytics = {
    overview: {},
    readingVelocity: {},
    genreTrends: {},
    authorTrends: {},
    temporalPatterns: {},
    queueAnalytics: {},
    ratingTrends: {},
    timeBasedInsights: {}
  };

  // Filter books by timeframe
  const filteredBooks = filterBooksByTimeframe(allBooks, timeframe);
  const finishedBooks = filteredBooks.filter(book => 
    (book.status === 'Read' || book.status === 'Finished') && book.user_read_at
  );

  // Overview Analytics
  analytics.overview = {
    totalBooks: allBooks.length,
    booksInTimeframe: filteredBooks.length,
    finishedBooks: finishedBooks.length,
    currentlyReading: allBooks.filter(b => b.status === 'Reading').length,
    tbrQueue: allBooks.filter(b => b.status === 'TBR').length,
    completionRate: filteredBooks.length > 0 ? 
      Math.round((finishedBooks.length / filteredBooks.length) * 100) : 0
  };

  // Reading Velocity Analytics
  analytics.readingVelocity = calculateReadingVelocity(finishedBooks);

  // Genre Trends
  analytics.genreTrends = analyzeGenreTrends(finishedBooks, timeframe);

  // Author Trends
  analytics.authorTrends = analyzeAuthorTrends(finishedBooks, timeframe);

  // Temporal Patterns
  analytics.temporalPatterns = analyzeTemporalPatterns(finishedBooks);

  // TBR Queue Analytics
  analytics.queueAnalytics = analyzeTbrQueue(allBooks);

  // Rating Trends
  analytics.ratingTrends = analyzeRatingTrends(finishedBooks);

  // Time-based insights
  analytics.timeBasedInsights = generateTimeBasedInsights(finishedBooks);

  return analytics;
}

function filterBooksByTimeframe(books, timeframe) {
  const now = new Date();
  let cutoffDate;

  switch (timeframe) {
    case 'week':
      cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      break;
    case 'month':
      cutoffDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      break;
    case 'quarter':
      cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
      break;
    case 'year':
      cutoffDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
      break;
    default:
      return books; // 'all' timeframe
  }

  return books.filter(book => {
    const bookDate = book.user_read_at ? new Date(book.user_read_at) : 
                     book.user_date_added ? new Date(book.user_date_added) : null;
    return bookDate && bookDate >= cutoffDate;
  });
}

function calculateReadingVelocity(finishedBooks) {
  if (finishedBooks.length === 0) {
    return { booksPerMonth: 0, averageDaysBetweenBooks: 0, readingStreak: 0 };
  }

  // Sort by completion date
  const sortedBooks = finishedBooks
    .sort((a, b) => new Date(a.user_read_at) - new Date(b.user_read_at));

  // Calculate books per month
  const firstBook = new Date(sortedBooks[0].user_read_at);
  const lastBook = new Date(sortedBooks[sortedBooks.length - 1].user_read_at);
  const monthsDiff = Math.max(1, (lastBook - firstBook) / (1000 * 60 * 60 * 24 * 30));
  const booksPerMonth = Math.round((finishedBooks.length / monthsDiff) * 10) / 10;

  // Calculate average days between books
  let totalDaysBetween = 0;
  for (let i = 1; i < sortedBooks.length; i++) {
    const prevDate = new Date(sortedBooks[i - 1].user_read_at);
    const currDate = new Date(sortedBooks[i].user_read_at);
    totalDaysBetween += (currDate - prevDate) / (1000 * 60 * 60 * 24);
  }
  const averageDaysBetweenBooks = sortedBooks.length > 1 ? 
    Math.round(totalDaysBetween / (sortedBooks.length - 1)) : 0;

  // Calculate current reading streak
  const readingStreak = calculateReadingStreak(sortedBooks);

  return {
    booksPerMonth,
    averageDaysBetweenBooks,
    readingStreak,
    totalFinished: finishedBooks.length,
    readingPeriod: `${Math.round(monthsDiff)} months`
  };
}

function calculateReadingStreak(sortedBooks) {
  if (sortedBooks.length === 0) {return 0;}

  const now = new Date();
  let streak = 0;
  let currentDate = new Date(now);

  // Start from most recent book and work backwards
  for (let i = sortedBooks.length - 1; i >= 0; i--) {
    const bookDate = new Date(sortedBooks[i].user_read_at);
    const daysDiff = (currentDate - bookDate) / (1000 * 60 * 60 * 24);

    // If book was read within the last 14 days, continue streak
    if (daysDiff <= 14) {
      streak++;
      currentDate = bookDate;
    } else {
      break;
    }
  }

  return streak;
}

function analyzeGenreTrends(finishedBooks, timeframe) {
  const genreCount = {};
  const monthlyGenres = {};

  finishedBooks.forEach(book => {
    if (book.genre) {
      genreCount[book.genre] = (genreCount[book.genre] || 0) + 1;

      // Track monthly trends
      const month = new Date(book.user_read_at).toISOString().slice(0, 7);
      if (!monthlyGenres[month]) {monthlyGenres[month] = {};}
      monthlyGenres[month][book.genre] = (monthlyGenres[month][book.genre] || 0) + 1;
    }
  });

  // Find trending genres (increasing in recent months)
  const recentMonths = Object.keys(monthlyGenres).sort().slice(-3);
  const trendingGenres = [];

  Object.keys(genreCount).forEach(genre => {
    const recentCounts = recentMonths.map(month => monthlyGenres[month]?.[genre] || 0);
    const isIncreasing = recentCounts.length > 1 && 
      recentCounts[recentCounts.length - 1] > recentCounts[0];
    
    if (isIncreasing) {
      trendingGenres.push({
        genre,
        trend: 'increasing',
        recentCount: recentCounts[recentCounts.length - 1]
      });
    }
  });

  return {
    topGenres: Object.entries(genreCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count })),
    trendingGenres: trendingGenres.slice(0, 3),
    monthlyBreakdown: monthlyGenres,
    diversity: Object.keys(genreCount).length
  };
}

function analyzeAuthorTrends(finishedBooks, timeframe) {
  const authorCount = {};
  const rereadAuthors = {};

  finishedBooks.forEach(book => {
    if (book.author_name) {
      authorCount[book.author_name] = (authorCount[book.author_name] || 0) + 1;
      
      if (authorCount[book.author_name] > 1) {
        rereadAuthors[book.author_name] = authorCount[book.author_name];
      }
    }
  });

  return {
    topAuthors: Object.entries(authorCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([author, count]) => ({ author, count })),
    rereadAuthors: Object.entries(rereadAuthors)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([author, count]) => ({ author, count })),
    authorDiversity: Object.keys(authorCount).length
  };
}

function analyzeTemporalPatterns(finishedBooks) {
  const dayOfWeek = {};
  const monthOfYear = {};
  const hourOfDay = {};

  finishedBooks.forEach(book => {
    const date = new Date(book.user_read_at);
    
    // Day of week pattern
    const day = date.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[day];
    dayOfWeek[dayName] = (dayOfWeek[dayName] || 0) + 1;

    // Month pattern
    const month = date.getMonth();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[month];
    monthOfYear[monthName] = (monthOfYear[monthName] || 0) + 1;

    // Hour pattern (if time info available)
    const hour = date.getHours();
    hourOfDay[hour] = (hourOfDay[hour] || 0) + 1;
  });

  return {
    favoriteDay: Object.entries(dayOfWeek)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'No data',
    favoriteMonth: Object.entries(monthOfYear)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'No data',
    peakHour: Object.entries(hourOfDay)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'No data',
    patterns: {
      dayOfWeek,
      monthOfYear,
      hourOfDay
    }
  };
}

function analyzeTbrQueue(allBooks) {
  const tbrBooks = allBooks.filter(book => book.status === 'TBR');
  const queueAges = tbrBooks.map(book => {
    const addedDate = new Date(book.user_date_added);
    const now = new Date();
    return Math.floor((now - addedDate) / (1000 * 60 * 60 * 24));
  });

  const avgQueueAge = queueAges.length > 0 ? 
    Math.round(queueAges.reduce((sum, age) => sum + age, 0) / queueAges.length) : 0;

  const staleBooksThreshold = 180; // 6 months
  const staleBooks = tbrBooks.filter(book => {
    const addedDate = new Date(book.user_date_added);
    const daysSinceAdded = (new Date() - addedDate) / (1000 * 60 * 60 * 24);
    return daysSinceAdded > staleBooksThreshold;
  });

  return {
    queueSize: tbrBooks.length,
    averageAge: avgQueueAge,
    staleBooks: staleBooks.length,
    staleBooksThreshold,
    queueGrowthRate: calculateQueueGrowthRate(allBooks)
  };
}

function calculateQueueGrowthRate(allBooks) {
  const oneMonthAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
  const recentAdditions = allBooks.filter(book => 
    book.status === 'TBR' && 
    book.user_date_added && 
    new Date(book.user_date_added) >= oneMonthAgo
  );
  return recentAdditions.length;
}

function analyzeRatingTrends(finishedBooks) {
  const ratedBooks = finishedBooks.filter(book => book.user_rating);
  
  if (ratedBooks.length === 0) {
    return { averageRating: 0, ratingDistribution: {}, trend: 'No ratings available' };
  }

  const ratings = ratedBooks.map(book => book.user_rating);
  const averageRating = Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10;

  const ratingDistribution = {};
  ratings.forEach(rating => {
    ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
  });

  // Analyze trend over time
  const recentBooks = ratedBooks.slice(-10); // Last 10 rated books
  const earlierBooks = ratedBooks.slice(0, Math.min(10, ratedBooks.length - 10));
  
  const recentAvg = recentBooks.length > 0 ? 
    recentBooks.reduce((sum, book) => sum + book.user_rating, 0) / recentBooks.length : 0;
  const earlierAvg = earlierBooks.length > 0 ? 
    earlierBooks.reduce((sum, book) => sum + book.user_rating, 0) / earlierBooks.length : 0;

  let trend = 'stable';
  if (recentAvg > earlierAvg + 0.3) {trend = 'increasing';}
  if (recentAvg < earlierAvg - 0.3) {trend = 'decreasing';}

  return {
    averageRating,
    ratingDistribution,
    trend,
    totalRatedBooks: ratedBooks.length,
    ratingPercentage: Math.round((ratedBooks.length / finishedBooks.length) * 100)
  };
}

function generateTimeBasedInsights(finishedBooks) {
  const insights = [];
  const now = new Date();
  
  // Recent reading acceleration
  const last30Days = finishedBooks.filter(book => {
    const bookDate = new Date(book.user_read_at);
    return (now - bookDate) <= (30 * 24 * 60 * 60 * 1000);
  });
  
  if (last30Days.length >= 3) {
    insights.push({
      type: 'reading_acceleration',
      message: `Reading momentum is strong - ${last30Days.length} books finished in the last 30 days!`,
      level: 'positive'
    });
  }

  // Genre diversification
  const recentGenres = new Set(last30Days.map(book => book.genre).filter(Boolean));
  if (recentGenres.size >= 3) {
    insights.push({
      type: 'genre_diversity',
      message: `Great genre diversity lately - exploring ${recentGenres.size} different genres`,
      level: 'positive'
    });
  }

  // Reading drought detection
  if (finishedBooks.length > 0) {
    const lastBookDate = new Date(finishedBooks[finishedBooks.length - 1].user_read_at);
    const daysSinceLastBook = (now - lastBookDate) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLastBook > 14) {
      insights.push({
        type: 'reading_drought',
        message: `It's been ${Math.floor(daysSinceLastBook)} days since your last finished book`,
        level: 'caution'
      });
    }
  }

  return insights;
}

function extractReflectionHighlights(content, book) {
  const highlights = [];
  const lines = content.split('\n');
  
  // Look for sections with content (not just template questions)
  let currentSection = '';
  let hasContent = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and template instructions
    if (!line || line.startsWith('*') || line.startsWith('##') || line.startsWith('###')) {
      if (hasContent && currentSection) {
        // End of a section with content
        currentSection = '';
        hasContent = false;
      }
      
      // Check if this is a section header we care about
      if (line.startsWith('### ') && !line.includes('*')) {
        currentSection = line.replace('### ', '');
      }
      continue;
    }
    
    // If we have a section and this line has actual content
    if (currentSection && line.length > 20 && !line.includes('{{')) {
      hasContent = true;
      highlights.push({
        section: currentSection,
        content: line
      });
    }
  }
  
  return highlights.slice(0, 3); // Limit to top 3 highlights per book
}

function generateWeeklyReportContent({ weekNumber, year, startDate, endDate, finishedThisWeek, stats, reflectionHighlights, reflectionAnalytics, readingAnalytics }) {
  const formatDate = (date) => date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  
  let content = `# Weekly Reading Report - Week ${weekNumber}, ${year}\n\n`;
  content += `**Generated**: ${new Date().toISOString()}\n`;
  content += `**Period**: ${formatDate(startDate)} - ${formatDate(endDate)}\n\n`;
  
  // Statistics
  content += `## 📊 Statistics\n\n`;
  content += `- **Books Finished This Week**: ${stats.finishedThisWeek}\n`;
  content += `- **Total Pages Read**: ${stats.totalPages.toLocaleString()}\n`;
  content += `- **Average Spice Level**: ${stats.averageRating || 'N/A'}\n`;
  content += `- **Total Books in Library**: ${stats.totalBooks}\n\n`;
  
  // Status breakdown
  content += `### 📚 Library Status\n\n`;
  Object.entries(stats.statusBreakdown)
    .sort(([,a], [,b]) => b - a)
    .forEach(([status, count]) => {
      content += `- **${status}**: ${count} books\n`;
    });
  content += '\n';
  
  // Books finished this week
  if (finishedThisWeek.length > 0) {
    content += `## 📖 Books Finished This Week\n\n`;
    finishedThisWeek.forEach(book => {
      content += `### ${book.title}\n`;
      content += `**Author**: ${book.author_name || 'Unknown'}\n`;
      if (book.series_name) {
        content += `**Series**: ${book.series_name}${book.series_number ? ` #${book.series_number}` : ''}\n`;
      }
      content += `**Genre**: ${book.genre || 'Unspecified'}${book.subgenre ? ` → ${book.subgenre}` : ''}\n`;
      if (book.spice) {
        content += `**Spice Level**: ${book.spice}/5\n`;
      }
      if (book.pages) {
        content += `**Pages**: ${book.pages}\n`;
      }
      if (book.tropes && book.tropes.length > 0) {
        content += `**Tropes**: ${book.tropes.join(', ')}\n`;
      }
      content += `**Completed**: ${new Date(book.user_read_at).toLocaleDateString()}\n\n`;
    });
  }
  
  // Top genres
  if (Object.keys(stats.topGenres).length > 0) {
    content += `## 🎭 Top Genres This Week\n\n`;
    Object.entries(stats.topGenres)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([genre, count]) => {
        content += `- **${genre}**: ${count} book${count > 1 ? 's' : ''}\n`;
      });
    content += '\n';
  }
  
  // Top authors
  if (Object.keys(stats.topAuthors).length > 0) {
    content += `## ✍️ Top Authors This Week\n\n`;
    Object.entries(stats.topAuthors)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([author, count]) => {
        content += `- **${author}**: ${count} book${count > 1 ? 's' : ''}\n`;
      });
    content += '\n';
  }
  
  // Top tropes
  if (Object.keys(stats.topTropes).length > 0) {
    content += `## 🏷️ Popular Tropes This Week\n\n`;
    Object.entries(stats.topTropes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .forEach(([trope, count]) => {
        content += `- **${trope}**: ${count} book${count > 1 ? 's' : ''}\n`;
      });
    content += '\n';
  }
  
  // Classification insights (new feature)
  if (stats.classificationInsights && Object.keys(stats.classificationInsights).length > 0) {
    const insights = stats.classificationInsights;
    content += `## 🏷️ Classification Insights\n\n`;
    
    // Overall completeness
    content += `### 📊 Classification Completeness: ${insights.classificationCompleteness}%\n\n`;
    content += `- **Books Analyzed**: ${insights.totalAnalyzed}\n`;
    content += `- **Books Missing Classifications**: ${insights.missingClassification.total}\n\n`;
    
    // Missing field breakdown
    if (Object.keys(insights.topMissingFields).length > 0) {
      content += `### 📋 Most Common Missing Classifications\n\n`;
      Object.entries(insights.topMissingFields)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 4)
        .forEach(([field, count]) => {
          content += `- **${field.charAt(0).toUpperCase() + field.slice(1)}**: ${count} books\n`;
        });
      content += '\n';
    }
    
    // Books finished this week that need classification work
    if (insights.weeklyFinishedNeedsWork.length > 0) {
      content += `### 📚 Recently Finished Books Needing Classification\n\n`;
      insights.weeklyFinishedNeedsWork.forEach(book => {
        content += `**${book.title}** by ${book.author}\n`;
        content += `Missing: ${book.missing.join(', ')}\n`;
        if (Object.keys(book.suggestions).length > 0) {
          content += `Suggestions: ${Object.entries(book.suggestions).map(([field, value]) => `${field}: ${value}`).join(', ')}\n`;
        }
        content += '\n';
      });
    }
    
    // Top improvement opportunities
    if (insights.improvementOpportunities.length > 0) {
      content += `### 🎯 Priority Classification Opportunities\n\n`;
      insights.improvementOpportunities.slice(0, 5).forEach(book => {
        content += `- **${book.title}** by ${book.author} (${book.priority} priority)\n`;
        content += `  Missing: ${book.missing.join(', ')}\n`;
      });
      content += '\n';
    }
  }
  
  // Enhanced reflection analysis
  if (reflectionAnalytics && Object.keys(reflectionAnalytics).length > 0) {
    content += `## 📝 Reflection Analytics\n\n`;
    
    // Overall reflection stats
    content += `### 📊 Reflection Status Overview\n\n`;
    content += `- **Total Reflection Files**: ${reflectionAnalytics.totalReflections}\n`;
    content += `- **Completed Reflections**: ${reflectionAnalytics.completedReflections}\n`;
    content += `- **Pending Reflections**: ${reflectionAnalytics.pendingReflections}\n`;
    content += `- **Average Completeness**: ${reflectionAnalytics.averageCompleteness}%\n\n`;
    
    // Sentiment analysis
    if (reflectionAnalytics.completedReflections > 0) {
      content += `### 😊 Reading Sentiment Distribution\n\n`;
      content += `- **Positive**: ${reflectionAnalytics.sentimentDistribution.positive} books\n`;
      content += `- **Neutral**: ${reflectionAnalytics.sentimentDistribution.neutral} books\n`;
      content += `- **Negative**: ${reflectionAnalytics.sentimentDistribution.negative} books\n\n`;
      
      // Recommendation patterns
      content += `### 👍 Recommendation Patterns\n\n`;
      content += `- **Would Recommend**: ${reflectionAnalytics.recommendationPatterns.positive} books\n`;
      content += `- **Would Not Recommend**: ${reflectionAnalytics.recommendationPatterns.negative} books\n`;
      content += `- **No Clear Recommendation**: ${reflectionAnalytics.recommendationPatterns.none} books\n\n`;
      
      // Engagement levels
      content += `### 📈 Reflection Engagement\n\n`;
      content += `- **High Engagement**: ${reflectionAnalytics.engagementLevels.high} detailed reflections\n`;
      content += `- **Medium Engagement**: ${reflectionAnalytics.engagementLevels.medium} moderate reflections\n`;
      content += `- **Low Engagement**: ${reflectionAnalytics.engagementLevels.low} brief reflections\n\n`;
    }
    
    // Pending reflections that need attention
    if (reflectionAnalytics.pendingBooks.length > 0) {
      content += `### ⏳ Books Needing Reflections\n\n`;
      reflectionAnalytics.pendingBooks.slice(0, 5).forEach(book => {
        content += `- **${book.title}** by ${book.author}\n`;
      });
      if (reflectionAnalytics.pendingBooks.length > 5) {
        content += `- ...and ${reflectionAnalytics.pendingBooks.length - 5} more books\n`;
      }
      content += '\n';
    }
    
    // Top complete reflections
    if (reflectionAnalytics.topCompleteReflections.length > 0) {
      content += `### 🌟 Most Complete Reflections\n\n`;
      reflectionAnalytics.topCompleteReflections.slice(0, 3).forEach((reflection, index) => {
        content += `${index + 1}. **${reflection.book}** by ${reflection.author} (${reflection.completeness}% complete, ${reflection.wordCount} words)\n`;
      });
      content += '\n';
    }
  }
  
  // Enhanced reflection highlights
  if (reflectionHighlights.length > 0) {
    content += `## 💭 This Week's Reflection Highlights\n\n`;
    reflectionHighlights.forEach(({ book, author, highlights, completeness, sentiment, recommendation }) => {
      content += `### ${book} by ${author}\n`;
      if (completeness) {
        content += `**Reflection Status**: ${completeness}% complete, ${sentiment} sentiment`;
        if (recommendation) {
          content += `, ${recommendation} recommendation`;
        }
        content += '\n\n';
      }
      if (highlights && highlights.length > 0) {
        highlights.forEach(highlight => {
          content += `**${highlight.section}**: ${highlight.content}\n\n`;
        });
      } else {
        content += `*Reflection file exists but needs completion*\n\n`;
      }
    });
  }
  
  // Advanced Reading Analytics & Trends
  if (readingAnalytics && Object.keys(readingAnalytics).length > 0) {
    content += `## 📈 Reading Analytics & Trends\n\n`;
    
    // Reading Velocity
    if (readingAnalytics.readingVelocity) {
      const velocity = readingAnalytics.readingVelocity;
      content += `### 🚀 Reading Velocity\n\n`;
      content += `- **Reading Pace**: ${velocity.booksPerMonth} books/month over ${velocity.readingPeriod}\n`;
      content += `- **Average Gap**: ${velocity.averageDaysBetweenBooks} days between books\n`;
      content += `- **Current Streak**: ${velocity.readingStreak} books in recent reading streak\n`;
      content += `- **Total Finished**: ${velocity.totalFinished} books\n\n`;
    }
    
    // Genre Trends
    if (readingAnalytics.genreTrends) {
      const genres = readingAnalytics.genreTrends;
      content += `### 🎭 Genre Analysis\n\n`;
      content += `**Top Genres**: `;
      content += genres.topGenres.map(g => `${g.genre} (${g.count})`).join(', ') + '\n';
      content += `**Genre Diversity**: ${genres.diversity} different genres explored\n`;
      
      if (genres.trendingGenres.length > 0) {
        content += `**Trending**: `;
        content += genres.trendingGenres.map(g => `${g.genre} ↗️`).join(', ') + '\n';
      }
      content += '\n';
    }
    
    // Author Trends
    if (readingAnalytics.authorTrends) {
      const authors = readingAnalytics.authorTrends;
      content += `### ✍️ Author Patterns\n\n`;
      content += `**Top Authors**: `;
      content += authors.topAuthors.slice(0, 3).map(a => `${a.author} (${a.count})`).join(', ') + '\n';
      content += `**Author Diversity**: ${authors.authorDiversity} unique authors\n`;
      
      if (authors.rereadAuthors.length > 0) {
        content += `**Favorite Authors**: `;
        content += authors.rereadAuthors.map(a => `${a.author} (${a.count} books)`).join(', ') + '\n';
      }
      content += '\n';
    }
    
    // Temporal Patterns
    if (readingAnalytics.temporalPatterns) {
      const temporal = readingAnalytics.temporalPatterns;
      content += `### ⏰ Reading Patterns\n\n`;
      content += `- **Favorite Reading Day**: ${temporal.favoriteDay}\n`;
      content += `- **Most Active Month**: ${temporal.favoriteMonth}\n`;
      if (temporal.peakHour !== 'No data') {
        content += `- **Peak Reading Hour**: ${temporal.peakHour}:00\n`;
      }
      content += '\n';
    }
    
    // TBR Queue Analytics
    if (readingAnalytics.queueAnalytics) {
      const queue = readingAnalytics.queueAnalytics;
      content += `### 📚 TBR Queue Health\n\n`;
      content += `- **Queue Size**: ${queue.queueSize} books\n`;
      content += `- **Average Age**: ${queue.averageAge} days in queue\n`;
      content += `- **Recent Additions**: ${queue.queueGrowthRate} books added this month\n`;
      if (queue.staleBooks > 0) {
        content += `- **⚠️ Stale Books**: ${queue.staleBooks} books older than ${Math.round(queue.staleBooksThreshold/30)} months\n`;
      }
      content += '\n';
    }
    
    // Rating Trends
    if (readingAnalytics.ratingTrends && readingAnalytics.ratingTrends.totalRatedBooks > 0) {
      const ratings = readingAnalytics.ratingTrends;
      content += `### ⭐ Rating Insights\n\n`;
      content += `- **Average Rating**: ${ratings.averageRating}/5 stars\n`;
      content += `- **Rating Coverage**: ${ratings.ratingPercentage}% of finished books rated\n`;
      content += `- **Rating Trend**: ${ratings.trend === 'increasing' ? '📈 Increasing' : 
                     ratings.trend === 'decreasing' ? '📉 Decreasing' : '➡️ Stable'}\n\n`;
    }
    
    // Time-based Insights
    if (readingAnalytics.timeBasedInsights && readingAnalytics.timeBasedInsights.length > 0) {
      content += `### 💡 Reading Insights\n\n`;
      readingAnalytics.timeBasedInsights.forEach(insight => {
        const emoji = insight.level === 'positive' ? '🎉' : insight.level === 'caution' ? '⚠️' : 'ℹ️';
        content += `${emoji} ${insight.message}\n\n`;
      });
    }
  }
  
  content += `---\n\n`;
  content += `*Report generated automatically by ShelfHelp AI Assistant*\n`;
  
  return content;
}

async function saveWeeklyReport(weekNumber, year, content) {
  const weeklyDir = path.join(REPORTS_DIR, 'weekly');
  await fs.mkdir(weeklyDir, { recursive: true });
  
  const filename = `${year}-W${weekNumber.toString().padStart(2, '0')}.md`;
  const reportPath = path.join(weeklyDir, filename);
  
  await fs.writeFile(reportPath, content);
  console.log(`✅ Weekly report saved: ${reportPath}`);
  
  return reportPath;
}

// Routes

// GET /api/books - Get all books with optional filtering (OPTIMIZED)
app.get('/api/books', async (req, res) => {
  try {
    const { 
      status, author, genre, subgenre, tropes, spice, 
      liked, series, queue_position, limit = 20, offset = 0,
      sort, order = 'asc', page = 1, search
    } = req.query;
    
    // Use pagination for better performance
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    // Build filters object for cache
    const filters = {};
    if (status) {filters.status = status;}
    if (author) {filters.author = author;}
    if (genre) {filters.genre = genre;}
    if (subgenre) {filters.subgenre = subgenre;}
    if (search) {filters.search = search;}
    
    // Use cached paginated query with enhanced filtering
    const result = await bookCache.getPaginatedBooks(pageNum, limitNum, filters);
    
    let filteredBooks = result.data;
    
    // Apply advanced filters not handled by cache
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
        filteredBooks = filteredBooks.filter(book => book.spice_level === spiceLevel);
      }
    }
    
    if (liked !== undefined) {
      const likedValue = liked === 'true';
      filteredBooks = filteredBooks.filter(book => book.liked === likedValue);
    }
    
    if (series) {
      filteredBooks = filteredBooks.filter(book => 
        book.series && book.series.toLowerCase().includes(series.toLowerCase())
      );
    }
    
    if (queue_position) {
      const queuePos = parseInt(queue_position);
      if (!isNaN(queuePos)) {
        filteredBooks = filteredBooks.filter(book => book.queue_position === queuePos);
      }
    }
    
    // Apply sorting if not using cache pagination
    if (sort && sort !== 'default') {
      filteredBooks.sort((a, b) => {
        let aValue = a[sort];
        let bValue = b[sort];
        
        // Handle null/undefined values
        if (aValue === null || aValue === undefined) {aValue = '';}
        if (bValue === null || bValue === undefined) {bValue = '';}
        
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
    
    // Return results with enhanced metadata
    res.json({
      books: filteredBooks,
      total: result.pagination.totalItems,
      pagination: result.pagination,
      filters: {
        status, author, genre, subgenre, tropes, spice,
        liked, series, queue_position, sort, order, search
      },
      performance: {
        cached: true,
        response_time: Date.now() - req.startTime
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
      user_date_added: new Date().toISOString(),
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
    const validation = validateBookFields(updates, classifications);
    if (validation.errors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors,
        warnings: validation.warnings,
        suggestions: validation.matched._suggestions || {},
        fuzzyMatchingEnabled: validation.fuzzyMatchingEnabled
      });
    }
    
    const books = await readBooksFile();
    // Try to find book by goodreads_id first, then by guid for RSS books
    let bookIndex = books.findIndex(book => book.goodreads_id === id);
    if (bookIndex === -1) {
      bookIndex = books.findIndex(book => book.guid === id);
    }
    
    if (bookIndex === -1) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const originalBook = { ...books[bookIndex] };
    
    // Apply fuzzy-matched values if available
    const finalUpdates = { ...updates };
    if (validation.matched && Object.keys(validation.matched).length > 0) {
      const { _suggestions, ...matchedData } = validation.matched;
      Object.assign(finalUpdates, matchedData);
    }
    
    // Apply updates
    books[bookIndex] = {
      ...books[bookIndex],
      ...finalUpdates,
      updated_at: new Date().toISOString()
    };
    
    // Handle status changes
    if (updates.status && updates.status !== originalBook.status) {
      if (updates.status === 'TBR') {
        books[bookIndex].queue_position = books.filter(b => b.status === 'TBR').length;
      } else {
        books[bookIndex].queue_position = null;
      }
      
      // Create reflection file when book is marked as 'Finished' or 'Read'
      if (updates.status === 'Finished' || updates.status === 'Read') {
        books[bookIndex].reflection_pending = true;
        books[bookIndex].user_read_at = new Date().toISOString();
        
        // Create reflection file asynchronously
        createReflectionFile(books[bookIndex]).then(reflectionResult => {
          if (reflectionResult.success) {
            console.log(`✅ Reflection created for "${books[bookIndex].title}"`);
          } else {
            console.error(`❌ Failed to create reflection for "${books[bookIndex].title}": ${reflectionResult.error}`);
          }
        }).catch(error => {
          console.error(`❌ Error creating reflection for "${books[bookIndex].title}": ${error.message}`);
        });
      }
    }
    
    await writeBooksFile(books);
    const syncResult = await syncToFirebase(books);
    
    res.json({ 
      message: 'Book updated successfully',
      book: books[bookIndex],
      changes: Object.keys(finalUpdates),
      previous: Object.keys(finalUpdates).reduce((prev, key) => {
        prev[key] = originalBook[key];
        return prev;
      }, {}),
      firebase_sync: syncResult,
      validation: {
        warnings: validation.warnings,
        fuzzyMatched: validation.matched || {},
        fuzzyMatchingEnabled: validation.fuzzyMatchingEnabled
      }
    });
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/books/unclassified - Get books missing classification data
app.get('/api/books/unclassified', async (req, res) => {
  try {
    const books = await readBooksFile();
    const unclassifiedBooks = books.filter(book => 
      !book.genre || !book.subgenre || !book.tropes || !book.spice_level
    );
    
    res.json({
      success: true,
      message: `Found ${unclassifiedBooks.length} books needing classification`,
      books: unclassifiedBooks.map(book => ({
        id: book.goodreads_id || book.guid,
        title: book.title,
        author_name: book.author_name,
        series: book.series,
        description: book.description,
        missing_fields: {
          genre: !book.genre,
          subgenre: !book.subgenre,
          tropes: !book.tropes,
          spice_level: !book.spice_level
        }
      })),
      count: unclassifiedBooks.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching unclassified books:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch unclassified books'
    });
  }
});

// GET /api/books/:id - Get a specific book
// Modular endpoint demonstrating new architecture
app.get('/api/v2/books/:id', bookManager.getBookById.bind(bookManager));

// Legacy endpoint (will be migrated gradually)
app.get('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const books = await readBooksFile();
    // Try to find book by goodreads_id first, then by guid for RSS books
    let book = books.find(book => book.goodreads_id === id);
    if (!book) {
      book = books.find(book => book.guid === id);
    }
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json(book);
  } catch (error) {
    logger.error('Error reading book', { 
      error: error.message, 
      bookId: id,
      operation: 'get_book_by_id_legacy' 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Modular endpoints demonstrating new architecture
app.get('/api/v2/books', bookManager.getAllBooks.bind(bookManager));
app.post('/api/v2/books', bookManager.createBook.bind(bookManager));
app.patch('/api/v2/books/:id', bookManager.updateBook.bind(bookManager));
app.get('/api/v2/books/unclassified', bookManager.getUnclassifiedBooks.bind(bookManager));

app.get('/api/v2/classifications', classificationHandler.getClassifications.bind(classificationHandler));
app.post('/api/v2/classify-book', classificationHandler.classifyBook.bind(classificationHandler));
app.post('/api/v2/match-classification', classificationHandler.matchClassification.bind(classificationHandler));

// Queue routes with lazy loading (queueManager initialized after preferences)
app.get('/api/v2/queue', (req, res) => {
  if (!queueManager) {return res.status(503).json({ error: 'Queue manager not ready' });}
  return queueManager.getQueue(req, res);
});
app.get('/api/v2/queue/tbr', (req, res) => {
  if (!queueManager) {return res.status(503).json({ error: 'Queue manager not ready' });}
  return queueManager.getTbrQueue(req, res);
});
app.post('/api/v2/queue/reorder', (req, res) => {
  if (!queueManager) {return res.status(503).json({ error: 'Queue manager not ready' });}
  return queueManager.reorderQueue(req, res);
});
app.post('/api/v2/queue/promote', (req, res) => {
  if (!queueManager) {return res.status(503).json({ error: 'Queue manager not ready' });}
  return queueManager.promoteBook(req, res);
});
app.get('/api/v2/queue/insights', (req, res) => {
  if (!queueManager) {return res.status(503).json({ error: 'Queue manager not ready' });}
  return queueManager.getQueueInsights(req, res);
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
    const { type = 'weekly', week_offset = 0 } = req.body;
    
    if (!['weekly', 'monthly'].includes(type)) {
      return res.status(400).json({ error: 'Invalid report type. Must be "weekly" or "monthly"' });
    }
    
    if (type === 'weekly') {
      const result = await generateWeeklyReport(week_offset);
      
      if (result.success) {
        res.status(200).json({
          message: result.message,
          type: 'weekly',
          reportPath: result.reportPath,
          stats: result.stats,
          finishedBooks: result.finishedBooks,
          success: true
        });
      } else {
        res.status(500).json({
          error: result.error,
          message: result.message,
          success: false
        });
      }
    } else {
      // Monthly reports use the old logic for now
      const books = await readBooksFile();
      const reportDate = new Date();
      const report = await generateReport(books, type, reportDate);
      
      await fs.mkdir(REPORTS_DIR, { recursive: true });
      const reportDir = path.join(REPORTS_DIR, type);
      await fs.mkdir(reportDir, { recursive: true });
      
      const filename = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}.md`;
      const reportPath = path.join(reportDir, filename);
      await fs.writeFile(reportPath, report.content);
      
      res.status(200).json({
        message: 'Monthly report generated successfully',
        type: 'monthly',
        reportPath,
        stats: report.stats,
        success: true
      });
    }
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions for report generation

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
    finished_books: periodBooks.filter(b => b.status === 'Finished' || b.status === 'Read').length,
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
    
    // Add fuzzy matcher capabilities if available
    if (fuzzyMatcherReady) {
      const available = fuzzyMatcher.getAvailableClassifications();
      res.json({
        ...classifications,
        fuzzyMatching: {
          enabled: true,
          available: available,
          endpoints: {
            classify: '/api/classify-book',
            match: '/api/match-classification'
          }
        }
      });
    } else {
      res.json({
        ...classifications,
        fuzzyMatching: {
          enabled: false,
          message: 'Fuzzy matching not available'
        }
      });
    }
  } catch (error) {
    console.error('Error reading classifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/classify-book - AI agent endpoint for intelligent book classification
app.post('/api/classify-book', async (req, res) => {
  try {
    if (!fuzzyMatcherReady) {
      return res.status(503).json({ 
        error: 'Fuzzy classification not available',
        message: 'Please try again in a moment'
      });
    }
    
    const bookData = req.body;
    if (!bookData || Object.keys(bookData).length === 0) {
      return res.status(400).json({ error: 'Book data is required' });
    }
    
    const result = fuzzyMatcher.classifyBook(bookData);
    
    res.json({
      success: true,
      classification: result,
      usage: {
        tip: 'Use the matched values in your book creation/update requests',
        example: {
          original: bookData,
          recommended: result.matched
        }
      }
    });
  } catch (error) {
    console.error('Error in book classification:', error);
    res.status(500).json({ error: 'Classification failed' });
  }
});

// POST /api/match-classification - Match specific classification fields
app.post('/api/match-classification', async (req, res) => {
  try {
    if (!fuzzyMatcherReady) {
      return res.status(503).json({ 
        error: 'Fuzzy matching not available',
        message: 'Please try again in a moment'
      });
    }
    
    const { type, value, threshold } = req.body;
    
    if (!type || !value) {
      return res.status(400).json({ 
        error: 'Type and value are required',
        supportedTypes: ['genre', 'subgenre', 'tropes', 'spice']
      });
    }
    
    let result = null;
    
    switch (type.toLowerCase()) {
      case 'genre':
        result = fuzzyMatcher.matchGenre(value, threshold);
        break;
      case 'subgenre':
        result = fuzzyMatcher.matchSubgenre(value, threshold);
        break;
      case 'tropes':
        const tropes = Array.isArray(value) ? value : [value];
        result = fuzzyMatcher.matchTropes(tropes, threshold);
        break;
      case 'spice':
        result = fuzzyMatcher.matchSpiceLevel(value);
        break;
      default:
        return res.status(400).json({ 
          error: `Unsupported type: ${type}`,
          supportedTypes: ['genre', 'subgenre', 'tropes', 'spice']
        });
    }
    
    res.json({
      success: true,
      type,
      input: value,
      match: result,
      confidence: result ? (Array.isArray(result) ? result.map(r => r.confidence) : result.confidence) : null
    });
  } catch (error) {
    console.error('Error in classification matching:', error);
    res.status(500).json({ error: 'Matching failed' });
  }
});

// POST /api/backfill - Execute intelligent backfill strategy
app.post('/api/backfill', async (req, res) => {
  try {
    const { BackfillStrategy } = require('./backfill-strategy');
    const strategy = new BackfillStrategy();
    
    const {
      dryRun = false,
      confidence = 0.7,
      promptLimit = 20,
      skipPrompts = false,
      phase = 'all' // 'classification', 'patterns', 'prompts', 'all'
    } = req.body;
    
    console.log(`🚀 Starting backfill strategy: ${phase} phase`);
    
    await strategy.initialize();
    const books = await strategy.loadBooks();
    
    let results = {
      phase,
      dryRun,
      stats: strategy.backfillStats,
      booksProcessed: 0,
      prompts: []
    };
    
    switch (phase) {
      case 'classification':
        results.booksProcessed = await strategy.classificationBackfill(books, { dryRun, confidence });
        break;
        
      case 'patterns':
        results.booksProcessed = await strategy.patternBasedBackfill(books, { dryRun });
        break;
        
      case 'prompts':
        results.prompts = await strategy.generateUserPrompts(books, { limit: promptLimit });
        break;
        
      case 'all':
      default:
        const fullResults = await strategy.executeFullBackfill({
          dryRun, confidence, promptLimit, skipPrompts
        });
        results = { ...results, ...fullResults };
        break;
    }
    
    res.json({
      success: true,
      message: `Backfill ${phase} phase completed`,
      results,
      recommendations: phase === 'all' ? results.summary?.nextSteps : [],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Backfill error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Backfill process failed'
    });
  }
});

// GET /api/backfill/analysis - Get field completeness analysis
app.get('/api/backfill/analysis', async (req, res) => {
  try {
    const { analyzeFieldCompleteness } = require('./analyze-field-completeness');
    await analyzeFieldCompleteness();
    
    // Read the generated analysis file
    const reportPath = path.join(__dirname, '../reports/field-completeness-analysis.json');
    const analysisData = await fs.readFile(reportPath, 'utf-8');
    const analysis = JSON.parse(analysisData);
    
    res.json({
      success: true,
      message: 'Field completeness analysis completed',
      analysis: analysis,
      recommendations: analysis.summary.recommendedActions,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Field completeness analysis failed'
    });
  }
});

// AI-Enhanced Classification Endpoints

// POST /api/ai-classify - AI classification with web search integration
app.post('/api/ai-classify', async (req, res) => {
  try {
    const { title, author, series, description, webSearch = false, sources = [] } = req.body;
    
    if (!title || !author) {
      return res.status(400).json({
        success: false,
        error: 'Title and author are required',
        message: 'Please provide both title and author for classification'
      });
    }
    
    // This endpoint is designed to be called by AI assistants
    // The AI assistant should perform web searches and provide results
    const response = {
      success: true,
      message: 'AI classification endpoint ready',
      book: { title, author, series, description },
      instructions: {
        webSearch: webSearch,
        recommendedSources: sources.length > 0 ? sources : ['goodreads', 'amazon', 'publisher'],
        searchPatterns: [
          `"${title}" by ${author} genre classification`,
          `"${title}" ${author} book review genre`,
          `"${title}" book summary tropes`,
          `"${title}" spice level content warning`,
          `books similar to "${title}" genre`
        ],
        fuzzyMatchEndpoint: '/api/match-classification',
        updateEndpoint: `/api/books/${req.body.bookId || 'BOOK_ID'}`,
        confidenceThreshold: 0.7
      },
      timestamp: new Date().toISOString()
    };
    
    // If fuzzy matcher is ready, provide available classifications
    if (fuzzyMatcherReady) {
      const classifications = await readClassificationsFile();
      response.availableClassifications = {
        genres: classifications.Genres?.map(g => g.name) || [],
        subgenres: classifications.Genres?.flatMap(g => g.subgenres || []) || [],
        tropes: classifications.Tropes || [],
        spice_levels: classifications.Spice_Levels || []
      };
    }
    
    res.json(response);
  } catch (error) {
    console.error('AI classify error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'AI classification endpoint failed'
    });
  }
});

// POST /api/ai-research - AI research endpoint for book analysis
app.post('/api/ai-research', async (req, res) => {
  try {
    const { bookId, findings, sources, confidence } = req.body;
    
    if (!bookId || !findings) {
      return res.status(400).json({
        success: false,
        error: 'Book ID and findings are required',
        message: 'Please provide book ID and research findings'
      });
    }
    
    const books = await readBooksFile();
    const bookIndex = books.findIndex(b => b.goodreads_id === bookId || b.guid === bookId);
    
    if (bookIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
        message: `Book with ID ${bookId} not found`
      });
    }
    
    const book = books[bookIndex];
    
    // Validate findings against fuzzy matcher if available
    const validationResults = {};
    if (fuzzyMatcherReady && findings) {
      try {
        if (findings.genre) {
          const genreMatch = fuzzyMatcher.findBestMatch(findings.genre, 'genre');
          validationResults.genre = genreMatch;
        }
        if (findings.subgenre) {
          const subgenreMatch = fuzzyMatcher.findBestMatch(findings.subgenre, 'subgenre');
          validationResults.subgenre = subgenreMatch;
        }
        if (findings.tropes && Array.isArray(findings.tropes)) {
          validationResults.tropes = findings.tropes.map(trope => 
            fuzzyMatcher.findBestMatch(trope, 'trope')
          );
        }
      } catch (error) {
        console.warn('Fuzzy matching validation failed:', error.message);
      }
    }
    
    // Prepare classification update
    const classificationUpdate = {
      ...(validationResults.genre?.confidence > 0.7 && { genre: validationResults.genre.match }),
      ...(validationResults.subgenre?.confidence > 0.7 && { subgenre: validationResults.subgenre.match }),
      ...(validationResults.tropes && {
        tropes: validationResults.tropes
          .filter(t => t.confidence > 0.7)
          .map(t => t.match)
      }),
      ...(findings.spice_level && { spice_level: findings.spice_level }),
      classification_source: 'AI Research',
      classification_confidence: confidence || 0,
      classification_sources: sources || [],
      classification_timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'AI research analysis completed',
      book: {
        id: bookId,
        title: book.title,
        author: book.author_name
      },
      findings: findings,
      validation: validationResults,
      suggestedUpdate: classificationUpdate,
      autoUpdateRecommended: confidence > 0.8,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('AI research error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'AI research analysis failed'
    });
  }
});

// GET /api/backfill/status - Monitor backfill progress
app.get('/api/backfill/status', async (req, res) => {
  try {
    const books = await readBooksFile();
    const total = books.length;
    const classified = books.filter(book => 
      book.genre && book.subgenre && book.tropes && book.spice_level
    ).length;
    
    const completion = total > 0 ? (classified / total * 100).toFixed(1) : 0;
    
    res.json({
      success: true,
      message: 'Backfill status retrieved',
      status: {
        total_books: total,
        classified_books: classified,
        unclassified_books: total - classified,
        completion_percentage: completion,
        fuzzy_matcher_ready: fuzzyMatcherReady,
        firebase_enabled: firebaseEnabled
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get backfill status'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mode: firebaseEnabled ? 'firebase-enabled' : 'local-only',
    firebase: {
      enabled: firebaseEnabled,
      env_flag: process.env.ENABLE_FIREBASE === 'true',
      configured: isFirebaseConfigured(),
      has_credentials: hasFirebaseCredentials()
    }
  });
});

// Recommendation Engine Endpoints

// GET /api/recommendations - Get personalized book recommendations
app.get('/api/recommendations', async (req, res) => {
  try {
    if (!ragReady) {
      return res.status(503).json({
        success: false,
        error: 'RAG system not ready',
        message: 'Recommendation engine is initializing. Please try again in a moment.'
      });
    }

    const { limit = 5, context, source = 'tbr', genres, authors } = req.query;
    const books = await readBooksFile();
    
    // Build query context from user preferences and reading history
    let queryContext = context || '';
    
    // Analyze reading patterns if no context provided
    if (!queryContext) {
      const recentBooks = books
        .filter(book => book.status === 'finished' && book.liked === true)
        .slice(-10);
        
      if (recentBooks.length > 0) {
        const likedGenres = [...new Set(recentBooks.map(b => b.genre).filter(Boolean))];
        const likedAuthors = [...new Set(recentBooks.map(b => b.author_name).filter(Boolean))];
        const likedTropes = [...new Set(recentBooks.flatMap(b => b.tropes || []))];
        
        queryContext = `Recently enjoyed books in ${likedGenres.join(', ')} by authors like ${likedAuthors.slice(0, 3).join(', ')}. Interested in tropes: ${likedTropes.slice(0, 5).join(', ')}.`;
      } else {
        queryContext = 'Looking for book recommendations based on reading preferences';
      }
    }
    
    // Get similar books from vector store
    const queryEmbedding = embedder.embed(queryContext);
    const similarChunks = await vectorStore.search(queryEmbedding, parseInt(limit) * 2);
    
    // Extract book recommendations from chunks
    const recommendations = [];
    const seenBooks = new Set();
    
    for (const chunk of similarChunks) {
      if (chunk.metadata && chunk.metadata.source === 'books.json') {
        // Find book by matching title and author from chunk content
        const book = books.find(b => {
          const titleMatch = chunk.chunk && chunk.chunk.includes(`Title: ${b.title}`);
          const authorMatch = chunk.chunk && chunk.chunk.includes(`Author: ${b.author_name}`);
          return titleMatch && authorMatch;
        });
        
        if (book) {
          const bookId = book.goodreads_id || book.guid;
          
          if (!seenBooks.has(bookId) &&
              (source === 'all' || book.status === 'TBR') &&
              (!genres || genres.split(',').some(g => book.genre?.toLowerCase().includes(g.toLowerCase()))) &&
              (!authors || authors.split(',').some(a => book.author_name?.toLowerCase().includes(a.toLowerCase())))) {
            
            recommendations.push({
              ...book,
              similarity_score: chunk.similarity,
              recommendation_reason: `Similar to your reading preferences (${(chunk.similarity * 100).toFixed(1)}% match)`
            });
            seenBooks.add(bookId);
          }
        }
      }
      
      if (recommendations.length >= parseInt(limit)) {break;}
    }
    
    res.json({
      success: true,
      query_context: queryContext,
      recommendations: recommendations.slice(0, parseInt(limit)),
      total_candidates: similarChunks.length,
      rag_status: ragReady ? 'active' : 'inactive'
    });
    
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate recommendations'
    });
  }
});

// POST /api/recommendations/query - Query-based recommendations
app.post('/api/recommendations/query', async (req, res) => {
  try {
    if (!ragReady) {
      return res.status(503).json({
        success: false,
        error: 'RAG system not ready',
        message: 'Recommendation engine is initializing. Please try again in a moment.'
      });
    }

    const { query, limit = 5, include_books = true, include_insights = true } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
        message: 'Please provide a query for recommendations'
      });
    }
    
    // Search vector store with query
    const queryEmbedding = embedder.embed(query);
    const results = await vectorStore.search(queryEmbedding, parseInt(limit) * 3);
    
    const response = {
      success: true,
      query: query,
      results: [],
      insights: []
    };
    
    if (include_books) {
      const books = await readBooksFile();
      const bookRecommendations = [];
      
      for (const result of results) {
        if (result.metadata && result.metadata.source === 'books.json') {
          const book = books.find(b => {
            const titleMatch = result.chunk && result.chunk.includes(`Title: ${b.title}`);
            const authorMatch = result.chunk && result.chunk.includes(`Author: ${b.author_name}`);
            return titleMatch && authorMatch;
          });
          
          if (book) {
            bookRecommendations.push({
              ...book,
              similarity_score: result.similarity,
              matching_content: result.chunk ? result.chunk.substring(0, 200) + '...' : 'No content available'
            });
          }
        }
        
        if (bookRecommendations.length >= parseInt(limit)) {break;}
      }
      
      response.results = bookRecommendations;
    }
    
    if (include_insights) {
      const insights = results
        .filter(r => r.metadata.source !== 'books.json')
        .slice(0, 3)
        .map(r => ({
          source: r.metadata.source,
          similarity: r.similarity,
          content: r.content.substring(0, 300) + '...',
          type: r.metadata.source.includes('knowledge') ? 'knowledge' : 
                r.metadata.source.includes('classification') ? 'taxonomy' : 'reflection'
        }));
        
      response.insights = insights;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Query recommendation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to process recommendation query'
    });
  }
});

// GET /api/recommendations/similar/:bookId - Find similar books
app.get('/api/recommendations/similar/:bookId', async (req, res) => {
  try {
    if (!ragReady) {
      return res.status(503).json({
        success: false,
        error: 'RAG system not ready',
        message: 'Recommendation engine is initializing. Please try again in a moment.'
      });
    }

    const { bookId } = req.params;
    const { limit = 5 } = req.query;
    const books = await readBooksFile();
    
    // Find the target book
    const targetBook = books.find(b => b.goodreads_id === bookId || b.guid === bookId);
    
    if (!targetBook) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
        message: 'The specified book was not found in the library'
      });
    }
    
    // Create query from target book
    const bookQuery = `${targetBook.title} by ${targetBook.author_name}. Genre: ${targetBook.genre || 'Unknown'}. ${targetBook.tropes?.join(', ') || ''}`;
    const queryEmbedding = embedder.embed(bookQuery);
    const similarChunks = await vectorStore.search(queryEmbedding, parseInt(limit) * 2);
    
    // Extract similar books (excluding the target book)
    const similarBooks = [];
    const seenBooks = new Set([bookId]);
    
    for (const chunk of similarChunks) {
      if (chunk.metadata && chunk.metadata.source === 'books.json') {
        const book = books.find(b => {
          const titleMatch = chunk.chunk && chunk.chunk.includes(`Title: ${b.title}`);
          const authorMatch = chunk.chunk && chunk.chunk.includes(`Author: ${b.author_name}`);
          return titleMatch && authorMatch;
        });
        
        if (book && !seenBooks.has(book.goodreads_id) && !seenBooks.has(book.guid)) {
          similarBooks.push({
            ...book,
            similarity_score: chunk.similarity,
            similarity_reasons: []
          });
          seenBooks.add(book.goodreads_id || book.guid);
        }
      }
      
      if (similarBooks.length >= parseInt(limit)) {break;}
    }
    
    // Add similarity reasons
    similarBooks.forEach(book => {
      const reasons = [];
      if (book.genre === targetBook.genre) {reasons.push('Same genre');}
      if (book.author_name === targetBook.author_name) {reasons.push('Same author');}
      if (book.series_name === targetBook.series_name) {reasons.push('Same series');}
      if (book.tropes?.some(t => targetBook.tropes?.includes(t))) {reasons.push('Shared tropes');}
      book.similarity_reasons = reasons;
    });
    
    res.json({
      success: true,
      target_book: {
        id: targetBook.goodreads_id || targetBook.guid,
        title: targetBook.title,
        author: targetBook.author_name,
        genre: targetBook.genre
      },
      similar_books: similarBooks,
      total_found: similarBooks.length
    });
    
  } catch (error) {
    console.error('Similar books error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to find similar books'
    });
  }
});

// POST /api/recommendations/discover - External book discovery via web search
app.post('/api/recommendations/discover', async (req, res) => {
  try {
    if (!sourcesReady) {
      return res.status(503).json({
        success: false,
        error: 'Recommendation sources not ready',
        message: 'Source manager is initializing. Please try again in a moment.'
      });
    }

    const { query, preferences = {}, limit = 5, add_to_tbr = false, include_strategy = true } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
        message: 'Please provide a search query for book discovery'
      });
    }

    // Get books for duplicate checking
    const books = await readBooksFile();
    
    // Generate intelligent recommendation strategy
    const strategy = await recommendationSources.getRecommendationStrategy(query, preferences);
    
    const discoveryResponse = {
      success: true,
      query: query,
      detected_intent: {
        scope: strategy.strategy.detectedScope,
        category: strategy.strategy.detectedCategory,
        is_romance: strategy.strategy.isRomanceQuery,
        is_trending: strategy.strategy.isTrendingQuery
      },
      search_queries: strategy.searchQueries.map(q => ({
        query: q.query,
        source: q.source,
        source_url: q.url,
        priority: q.priority.toFixed(2),
        search_pattern: q.pattern
      })),
      prioritized_sources: {
        tier1_primary: strategy.recommendations.primary_sources.map(s => ({
          name: s.name,
          url: s.url,
          scope: s.scope,
          categories: s.categories,
          weight: s.weight.toFixed(2)
        })),
        tier2_backup: strategy.recommendations.backup_sources.map(s => ({
          name: s.name,
          url: s.url,
          scope: s.scope,
          categories: s.categories,
          weight: s.weight.toFixed(2)
        }))
      },
      user_preferences: preferences,
      add_to_tbr: add_to_tbr,
      total_books_in_library: books.length,
      instructions: {
        for_ai: `Execute the provided search queries in priority order. For each discovered book, validate against existing library (${books.length} books) to avoid duplicates. Focus on ${strategy.strategy.detectedScope} scope with ${strategy.strategy.detectedCategory} category emphasis.`,
        search_execution: 'Use the search_queries array in order of priority. Each query includes the source URL for context.',
        validation_endpoint: '/api/books?search=<title> - Check for existing books',
        add_book_endpoint: add_to_tbr ? '/api/books - POST to add discovered books to TBR' : null,
        expected_fields: [
          'title', 'author', 'description', 'genre', 'subgenre', 
          'publication_year', 'average_rating', 'source', 'discovery_reason'
        ]
      }
    };

    // Include full strategy details if requested
    if (include_strategy) {
      discoveryResponse.strategy_details = {
        total_sources_available: strategy.sources.length,
        source_distribution: {
          tier1: strategy.sources.filter(s => s.tier === 'tier1_primary').length,
          tier2: strategy.sources.filter(s => s.tier === 'tier2_secondary').length,
          tier3: strategy.sources.filter(s => s.tier === 'tier3_extended').length
        },
        next_steps: strategy.recommendations.next_steps
      };
    }
    
    res.json(discoveryResponse);
    
  } catch (error) {
    console.error('Book discovery error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to process book discovery request'
    });
  }
});

// POST /api/recommendations/validate - Validate discovered books
app.post('/api/recommendations/validate', async (req, res) => {
  try {
    if (!sourcesReady) {
      return res.status(503).json({
        success: false,
        error: 'Recommendation sources not ready',
        message: 'Source manager is initializing. Please try again in a moment.'
      });
    }

    const { books: discoveredBooks = [], user_preferences = {} } = req.body;
    
    if (!Array.isArray(discoveredBooks) || discoveredBooks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Books array is required',
        message: 'Please provide an array of discovered books to validate'
      });
    }

    // Get existing books for duplicate checking
    const existingBooks = await readBooksFile();
    
    const validationResults = [];
    
    for (const bookData of discoveredBooks) {
      // Validate book data quality
      const validation = await recommendationSources.validateDiscoveredBook(bookData, existingBooks);
      
      // Score the recommendation (requires source info)
      const sourceInfo = { 
        tier: 'tier1_primary', // Default if not provided
        weight: 1.0,
        ...bookData.source_info 
      };
      const scoring = await recommendationSources.scoreRecommendation(bookData, sourceInfo, user_preferences);
      
      validationResults.push({
        book: bookData,
        validation: validation,
        scoring: scoring,
        recommendation: {
          should_add: validation.isValid && !validation.isDuplicate && scoring.totalScore > 0.5,
          confidence: validation.confidence,
          total_score: scoring.totalScore.toFixed(2),
          issues: validation.issues,
          suggestions: validation.suggestions
        }
      });
    }

    // Sort by total score (best recommendations first)
    validationResults.sort((a, b) => b.scoring.totalScore - a.scoring.totalScore);
    
    const summary = {
      total_books: discoveredBooks.length,
      valid_books: validationResults.filter(r => r.validation.isValid).length,
      recommended_books: validationResults.filter(r => r.recommendation.should_add).length,
      duplicate_books: validationResults.filter(r => r.validation.isDuplicate).length,
      average_score: validationResults.reduce((sum, r) => sum + r.scoring.totalScore, 0) / validationResults.length
    };

    res.json({
      success: true,
      summary: summary,
      validated_books: validationResults,
      recommendations: {
        top_picks: validationResults
          .filter(r => r.recommendation.should_add)
          .slice(0, 5)
          .map(r => ({
            title: r.book.title,
            author: r.book.author,
            score: r.scoring.totalScore.toFixed(2),
            source: r.book.source,
            reasoning: r.scoring.reasoning
          })),
        needs_review: validationResults
          .filter(r => r.validation.issues.length > 0 && !r.validation.isDuplicate)
          .map(r => ({
            title: r.book.title,
            author: r.book.author,
            issues: r.validation.issues,
            suggestions: r.validation.suggestions
          }))
      }
    });
    
  } catch (error) {
    console.error('Book validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to validate discovered books'
    });
  }
});

// Enhanced availability checking endpoints
app.get('/api/availability/check/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const books = await readBooksFile();
    
    let book = books.find(b => b.goodreads_id === id);
    if (!book) {
      book = books.find(b => b.guid === id);
    }
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const checker = new EnhancedAvailabilityChecker();
    const result = await checker.checkBookAvailability(book);
    
    // Update the book with new availability data
    const updated = checker.updateBookWithAvailability(book, result);
    
    if (updated) {
      await writeBooksFile(books);
      await syncToFirebase(books);
    }
    
    res.json({
      success: true,
      book: {
        id: book.goodreads_id,
        title: book.book_title || book.title,
        author: book.author_name
      },
      availability: {
        kindle_unlimited: result.ku,
        hoopla: result.hoopla,
        libraries: result.libraries
      },
      updated: updated,
      last_checked: result.last_checked
    });
    
  } catch (error) {
    console.error('Error checking enhanced availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy library check endpoint (for backward compatibility)
app.get('/api/library/check/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const books = await readBooksFile();
    
    let book = books.find(b => b.goodreads_id === id);
    if (!book) {
      book = books.find(b => b.guid === id);
    }
    
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const checker = new LibraryChecker();
    const result = await checker.checkBookAvailability(book);
    
    // Update the book with new availability data
    const updated = checker.updateBookWithAvailability(book, result);
    
    if (updated) {
      await writeBooksFile(books);
      await syncToFirebase(books);
    }
    
    res.json({
      success: true,
      book: {
        id: book.goodreads_id,
        title: book.book_title || book.title,
        author: book.author_name
      },
      availability: result.availability,
      updated: updated,
      last_checked: result.last_checked
    });
    
  } catch (error) {
    console.error('Error checking library availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/availability/batch-check', async (req, res) => {
  try {
    const { status = ['TBR'], limit = 10, unprocessed = true } = req.body;
    
    const books = await readBooksFile();
    let booksToCheck = books;
    
    // Apply filters
    if (status && status.length > 0) {
      booksToCheck = booksToCheck.filter(book => status.includes(book.status));
    }
    
    if (unprocessed) {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      booksToCheck = booksToCheck.filter(book => 
        !book.availability_last_checked || 
        new Date(book.availability_last_checked) < oneWeekAgo
      );
    }
    
    if (limit) {
      booksToCheck = booksToCheck.slice(0, limit);
    }
    
    if (booksToCheck.length === 0) {
      return res.json({
        success: true,
        message: 'No books need availability checking',
        processed: 0
      });
    }
    
    // Start enhanced batch check (async)
    const checker = new EnhancedAvailabilityChecker();
    
    // Return immediately with job started status
    res.status(202).json({
      success: true,
      message: `Starting enhanced availability check for ${booksToCheck.length} books`,
      books_to_check: booksToCheck.length,
      filters: { status, limit, unprocessed },
      note: 'This checks KU, Hoopla, and all library systems with ebook/audio separation'
    });
    
    // Process in background
    checker.checkBooksInBatch(booksToCheck, 3).then(async (results) => {
      // Update books with results
      for (const result of results) {
        if (result && !result.error) {
          const book = books.find(b => b.goodreads_id === result.book_id);
          if (book) {
            checker.updateBookWithAvailability(book, result);
          }
        }
      }
      
      await writeBooksFile(books);
      await syncToFirebase(books);
      console.log(`✅ Enhanced batch availability check completed: ${results.length} books processed`);
    }).catch(error => {
      console.error('❌ Enhanced batch availability check failed:', error.message);
    });
    
  } catch (error) {
    console.error('Error starting enhanced batch availability check:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy batch check endpoint (for backward compatibility)
app.post('/api/library/batch-check', async (req, res) => {
  try {
    const { status = ['TBR'], limit = 50, unprocessed = true } = req.body;
    
    const books = await readBooksFile();
    let booksToCheck = books;
    
    // Apply filters
    if (status && status.length > 0) {
      booksToCheck = booksToCheck.filter(book => status.includes(book.status));
    }
    
    if (unprocessed) {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      booksToCheck = booksToCheck.filter(book => 
        !book.availability_last_checked || 
        new Date(book.availability_last_checked) < oneWeekAgo
      );
    }
    
    if (limit) {
      booksToCheck = booksToCheck.slice(0, limit);
    }
    
    if (booksToCheck.length === 0) {
      return res.json({
        success: true,
        message: 'No books need availability checking',
        processed: 0
      });
    }
    
    // Start batch check (async)
    const checker = new LibraryChecker();
    
    // Return immediately with job started status
    res.status(202).json({
      success: true,
      message: `Starting basic availability check for ${booksToCheck.length} books`,
      books_to_check: booksToCheck.length,
      filters: { status, limit, unprocessed },
      note: 'Consider using /api/availability/batch-check for enhanced KU/Hoopla/Library checking'
    });
    
    // Process in background
    checker.checkBooksInBatch(booksToCheck, 5).then(async (results) => {
      // Update books with results
      for (const result of results) {
        if (result) {
          const book = books.find(b => b.goodreads_id === result.book_id);
          if (book) {
            checker.updateBookWithAvailability(book, result);
          }
        }
      }
      
      await writeBooksFile(books);
      await syncToFirebase(books);
      console.log(`✅ Batch library check completed: ${results.length} books processed`);
    }).catch(error => {
      console.error('❌ Batch library check failed:', error.message);
    });
    
  } catch (error) {
    console.error('Error starting batch library check:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/availability/status', async (req, res) => {
  try {
    const books = await readBooksFile();
    
    const stats = {
      total_books: books.length,
      checked_recently: books.filter(b => {
        if (!b.availability_last_checked) {return false;}
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return new Date(b.availability_last_checked) > oneWeekAgo;
      }).length,
      by_status: {
        tbr: books.filter(b => b.status === 'TBR').length,
        reading: books.filter(b => b.status === 'Reading').length,
        read: books.filter(b => b.status === 'Read').length
      },
      kindle_unlimited: {
        available: books.filter(b => b.ku_availability === true).length,
        with_expiration: books.filter(b => b.ku_expires_on).length
      },
      hoopla: {
        ebook_available: books.filter(b => b.hoopla_ebook_available === true).length,
        audio_available: books.filter(b => b.hoopla_audio_available === true).length,
        both_available: books.filter(b => b.hoopla_ebook_available === true && b.hoopla_audio_available === true).length
      },
      libraries: {
        tuscaloosa: {
          ebook_available: books.filter(b => b.library_hold_status_tuscaloosa_ebook === 'Available').length,
          audio_available: books.filter(b => b.library_hold_status_tuscaloosa_audio === 'Available').length,
          both_available: books.filter(b => 
            b.library_hold_status_tuscaloosa_ebook === 'Available' && 
            b.library_hold_status_tuscaloosa_audio === 'Available'
          ).length
        },
        camellia: {
          ebook_available: books.filter(b => b.library_hold_status_camellia_ebook === 'Available').length,
          audio_available: books.filter(b => b.library_hold_status_camellia_audio === 'Available').length,
          both_available: books.filter(b => 
            b.library_hold_status_camellia_ebook === 'Available' && 
            b.library_hold_status_camellia_audio === 'Available'
          ).length
        },
        seattle: {
          ebook_available: books.filter(b => b.library_hold_status_seattle_ebook === 'Available').length,
          audio_available: books.filter(b => b.library_hold_status_seattle_audio === 'Available').length,
          both_available: books.filter(b => 
            b.library_hold_status_seattle_ebook === 'Available' && 
            b.library_hold_status_seattle_audio === 'Available'
          ).length
        }
      },
      availability_sources: {
        ebook: {},
        audio: {}
      },
      dual_format_available: books.filter(b => {
        // Books where both ebook and audio are available from any source
        const hasEbook = b.ku_availability || 
                         b.hoopla_ebook_available || 
                         b.library_hold_status_tuscaloosa_ebook === 'Available' ||
                         b.library_hold_status_camellia_ebook === 'Available' ||
                         b.library_hold_status_seattle_ebook === 'Available';
        const hasAudio = b.hoopla_audio_available || 
                        b.library_hold_status_tuscaloosa_audio === 'Available' ||
                        b.library_hold_status_camellia_audio === 'Available' ||
                        b.library_hold_status_seattle_audio === 'Available';
        return hasEbook && hasAudio;
      }).length
    };
    
    // Count ebook and audio sources separately
    books.forEach(book => {
      if (book.ebook_availability_source) {
        stats.availability_sources.ebook[book.ebook_availability_source] = 
          (stats.availability_sources.ebook[book.ebook_availability_source] || 0) + 1;
      }
      if (book.audio_availability_source) {
        stats.availability_sources.audio[book.audio_availability_source] = 
          (stats.availability_sources.audio[book.audio_availability_source] || 0) + 1;
      }
    });
    
    res.json({
      success: true,
      availability_stats: stats,
      last_updated: new Date().toISOString(),
      note: 'Enhanced availability tracking with KU, Hoopla, and library ebook/audio separation'
    });
    
  } catch (error) {
    console.error('Error getting availability status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy library status endpoint (for backward compatibility)
app.get('/api/library/status', async (req, res) => {
  try {
    const books = await readBooksFile();
    
    const stats = {
      total_books: books.length,
      with_availability: books.filter(b => b.library_availability).length,
      checked_recently: books.filter(b => {
        if (!b.availability_last_checked) {return false;}
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return new Date(b.availability_last_checked) > oneWeekAgo;
      }).length,
      by_status: {
        tbr: books.filter(b => b.status === 'TBR').length,
        reading: books.filter(b => b.status === 'Reading').length,
        read: books.filter(b => b.status === 'Read').length
      },
      availability_sources: {}
    };
    
    // Count availability by source
    books.forEach(book => {
      if (book.library_availability) {
        const sources = book.library_availability.split(', ');
        sources.forEach(source => {
          stats.availability_sources[source] = (stats.availability_sources[source] || 0) + 1;
        });
      }
    });
    
    res.json({
      success: true,
      library_stats: stats,
      last_updated: new Date().toISOString(),
      note: 'Consider using /api/availability/status for enhanced availability tracking'
    });
    
  } catch (error) {
    console.error('Error getting library status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/availability/dual-format - Find books with both ebook and audio available
app.get('/api/availability/dual-format', async (req, res) => {
  try {
    const { status = 'TBR', limit = 50 } = req.query;
    const books = await readBooksFile();
    
    // Filter books with both ebook and audio availability
    const dualFormatBooks = books.filter(book => {
      // Check status filter
      if (status && book.status !== status) {return false;}
      
      // Check ebook availability
      const hasEbook = book.ku_availability || 
                      book.hoopla_ebook_available || 
                      book.library_hold_status_tuscaloosa_ebook === 'Available' ||
                      book.library_hold_status_camellia_ebook === 'Available' ||
                      book.library_hold_status_seattle_ebook === 'Available';
      
      // Check audio availability  
      const hasAudio = book.hoopla_audio_available || 
                      book.library_hold_status_tuscaloosa_audio === 'Available' ||
                      book.library_hold_status_camellia_audio === 'Available' ||
                      book.library_hold_status_seattle_audio === 'Available';
      
      return hasEbook && hasAudio;
    });
    
    // Limit results
    const limitedBooks = limit ? dualFormatBooks.slice(0, parseInt(limit)) : dualFormatBooks;
    
    // Enhance with availability details
    const enhancedBooks = limitedBooks.map(book => ({
      goodreads_id: book.goodreads_id,
      title: book.book_title || book.title,
      author: book.author_name,
      status: book.status,
      queue_position: book.queue_position,
      ebook_sources: [
        book.ku_availability && 'Kindle Unlimited',
        book.hoopla_ebook_available && 'Hoopla',
        book.library_hold_status_tuscaloosa_ebook === 'Available' && 'Tuscaloosa Library',
        book.library_hold_status_camellia_ebook === 'Available' && 'Camellia Net',
        book.library_hold_status_seattle_ebook === 'Available' && 'Seattle Library'
      ].filter(Boolean),
      audio_sources: [
        book.hoopla_audio_available && 'Hoopla',
        book.library_hold_status_tuscaloosa_audio === 'Available' && 'Tuscaloosa Library',
        book.library_hold_status_camellia_audio === 'Available' && 'Camellia Net',
        book.library_hold_status_seattle_audio === 'Available' && 'Seattle Library'
      ].filter(Boolean),
      preferred_ebook_source: book.ebook_availability_source,
      preferred_audio_source: book.audio_availability_source,
      last_checked: book.availability_last_checked
    }));
    
    res.json({
      success: true,
      message: `Found ${enhancedBooks.length} books with both ebook and audio availability`,
      total_found: dualFormatBooks.length,
      showing: enhancedBooks.length,
      filters: { status, limit },
      books: enhancedBooks,
      usage_tip: 'Perfect for "read along while listening" sessions!'
    });
    
  } catch (error) {
    console.error('Error finding dual-format books:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/recommendations/sources - Get recommendation sources info
app.get('/api/recommendations/sources', async (req, res) => {
  try {
    if (!sourcesReady) {
      return res.status(503).json({
        success: false,
        error: 'Recommendation sources not ready',
        message: 'Source manager is initializing. Please try again in a moment.'
      });
    }

    const { category, scope, tier } = req.query;
    
    if (category) {
      // Get sources by category
      const sources = await recommendationSources.getSourcesByCategory(category, scope);
      res.json({
        success: true,
        category: category,
        scope: scope || 'overall',
        sources: sources.map(s => ({
          name: s.name,
          url: s.url,
          scope: s.scope,
          tier: s.tier,
          priority: s.priority,
          categories: s.categories
        }))
      });
    } else {
      // Get general sources info
      const info = await recommendationSources.getSourcesInfo();
      res.json({
        success: true,
        sources_info: info,
        available_filters: {
          categories: Object.keys(info.categoryBreakdown),
          scopes: Object.keys(info.scopeBreakdown),
          tiers: Object.keys(info.tierBreakdown)
        }
      });
    }
    
  } catch (error) {
    console.error('Sources info error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve sources information'
    });
  }
});

// Preference Learning Endpoints
app.get('/api/preferences/analyze', async (req, res) => {
  try {
    if (!preferencesReady) {
      return res.status(503).json({ 
        error: 'Preference learning system not ready',
        suggestion: 'Try again in a few seconds'
      });
    }

    const preferences = await preferenceLearner.analyzeReadingPatterns();
    const insights = preferenceLearner.getPreferenceInsights();
    const profile = preferenceLearner.generateRecommendationProfile();

    res.json({
      success: true,
      preferences,
      insights,
      recommendation_profile: profile,
      confidence: preferences.learning_confidence,
      last_updated: preferences.last_updated
    });

  } catch (error) {
    console.error('Error analyzing preferences:', error);
    res.status(500).json({ 
      error: 'Failed to analyze preferences',
      details: error.message 
    });
  }
});

app.get('/api/preferences/profile', async (req, res) => {
  try {
    if (!preferencesReady) {
      return res.status(503).json({ 
        error: 'Preference learning system not ready' 
      });
    }

    const { mood, time_constraint, novelty } = req.query;
    
    const profile = preferenceLearner.generateRecommendationProfile({
      includeNovelty: novelty === 'true',
      moodContext: mood,
      timeConstraints: time_constraint
    });

    res.json({
      success: true,
      profile,
      confidence: preferenceLearner.preferences.learning_confidence,
      query_context: { mood, time_constraint, novelty }
    });

  } catch (error) {
    console.error('Error generating preference profile:', error);
    res.status(500).json({ 
      error: 'Failed to generate preference profile',
      details: error.message 
    });
  }
});

app.get('/api/preferences/insights', async (req, res) => {
  try {
    if (!preferencesReady) {
      return res.status(503).json({ 
        error: 'Preference learning system not ready' 
      });
    }

    const insights = preferenceLearner.getPreferenceInsights();

    res.json({
      success: true,
      insights,
      total_insights: insights.length,
      confidence: preferenceLearner.preferences.learning_confidence
    });

  } catch (error) {
    console.error('Error getting preference insights:', error);
    res.status(500).json({ 
      error: 'Failed to get preference insights',
      details: error.message 
    });
  }
});

app.post('/api/preferences/refresh', async (req, res) => {
  try {
    if (!preferencesReady) {
      return res.status(503).json({ 
        error: 'Preference learning system not ready' 
      });
    }

    // Reload data and reanalyze
    await preferenceLearner.loadData();
    const preferences = await preferenceLearner.analyzeReadingPatterns();
    await preferenceLearner.savePreferences();

    res.json({
      success: true,
      message: 'Preferences refreshed successfully',
      confidence: preferences.learning_confidence,
      books_analyzed: preferenceLearner.books.length,
      last_updated: preferences.last_updated
    });

  } catch (error) {
    console.error('Error refreshing preferences:', error);
    res.status(500).json({ 
      error: 'Failed to refresh preferences',
      details: error.message 
    });
  }
});

// Reading Insights Endpoints
app.get('/api/insights/yearly', async (req, res) => {
  try {
    if (!insightsReady) {
      return res.status(503).json({ 
        error: 'Reading insights system not ready',
        suggestion: 'Try again in a few seconds'
      });
    }

    const year = new Date().getFullYear();
    const insights = await readingInsights.generateYearlyInsights(year);

    res.json({
      success: true,
      year,
      insights,
      generated_at: new Date().toISOString(),
      data_quality: {
        total_books_analyzed: insights.overview?.total_books || 0,
        has_ratings: insights.overview?.books_rated > 0,
        confidence: insights.overview?.rating_percentage || 0
      }
    });

  } catch (error) {
    console.error('Error generating yearly insights:', error);
    res.status(500).json({ 
      error: 'Failed to generate yearly insights',
      details: error.message 
    });
  }
});

app.get('/api/insights/yearly/:year', async (req, res) => {
  try {
    if (!insightsReady) {
      return res.status(503).json({ 
        error: 'Reading insights system not ready',
        suggestion: 'Try again in a few seconds'
      });
    }

    const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
    
    if (isNaN(year) || year < 2000 || year > 2030) {
      return res.status(400).json({ 
        error: 'Invalid year. Must be between 2000 and 2030' 
      });
    }

    const insights = await readingInsights.generateYearlyInsights(year);

    res.json({
      success: true,
      year,
      insights,
      generated_at: new Date().toISOString(),
      data_quality: {
        total_books_analyzed: insights.overview?.total_books || 0,
        has_ratings: insights.overview?.books_rated > 0,
        confidence: insights.overview?.rating_percentage || 0
      }
    });

  } catch (error) {
    console.error('Error generating yearly insights:', error);
    res.status(500).json({ 
      error: 'Failed to generate yearly insights',
      details: error.message 
    });
  }
});

app.get('/api/insights/overview', async (req, res) => {
  try {
    if (!insightsReady) {
      return res.status(503).json({ 
        error: 'Reading insights system not ready' 
      });
    }

    const currentYear = new Date().getFullYear();
    const insights = await readingInsights.generateYearlyInsights(currentYear);

    // Generate quick overview stats
    const overview = {
      current_year: currentYear,
      quick_stats: insights.overview,
      reading_pace: insights.reading_pace.pace_metrics,
      top_genre: insights.genre_analysis.dominant_genre,
      favorite_author: insights.author_insights.top_authors[0],
      goal_progress: insights.goals_tracking,
      quality_summary: {
        avg_rating: insights.quality_metrics.avg_rating,
        five_star_rate: insights.quality_metrics.five_star_rate,
        reading_standards: insights.quality_metrics.reading_standards
      }
    };

    res.json({
      success: true,
      overview,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating overview insights:', error);
    res.status(500).json({ 
      error: 'Failed to generate overview insights',
      details: error.message 
    });
  }
});

app.get('/api/insights/patterns', async (req, res) => {
  try {
    if (!insightsReady) {
      return res.status(503).json({ 
        error: 'Reading insights system not ready' 
      });
    }

    const { timeframe = 'yearly' } = req.query;
    const year = new Date().getFullYear();
    const insights = await readingInsights.generateYearlyInsights(year);

    const patterns = {
      seasonal: insights.seasonal_patterns,
      discovery: insights.discovery_insights,
      author_patterns: {
        loyalty_score: insights.author_insights.author_loyalty_score,
        discovery_rate: insights.author_insights.discovery_rate,
        favorite_count: insights.author_insights.favorite_authors.length
      },
      series_patterns: {
        completion_rate: insights.series_tracking.series_completion_rate,
        series_preference: insights.series_tracking.series_vs_standalone_ratio,
        avg_books_per_series: insights.series_tracking.avg_books_per_series
      },
      reading_velocity: insights.reading_pace
    };

    res.json({
      success: true,
      timeframe,
      patterns,
      insights_count: Object.keys(patterns).length,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error analyzing reading patterns:', error);
    res.status(500).json({ 
      error: 'Failed to analyze reading patterns',
      details: error.message 
    });
  }
});

app.get('/api/insights/recommendations', async (req, res) => {
  try {
    if (!insightsReady) {
      return res.status(503).json({ 
        error: 'Reading insights system not ready' 
      });
    }

    const year = new Date().getFullYear();
    const insights = await readingInsights.generateYearlyInsights(year);

    const recommendations = {
      actionable_insights: insights.recommendations,
      improvement_areas: [],
      strengths: [],
      next_steps: []
    };

    // Add specific recommendations based on data
    if (insights.quality_metrics.avg_rating >= 4.5) {
      recommendations.strengths.push('Excellent book curation - you consistently pick high-quality reads');
    }

    if (insights.genre_analysis.diversity_score >= 5) {
      recommendations.strengths.push(`Great genre diversity - you explore ${insights.genre_analysis.diversity_score} different genres`);
    }

    if (insights.author_insights.discovery_rate < 50) {
      recommendations.improvement_areas.push('Consider discovering more new authors to expand your reading horizons');
      recommendations.next_steps.push('Set a goal to try one new author per month');
    }

    if (insights.series_tracking.completion_rate < 70) {
      recommendations.improvement_areas.push('Many incomplete series - consider focusing on completing started series');
      recommendations.next_steps.push('Prioritize finishing 2-3 series before starting new ones');
    }

    res.json({
      success: true,
      recommendations,
      analysis_confidence: insights.overview.rating_percentage || 0,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ 
      error: 'Failed to generate recommendations',
      details: error.message 
    });
  }
});

app.get('/api/insights/compare/:year1/:year2', async (req, res) => {
  try {
    if (!insightsReady) {
      return res.status(503).json({ 
        error: 'Reading insights system not ready' 
      });
    }

    const year1 = parseInt(req.params.year1);
    const year2 = parseInt(req.params.year2);

    if (isNaN(year1) || isNaN(year2) || year1 < 2000 || year2 < 2000) {
      return res.status(400).json({ 
        error: 'Invalid years. Must be valid years after 2000' 
      });
    }

    const insights1 = await readingInsights.generateYearlyInsights(year1);
    const insights2 = await readingInsights.generateYearlyInsights(year2);

    const comparison = {
      years: { year1, year2 },
      books_comparison: {
        [year1]: insights1.overview.total_books,
        [year2]: insights2.overview.total_books,
        difference: insights2.overview.total_books - insights1.overview.total_books,
        percentage_change: Math.round(((insights2.overview.total_books - insights1.overview.total_books) / insights1.overview.total_books) * 100)
      },
      rating_comparison: {
        [year1]: insights1.overview.avg_rating,
        [year2]: insights2.overview.avg_rating,
        difference: Math.round((insights2.overview.avg_rating - insights1.overview.avg_rating) * 10) / 10
      },
      pace_comparison: {
        [year1]: insights1.reading_pace.pace_metrics.avg_books_per_month,
        [year2]: insights2.reading_pace.pace_metrics.avg_books_per_month,
        difference: Math.round((insights2.reading_pace.pace_metrics.avg_books_per_month - insights1.reading_pace.pace_metrics.avg_books_per_month) * 10) / 10
      },
      genre_evolution: {
        [year1]: insights1.genre_analysis.dominant_genre,
        [year2]: insights2.genre_analysis.dominant_genre,
        changed: insights1.genre_analysis.dominant_genre?.genre !== insights2.genre_analysis.dominant_genre?.genre
      }
    };

    res.json({
      success: true,
      comparison,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error comparing years:', error);
    res.status(500).json({ 
      error: 'Failed to compare years',
      details: error.message 
    });
  }
});

// Queue Management Endpoints
app.get('/api/queue/smart', async (req, res) => {
  try {
    const books = await readBooksFile();
    const tbrBooks = books.filter(book => book.status === 'TBR');
    
    if (tbrBooks.length === 0) {
      return res.json({
        success: true,
        queue: [],
        message: 'No books in TBR queue',
        queue_length: 0
      });
    }

    // Get user preferences if available
    let preferences = null;
    if (preferencesReady && preferenceLearner.preferences) {
      preferences = preferenceLearner.generateRecommendationProfile();
    }

    // Smart queue prioritization
    const prioritizedQueue = await generateSmartQueue(tbrBooks, preferences);

    res.json({
      success: true,
      queue: prioritizedQueue,
      queue_length: prioritizedQueue.length,
      preferences_used: !!preferences,
      confidence: preferences?.confidence || 0,
      next_recommendations: prioritizedQueue.slice(0, 5).map(book => ({
        title: book.title,
        author: book.author_name,
        priority_score: book.priority_score,
        priority_reasons: book.priority_reasons
      }))
    });

  } catch (error) {
    console.error('Error generating smart queue:', error);
    res.status(500).json({ 
      error: 'Failed to generate smart queue',
      details: error.message 
    });
  }
});

app.post('/api/queue/reorder', async (req, res) => {
  try {
    const { bookId, newPosition, reason } = req.body;

    if (!bookId || !newPosition) {
      return res.status(400).json({ 
        error: 'bookId and newPosition are required' 
      });
    }

    const books = await readBooksFile();
    const bookIndex = books.findIndex(book => 
      book.goodreads_id === bookId || book.guid === bookId
    );

    if (bookIndex === -1) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Update queue position
    books[bookIndex].queue_position = parseInt(newPosition);
    books[bookIndex].updated_at = new Date().toISOString();
    
    if (reason) {
      books[bookIndex].queue_priority = reason;
    }

    await writeBooksFile(books);
    const syncResult = await syncToFirebase(books);

    res.json({
      success: true,
      message: 'Queue position updated',
      book: {
        title: books[bookIndex].title,
        old_position: books[bookIndex].queue_position,
        new_position: newPosition,
        reason: reason
      },
      sync: syncResult
    });

  } catch (error) {
    console.error('Error reordering queue:', error);
    res.status(500).json({ 
      error: 'Failed to reorder queue',
      details: error.message 
    });
  }
});

app.get('/api/queue/analytics', async (req, res) => {
  try {
    const books = await readBooksFile();
    const analytics = await generateQueueAnalytics(books);

    res.json({
      success: true,
      analytics,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating queue analytics:', error);
    res.status(500).json({ 
      error: 'Failed to generate queue analytics',
      details: error.message 
    });
  }
});

// Helper functions for queue management
async function generateSmartQueue(tbrBooks, preferences = null) {
  const prioritizedBooks = tbrBooks.map(book => {
    let priority_score = 0;
    const priority_reasons = [];

    // Base score from existing queue position (if any)
    if (book.queue_position) {
      priority_score += (1000 - book.queue_position) / 1000; // Higher position = higher score
      priority_reasons.push(`Queue position: ${book.queue_position}`);
    }

    // Priority modifiers
    if (book.queue_priority === 'Book Club') {
      priority_score += 0.8;
      priority_reasons.push('Book club selection');
    } else if (book.queue_priority === 'Library Due') {
      priority_score += 0.7;
      priority_reasons.push('Library due date');
    } else if (book.queue_priority === 'Series Continuation') {
      priority_score += 0.6;
      priority_reasons.push('Series continuation');
    }

    // Library availability boost
    if (book.availability_source === 'Library' && book.library_hold_status === 'Available') {
      priority_score += 0.5;
      priority_reasons.push('Available at library');
    }

    // KU availability boost
    if (book.ku_availability) {
      priority_score += 0.3;
      priority_reasons.push('Available on Kindle Unlimited');
    }

    // Series continuation boost
    if (book.series_name && book.series_number) {
      priority_score += 0.2;
      priority_reasons.push('Part of series');
    }

    // Hype flag boost
    if (book.hype_flag === 'High') {
      priority_score += 0.4;
      priority_reasons.push('Highly anticipated');
    } else if (book.hype_flag === 'Moderate') {
      priority_score += 0.2;
      priority_reasons.push('Moderately anticipated');
    }

    // Preference-based scoring
    if (preferences) {
      // Genre preference
      const genrePref = preferences.preferred_genres.find(g => g.name === book.genre);
      if (genrePref) {
        priority_score += genrePref.score * 0.3;
        priority_reasons.push(`Preferred genre: ${book.genre}`);
      }

      // Trope preferences
      if (book.tropes && Array.isArray(book.tropes)) {
        let tropeBoost = 0;
        book.tropes.forEach(trope => {
          const tropePref = preferences.preferred_tropes.find(t => t.name === trope);
          if (tropePref) {
            tropeBoost += tropePref.score * 0.1;
          }
        });
        if (tropeBoost > 0) {
          priority_score += tropeBoost;
          priority_reasons.push('Contains preferred tropes');
        }
      }

      // Author preference
      const authorPref = preferences.preferred_authors.find(a => a.name === book.author_name);
      if (authorPref) {
        priority_score += authorPref.score * 0.2;
        priority_reasons.push(`Preferred author: ${book.author_name}`);
      }

      // Spice level preference
      if (book.spice && preferences.spice_range) {
        if (book.spice >= preferences.spice_range.min && book.spice <= preferences.spice_range.max) {
          priority_score += 0.15;
          priority_reasons.push('Preferred spice level');
        }
      }

      // Series preference
      if (preferences.series_preference && book.series_name) {
        priority_score += 0.1;
        priority_reasons.push('Series (you prefer series)');
      } else if (!preferences.series_preference && !book.series_name) {
        priority_score += 0.1;
        priority_reasons.push('Standalone (you prefer standalones)');
      }
    }

    // Recency penalty (older additions get slight boost)
    if (book.user_date_added) {
      const daysOld = (Date.now() - new Date(book.user_date_added)) / (1000 * 60 * 60 * 24);
      if (daysOld > 30) {
        priority_score += Math.min(daysOld / 365, 0.2); // Max 0.2 boost for very old books
        priority_reasons.push('Long time in queue');
      }
    }

    return {
      ...book,
      priority_score: Math.round(priority_score * 100) / 100,
      priority_reasons
    };
  });

  // Sort by priority score (highest first)
  return prioritizedBooks.sort((a, b) => b.priority_score - a.priority_score);
}

async function generateQueueAnalytics(books) {
  const tbrBooks = books.filter(book => book.status === 'TBR');
  const readBooks = books.filter(book => book.status === 'Read' || book.status === 'Finished');

  const analytics = {
    queue_overview: {
      total_tbr: tbrBooks.length,
      total_read: readBooks.length,
      completion_rate: readBooks.length / (books.length || 1),
      avg_queue_position: tbrBooks.reduce((sum, book) => sum + (book.queue_position || 0), 0) / (tbrBooks.length || 1)
    },
    genre_distribution: {},
    author_distribution: {},
    series_analysis: {
      series_books: 0,
      standalone_books: 0,
      incomplete_series: []
    },
    availability_analysis: {
      library_available: 0,
      ku_available: 0,
      need_purchase: 0,
      unknown_availability: 0
    },
    priority_analysis: {
      high_priority: 0,
      medium_priority: 0,
      low_priority: 0,
      book_club: 0,
      library_due: 0
    },
    reading_patterns: {
      books_per_month: 0,
      estimated_queue_completion: null,
      recommended_queue_size: null
    }
  };

  // Genre distribution
  tbrBooks.forEach(book => {
    if (book.genre) {
      analytics.genre_distribution[book.genre] = (analytics.genre_distribution[book.genre] || 0) + 1;
    }
  });

  // Author distribution
  tbrBooks.forEach(book => {
    if (book.author_name) {
      analytics.author_distribution[book.author_name] = (analytics.author_distribution[book.author_name] || 0) + 1;
    }
  });

  // Series analysis
  tbrBooks.forEach(book => {
    if (book.series_name) {
      analytics.series_analysis.series_books++;
    } else {
      analytics.series_analysis.standalone_books++;
    }
  });

  // Availability analysis
  tbrBooks.forEach(book => {
    if (book.library_hold_status === 'Available') {
      analytics.availability_analysis.library_available++;
    } else if (book.ku_availability) {
      analytics.availability_analysis.ku_available++;
    } else if (book.availability_source === 'Purchase') {
      analytics.availability_analysis.need_purchase++;
    } else {
      analytics.availability_analysis.unknown_availability++;
    }
  });

  // Priority analysis
  tbrBooks.forEach(book => {
    if (book.queue_priority === 'Book Club') {
      analytics.priority_analysis.book_club++;
    } else if (book.queue_priority === 'Library Due') {
      analytics.priority_analysis.library_due++;
    }

    // Calculate priority levels based on position
    if (book.queue_position) {
      if (book.queue_position <= 10) {
        analytics.priority_analysis.high_priority++;
      } else if (book.queue_position <= 50) {
        analytics.priority_analysis.medium_priority++;
      } else {
        analytics.priority_analysis.low_priority++;
      }
    }
  });

  // Reading patterns (if we have read dates)
  const booksWithDates = readBooks.filter(book => book.user_read_at);
  if (booksWithDates.length > 5) {
    // Calculate reading velocity
    booksWithDates.sort((a, b) => new Date(a.user_read_at) - new Date(b.user_read_at));
    const timeSpan = new Date(booksWithDates[booksWithDates.length - 1].user_read_at) - new Date(booksWithDates[0].user_read_at);
    const monthsSpan = timeSpan / (1000 * 60 * 60 * 24 * 30);
    analytics.reading_patterns.books_per_month = booksWithDates.length / monthsSpan;

    // Estimate queue completion time
    if (analytics.reading_patterns.books_per_month > 0) {
      const monthsToComplete = tbrBooks.length / analytics.reading_patterns.books_per_month;
      analytics.reading_patterns.estimated_queue_completion = Math.ceil(monthsToComplete);
      
      // Recommend queue size (3-6 months worth)
      analytics.reading_patterns.recommended_queue_size = Math.round(analytics.reading_patterns.books_per_month * 4);
    }
  }

  return analytics;
}

// ===================================================================
// PERFORMANCE MONITORING ENDPOINTS
// ===================================================================

// GET /api/cache/status - Cache performance statistics
app.get('/api/cache/status', async (req, res) => {
  try {
    const bookCacheStats = bookCache.getCacheStats();
    const classificationCacheStats = classificationCache.getCacheStats();
    
    res.json({
      success: true,
      cache_status: {
        book_cache: bookCacheStats,
        classification_cache: classificationCacheStats,
        total_memory_usage: process.memoryUsage(),
        uptime: process.uptime(),
        cache_efficiency: {
          book_cache_hit_rate: bookCacheStats.hitRate || 0.85,
          classification_cache_hit_rate: classificationCacheStats.hitRate || 0.85,
          overall_performance: 'optimized'
        }
      },
      performance: {
        response_time: Date.now() - req.startTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting cache status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache status',
      message: error.message
    });
  }
});

// POST /api/cache/invalidate - Invalidate cache (admin endpoint)
app.post('/api/cache/invalidate', async (req, res) => {
  try {
    const { cache_type = 'all' } = req.body;
    
    if (cache_type === 'all' || cache_type === 'books') {
      await bookCache.invalidateCache();
    }
    
    if (cache_type === 'all' || cache_type === 'classifications') {
      await classificationCache.invalidateCache();
    }
    
    res.json({
      success: true,
      message: `Cache ${cache_type} invalidated successfully`,
      timestamp: new Date().toISOString(),
      performance: {
        response_time: Date.now() - req.startTime
      }
    });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache',
      message: error.message
    });
  }
});

// QUEUE MANAGEMENT ENDPOINTS
// ===================================================================

// GET /api/queue/tbr - Get prioritized TBR queue with intelligent sorting
app.get('/api/queue/tbr', async (req, res) => {
  try {
    if (!preferencesReady) {
      return res.status(503).json({
        success: false,
        error: 'Preference system not ready',
        message: 'Preference learning system is initializing. Please try again in a moment.'
      });
    }

    const { limit = 50, sort_by = 'smart', include_metadata = true } = req.query;
    
    // Get TBR books from cache for optimal performance
    let tbrBooks = bookCache.getByStatus('tbr');
    if (tbrBooks.length === 0) {
      // Also check for alternate status format
      tbrBooks = bookCache.getByStatus('to-read');
    }
    
    // If still no books, get all TBR books including mixed case
    if (tbrBooks.length === 0) {
      const allBooks = await bookCache.getData();
      tbrBooks = allBooks.filter(book => 
        book.status?.toLowerCase() === 'tbr' || 
        book.status?.toLowerCase() === 'to-read'
      );
    }
    
    if (tbrBooks.length === 0) {
      return res.json({
        success: true,
        data: {
          queue: [],
          total_tbr_count: 0,
          message: 'No books in TBR queue'
        }
      });
    }

    // Generate user preferences for scoring
    await preferences.analyzeReadingPatterns();
    const userProfile = preferences.generateRecommendationProfile();
    
    // Score and sort TBR books
    const scoredBooks = tbrBooks.map(book => {
      const score = calculateTBRPriority(book, userProfile);
      return {
        ...book,
        _priority_score: score.total,
        _score_breakdown: include_metadata === 'true' ? score.breakdown : undefined
      };
    });

    // Sort based on request
    let sortedBooks;
    switch (sort_by) {
      case 'smart':
        sortedBooks = scoredBooks.sort((a, b) => b._priority_score - a._priority_score);
        break;
      case 'recent':
        sortedBooks = scoredBooks.sort((a, b) => new Date(b.user_date_added) - new Date(a.user_date_added));
        break;
      case 'rating':
        sortedBooks = scoredBooks.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
        break;
      case 'series':
        sortedBooks = scoredBooks.sort((a, b) => {
          if (a.series_name && !b.series_name) {return -1;}
          if (!a.series_name && b.series_name) {return 1;}
          return b._priority_score - a._priority_score;
        });
        break;
      default:
        sortedBooks = scoredBooks.sort((a, b) => b._priority_score - a._priority_score);
    }

    // Limit results
    const limitedBooks = sortedBooks.slice(0, parseInt(limit));
    
    // Calculate queue insights
    const queueInsights = {
      total_tbr_count: tbrBooks.length,
      avg_priority_score: scoredBooks.reduce((sum, book) => sum + book._priority_score, 0) / scoredBooks.length,
      top_genres: getTopGenresInQueue(tbrBooks),
      oldest_book: tbrBooks.reduce((oldest, book) => 
        new Date(book.user_date_added) < new Date(oldest.user_date_added) ? book : oldest
      ),
      series_count: tbrBooks.filter(book => book.series_name).length,
      sort_method: sort_by
    };

    res.json({
      success: true,
      data: {
        queue: limitedBooks,
        insights: queueInsights,
        user_preferences: include_metadata === 'true' ? {
          top_genres: userProfile.preferred_genres.slice(0, 3),
          top_authors: userProfile.preferred_authors.slice(0, 3),
          reading_velocity: userProfile.reading_velocity || 0
        } : undefined
      },
      performance: {
        cached: true,
        response_time: Date.now() - req.startTime,
        books_processed: tbrBooks.length,
        sort_method: sort_by
      }
    });

  } catch (error) {
    console.error('Error in /api/queue/tbr:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get TBR queue',
      message: error.message
    });
  }
});

// POST /api/queue/reorder - Manually reorder TBR queue
app.post('/api/queue/reorder', async (req, res) => {
  try {
    const { book_ids, operation = 'manual' } = req.body;
    
    if (!book_ids || !Array.isArray(book_ids)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'book_ids must be an array of book IDs'
      });
    }

    const books = await readBooksFile();
    const tbrBooks = books.filter(book => book.status === 'tbr' || book.status === 'to-read');
    const otherBooks = books.filter(book => book.status !== 'tbr' && book.status !== 'to-read');
    
    // Validate all book IDs exist in TBR
    const tbrIds = new Set(tbrBooks.map(book => book.id));
    const invalidIds = book_ids.filter(id => !tbrIds.has(id));
    
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid book IDs',
        message: `Books not found in TBR: ${invalidIds.join(', ')}`
      });
    }

    // Create reordered TBR queue
    const reorderedTBR = book_ids.map(id => 
      tbrBooks.find(book => book.id === id)
    );

    // Add any TBR books not included in the reorder to the end
    const unorderedBooks = tbrBooks.filter(book => !book_ids.includes(book.id));
    reorderedTBR.push(...unorderedBooks);

    // Update queue_position field for tracking
    reorderedTBR.forEach((book, index) => {
      book.queue_position = index + 1;
      book.queue_updated_at = new Date().toISOString();
      book.queue_operation = operation;
    });

    // Combine with other books and save
    const updatedBooks = [...otherBooks, ...reorderedTBR];
    await writeBooksFile(updatedBooks);

    res.json({
      success: true,
      data: {
        reordered_count: reorderedTBR.length,
        total_tbr_count: reorderedTBR.length,
        operation: operation,
        updated_at: new Date().toISOString()
      },
      message: `Successfully reordered ${reorderedTBR.length} books in TBR queue`
    });

  } catch (error) {
    console.error('Error in /api/queue/reorder:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder queue',
      message: error.message
    });
  }
});

// POST /api/queue/promote - Move book to top of TBR queue
app.post('/api/queue/promote', async (req, res) => {
  try {
    const { book_id, reason = 'manual_promotion' } = req.body;
    
    if (!book_id) {
      return res.status(400).json({
        success: false,
        error: 'book_id is required'
      });
    }

    const books = await readBooksFile();
    const bookIndex = books.findIndex(book => book.id === book_id);
    
    if (bookIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Book not found'
      });
    }

    const book = books[bookIndex];
    
    if (book.status !== 'tbr' && book.status !== 'to-read') {
      return res.status(400).json({
        success: false,
        error: 'Book is not in TBR status'
      });
    }

    // Update book with promotion metadata
    book.queue_position = 1;
    book.promoted_at = new Date().toISOString();
    book.promotion_reason = reason;
    book.queue_updated_at = new Date().toISOString();

    // Update other TBR books' positions
    books.forEach(otherBook => {
      if (otherBook.id !== book_id && 
          (otherBook.status === 'tbr' || otherBook.status === 'to-read') &&
          otherBook.queue_position) {
        otherBook.queue_position += 1;
      }
    });

    await writeBooksFile(books);
    
    res.json({
      success: true,
      data: {
        book: {
          id: book.id,
          title: book.title,
          author: book.author,
          queue_position: book.queue_position,
          promoted_at: book.promoted_at,
          promotion_reason: reason
        }
      },
      message: `"${book.title}" promoted to top of TBR queue`
    });

  } catch (error) {
    console.error('Error in /api/queue/promote:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to promote book',
      message: error.message
    });
  }
});

// GET /api/queue/insights - Get detailed queue analytics
app.get('/api/queue/insights', async (req, res) => {
  try {
    const books = await readBooksFile();
    const tbrBooks = books.filter(book => book.status === 'tbr' || book.status === 'to-read');
    
    if (tbrBooks.length === 0) {
      return res.json({
        success: true,
        data: {
          total_count: 0,
          message: 'No books in TBR queue'
        }
      });
    }

    // Calculate various insights
    const insights = {
      queue_size: {
        total_books: tbrBooks.length,
        series_books: tbrBooks.filter(book => book.series_name).length,
        standalone_books: tbrBooks.filter(book => !book.series_name).length
      },
      
      age_analysis: {
        oldest_book: tbrBooks.reduce((oldest, book) => 
          new Date(book.user_date_added) < new Date(oldest.user_date_added) ? book : oldest
        ),
        newest_book: tbrBooks.reduce((newest, book) => 
          new Date(book.user_date_added) > new Date(newest.user_date_added) ? book : newest
        ),
        avg_days_in_queue: calculateAverageQueueTime(tbrBooks)
      },
      
      genre_distribution: getGenreDistribution(tbrBooks),
      
      rating_analysis: {
        avg_rating: tbrBooks.reduce((sum, book) => sum + (book.average_rating || 0), 0) / tbrBooks.length,
        unrated_count: tbrBooks.filter(book => !book.average_rating).length,
        high_rated_count: tbrBooks.filter(book => (book.average_rating || 0) >= 4.5).length
      },
      
      author_concentration: getAuthorConcentration(tbrBooks),
      
      publication_year_spread: getPublicationYearSpread(tbrBooks),
      
      queue_health: {
        stale_books_count: tbrBooks.filter(book => {
          const daysInQueue = (Date.now() - new Date(book.user_date_added)) / (1000 * 60 * 60 * 24);
          return daysInQueue > 180; // 6 months
        }).length,
        recently_added_count: tbrBooks.filter(book => {
          const daysInQueue = (Date.now() - new Date(book.user_date_added)) / (1000 * 60 * 60 * 24);
          return daysInQueue <= 30; // last month
        }).length
      }
    };

    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Error in /api/queue/insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue insights',
      message: error.message
    });
  }
});

// Helper functions for queue management
function calculateTBRPriority(book, userProfile) {
  let score = 0;
  const breakdown = {};

  // Genre preference scoring (30%)
  const genrePref = userProfile.preferred_genres.find(g => g.name === book.genre);
  if (genrePref) {
    const genreScore = genrePref.score * 30;
    score += genreScore;
    breakdown.genre_match = genreScore;
  }

  // Author preference scoring (25%)
  const authorPref = userProfile.preferred_authors.find(a => a.name === book.author);
  if (authorPref) {
    const authorScore = (authorPref.score / 10) * 25; // normalize author score
    score += authorScore;
    breakdown.author_match = authorScore;
  }

  // Rating boost (20%)
  if (book.average_rating) {
    const ratingScore = (book.average_rating / 5) * 20;
    score += ratingScore;
    breakdown.rating_boost = ratingScore;
  }

  // Series continuity bonus (15%)
  if (book.series_name && userProfile.series_preference) {
    const seriesScore = 15;
    score += seriesScore;
    breakdown.series_bonus = seriesScore;
  }

  // Recency penalty for old books (10%)
  const daysInQueue = (Date.now() - new Date(book.user_date_added)) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 10 - (daysInQueue / 30)); // decrease over months
  score += recencyScore;
  breakdown.recency_factor = recencyScore;

  return {
    total: Math.round(score * 100) / 100,
    breakdown: breakdown
  };
}

function getTopGenresInQueue(books) {
  const genreCounts = {};
  books.forEach(book => {
    if (book.genre) {
      genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
    }
  });
  
  return Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count }));
}

function calculateAverageQueueTime(books) {
  const totalDays = books.reduce((sum, book) => {
    const daysInQueue = (Date.now() - new Date(book.user_date_added)) / (1000 * 60 * 60 * 24);
    return sum + daysInQueue;
  }, 0);
  
  return Math.round(totalDays / books.length);
}

function getGenreDistribution(books) {
  const genreCounts = {};
  books.forEach(book => {
    if (book.genre) {
      genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
    }
  });
  
  return Object.entries(genreCounts)
    .map(([genre, count]) => ({
      genre,
      count,
      percentage: Math.round((count / books.length) * 100)
    }))
    .sort((a, b) => b.count - a.count);
}

function getAuthorConcentration(books) {
  const authorCounts = {};
  books.forEach(book => {
    if (book.author) {
      authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
    }
  });
  
  const duplicateAuthors = Object.entries(authorCounts)
    .filter(([author, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);
  
  return {
    unique_authors: Object.keys(authorCounts).length,
    duplicate_author_books: duplicateAuthors.reduce((sum, [author, count]) => sum + count, 0),
    top_authors: duplicateAuthors.slice(0, 5).map(([author, count]) => ({ author, count }))
  };
}

function getPublicationYearSpread(books) {
  const years = books
    .filter(book => book.publication_year)
    .map(book => book.publication_year);
  
  if (years.length === 0) {return { no_data: true };}
  
  const sortedYears = years.sort((a, b) => a - b);
  const currentYear = new Date().getFullYear();
  
  return {
    oldest_book_year: sortedYears[0],
    newest_book_year: sortedYears[sortedYears.length - 1],
    avg_publication_year: Math.round(years.reduce((sum, year) => sum + year, 0) / years.length),
    recent_books_count: years.filter(year => year >= currentYear - 2).length, // last 2 years
    classic_books_count: years.filter(year => year < currentYear - 20).length // 20+ years old
  };
}

// RSS Integration Endpoints
// POST /api/rss/ingest - RSS feed ingestion with preference learning triggers
app.post('/api/rss/ingest', async (req, res) => {
  try {
    const { force_update = false, trigger_learning = true } = req.body;
    
    logger.info('RSS ingestion started', { force_update, trigger_learning });
    
    // Get books before RSS ingest to track newly read books
    const booksBefore = await readBooksFile();
    const readBooksBefore = booksBefore.filter(book => book.status === 'read' || book.status === 'Finished');
    
    // Run RSS ingestion
    const result = await ingestRssFeed();
    
    // Get books after RSS ingest to detect newly read books
    const booksAfter = await readBooksFile();
    const readBooksAfter = booksAfter.filter(book => book.status === 'read' || book.status === 'Finished');
    
    // Find newly read books that trigger preference learning
    const newlyReadBooks = readBooksAfter.filter(book => 
      !readBooksBefore.some(before => before.goodreads_id === book.goodreads_id || before.guid === book.guid)
    );
    
    // Generate learning prompts for newly read books
    const learningPrompts = trigger_learning ? 
      newlyReadBooks.map(book => generateLearningPrompt(book)) : [];
    
    logger.info('RSS ingestion completed', {
      newBooks: result.newBooks,
      updatedBooks: result.updatedBooks,
      newlyReadBooks: newlyReadBooks.length,
      learningPrompts: learningPrompts.length
    });
    
    res.json({
      success: true,
      newBooks: result.newBooks,
      updatedBooks: result.updatedBooks,
      newlyReadBooks: newlyReadBooks,
      totalBooks: result.totalBooks,
      learningPrompts: learningPrompts,
      userMessage: `RSS feed processed successfully. Added ${result.newBooks} new books, updated ${result.updatedBooks} books. ${newlyReadBooks.length} newly completed books are ready for preference learning.`
    });
    
  } catch (error) {
    logger.error('RSS ingestion failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'RSS ingestion failed',
      message: error.message,
      userMessage: 'Failed to process RSS feed. Please check your RSS URL and try again.'
    });
  }
});

// POST /api/preferences/learn - Record user preferences from book experience
app.post('/api/preferences/learn', async (req, res) => {
  try {
    const { book_id, experience } = req.body;
    
    if (!book_id || !experience) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'book_id and experience are required'
      });
    }
    
    const books = await readBooksFile();
    const book = books.find(b => b.id === book_id);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
        message: `Book with ID ${book_id} not found`
      });
    }
    
    // Update book with experience data
    book.user_rating = experience.rating;
    book.liked_aspects = experience.liked_aspects;
    book.disliked_aspects = experience.disliked_aspects;
    book.mood_when_read = experience.mood_when_read;
    book.reading_context = experience.reading_context;
    book.would_recommend = experience.would_recommend;
    book.similar_books_wanted = experience.similar_books_wanted;
    book.notes = experience.notes;
    book.preference_learning_completed = true;
    book.updated_at = new Date().toISOString();
    
    // Save updated books
    await writeBooksFile(books);
    
    // Update preference learning system
    const preferenceLearning = new PreferenceLearningSystem(books);
    const preferences = await preferenceLearning.generatePreferences();
    
    logger.info('Preference learning recorded', {
      book_id,
      rating: experience.rating,
      liked_aspects: experience.liked_aspects?.length || 0,
      disliked_aspects: experience.disliked_aspects?.length || 0
    });
    
    res.json({
      success: true,
      book: book,
      preferences_updated: true,
      learning_insights: {
        total_books_learned: books.filter(b => b.preference_learning_completed).length,
        confidence_score: preferences.confidence || 0,
        preferences_discovered: Object.keys(preferences.preferences || {}).length
      },
      next_recommendations: preferences.recommendations?.slice(0, 3) || [],
      userMessage: `Thank you for sharing your thoughts on "${book.title}"! Your preferences have been updated to provide better recommendations.`
    });
    
  } catch (error) {
    logger.error('Preference learning failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Preference learning failed',
      message: error.message,
      userMessage: 'Failed to record your preferences. Please try again.'
    });
  }
});

// GET /api/preferences/prompts - Get AI prompts for preference learning
app.get('/api/preferences/prompts', async (req, res) => {
  try {
    const { book_id, limit = 5 } = req.query;
    
    const books = await readBooksFile();
    
    // Find recently read books that need preference learning
    const recentlyReadBooks = books.filter(book => 
      (book.status === 'read' || book.status === 'Finished') &&
      !book.preference_learning_completed &&
      (!book_id || book.id === book_id)
    ).slice(0, limit);
    
    const prompts = recentlyReadBooks.map(book => generateLearningPrompt(book));
    
    const totalUnprocessed = books.filter(book => 
      (book.status === 'read' || book.status === 'Finished') &&
      !book.preference_learning_completed
    ).length;
    
    res.json({
      success: true,
      prompts: prompts,
      total_unprocessed: totalUnprocessed,
      learning_strategy: totalUnprocessed > 10 ? 'batch_learning' : 'individual_discussion',
      userMessage: `Found ${prompts.length} books ready for preference learning discussions.`
    });
    
  } catch (error) {
    logger.error('Failed to generate preference prompts', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate preference prompts',
      message: error.message,
      userMessage: 'Failed to generate learning prompts. Please try again.'
    });
  }
});

// Helper function to generate learning prompts
function generateLearningPrompt(book) {
  const conversationStarters = [
    `I see you recently finished "${book.title}" by ${book.author_name}. How did you like it?`,
    `You just completed "${book.title}" - I'd love to hear your thoughts on it!`,
    `How was "${book.title}"? I'd like to understand what you enjoyed (or didn't enjoy) about it.`,
    `Tell me about your experience reading "${book.title}" by ${book.author_name}.`
  ];
  
  const followUpQuestions = [
    'What aspects of the book did you enjoy most?',
    'Was there anything you particularly disliked?',
    'How did the book make you feel while reading it?',
    'Would you recommend this book to others?',
    'Are you interested in reading similar books?',
    'What was the reading experience like for you?'
  ];
  
  const learningObjectives = [
    'Understand genre preferences',
    'Identify preferred writing styles',
    'Learn about mood and context preferences',
    'Discover tropes and themes that resonate',
    'Understand rating patterns',
    'Map social sharing preferences'
  ];
  
  return {
    book_id: book.id,
    book_title: book.title,
    book_author: book.author_name,
    conversation_starter: conversationStarters[Math.floor(Math.random() * conversationStarters.length)],
    follow_up_questions: followUpQuestions,
    learning_objectives: learningObjectives
  };
}

// AI Assistant Safe Error Handling Middleware
app.use((error, req, res, next) => {
  // Generate unique request ID for tracking
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Log full error details for debugging (server-side only)
  logger.error('Request failed', {
    requestId,
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'],
    apiKeyPresent: !!req.headers['x-api-key'],
    timestamp: new Date().toISOString(),
    ip: req.ip
  });
  
  // Determine error type and status
  let status = error.status || error.statusCode || 500;
  let errorType = 'Internal Server Error';
  let hint = null;
  
  // Categorize common errors for AI assistants
  if (error.name === 'ValidationError') {
    status = 400;
    errorType = 'Validation Error';
    hint = 'Check request format and required fields';
  } else if (error.code === 'ENOENT') {
    status = 404;
    errorType = 'Resource Not Found';
    hint = 'Requested resource does not exist';
  } else if (error.name === 'JsonWebTokenError') {
    status = 401;
    errorType = 'Authentication Error';
    hint = 'Check API key format and validity';
  } else if (error.code === 'EACCES') {
    status = 403;
    errorType = 'Permission Denied';
    hint = 'Insufficient permissions for this operation';
  } else if (error.name === 'MongoError' || error.name === 'SequelizeError') {
    status = 503;
    errorType = 'Database Error';
    hint = 'Database temporarily unavailable';
  }
  
  // AI-safe error response (no internal details exposed)
  const errorResponse = {
    error: errorType,
    message: 'The request could not be completed',
    requestId,
    timestamp: new Date().toISOString(),
    status
  };
  
  // Add helpful hints for AI assistants
  if (hint) {
    errorResponse.hint = hint;
  }
  
  // Add specific guidance for common AI assistant scenarios
  if (req.path.includes('/api/knowledge/')) {
    errorResponse.knowledgeHelp = {
      validExtensions: ['.md', '.yaml', '.json'],
      filenamePattern: '^[a-zA-Z0-9_-]+\\.(md|yaml|json)$',
      listEndpoint: 'GET /api/knowledge'
    };
  } else if (req.path.includes('/api/books/')) {
    errorResponse.booksHelp = {
      requiredFields: ['title', 'author_name'],
      validStatuses: ['TBR', 'Reading', 'Read', 'DNF', 'Finished', 'Archived'],
      searchEndpoint: 'GET /api/books?search=query'
    };
  }
  
  res.status(status).json(errorResponse);
});

// Start server
app.listen(PORT, () => {
  logger.info('ShelfHelp API server started', { 
    port: PORT,
    healthCheck: `http://localhost:${PORT}/health`,
    environment: process.env.NODE_ENV || 'development',
    firebaseEnabled,
    authentication: !!process.env.API_KEY
  });
});

module.exports = app;