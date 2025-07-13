/**
 * Classification Handler Module for ShelfHelp AI
 * Handles fuzzy matching, AI classification, and validation
 */

const fs = require('fs').promises;
const logger = require('../../scripts/logger');

class ClassificationHandler {
  constructor(fuzzyMatcher, booksFilePath, historyDir) {
    this.fuzzyMatcher = fuzzyMatcher;
    this.booksFilePath = booksFilePath;
    this.historyDir = historyDir;
  }

  async getClassifications(req, res) {
    try {
      const classifications = this.fuzzyMatcher.getAvailableClassifications();
      
      logger.info('Classifications retrieved', {
        genres: classifications.genres.length,
        subgenres: classifications.subgenres.length,
        tropes: classifications.tropes.length,
        operation: 'get_classifications'
      });
      
      res.json({
        message: 'Available classifications with fuzzy matching capabilities',
        classifications: classifications,
        fuzzy_matching: {
          enabled: true,
          algorithms: ['levenshtein', 'jaccard', 'token_similarity'],
          confidence_threshold: 0.6,
          features: [
            'Intelligent genre/subgenre matching',
            'Multi-algorithm trope matching',
            'Spice level keyword detection',
            'Confidence scoring',
            'Alternative suggestions'
          ]
        },
        usage: {
          classify_book: 'POST /api/classify-book - Full book classification',
          match_classification: 'POST /api/match-classification - Target specific fields',
          ai_classify: 'POST /api/ai-classify - AI agent classification with web research'
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve classifications', { 
        error: error.message,
        operation: 'get_classifications' 
      });
      res.status(500).json({ 
        error: 'Failed to retrieve classifications', 
        message: error.message 
      });
    }
  }

  async classifyBook(req, res) {
    try {
      const bookData = req.body;
      
      if (!bookData || Object.keys(bookData).length === 0) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Book data is required for classification'
        });
      }
      
      const result = this.fuzzyMatcher.classifyBook(bookData);
      
      logger.info('Book classification completed', {
        confidence: result.overallConfidence,
        matchedFields: Object.keys(result.matched),
        errors: result.errors.length,
        operation: 'classify_book'
      });
      
