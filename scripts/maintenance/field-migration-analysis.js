/**
 * Field Migration Analysis for ShelfHelp AI
 * Analyzes current books.json against Field Dictionary and creates migration strategy
 */

const fs = require('fs').promises;
const path = require('path');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');

class FieldMigrationAnalyzer {
  constructor() {
    // Field Dictionary mapping from Operating_Instructions.md
    this.fieldDictionary = {
      // Current field -> Standard field mapping
      'image_url': 'book_image_url',
      'added_at': 'user_date_added',
      'completed_at': 'user_read_at',
      'user_rating': 'user_rating', // Already correct
      'reflection_pending': 'reflection_pending', // Already correct
      
      // Fields that need to be added
      'missing_fields': [
        'user_date_created',
        'tone',
        'pages_source',
        'next_release_date',
        'hype_flag',
        'ku_availability',
        'ku_expires_on',
        'availability_source',
        'rating_scale_tag',
        'inferred_score',
        'goal_year'
      ],
      
      // Fields that are correct as-is
      'correct_fields': [
        'guid',
        'goodreads_id',
        'isbn',
        'title',
        'book_title', // Added by title parsing
        'author_name',
        'link',
        'book_description',
        'pubdate',
        'book_published',
        'average_rating',
        'updated_at',
        'status',
        'series_name',
        'series_number',
        'genre',
        'subgenre',
        'tropes',
        'spice',
        'queue_position',
        'queue_priority',
        'liked',
        'disliked',
        'notes'
      ]
    };
    
    this.migrationPlan = [];
    this.analysisResults = {};
  }

  async analyze() {
    console.log('🔍 Analyzing current field structure...');
    
    const books = await this.loadBooks();
    const sampleBook = books[0];
    
    // Analyze current fields
    const currentFields = Object.keys(sampleBook);
    const standardFields = [...this.fieldDictionary.correct_fields, ...Object.values(this.fieldDictionary).filter(v => typeof v === 'string')];
    
    // Find mismatches
    const fieldMismatches = this.findFieldMismatches(currentFields);
    const missingFields = this.findMissingFields(currentFields);
    const extraFields = this.findExtraFields(currentFields, standardFields);
    
    this.analysisResults = {
      totalBooks: books.length,
      currentFields: currentFields.length,
      standardFields: standardFields.length,
      fieldMismatches,
      missingFields,
      extraFields,
      complianceRate: this.calculateComplianceRate(currentFields, standardFields)
    };
    
    // Create migration plan
    this.createMigrationPlan();
    
    return this.analysisResults;
  }

  async loadBooks() {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    return JSON.parse(data);
  }

  findFieldMismatches(currentFields) {
    const mismatches = [];
    
    for (const [current, standard] of Object.entries(this.fieldDictionary)) {
      if (typeof standard === 'string' && currentFields.includes(current)) {
        mismatches.push({
          current,
          standard,
          action: 'rename',
          description: `Rename "${current}" to "${standard}"`
        });
      }
    }
    
    return mismatches;
  }

  findMissingFields(currentFields) {
    return this.fieldDictionary.missing_fields.filter(field => 
      !currentFields.includes(field)
    ).map(field => ({
      field,
      action: 'add',
      defaultValue: this.getDefaultValue(field),
      description: `Add "${field}" field with default value`
    }));
  }

  findExtraFields(currentFields, standardFields) {
    return currentFields.filter(field => 
      !standardFields.includes(field) && 
      !Object.keys(this.fieldDictionary).includes(field)
    ).map(field => ({
      field,
      action: 'review',
      description: `Review if "${field}" should be kept or removed`
    }));
  }

