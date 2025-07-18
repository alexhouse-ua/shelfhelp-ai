const express = require('express');
const router = express.Router();
const logger = require('../logger');

// Simple test routes without complex dependencies
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Books API working',
    routes: ['GET /', 'GET /test', 'POST /test']
  });
});

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test route working',
    query: req.query
  });
});

router.post('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test POST working',
    body: req.body
  });
});

module.exports = router;