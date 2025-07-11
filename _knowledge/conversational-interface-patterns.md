# Mobile-First Conversational Interface Patterns

## Overview

ShelfHelp AI is designed for natural language interactions through ChatGPT, Claude, and mobile chat interfaces. The system is RSS-driven - finished books and ratings come automatically from Goodreads RSS feed, triggering reflection workflows.

## Core Design Principles

### 1. RSS-Driven Automation
- **Finished Books**: Detected automatically from RSS feed with ratings
- **Reflection Triggers**: Prompted when new finished books appear
- **User Focus**: TBR management, recommendations, analytics queries
- **Natural Language**: Flexible input, no rigid command structure

### 2. Mobile-Optimized Responses
- **Concise**: Under 2000 characters for mobile readability
- **Structured**: Bullet points, emojis, progressive disclosure
- **Actionable**: Clear next steps and quick options

## Primary User Workflows

### 1. TBR Management (Most Common)
**Natural Language Examples:**
- "Add Iron Flame to my TBR"
- "Put that hockey romance at the top of my queue"
- "Remove this book from my list"
- "Move Fourth Wing up in priority"
- "Show me my TBR queue"

**AI Response Pattern:**
```
✅ Added "Iron Flame" by Rebecca Yarros to TBR
📍 Position #47 in queue | 🔼 Move up? | 📚 Similar books?
```

### 2. Recommendation Requests
**Natural Language Examples:**
- "What should I read next?"
- "I want something like Fourth Wing but darker"
- "Recommend me a hockey romance"
- "I'm in the mood for light contemporary romance"
- "Show me what's trending in fantasy"

**AI Response Pattern:**
```
📚 Based on your love for fantasy romance:

From your TBR:
📖 House of Earth and Blood (Sarah J. Maas) - Epic fantasy
📖 From Blood and Ash (Jennifer Armentrout) - Chosen one romance

Trending now:
🔥 Assistant to the Villain (Hannah Nicole Maehrer) - Viral on BookTok
🔥 One Dark Window (Rachel Gillig) - Dark fantasy cards magic

[Add to TBR] [More details] [Different genre]
```

### 3. Reading Analytics & Insights
**Natural Language Examples:**
- "How's my reading going this year?"
- "What genres do I read most?"
- "Am I meeting my reading goals?"
- "Show me my reading patterns"
- "What's my average rating?"
- "When do I read the most?"

**AI Response Pattern:**
```
📊 Your 2024 Reading Insights:

📚 Progress: 47/60 books (ahead of pace!)
⭐ Average rating: 4.2/5 stars
🎭 Top genre: Fantasy Romance (34%)
📈 Best month: March (8 books)
🔥 Current streak: 12 days reading

Trends:
• You love books 4+ stars (87% of reads)
• Fantasy Romance is your comfort zone
• Series hooks you (avg 3.2 books per series)

[Detailed report] [Update goals] [Genre exploration]
```

### 4. RSS-Triggered Reflections
**Automatic Flow:**
```
📖 I see you finished "Fourth Wing" with 5 stars! 

Ready for reflection questions?
• What did you love most about this book?
• Would you recommend it? Why?
• How did it compare to your expectations?

[Start now] [Later today] [Skip this time]
```

## Prioritized Recommendation Resources

The system uses a comprehensive YAML-based source hierarchy stored in `data/recommendation-sources.yaml` with over 150 curated sources organized by priority and specialty.

### Tier 1 - Primary Sources (Priority Weight: 1.0)
**Bestsellers & Core Discovery:**
- **Goodreads** - Lists, Choice Awards, similar book recommendations (Priority 1)
- **Amazon** - Bestsellers, customer favorites (Priority 2)  
- **New York Times** - Bestseller lists, book reviews (Priority 3)
- **Barnes & Noble** - Staff picks, trending (Priority 4)

**Social & Trending (Weight: 1.3x for trending queries):**
- **BookTok (General)** - #BookTok, #FantasyTok, #RomanceTok trends
- **Romance TikTokers** - beanchambers, Tierny Reads (romance specialists)
- **Book Riot** - Trending articles, upcoming releases
- **BookBub** - Popular recommendations, daily deals

