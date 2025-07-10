const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');
const yaml = require('yaml');
const { firebaseConfig, isFirebaseConfigured, hasFirebaseCredentials } = require('./firebase-config');
const FuzzyClassificationMatcher = require('./fuzzy-classifier');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
      console.log('✅ Firebase initialized successfully');
    } else {
      console.log('⚠️ Firebase credentials not properly configured');
    }
  } catch (error) {
    console.warn('⚠️ Firebase initialization failed:', error.message);
    firebaseEnabled = false;
  }
} else {
  console.log('📁 Running in local-only mode (Firebase disabled)');
  console.log('   Set ENABLE_FIREBASE=true to enable Firebase sync');
}

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const CLASSIFICATIONS_FILE = path.join(__dirname, '../data/classifications.yaml');
const HISTORY_DIR = path.join(__dirname, '../history');
const REFLECTIONS_DIR = path.join(__dirname, '../reflections');
const REFLECTION_TEMPLATE = path.join(__dirname, '../reflections/template.md');
const REPORTS_DIR = path.join(__dirname, '../reports');

// Initialize fuzzy matcher
const fuzzyMatcher = new FuzzyClassificationMatcher();
let fuzzyMatcherReady = false;

// Initialize fuzzy matcher on startup
fuzzyMatcher.initialize(CLASSIFICATIONS_FILE)
  .then(() => {
    fuzzyMatcherReady = true;
    console.log('✅ Fuzzy classification matcher ready');
  })
  .catch(error => {
    console.error('❌ Failed to initialize fuzzy matcher:', error.message);
  });

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
    console.warn('⚠️ Fuzzy matcher not ready, using strict validation');
    
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
    console.log('✅ Synced to Firebase successfully');
    return { 
      success: true, 
      mode: 'firebase-sync', 
      message: 'Data saved locally and synced to Firebase',
      count: Object.keys(syncData).length 
    };
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
      if ((book.status !== 'Finished' && book.status !== 'Read') || !book.user_read_at) return false;
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
    if (!book.genre) insights.missingClassification.genre++;
    if (!book.subgenre) insights.missingClassification.subgenre++;
    if (!book.tropes || book.tropes.length === 0) insights.missingClassification.tropes++;
    if (!book.spice) insights.missingClassification.spice++;
    
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
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
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
    if (!book.goodreads_id) continue;
    
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
  let completedSections = [];
  
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
        if (lowerLine.includes(word)) sentimentScore++;
      });
      negativeWords.forEach(word => {
        if (lowerLine.includes(word)) sentimentScore--;
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
    if (!book.goodreads_id) continue;
    
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
  if (sortedBooks.length === 0) return 0;

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
      if (!monthlyGenres[month]) monthlyGenres[month] = {};
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
  if (recentAvg > earlierAvg + 0.3) trend = 'increasing';
  if (recentAvg < earlierAvg - 0.3) trend = 'decreasing';

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

// GET /api/books/:id - Get a specific book
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