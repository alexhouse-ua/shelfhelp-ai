/**
 * Execute Field Migration for ShelfHelp AI
 * Implements the migration plan to standardize field names
 */

const fs = require('fs').promises;
const path = require('path');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const MIGRATION_PLAN_FILE = path.join(__dirname, '../reports/field-migration-plan.json');

class FieldMigrationExecutor {
  constructor() {
    this.migrationPlan = null;
    this.backupPath = null;
    this.stats = {
      phase1: { renamed: 0, errors: 0 },
      phase2: { added: 0, errors: 0 },
      totalBooks: 0
    };
  }

  async loadMigrationPlan() {
    const data = await fs.readFile(MIGRATION_PLAN_FILE, 'utf-8');
    this.migrationPlan = JSON.parse(data);
  }

  async loadBooks() {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    return JSON.parse(data);
  }

  async createBackup(books) {
    this.backupPath = path.join(__dirname, `../data/books_backup_before_migration_${Date.now()}.json`);
    await fs.writeFile(this.backupPath, JSON.stringify(books, null, 2));
    console.log(`💾 Backup created: ${this.backupPath}`);
  }

  async executePhase1(books) {
    console.log('\n🔄 Phase 1: Field Renames');
    console.log('==========================');
    
    const phase1 = this.migrationPlan.migrationPlan.find(p => p.phase === 1);
    if (!phase1) {
      console.log('No Phase 1 operations found');
      return books;
    }

    const fieldMappings = {
      'image_url': 'book_image_url',
      'added_at': 'user_date_added',
      'completed_at': 'user_read_at'
      // Note: reflection_pending is already correct, no change needed
    };

    const updatedBooks = books.map((book, index) => {
      try {
        const newBook = { ...book };
        
        // Apply field renames
        Object.entries(fieldMappings).forEach(([oldField, newField]) => {
          if (oldField in newBook) {
            newBook[newField] = newBook[oldField];
            delete newBook[oldField];
            this.stats.phase1.renamed++;
          }
        });

        return newBook;
      } catch (error) {
        console.warn(`Error processing book ${index}: ${error.message}`);
        this.stats.phase1.errors++;
        return book;
      }
    });

    console.log(`✅ Phase 1 complete: ${this.stats.phase1.renamed} fields renamed, ${this.stats.phase1.errors} errors`);
    return updatedBooks;
  }

  async executePhase2(books) {
    console.log('\n➕ Phase 2: Add Missing Fields');
    console.log('==============================');
    
    const phase2 = this.migrationPlan.migrationPlan.find(p => p.phase === 2);
    if (!phase2) {
      console.log('No Phase 2 operations found');
      return books;
    }

    const newFields = {
      'user_date_created': null,
      'tone': null,
      'pages_source': null,
      'next_release_date': null,
      'hype_flag': 'None',
      'ku_availability': false,
      'ku_expires_on': null,
      'availability_source': null,
      'rating_scale_tag': null,
      'inferred_score': null,
      'goal_year': null
    };

    const updatedBooks = books.map((book, index) => {
      try {
        const newBook = { ...book };
        
        // Add missing fields
        Object.entries(newFields).forEach(([field, defaultValue]) => {
          if (!(field in newBook)) {
            newBook[field] = defaultValue;
            this.stats.phase2.added++;
          }
        });

        return newBook;
      } catch (error) {
        console.warn(`Error processing book ${index}: ${error.message}`);
        this.stats.phase2.errors++;
        return book;
      }
    });

    console.log(`✅ Phase 2 complete: ${this.stats.phase2.added} fields added, ${this.stats.phase2.errors} errors`);
    return updatedBooks;
  }

  async saveBooks(books) {
    await fs.writeFile(BOOKS_FILE, JSON.stringify(books, null, 2));
    console.log(`💾 Updated books.json with ${books.length} books`);
  }

  async validateMigration(books) {
    console.log('\n🔍 Validating Migration');
    console.log('=======================');
    
    const sampleBook = books[0];
    const requiredFields = [
      'book_image_url', 'user_date_added', 'user_read_at',
      'user_date_created', 'tone', 'pages_source', 'next_release_date',
      'hype_flag', 'ku_availability', 'ku_expires_on', 'availability_source',
      'rating_scale_tag', 'inferred_score', 'goal_year'
    ];

    const missingFields = requiredFields.filter(field => !(field in sampleBook));
    const oldFields = ['image_url', 'added_at', 'completed_at'].filter(field => field in sampleBook);

    if (missingFields.length === 0 && oldFields.length === 0) {
      console.log('✅ Migration validation successful - all required fields present');
      return true;
    } else {
      console.log('❌ Migration validation failed:');
      if (missingFields.length > 0) {
        console.log(`  Missing fields: ${missingFields.join(', ')}`);
      }
      if (oldFields.length > 0) {
        console.log(`  Old fields still present: ${oldFields.join(', ')}`);
      }
      return false;
    }
  }

