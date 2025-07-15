const fs = require('fs').promises;
const path = require('path');

// Comprehensive Reading Insights and Pattern Analysis System
class ReadingInsightsSystem {
  constructor() {
    this.booksFile = path.join(__dirname, '../data/books.json');
    this.books = null;
    this.loaded = false;
  }

  async loadData() {
    try {
      const booksData = await fs.readFile(this.booksFile, 'utf-8');
      this.books = JSON.parse(booksData);
      this.loaded = true;
      console.log('✅ Reading insights system loaded:', {
        books: this.books.length
      });
    } catch (error) {
      console.error('❌ Failed to load reading data:', error.message);
      throw error;
    }
  }

  async ensureLoaded() {
    if (!this.loaded) {
      await this.loadData();
    }
  }

  // Generate comprehensive yearly reading insights
  async generateYearlyInsights(year = new Date().getFullYear()) {
    await this.ensureLoaded();
    
    const yearBooks = this.books.filter(book => 
      book.user_read_at && new Date(book.user_read_at).getFullYear() === year
    );

    if (yearBooks.length === 0) {
      return {
        year,
        total_books: 0,
        message: `No books read in ${year}`,
        insights: []
      };
    }

    const insights = {
      year,
      overview: this.generateOverviewStats(yearBooks),
      reading_pace: this.analyzeReadingPace(yearBooks),
      genre_analysis: this.analyzeGenreDistribution(yearBooks),
      author_insights: this.analyzeAuthorPatterns(yearBooks),
      series_tracking: this.analyzeSeriesProgress(yearBooks),
      quality_metrics: this.analyzeQualityMetrics(yearBooks),
      seasonal_patterns: this.analyzeSeasonalPatterns(yearBooks),
      discovery_insights: this.analyzeDiscoveryPatterns(yearBooks),
      recommendations: this.generateInsightRecommendations(yearBooks),
      goals_tracking: this.analyzeGoalsProgress(yearBooks, year)
    };

    return insights;
  }

  generateOverviewStats(books) {
    const totalPages = books.reduce((sum, book) => sum + (book.pages_source || 0), 0);
    const avgPages = totalPages / books.length;
    
    const ratedBooks = books.filter(book => book.user_rating);
    const avgRating = ratedBooks.length > 0 ? 
      ratedBooks.reduce((sum, book) => sum + book.user_rating, 0) / ratedBooks.length : 0;
    
    const datesWithReads = books.filter(book => book.user_read_at);
    let readingStreak = 0;
    if (datesWithReads.length > 0) {
      readingStreak = this.calculateReadingStreak(datesWithReads);
    }

    return {
      total_books: books.length,
      total_pages: totalPages,
      avg_pages_per_book: Math.round(avgPages),
      avg_rating: Math.round(avgRating * 10) / 10,
      books_rated: ratedBooks.length,
      rating_percentage: Math.round((ratedBooks.length / books.length) * 100),
      current_reading_streak: readingStreak,
      pages_per_day: Math.round(totalPages / 365)
    };
  }

