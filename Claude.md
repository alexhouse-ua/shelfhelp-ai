# Claude.md - ShelfHelp AI Assistant

## How to Use This File
- This file contains essential project information needed for every development session
- Detailed documentation can be found in referenced files in the `docs/` directory
- Update both this file and referenced files when making changes
- Always review this file before starting any development work
- Complex coding should happen in Claude Code for optimal performance

## Project Overview

AI-powered reading assistant with real-time queue management and intelligent book classification. The system provides conversational interfaces for managing reading queues, generating personalized recommendations, and automating reflection workflows.

**Architecture**: Node.js Express API + File-based storage + Optional Firebase sync + RAG-powered recommendations

**Core Philosophy**: Zero-cost operation beyond existing subscriptions, file-based canonical storage with Firebase real-time sync, comprehensive audit trails, mobile-first conversational interfaces, and personal use focused (no social features).

### Key Requirements

- **Zero incremental cost** - no paid APIs beyond existing ChatGPT Plus/Claude Pro subscriptions
- **File-based canonical store** - `books.json` is the single source of truth
- **All CRUD through API layer** - never write directly to JSON files
- **RAG before recommendations** - always query vector index first for contextual responses
- **Git audit trail** - every change logged in `history/*.jsonl`
- **Mobile-first UX** - all essential flows must work within chat interfaces  
- **Personal use focused** - no social features, multi-user support, or community aspects
- **Firebase real-time sync** - multi-device support using free tier limitations
- **Romance-focused recommendations** - primary genre focus with mood-based variety
- **Set-and-forget automation** - minimal maintenance required
- **Detailed metadata** - comprehensive book classification including spice, tropes, themes
- **Maintain backward compatibility** - never change existing field names without migration
- **Validate against classifications** - all genre/trope values must exist in `classifications.yaml`

## Important References

| File | Purpose | When to Reference |
|------|---------|-------------------|
| `docs/workflows/Task_Management_Guide.md` | **Master task tracking and project phases** | **EVERY SESSION - Check active tasks and update progress** |
| `backend-audit-questions.txt` | **User preferences and answered questions** | **Reference for all development decisions** |
| `BACKEND_AUDIT_REPORT.md` | **Architecture analysis and optimization plan** | **For performance and structure improvements** |
| `docs/guides/Operating_Instructions.md` | Field dictionary and operational rules | Before any book data modifications |
| `docs/workflows/Project_Plan.md` | Complete project strategy and architecture | For major feature decisions |
| `docs/reports/summary.md` | Current project status and priorities | Every session to understand current state |
| `data/classifications.yaml` | Authoritative genre/trope taxonomy | When adding/validating book metadata |
| `data/books.json` | Canonical book records | Never modify directly - use API only |
| `scripts/api-server.js` | Main API server | For all API modifications |

## Code Style Guidelines

### General Principles
- **Consistency**: Follow existing patterns in the codebase
- **Validation**: All inputs must be validated before processing
- **Error Handling**: Graceful degradation and informative error messages
- **Token Conservation**: Optimize for efficient token usage - reference existing files instead of recreating

### File Structure
```
shelfhelp-ai/
├── data/                 # Canonical data store (Git-tracked)
│   ├── books.json       # Primary book records - DO NOT EDIT DIRECTLY
│   ├── classifications.yaml # Genre/subgenre/tropes taxonomy
│   └── preferences.json # User preference vectors
├── scripts/             # API server and background jobs
├── .github/workflows/   # GitHub Actions for automation
├── history/            # Audit trail (append-only JSONL)
├── reflections/        # User reflection markdown files
├── vectorstore/        # RAG index files
└── _knowledge/         # Project documentation - READ BEFORE TASKS
```

### API Design
- **REST conventions**: Proper HTTP status codes and response formats
- **Consistent error responses**: Use standard error format across all endpoints
- **Rate limiting**: Consider performance implications
- **Documentation**: Include helpful usage tips in API responses

### Code Quality
- **Modular design**: Separate concerns into focused modules
- **Comprehensive validation**: Validate all inputs against expected schemas
- **Status reporting**: Include health checks and status endpoints
- **Fallback mechanisms**: Graceful degradation when optional features fail

## Project SDLC

### Development Process
1. **Session Start**: Review `Claude.md` and `_knowledge/Task_Management_Guide.md` for active tasks
2. **Task Selection**: Choose active task from current phase/batch, update status to "IN PROGRESS"
3. **Planning**: Identify specific implementation steps and check dependencies
4. **Implementation**: Make incremental changes, prefer modification over rewriting
5. **Testing**: Test with sample data before full implementation
6. **Task Completion**: Mark task as "COMPLETED" and update progress in Task Management Guide
7. **Documentation**: Update relevant files in `_knowledge/` as needed
8. **Commit Preparation**: Generate git commit command - never commit automatically

### Quality Gates
- **Task Management**: All work must be tracked in `Task_Management_Guide.md` with proper status updates
- **Field Dictionary Compliance**: All book fields must match `Operating_Instructions.md`
- **Classification Validation**: All genre/trope values must exist in `classifications.yaml`
- **API Compatibility**: Changes must not break existing endpoints
- **Error Handling**: All endpoints must handle errors gracefully
- **Token Efficiency**: Minimize token usage by referencing existing implementations

