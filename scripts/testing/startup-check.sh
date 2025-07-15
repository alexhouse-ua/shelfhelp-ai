#!/bin/bash

# Startup helper script for ShelfHelp API

echo "🚀 ShelfHelp API Startup Helper"
echo "==============================="

# Check current directory
echo "📁 Current directory: $(pwd)"

# Check if we're in the right place
if [[ $(basename $(pwd)) == "shelfhelp-ai" ]]; then
  echo "✅ In correct project root directory"
else
  echo "❌ Not in project root! Please run:"
  echo "   cd /Users/alhouse2/Documents/GitHub/shelfhelp-ai"
  exit 1
fi

# Check if data files exist
if [[ -f "data/books.json" ]]; then
  BOOK_COUNT=$(grep -o '"title"' data/books.json | wc -l)
  echo "✅ books.json found ($BOOK_COUNT books)"
else
  echo "❌ data/books.json not found!"
  exit 1
fi

if [[ -f "data/classifications.yaml" ]]; then
  echo "✅ classifications.yaml found"
else
  echo "❌ data/classifications.yaml not found!"
  exit 1
fi

# Check if node modules exist
if [[ -d "node_modules" ]]; then
  echo "✅ node_modules installed"
else
  echo "❌ node_modules missing! Run: npm install"
  exit 1
fi

# Check if server script exists
if [[ -f "scripts/api-server.js" ]]; then
  echo "✅ API server script found"
else
  echo "❌ scripts/api-server.js not found!"
  exit 1
fi

echo ""
echo "🎯 Ready to start server! Run:"
echo "   npm run dev"
echo ""
echo "📡 Then test with:"
echo "   bash scripts/test-api.sh"
echo ""
echo "🔧 Or test manually:"
echo "   curl http://localhost:3000/health"
