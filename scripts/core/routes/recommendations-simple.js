const express = require('express');
const router = express.Router();
const logger = require('../logger');

// GET /api/recommendations - Get personalized book recommendations
router.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Recommendations endpoint working in modular architecture',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Recommendations retrieval failed', { error: error.message, query: req.query });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recommendations',
      details: error.message
    });
  }
});

module.exports = router;