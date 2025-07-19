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

console.error('\n❌ DEPRECATED: This file has been replaced by the modular architecture.');
console.error('Please use "npm run dev" or "npm start" instead.');
console.error('Entry point: scripts/core/server.js\n');

process.exit(1);