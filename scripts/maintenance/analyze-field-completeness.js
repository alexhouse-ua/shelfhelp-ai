/**
 * Field Completeness Analysis Script
 * Analyzes books.json to understand current data state and identify backfill priorities
 */

const fs = require('fs').promises;
const path = require('path');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');

async function analyzeFieldCompleteness() {
  console.log('📊 Analyzing Field Completeness for Backfill Strategy\n');
  
  try {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    const books = JSON.parse(data);
    
    console.log(`Total books analyzed: ${books.length}\n`);
    
    // Define critical fields for analysis
    const criticalFields = {
      // Core Classification Fields
      genre: 'Classification',
      subgenre: 'Classification', 
      tropes: 'Classification',
      spice: 'Classification',
      
      // Core Metadata
      isbn: 'Metadata',
      book_published: 'Metadata',
      pages_source: 'Metadata',
      
      // User Data
      user_rating: 'User Data',
      user_read_at: 'User Data',
      
      // Enhanced Fields
      tone: 'Enhanced',
      liked: 'Enhanced',
      disliked: 'Enhanced',
      notes: 'Enhanced',
      
      // Availability
      ku_availability: 'Availability',
      availability_source: 'Availability'
    };
    
    const fieldStats = {};
    const categoryStats = {};
    
    // Initialize stats
    Object.keys(criticalFields).forEach(field => {
      fieldStats[field] = {
        present: 0,
        missing: 0,
        empty: 0,
        percentage: 0
      };
    });
    
    Object.values(criticalFields).forEach(category => {
      if (!categoryStats[category]) {
        categoryStats[category] = {
          totalFields: 0,
          averageCompleteness: 0
        };
      }
      categoryStats[category].totalFields++;
    });
    
    // Analyze each book
    books.forEach(book => {
      Object.keys(criticalFields).forEach(field => {
        const value = book[field];
        
        if (value === null || value === undefined) {
          fieldStats[field].missing++;
        } else if (value === '' || (Array.isArray(value) && value.length === 0)) {
          fieldStats[field].empty++;
        } else {
          fieldStats[field].present++;
        }
      });
    });
    
    // Calculate percentages and category averages
    Object.keys(fieldStats).forEach(field => {
      const stats = fieldStats[field];
      stats.percentage = Math.round((stats.present / books.length) * 100);
      
      const category = criticalFields[field];
      if (!categoryStats[category].averageCompleteness) {
        categoryStats[category].averageCompleteness = 0;
      }
      categoryStats[category].averageCompleteness += stats.percentage;
    });
    
    // Finalize category averages
    Object.keys(categoryStats).forEach(category => {
      categoryStats[category].averageCompleteness = Math.round(
        categoryStats[category].averageCompleteness / categoryStats[category].totalFields
      );
    });
    
    // Display results
    console.log('='.repeat(80));
    console.log('FIELD COMPLETENESS ANALYSIS');
    console.log('='.repeat(80));
    
    Object.keys(categoryStats).forEach(category => {
      console.log(`\n📂 ${category.toUpperCase()} (${categoryStats[category].averageCompleteness}% average)`);
      console.log('-'.repeat(60));
      
      Object.keys(criticalFields)
        .filter(field => criticalFields[field] === category)
        .sort((a, b) => fieldStats[a].percentage - fieldStats[b].percentage)
        .forEach(field => {
          const stats = fieldStats[field];
          const status = stats.percentage >= 80 ? '✅' : 
                        stats.percentage >= 50 ? '⚠️' : '❌';
          console.log(`${status} ${field.padEnd(20)} ${stats.percentage.toString().padStart(3)}% (${stats.present}/${books.length})`);
        });
    });
    
    // Identify backfill priorities
    console.log('\n' + '='.repeat(80));
    console.log('BACKFILL PRIORITIES');
    console.log('='.repeat(80));
    
    const highPriority = [];
    const mediumPriority = [];
    const lowPriority = [];
    
    Object.keys(fieldStats).forEach(field => {
      const percentage = fieldStats[field].percentage;
      const priority = {
        field,
        percentage,
        missing: fieldStats[field].missing + fieldStats[field].empty,
        category: criticalFields[field]
      };
      
      if (percentage < 20) {
        highPriority.push(priority);
      } else if (percentage < 60) {
        mediumPriority.push(priority);
      } else if (percentage < 90) {
        lowPriority.push(priority);
      }
    });
    
    console.log('\n🔴 HIGH PRIORITY (< 20% complete):');
    highPriority.forEach(p => 
      console.log(`   ${p.field} - ${p.missing} books missing (${p.percentage}%)`)
    );
    
    console.log('\n🟡 MEDIUM PRIORITY (20-60% complete):');
    mediumPriority.forEach(p => 
      console.log(`   ${p.field} - ${p.missing} books missing (${p.percentage}%)`)
    );
    
    console.log('\n🟢 LOW PRIORITY (60-90% complete):');
    lowPriority.forEach(p => 
      console.log(`   ${p.field} - ${p.missing} books missing (${p.percentage}%)`)
    );
    
    // Sample problematic books
    console.log('\n' + '='.repeat(80));
    console.log('SAMPLE BOOKS NEEDING BACKFILL');
    console.log('='.repeat(80));
    
    const problemBooks = books
      .map(book => {
        const missingFields = Object.keys(criticalFields).filter(field => {
          const value = book[field];
          return value === null || value === undefined || value === '' || 
                 (Array.isArray(value) && value.length === 0);
        });
        
        return {
          title: book.title || book.book_title,
          author: book.author_name,
          goodreads_id: book.goodreads_id,
          missingFields,
          missingCount: missingFields.length
        };
      })
      .filter(book => book.missingCount >= 5)
      .sort((a, b) => b.missingCount - a.missingCount)
      .slice(0, 5);
    
    problemBooks.forEach(book => {
      console.log(`\n📚 ${book.title} by ${book.author}`);
      console.log(`   ID: ${book.goodreads_id}`);
      console.log(`   Missing: ${book.missingFields.join(', ')}`);
    });
    
    // Generate summary stats
    const summary = {
      totalBooks: books.length,
      categoryCompleteness: categoryStats,
      backfillPriorities: {
        high: highPriority.length,
        medium: mediumPriority.length,
        low: lowPriority.length
      },
      recommendedActions: []
    };
    
    // Generate recommendations
    if (highPriority.length > 0) {
      summary.recommendedActions.push(`Immediate attention needed: ${highPriority.length} critical fields < 20% complete`);
    }
    
    if (categoryStats.Classification.averageCompleteness < 50) {
      summary.recommendedActions.push('Classification backfill is critical for genre/trope analytics');
    }
    
    if (categoryStats['User Data'].averageCompleteness < 80) {
      summary.recommendedActions.push('User data backfill needed for accurate reading analytics');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('='.repeat(80));
    summary.recommendedActions.forEach(action => console.log(`📋 ${action}`));
    
    // Save analysis to file
    const reportPath = path.join(__dirname, '../reports/field-completeness-analysis.json');
    await fs.writeFile(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
      fieldStats,
      categoryStats,
      sampleProblematicBooks: problemBooks
    }, null, 2));
    
    console.log(`\n💾 Detailed analysis saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

// Run analysis if called directly
if (require.main === module) {
  analyzeFieldCompleteness();
}

module.exports = { analyzeFieldCompleteness };