const fs = require('fs').promises;
const path = require('path');
const yaml = require('yaml');

// Recommendation sources integration helper
class RecommendationSourcesManager {
  constructor() {
    this.sources = null;
    this.sourcesFile = path.join(__dirname, '../data/recommendation-sources.yaml');
    this.loaded = false;
  }

  async loadSources() {
    try {
      const data = await fs.readFile(this.sourcesFile, 'utf-8');
      this.sources = yaml.parse(data);
      this.loaded = true;
      console.log('✅ Recommendation sources loaded successfully');
      return this.sources;
    } catch (error) {
      console.error('❌ Failed to load recommendation sources:', error.message);
      this.sources = this.getFallbackSources();
      return this.sources;
    }
  }

  getFallbackSources() {
    return {
      recommendation_sources: {
        tier1_primary: {
          bestsellers: [
            { name: 'Goodreads', url: 'https://www.goodreads.com', scope: 'overall', priority: 1 },
            { name: 'Amazon', url: 'https://www.amazon.com', scope: 'overall', priority: 2 }
          ],
          trending_social: [
            { name: 'BookTok', url: 'https://www.tiktok.com/tag/booktok', scope: 'overall', priority: 1 },
            { name: 'Book Riot', url: 'https://bookriot.com', scope: 'overall', priority: 2 }
          ]
        }
      },
      priority_weights: {
        tier1_primary: 1.0,
        tier2_secondary: 0.7,
        tier3_extended: 0.4
      }
    };
  }

  async ensureLoaded() {
    if (!this.loaded) {
      await this.loadSources();
    }
    return this.sources;
  }

  async getPrioritizedSources(query, options = {}) {
    await this.ensureLoaded();
    
    const {
      scope = 'overall',        // 'romance', 'overall'
      category = 'trending',    // 'trending', 'bestsellers', 'new_releases', 'discovery'
      limit = 10,
      includeExtended = true
    } = options;

    const prioritizedSources = [];

    // Process each tier with appropriate weights
    const tiers = ['tier1_primary', 'tier2_secondary'];
    if (includeExtended) {tiers.push('tier3_extended');}

    for (const tierName of tiers) {
      const tier = this.sources.recommendation_sources[tierName];
      if (!tier) {continue;}

      const baseWeight = this.sources.priority_weights[tierName] || 1.0;

      // Process each category in the tier
      for (const [categoryName, sources] of Object.entries(tier)) {
        if (!Array.isArray(sources)) {continue;}

        for (const source of sources) {
          let weight = baseWeight;
          
          // Apply scope boost (romance sources get boost for romance queries)
          if (scope === 'romance' && source.scope === 'romance') {
            weight *= this.sources.priority_weights.scope_weights?.romance || 1.2;
          }
          
          // Apply category boost
          if (source.categories?.includes(category)) {
            weight *= this.sources.priority_weights.category_weights?.[category] || 1.0;
          }

          prioritizedSources.push({
            ...source,
            tier: tierName,
            category: categoryName,
            weight: weight,
            finalPriority: (source.priority || 1) * weight
          });
        }
      }
    }

    // Sort by final priority (higher is better) and limit results
    return prioritizedSources
      .sort((a, b) => b.finalPriority - a.finalPriority)
      .slice(0, limit);
  }

  async generateSearchQueries(query, sources, options = {}) {
    await this.ensureLoaded();
    
    const {
      maxQueriesPerSource = 2,
      includeGeneric = true
    } = options;

    const searchQueries = [];
    const patterns = this.sources.search_patterns || {};

    for (const source of sources) {
      const sourceQueries = [];
      
      // Get category-specific patterns
      const categoryPatterns = patterns.by_category?.[source.category] || [];
      for (const pattern of categoryPatterns.slice(0, maxQueriesPerSource)) {
        sourceQueries.push({
          query: pattern.replace('{source}', source.name).replace('{year}', new Date().getFullYear()),
          source: source.name,
          url: source.url,
          priority: source.finalPriority,
          pattern: pattern
        });
      }

      // Add scope-specific patterns if relevant
      if (source.scope === 'romance' && patterns.by_genre?.romance) {
        const romancePattern = patterns.by_genre.romance[0];
        if (romancePattern && sourceQueries.length < maxQueriesPerSource) {
          sourceQueries.push({
            query: romancePattern.replace('{source}', source.name),
            source: source.name,
            url: source.url,
            priority: source.finalPriority,
            pattern: romancePattern
          });
        }
      }

      // Add generic query if needed
      if (includeGeneric && sourceQueries.length < maxQueriesPerSource) {
        sourceQueries.push({
          query: `${source.name} ${query}`,
          source: source.name,
          url: source.url,
          priority: source.finalPriority,
          pattern: 'generic'
        });
      }

      searchQueries.push(...sourceQueries);
    }

    return searchQueries.sort((a, b) => b.priority - a.priority);
  }

