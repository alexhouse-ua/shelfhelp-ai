const fs = require('fs').promises;
const path = require('path');

// Paths
const BOOKS_FILE = path.join(__dirname, '../data/books.json');
const REFLECTIONS_DIR = path.join(__dirname, '../reflections');
const REPORTS_DIR = path.join(__dirname, '../reports');

// Reflection automation functions
class ReflectionAutomation {
  constructor() {
    this.reflectionQuestions = [
      "What did you love most about this book?",
      "How did it compare to your expectations?", 
      "Would you recommend it to others? Why or why not?",
      "What themes or messages resonated with you?",
      "How did this book make you feel?",
      "Did any characters particularly stand out to you?",
      "What was your favorite scene or moment?",
      "How does this compare to other books by this author?",
      "What genre elements did this book handle well?",
      "Would you read more books like this?"
    ];
  }

  async readBooksData() {
    try {
      const data = await fs.readFile(BOOKS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.log('No books.json found');
      return [];
    }
  }

  async findBooksNeedingReflection(daysBack = 30) {
    const books = await this.readBooksData();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    
    const needReflection = [];
    
    for (const book of books) {
      // Only check finished books
      if (book.status !== 'finished') continue;
      
      // Must have a finish date
      if (!book.date_finished) continue;
      
      // Must be within the specified timeframe
      const finishedDate = new Date(book.date_finished);
      if (finishedDate < cutoffDate) continue;
      
      // Check if reflection already exists
      const bookId = book.goodreads_id || book.guid;
      const reflectionPath = path.join(REFLECTIONS_DIR, bookId, 'reflection.md');
      
      try {
        await fs.access(reflectionPath);
        // Reflection exists, skip
        continue;
      } catch (error) {
        // Reflection doesn't exist, add to list
        needReflection.push(book);
      }
    }
    
    return needReflection;
  }

  async createReflectionPrompts(books) {
    const prompts = [];
    
    for (const book of books) {
      const prompt = this.generatePromptForBook(book);
      prompts.push(prompt);
      
      // Also create individual reflection directory and template
      await this.createReflectionTemplate(book);
    }
    
    return prompts;
  }

  generatePromptForBook(book) {
    const ratingStars = book.user_rating ? '⭐'.repeat(parseInt(book.user_rating)) : 'Not rated';
    
    return `## ${book.title} by ${book.author_name}

**Finished**: ${book.date_finished}
**Rating**: ${book.user_rating || 'Not rated'}/5 stars ${ratingStars}
**Genre**: ${book.genre || 'Not specified'}
${book.series_name ? `**Series**: ${book.series_name} #${book.series_number}` : ''}

### Quick Thoughts
<!-- Write a quick sentence or two about your overall impression -->

### Detailed Reflection
${this.reflectionQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

### Tags & Themes
<!-- Add any relevant tags: #fantasy #romance #hockey #enemies-to-lovers etc. -->

### Quotes & Highlights
<!-- Any favorite quotes or passages that stood out -->

### Connection to Other Books
<!-- How does this compare to other books you've read? Similar themes or styles? -->

---
*Reflection created: ${new Date().toISOString().split('T')[0]}*
`;
  }

  async createReflectionTemplate(book) {
    const bookId = book.goodreads_id || book.guid;
    const bookReflectionDir = path.join(REFLECTIONS_DIR, bookId);
    const reflectionFile = path.join(bookReflectionDir, 'reflection.md');
    
    try {
      // Create directory if it doesn't exist
      await fs.mkdir(bookReflectionDir, { recursive: true });
      
      // Check if reflection already exists
      try {
        await fs.access(reflectionFile);
        console.log(`Reflection already exists for ${book.title}`);
        return;
      } catch (error) {
        // File doesn't exist, create it
      }
      
      const template = this.generatePromptForBook(book);
      await fs.writeFile(reflectionFile, template);
      
      console.log(`Created reflection template for ${book.title}`);
    } catch (error) {
      console.error(`Failed to create reflection template for ${book.title}:`, error.message);
    }
  }

  async generatePendingReflectionsReport() {
    const booksNeedingReflection = await this.findBooksNeedingReflection();
    
    if (booksNeedingReflection.length === 0) {
      console.log('No books currently need reflection prompts');
      return null;
    }
    
    console.log(`Found ${booksNeedingReflection.length} books needing reflection`);
    
    const reportContent = `# Pending Book Reflections

Generated on: ${new Date().toISOString().split('T')[0]}
Books finished in the last 30 days without reflections: ${booksNeedingReflection.length}

${booksNeedingReflection.map(book => {
  const ratingStars = book.user_rating ? '⭐'.repeat(parseInt(book.user_rating)) : '';
  return `## 📚 ${book.title} by ${book.author_name}

**Finished**: ${book.date_finished}
**Rating**: ${book.user_rating || 'Not rated'}/5 ${ratingStars}
**Genre**: ${book.genre || 'Not specified'}
${book.series_name ? `**Series**: ${book.series_name} #${book.series_number}` : ''}
${book.book_description ? `\n**Description**: ${book.book_description.substring(0, 200)}...` : ''}

[Start Reflection](../reflections/${book.goodreads_id || book.guid}/reflection.md)

---`;
}).join('\n\n')}

## Reflection Questions to Consider

${this.reflectionQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## Tips for Writing Reflections

- **Be honest**: Write your genuine thoughts, even if they're mixed
- **Use specific examples**: Reference particular scenes, characters, or quotes
- **Connect to personal experience**: How did the book relate to your life?
- **Consider the genre**: Evaluate how well it delivered on genre expectations
- **Think about impact**: Will you remember this book in a year? Why?

---
*Report generated automatically by ShelfHelp AI*
`;
    
    // Ensure reports directory exists
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    
    const reportPath = path.join(REPORTS_DIR, 'pending-reflections.md');
    await fs.writeFile(reportPath, reportContent);
    
    console.log(`Created pending reflections report: ${reportPath}`);
    return reportPath;
  }

  async checkReflectionCompleteness() {
    const books = await this.readBooksData();
    const finishedBooks = books.filter(book => book.status === 'finished');
    
    let completedReflections = 0;
    let totalFinished = finishedBooks.length;
    const missingReflections = [];
    
    for (const book of finishedBooks) {
      const bookId = book.goodreads_id || book.guid;
      const reflectionPath = path.join(REFLECTIONS_DIR, bookId, 'reflection.md');
      
      try {
        await fs.access(reflectionPath);
        completedReflections++;
      } catch (error) {
        missingReflections.push(book);
      }
    }
    
    const completionRate = totalFinished > 0 ? (completedReflections / totalFinished * 100).toFixed(1) : 0;
    
    return {
      totalFinished,
      completedReflections,
      completionRate,
      missingCount: missingReflections.length,
      missingReflections: missingReflections.slice(0, 10) // Limit to first 10 for reporting
    };
  }

  async generateReflectionSummary() {
    const stats = await this.checkReflectionCompleteness();
    const recentlyNeedingReflection = await this.findBooksNeedingReflection(7); // Last week
    
    const summary = `# Reflection Summary Report

Generated: ${new Date().toISOString().split('T')[0]}

## Overall Reflection Statistics

📊 **Completion Rate**: ${stats.completionRate}% (${stats.completedReflections}/${stats.totalFinished} finished books)
📝 **Missing Reflections**: ${stats.missingCount} books
🕐 **Recent (Last 7 days)**: ${recentlyNeedingReflection.length} books need reflection

## Recent Books Needing Reflection

${recentlyNeedingReflection.length > 0 ? 
  recentlyNeedingReflection.map(book => `- **${book.title}** by ${book.author_name} (finished: ${book.date_finished})`).join('\n') : 
  '*No books finished in the last 7 days need reflection*'}

## Reflection Health Score

${stats.completionRate >= 80 ? '🟢 **Excellent** - Keeping up with reflections!' :
  stats.completionRate >= 60 ? '🟡 **Good** - Most books have reflections' :
  stats.completionRate >= 40 ? '🟠 **Fair** - Some books missing reflections' :
  '🔴 **Needs Attention** - Many books need reflections'}

## Recommendations

${recentlyNeedingReflection.length > 3 ? 
  '- Consider setting aside time for reflection writing\n- Try shorter, bullet-point style reflections for easier completion' :
  recentlyNeedingReflection.length > 0 ?
  '- You have a few recent books to reflect on - great time to catch up!' :
  '- Excellent reflection habits! Keep it up!'}

---
*Generated automatically by ShelfHelp AI*
`;
    
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const summaryPath = path.join(REPORTS_DIR, 'reflection-summary.md');
    await fs.writeFile(summaryPath, summary);
    
    return {
      summaryPath,
      stats,
      recentCount: recentlyNeedingReflection.length
    };
  }
}

// CLI interface
async function main() {
  const automation = new ReflectionAutomation();
  const command = process.argv[2] || 'check';
  
  try {
    switch (command) {
      case 'check':
        console.log('Checking for books needing reflection...');
        const books = await automation.findBooksNeedingReflection();
        if (books.length > 0) {
          console.log(`Found ${books.length} books needing reflection:`);
          books.forEach(book => {
            console.log(`- ${book.title} by ${book.author_name} (${book.date_finished})`);
          });
          await automation.generatePendingReflectionsReport();
        } else {
          console.log('All recent books have reflections! 🎉');
        }
        break;
        
      case 'create-prompts':
        console.log('Creating reflection prompts for recent books...');
        const needingReflection = await automation.findBooksNeedingReflection();
        if (needingReflection.length > 0) {
          await automation.createReflectionPrompts(needingReflection);
          console.log(`Created reflection templates for ${needingReflection.length} books`);
        }
        break;
        
      case 'summary':
        console.log('Generating reflection summary report...');
        const result = await automation.generateReflectionSummary();
        console.log(`Summary report created: ${result.summaryPath}`);
        console.log(`Reflection completion rate: ${result.stats.completionRate}%`);
        break;
        
      case 'weekly':
        console.log('Running weekly reflection automation...');
        const weeklyBooks = await automation.findBooksNeedingReflection(7);
        if (weeklyBooks.length > 0) {
          await automation.createReflectionPrompts(weeklyBooks);
          await automation.generatePendingReflectionsReport();
          console.log(`Weekly automation complete - ${weeklyBooks.length} books processed`);
        } else {
          console.log('No books need reflection prompts this week');
        }
        break;
        
      default:
        console.log(`
Usage: node reflection-automation.js [command]

Commands:
  check          Check for books needing reflection (default)
  create-prompts Create reflection templates for books
  summary        Generate reflection completion summary
  weekly         Run weekly reflection automation
        `);
    }
  } catch (error) {
    console.error('Reflection automation failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { ReflectionAutomation };