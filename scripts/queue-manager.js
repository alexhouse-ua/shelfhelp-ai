const fs = require('fs').promises;
const path = require('path');

// Constants for queue priority calculation
const PRIORITY_WEIGHTS = {
  LIBRARY_DUE: 100,      // Library books due soon
  KU_EXPIRES: 80,        // Kindle Unlimited expiring
  BOOK_CLUB: 90,         // Book club deadlines
  SERIES_CONTINUITY: 70, // Next book in series
  USER_PREFERENCE: 60,   // Based on user preferences
  QUEUE_POSITION: 50,    // Manual queue position
  BACKLOG_PENALTY: -10   // Penalty for old books
};

const URGENCY_THRESHOLDS = {
  CRITICAL: 7,  // Days until due
  HIGH: 14,
  MEDIUM: 30,
  LOW: 60
};

/**
 * Calculate queue position based on priority scores
 * @param {Array} books - Array of book objects
 * @param {Object} preferences - User preferences object
 * @returns {Array} Books with updated queue_position and queue_priority
 */
function calculateQueuePositions(books, preferences = {}) {
  const tbrBooks = books.filter(book => book.status === 'TBR');
  
  // Calculate priority scores for each book
  const booksWithPriority = tbrBooks.map(book => ({
    ...book,
    queue_priority: calculatePriorityScore(book, preferences, tbrBooks)
  }));
  
  // Sort by priority score (highest first)
  booksWithPriority.sort((a, b) => b.queue_priority - a.queue_priority);
  
  // Assign queue positions
  booksWithPriority.forEach((book, index) => {
    book.queue_position = index + 1;
  });
  
  return booksWithPriority;
}

/**
 * Calculate priority score for a single book
 * @param {Object} book - Book object
 * @param {Object} preferences - User preferences
 * @param {Array} allTbrBooks - All TBR books for context
 * @returns {number} Priority score
 */