### Tier 2 - Secondary Sources (Priority Weight: 0.7)
**Romance Specialists (Weight: 1.2x for romance queries):**
- **Smart Bitches, Trashy Books** - Romance reviews and trending (Priority 1)
- **All About Romance** - Upcoming releases, comprehensive reviews (Priority 2)
- **Fated Mates** - Podcast recommendations, trending romance (Priority 3)
- **She Reads Romance Books** - New releases, upcoming titles (Priority 4)
- **Romance.io** - Trope and spice level search tools (Priority 5)

**Professional Reviews:**
- **Kirkus Reviews** - Professional book reviews, new releases
- **Publishers Weekly** - Industry insights, bestseller analysis  
- **Library Journal** - Librarian recommendations
- **BookPage** - New release spotlights

**BookTubers & Influencers:**
- **A Clockwork Reader, Ava's Romance Books** - YouTube book reviews
- **Chandler Ainsley, Loch's Library** - Romance-focused content
- **Modern Mrs. Darcy** - Book discovery and recommendations

**Traditional Media:**
- **Entertainment Weekly, POPSUGAR** - Pop culture book trends
- **Cosmopolitan, BuzzFeed** - Lifestyle-oriented book content
- **Oprah Daily** - Book club selections and recommendations

### Tier 3 - Extended Sources (Priority Weight: 0.4)
**Community-Driven:**
- **Reddit r/RomanceBooks, r/FantasyRomance** - Community recommendations
- **Fated Mates Discord** - Real-time romance book discussions
- **Romance Devoured** - Community-curated lists

**Retailers & Audiobooks:**
- **Audible (US/UK)** - Audiobook bestsellers and trending
- **Kobo, Indigo** - International perspective and staff picks

**Specialized Bloggers:**
- 50+ curated book blogs covering niches like **The Candid Cover** (romance), **Forever She Reads**, **Under the Covers Book Blog**

**Lifestyle Magazines:**
- **Elle, Marie Claire, People** - Mainstream book coverage

### Dynamic Source Selection
The AI automatically prioritizes sources based on query type:
- **Romance queries** → Romance specialists get 1.2x weight boost
- **Trending requests** → Social sources get 1.3x weight boost  
- **Bestseller queries** → Traditional bestseller sources prioritized
- **Discovery requests** → Community and blog sources emphasized

### Search Pattern Examples
```yaml
Romance trending: "romance books trending on {source}"
Similar books: "{source} books like {book_title}"  
New releases: "{source} new releases {month} {year}"
Spicy romance: "{source} spicy romance recommendations"
```

The system includes 150+ sources with pre-defined search patterns, scope tags (romance/overall), and algorithmic priority weights for optimal recommendation discovery.

## API Endpoints for Conversational Use

### GET /api/chat/recommendations/discover
**Purpose**: External book discovery with YAML-based source prioritization
```json
{
  "query": "dark fantasy romance trending 2024",
  "search_strategy": {
    "source_file": "data/recommendation-sources.yaml",
    "tier1_primary": {
      "weight": 1.0,
      "sources": ["goodreads", "booktok_general", "book_riot", "bookbub"],
      "romance_boost": 1.2,
      "trending_boost": 1.3
    },
    "tier2_secondary": {
      "weight": 0.7, 
      "romance_specialists": ["smart_bitches_trashy_books", "all_about_romance", "fated_mates"],
      "booktubers": ["avas_romance_books", "chandler_ainsley", "lochs_library"]
    },
    "search_patterns": [
      "romance books trending on {source}",
      "{source} dark fantasy romance 2024",
      "{source} spicy romantasy recommendations"
    ]
  },
  "user_context": {
    "recent_loves": ["Fourth Wing", "ACOTAR"],
    "preferred_genres": ["Fantasy Romance", "Dark Fantasy"],
    "scope_preference": "romance",
    "avoid": ["YA", "Dystopian"]
  }
}
```

