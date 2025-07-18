#!/usr/bin/env node

/**
 * Modular API Server Entry Point
 * Refactored from monolithic api-server.js to modular architecture
 */

require('dotenv').config();
const APIServer = require('./app');

// Create and start server
const server = new APIServer();
server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Export for testing
module.exports = server.getApp();