  async logMigrationHistory(books) {
    const historyEntry = {
      timestamp: new Date().toISOString(),
      operation: 'field_migration',
      details: {
        phase1_renamed: this.stats.phase1.renamed,
        phase2_added: this.stats.phase2.added,
        total_books: this.stats.totalBooks,
        backup_path: this.backupPath
      }
    };

    const historyPath = path.join(__dirname, `../history/field_migration_${Date.now()}.jsonl`);
    await fs.writeFile(historyPath, JSON.stringify(historyEntry) + '\n');
    console.log(`📝 Migration logged to: ${historyPath}`);
  }

  printSummary() {
    console.log('\n📊 Migration Summary');
    console.log('===================');
    console.log(`Total Books Processed: ${this.stats.totalBooks}`);
    console.log(`Phase 1 - Fields Renamed: ${this.stats.phase1.renamed}`);
    console.log(`Phase 2 - Fields Added: ${this.stats.phase2.added}`);
    console.log(`Total Errors: ${this.stats.phase1.errors + this.stats.phase2.errors}`);
    
    if (this.backupPath) {
      console.log(`\nBackup Location: ${this.backupPath}`);
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Field Migration');
      console.log('============================');
      
      await this.loadMigrationPlan();
      const books = await this.loadBooks();
      this.stats.totalBooks = books.length;
      
      // Create backup before breaking changes
      await this.createBackup(books);
      
      // Execute migration phases
      let updatedBooks = await this.executePhase1(books);
      updatedBooks = await this.executePhase2(updatedBooks);
      
      // Save and validate
      await this.saveBooks(updatedBooks);
      const isValid = await this.validateMigration(updatedBooks);
      
      if (isValid) {
        await this.logMigrationHistory(updatedBooks);
        this.printSummary();
        console.log('\n✅ Field migration completed successfully!');
      } else {
        console.log('\n❌ Migration validation failed - check logs above');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      if (this.backupPath) {
        console.log(`📁 Restore from backup: ${this.backupPath}`);
      }
      throw error;
    }
  }

  // Preview mode - shows what would happen without making changes
  async preview() {
    console.log('👁️  Preview Mode: Field Migration Preview');
    console.log('==========================================');
    
    await this.loadMigrationPlan();
    const books = await this.loadBooks();
    
    console.log(`\n📚 Will process ${books.length} books`);
    
    // Show sample transformations
    const sampleBook = books[0];
    console.log('\n🔍 Sample Book Transformation:');
    console.log('------------------------------');
    console.log('BEFORE:');
    console.log(`  image_url: ${sampleBook.image_url}`);
    console.log(`  added_at: ${sampleBook.added_at}`);
    console.log(`  completed_at: ${sampleBook.completed_at}`);
    console.log(`  tone: ${sampleBook.tone || 'NOT SET'}`);
    console.log(`  hype_flag: ${sampleBook.hype_flag || 'NOT SET'}`);
    
    console.log('\nAFTER:');
    console.log(`  book_image_url: ${sampleBook.image_url}`);
    console.log(`  user_date_added: ${sampleBook.added_at}`);
    console.log(`  user_read_at: ${sampleBook.completed_at}`);
    console.log(`  tone: null`);
    console.log(`  hype_flag: "None"`);
    
    // Show migration plan
    console.log('\n📋 Migration Plan:');
    this.migrationPlan.migrationPlan.forEach(phase => {
      console.log(`\nPhase ${phase.phase}: ${phase.title}`);
      console.log(`  Risk: ${phase.risk}`);
      console.log(`  Operations: ${phase.operations.length}`);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const executor = new FieldMigrationExecutor();
  
  if (args.includes('--preview')) {
    await executor.preview();
  } else if (args.includes('--execute')) {
    await executor.run();
  } else {
    console.log('Usage: node execute-field-migration.js [--preview|--execute]');
    console.log('  --preview: Show what would happen without making changes');
    console.log('  --execute: Execute the migration');
  }
}

module.exports = FieldMigrationExecutor;

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}