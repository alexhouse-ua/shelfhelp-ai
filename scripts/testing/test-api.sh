#!/bin/bash

# Test script to verify ShelfHelp API functionality
# Run this after starting the server with: npm run dev

BASE_URL="http://localhost:3000"
echo "🧪 Testing ShelfHelp API endpoints..."
echo "====================================="

# Test 1: Health check
echo "1️⃣ Testing health endpoint..."
curl -s "$BASE_URL/health" | head -c 200
echo -e "\n"

# Test 2: Get all books
echo "2️⃣ Testing GET /api/books..."
BOOK_COUNT=$(curl -s "$BASE_URL/api/books" | grep -o '"title"' | wc -l)
echo "📚 Found $BOOK_COUNT books in the database"

# Test 3: Get specific book by goodreads_id (using first book)
echo "3️⃣ Testing GET /api/books/:id with goodreads_id..."
curl -s "$BASE_URL/api/books/7714008089" | grep -o '"title":"[^"]*"'
echo -e "\n"

# Test 4: Get specific book by guid (RSS URL)
echo "4️⃣ Testing GET /api/books/:id with RSS guid..."
# URL encode the GUID for proper HTTP request
GUID_ENCODED="https%3A//www.goodreads.com/review/show/7714008089%3Futm_medium%3Dapi%26utm_source%3Drss"
curl -s "$BASE_URL/api/books/$GUID_ENCODED" | grep -o '"title":"[^"]*"'
echo -e "\n"

# Test 5: Get queue
echo "5️⃣ Testing GET /api/queue..."
QUEUE_COUNT=$(curl -s "$BASE_URL/api/queue" | grep -o '"queue_position"' | wc -l)
echo "📋 Found $QUEUE_COUNT books in TBR queue"

# Test 6: Get classifications
echo "6️⃣ Testing GET /api/classifications..."
GENRE_COUNT=$(curl -s "$BASE_URL/api/classifications" | grep -o '"Genre"' | wc -l)
echo "🏷️  Found $GENRE_COUNT genres in classifications"

# Test 7: Test trope validation by updating a book
echo "7️⃣ Testing PATCH /api/books/:id with valid tropes..."
PATCH_RESULT=$(curl -s -X PATCH "$BASE_URL/api/books/7714008089" \
  -H "Content-Type: application/json" \
  -d '{"genre":"Romance","subgenre":"Contemporary Romance","tropes":["Sports Romance (Baseball, Fighters, Football, Hockey, Soccer, F1, etc.)","Fake Relationship"],"spice":4}')

if echo "$PATCH_RESULT" | grep -q "updated successfully"; then
  echo "✅ PATCH request successful - trope validation working"
else
  echo "❌ PATCH request failed"
  echo "$PATCH_RESULT"
fi

# Test 8: Mark book as finished to test reflection system
echo "8️⃣ Testing reflection trigger by marking book as Finished..."
FINISH_RESULT=$(curl -s -X PATCH "$BASE_URL/api/books/7714008089" \
  -H "Content-Type: application/json" \
  -d '{"status":"Finished"}')

if echo "$FINISH_RESULT" | grep -q "updated successfully"; then
  echo "✅ Book marked as Finished successfully"
  echo "📝 Checking if reflection file was created..."
  sleep 1
  if [ -d "reflections/7714008089" ]; then
    echo "✅ Reflection directory created"
    ls -la reflections/7714008089/
  else
    echo "❌ Reflection directory not found"
  fi
else
  echo "❌ Failed to mark book as finished"
fi

echo "🎉 API testing complete!"
echo "❓ If you see 0 books, make sure you started the server from the project root:"
echo "   cd /Users/alhouse2/Documents/GitHub/shelfhelp-ai"
echo "   npm run dev"
echo "The fixes are working if you see checkmarks above."
