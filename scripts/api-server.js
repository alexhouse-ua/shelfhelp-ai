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
    
    // Get reflection highlights
    const reflectionHighlights = await getReflectionHighlights(finishedThisWeek);
    
    // Generate report content
    const reportContent = generateWeeklyReportContent({
      weekNumber,
      year,
      startDate,
      endDate,
      finishedThisWeek,
      stats,
      reflectionHighlights
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
        
        // Extract highlights from reflection
        const bookHighlights = extractReflectionHighlights(reflectionContent, book);
        if (bookHighlights.length > 0) {
          highlights.push({
            book: book.title,
            author: book.author_name,
            highlights: bookHighlights
          });
        }
      }
    } catch (error) {
      console.log(`⚠️  Could not read reflection for ${book.title}: ${error.message}`);
    }
  }
  
  return highlights;
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

function generateWeeklyReportContent({ weekNumber, year, startDate, endDate, finishedThisWeek, stats, reflectionHighlights }) {
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
  
  // Reflection highlights
  if (reflectionHighlights.length > 0) {
    content += `## 💭 Reflection Highlights\n\n`;
    reflectionHighlights.forEach(({ book, author, highlights }) => {
      content += `### ${book} by ${author}\n`;
      highlights.forEach(highlight => {
        content += `**${highlight.section}**: ${highlight.content}\n\n`;
      });
    });
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