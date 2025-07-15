/**
 * Comprehensive Backfill Strategy for ShelfHelp AI
 * 
 * This script implements a multi-phase backfill strategy to enrich missing book data
 * using intelligent classification, web enrichment, and user prompting strategies.
 */

const fs = require('fs').promises;
const path = require('path');
const FuzzyClassificationMatcher = require('./fuzzy-classifier');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const CLASSIFICATIONS_FILE = path.join(__dirname, '../data/classifications.yaml');
const REPORTS_DIR = path.join(__dirname, '../reports');

class BackfillStrategy {
  constructor() {
    this.fuzzyMatcher = new FuzzyClassificationMatcher();
    this.fuzzyMatcherReady = false;
    this.backfillStats = {
      booksAnalyzed: 0,
      fieldsBackfilled: 0,
      automatedFills: 0,
      manualPrompts: 0,
      errors: 0
    };
  }

  async initialize() {
    try {
      await this.fuzzyMatcher.initialize(CLASSIFICATIONS_FILE);
      this.fuzzyMatcherReady = true;
      console.log('✅ Fuzzy classification matcher ready for backfill');
    } catch (error) {
      console.warn('⚠️ Fuzzy matcher initialization failed:', error.message);
    }
  }

  async loadBooks() {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    return JSON.parse(data);
  }

  async saveBooks(books) {
    await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
    
    // Create history snapshot
    const timestamp = new Date().toISOString();
    const historyFile = path.join(__dirname, '../history', `backfill_${timestamp.replace(/[:.]/g, '-')}.jsonl`);
    await fs.mkdir(path.dirname(historyFile), { recursive: true });
    
    const historyEntry = {
      timestamp,
      operation: 'backfill',
      stats: this.backfillStats,
      books: books.length
    };
    
    await fs.writeFile(historyFile, JSON.stringify(historyEntry) + '\\n');
  }

  // Phase 1: Intelligent Classification Backfill
  async classificationBackfill(books, options = {}) {
    console.log('\\n🎯 Phase 1: Intelligent Classification Backfill');
    console.log('='.repeat(60));
    
    const { dryRun = false, confidence = 0.7 } = options;
    let processed = 0;
    
    for (const book of books) {
      if (!this.needsClassificationBackfill(book)) continue;
      
      try {
        const enrichment = await this.intelligentClassify(book, confidence);
        
        if (enrichment.hasImprovements) {
          if (!dryRun) {
            Object.assign(book, enrichment.fields);
            book.updated_at = new Date().toISOString();
            book.backfill_source = 'intelligent_classification';
            this.backfillStats.automatedFills++;
          }
          
          console.log(`📚 ${book.title} by ${book.author_name}`);
          console.log(`   Enriched: ${Object.keys(enrichment.fields).join(', ')}`);
          if (enrichment.confidence) {
            console.log(`   Confidence: ${Math.round(enrichment.confidence * 100)}%`);
          }
          processed++;
        }
        
        this.backfillStats.booksAnalyzed++;
      } catch (error) {
        console.warn(`⚠️ Classification failed for ${book.title}: ${error.message}`);
        this.backfillStats.errors++;
      }
    }
    
    console.log(`\\n✅ Phase 1 Complete: ${processed} books enhanced`);
    return processed;
  }

  // Phase 2: Pattern-Based Inference
  async patternBasedBackfill(books, options = {}) {
    console.log('\\n🔍 Phase 2: Pattern-Based Inference');
    console.log('='.repeat(60));
    
    const { dryRun = false } = options;
    let processed = 0;
    
    // Analyze existing patterns
    const patterns = this.analyzeExistingPatterns(books);
    
    for (const book of books) {
      try {
        const enrichment = await this.inferFromPatterns(book, patterns);
        
        if (enrichment.hasImprovements) {
          if (!dryRun) {
            Object.assign(book, enrichment.fields);
            book.updated_at = new Date().toISOString();
            book.backfill_source = 'pattern_inference';
            this.backfillStats.automatedFills++;
          }
          
          console.log(`📚 ${book.title} by ${book.author_name}`);
          console.log(`   Inferred: ${Object.keys(enrichment.fields).join(', ')}`);
          console.log(`   Basis: ${enrichment.reasoning}`);
          processed++;
        }
        
        this.backfillStats.booksAnalyzed++;
      } catch (error) {
        console.warn(`⚠️ Pattern inference failed for ${book.title}: ${error.message}`);
        this.backfillStats.errors++;
      }
    }
    
    console.log(`\\n✅ Phase 2 Complete: ${processed} books enhanced`);
    return processed;
  }

