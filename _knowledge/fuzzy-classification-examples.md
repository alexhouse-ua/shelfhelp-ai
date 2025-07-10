# Fuzzy Classification Examples

## Overview
The ShelfHelp AI system now includes intelligent fuzzy matching for book classification. This allows for flexible input handling and automatic correction of typos, case variations, and similar classification values.

## API Endpoints

### 1. `/api/classify-book` - Intelligent Book Classification
Analyzes book data and returns fuzzy-matched classifications with confidence scores.

**Request:**
```json
{
  "title": "The Way of Kings",
  "author": "Brandon Sanderson", 
  "genre": "epic fantasy",
  "subgenre": "high fantasy",
  "tropes": ["chosen one", "epic quest", "magic system"]
}
```

**Response:**
```json
{
  "success": true,
  "classification": {
    "original": {
      "title": "The Way of Kings",
      "author": "Brandon Sanderson",
      "genre": "epic fantasy",
      "subgenre": "high fantasy",
      "tropes": ["chosen one", "epic quest", "magic system"]
    },
    "matched": {
      "genre": "Fantasy",
      "subgenre": "High / Epic Fantasy",
      "tropes": ["Chosen One", "Epic Quest", "Magic in the Mundane"]
    },
    "confidence": {
      "genre": 0.89,
      "subgenre": 0.95,
      "tropes": [0.92, 0.88, 0.85]
    },
    "overallConfidence": 0.90
  }
}
```

### 2. `/api/match-classification` - Targeted Field Matching
Matches a specific classification field with fuzzy logic.

**Genre Matching:**
```json
// Request
{
  "type": "genre",
  "value": "fantsy"  // typo
}

// Response
{
  "success": true,
  "type": "genre",
  "input": "fantsy",
  "match": {
    "value": "Fantasy",
    "confidence": 0.86
  }
}
```

**Subgenre Matching:**
```json
// Request
{
  "type": "subgenre", 
  "value": "urben fantasy"  // typo
}

// Response
{
  "success": true,
  "type": "subgenre",
  "input": "urben fantasy",
  "match": {
    "value": "Urban Fantasy",
    "confidence": 0.91
  }
}
```

**Trope Matching:**
```json
// Request
{
  "type": "tropes",
  "value": "enemies to lovers"
}

// Response
{
  "success": true,
  "type": "tropes", 
  "input": "enemies to lovers",
  "match": [
    {
      "value": "Enemies-to-Lovers",
      "confidence": 1.0
    }
  ]
}
```

**Spice Level Matching:**
```json
// Request
{
  "type": "spice",
  "value": "steamy"
}

// Response
{
  "success": true,
  "type": "spice",
  "input": "steamy",
  "match": {
    "value": 3,
    "confidence": 0.8,
    "reason": "Matched keyword: \"steamy\""
  }
}
```

### 3. `/api/classifications` - Enhanced Classifications Data
Returns full classification taxonomy with fuzzy matching status.

**Response includes:**
```json
{
  "Genres": [...],
  "Spice_Levels": [...],
  "Tropes": [...],
  "fuzzyMatching": {
    "enabled": true,
    "available": {
      "genres": ["Fantasy", "Romance", "Mystery & Crime", ...],
      "subgenres": ["Urban Fantasy", "High / Epic Fantasy", ...],
      "tropes": ["Enemies-to-Lovers", "Chosen One", ...],
      "spiceLevels": [1, 2, 3, 4, 5]
    }
  }
}
```

## Common Use Cases

### 1. Book Addition with Typos
```bash
curl -X POST http://localhost:3000/api/classify-book \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fourth Wing",
    "author": "Rebecca Yarros",
    "genre": "romace",          # typo
    "subgenre": "fantsy romace", # typos
    "tropes": ["enemies to lovers", "dragons", "acadmy"]  # typos
  }'
```

**AI Agent Workflow:**
1. Use `/api/classify-book` to get corrections
2. Present suggestions to user with confidence scores
3. Use corrected values in `/api/books` creation

### 2. Interactive Classification
```bash
# Step 1: User enters approximate genre
curl -X POST http://localhost:3000/api/match-classification \
  -d '{"type": "genre", "value": "mystery"}'

# Step 2: Get specific subgenre suggestions
curl -X POST http://localhost:3000/api/match-classification \
  -d '{"type": "subgenre", "value": "cozy mystery"}'

# Step 3: Add matching tropes
curl -X POST http://localhost:3000/api/match-classification \
  -d '{"type": "tropes", "value": "amateur sleuth"}'
```

### 3. Batch Classification
```bash
# Process multiple books with fuzzy matching
for book in "fantsy" "romace" "mystery"; do
  curl -X POST http://localhost:3000/api/match-classification \
    -d "{\"type\": \"genre\", \"value\": \"$book\"}"
done
```

## Error Handling

### When Fuzzy Matching Unavailable
```json
{
  "error": "Fuzzy classification not available",
  "message": "Please try again in a moment"
}
```

### Invalid Classification Types
```json
{
  "error": "Type and value are required",
  "supportedTypes": ["genre", "subgenre", "tropes", "spice"]
}
```

## Confidence Thresholds

### Recommended Confidence Levels:
- **High Confidence (0.9+)**: Auto-accept matches
- **Medium Confidence (0.7-0.89)**: Suggest with user confirmation
- **Low Confidence (0.5-0.69)**: Present as option with alternatives  
- **Very Low (<0.5)**: Reject and ask for clarification

## AI Agent Integration Tips

1. **Always use fuzzy matching first** before rejecting user input
2. **Present confidence scores** to help users make decisions
3. **Batch multiple classifications** for better performance
4. **Cache fuzzy matching results** for repeated queries
5. **Fall back gracefully** when fuzzy matching is unavailable

## Performance Considerations

- Fuzzy matching adds ~10-50ms per request
- Classification data is loaded once at startup
- Cache results for repeated queries
- Use targeted `/api/match-classification` for single fields
- Use comprehensive `/api/classify-book` for full book data

## Future Enhancements

- **Learning System**: Track user corrections to improve matching
- **Custom Thresholds**: Per-user confidence level preferences  
- **Bulk Operations**: Process multiple books simultaneously
- **Analytics**: Track fuzzy matching effectiveness and accuracy