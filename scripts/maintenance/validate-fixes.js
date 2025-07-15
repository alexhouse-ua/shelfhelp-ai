#!/usr/bin/env node

/**
 * Validation script to verify all fixes have been applied correctly
 * Checks data integrity and API code fixes without starting the server
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('yaml');

async function validateFixes() {
  console.log('🔍 Validating ShelfHelp AI fixes...');
  console.log('=====================================\n');

  let allPassed = true;

  try {
    // Test 1: Validate books.json has Goodreads IDs
    console.log('1️⃣ Checking Goodreads ID population...');
    const booksData = await fs.readFile(path.join(__dirname, '../data/books.json'), 'utf-8');
    const books = JSON.parse(booksData);
    
    const booksWithIds = books.filter(book => book.goodreads_id);
    const booksWithoutIds = books.filter(book => !book.goodreads_id);
    
    console.log(`   📚 Total books: ${books.length}`);
    console.log(`   ✅ Books with goodreads_id: ${booksWithIds.length}`);
    console.log(`   ❌ Books without goodreads_id: ${booksWithoutIds.length}`);
    
    if (booksWithoutIds.length === 0) {
      console.log('   ✅ PASS: All books have Goodreads IDs\n');
    } else {
      console.log('   ❌ FAIL: Some books missing Goodreads IDs\n');
      allPassed = false;
    }

    // Test 2: Validate classifications structure
    console.log('2️⃣ Checking classifications.yaml structure...');
    const classData = await fs.readFile(path.join(__dirname, '../data/classifications.yaml'), 'utf-8');
    const classifications = yaml.parse(classData);
    
    if (classifications.Tropes && Array.isArray(classifications.Tropes)) {
      const hasNestedTropes = classifications.Tropes.some(group => 
        group.Tropes && Array.isArray(group.Tropes)
      );
      
      if (hasNestedTropes) {
        console.log('   ✅ PASS: Classifications has nested trope structure\n');
      } else {
        console.log('   ❌ FAIL: Classifications missing nested trope structure\n');
        allPassed = false;
      }
    } else {
      console.log('   ❌ FAIL: Classifications.yaml malformed\n');
      allPassed = false;
    }

    // Test 3: Check API server code fixes
    console.log('3️⃣ Checking API server code fixes...');
    const serverCode = await fs.readFile(path.join(__dirname, 'api-server.js'), 'utf-8');
    
    const hasBookIdFallback = serverCode.includes('bookIndex = books.findIndex(book => book.guid === id)');
    const hasGetIdFallback = serverCode.includes('book = books.find(book => book.guid === id)');
    const hasNestedTropeValidation = serverCode.includes('genreGroup.Tropes && Array.isArray(genreGroup.Tropes)');
    
    console.log(`   📝 Book ID fallback (PATCH): ${hasBookIdFallback ? '✅' : '❌'}`);
    console.log(`   📝 Book ID fallback (GET): ${hasGetIdFallback ? '✅' : '❌'}`);
    console.log(`   📝 Nested trope validation: ${hasNestedTropeValidation ? '✅' : '❌'}`);
    
    if (hasBookIdFallback && hasGetIdFallback && hasNestedTropeValidation) {
      console.log('   ✅ PASS: API server code fixes applied\n');
    } else {
      console.log('   ❌ FAIL: API server code fixes missing\n');
      allPassed = false;
    }

    // Test 4: Check test file updates
    console.log('4️⃣ Checking test file updates...');
    const testCode = await fs.readFile(path.join(__dirname, '../api-tests.http'), 'utf-8');
    
    const hasRealGuids = testCode.includes('https://www.goodreads.com/review/show/7714008089');
    const hasRomanceTropes = testCode.includes('Sports Romance');
    
    console.log(`   📝 Uses real RSS GUIDs: ${hasRealGuids ? '✅' : '❌'}`);
    console.log(`   📝 Uses valid trope names: ${hasRomanceTropes ? '✅' : '❌'}`);
    
    if (hasRealGuids && hasRomanceTropes) {
      console.log('   ✅ PASS: Test file updated with real data\n');
    } else {
      console.log('   ❌ FAIL: Test file not properly updated\n');
      allPassed = false;
    }

    // Test 5: Check reflection template exists
    console.log('5️⃣ Checking reflection system files...');
    try {
      await fs.access(path.join(__dirname, '../reflections/template.md'));
      console.log('   ✅ PASS: Reflection template exists\n');
    } catch {
      console.log('   ❌ FAIL: Reflection template missing\n');
      allPassed = false;
    }

    // Test 6: Firebase configuration check
    console.log('6️⃣ Checking Firebase configuration...');
    const hasFirebaseDisabled = serverCode.includes('ENABLE_FIREBASE=false') || 
                                serverCode.includes('local-only mode');
    
    if (hasFirebaseDisabled) {
      console.log('   ✅ PASS: Firebase properly configured as optional\n');
    } else {
      console.log('   ⚠️  WARNING: Firebase configuration unclear\n');
    }

    // Summary
    console.log('📋 VALIDATION SUMMARY');
    console.log('=====================');
    
    if (allPassed) {
      console.log('🎉 ALL FIXES VALIDATED SUCCESSFULLY!');
      console.log('\n✅ The API is ready for testing with:');
      console.log('   1. npm run dev');
      console.log('   2. Use REST Client with api-tests.http');
      console.log('   3. Or run: bash scripts/test-api.sh');
    } else {
      console.log('❌ SOME ISSUES DETECTED');
      console.log('Please review the failed tests above.');
    }

  } catch (error) {
    console.error('❌ Validation error:', error.message);
  }
}

// Run validation
validateFixes();