  async getSourcesByCategory(category, scope = 'overall') {
    await this.ensureLoaded();
    
    const sources = [];
    
    for (const [tierName, tier] of Object.entries(this.sources.recommendation_sources)) {
      for (const [categoryName, categoryContent] of Object.entries(tier)) {
        if (!Array.isArray(categoryContent)) {continue;}
        
        for (const source of categoryContent) {
          if (source.categories?.includes(category) && 
              (scope === 'overall' || source.scope === scope)) {
            sources.push({
              ...source,
              tier: tierName,
              category: categoryName
            });
          }
        }
      }
    }
    
    return sources.sort((a, b) => (a.priority || 1) - (b.priority || 1));
  }

  async getRecommendationStrategy(query, userPreferences = {}) {
    await this.ensureLoaded();
    
    const {
      preferredGenres = [],
      recentBooks = [],
      scope = 'overall'
    } = userPreferences;

    // Determine query intent
    const isRomanceQuery = query.toLowerCase().includes('romance') || 
                          preferredGenres.some(g => g.toLowerCase().includes('romance')) ||
                          scope === 'romance';
    
    const isTrendingQuery = query.toLowerCase().includes('trending') ||
                           query.toLowerCase().includes('viral') ||
                           query.toLowerCase().includes('popular');

    const category = isTrendingQuery ? 'trending' : 
                    query.toLowerCase().includes('new') ? 'new_releases' :
                    query.toLowerCase().includes('bestseller') ? 'bestsellers' : 'discovery';

    // Get prioritized sources
    const sources = await this.getPrioritizedSources(query, {
      scope: isRomanceQuery ? 'romance' : 'overall',
      category: category,
      limit: 8
    });

    // Generate search queries
    const searchQueries = await this.generateSearchQueries(query, sources, {
      maxQueriesPerSource: 2
    });

    return {
      strategy: {
        query: query,
        detectedScope: isRomanceQuery ? 'romance' : 'overall',
        detectedCategory: category,
        isRomanceQuery,
        isTrendingQuery
      },
      sources: sources,
      searchQueries: searchQueries.slice(0, 12), // Limit total queries
      recommendations: {
        primary_sources: sources.filter(s => s.tier === 'tier1_primary').slice(0, 4),
        backup_sources: sources.filter(s => s.tier === 'tier2_secondary').slice(0, 4),
        next_steps: [
          'Execute web searches for top-priority queries',
          'Extract book titles, authors, descriptions, and ratings',
          'Validate against existing library to avoid duplicates',
          'Score results based on source priority and relevance'
        ]
      }
    };
  }

  async validateDiscoveredBook(bookData, existingBooks = []) {
    const validation = {
      isValid: true,
      issues: [],
      suggestions: [],
      confidence: 1.0,
      isDuplicate: false
    };

    // Check required fields
    if (!bookData.title) {
      validation.isValid = false;
      validation.issues.push('Missing book title');
      validation.confidence *= 0.1;
    }

    if (!bookData.author) {
      validation.isValid = false;
      validation.issues.push('Missing author name');
      validation.confidence *= 0.3;
    }

    // Check for duplicates
    const duplicateBook = existingBooks.find(book => 
      book.title.toLowerCase() === bookData.title?.toLowerCase() &&
      book.author_name?.toLowerCase() === bookData.author?.toLowerCase()
    );

    if (duplicateBook) {
      validation.isDuplicate = true;
      validation.issues.push(`Duplicate of existing book: ${duplicateBook.title}`);
      validation.confidence *= 0.1;
    }

    // Validate data quality
    if (bookData.description && bookData.description.length < 50) {
      validation.issues.push('Description seems too short');
      validation.confidence *= 0.8;
    }

    if (bookData.average_rating && (bookData.average_rating < 1 || bookData.average_rating > 5)) {
      validation.issues.push('Invalid rating value');
      validation.confidence *= 0.7;
    }

    // Add suggestions for improvement
    if (!bookData.genre) {
      validation.suggestions.push('Consider adding genre information');
    }

    if (!bookData.publication_year) {
      validation.suggestions.push('Consider adding publication year');
    }

    if (!bookData.source) {
      validation.suggestions.push('Add source attribution for discovery');
    }

    return validation;
  }