### Change Management
- **Incremental Updates**: Prefer small, focused changes over large rewrites
- **Backward Compatibility**: Never break existing functionality without migration
- **Documentation**: Update both code comments and knowledge files
- **Testing**: Validate changes with representative data
- **Audit Trail**: All changes logged in `history/*.jsonl`

### Summary Instructions
- when you are using compact, focus on tasks complete, decisions made, code changes, completed and outstanding tests and issues, and recommended next steps.

## Build/Test Commands

```bash
# Development server
npm run dev

# Production server
npm start

# Install dependencies
npm install

# Test API endpoints (manual)
# Use api-tests.http file for manual testing
```

### Testing Strategy
- **Manual API Testing**: Use `api-tests.http` file for endpoint validation
- **Sample Data**: Always test with small JSON arrays before full implementation
- **Error Scenarios**: Test graceful failure modes
- **Performance**: Monitor response times, especially for fuzzy matching operations

## Development Status

**Current Status**: See [Task Management Guide](docs/workflows/Task_Management_Guide.md) for complete project status, active tasks, and progress tracking.

**Recent Updates (July 17, 2025)**:
- ✅ **API Server**: Operational at port 3000 (`scripts/core/api-server.js`)
- ✅ **Validation Framework**: Enhanced confidence scoring, false positive reduction
- ✅ **Scraper Testing**: All scrapers tested and functional
- ✅ **Stats Bug**: Fixed orchestrator success rate calculation (was 300%, now 100%)

### Completed Features
- **Core API Infrastructure**: Express server with CRUD operations (`scripts/core/api-server.js`)
- **RSS Ingestion Pipeline**: Automated Goodreads RSS polling (`scripts/rss_ingest.js`)
- **RAG Vector Store**: Chromadb integration for contextual recommendations (`scripts/rag_ingest.js`)
- **Fuzzy Classification System**: Intelligent book classification with confidence scoring
- **Book Management**: Complete lifecycle management with validation
- **Reflection System**: Automated reflection file generation
- **Reporting System**: Weekly/monthly report generation
- **Firebase Integration**: Optional real-time sync with graceful degradation
- **GitHub Actions**: Automated workflows for RSS sync and RAG rebuilds
- **External Recommendation Sources**: 51 sources across 3 tiers with intelligent prioritization
- **Advanced Preference Learning**: Seasonal patterns, genre evolution, reading personality profiling
- **Smart Queue Management**: Intelligent TBR prioritization with comprehensive analytics
- **Web Scraping Architecture**: Complete transition from API-dependent to scraping-only availability checking
- **Validation Framework**: Unified confidence scoring and false positive reduction system
- **Enhanced Scraper Testing**: Comprehensive testing suite with performance benchmarks

### Core API Endpoints
- **`/api/classifications`**: Returns fuzzy matching capabilities with classification data
- **`/api/classify-book`**: AI agent endpoint for intelligent book classification
- **`/api/match-classification`**: Targeted matching for specific classification fields
- **`/api/recommendations/discover`**: External book discovery with prioritized source strategies
- **`/api/queue/tbr`**: Intelligent TBR queue with preference-based scoring
- **`/api/queue/reorder`**: Manual queue reordering with position tracking
- **`/api/queue/promote`**: Quick book promotion to top priority
- **`/api/queue/insights`**: Detailed queue analytics and health metrics
- **Enhanced validation**: `validateBookFields()` with fuzzy matching integration
- **`/health`**: Server health check endpoint (confirms server operational status)

### Current Architecture Status
- **Backend**: Express.js with modular design ✅
- **Data Storage**: Local JSON with optional Firebase sync ✅
- **Classification**: YAML-based taxonomy with fuzzy matching ✅
- **Recommendations**: 51 external sources with intelligent prioritization ✅
- **Preference Learning**: Advanced analytics with personality profiling ✅
- **Queue Management**: Smart prioritization with comprehensive insights ✅
- **AI Integration**: Endpoints optimized for AI agent consumption ✅
- **Error Handling**: Comprehensive validation and graceful degradation ✅
- **Availability Checking**: Web scraping architecture with no API dependencies ✅
- **Validation Framework**: Unified confidence scoring and false positive reduction ✅
- **Scraper Testing**: Comprehensive testing with performance benchmarks ✅

## Next Development Steps

**Active Tasks**: See [Task Management Guide](docs/workflows/Task_Management_Guide.md) for current active tasks and detailed implementation plans.

**Current Priority**: **Phase 2 - Batch 6**: Architecture refactoring including service registry, data layer abstraction, and validation framework optimization.

### Ready for Production
- Core recommendation and queue management systems are complete and functional
- All major API endpoints implemented with comprehensive error handling
- Preference learning system provides intelligent insights and personality profiling
- External recommendation sources provide structured discovery workflows
- Smart queue prioritization enables effective TBR management
- Web scraping architecture eliminates API dependencies and provides reliable availability checking

---

**Important Notes**:
- After any testing, generate command for git commit - never commit automatically
- The user is on Claude Pro plan - optimize for efficient token usage
- Complex coding tasks should be handled in Claude Code
- Always validate changes against the field dictionary in `Operating_Instructions.md`
- Never modify `books.json` directly - use API endpoints only
