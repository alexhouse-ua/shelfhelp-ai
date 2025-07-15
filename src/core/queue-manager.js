/**
 * Queue Management Module for ShelfHelp AI
 * Handles TBR queue operations, prioritization, and analytics
 */

const fs = require('fs').promises;
const logger = require('../../scripts/core/logger');

class QueueManager {
  constructor(booksFilePath, preferenceLearning, readingInsights) {
    this.booksFilePath = booksFilePath;
    this.preferenceLearning = preferenceLearning;
    this.readingInsights = readingInsights;
  }

  async getQueue(req, res) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const queueBooks = books.filter(book => book.status === 'tbr');
      
      logger.info('Queue retrieved', {
        totalBooks: books.length,
        queueSize: queueBooks.length,
        operation: 'get_queue'
      });
      
      res.json({
        queue: queueBooks,
        total_books: books.length,
        queue_size: queueBooks.length,
        status_breakdown: this._getStatusBreakdown(books)
      });
    } catch (error) {
      logger.error('Failed to retrieve queue', { 
        error: error.message,
        operation: 'get_queue' 
      });
      res.status(500).json({ 
        error: 'Failed to retrieve queue', 
        message: error.message 
      });
    }
  }

  async getSmartQueue(req, res) {
    try {
      const { limit = 10, prioritize = 'balanced' } = req.query;
      
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const tbrBooks = books.filter(book => book.status === 'tbr');
      
      // Get user preferences for scoring
      const preferences = await this.preferenceLearning.getPreferences();
      
      // Score and sort books
      const scoredBooks = tbrBooks.map(book => ({
        ...book,
        priority_score: this._calculatePriorityScore(book, preferences, prioritize)
      })).sort((a, b) => b.priority_score - a.priority_score);
      
      const limitedQueue = scoredBooks.slice(0, parseInt(limit));
      
      logger.info('Smart queue generated', {
        totalTbr: tbrBooks.length,
        returnedBooks: limitedQueue.length,
        prioritization: prioritize,
        operation: 'get_smart_queue'
      });
      
      res.json({
        message: 'Smart TBR queue generated based on preferences',
        queue: limitedQueue,
        metadata: {
          total_tbr: tbrBooks.length,
          returned: limitedQueue.length,
          prioritization_method: prioritize,
          scoring_factors: this._getScoringFactors(prioritize)
        },
        insights: {
          top_genres: this._getTopGenres(limitedQueue),
          avg_score: this._getAverageScore(limitedQueue),
          score_distribution: this._getScoreDistribution(limitedQueue)
        }
      });
    } catch (error) {
      logger.error('Failed to generate smart queue', { 
        error: error.message,
        prioritize: req.query.prioritize,
        operation: 'get_smart_queue' 
      });
      res.status(500).json({ 
        error: 'Failed to generate smart queue', 
        message: error.message 
      });
    }
  }

  async getTbrQueue(req, res) {
    try {
      const { 
        sort = 'priority', 
        limit = 20, 
        genre, 
        min_score, 
        include_analytics = 'true' 
      } = req.query;
      
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      let tbrBooks = books.filter(book => book.status === 'tbr');
      
      // Apply filters
      if (genre) {
        tbrBooks = tbrBooks.filter(book => 
          book.genre?.toLowerCase().includes(genre.toLowerCase())
        );
      }
      
      // Get preferences for scoring
      const preferences = await this.preferenceLearning.getPreferences();
      
      // Add preference scores
      tbrBooks = tbrBooks.map(book => {
        const score = this._calculatePreferenceScore(book, preferences);
        return {
          ...book,
          preference_score: score,
          priority_factors: this._getPriorityFactors(book, preferences)
        };
      });
      
      // Apply score filter
      if (min_score) {
        const minScoreNum = parseFloat(min_score);
        tbrBooks = tbrBooks.filter(book => book.preference_score >= minScoreNum);
      }
      
      // Sort books
      tbrBooks = this._sortBooks(tbrBooks, sort);
      
      // Apply limit
      const limitNum = parseInt(limit);
      const limitedBooks = tbrBooks.slice(0, limitNum);
      
      const response = {
        message: 'TBR queue with intelligent prioritization',
        queue: limitedBooks,
        metadata: {
          total_tbr: books.filter(book => book.status === 'tbr').length,
          filtered: tbrBooks.length,
          returned: limitedBooks.length,
          sort_method: sort,
          filters_applied: { genre, min_score }
        }
      };
      
      // Add analytics if requested
      if (include_analytics === 'true') {
        response.analytics = await this._getQueueAnalytics(tbrBooks, preferences);
      }
      
      logger.info('TBR queue retrieved with prioritization', {
        totalTbr: response.metadata.total_tbr,
        filtered: response.metadata.filtered,
        returned: response.metadata.returned,
        sort: sort,
        operation: 'get_tbr_queue'
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to retrieve TBR queue', { 
        error: error.message,
        operation: 'get_tbr_queue' 
      });
      res.status(500).json({ 
        error: 'Failed to retrieve TBR queue', 
        message: error.message 
      });
    }
  }

  async reorderQueue(req, res) {
    try {
      const { book_id, new_position, reason } = req.body;
      
      if (!book_id || new_position === undefined) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'book_id and new_position are required'
        });
      }
      
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const bookIndex = books.findIndex(book => book.id === book_id);
      if (bookIndex === -1) {
        return res.status(404).json({
          error: 'Book not found',
          message: `Book with ID ${book_id} not found`
        });
      }
      
      // Update queue position
      books[bookIndex].queue_position = new_position;
      books[bookIndex].queue_updated = new Date().toISOString();
      books[bookIndex].queue_reason = reason || 'Manual reorder';
      
      // Write back to file
      await fs.writeFile(this.booksFilePath, JSON.stringify(books, null, 2));
      
      logger.info('Queue reordered', {
        bookId: book_id,
        newPosition: new_position,
        reason: reason,
        operation: 'reorder_queue'
      });
      
      res.json({
        message: 'Queue position updated successfully',
        book: books[bookIndex],
        new_position: new_position,
        reason: reason || 'Manual reorder'
      });
    } catch (error) {
      logger.error('Failed to reorder queue', { 
        error: error.message,
        bookId: req.body.book_id,
        operation: 'reorder_queue' 
      });
      res.status(500).json({ 
        error: 'Failed to reorder queue', 
        message: error.message 
      });
    }
  }

  async promoteBook(req, res) {
    try {
      const { book_id, reason } = req.body;
      
      if (!book_id) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'book_id is required'
        });
      }
      
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const bookIndex = books.findIndex(book => book.id === book_id);
      if (bookIndex === -1) {
        return res.status(404).json({
          error: 'Book not found',
          message: `Book with ID ${book_id} not found`
        });
      }
      
      // Promote to top of queue (position 1)
      books[bookIndex].queue_position = 1;
      books[bookIndex].queue_updated = new Date().toISOString();
      books[bookIndex].queue_reason = reason || 'Promoted to top priority';
      books[bookIndex].promoted = true;
      books[bookIndex].promoted_date = new Date().toISOString();
      
      // Write back to file
      await fs.writeFile(this.booksFilePath, JSON.stringify(books, null, 2));
      
      logger.info('Book promoted to top priority', {
        bookId: book_id,
        title: books[bookIndex].title,
        reason: reason,
        operation: 'promote_book'
      });
      
      res.json({
        message: 'Book promoted to top priority',
        book: books[bookIndex],
        promoted_to: 1,
        reason: reason || 'Promoted to top priority'
      });
    } catch (error) {
      logger.error('Failed to promote book', { 
        error: error.message,
        bookId: req.body.book_id,
        operation: 'promote_book' 
      });
      res.status(500).json({ 
        error: 'Failed to promote book', 
        message: error.message 
      });
    }
  }

  async getQueueInsights(req, res) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const tbrBooks = books.filter(book => book.status === 'tbr');
      const preferences = await this.preferenceLearning.getPreferences();
      
      const insights = {
        queue_health: await this._analyzeQueueHealth(tbrBooks),
        preference_alignment: await this._analyzePreferenceAlignment(tbrBooks, preferences),
        diversity_analysis: this._analyzeDiversity(tbrBooks),
        seasonal_recommendations: this._getSeasonalRecommendations(tbrBooks),
        burnout_prevention: this._analyzeBurnoutRisk(tbrBooks),
        optimization_suggestions: this._getOptimizationSuggestions(tbrBooks, preferences)
      };
      
      logger.info('Queue insights generated', {
        queueSize: tbrBooks.length,
        healthScore: insights.queue_health.overall_score,
        alignmentScore: insights.preference_alignment.alignment_score,
        operation: 'get_queue_insights'
      });
      
      res.json({
        message: 'Comprehensive queue analysis and insights',
        queue_size: tbrBooks.length,
        insights: insights,
        recommendations: {
          immediate_actions: this._getImmediateActions(insights),
          long_term_strategies: this._getLongTermStrategies(insights)
        }
      });
    } catch (error) {
      logger.error('Failed to generate queue insights', { 
        error: error.message,
        operation: 'get_queue_insights' 
      });
      res.status(500).json({ 
        error: 'Failed to generate queue insights', 
        message: error.message 
      });
    }
  }

  // Helper methods
  _calculatePriorityScore(book, preferences, method) {
    let score = 0;
    
    switch (method) {
      case 'preference_match':
        score = this._calculatePreferenceScore(book, preferences);
        break;
      case 'chronological':
        score = new Date(book.date_added).getTime() / 1000000000; // Normalize timestamp
        break;
      case 'balanced':
      default:
        score = (this._calculatePreferenceScore(book, preferences) * 0.7) + 
                (this._calculateRecencyScore(book) * 0.3);
        break;
    }
    
    return Math.round(score * 100) / 100;
  }

  _calculatePreferenceScore(book, preferences) {
    if (!preferences || !book) return 0.5;
    
    let score = 0.5; // Base score
    
    // Genre preference
    if (book.genre && preferences.favorite_genres?.includes(book.genre)) {
      score += 0.3;
    }
    
    // Author preference
    if (book.author && preferences.favorite_authors?.includes(book.author)) {
      score += 0.2;
    }
    
    // Trope preference
    if (book.tropes && preferences.favorite_tropes) {
      const tropeMatches = book.tropes.filter(trope => 
        preferences.favorite_tropes.includes(trope)
      ).length;
      score += (tropeMatches / Math.max(book.tropes.length, 1)) * 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  _calculateRecencyScore(book) {
    if (!book.date_added) return 0.5;
    
    const daysSinceAdded = (Date.now() - new Date(book.date_added).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - (daysSinceAdded / 365)); // Decay over a year
  }

  _sortBooks(books, method) {
    switch (method) {
      case 'score':
        return books.sort((a, b) => b.preference_score - a.preference_score);
      case 'date_added':
        return books.sort((a, b) => new Date(a.date_added) - new Date(b.date_added));
      case 'title':
        return books.sort((a, b) => a.title.localeCompare(b.title));
      case 'author':
        return books.sort((a, b) => a.author.localeCompare(b.author));
      case 'priority':
      default:
        return books.sort((a, b) => (b.queue_position || 999) - (a.queue_position || 999));
    }
  }

  _getStatusBreakdown(books) {
    const breakdown = {};
    books.forEach(book => {
      breakdown[book.status] = (breakdown[book.status] || 0) + 1;
    });
    return breakdown;
  }

  _getScoringFactors(method) {
    const factors = {
      preference_match: ['genre_preference', 'author_preference', 'trope_preference'],
      chronological: ['date_added'],
      balanced: ['preference_score (70%)', 'recency_score (30%)']
    };
    return factors[method] || factors.balanced;
  }

  _getTopGenres(books) {
    const genreCounts = {};
    books.forEach(book => {
      if (book.genre) {
        genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
      }
    });
    return Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre, count]) => ({ genre, count }));
  }

  _getAverageScore(books) {
    if (books.length === 0) return 0;
    const sum = books.reduce((acc, book) => acc + (book.priority_score || 0), 0);
    return Math.round((sum / books.length) * 100) / 100;
  }

  _getScoreDistribution(books) {
    const ranges = { high: 0, medium: 0, low: 0 };
    books.forEach(book => {
      const score = book.priority_score || 0;
      if (score >= 0.7) ranges.high++;
      else if (score >= 0.4) ranges.medium++;
      else ranges.low++;
    });
    return ranges;
  }

  async _getQueueAnalytics(books, preferences) {
    return {
      size_analysis: {
        total: books.length,
        optimal_range: '10-25 books',
        current_status: books.length < 10 ? 'too_small' : books.length > 25 ? 'too_large' : 'optimal'
      },
      preference_distribution: this._analyzePreferenceDistribution(books, preferences),
      estimated_reading_time: this._estimateReadingTime(books),
      diversity_score: this._calculateDiversityScore(books)
    };
  }

  _analyzePreferenceDistribution(books, preferences) {
    // Simplified analysis - would be more complex in real implementation
    return {
      high_match: books.filter(b => this._calculatePreferenceScore(b, preferences) > 0.7).length,
      medium_match: books.filter(b => {
        const score = this._calculatePreferenceScore(b, preferences);
        return score >= 0.4 && score <= 0.7;
      }).length,
      low_match: books.filter(b => this._calculatePreferenceScore(b, preferences) < 0.4).length
    };
  }

  _estimateReadingTime(books) {
    // Assume 300 pages average, 1 page per minute
    const avgPages = 300;
    const totalPages = books.length * avgPages;
    const hoursToRead = totalPages / 60;
    return {
      total_books: books.length,
      estimated_pages: totalPages,
      estimated_hours: Math.round(hoursToRead),
      estimated_weeks: Math.round(hoursToRead / 20) // 20 hours reading per week
    };
  }

  _calculateDiversityScore(books) {
    const genres = new Set(books.map(b => b.genre).filter(Boolean));
    const authors = new Set(books.map(b => b.author).filter(Boolean));
    return {
      genre_diversity: genres.size,
      author_diversity: authors.size,
      diversity_score: Math.min((genres.size + authors.size) / books.length, 1.0)
    };
  }

  async _analyzeQueueHealth(books) {
    // Simplified queue health analysis
    return {
      overall_score: 0.85,
      size_health: books.length > 5 && books.length < 30 ? 'good' : 'needs_attention',
      staleness: this._analyzeStaleness(books),
      balance: this._analyzeBalance(books)
    };
  }

  async _analyzePreferenceAlignment(books, preferences) {
    const scores = books.map(book => this._calculatePreferenceScore(book, preferences));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      alignment_score: avgScore,
      high_alignment_books: scores.filter(s => s > 0.7).length,
      recommendations: avgScore < 0.6 ? ['Consider curating queue based on preferences'] : []
    };
  }

  _analyzeDiversity(books) {
    const genreCount = new Set(books.map(b => b.genre).filter(Boolean)).size;
    const authorCount = new Set(books.map(b => b.author).filter(Boolean)).size;
    return {
      genre_diversity: genreCount,
      author_diversity: authorCount,
      diversity_ratio: Math.min(genreCount / books.length, 1.0)
    };
  }

  _getSeasonalRecommendations(books) {
    // Simplified seasonal analysis
    return {
      current_season: 'summer',
      recommended_genres: ['contemporary', 'romance', 'beach reads'],
      seasonal_books: books.filter(b => 
        ['contemporary', 'romance'].includes(b.genre?.toLowerCase())
      ).length
    };
  }

  _analyzeBurnoutRisk(books) {
    const sameGenreCount = books.filter(b => b.genre === books[0]?.genre).length;
    const riskLevel = sameGenreCount > books.length * 0.7 ? 'high' : 'low';
    return {
      risk_level: riskLevel,
      same_genre_concentration: sameGenreCount,
      recommendations: riskLevel === 'high' ? ['Add variety to prevent reading burnout'] : []
    };
  }

  _getOptimizationSuggestions(books, preferences) {
    return [
      'Consider promoting high-preference books',
      'Add more diversity to prevent burnout',
      'Review books added over 6 months ago'
    ];
  }

  _getImmediateActions(insights) {
    return [
      'Review queue size optimization',
      'Promote high-preference alignment books',
      'Add seasonal variety if needed'
    ];
  }

  _getLongTermStrategies(insights) {
    return [
      'Maintain 15-20 book queue size',
      'Balance preference matching with discovery',
      'Regular queue health reviews'
    ];
  }

  _analyzeStaleness(books) {
    const oldBooks = books.filter(book => {
      if (!book.date_added) return false;
      const daysSinceAdded = (Date.now() - new Date(book.date_added).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceAdded > 180; // 6 months
    });
    return {
      stale_books: oldBooks.length,
      percentage: books.length > 0 ? (oldBooks.length / books.length * 100).toFixed(1) : 0
    };
  }

  _analyzeBalance(books) {
    const genreDistribution = {};
    books.forEach(book => {
      if (book.genre) {
        genreDistribution[book.genre] = (genreDistribution[book.genre] || 0) + 1;
      }
    });
    
    const maxGenreCount = Math.max(...Object.values(genreDistribution));
    const isBalanced = maxGenreCount < books.length * 0.6; // No genre should be >60%
    
    return {
      is_balanced: isBalanced,
      dominant_genre: Object.keys(genreDistribution).find(genre => 
        genreDistribution[genre] === maxGenreCount
      ),
      distribution: genreDistribution
    };
  }

  _getPriorityFactors(book, preferences) {
    return {
      genre_match: book.genre && preferences.favorite_genres?.includes(book.genre),
      author_match: book.author && preferences.favorite_authors?.includes(book.author),
      recent_addition: this._calculateRecencyScore(book) > 0.7,
      high_preference: this._calculatePreferenceScore(book, preferences) > 0.7
    };
  }
}

module.exports = QueueManager;