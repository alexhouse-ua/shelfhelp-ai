/**
 * Book Deduplication Script for ShelfHelp AI
 * Identifies and merges duplicate books based on goodreads_id and title/author similarity
 */

const fs = require('fs').promises;
const path = require('path');

const BOOKS_FILE = path.join(__dirname, '../data/books.json');

class BookDeduplicator {
  constructor() {
    this.books = [];
    this.duplicateGroups = [];
    this.stats = {
      totalBooks: 0,
      exactMatches: 0,
      similarMatches: 0,
      uniqueBooks: 0,
      duplicatesFound: 0
    };
  }

  async loadBooks() {
    const data = await fs.readFile(BOOKS_FILE, 'utf-8');
    this.books = JSON.parse(data);
    this.stats.totalBooks = this.books.length;
    console.log(`📚 Loaded ${this.books.length} books for deduplication analysis`);
  }

  // Normalize text for comparison
  normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  // Calculate similarity between two strings using Levenshtein distance
  calculateSimilarity(str1, str2) {
    const s1 = this.normalizeText(str1);
    const s2 = this.normalizeText(str2);
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matrix = [];
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const maxLength = Math.max(s1.length, s2.length);
    return (maxLength - matrix[s2.length][s1.length]) / maxLength;
  }

  // Check if two books are duplicates
  areDuplicates(book1, book2) {
    // Exact match on goodreads_id
    if (book1.goodreads_id && book2.goodreads_id && 
        book1.goodreads_id === book2.goodreads_id) {
      return {
        type: 'exact_goodreads_id',
        confidence: 1.0,
        reason: `Same Goodreads ID: ${book1.goodreads_id}`
      };
    }

    // Similar title and author combination
    const titleSimilarity = Math.max(
      this.calculateSimilarity(book1.title, book2.title),
      this.calculateSimilarity(book1.book_title, book2.book_title),
      this.calculateSimilarity(book1.title, book2.book_title),
      this.calculateSimilarity(book1.book_title, book2.title)
    );

    const authorSimilarity = this.calculateSimilarity(book1.author_name, book2.author_name);

    // High confidence if both title and author are very similar
    if (titleSimilarity >= 0.9 && authorSimilarity >= 0.9) {
      return {
        type: 'high_similarity',
        confidence: (titleSimilarity + authorSimilarity) / 2,
        reason: `Title: ${(titleSimilarity * 100).toFixed(1)}%, Author: ${(authorSimilarity * 100).toFixed(1)}%`,
        titleSimilarity,
        authorSimilarity
      };
    }

    // Medium confidence if title is exact and author is similar
    if (titleSimilarity >= 0.95 && authorSimilarity >= 0.8) {
      return {
        type: 'medium_similarity',
        confidence: (titleSimilarity * 0.7 + authorSimilarity * 0.3),
        reason: `Title: ${(titleSimilarity * 100).toFixed(1)}%, Author: ${(authorSimilarity * 100).toFixed(1)}%`,
        titleSimilarity,
        authorSimilarity
      };
    }

    return null;
  }

  // Find all duplicate groups
  findDuplicates() {
    console.log('🔍 Analyzing books for duplicates...');
    
    const processed = new Set();
    
    for (let i = 0; i < this.books.length; i++) {
      if (processed.has(i)) continue;
      
      const book1 = this.books[i];
      const duplicateGroup = {
        books: [{ index: i, book: book1 }],
        duplicates: []
      };

      for (let j = i + 1; j < this.books.length; j++) {
        if (processed.has(j)) continue;
        
        const book2 = this.books[j];
        const match = this.areDuplicates(book1, book2);
        
        if (match) {
          duplicateGroup.duplicates.push({
            index: j,
            book: book2,
            match: match
          });
          processed.add(j);
          
          if (match.type === 'exact_goodreads_id') {
            this.stats.exactMatches++;
          } else {
            this.stats.similarMatches++;
          }
        }
      }

      if (duplicateGroup.duplicates.length > 0) {
        this.duplicateGroups.push(duplicateGroup);
        this.stats.duplicatesFound += duplicateGroup.duplicates.length;
        processed.add(i);
      } else {
        this.stats.uniqueBooks++;
      }
    }

    console.log(`✅ Analysis complete: Found ${this.duplicateGroups.length} duplicate groups`);
  }