      res.json({
        message: 'Book classification completed',
        classification: result,
        recommendations: {
          apply_matches: result.overallConfidence > 0.7,
          review_suggestions: result.errors.length > 0,
          confidence_threshold: 0.7
        }
      });
    } catch (error) {
      logger.error('Failed to classify book', { 
        error: error.message,
        operation: 'classify_book' 
      });
      res.status(500).json({ 
        error: 'Failed to classify book', 
        message: error.message 
      });
    }
  }

  async matchClassification(req, res) {
    try {
      const { field, value, threshold = 0.6 } = req.body;
      
      if (!field || !value) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Field and value are required for classification matching'
        });
      }
      
      let result = null;
      
      switch (field.toLowerCase()) {
        case 'genre':
          result = this.fuzzyMatcher.matchGenre(value, threshold);
          break;
        case 'subgenre':
          result = this.fuzzyMatcher.matchSubgenre(value, threshold);
          break;
        case 'tropes':
          const tropes = Array.isArray(value) ? value : [value];
          result = this.fuzzyMatcher.matchTropes(tropes, threshold);
          break;
        case 'spice':
        case 'spice_level':
          result = this.fuzzyMatcher.matchSpiceLevel(value);
          break;
        default:
          return res.status(400).json({
            error: 'Invalid field',
            message: 'Supported fields: genre, subgenre, tropes, spice',
            supported_fields: ['genre', 'subgenre', 'tropes', 'spice']
          });
      }
      
      if (!result) {
        logger.info('No classification match found', {
          field: field,
          value: value,
          threshold: threshold,
          operation: 'match_classification'
        });
        
        return res.status(404).json({
          error: 'No match found',
          message: `No classification match found for ${field}: "${value}"`,
          suggestions: this._getSuggestions(field, value),
          threshold_used: threshold
        });
      }
      
      logger.info('Classification match found', {
        field: field,
        originalValue: value,
        matchedValue: Array.isArray(result) ? result.map(r => r.value) : result.value,
        confidence: Array.isArray(result) ? result[0]?.confidence : result.confidence,
        operation: 'match_classification'
      });
      
      res.json({
        message: 'Classification match found',
        field: field,
        original_value: value,
        match: result,
        threshold_used: threshold
      });
    } catch (error) {
      logger.error('Failed to match classification', { 
        error: error.message,
        field: req.body.field,
        value: req.body.value,
        operation: 'match_classification' 
      });
      res.status(500).json({ 
        error: 'Failed to match classification', 
        message: error.message 
      });
    }
  }

  async aiClassifyBook(req, res) {
    try {
      const { title, author, description, research_data } = req.body;
      
      if (!title || !author) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Title and author are required for AI classification'
        });
      }
      
      // Simulate AI classification process
      // In a real implementation, this would call an AI service
      const mockAiData = {
        genre: research_data?.genre || 'Contemporary Romance',
        subgenre: research_data?.subgenre || 'Workplace Romance',
        tropes: research_data?.tropes || ['enemies to lovers', 'workplace romance', 'boss/employee'],
        spice: research_data?.spice || 3,
        confidence: 0.85,
        source: 'AI Research + Fuzzy Matching'
      };
      
      // Apply fuzzy matching to AI results
      const classificationResult = this.fuzzyMatcher.classifyBook(mockAiData);
      
      logger.info('AI book classification completed', {
        title: title,
        author: author,
        confidence: classificationResult.overallConfidence,
        aiConfidence: mockAiData.confidence,
        operation: 'ai_classify_book'
      });
      
      res.json({
        message: 'AI book classification completed',
        book: { title, author, description },
        ai_research: mockAiData,
        fuzzy_classification: classificationResult,
        recommendations: {
          apply_classification: classificationResult.overallConfidence > 0.7,
          review_confidence: classificationResult.overallConfidence < 0.8,
          add_to_library: true
        },
        next_steps: [
          'Review classification accuracy',
          'Apply to book record if confident',
          'Add to reading queue if desired'
        ]
      });
    } catch (error) {
      logger.error('Failed to AI classify book', { 
        error: error.message,
        title: req.body.title,
        author: req.body.author,
        operation: 'ai_classify_book' 
      });
      res.status(500).json({ 
        error: 'Failed to AI classify book', 
        message: error.message 
      });
    }
  }

  async getBackfillAnalysis(req, res) {
    try {
      const data = await fs.readFile(this.booksFilePath, 'utf-8');
      const books = JSON.parse(data);
      
      const analysis = {
        total_books: books.length,
        classified_books: books.filter(b => b.genre && b.subgenre && b.tropes?.length > 0).length,
        missing_genre: books.filter(b => !b.genre).length,
        missing_subgenre: books.filter(b => !b.subgenre).length,
        missing_tropes: books.filter(b => !b.tropes || b.tropes.length === 0).length,
        missing_spice: books.filter(b => b.spice === undefined || b.spice === null).length
      };
      
      analysis.classification_completeness = analysis.total_books > 0 
        ? (analysis.classified_books / analysis.total_books * 100).toFixed(1)
        : 0;
      
      logger.info('Backfill analysis completed', {
        totalBooks: analysis.total_books,
        classifiedBooks: analysis.classified_books,
        completeness: analysis.classification_completeness,
        operation: 'backfill_analysis'
      });
      
      res.json({
        message: 'Classification backfill analysis',
        analysis: analysis,
        recommendations: {
          priority_fields: this._getPriorityFields(analysis),
          estimated_effort: this._estimateBackfillEffort(analysis),
          automation_ready: analysis.missing_genre < 50
        }
      });
    } catch (error) {
      logger.error('Failed to analyze backfill requirements', { 
        error: error.message,
        operation: 'backfill_analysis' 
      });
      res.status(500).json({ 
        error: 'Failed to analyze backfill requirements', 
        message: error.message 
      });
    }
  }

  _getSuggestions(field, value) {
    try {
      const classifications = this.fuzzyMatcher.getAvailableClassifications();
      const candidates = classifications[field === 'genre' ? 'genres' : 
                                      field === 'subgenre' ? 'subgenres' : 
                                      field === 'tropes' ? 'tropes' : []];
      
      if (!candidates) return [];
      
      return candidates
        .map(candidate => ({
          value: candidate,
          similarity: this.fuzzyMatcher._calculateSimilarity(value, candidate)
        }))
        .filter(item => item.similarity > 0.3)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(item => item.value);
    } catch (error) {
      return [];
    }
  }

  _getPriorityFields(analysis) {
    const priorities = [];
    if (analysis.missing_genre > 0) priorities.push('genre');
    if (analysis.missing_subgenre > 0) priorities.push('subgenre');
    if (analysis.missing_tropes > 0) priorities.push('tropes');
    if (analysis.missing_spice > 0) priorities.push('spice');
    return priorities;
  }

  _estimateBackfillEffort(analysis) {
    const totalMissing = analysis.missing_genre + analysis.missing_subgenre + 
                        analysis.missing_tropes + analysis.missing_spice;
    
    if (totalMissing < 50) return 'Low (1-2 hours)';
    if (totalMissing < 200) return 'Medium (3-5 hours)';
    return 'High (6+ hours)';
  }
}

module.exports = ClassificationHandler;