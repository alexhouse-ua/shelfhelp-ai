# Scripts Directory Organization

This directory contains all operational scripts for the ShelfHelp AI system, organized into logical subdirectories for improved maintainability and clarity.

## Directory Structure

### `/core/` - Runtime Components
Essential scripts that run during normal application operation:

- **`api-server.js`** - Main Express.js API server
- **`enhanced-availability-checker.js`** - Book availability checking service
- **`firebase-config.js`** - Firebase configuration and initialization
- **`fuzzy-classifier.js`** - Fuzzy matching for book classification
- **`knowledge-api.js`** - Knowledge management API endpoints
- **`library-checker.js`** - Library integration service
- **`logger.js`** - Centralized logging system
- **`preference-learning.js`** - User preference analysis
- **`rag-ingest.js`** - RAG vector store management
- **`reading-insights.js`** - Reading analytics and insights
- **`recommendation-sources.js`** - External recommendation source management
- **`rss-ingest.js`** - RSS feed processing

### `/maintenance/` - Data Management & Migrations
Scripts for data maintenance, migrations, and system administration:

- **`analyze-field-completeness.js`** - Analyze data quality and completeness
- **`apply-title-parsing.js`** - Apply title parsing to existing books
- **`backfill-strategy.js`** - Backfill missing book metadata
- **`debug-paths.js`** - Path debugging utility
- **`deduplicate-books.js`** - Remove duplicate book entries
- **`execute-field-migration.js`** - Execute data field migrations
- **`field-migration-analysis.js`** - Analyze migration requirements
- **`fix-goodreads-ids.js`** - Fix Goodreads ID issues
- **`import-historical-data.js`** - Import historical book data
- **`merge-export.js`** - Merge export data files
- **`reflection-automation.js`** - Automate reflection generation
- **`test-specific-titles.js`** - Test specific book titles
- **`title-parser.js`** - Parse and standardize book titles
- **`validate-fixes.js`** - Validate data fixes
- **`validation.js`** - General data validation utilities

### `/testing/` - Test Scripts & Quality Assurance
Scripts for testing, validation, and quality assurance:

- **`startup-check.sh`** - System startup validation
- **`test-api.sh`** - API endpoint testing
- **`test-fixes.sh`** - Test data fixes and migrations

### `/archived/` - Deprecated & Backup Files
Outdated or backup scripts kept for reference:

- **`api-server.backup.js`** - Backup of old API server
- **`queue-manager.js`** - Legacy queue manager (replaced by src/core/queue-manager.js)
- **`rss-ingest-updated.js`** - Outdated RSS ingestion script

## Usage Guidelines

### Development Workflow
1. **Core scripts** should only be modified with careful testing
2. **Maintenance scripts** can be run as needed for data management
3. **Testing scripts** should be run before major deployments
4. **Archived scripts** should not be used in production

### Import Patterns
When importing scripts from this directory:

```javascript
// Core runtime components
const logger = require('./scripts/core/logger');
const fuzzyClassifier = require('./scripts/core/fuzzy-classifier');

// Maintenance utilities
const titleParser = require('./scripts/maintenance/title-parser');
const validation = require('./scripts/maintenance/validation');
```

### Adding New Scripts
- **Core components**: Place in `/core/` if used during normal operation
- **Maintenance tools**: Place in `/maintenance/` if used for data management
- **Test scripts**: Place in `/testing/` if used for validation/QA
- **Deprecated**: Move to `/archived/` when no longer needed

## Performance Considerations

- Core scripts are loaded during application startup
- Maintenance scripts should be designed for batch operations
- Testing scripts should include proper cleanup and validation
- All scripts should include appropriate error handling and logging

## Security Notes

- All scripts require proper authentication when accessing sensitive data
- Maintenance scripts should validate input parameters
- Testing scripts should use isolated test data when possible
- Archived scripts may contain outdated security patterns

---

**Last Updated**: July 15, 2025  
**Organization Standard**: P2-B5-003 (Remove Technical Debt)