  // Phase 3: User Prompt Generation
  async generateUserPrompts(books, options = {}) {
    console.log('\\n❓ Phase 3: User Prompt Generation');
    console.log('='.repeat(60));
    
    const { limit = 20, priority = 'high' } = options;
    
    const candidates = this.identifyPromptCandidates(books, priority);
    const prompts = candidates.slice(0, limit).map(book => this.generatePrompt(book));
    
    // Save prompts to file
    const promptsFile = path.join(REPORTS_DIR, `backfill-prompts-${Date.now()}.json`);
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(promptsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalCandidates: candidates.length,
      promptsGenerated: prompts.length,
      prompts
    }, null, 2));
    
    console.log(`📝 Generated ${prompts.length} user prompts`);
    console.log(`💾 Saved to: ${promptsFile}`);
    
    // Display sample prompts
    console.log('\\n📋 Sample Prompts:');
    prompts.slice(0, 3).forEach((prompt, index) => {
      console.log(`\\n${index + 1}. ${prompt.book.title} by ${prompt.book.author_name}`);
      console.log(`   Missing: ${prompt.missingFields.join(', ')}`);
      console.log(`   Prompt: ${prompt.userPrompt.slice(0, 100)}...`);
    });
    
    return prompts;
  }

  needsClassificationBackfill(book) {
    return !book.genre || !book.subgenre || !book.tropes || 
           book.tropes.length === 0 || !book.spice;
  }

  async intelligentClassify(book, confidence = 0.7) {
    const enrichment = {
      hasImprovements: false,
      fields: {},
      confidence: 0
    };

    if (!this.fuzzyMatcherReady) {
      return enrichment;
    }

    try {
      // Use fuzzy matcher to classify based on title, author, and description
      const classification = this.fuzzyMatcher.classifyBook({
        title: book.title || book.book_title,
        author: book.author_name,
        description: book.book_description
      });

      if (classification.confidence >= confidence) {
        const { matched } = classification;
        
        // Only add fields that are currently missing
        if (!book.genre && matched.genre) {
          enrichment.fields.genre = matched.genre;
          enrichment.hasImprovements = true;
        }
        
        if (!book.subgenre && matched.subgenre) {
          enrichment.fields.subgenre = matched.subgenre;
          enrichment.hasImprovements = true;
        }
        
        if ((!book.tropes || book.tropes.length === 0) && matched.tropes && matched.tropes.length > 0) {
          enrichment.fields.tropes = matched.tropes;
          enrichment.hasImprovements = true;
        }
        
        if (!book.spice && matched.spice) {
          enrichment.fields.spice = matched.spice;
          enrichment.hasImprovements = true;
        }
        
        enrichment.confidence = classification.confidence;
      }
    } catch (error) {
      console.warn(`Fuzzy classification failed: ${error.message}`);
    }

    return enrichment;
  }

  analyzeExistingPatterns(books) {
    const patterns = {
      authorGenres: {},
      seriesPatterns: {},
      publisherPatterns: {},
      titlePatterns: {}
    };

    books.forEach(book => {
      // Author-genre patterns
      if (book.author_name && book.genre) {
        if (!patterns.authorGenres[book.author_name]) {
          patterns.authorGenres[book.author_name] = {};
        }
        patterns.authorGenres[book.author_name][book.genre] = 
          (patterns.authorGenres[book.author_name][book.genre] || 0) + 1;
      }

      // Series patterns
      if (book.series_name && book.genre) {
        if (!patterns.seriesPatterns[book.series_name]) {
          patterns.seriesPatterns[book.series_name] = {
            genre: book.genre,
            subgenre: book.subgenre,
            tropes: book.tropes || [],
            spice: book.spice
          };
        }
      }
    });

    return patterns;
  }

  async inferFromPatterns(book, patterns) {
    const enrichment = {
      hasImprovements: false,
      fields: {},
      reasoning: ''
    };

    // Author pattern inference
    if (book.author_name && patterns.authorGenres[book.author_name] && !book.genre) {
      const authorGenres = patterns.authorGenres[book.author_name];
      const mostCommonGenre = Object.entries(authorGenres)
        .sort(([,a], [,b]) => b - a)[0];
      
      if (mostCommonGenre && mostCommonGenre[1] >= 2) { // At least 2 books
        enrichment.fields.genre = mostCommonGenre[0];
        enrichment.reasoning = `Author pattern (${mostCommonGenre[1]} previous books)`;
        enrichment.hasImprovements = true;
      }
    }

    // Series pattern inference
    if (book.series_name && patterns.seriesPatterns[book.series_name]) {
      const seriesPattern = patterns.seriesPatterns[book.series_name];
      
      if (!book.genre && seriesPattern.genre) {
        enrichment.fields.genre = seriesPattern.genre;
        enrichment.reasoning = 'Series pattern';
        enrichment.hasImprovements = true;
      }
      
      if (!book.subgenre && seriesPattern.subgenre) {
        enrichment.fields.subgenre = seriesPattern.subgenre;
        enrichment.hasImprovements = true;
      }
      
      if ((!book.tropes || book.tropes.length === 0) && seriesPattern.tropes && seriesPattern.tropes.length > 0) {
        enrichment.fields.tropes = seriesPattern.tropes;
        enrichment.hasImprovements = true;
      }
      
      if (!book.spice && seriesPattern.spice) {
        enrichment.fields.spice = seriesPattern.spice;
        enrichment.hasImprovements = true;
      }
    }

    // Title-based heuristics
    if (!book.genre && !enrichment.fields.genre) {
      const titleGenre = this.inferGenreFromTitle(book.title || book.book_title);
      if (titleGenre) {
        enrichment.fields.genre = titleGenre.genre;
        enrichment.reasoning = `Title analysis (${titleGenre.confidence}% confidence)`;
        enrichment.hasImprovements = true;
      }
    }

    return enrichment;
  }

  inferGenreFromTitle(title) {
    if (!title) return null;
    
    const titleLower = title.toLowerCase();
    
    // Simple keyword-based genre inference
    const genreKeywords = {
      'Romance': ['love', 'heart', 'kiss', 'romance', 'boyfriend', 'wedding', 'marriage'],
      'Fantasy': ['magic', 'dragon', 'wizard', 'realm', 'kingdom', 'quest', 'prophecy'],
      'Mystery': ['murder', 'detective', 'mystery', 'case', 'investigation', 'crime'],
      'Thriller': ['thriller', 'suspense', 'danger', 'hunt', 'chase', 'escape'],
      'Sci-Fi': ['space', 'alien', 'future', 'technology', 'robot', 'galaxy', 'planet']
    };

    for (const [genre, keywords] of Object.entries(genreKeywords)) {
      const matches = keywords.filter(keyword => titleLower.includes(keyword));
      if (matches.length > 0) {
        return {
          genre,
          confidence: Math.min(90, matches.length * 30),
          keywords: matches
        };
      }
    }

    return null;
  }

  identifyPromptCandidates(books, priority = 'high') {
    return books
      .filter(book => {
        const missingCount = this.countMissingFields(book);
        
        switch (priority) {
          case 'high':
            return missingCount >= 6; // Missing most critical fields
          case 'medium':
            return missingCount >= 3 && missingCount < 6;
          case 'low':
            return missingCount >= 1 && missingCount < 3;
          default:
            return missingCount > 0;
        }
      })
      .sort((a, b) => this.countMissingFields(b) - this.countMissingFields(a));
  }

  countMissingFields(book) {
    const criticalFields = ['genre', 'subgenre', 'tropes', 'spice', 'tone', 'liked', 'disliked'];
    return criticalFields.filter(field => {
      const value = book[field];
      return value === null || value === undefined || value === '' || 
             (Array.isArray(value) && value.length === 0);
    }).length;
  }

  generatePrompt(book) {
    const missingFields = ['genre', 'subgenre', 'tropes', 'spice', 'tone', 'liked', 'disliked']
      .filter(field => {
        const value = book[field];
        return value === null || value === undefined || value === '' || 
               (Array.isArray(value) && value.length === 0);
      });

    const userPrompt = `Please help classify "${book.title}" by ${book.author_name}:

📖 **Book Details:**
${book.series_name ? `- Series: ${book.series_name} #${book.series_number}` : ''}
- Published: ${book.book_published || 'Unknown'}
${book.book_description ? `- Description: ${book.book_description.slice(0, 200)}...` : ''}

❓ **Missing Information:**
${missingFields.map(field => `- ${field.charAt(0).toUpperCase() + field.slice(1)}`).join('\\n')}

Please provide the missing classifications based on the book details.`;

    return {
      book: {
        title: book.title,
        author_name: book.author_name,
        goodreads_id: book.goodreads_id,
        series_name: book.series_name,
        series_number: book.series_number
      },
      missingFields,
      userPrompt,
      priority: missingFields.length >= 6 ? 'high' : missingFields.length >= 3 ? 'medium' : 'low'
    };
  }

  async executeFullBackfill(options = {}) {
    console.log('🚀 Starting Comprehensive Backfill Process');
    console.log('='.repeat(80));
    
    const {
      dryRun = false,
      confidence = 0.7,
      promptLimit = 20,
      skipPrompts = false
    } = options;
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be saved');
    }
    
    await this.initialize();
    const books = await this.loadBooks();
    
    console.log(`📚 Loaded ${books.length} books for backfill analysis\\n`);
    
    // Phase 1: Intelligent Classification
    const phase1Results = await this.classificationBackfill(books, { dryRun, confidence });
    
    // Phase 2: Pattern-Based Inference  
    const phase2Results = await this.patternBasedBackfill(books, { dryRun });
    
    // Phase 3: User Prompts (if not skipped)
    let prompts = [];
    if (!skipPrompts) {
      prompts = await this.generateUserPrompts(books, { limit: promptLimit });
      this.backfillStats.manualPrompts = prompts.length;
    }
    
    // Save results
    if (!dryRun && (phase1Results > 0 || phase2Results > 0)) {
      await this.saveBooks(books);
      console.log('\\n💾 Books saved with backfill data');
    }
    
    // Generate summary report
    const summary = await this.generateSummaryReport(books, prompts);
    
    console.log('\\n' + '='.repeat(80));
    console.log('BACKFILL SUMMARY');
    console.log('='.repeat(80));
    console.log(`📊 Books Analyzed: ${this.backfillStats.booksAnalyzed}`);
    console.log(`🤖 Automated Fills: ${this.backfillStats.automatedFills}`);
    console.log(`❓ User Prompts Generated: ${this.backfillStats.manualPrompts}`);
    console.log(`❌ Errors: ${this.backfillStats.errors}`);
    console.log(`\\n📈 Improvement: ${phase1Results + phase2Results} books enhanced`);
    
    return {
      stats: this.backfillStats,
      summary,
      prompts: prompts.length
    };
  }

  async generateSummaryReport(books, prompts) {
    const report = {
      timestamp: new Date().toISOString(),
      stats: { ...this.backfillStats },
      completenessAfter: this.calculateCompleteness(books),
      topMissingFields: this.getTopMissingFields(books),
      userPromptsGenerated: prompts.length,
      nextSteps: this.generateNextSteps(books)
    };
    
    const reportPath = path.join(REPORTS_DIR, `backfill-summary-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\\n📊 Summary report saved: ${reportPath}`);
    
    return report;
  }

  calculateCompleteness(books) {
    const fields = ['genre', 'subgenre', 'tropes', 'spice'];
    const completeness = {};
    
    fields.forEach(field => {
      const complete = books.filter(book => {
        const value = book[field];
        return value !== null && value !== undefined && value !== '' && 
               (!Array.isArray(value) || value.length > 0);
      }).length;
      
      completeness[field] = Math.round((complete / books.length) * 100);
    });
    
    return completeness;
  }

  getTopMissingFields(books) {
    const fields = ['genre', 'subgenre', 'tropes', 'spice', 'tone', 'liked', 'disliked'];
    const missing = {};
    
    fields.forEach(field => {
      missing[field] = books.filter(book => {
        const value = book[field];
        return value === null || value === undefined || value === '' || 
               (Array.isArray(value) && value.length === 0);
      }).length;
    });
    
    return Object.entries(missing)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([field, count]) => ({ field, count, percentage: Math.round((count / books.length) * 100) }));
  }

  generateNextSteps(books) {
    const steps = [];
    const incompleteness = this.calculateCompleteness(books);
    
    if (incompleteness.genre < 50) {
      steps.push('Focus on genre classification - critical for analytics');
    }
    
    if (incompleteness.tropes < 30) {
      steps.push('Prioritize trope tagging for recommendation accuracy');
    }
    
    const highMissingCount = books.filter(book => this.countMissingFields(book) >= 5).length;
    if (highMissingCount > 20) {
      steps.push(`${highMissingCount} books need comprehensive manual review`);
    }
    
    return steps;
  }
}

module.exports = { BackfillStrategy };

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const strategy = new BackfillStrategy();
  
  const options = {
    dryRun: args.includes('--dry-run'),
    confidence: parseFloat(args.find(arg => arg.startsWith('--confidence='))?.split('=')[1]) || 0.7,
    promptLimit: parseInt(args.find(arg => arg.startsWith('--prompts='))?.split('=')[1]) || 20,
    skipPrompts: args.includes('--skip-prompts')
  };
  
  try {
    await strategy.executeFullBackfill(options);
    console.log('\\n✅ Backfill process completed successfully');
  } catch (error) {
    console.error('❌ Backfill failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}