  analyzeReadingPace(books) {
    const monthlyBreakdown = {};
    const weeklyBreakdown = {};
    const dailyBreakdown = {};

    books.forEach(book => {
      if (book.user_read_at) {
        const date = new Date(book.user_read_at);
        const month = date.getMonth();
        const week = this.getWeekOfYear(date);
        const day = date.getDay();

        monthlyBreakdown[month] = (monthlyBreakdown[month] || 0) + 1;
        weeklyBreakdown[week] = (weeklyBreakdown[week] || 0) + 1;
        dailyBreakdown[day] = (dailyBreakdown[day] || 0) + 1;
      }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Find patterns
    const busiestMonth = Object.entries(monthlyBreakdown).reduce((a, b) => 
      monthlyBreakdown[a[0]] > monthlyBreakdown[b[0]] ? a : b, [0, 0]
    );

    const busiestDay = Object.entries(dailyBreakdown).reduce((a, b) => 
      dailyBreakdown[a[0]] > dailyBreakdown[b[0]] ? a : b, [0, 0]
    );

    const avgBooksPerMonth = books.length / 12;
    const avgBooksPerWeek = books.length / 52;

    return {
      monthly_breakdown: Object.entries(monthlyBreakdown).map(([month, count]) => ({
        month: monthNames[parseInt(month)],
        month_number: parseInt(month),
        books: count,
        above_average: count > avgBooksPerMonth
      })),
      busiest_month: {
        month: monthNames[parseInt(busiestMonth[0])],
        books: busiestMonth[1]
      },
      preferred_reading_day: {
        day: dayNames[parseInt(busiestDay[0])],
        books: busiestDay[1]
      },
      pace_metrics: {
        avg_books_per_month: Math.round(avgBooksPerMonth * 10) / 10,
        avg_books_per_week: Math.round(avgBooksPerWeek * 10) / 10,
        books_per_quarter: Math.round(books.length / 4)
      }
    };
  }

  analyzeGenreDistribution(books) {
    const genreStats = {};
    const subgenreStats = {};
    const tropeStats = {};

    books.forEach(book => {
      // Genre analysis
      if (book.genre) {
        if (!genreStats[book.genre]) {
          genreStats[book.genre] = {
            count: 0,
            ratings: [],
            total_pages: 0,
            first_read: book.user_read_at,
            last_read: book.user_read_at
          };
        }
        genreStats[book.genre].count++;
        if (book.user_rating) {genreStats[book.genre].ratings.push(book.user_rating);}
        if (book.pages_source) {genreStats[book.genre].total_pages += book.pages_source;}
        
        if (book.user_read_at) {
          if (new Date(book.user_read_at) < new Date(genreStats[book.genre].first_read)) {
            genreStats[book.genre].first_read = book.user_read_at;
          }
          if (new Date(book.user_read_at) > new Date(genreStats[book.genre].last_read)) {
            genreStats[book.genre].last_read = book.user_read_at;
          }
        }
      }

      // Subgenre analysis
      if (book.subgenre) {
        if (!subgenreStats[book.subgenre]) {
          subgenreStats[book.subgenre] = { count: 0, ratings: [] };
        }
        subgenreStats[book.subgenre].count++;
        if (book.user_rating) {subgenreStats[book.subgenre].ratings.push(book.user_rating);}
      }

      // Trope analysis
      if (book.tropes && Array.isArray(book.tropes)) {
        book.tropes.forEach(trope => {
          if (!tropeStats[trope]) {
            tropeStats[trope] = { count: 0, ratings: [] };
          }
          tropeStats[trope].count++;
          if (book.user_rating) {tropeStats[trope].ratings.push(book.user_rating);}
        });
      }
    });

    // Calculate averages and sort
    const processedGenres = Object.entries(genreStats).map(([genre, stats]) => ({
      genre,
      count: stats.count,
      percentage: Math.round((stats.count / books.length) * 100),
      avg_rating: stats.ratings.length > 0 ? 
        Math.round((stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length) * 10) / 10 : 0,
      avg_pages: Math.round(stats.total_pages / stats.count),
      first_read: stats.first_read,
      last_read: stats.last_read,
      consistency_score: this.calculateConsistencyScore(stats.ratings)
    })).sort((a, b) => b.count - a.count);

    const processedTropes = Object.entries(tropeStats).map(([trope, stats]) => ({
      trope,
      count: stats.count,
      percentage: Math.round((stats.count / books.length) * 100),
      avg_rating: stats.ratings.length > 0 ? 
        Math.round((stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length) * 10) / 10 : 0
    })).sort((a, b) => b.count - a.count);

    return {
      genres: processedGenres,
      subgenres: Object.entries(subgenreStats).map(([subgenre, stats]) => ({
        subgenre,
        count: stats.count,
        avg_rating: stats.ratings.length > 0 ? 
          Math.round((stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length) * 10) / 10 : 0
      })).sort((a, b) => b.count - a.count).slice(0, 10),
      tropes: processedTropes.slice(0, 15),
      diversity_score: Object.keys(genreStats).length,
      dominant_genre: processedGenres[0]
    };
  }

  analyzeAuthorPatterns(books) {
    const authorStats = {};

    books.forEach(book => {
      if (book.author_name) {
        if (!authorStats[book.author_name]) {
          authorStats[book.author_name] = {
            count: 0,
            ratings: [],
            books: [],
            first_read: book.user_read_at,
            last_read: book.user_read_at
          };
        }
        
        authorStats[book.author_name].count++;
        authorStats[book.author_name].books.push({
          title: book.title,
          rating: book.user_rating,
          read_date: book.user_read_at
        });
        
        if (book.user_rating) {
          authorStats[book.author_name].ratings.push(book.user_rating);
        }

        if (book.user_read_at) {
          if (new Date(book.user_read_at) < new Date(authorStats[book.author_name].first_read)) {
            authorStats[book.author_name].first_read = book.user_read_at;
          }
          if (new Date(book.user_read_at) > new Date(authorStats[book.author_name].last_read)) {
            authorStats[book.author_name].last_read = book.user_read_at;
          }
        }
      }
    });

    const processedAuthors = Object.entries(authorStats).map(([author, stats]) => ({
      author,
      books_read: stats.count,
      avg_rating: stats.ratings.length > 0 ? 
        Math.round((stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length) * 10) / 10 : 0,
      consistency_score: this.calculateConsistencyScore(stats.ratings),
      first_read: stats.first_read,
      last_read: stats.last_read,
      is_discovery: stats.count === 1,
      is_favorite: stats.count >= 3 && stats.ratings.length > 0 && 
        (stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length) >= 4,
      books: stats.books.sort((a, b) => new Date(b.read_date) - new Date(a.read_date))
    })).sort((a, b) => b.books_read - a.books_read);

    const authorDiversity = processedAuthors.length;
    const repeatAuthors = processedAuthors.filter(author => author.books_read > 1);
    const favoriteAuthors = processedAuthors.filter(author => author.is_favorite);

    return {
      total_authors: authorDiversity,
      repeat_authors: repeatAuthors.length,
      favorite_authors: favoriteAuthors.slice(0, 10),
      top_authors: processedAuthors.slice(0, 15),
      discovery_rate: Math.round((processedAuthors.filter(a => a.is_discovery).length / authorDiversity) * 100),
      author_loyalty_score: Math.round((repeatAuthors.length / authorDiversity) * 100)
    };
  }

  analyzeSeriesProgress(books) {
    const seriesStats = {};
    const standaloneCount = books.filter(book => !book.series_name).length;

    books.forEach(book => {
      if (book.series_name) {
        if (!seriesStats[book.series_name]) {
          seriesStats[book.series_name] = {
            books: [],
            author: book.author_name,
            ratings: [],
            total_books: 0
          };
        }
        
        seriesStats[book.series_name].books.push({
          title: book.title,
          number: book.series_number,
          rating: book.user_rating,
          read_date: book.user_read_at
        });
        
        if (book.user_rating) {
          seriesStats[book.series_name].ratings.push(book.user_rating);
        }
      }
    });

    const processedSeries = Object.entries(seriesStats).map(([series, stats]) => {
      const sortedBooks = stats.books.sort((a, b) => (a.number || 0) - (b.number || 0));
      const highestNumber = Math.max(...stats.books.map(book => book.number || 0));
      const isComplete = sortedBooks.length === highestNumber;
      
      return {
        series,
        author: stats.author,
        books_read: stats.books.length,
        highest_book_number: highestNumber,
        is_complete: isComplete,
        avg_rating: stats.ratings.length > 0 ? 
          Math.round((stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length) * 10) / 10 : 0,
        consistency_score: this.calculateConsistencyScore(stats.ratings),
        books: sortedBooks,
        completion_percentage: Math.round((stats.books.length / highestNumber) * 100)
      };
    }).sort((a, b) => b.books_read - a.books_read);

    const completedSeries = processedSeries.filter(series => series.is_complete);
    const inProgressSeries = processedSeries.filter(series => !series.is_complete);

    return {
      total_series: processedSeries.length,
      completed_series: completedSeries.length,
      in_progress_series: inProgressSeries.length,
      standalone_books: standaloneCount,
      series_vs_standalone_ratio: Math.round((books.filter(b => b.series_name).length / books.length) * 100),
      top_series: processedSeries.slice(0, 10),
      series_completion_rate: Math.round((completedSeries.length / processedSeries.length) * 100),
      avg_books_per_series: Math.round(books.filter(b => b.series_name).length / processedSeries.length)
    };
  }

  analyzeQualityMetrics(books) {
    const ratedBooks = books.filter(book => book.user_rating);
    
    if (ratedBooks.length === 0) {
      return {
        total_rated: 0,
        message: 'No rated books to analyze'
      };
    }

    const ratingDistribution = {};
    ratedBooks.forEach(book => {
      ratingDistribution[book.user_rating] = (ratingDistribution[book.user_rating] || 0) + 1;
    });

    const avgRating = ratedBooks.reduce((sum, book) => sum + book.user_rating, 0) / ratedBooks.length;
    const medianRating = this.calculateMedian(ratedBooks.map(book => book.user_rating));
    
    const fiveStarBooks = ratedBooks.filter(book => book.user_rating === 5);
    const fourPlusStarBooks = ratedBooks.filter(book => book.user_rating >= 4);
    const lowRatedBooks = ratedBooks.filter(book => book.user_rating <= 2);

    return {
      total_rated: ratedBooks.length,
      rating_percentage: Math.round((ratedBooks.length / books.length) * 100),
      avg_rating: Math.round(avgRating * 10) / 10,
      median_rating: medianRating,
      rating_distribution: Object.entries(ratingDistribution).map(([rating, count]) => ({
        rating: parseInt(rating),
        count,
        percentage: Math.round((count / ratedBooks.length) * 100)
      })).sort((a, b) => b.rating - a.rating),
      five_star_rate: Math.round((fiveStarBooks.length / ratedBooks.length) * 100),
      four_plus_rate: Math.round((fourPlusStarBooks.length / ratedBooks.length) * 100),
      dnf_rate: 0, // Calculate if DNF status is tracked
      quality_score: Math.round(avgRating * 20), // Convert to 100-point scale
      top_rated_books: fiveStarBooks.slice(0, 10).map(book => ({
        title: book.title,
        author: book.author_name,
        genre: book.genre,
        read_date: book.user_read_at
      })),
      reading_standards: avgRating >= 4 ? 'High' : avgRating >= 3.5 ? 'Moderate' : 'Flexible'
    };
  }

  analyzeSeasonalPatterns(books) {
    const monthlyStats = {};
    const seasonalStats = { Spring: 0, Summer: 0, Fall: 0, Winter: 0 };
    const quarterlyStats = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

    books.forEach(book => {
      if (book.user_read_at) {
        const date = new Date(book.user_read_at);
        const month = date.getMonth();
        
        monthlyStats[month] = (monthlyStats[month] || 0) + 1;
        
        // Seasonal mapping
        if (month >= 2 && month <= 4) {seasonalStats.Spring++;}
        else if (month >= 5 && month <= 7) {seasonalStats.Summer++;}
        else if (month >= 8 && month <= 10) {seasonalStats.Fall++;}
        else {seasonalStats.Winter++;}
        
        // Quarterly mapping
        if (month >= 0 && month <= 2) {quarterlyStats.Q1++;}
        else if (month >= 3 && month <= 5) {quarterlyStats.Q2++;}
        else if (month >= 6 && month <= 8) {quarterlyStats.Q3++;}
        else {quarterlyStats.Q4++;}
      }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      monthly_patterns: Object.entries(monthlyStats).map(([month, count]) => ({
        month: monthNames[parseInt(month)],
        month_number: parseInt(month),
        books: count,
        percentage: Math.round((count / books.length) * 100)
      })).sort((a, b) => a.month_number - b.month_number),
      seasonal_preferences: Object.entries(seasonalStats).map(([season, count]) => ({
        season,
        books: count,
        percentage: Math.round((count / books.length) * 100)
      })).sort((a, b) => b.books - a.books),
      quarterly_breakdown: Object.entries(quarterlyStats).map(([quarter, count]) => ({
        quarter,
        books: count,
        percentage: Math.round((count / books.length) * 100)
      })),
      peak_reading_season: Object.entries(seasonalStats).reduce((a, b) => 
        seasonalStats[a[0]] > seasonalStats[b[0]] ? a : b, ['Spring', 0]
      )[0]
    };
  }

  analyzeDiscoveryPatterns(books) {
    // This would analyze how books were discovered (recommendations, bestseller lists, etc.)
    // For now, we'll analyze based on available data
    
    const newAuthors = new Set();
    const newGenres = new Set();
    const timelineDiscovery = {};

    // Sort books by read date to analyze discovery timeline
    const chronologicalBooks = books
      .filter(book => book.user_read_at)
      .sort((a, b) => new Date(a.user_read_at) - new Date(b.user_read_at));

    chronologicalBooks.forEach((book, index) => {
      const date = new Date(book.user_read_at);
      const month = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      if (!timelineDiscovery[month]) {
        timelineDiscovery[month] = { new_authors: 0, new_genres: 0, total_books: 0 };
      }
      
      timelineDiscovery[month].total_books++;
      
      // Check if this is first time reading this author
      const authorFirstTime = !chronologicalBooks.slice(0, index)
        .some(prevBook => prevBook.author_name === book.author_name);
      if (authorFirstTime && book.author_name) {
        newAuthors.add(book.author_name);
        timelineDiscovery[month].new_authors++;
      }
      
      // Check if this is first time reading this genre
      const genreFirstTime = !chronologicalBooks.slice(0, index)
        .some(prevBook => prevBook.genre === book.genre);
      if (genreFirstTime && book.genre) {
        newGenres.add(book.genre);
        timelineDiscovery[month].new_genres++;
      }
    });

    return {
      new_authors_discovered: newAuthors.size,
      new_genres_explored: newGenres.size,
      discovery_rate: Math.round((newAuthors.size / books.length) * 100),
      exploration_score: newGenres.size,
      discovery_timeline: Object.entries(timelineDiscovery).map(([month, stats]) => ({
        month,
        ...stats,
        discovery_percentage: Math.round((stats.new_authors / stats.total_books) * 100)
      }))
    };
  }

  generateInsightRecommendations(books) {
    const recommendations = [];
    
    // Based on reading patterns, generate actionable insights
    const ratedBooks = books.filter(book => book.user_rating);
    const avgRating = ratedBooks.length > 0 ? 
      ratedBooks.reduce((sum, book) => sum + book.user_rating, 0) / ratedBooks.length : 0;

    // Quality recommendations
    if (avgRating >= 4.5) {
      recommendations.push({
        type: 'quality',
        message: 'You have excellent taste! Consider sharing your recommendations with others.',
        action: 'Start a book blog or join reading communities'
      });
    } else if (avgRating < 3.5) {
      recommendations.push({
        type: 'quality',
        message: 'Consider being more selective with book choices.',
        action: 'Use rating filters and read reviews before adding to TBR'
      });
    }

    // Diversity recommendations
    const genres = new Set(books.filter(book => book.genre).map(book => book.genre));
    if (genres.size < 3) {
      recommendations.push({
        type: 'diversity',
        message: 'Try exploring different genres to broaden your reading horizons.',
        action: 'Set a goal to read one new genre per quarter'
      });
    }

    // Pace recommendations
    const pacePerWeek = books.length / 52;
    if (pacePerWeek > 3) {
      recommendations.push({
        type: 'pace',
        message: 'You\'re a speed reader! Consider diving into longer, more complex works.',
        action: 'Try epic fantasy series or classic literature'
      });
    } else if (pacePerWeek < 1) {
      recommendations.push({
        type: 'pace',
        message: 'Consider setting small, achievable reading goals to increase your pace.',
        action: 'Try audiobooks or shorter books to build momentum'
      });
    }

    return recommendations;
  }

  analyzeGoalsProgress(books, year) {
    // Basic goal tracking - this could be enhanced with user-set goals
    const targetBooks = 52; // Default annual goal
    const progress = (books.length / targetBooks) * 100;
    const daysInYear = new Date(year, 11, 31).getDate() === 31 ? 365 : 366;
    const daysPassed = Math.floor((Date.now() - new Date(year, 0, 1)) / (1000 * 60 * 60 * 24));
    const expectedProgress = (daysPassed / daysInYear) * 100;
    
    return {
      annual_goal: targetBooks,
      books_read: books.length,
      progress_percentage: Math.round(progress),
      on_track: progress >= expectedProgress,
      ahead_behind_days: Math.round(((progress - expectedProgress) / 100) * daysInYear),
      projected_finish: Math.round((books.length / daysPassed) * daysInYear),
      recommended_pace: Math.round((targetBooks - books.length) / ((daysInYear - daysPassed) / 7)) // books per week needed
    };
  }

  // Utility functions
  calculateReadingStreak(books) {
    // Simplified streak calculation - consecutive days with reading
    const dates = books.map(book => new Date(book.user_read_at).toDateString()).sort();
    const uniqueDates = [...new Set(dates)];
    
    let currentStreak = 0;
    let maxStreak = 0;
    
    for (let i = uniqueDates.length - 1; i >= 0; i--) {
      const currentDate = new Date(uniqueDates[i]);
      const nextDate = i < uniqueDates.length - 1 ? new Date(uniqueDates[i + 1]) : new Date();
      const dayDiff = Math.floor((nextDate - currentDate) / (1000 * 60 * 60 * 24));
      
      if (dayDiff <= 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    
    return maxStreak;
  }

  getWeekOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - start) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  calculateConsistencyScore(ratings) {
    if (ratings.length < 2) {return 100;}
    
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const variance = ratings.reduce((sum, rating) => sum + Math.pow(rating - avg, 2), 0) / ratings.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Convert to 0-100 scale (lower deviation = higher consistency)
    return Math.max(0, 100 - (standardDeviation * 25));
  }

  calculateMedian(numbers) {
    const sorted = numbers.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? 
      (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
}

// Export for use in other modules
module.exports = { ReadingInsightsSystem };

// CLI interface for testing
if (require.main === module) {
  async function testReadingInsights() {
    const insights = new ReadingInsightsSystem();
    
    try {
      console.log('🔍 Testing Reading Insights System\n');
      
      await insights.loadData();
      const yearlyInsights = await insights.generateYearlyInsights(2025);
      
      console.log('📊 2025 Reading Insights:');
      console.log(`Total books: ${yearlyInsights.overview.total_books}`);
      console.log(`Average rating: ${yearlyInsights.overview.avg_rating}/5`);
      console.log(`Pages read: ${yearlyInsights.overview.total_pages}`);
      console.log(`Reading streak: ${yearlyInsights.overview.current_reading_streak} days`);
      
      console.log('\n🎯 Top Genres:');
      yearlyInsights.genre_analysis.genres.slice(0, 5).forEach((genre, i) => {
        console.log(`${i + 1}. ${genre.genre}: ${genre.count} books (${genre.percentage}%)`);
      });
      
      console.log('\n👥 Top Authors:');
      yearlyInsights.author_insights.top_authors.slice(0, 5).forEach((author, i) => {
        console.log(`${i + 1}. ${author.author}: ${author.books_read} books (avg: ${author.avg_rating}/5)`);
      });
      
      console.log('\n📅 Reading Pace:');
      console.log(`Books per month: ${yearlyInsights.reading_pace.pace_metrics.avg_books_per_month}`);
      console.log(`Busiest month: ${yearlyInsights.reading_pace.busiest_month.month} (${yearlyInsights.reading_pace.busiest_month.books} books)`);
      
      console.log('\n🎯 Goal Progress:');
      console.log(`Progress: ${yearlyInsights.goals_tracking.progress_percentage}%`);
      console.log(`On track: ${yearlyInsights.goals_tracking.on_track ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }
  
  testReadingInsights();
}