### GET /api/analytics/reading-patterns
**Purpose**: Comprehensive reading analytics
```json
{
  "timeframe": "2024",
  "summary": {
    "books_read": 47,
    "pages_read": 18430,
    "average_rating": 4.2,
    "reading_pace": "1.2 books/week"
  },
  "patterns": {
    "top_genres": [{"genre": "Fantasy Romance", "count": 16, "percentage": 34}],
    "monthly_distribution": [{"month": "Jan", "books": 3}, ...],
    "rating_distribution": {"5_star": 23, "4_star": 18, "3_star": 6},
    "series_vs_standalone": {"series": 34, "standalone": 13}
  },
  "insights": [
    "You consistently rate Fantasy Romance highest (avg 4.7/5)",
    "March was your most productive reading month",
    "You rarely DNF books (2% abandonment rate)"
  ]
}
```

### POST /api/chat/natural-language
**Purpose**: Parse any natural input into actions
```json
{
  "input": "I want something like ACOTAR but spicier, what's trending?",
  "parsed_intent": {
    "action": "get_recommendations",
    "criteria": {
      "similar_to": "A Court of Thorns and Roses",
      "spice_level": "higher",
      "source": "trending"
    },
    "search_sources": ["booktok_spicy", "goodreads_similar", "romance_trending"]
  },
  "response": "🔥 Spicy Fantasy Romance trending now (like ACOTAR but steamier)..."
}
```

## Response Formatting Patterns

### Success with Options
```json
{
  "success": true,
  "message": "✅ Found 5 trending dark fantasy romances",
  "results": [...],
  "quick_actions": [
    {"text": "Add top pick to TBR", "action": "add_book", "book_id": "123"},
    {"text": "See more details", "action": "expand_details"},
    {"text": "Different genre?", "action": "new_search"}
  ]
}
```

### Analytics Insights
```json
{
  "insight_type": "reading_pattern",
  "headline": "📊 You're a Fantasy Romance devotee!",
  "details": [
    "34% of your reads are Fantasy Romance (16/47 books)",
    "You rate them 4.7/5 on average (highest of any genre)",
    "Current streak: 4 Fantasy Romance books in a row"
  ],
  "suggestions": [
    "Try Urban Fantasy for similar vibes?",
    "Explore Paranormal Romance recommendations",
    "Branch out with Romantic Fantasy"
  ]
}
```

## Natural Language Flexibility Examples

### Recommendation Requests
- "What should I read next?" → TBR + trending recommendations
- "I need something light and funny" → Comedy/contemporary with mood matching
- "Give me the BookTok favorites" → Trending social media books
- "What's hot in fantasy right now?" → Genre-specific trending
- "Find me books like [title]" → Similar book recommendations

### Analytics Queries  
- "How am I doing this year?" → Annual reading summary
- "What do I read most?" → Genre/author analysis
- "Am I a fast reader?" → Reading pace analytics
- "Do I finish books?" → Completion rate insights
- "What trends do you see?" → Pattern analysis

### TBR Management
- "Add this to my list" → Add to TBR with context
- "What's next in my queue?" → TBR queue status
- "Move this up" → Adjust priority
- "Clean up my TBR" → Queue organization suggestions

## Error Handling & Fallbacks

### Ambiguous Requests
```
User: "Add that book"
AI: 🤔 Which book would you like to add?
   • Last book we discussed: "Iron Flame"
   • From recent search: "Assistant to the Villain"
   • Or describe the book you mean
```

### No Results Found
```
User: "Find me steampunk romance"
AI: 😅 I couldn't find trending steampunk romance right now.

   Alternatives:
   📚 Try Historical Romance with mechanical elements
   📚 Fantasy Romance with industrial settings  
   📚 Browse your TBR for hidden gems?
```

## Integration Notes

### Source Priority Logic
1. **Always check Tier 1** sources first for recommendations
2. **Combine multiple sources** for comprehensive results  
3. **Note source attribution** in responses ("Trending on BookTok")
4. **Fall back gracefully** if primary sources unavailable

### Context Persistence
- **Remember preferences** from previous conversations
- **Reference reading history** for personalization
- **Track ongoing conversations** about specific books/topics
- **Maintain session context** for multi-turn workflows

### Mobile Optimization
- **Progressive disclosure**: Summary first, details on request
- **Touch-friendly options**: Clear action buttons/quick replies
- **Scanning-optimized**: Emojis and bullet points for easy reading
- **Voice-ready**: Works well with voice input/output