#!/usr/bin/env node

/**
 * Debug script to check file paths and directory structure
 */

const fs = require('fs').promises;
const path = require('path');

async function debugPaths() {
  console.log('🔍 Debugging ShelfHelp file paths...');
  console.log('=====================================\n');

  console.log('📁 Current working directory:', process.cwd());
  console.log('📁 Script location:', __dirname);
  console.log('');

  // Test the paths used by the API server
  const BOOKS_FILE = path.join(__dirname, '../data/books.json');
  const CLASSIFICATIONS_FILE = path.join(__dirname, '../data/classifications.yaml');
  
  console.log('🎯 Expected file paths:');
  console.log('   Books:', BOOKS_FILE);
  console.log('   Classifications:', CLASSIFICATIONS_FILE);
  console.log('');

  // Check if files exist
  try {
    const booksStats = await fs.stat(BOOKS_FILE);
    console.log('✅ books.json found:', booksStats.size, 'bytes');
    
    const booksData = await fs.readFile(BOOKS_FILE, 'utf-8');
    const books = JSON.parse(booksData);
    console.log('   📚 Contains', books.length, 'books');
    
    if (books.length > 0) {
      console.log('   📖 First book:', books[0].title, 'by', books[0].author_name);
      console.log('   🆔 First book goodreads_id:', books[0].goodreads_id);
    }
  } catch (error) {
    console.log('❌ books.json error:', error.message);
  }

  try {
    const classStats = await fs.stat(CLASSIFICATIONS_FILE);
    console.log('✅ classifications.yaml found:', classStats.size, 'bytes');
    
    const yaml = require('yaml');
    const classData = await fs.readFile(CLASSIFICATIONS_FILE, 'utf-8');
    const classifications = yaml.parse(classData);
    
    if (classifications.Genres) {
      console.log('   🏷️  Contains', classifications.Genres.length, 'genres');
    }
    if (classifications.Tropes) {
      console.log('   🎭 Contains', classifications.Tropes.length, 'trope groups');
    }
  } catch (error) {
    console.log('❌ classifications.yaml error:', error.message);
  }

  console.log('\n🔧 Checking package.json and npm scripts...');
  try {
    const packagePath = path.join(__dirname, '../package.json');
    const packageData = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(packageData);
    
    console.log('   📦 Package:', pkg.name);
    console.log('   🚀 Dev script:', pkg.scripts.dev);
    console.log('   📂 Main file:', pkg.main);
  } catch (error) {
    console.log('❌ package.json error:', error.message);
  }

  console.log('\n🌐 Testing if server should be running from project root...');
  
  // Check if running from project root would work better
  const projectRoot = path.join(__dirname, '..');
  const rootBooksPath = path.join(projectRoot, 'data/books.json');
  const rootClassPath = path.join(projectRoot, 'data/classifications.yaml');
  
  console.log('   📁 Project root:', projectRoot);
  console.log('   📚 Root books path:', rootBooksPath);
  
  try {
    const rootBooksExists = await fs.stat(rootBooksPath);
    console.log('   ✅ books.json accessible from root');
  } catch (error) {
    console.log('   ❌ books.json not accessible from root');
  }
}

debugPaths().catch(console.error);
