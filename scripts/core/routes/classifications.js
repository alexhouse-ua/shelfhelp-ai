const express = require('express');
const router = express.Router();
const ClassificationHandler = require('../../../src/core/classification-handler');
const FuzzyClassificationMatcher = require('../fuzzy-classifier');
const logger = require('../logger');

// Initialize classification handler
const fuzzyMatcher = new FuzzyClassificationMatcher();
const classificationHandler = new ClassificationHandler(
  fuzzyMatcher,
  require('path').join(__dirname, '../../data/books.json'),
  require('path').join(__dirname, '../../history')
);

// GET /api/classifications - Get available classifications
router.get('/', async (req, res) => {
  try {
    const result = await classificationHandler.getClassifications();
    
    res.json({
      success: true,
      classifications: result.classifications,
      fuzzyMatching: result.fuzzyMatching
    });
    
  } catch (error) {
    logger.error('Classifications retrieval failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve classifications',
      details: error.message
    });
  }
});

// POST /api/classify-book - Classify a book using AI
router.post('/classify-book', async (req, res) => {
  try {
    const result = await classificationHandler.classifyBook(req.body);
    
    res.json({
      success: true,
      book: result.book,
      classifications: result.classifications,
      confidence: result.confidence,
      message: 'Book classified successfully'
    });
    
  } catch (error) {
    logger.error('Book classification failed', { error: error.message, bookData: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to classify book',
      details: error.message
    });
  }
});

// POST /api/match-classification - Match classification fields
router.post('/match-classification', async (req, res) => {
  try {
    const result = await classificationHandler.matchClassification(req.body);
    
    res.json({
      success: true,
      matches: result.matches,
      suggestions: result.suggestions,
      confidence: result.confidence
    });
    
  } catch (error) {
    logger.error('Classification matching failed', { error: error.message, query: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to match classification',
      details: error.message
    });
  }
});

module.exports = router;