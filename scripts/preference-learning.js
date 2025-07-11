const fs = require('fs').promises;
const path = require('path');

// Preference Learning System for ShelfHelp AI
class PreferenceLearningSystem {
  constructor() {
    this.booksFile = path.join(__dirname, '../data/books.json');
    this.preferencesFile = path.join(__dirname, '../data/preferences.json');
    this.books = null;
    this.preferences = null;
    this.loaded = false;
  }

  async loadData() {
    try {
      // Load books
      const booksData = await fs.readFile(this.booksFile, 'utf-8');
      this.books = JSON.parse(booksData);

      // Load or create preferences
      try {
        const prefsData = await fs.readFile(this.preferencesFile, 'utf-8');
        this.preferences = JSON.parse(prefsData);
      } catch (error) {
        this.preferences = this.createEmptyPreferences();
      }

      this.loaded = true;
      console.log('✅ Preference learning system loaded:', {
        books: this.books.length,
        preferences: Object.keys(this.preferences).length
      });
    } catch (error) {
      console.error('❌ Failed to load preference data:', error.message);
      throw error;
    }
  }

  createEmptyPreferences() {
    return {
      genre_preferences: {},
      subgenre_preferences: {},
      trope_preferences: {},
      author_preferences: {},
      tone_preferences: {},
      spice_preferences: {},
      series_preferences: {},
      reading_patterns: {
        reading_velocity: 0,
        completion_rate: 0,
        preferred_length: null,
        seasonal_patterns: {},
        mood_patterns: {}
      },
      recommendation_weights: {
        genre_weight: 0.3,
        trope_weight: 0.25,
        author_weight: 0.2,
        tone_weight: 0.1,
        spice_weight: 0.1,
        novelty_weight: 0.05
      },
      last_updated: new Date().toISOString(),
      learning_confidence: 0
    };
  }

  async ensureLoaded() {
    if (!this.loaded) {
      await this.loadData();
    }
  }

  // Main preference learning function
  async analyzeReadingPatterns() {
    await this.ensureLoaded();
    
    const finishedBooks = this.books.filter(book => 
      book.status === 'Read' && book.user_read_at
    );

    console.log(`📊 Analyzing ${finishedBooks.length} finished books for preferences...`);

    // Analyze each preference category
    this.analyzeGenrePreferences(finishedBooks);
    this.analyzeSubgenrePreferences(finishedBooks);
    this.analyzeTropePreferences(finishedBooks);
    this.analyzeAuthorPreferences(finishedBooks);
    this.analyzeTonePreferences(finishedBooks);
    this.analyzeSpicePreferences(finishedBooks);
    this.analyzeSeriesPreferences(finishedBooks);
    this.analyzeReadingVelocity(finishedBooks);
    this.analyzeMoodPatterns(finishedBooks);

    // Calculate learning confidence
    this.calculateLearningConfidence(finishedBooks);

    // Update timestamps
    this.preferences.last_updated = new Date().toISOString();

    return this.preferences;
  }

  analyzeGenrePreferences(books) {
    const genreCounts = {};
    const genreRatings = {};

    books.forEach(book => {
      if (book.genre) {
        genreCounts[book.genre] = (genreCounts[book.genre] || 0) + 1;
        
        if (book.user_rating) {
          if (!genreRatings[book.genre]) genreRatings[book.genre] = [];
          genreRatings[book.genre].push(book.user_rating);
        }
      }
    });

    // Calculate preference scores
    const totalBooks = books.length;
    this.preferences.genre_preferences = {};

    Object.entries(genreCounts).forEach(([genre, count]) => {
      const frequency = count / totalBooks;
      const avgRating = genreRatings[genre] ? 
        genreRatings[genre].reduce((a, b) => a + b, 0) / genreRatings[genre].length : 0;
      
      this.preferences.genre_preferences[genre] = {
        count: count,
        frequency: frequency,
        avg_rating: avgRating,
        preference_score: frequency * 0.7 + (avgRating / 5) * 0.3,
        last_read: this.getLastReadDate(books, 'genre', genre)
      };
    });
  }