function calculatePriorityScore(book, preferences, allTbrBooks) {
  let score = 0;
  const now = new Date();
  
  // 1. Library due date urgency
  if (book.library_due_date) {
    const dueDate = new Date(book.library_due_date);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue <= URGENCY_THRESHOLDS.CRITICAL) {
      score += PRIORITY_WEIGHTS.LIBRARY_DUE;
    } else if (daysUntilDue <= URGENCY_THRESHOLDS.HIGH) {
      score += PRIORITY_WEIGHTS.LIBRARY_DUE * 0.8;
    } else if (daysUntilDue <= URGENCY_THRESHOLDS.MEDIUM) {
      score += PRIORITY_WEIGHTS.LIBRARY_DUE * 0.6;
    } else if (daysUntilDue <= URGENCY_THRESHOLDS.LOW) {
      score += PRIORITY_WEIGHTS.LIBRARY_DUE * 0.4;
    }
  }
  
  // 2. Kindle Unlimited expiration
  if (book.ku_expires_on) {
    const expiryDate = new Date(book.ku_expires_on);
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry <= URGENCY_THRESHOLDS.CRITICAL) {
      score += PRIORITY_WEIGHTS.KU_EXPIRES;
    } else if (daysUntilExpiry <= URGENCY_THRESHOLDS.HIGH) {
      score += PRIORITY_WEIGHTS.KU_EXPIRES * 0.8;
    } else if (daysUntilExpiry <= URGENCY_THRESHOLDS.MEDIUM) {
      score += PRIORITY_WEIGHTS.KU_EXPIRES * 0.6;
    }
  }
  
  // 3. Book club deadlines
  if (book.book_club_deadline) {
    const clubDate = new Date(book.book_club_deadline);
    const daysUntilClub = Math.ceil((clubDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilClub <= URGENCY_THRESHOLDS.CRITICAL) {
      score += PRIORITY_WEIGHTS.BOOK_CLUB;
    } else if (daysUntilClub <= URGENCY_THRESHOLDS.HIGH) {
      score += PRIORITY_WEIGHTS.BOOK_CLUB * 0.8;
    } else if (daysUntilClub <= URGENCY_THRESHOLDS.MEDIUM) {
      score += PRIORITY_WEIGHTS.BOOK_CLUB * 0.6;
    }
  }
  
  // 4. Series continuity
  if (book.series_name && book.series_number) {
    const seriesBooks = allTbrBooks.filter(b => 
      b.series_name === book.series_name && b.series_number
    );
    
    if (seriesBooks.length > 1) {
      const sortedSeries = seriesBooks.sort((a, b) => a.series_number - b.series_number);
      const nextInSeries = sortedSeries[0];
      
      if (book.goodreads_id === nextInSeries.goodreads_id) {
        score += PRIORITY_WEIGHTS.SERIES_CONTINUITY;
      }
    }
  }
  
  // 5. User preferences matching\n  if (preferences && Object.keys(preferences).length > 0) {\n    score += calculatePreferenceScore(book, preferences);\n  }\n  \n  // 6. Manual queue position (if set)\n  if (book.queue_position && typeof book.queue_position === 'number') {\n    // Higher position = lower priority, so invert\n    const positionScore = Math.max(0, PRIORITY_WEIGHTS.QUEUE_POSITION - (book.queue_position * 2));\n    score += positionScore;\n  }\n  \n  // 7. Backlog penalty (older books get slight penalty)\n  if (book.added_at) {\n    const addedDate = new Date(book.added_at);\n    const daysInTbr = Math.ceil((now - addedDate) / (1000 * 60 * 60 * 24));\n    \n    if (daysInTbr > 90) {\n      score += PRIORITY_WEIGHTS.BACKLOG_PENALTY * Math.floor(daysInTbr / 30);\n    }\n  }\n  \n  // 8. Availability urgency\n  if (book.availability_source) {\n    if (book.availability_source === 'library' && book.library_due_date) {\n      score += 20; // Slight boost for available library books\n    } else if (book.availability_source === 'ku' && book.ku_expires_on) {\n      score += 15; // Slight boost for available KU books\n    }\n  }\n  \n  return Math.max(0, Math.round(score));\n}\n\n/**\n * Calculate preference-based score\n * @param {Object} book - Book object\n * @param {Object} preferences - User preferences\n * @returns {number} Preference score\n */\nfunction calculatePreferenceScore(book, preferences) {\n  let score = 0;\n  \n  // Genre preferences\n  if (book.genre && preferences.genres) {\n    const genreScore = preferences.genres[book.genre] || 0;\n    score += genreScore * 10;\n  }\n  \n  // Author preferences\n  if (book.author_name && preferences.authors) {\n    const authorScore = preferences.authors[book.author_name] || 0;\n    score += authorScore * 15;\n  }\n  \n  // Trope preferences\n  if (book.tropes && Array.isArray(book.tropes) && preferences.tropes) {\n    const tropeScore = book.tropes.reduce((sum, trope) => {\n      return sum + (preferences.tropes[trope] || 0);\n    }, 0);\n    score += tropeScore * 5;\n  }\n  \n  // Spice level preferences\n  if (book.spice && preferences.spice_preference) {\n    const spiceDiff = Math.abs(book.spice - preferences.spice_preference);\n    score += Math.max(0, 20 - (spiceDiff * 5));\n  }\n  \n  // Length preferences (if available)\n  if (book.pages && preferences.page_preference) {\n    const pageDiff = Math.abs(book.pages - preferences.page_preference);\n    const lengthScore = Math.max(0, 10 - (pageDiff / 100));\n    score += lengthScore;\n  }\n  \n  return score;\n}\n\n/**\n * Get next recommended book from queue\n * @param {Array} books - Array of book objects\n * @param {Object} preferences - User preferences\n * @param {Object} options - Additional options\n * @returns {Object} Next recommended book with reasoning\n */\nfunction getNextRecommendation(books, preferences = {}, options = {}) {\n  const queuedBooks = calculateQueuePositions(books, preferences);\n  \n  if (queuedBooks.length === 0) {\n    return {\n      book: null,\n      reasoning: 'No books in TBR queue',\n      queue_stats: {\n        total_tbr: 0,\n        urgent_books: 0,\n        available_books: 0\n      }\n    };\n  }\n  \n  const nextBook = queuedBooks[0];\n  const reasoning = generateRecommendationReasoning(nextBook, queuedBooks, preferences);\n  \n  const queue_stats = {\n    total_tbr: queuedBooks.length,\n    urgent_books: queuedBooks.filter(b => b.queue_priority > 80).length,\n    available_books: queuedBooks.filter(b => b.availability_source).length,\n    average_priority: Math.round(queuedBooks.reduce((sum, b) => sum + b.queue_priority, 0) / queuedBooks.length)\n  };\n  \n  return {\n    book: nextBook,\n    reasoning,\n    queue_stats\n  };\n}\n\n/**\n * Generate human-readable reasoning for recommendation\n * @param {Object} book - Recommended book\n * @param {Array} allBooks - All queued books\n * @param {Object} preferences - User preferences\n * @returns {string} Reasoning text\n */\nfunction generateRecommendationReasoning(book, allBooks, preferences) {\n  const reasons = [];\n  \n  // Check for urgency factors\n  const now = new Date();\n  \n  if (book.library_due_date) {\n    const dueDate = new Date(book.library_due_date);\n    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));\n    \n    if (daysUntilDue <= 7) {\n      reasons.push(`📚 Library book due in ${daysUntilDue} days`);\n    } else if (daysUntilDue <= 14) {\n      reasons.push(`📚 Library book due in ${daysUntilDue} days`);\n    }\n  }\n  \n  if (book.ku_expires_on) {\n    const expiryDate = new Date(book.ku_expires_on);\n    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));\n    \n    if (daysUntilExpiry <= 14) {\n      reasons.push(`📖 Kindle Unlimited expires in ${daysUntilExpiry} days`);\n    }\n  }\n  \n  if (book.book_club_deadline) {\n    const clubDate = new Date(book.book_club_deadline);\n    const daysUntilClub = Math.ceil((clubDate - now) / (1000 * 60 * 60 * 24));\n    \n    if (daysUntilClub <= 30) {\n      reasons.push(`👥 Book club discussion in ${daysUntilClub} days`);\n    }\n  }\n  \n  // Check for series continuity\n  if (book.series_name) {\n    const seriesBooks = allBooks.filter(b => b.series_name === book.series_name);\n    if (seriesBooks.length > 1) {\n      reasons.push(`📚 Next book in ${book.series_name} series`);\n    }\n  }\n  \n  // Check preferences match\n  if (preferences && Object.keys(preferences).length > 0) {\n    if (book.genre && preferences.genres && preferences.genres[book.genre] > 0.7) {\n      reasons.push(`⭐ Matches your preference for ${book.genre}`);\n    }\n    \n    if (book.author_name && preferences.authors && preferences.authors[book.author_name] > 0.7) {\n      reasons.push(`✍️ Favorite author: ${book.author_name}`);\n    }\n  }\n  \n  // Availability\n  if (book.availability_source === 'library') {\n    reasons.push(`📚 Available at library`);\n  } else if (book.availability_source === 'ku') {\n    reasons.push(`📖 Available on Kindle Unlimited`);\n  }\n  \n  if (reasons.length === 0) {\n    reasons.push(`📋 Highest priority in your queue (priority score: ${book.queue_priority})`);\n  }\n  \n  return reasons.join(' • ');\n}\n\n/**\n * Update queue positions for all books\n * @param {Array} books - Array of all books\n * @param {Object} preferences - User preferences\n * @returns {Array} Updated books array\n */\nfunction updateAllQueuePositions(books, preferences = {}) {\n  const tbrBooks = calculateQueuePositions(books, preferences);\n  const otherBooks = books.filter(book => book.status !== 'TBR');\n  \n  // Reset queue positions for non-TBR books\n  otherBooks.forEach(book => {\n    book.queue_position = null;\n    book.queue_priority = null;\n  });\n  \n  return [...tbrBooks, ...otherBooks];\n}\n\n/**\n * Recalculate queue when a book's status changes\n * @param {Array} books - Array of all books\n * @param {string} bookId - ID of the book that changed\n * @param {string} newStatus - New status\n * @param {Object} preferences - User preferences\n * @returns {Array} Updated books array\n */\nfunction handleStatusChange(books, bookId, newStatus, preferences = {}) {\n  const bookIndex = books.findIndex(book => book.goodreads_id === bookId);\n  \n  if (bookIndex === -1) {\n    throw new Error('Book not found');\n  }\n  \n  // Update the book's status\n  books[bookIndex].status = newStatus;\n  books[bookIndex].updated_at = new Date().toISOString();\n  \n  // If moving to TBR, it will get a new queue position\n  // If moving away from TBR, clear queue fields\n  if (newStatus !== 'TBR') {\n    books[bookIndex].queue_position = null;\n    books[bookIndex].queue_priority = null;\n  }\n  \n  // Recalculate all queue positions\n  return updateAllQueuePositions(books, preferences);\n}\n\nmodule.exports = {\n  calculateQueuePositions,\n  calculatePriorityScore,\n  getNextRecommendation,\n  updateAllQueuePositions,\n  handleStatusChange,\n  generateRecommendationReasoning,\n  PRIORITY_WEIGHTS,\n  URGENCY_THRESHOLDS\n};