  // Generate detailed report of duplicates
  generateReport() {
    console.log('\n📊 Deduplication Analysis Report');
    console.log('================================');
    console.log(`Total Books: ${this.stats.totalBooks}`);
    console.log(`Duplicate Groups Found: ${this.duplicateGroups.length}`);
    console.log(`Total Duplicates: ${this.stats.duplicatesFound}`);
    console.log(`Exact Goodreads ID Matches: ${this.stats.exactMatches}`);
    console.log(`Similar Title/Author Matches: ${this.stats.similarMatches}`);
    console.log(`Unique Books: ${this.stats.uniqueBooks}`);
    console.log(`Books After Deduplication: ${this.books.length - this.stats.duplicatesFound}`);

    if (this.duplicateGroups.length > 0) {
      console.log('\n🔍 Duplicate Groups (showing first 10):');
      console.log('======================================');
      
      this.duplicateGroups.slice(0, 10).forEach((group, index) => {
        console.log(`\n${index + 1}. Primary Book:`);
        console.log(`   "${group.books[0].book.title}" by ${group.books[0].book.author_name}`);
        console.log(`   Goodreads ID: ${group.books[0].book.goodreads_id}`);
        console.log(`   Status: ${group.books[0].book.status}`);
        console.log(`   User Rating: ${group.books[0].book.user_rating || 'None'}`);
        console.log(`   Date Read: ${group.books[0].book.user_read_at || 'None'}`);
        
        group.duplicates.forEach((dup, dupIndex) => {
          console.log(`\n   Duplicate ${dupIndex + 1}:`);
          console.log(`   "${dup.book.title}" by ${dup.book.author_name}`);
          console.log(`   Goodreads ID: ${dup.book.goodreads_id}`);
          console.log(`   Status: ${dup.book.status}`);
          console.log(`   User Rating: ${dup.book.user_rating || 'None'}`);
          console.log(`   Date Read: ${dup.book.user_read_at || 'None'}`);
          console.log(`   Match: ${dup.match.type} (${(dup.match.confidence * 100).toFixed(1)}%)`);
          console.log(`   Reason: ${dup.match.reason}`);
        });
      });

      if (this.duplicateGroups.length > 10) {
        console.log(`\n... and ${this.duplicateGroups.length - 10} more duplicate groups`);
      }
    }
  }

  // Save detailed report to file
  async saveDetailedReport() {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      duplicateGroups: this.duplicateGroups.map(group => ({
        primary: {
          title: group.books[0].book.title,
          book_title: group.books[0].book.book_title,
          author: group.books[0].book.author_name,
          goodreads_id: group.books[0].book.goodreads_id,
          user_rating: group.books[0].book.user_rating,
          user_read_at: group.books[0].book.user_read_at,
          index: group.books[0].index
        },
        duplicates: group.duplicates.map(dup => ({
          title: dup.book.title,
          book_title: dup.book.book_title,
          author: dup.book.author_name,
          goodreads_id: dup.book.goodreads_id,
          user_rating: dup.book.user_rating,
          user_read_at: dup.book.user_read_at,
          index: dup.index,
          match: dup.match
        }))
      }))
    };

    const reportPath = path.join(__dirname, '../reports/deduplication-analysis.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
  }

  // Merge duplicate books (keeping best data from each)
  mergeDuplicates(primaryBook, duplicateBook) {
    // Strategy: NEVER lose data - always prefer filled values over null/empty
    const merged = { ...primaryBook };

    // Process all fields from duplicate book
    Object.keys(duplicateBook).forEach(key => {
      const duplicateValue = duplicateBook[key];
      const primaryValue = merged[key];
      
      // Skip if duplicate value is empty/null
      if (duplicateValue === null || duplicateValue === undefined || duplicateValue === '') {
        return; // Keep primary value
      }

      // If primary is empty/null, always use duplicate value
      if (primaryValue === null || primaryValue === undefined || primaryValue === '') {
        merged[key] = duplicateValue;
        return;
      }

      // Both have values - apply intelligent merging rules
      switch (key) {
        case 'user_rating':
          // Always prefer non-null rating
          merged[key] = duplicateValue;
          break;

        case 'user_read_at':
        case 'user_date_added':
          // Use the earlier/more accurate date
          const primaryDate = new Date(primaryValue);
          const duplicateDate = new Date(duplicateValue);
          if (!isNaN(duplicateDate.getTime()) && 
              (isNaN(primaryDate.getTime()) || duplicateDate < primaryDate)) {
            merged[key] = duplicateValue;
          }
          break;

        case 'book_description':
        case 'notes':
          // Use the longer/more complete description
          if (duplicateValue.length > primaryValue.length) {
            merged[key] = duplicateValue;
          }
          break;

        case 'tropes':
          // Merge arrays, removing duplicates
          if (Array.isArray(duplicateValue)) {
            const existingTropes = Array.isArray(primaryValue) ? primaryValue : [];
            const newTropes = duplicateValue;
            merged[key] = [...new Set([...existingTropes, ...newTropes])];
          }
          break;

        case 'isbn':
          // Prefer longer/more complete ISBN
          if (duplicateValue.length > primaryValue.length) {
            merged[key] = duplicateValue;
          }
          break;

        case 'book_published':
        case 'pages_source':
        case 'average_rating':
          // Prefer the duplicate value if primary is 0 or clearly wrong
          if (primaryValue === 0 || primaryValue === null || 
              (typeof duplicateValue === 'number' && duplicateValue > 0)) {
            merged[key] = duplicateValue;
          }
          break;

        case 'goodreads_id':
          // Keep the more recent/longer ID (RSS usually has newer format)
          if (duplicateValue.length > primaryValue.length) {
            merged[key] = duplicateValue;
          }
          break;

        case 'goal_year':
          // Always prefer non-null goal year
          merged[key] = duplicateValue;
          break;

        case 'tone':
        case 'genre':
        case 'subgenre':
        case 'spice':
        case 'liked':
        case 'disliked':
        case 'rating_scale_tag':
        case 'inferred_score':
        case 'hype_flag':
        case 'availability_source':
          // Always prefer filled enrichment data
          merged[key] = duplicateValue;
          break;

        case 'book_title':
        case 'title':
          // Use the cleaner/more complete title
          if (duplicateValue.length >= primaryValue.length) {
            merged[key] = duplicateValue;
          }
          break;

        default:
          // For other fields, prefer duplicate if it seems more complete
          if (typeof duplicateValue === 'string' && duplicateValue.length > 0) {
            merged[key] = duplicateValue;
          } else if (typeof duplicateValue === 'number' && duplicateValue !== 0) {
            merged[key] = duplicateValue;
          } else if (typeof duplicateValue === 'boolean') {
            merged[key] = duplicateValue;
          }
          break;
      }
    });

    // Ensure we have all possible fields from both books
    Object.keys(primaryBook).forEach(key => {
      if (merged[key] === null || merged[key] === undefined || merged[key] === '') {
        if (duplicateBook[key] !== null && duplicateBook[key] !== undefined && duplicateBook[key] !== '') {
          merged[key] = duplicateBook[key];
        }
      }
    });

    merged.updated_at = new Date();
    return merged;
  }

