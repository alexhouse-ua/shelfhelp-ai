# Claude Code Guidelines for Shelf Help AI Assistant

## Project Overview
AI-powered reading assistant with real-time queue management. Uses Node.js + Vercel + Firebase architecture.

## File Structure

shelfhelp-ai/
├── data/                 # Canonical data store (Git-tracked)
│   ├── books.json       # Primary book records
│   ├── classifications.yaml # Genre/subgenre/tropes taxonomy
│   └── preferences.json # User preference vectors
├── scripts/             # API server and background jobs
├── .github/workflows/   # GitHub Actions for automation
├── history/            # Audit trail (append-only JSONL)
├── reflections/        # User reflection markdown files
└── vectorstore/        # RAG index files
└── _knowledge/         # Knowledge files for this project. Do not complete a task without referring to these files.

## Core Constraints
- **Zero cost beyond subscriptions** - no paid APIs or premium tiers
- **File-based canonical store** - books.json is source of truth
- **All CRUD through API layer** - never write directly to JSON files
- **RAG before recommendations** - always query vector index first
- **Git audit trail** - every change logged in history/*.jsonl

## Field Schema (Critical - Don't Modify)
Books must have these exact field names:
- `guid` (string) - Primary key from RSS
- `goodreads_id` (string) - For enrichment
- `status` (enum) - "TBR"|"Reading"|"Finished"|"DNF"|"Archived"
- `title`, `author_name`, `series_name`, `series_number`
- `genre`, `subgenre` (from classifications.yaml)
- `tropes` (array from classifications.yaml)
- `spice` (int 1-5)
- `queue_position`, `queue_priority`
- `liked`, `disliked`, `notes` (reflection data)

## API Endpoints (Follow Exactly)
- `GET /api/books` - Query with filters
- `POST /api/books` - Add new book
- `PATCH /api/books/:id` - Update single field
- `POST /api/sync_rss` - RSS ingestion
- `POST /api/generate_report` - Weekly/monthly reports

## Token Conservation Rules
1. **Reference existing files** instead of recreating from scratch
2. **Make incremental changes** - modify existing code, don't rewrite
3. **Use specific requests** - "Add error handling to api-server.js line 45" not "improve the API"
4. **Check current implementation first** - read files before suggesting changes

## Error Prevention
- **Never hardcode credentials** - use .env variables
- **Validate against classifications.yaml** - all genre/trope values must exist there
- **Maintain backward compatibility** - don't change existing field names
- **Test with sample data** - use small JSON arrays for testing
- **Follow REST conventions** - proper HTTP status codes and response formats

## Common Tasks
- **Adding new book fields:** Update field dictionary in Operating Instructions first
- **RSS changes:** Modify scripts/rss_ingest.js, test with sample feed
- **Queue logic:** Changes go in scripts/queue_manager.js
- **Reflection prompts:** Update templates in reflections/ directory

## Firebase Integration
- **Realtime Database structure:** Mirror books.json at `/books/{id}`
- **Security rules:** Authenticated read/write only
- **Sync direction:** Always Git → Firebase, never reverse
- **Rate limits:** Batch updates, avoid individual writes per book

## GitHub Actions
- **RSS sync:** Every 6 hours via cron
- **RAG rebuild:** On every push to main
- **Reports:** Weekly Sunday 8PM, Monthly 1st Sunday
- **Free tier limits:** 2000 minutes/month, optimize job duration

## Development Workflow
1. Make changes locally
2. Test with `npm run dev`
3. Commit to Git (triggers RAG rebuild)
4. Deploy via Vercel (auto from main branch)
5. Monitor Firebase console for real-time sync

## Don't Do
- ❌ Write directly to books.json (use API)
- ❌ Modify classifications.yaml structure without updating docs
- ❌ Add paid services or APIs
- ❌ Ignore the Operating Instructions field dictionary
- ❌ Create endpoints not in the Project Plan
- ❌ Hardcode any URLs or credentials

## Current Status (Session 1 Complete)
- Basic API infrastructure working (Firebase temporarily disabled)
- RSS ingestion pipeline operational
- RAG vector store implemented
- All core directories and files created
- Testing framework established

## Known Issues
- Firebase credentials need GitHub Secrets configuration
- Trope validation needs nested structure handling
- API tests need alignment with actual data schema