  analyzeSubgenrePreferences(books) {
    const subgenreCounts = {};
    const subgenreRatings = {};

    books.forEach(book => {
      if (book.subgenre) {
        subgenreCounts[book.subgenre] = (subgenreCounts[book.subgenre] || 0) + 1;
        
        if (book.user_rating) {
          if (!subgenreRatings[book.subgenre]) subgenreRatings[book.subgenre] = [];
          subgenreRatings[book.subgenre].push(book.user_rating);
        }
      }
    });

    const totalBooks = books.length;
    this.preferences.subgenre_preferences = {};

    Object.entries(subgenreCounts).forEach(([subgenre, count]) => {
      const frequency = count / totalBooks;
      const avgRating = subgenreRatings[subgenre] ? 
        subgenreRatings[subgenre].reduce((a, b) => a + b, 0) / subgenreRatings[subgenre].length : 0;
      
      this.preferences.subgenre_preferences[subgenre] = {
        count: count,
        frequency: frequency,
        avg_rating: avgRating,
        preference_score: frequency * 0.7 + (avgRating / 5) * 0.3,
        last_read: this.getLastReadDate(books, 'subgenre', subgenre)
      };
    });
  }

  analyzeTropePreferences(books) {
    const tropeCounts = {};
    const tropeRatings = {};

    books.forEach(book => {
      if (book.tropes && Array.isArray(book.tropes)) {
        book.tropes.forEach(trope => {
          tropeCounts[trope] = (tropeCounts[trope] || 0) + 1;
          
          if (book.user_rating) {
            if (!tropeRatings[trope]) tropeRatings[trope] = [];
            tropeRatings[trope].push(book.user_rating);
          }
        });
      }
    });

    const totalBooks = books.length;
    this.preferences.trope_preferences = {};

    Object.entries(tropeCounts).forEach(([trope, count]) => {
      const frequency = count / totalBooks;
      const avgRating = tropeRatings[trope] ? 
        tropeRatings[trope].reduce((a, b) => a + b, 0) / tropeRatings[trope].length : 0;
      
      this.preferences.trope_preferences[trope] = {
        count: count,
        frequency: frequency,
        avg_rating: avgRating,
        preference_score: frequency * 0.6 + (avgRating / 5) * 0.4,
        last_read: this.getLastReadDate(books, 'tropes', trope, true)
      };
    });
  }

  analyzeAuthorPreferences(books) {
    const authorCounts = {};
    const authorRatings = {};

    books.forEach(book => {
      if (book.author_name) {
        authorCounts[book.author_name] = (authorCounts[book.author_name] || 0) + 1;
        
        if (book.user_rating) {
          if (!authorRatings[book.author_name]) authorRatings[book.author_name] = [];
          authorRatings[book.author_name].push(book.user_rating);
        }
      }
    });

    this.preferences.author_preferences = {};

    Object.entries(authorCounts).forEach(([author, count]) => {
      const avgRating = authorRatings[author] ? 
        authorRatings[author].reduce((a, b) => a + b, 0) / authorRatings[author].length : 0;
      
      // Only track authors with multiple books or high ratings
      if (count > 1 || avgRating >= 4) {
        this.preferences.author_preferences[author] = {
          count: count,
          avg_rating: avgRating,
          preference_score: count * 0.4 + (avgRating / 5) * 0.6,
          last_read: this.getLastReadDate(books, 'author_name', author)
        };
      }
    });
  }

  analyzeTonePreferences(books) {
    const toneCounts = {};
    const toneRatings = {};

    books.forEach(book => {
      if (book.tone) {
        toneCounts[book.tone] = (toneCounts[book.tone] || 0) + 1;
        
        if (book.user_rating) {
          if (!toneRatings[book.tone]) toneRatings[book.tone] = [];
          toneRatings[book.tone].push(book.user_rating);
        }
      }
    });

    const totalBooks = books.length;
    this.preferences.tone_preferences = {};

    Object.entries(toneCounts).forEach(([tone, count]) => {
      const frequency = count / totalBooks;
      const avgRating = toneRatings[tone] ? 
        toneRatings[tone].reduce((a, b) => a + b, 0) / toneRatings[tone].length : 0;
      
      this.preferences.tone_preferences[tone] = {
        count: count,
        frequency: frequency,
        avg_rating: avgRating,
        preference_score: frequency * 0.5 + (avgRating / 5) * 0.5
      };
    });
  }

