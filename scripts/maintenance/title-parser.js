/**
 * Title Parser for ShelfHelp AI
 * Parses RSS titles into clean book_title, series_name, and series_number
 * 
 * Expected formats:
 * - "Book Title" 
 * - "Book Title (Series Name, #1)"
 * - "Book Title (Series Name #1)"
 * - "Book Title: Series Name #1"
 * - "Book Title (Series Name, Book 1)"
 * - "Book Title (Series Name 1)"
 */

class TitleParser {
  constructor() {
    // Patterns for series detection
    this.patterns = [
      // "Title (Series Name, #1)" or "Title (Series Name #1)"
      /^(.+?)\s*\(([^,()#]+),?\s*#?(\d+(?:\.\d+)?)\)$/,
      
      // "Title (Series Name Book 1)" - "Book" is part of series name  
      /^(.+?)\s*\((.+?Book)\s+(\d+(?:\.\d+)?)\)$/i,
      
      // "Title (Series Name, Book 1)" - "Book" is separate  
      /^(.+?)\s*\(([^,()]+),\s*(?:Book|Vol\.?|Volume)\s+(\d+(?:\.\d+)?)\)$/i,
      
      // "Title: Series Name #1" or "Title: Series Name Book 1"  
      /^(.+?):\s*(.+?)\s*(?:#|Book|Vol\.?|Volume)\s*(\d+(?:\.\d+)?)$/i,
      
      // "Title - Series Name #1"
      /^(.+?)\s*-\s*(.+?)\s*#(\d+(?:\.\d+)?)$/,
      
      // Complex ranges like "Title (Series, #1.5-2.5)" - skip these for manual review
      /^(.+?)\s*\(([^,()]+),\s*#[\d\.-]+\)$/,
      
      // "Title (Series Name)" - series without number
      /^(.+?)\s*\(([^()]+)\)$/,
      
      // "Title, Book 1" or "Title #1" - number without series name
      /^(.+?),?\s*(?:#|Book|Vol\.?|Volume)\s*(\d+(?:\.\d+)?)$/i
    ];
  }

  /**
   * Parse a title string into components
   * @param {string} title - Raw title from RSS
   * @returns {object} - {book_title, series_name, series_number}
   */
  parse(title) {
    if (!title || typeof title !== 'string') {
      return { book_title: title || '', series_name: null, series_number: null };
    }

    const trimmed = title.trim();
    
    // Try each pattern
    for (const pattern of this.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return this.extractFromMatch(match, pattern);
      }
    }

    // No series pattern found - return as standalone book
    return {
      book_title: trimmed,
      series_name: null,
      series_number: null
    };
  }

  /**
   * Extract components from regex match
   * @param {array} match - Regex match result
   * @param {RegExp} pattern - The pattern that matched
   * @returns {object} - Parsed components
   */
  extractFromMatch(match, pattern) {
    const result = {
      book_title: match[1]?.trim() || '',
      series_name: null,
      series_number: null
    };

    // Handle different pattern types
    if (match[2]) {
      result.series_name = this.cleanSeriesName(match[2].trim());
    }

    if (match[3]) {
      result.series_number = this.parseSeriesNumber(match[3]);
    } else if (match[2] && !match[3] && pattern.source.includes('\\(([^()]+)\\)$')) {
      // Pattern with series name but no number - check if the "series" is actually a number
      const possibleNumber = this.parseSeriesNumber(match[2]);
      if (possibleNumber !== null) {
        result.series_number = possibleNumber;
        result.series_name = null;
      }
    }

    // Special handling for complex ranges (mark for manual review)
    if (pattern.source.includes('#[\\d\\.-]+')) {
      result.series_name = match[2].trim() + ' (manual review needed)';
      result.series_number = null;
    }

    return result;
  }

  /**
   * Clean and normalize series name
   * @param {string} seriesName - Raw series name
   * @returns {string} - Cleaned series name
   */
  cleanSeriesName(seriesName) {
    return seriesName
      .replace(/,\s*$/, '') // Remove trailing comma
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Parse series number, handling decimals for novellas
   * @param {string} numberStr - String that might contain a number
   * @returns {number|null} - Parsed number or null
   */
  parseSeriesNumber(numberStr) {
    if (!numberStr) {return null;}
    
    const cleaned = numberStr.toString().trim();
    const num = parseFloat(cleaned);
    
    return isNaN(num) ? null : num;
  }

  /**
   * Batch parse an array of book objects
   * @param {array} books - Array of book objects with title field
   * @returns {array} - Books with added book_title, series_name, series_number
   */
  batchParse(books) {
    return books.map(book => {
      const parsed = this.parse(book.title);
      return {
        ...book,
        book_title: parsed.book_title,
        // Only override series fields if parsing found values or if they're currently empty
        series_name: parsed.series_name || book.series_name || null,
        series_number: parsed.series_number !== null ? parsed.series_number : (book.series_number || null)
      };
    });
  }

  /**
   * Validate parsing by comparing against existing data
   * @param {object} book - Book with existing series data
   * @param {object} parsed - Parsed results
   * @returns {object} - Validation results
   */
  validateParsing(book, parsed) {
    const issues = [];
    
    // Check if existing series data conflicts with parsed data
    if (book.series_name && parsed.series_name && 
        book.series_name.toLowerCase() !== parsed.series_name.toLowerCase()) {
      issues.push(`Series name mismatch: existing "${book.series_name}" vs parsed "${parsed.series_name}"`);
    }
    
    if (book.series_number && parsed.series_number && 
        book.series_number !== parsed.series_number) {
      issues.push(`Series number mismatch: existing ${book.series_number} vs parsed ${parsed.series_number}`);
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      recommendation: issues.length > 0 ? 'manual_review' : 'accept_parsed'
    };
  }
}

// Test cases for validation
const testCases = [
  "Fourth Wing (The Empyrean, #1)",
  "Iron Flame (The Empyrean #2)", 
  "Harry Potter and the Philosopher's Stone (Harry Potter, #1)",
  "The Fellowship of the Ring (The Lord of the Rings, #1)",
  "A Game of Thrones: A Song of Ice and Fire Book 1",
  "Dune",
  "The Hobbit",
  "Caught Up: Into Darkness Trilogy (Into Darkness Series)",
  "The Way of Kings (The Stormlight Archive #1)",
  "Name of the Wind (The Kingkiller Chronicle, Book 1)"
];

// Export for use in other modules
module.exports = TitleParser;

// If run directly, execute tests
if (require.main === module) {
  console.log('Title Parser Test Results:');
  console.log('========================');
  
  const parser = new TitleParser();
  
  testCases.forEach(title => {
    const result = parser.parse(title);
    console.log(`\nInput: "${title}"`);
    console.log(`Book Title: "${result.book_title}"`);
    console.log(`Series: "${result.series_name}"`);
    console.log(`Number: ${result.series_number}`);
  });
}