  getDefaultValue(field) {
    const defaults = {
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
    
    return defaults[field] || null;
  }

  calculateComplianceRate(currentFields, standardFields) {
    const correctFields = currentFields.filter(field => 
      this.fieldDictionary.correct_fields.includes(field)
    );
    
    return {
      correct: correctFields.length,
      total: standardFields.length,
      percentage: Math.round((correctFields.length / standardFields.length) * 100)
    };
  }

  createMigrationPlan() {
    // Phase 1: Field renames (breaking changes)
    this.migrationPlan.push({
      phase: 1,
      title: 'Field Renames (Breaking Changes)',
      description: 'Rename fields to match Field Dictionary standards',
      operations: this.analysisResults.fieldMismatches,
      risk: 'HIGH',
      backupRequired: true
    });

    // Phase 2: Add missing fields
    this.migrationPlan.push({
      phase: 2,
      title: 'Add Missing Fields',
      description: 'Add new fields with default values',
      operations: this.analysisResults.missingFields,
      risk: 'LOW',
      backupRequired: false
    });

    // Phase 3: Review extra fields
    if (this.analysisResults.extraFields.length > 0) {
      this.migrationPlan.push({
        phase: 3,
        title: 'Review Extra Fields',
        description: 'Manual review of non-standard fields',
        operations: this.analysisResults.extraFields,
        risk: 'MEDIUM',
        backupRequired: false
      });
    }
  }

  printAnalysis() {
    console.log('\n📊 Field Migration Analysis Report');
    console.log('===================================');
    
    console.log(`\n📚 Dataset Overview:`);
    console.log(`  Total Books: ${this.analysisResults.totalBooks}`);
    console.log(`  Current Fields: ${this.analysisResults.currentFields}`);
    console.log(`  Standard Fields: ${this.analysisResults.standardFields}`);
    console.log(`  Compliance Rate: ${this.analysisResults.complianceRate.percentage}% (${this.analysisResults.complianceRate.correct}/${this.analysisResults.complianceRate.total})`);

    console.log(`\n🔄 Field Mismatches (${this.analysisResults.fieldMismatches.length}):`);
    this.analysisResults.fieldMismatches.forEach(mismatch => {
      console.log(`  • ${mismatch.current} → ${mismatch.standard}`);
    });

    console.log(`\n➕ Missing Fields (${this.analysisResults.missingFields.length}):`);
    this.analysisResults.missingFields.forEach(missing => {
      console.log(`  • ${missing.field} (default: ${JSON.stringify(missing.defaultValue)})`);
    });

    if (this.analysisResults.extraFields.length > 0) {
      console.log(`\n❓ Extra Fields (${this.analysisResults.extraFields.length}):`);
      this.analysisResults.extraFields.forEach(extra => {
        console.log(`  • ${extra.field} (needs review)`);
      });
    }

    console.log('\n📋 Migration Plan:');
    console.log('==================');
    this.migrationPlan.forEach(phase => {
      console.log(`\nPhase ${phase.phase}: ${phase.title}`);
      console.log(`  Risk Level: ${phase.risk}`);
      console.log(`  Backup Required: ${phase.backupRequired ? 'Yes' : 'No'}`);
      console.log(`  Operations: ${phase.operations.length}`);
      console.log(`  Description: ${phase.description}`);
      
      if (phase.operations.length <= 5) {
        phase.operations.forEach(op => {
          console.log(`    - ${op.description || op.current + ' → ' + op.standard}`);
        });
      }
    });
  }

  async saveMigrationPlan() {
    const reportPath = path.join(__dirname, '../reports/field-migration-plan.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      analysis: this.analysisResults,
      migrationPlan: this.migrationPlan,
      recommendations: this.getRecommendations()
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Migration plan saved to: ${reportPath}`);
  }

  getRecommendations() {
    return [
      "Execute phases in order to minimize data conflicts",
      "Create full backup before Phase 1 (field renames)",
      "Test migration on a subset of books first",
      "Update API endpoints to handle both old and new field names during transition",
      "Run validation after each phase to ensure data integrity",
      "Consider implementing field aliases for backward compatibility"
    ];
  }
}

async function main() {
  const analyzer = new FieldMigrationAnalyzer();
  
  try {
    await analyzer.analyze();
    analyzer.printAnalysis();
    await analyzer.saveMigrationPlan();
    
    console.log('\n✅ Field migration analysis complete!');
    console.log('\nNext steps:');
    console.log('1. Review the migration plan in reports/field-migration-plan.json');
    console.log('2. Execute Phase 1 (field renames) with backup');
    console.log('3. Update API endpoints to use new field names');
    console.log('4. Execute Phase 2 (add missing fields)');
    console.log('5. Test historical data import compatibility');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

module.exports = FieldMigrationAnalyzer;

if (require.main === module) {
  main();
}