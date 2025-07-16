/**
 * Scrapers Module Index
 * Exports all scraper classes and orchestrator for easy importing
 */

const BaseScraper = require('./base-scraper');
const KindleUnlimitedScraper = require('./kindle-unlimited-scraper');
const HooplaScraper = require('./hoopla-scraper');
const LibraryScraper = require('./library-scraper');
const ScraperOrchestrator = require('./scraper-orchestrator');

module.exports = {
  BaseScraper,
  KindleUnlimitedScraper,
  HooplaScraper,
  LibraryScraper,
  ScraperOrchestrator,
  
  // Factory function for creating orchestrator with default config
  createOrchestrator: (config = {}) => {
    return new ScraperOrchestrator(config);
  },
  
  // Factory function for creating individual scrapers
  createScraper: (type, config = {}) => {
    switch (type.toLowerCase()) {
      case 'kindle_unlimited':
      case 'ku':
        return new KindleUnlimitedScraper(config);
      
      case 'hoopla':
        return new HooplaScraper(config);
      
      case 'library':
      case 'libraries':
        return new LibraryScraper(config);
      
      default:
        throw new Error(`Unknown scraper type: ${type}`);
    }
  },
  
  // Helper function to get all available scraper types
  getAvailableScrapers: () => {
    return ['kindle_unlimited', 'hoopla', 'library'];
  }
};
