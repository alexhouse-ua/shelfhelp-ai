/**
 * Apply Title Parsing to Existing Books
 * Processes books.json to add book_title field by parsing existing title field
 */

const fs = require('fs').promises;
const path = require('path');
const TitleParser = require('./title-parser');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const BACKUP_FILE = path.join(__dirname, '../data/books_backup_before_parsing.json');

class TitleParsingApplicator {
  constructor() {
    this.parser = new TitleParser();
    this.stats = {
      total: 0,
      parsed: 0,
      conflicts: 0,
      errors: 0
    };
    this.conflicts = [];
  }

  async run() {
    try {
      console.log('🔍 Loading books.json...');
      const books = await this.loadBooks();
      
      console.log('💾 Creating backup...');
      await this.createBackup(books);
      
      console.log('📖 Parsing titles...');
      const updatedBooks = await this.processBooks(books);
      
      console.log('💾 Saving updated books...');
      await this.saveBooks(updatedBooks);
      
      console.log('📊 Generating report...');
      this.printReport();
      
      if (this.conflicts.length > 0) {
        console.log('\n⚠️  Conflicts detected - review recommended');
        await this.saveConflictReport();
      }
      
      console.log('\n✅ Title parsing complete!');
      
    } catch (error) {
      console.error('❌ Error during title parsing:', error.message);
      throw error;
    }
  }

  async loadBooks() {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    return JSON.parse(data);
  }

  async createBackup(books) {
    await fs.writeFile(BACKUP_FILE, JSON.stringify(books, null, 2));
    console.log(`   Backup saved to: ${BACKUP_FILE}`);
  }

  async processBooks(books) {
    this.stats.total = books.length;
    
    const updatedBooks = books.map((book, index) => {
      try {
        // Parse the title
        const parsed = this.parser.parse(book.title);
        
        // Validate against existing data
        const validation = this.parser.validateParsing(book, parsed);
        
        if (!validation.valid) {
          this.stats.conflicts++;
          this.conflicts.push({
            index: index,
            title: book.title,
            issues: validation.issues,
            existing: {
              series_name: book.series_name,
              series_number: book.series_number
            },
            parsed: parsed
          });
        }

        // Create updated book object
        const updatedBook = {
          ...book,
          book_title: parsed.book_title
        };

        // Only update series fields if parsing found values AND there's no conflict
        if (validation.valid) {
          if (parsed.series_name && !book.series_name) {
            updatedBook.series_name = parsed.series_name;
          }
          if (parsed.series_number !== null && !book.series_number) {
            updatedBook.series_number = parsed.series_number;
          }
        }

        this.stats.parsed++;
        return updatedBook;
        
      } catch (error) {
        this.stats.errors++;
        console.warn(`   Warning: Error parsing book ${index}: ${book.title} - ${error.message}`);
        return {
          ...book,
          book_title: book.title // Fallback to original title
        };
      }
    });

    return updatedBooks;
  }

  async saveBooks(books) {
    await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
    console.log(`   Updated ${books.length} books in books.json`);
  }

  async saveConflictReport() {
    const reportPath = path.join(__dirname, '../reports/title_parsing_conflicts.json');
    await fs.writeFile(reportPath, JSON.stringify(this.conflicts, null, 2));
    console.log(`   Conflict report saved to: ${reportPath}`);
  }

  printReport() {
    console.log('\n📊 Title Parsing Statistics:');
    console.log('============================');
    console.log(`Total Books: ${this.stats.total}`);
    console.log(`Successfully Parsed: ${this.stats.parsed}`);
    console.log(`Conflicts Detected: ${this.stats.conflicts}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`Success Rate: ${((this.stats.parsed / this.stats.total) * 100).toFixed(1)}%`);

    if (this.conflicts.length > 0) {
      console.log('\n⚠️  Sample Conflicts:');
      this.conflicts.slice(0, 3).forEach(conflict => {
        console.log(`\n"${conflict.title}"`);
        console.log(`  Issues: ${conflict.issues.join(', ')}`);
        console.log(`  Existing: ${conflict.existing.series_name} #${conflict.existing.series_number}`);
        console.log(`  Parsed: ${conflict.parsed.series_name} #${conflict.parsed.series_number}`);
      });
    }
  }

  // Preview mode - shows what would happen without making changes
  async preview() {
    console.log('👁️  Preview Mode: Analyzing titles without making changes...\n');
    
    const books = await this.loadBooks();
    const sampleSize = Math.min(10, books.length);
    
    console.log(`Showing first ${sampleSize} examples:\n`);
    
    for (let i = 0; i < sampleSize; i++) {
      const book = books[i];
      const parsed = this.parser.parse(book.title);
      const validation = this.parser.validateParsing(book, parsed);
      
      console.log(`${i + 1}. "${book.title}"`);
      console.log(`   Book Title: "${parsed.book_title}"`);
      console.log(`   Series: "${parsed.series_name}" (existing: "${book.series_name}")`);
      console.log(`   Number: ${parsed.series_number} (existing: ${book.series_number})`);
      console.log(`   Status: ${validation.valid ? '✅ Valid' : '⚠️  ' + validation.issues.join(', ')}`);
      console.log('');
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const applicator = new TitleParsingApplicator();
  
  if (args.includes('--preview')) {
    await applicator.preview();
  } else {
    await applicator.run();
  }
}

// Export for use in other modules
module.exports = TitleParsingApplicator;

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}