  async scoreRecommendation(bookData, sourceInfo, userPreferences = {}) {
    const scoring = {
      sourceScore: 0,
      relevanceScore: 0,
      qualityScore: 0,
      totalScore: 0,
      reasoning: []
    };

    // Source score (based on tier and priority)
    const tierWeights = { tier1_primary: 1.0, tier2_secondary: 0.7, tier3_extended: 0.4 };
    scoring.sourceScore = (tierWeights[sourceInfo.tier] || 0.5) * (sourceInfo.weight || 1.0);
    scoring.reasoning.push(`Source tier: ${sourceInfo.tier} (weight: ${scoring.sourceScore.toFixed(2)})`);

    // Relevance score (genre matching, etc.)
    if (userPreferences.preferredGenres?.length > 0 && bookData.genre) {
      const genreMatch = userPreferences.preferredGenres.some(genre => 
        bookData.genre.toLowerCase().includes(genre.toLowerCase())
      );
      if (genreMatch) {
        scoring.relevanceScore += 0.3;
        scoring.reasoning.push('Genre matches user preferences');
      }
    }

    // Quality score (rating, description quality, etc.)
    if (bookData.average_rating) {
      scoring.qualityScore += Math.min(bookData.average_rating / 5, 1.0) * 0.3;
      scoring.reasoning.push(`Rating: ${bookData.average_rating}/5`);
    }

    if (bookData.description && bookData.description.length > 100) {
      scoring.qualityScore += 0.2;
      scoring.reasoning.push('Has detailed description');
    }

    if (bookData.publication_year && bookData.publication_year >= new Date().getFullYear() - 2) {
      scoring.qualityScore += 0.1;
      scoring.reasoning.push('Recent publication');
    }

    scoring.totalScore = scoring.sourceScore + scoring.relevanceScore + scoring.qualityScore;
    
    return scoring;
  }

  async getSourcesInfo() {
    await this.ensureLoaded();
    
    const info = {
      totalSources: 0,
      tierBreakdown: {},
      scopeBreakdown: { romance: 0, overall: 0 },
      categoryBreakdown: {},
      topSources: []
    };

    for (const [tierName, tier] of Object.entries(this.sources.recommendation_sources)) {
      let tierCount = 0;
      
      for (const [categoryName, sources] of Object.entries(tier)) {
        if (!Array.isArray(sources)) {continue;}
        
        tierCount += sources.length;
        info.totalSources += sources.length;
        
        // Track categories
        info.categoryBreakdown[categoryName] = (info.categoryBreakdown[categoryName] || 0) + sources.length;
        
        // Track scopes and collect top sources
        for (const source of sources) {
          if (source.scope) {
            info.scopeBreakdown[source.scope] = (info.scopeBreakdown[source.scope] || 0) + 1;
          }
          
          if ((source.priority || 1) <= 3) {
            info.topSources.push({
              name: source.name,
              tier: tierName,
              category: categoryName,
              scope: source.scope,
              priority: source.priority
            });
          }
        }
      }
      
      info.tierBreakdown[tierName] = tierCount;
    }

    info.topSources.sort((a, b) => (a.priority || 1) - (b.priority || 1));
    
    return info;
  }
}

// Export for use in other modules
module.exports = { RecommendationSourcesManager };

// CLI interface for testing
if (require.main === module) {
  async function testManager() {
    const manager = new RecommendationSourcesManager();
    
    try {
      console.log('🔍 Testing Recommendation Sources Manager\n');
      
      // Test loading sources
      await manager.loadSources();
      
      // Test getting sources info
      const info = await manager.getSourcesInfo();
      console.log('📊 Sources Overview:');
      console.log(`Total sources: ${info.totalSources}`);
      console.log(`Romance sources: ${info.scopeBreakdown.romance}`);
      console.log(`Overall sources: ${info.scopeBreakdown.overall}`);
      console.log(`Tier 1 sources: ${info.tierBreakdown.tier1_primary || 0}`);
      console.log();
      
      // Test recommendation strategy
      const strategy = await manager.getRecommendationStrategy('trending hockey romance books', {
        preferredGenres: ['Romance', 'Sports Romance'],
        scope: 'romance'
      });
      
      console.log('🎯 Strategy for "trending hockey romance books":');
      console.log(`Detected scope: ${strategy.strategy.detectedScope}`);
      console.log(`Detected category: ${strategy.strategy.detectedCategory}`);
      console.log(`Primary sources: ${strategy.recommendations.primary_sources.length}`);
      console.log(`Search queries generated: ${strategy.searchQueries.length}`);
      console.log();
      
      console.log('🔍 Top 5 Search Queries:');
      strategy.searchQueries.slice(0, 5).forEach((query, i) => {
        console.log(`${i + 1}. ${query.query} (${query.source})`);
      });
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }
  
  testManager();
}