  // Execute deduplication (removes duplicates)
  async executeDedupe() {
    console.log('\n🔧 Executing deduplication...');
    
    const indicesToRemove = [];
    const updatedBooks = [...this.books];

    // Process each duplicate group
    this.duplicateGroups.forEach(group => {
      const primaryIndex = group.books[0].index;
      let mergedBook = group.books[0].book;

      // Merge all duplicates into the primary book
      group.duplicates.forEach(dup => {
        mergedBook = this.mergeDuplicates(mergedBook, dup.book);
        indicesToRemove.push(dup.index);
      });

      // Update the primary book with merged data
      updatedBooks[primaryIndex] = mergedBook;
    });

    // Remove duplicates (in reverse order to maintain indices)
    indicesToRemove.sort((a, b) => b - a);
    indicesToRemove.forEach(index => {
      updatedBooks.splice(index, 1);
    });

    // Create backup before saving
    const backupPath = path.join(__dirname, `../data/books_backup_before_dedupe_${Date.now()}.json`);
    await fs.writeFile(backupPath, JSON.stringify(this.books, null, 2));
    console.log(`💾 Backup created: ${backupPath}`);

    // Save deduplicated books
    await fs.writeFile(BOOKS_FILE, JSON.stringify(updatedBooks, null, 2));
    console.log(`✅ Deduplication complete: ${updatedBooks.length} books remaining`);

    // Log the operation
    const historyEntry = {
      timestamp: new Date().toISOString(),
      operation: 'deduplication',
      stats: this.stats,
      books_before: this.books.length,
      books_after: updatedBooks.length,
      duplicates_removed: indicesToRemove.length
    };

    const historyPath = path.join(__dirname, `../history/deduplication_${Date.now()}.jsonl`);
    await fs.writeFile(historyPath, JSON.stringify(historyEntry) + '\n');
  }

  // Main analysis method
  async analyze() {
    await this.loadBooks();
    this.findDuplicates();
    this.generateReport();
    await this.saveDetailedReport();
    return this.duplicateGroups;
  }

  // Execute full deduplication
  async deduplicate() {
    await this.analyze();
    if (this.duplicateGroups.length > 0) {
      await this.executeDedupe();
    } else {
      console.log('🎉 No duplicates found - database is already clean!');
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const deduplicator = new BookDeduplicator();

  try {
    if (args.includes('--analyze') || args.includes('--review')) {
      console.log('📋 Analyzing duplicates for review...\n');
      await deduplicator.analyze();
      console.log('\n🔍 Review the detailed report before running deduplication');
      console.log('📁 Report saved to: reports/deduplication-analysis.json');
      console.log('\n💡 To execute deduplication: node deduplicate-books.js --execute');
    } else if (args.includes('--execute')) {
      console.log('⚠️  Executing deduplication (this will modify books.json)...\n');
      await deduplicator.deduplicate();
    } else {
      console.log('Usage: node deduplicate-books.js [--analyze|--execute]');
      console.log('  --analyze: Analyze and report duplicates without making changes');
      console.log('  --execute: Execute deduplication (creates backup first)');
    }
  } catch (error) {
    console.error('❌ Deduplication failed:', error.message);
    process.exit(1);
  }
}

module.exports = { BookDeduplicator };

if (require.main === module) {
  main();
}