  analyzeSpicePreferences(books) {
    const spiceCounts = {};
    const spiceRatings = {};

    books.forEach(book => {
      if (book.spice !== null && book.spice !== undefined) {
        const spiceLevel = book.spice.toString();
        spiceCounts[spiceLevel] = (spiceCounts[spiceLevel] || 0) + 1;
        
        if (book.user_rating) {
          if (!spiceRatings[spiceLevel]) spiceRatings[spiceLevel] = [];
          spiceRatings[spiceLevel].push(book.user_rating);
        }
      }
    });

    this.preferences.spice_preferences = {};

    Object.entries(spiceCounts).forEach(([spiceLevel, count]) => {
      const avgRating = spiceRatings[spiceLevel] ? 
        spiceRatings[spiceLevel].reduce((a, b) => a + b, 0) / spiceRatings[spiceLevel].length : 0;
      
      this.preferences.spice_preferences[spiceLevel] = {
        count: count,
        avg_rating: avgRating,
        preference_score: (avgRating / 5) * 0.8 + (count / books.length) * 0.2
      };
    });
  }

  analyzeSeriesPreferences(books) {
    const seriesBooks = books.filter(book => book.series_name);
    const standaloneBooks = books.filter(book => !book.series_name);
    
    const seriesAvgRating = seriesBooks.length > 0 ? 
      seriesBooks.reduce((sum, book) => sum + (book.user_rating || 0), 0) / seriesBooks.length : 0;
    const standaloneAvgRating = standaloneBooks.length > 0 ? 
      standaloneBooks.reduce((sum, book) => sum + (book.user_rating || 0), 0) / standaloneBooks.length : 0;

    this.preferences.series_preferences = {
      series_books: seriesBooks.length,
      standalone_books: standaloneBooks.length,
      series_avg_rating: seriesAvgRating,
      standalone_avg_rating: standaloneAvgRating,
      prefers_series: seriesAvgRating > standaloneAvgRating && seriesBooks.length > standaloneBooks.length
    };
  }

