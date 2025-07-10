# Claude.md - ShelfHelp AI Assistant

## How to Use This File
- This file contains essential project information needed for every development session
- Detailed documentation can be found in referenced files in the `_knowledge/` directory
- Update both this file and referenced files when making changes
- Always review this file before starting any development work
- Complex coding should happen in Claude Code for optimal performance

## Project Overview

AI-powered reading assistant with real-time queue management and intelligent book classification. The system provides conversational interfaces for managing reading queues, generating personalized recommendations, and automating reflection workflows.

**Architecture**: Node.js Express API + File-based storage + Optional Firebase sync + RAG-powered recommendations

**Core Philosophy**: Zero-cost operation beyond existing subscriptions, file-based canonical storage, comprehensive audit trails, and mobile-first conversational interfaces.

### Key Requirements

- **Zero incremental cost** - no paid APIs beyond existing ChatGPT Plus/Claude Pro subscriptions
- **File-based canonical store** - `books.json` is the single source of truth
- **All CRUD through API layer** - never write directly to JSON files
- **RAG before recommendations** - always query vector index first for contextual responses
- **Git audit trail** - every change logged in `history/*.jsonl`
- **Mobile-first UX** - all essential flows must work within chat interfaces
- **Maintain backward compatibility** - never change existing field names without migration
- **Validate against classifications** - all genre/trope values must exist in `classifications.yaml`

## Important References

| File | Purpose | When to Reference |
|------|---------|-------------------|
| `_knowledge/Operating_Instructions.md` | Field dictionary and operational rules | Before any book data modifications |
| `_knowledge/Project_Plan.md` | Complete project strategy and architecture | For major feature decisions |
| `_knowledge/summary.md` | Current project status and priorities | Every session to understand current state |
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
1. **Session Start**: Review `Claude.md` and `_knowledge/summary.md` for current state
2. **Planning**: Identify specific tasks and check against existing documentation
3. **Implementation**: Make incremental changes, prefer modification over rewriting
4. **Testing**: Test with sample data before full implementation
5. **Documentation**: Update relevant files in `_knowledge/` as needed
6. **Commit Preparation**: Generate git commit command - never commit automatically

### Quality Gates
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

### Completed Features
- **Core API Infrastructure**: Express server with CRUD operations (`scripts/api-server.js`)
- **RSS Ingestion Pipeline**: Automated Goodreads RSS polling (`scripts/rss_ingest.js`)
- **RAG Vector Store**: Chromadb integration for contextual recommendations (`scripts/rag_ingest.js`)
- **Fuzzy Classification System**: Intelligent book classification with confidence scoring
- **Book Management**: Complete lifecycle management with validation
- **Reflection System**: Automated reflection file generation
- **Reporting System**: Weekly/monthly report generation
- **Firebase Integration**: Optional real-time sync with graceful degradation
- **GitHub Actions**: Automated workflows for RSS sync and RAG rebuilds

### Enhanced API Endpoints
- **`/api/classifications`**: Returns fuzzy matching capabilities with classification data
- **`/api/classify-book`**: AI agent endpoint for intelligent book classification
- **`/api/match-classification`**: Targeted matching for specific classification fields
- **Enhanced validation**: `validateBookFields()` with fuzzy matching integration

### Current Architecture Status
- **Backend**: Express.js with modular design ✅
- **Data Storage**: Local JSON with optional Firebase sync ✅
- **Classification**: YAML-based taxonomy with fuzzy matching ✅
- **AI Integration**: Endpoints optimized for AI agent consumption ✅
- **Error Handling**: Comprehensive validation and graceful degradation ✅

## Next Development Steps

### Immediate Priorities
1. **API Testing**: Comprehensive testing of new fuzzy matching endpoints with real book data
2. **Integration Testing**: Verify fuzzy matcher works correctly with existing workflows
3. **Edge Case Testing**: Test behavior when fuzzy matcher fails to initialize
4. **Performance Testing**: Ensure fuzzy matching doesn't impact API response times

### AI Agent Integration
- **Claude Integration**: Update AI assistant to use new classification endpoints
- **Workflow Optimization**: Streamline book addition/update processes using fuzzy matching
- **Error Recovery**: Improve handling of classification mismatches
- **User Experience**: Provide clear feedback when fuzzy matching suggests corrections

### Technical Debt
- **Test Coverage**: Implement comprehensive test suite
- **Documentation**: Update API documentation to reflect new endpoints
- **Performance**: Consider caching for classification data
- **Security**: Implement rate limiting for production use

### Outstanding Issues
- **Firebase Credentials**: GitHub Secrets configuration needed for full Firebase integration
- **Trope Validation**: Nested structure handling in classifications needs refinement
- **Schema Alignment**: API tests need alignment with actual data schema

### Before Next Session
1. Test all new fuzzy matching endpoints with sample data
2. Verify integration with existing book management workflows
3. Address any initialization failures in fuzzy matching system
4. Document any issues or edge cases discovered during testing
5. Generate git commit command for completed work

---

**Important Notes**:
- After any testing, generate command for git commit - never commit automatically
- The user is on Claude Pro plan - optimize for efficient token usage
- Complex coding tasks should be handled in Claude Code
- Always validate changes against the field dictionary in `Operating_Instructions.md`
- Never modify `books.json` directly - use API endpoints only
