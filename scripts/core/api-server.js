#!/usr/bin/env node

/**
 * DEPRECATED: Monolithic API Server
 * 
 * This file has been deprecated in favor of the modular architecture.
 * Please use scripts/core/server.js instead.
 * 
 * Migration completed: July 18, 2025
 * 
 * The modular architecture provides:
 * - Better separation of concerns
 * - Easier testing and maintenance
 * - Cleaner code organization
 * - Improved scalability
 * 
 * Route modules are now located in:
 * - scripts/core/routes/books.js
 * - scripts/core/routes/classifications.js
 * - scripts/core/routes/queue.js
 * - scripts/core/routes/recommendations.js
 * - scripts/core/routes/backfill.js
 * - scripts/core/routes/availability.js
 * - scripts/core/routes/preferences.js
 * - scripts/core/routes/insights.js
 * - scripts/core/routes/health.js
 * 
 * Main application: scripts/core/app.js
 * Entry point: scripts/core/server.js
 * 
 * To use the new modular architecture:
 * npm run dev  # Uses scripts/core/server.js
 * npm start    # Uses scripts/core/server.js
 */

// DEPRECATED: This file has been replaced by the modular architecture.
// Please use the monolithic server while debugging path-to-regexp issues.
// Entry point: scripts/core/api-server-monolithic.js

process.stderr.write('\n❌ DEPRECATED: This file has been replaced by the modular architecture.\n');
process.stderr.write('Please use "npm run dev" or "npm start" instead.\n');
process.stderr.write('Entry point: scripts/core/api-server-monolithic.js\n\n');

process.exit(1);