  analyzeReadingVelocity(books) {
    // Ensure reading_patterns exists
    if (!this.preferences.reading_patterns) {
      this.preferences.reading_patterns = {};
    }

    const booksWithDates = books.filter(book => book.user_read_at && book.user_date_added);
    
    if (booksWithDates.length > 1) {
      // Sort by read date
      booksWithDates.sort((a, b) => new Date(a.user_read_at) - new Date(b.user_read_at));
      
      // Calculate reading intervals
      const intervals = [];
      for (let i = 1; i < booksWithDates.length; i++) {
        const prevDate = new Date(booksWithDates[i-1].user_read_at);
        const currentDate = new Date(booksWithDates[i].user_read_at);
        const daysBetween = (currentDate - prevDate) / (1000 * 60 * 60 * 24);
        intervals.push(daysBetween);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const booksPerWeek = 7 / avgInterval;
      
      this.preferences.reading_patterns.reading_velocity = booksPerWeek;
      this.preferences.reading_patterns.completion_rate = books.length / 365; // rough estimate
    } else {
      this.preferences.reading_patterns.reading_velocity = 0;
      this.preferences.reading_patterns.completion_rate = 0;
    }
  }

  analyzeMoodPatterns(books) {
    // Ensure reading_patterns exists
    if (!this.preferences.reading_patterns) {
      this.preferences.reading_patterns = {};
    }

    // Analyze seasonal patterns
    const monthCounts = {};
    books.forEach(book => {
      if (book.user_read_at) {
        const month = new Date(book.user_read_at).getMonth();
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }
    });
    
    this.preferences.reading_patterns.seasonal_patterns = monthCounts;
    
    // Identify most productive months
    if (Object.keys(monthCounts).length > 0) {
      const maxMonth = Object.entries(monthCounts).reduce((a, b) => 
        monthCounts[a[0]] > monthCounts[b[0]] ? a : b, [0, 0]
      );
      
      this.preferences.reading_patterns.most_productive_month = parseInt(maxMonth[0]);
    }
  }

  calculateLearningConfidence(books) {
    let confidence = 0;
    
    // Base confidence on number of books
    if (books.length >= 100) confidence += 0.4;
    else if (books.length >= 50) confidence += 0.3;
    else if (books.length >= 20) confidence += 0.2;
    else confidence += 0.1;
    
    // Increase confidence with ratings
    const ratedBooks = books.filter(book => book.user_rating);
    if (ratedBooks.length >= books.length * 0.5) confidence += 0.2;
    else if (ratedBooks.length >= books.length * 0.3) confidence += 0.1;
    
    // Increase confidence with classified books
    const classifiedBooks = books.filter(book => book.genre && book.tropes);
    if (classifiedBooks.length >= books.length * 0.8) confidence += 0.3;
    else if (classifiedBooks.length >= books.length * 0.5) confidence += 0.2;
    else if (classifiedBooks.length >= books.length * 0.3) confidence += 0.1;
    
    // Increase confidence with time span
    const dateRange = this.getDateRange(books);
    if (dateRange >= 365) confidence += 0.1;
    
    this.preferences.learning_confidence = Math.min(confidence, 1.0);
  }

  getDateRange(books) {
    const dates = books
      .filter(book => book.user_read_at)
      .map(book => new Date(book.user_read_at))
      .sort((a, b) => a - b);
    
    if (dates.length >= 2) {
      return (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
    }
    return 0;
  }

  getLastReadDate(books, field, value, isArray = false) {
    const matchingBooks = books.filter(book => {
      if (isArray && book[field] && Array.isArray(book[field])) {
        return book[field].includes(value);
      }
      return book[field] === value;
    });
    
    if (matchingBooks.length === 0) return null;
    
    return matchingBooks
      .filter(book => book.user_read_at)
      .map(book => book.user_read_at)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  }

  // Generate personalized recommendations based on learned preferences
  generateRecommendationProfile(options = {}) {
    const {
      includeNovelty = true,
      moodContext = null,
      timeConstraints = null
    } = options;

    const profile = {
      preferred_genres: this.getTopPreferences('genre_preferences', 5),
      preferred_tropes: this.getTopPreferences('trope_preferences', 10),
      preferred_authors: this.getTopPreferences('author_preferences', 5),
      avoid_genres: this.getBottomPreferences('genre_preferences', 2),
      avoid_tropes: this.getBottomPreferences('trope_preferences', 3),
      spice_range: this.getSpiceRange(),
      series_preference: this.preferences.series_preferences.prefers_series,
      novelty_factor: includeNovelty ? 0.2 : 0,
      confidence: this.preferences.learning_confidence
    };

    return profile;
  }

  getTopPreferences(category, limit) {
    if (!this.preferences[category]) return [];
    
    return Object.entries(this.preferences[category])
      .sort((a, b) => b[1].preference_score - a[1].preference_score)
      .slice(0, limit)
      .map(([key, data]) => ({
        name: key,
        score: data.preference_score,
        count: data.count,
        avg_rating: data.avg_rating
      }));
  }

  getBottomPreferences(category, limit) {
    if (!this.preferences[category]) return [];
    
    return Object.entries(this.preferences[category])
      .filter(([key, data]) => data.avg_rating < 3.0 || data.count === 1)
      .sort((a, b) => a[1].preference_score - b[1].preference_score)
      .slice(0, limit)
      .map(([key, data]) => ({
        name: key,
        score: data.preference_score,
        reason: data.avg_rating < 3.0 ? 'low_rating' : 'rarely_read'
      }));
  }

  getSpiceRange() {
    if (!this.preferences.spice_preferences) return { min: 1, max: 5 };
    
    const spiceScores = Object.entries(this.preferences.spice_preferences)
      .map(([level, data]) => ({
        level: parseInt(level),
        score: data.preference_score
      }))
      .sort((a, b) => b.score - a.score);
    
    if (spiceScores.length === 0) return { min: 1, max: 5 };
    
    const topSpice = spiceScores[0];
    return {
      preferred: topSpice.level,
      min: Math.max(1, topSpice.level - 1),
      max: Math.min(5, topSpice.level + 1)
    };
  }

  async savePreferences() {
    try {
      await fs.writeFile(
        this.preferencesFile, 
        JSON.stringify(this.preferences, null, 2), 
        'utf-8'
      );
      console.log('✅ Preferences saved successfully');
    } catch (error) {
      console.error('❌ Failed to save preferences:', error.message);
      throw error;
    }
  }

  // Get insights for user display
  getPreferenceInsights() {
    const insights = [];
    
    // Genre insights
    const topGenres = this.getTopPreferences('genre_preferences', 3);
    if (topGenres.length > 0) {
      insights.push({
        type: 'genre_preference',
        message: `You read primarily ${topGenres[0].name} (${(topGenres[0].score * 100).toFixed(0)}% preference score)`,
        data: topGenres
      });
    }
    
    // Trope insights
    const topTropes = this.getTopPreferences('trope_preferences', 3);
    if (topTropes.length > 0) {
      insights.push({
        type: 'trope_preference',
        message: `Your favorite tropes: ${topTropes.map(t => t.name).join(', ')}`,
        data: topTropes
      });
    }
    
    // Reading velocity
    const velocity = this.preferences.reading_patterns.reading_velocity;
    if (velocity > 0) {
      insights.push({
        type: 'reading_pace',
        message: `You read approximately ${velocity.toFixed(1)} books per week`,
        data: { books_per_week: velocity }
      });
    }
    
    // Series preference
    if (this.preferences.series_preferences.prefers_series) {
      insights.push({
        type: 'series_preference',
        message: 'You prefer series over standalone books',
        data: this.preferences.series_preferences
      });
    }
    
    return insights;
  }
}

// Export for use in other modules
module.exports = { PreferenceLearningSystem };

// CLI interface for testing
if (require.main === module) {
  async function testPreferenceLearning() {
    const learner = new PreferenceLearningSystem();
    
    try {
      console.log('🔍 Testing Preference Learning System\n');
      
      // Load and analyze
      await learner.loadData();
      const preferences = await learner.analyzeReadingPatterns();
      
      console.log('\n📊 Learning Results:');
      console.log(`Confidence: ${(preferences.learning_confidence * 100).toFixed(1)}%`);
      
      // Show top preferences
      console.log('\n🎯 Top Genre Preferences:');
      learner.getTopPreferences('genre_preferences', 5).forEach((pref, i) => {
        console.log(`${i + 1}. ${pref.name}: ${(pref.score * 100).toFixed(1)}% (${pref.count} books)`);
      });
      
      console.log('\n💕 Top Trope Preferences:');
      learner.getTopPreferences('trope_preferences', 5).forEach((pref, i) => {
        console.log(`${i + 1}. ${pref.name}: ${(pref.score * 100).toFixed(1)}% (${pref.count} books)`);
      });
      
      // Generate recommendation profile
      const profile = learner.generateRecommendationProfile();
      console.log('\n🎯 Recommendation Profile Generated');
      console.log(`Preferred spice range: ${profile.spice_range.min}-${profile.spice_range.max}`);
      console.log(`Series preference: ${profile.series_preference ? 'Yes' : 'No'}`);
      
      // Show insights
      console.log('\n💡 Preference Insights:');
      learner.getPreferenceInsights().forEach(insight => {
        console.log(`• ${insight.message}`);
      });
      
      // Save preferences
      await learner.savePreferences();
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }
  
  testPreferenceLearning();
}