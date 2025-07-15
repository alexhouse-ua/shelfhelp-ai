# ShelfHelp AI - Master Task Management Guide

**Created**: July 14, 2025  
**Last Updated**: July 14, 2025  
**Status**: Active Development → Conversational Interface Phase  
**Version**: 1.0

---

## 📋 **PROJECT OVERVIEW**

**Mission**: AI-powered reading assistant with intelligent queue management, book classification, and personalized recommendations  
**Philosophy**: Zero-cost operation, file-based canonical storage with Firebase real-time sync, comprehensive audit trails, mobile-first conversational interfaces, personal use focused  
**Current Status**: Core features complete, AI integration done, metadata quality and library accuracy improvements needed

---

## 🎯 **PHASE STRUCTURE**

### **Phase 1: Core Infrastructure** ✅ **COMPLETED**
*Foundation systems and security architecture*

**Status**: ✅ **COMPLETE** (July 12, 2025)
- [x] **P1-B1-001**: API Security Foundation
- [x] **P1-B1-002**: Authentication System  
- [x] **P1-B1-003**: Rate Limiting & CORS
- [x] **P1-B1-004**: Error Handling Framework
- [x] **P1-B2-001**: Book Management System
- [x] **P1-B2-002**: Classification Engine
- [x] **P1-B2-003**: Queue Management
- [x] **P1-B2-004**: Recommendation Engine
- [x] **P1-B3-001**: Preference Learning System
- [x] **P1-B3-002**: Reading Insights Analytics
- [x] **P1-B3-003**: Smart Queue Prioritization
- [x] **P1-B3-004**: External Sources Integration

### **Phase 2: AI Integration & Optimization** 🔄 **IN PROGRESS**
*Conversational interfaces, metadata quality, and library accuracy*

**Status**: 🔄 **IN PROGRESS** (Started July 14, 2025)  
**Focus**: Personal use, romance-focused recommendations, set-and-forget automation
- [x] **P2-B1-001**: CustomGPT Actions Configuration ✅
- [x] **P2-B1-002**: Claude Pro Integration ✅
- [x] **P2-B1-003**: RSS-Driven Preference Learning Workflow ✅
- [x] **P2-B1-004**: RSS-Triggered Preference Learning Validation ✅
- [ ] **P2-B2-001**: Library API Integration (Real credentials needed)
- [ ] **P2-B2-002**: Availability Accuracy Fixes (Affects TBR positioning)
- [ ] **P2-B2-003**: KU/Hoopla False Positive Resolution
- [ ] **P2-B2-004**: Batch Availability Validation
- [ ] **P2-B3-001**: AI Classification Backfill (Fix incomplete metadata)
- [ ] **P2-B3-002**: Web Search Integration (Enhanced book data)
- [ ] **P2-B3-003**: Quality Validation System
- [ ] **P2-B3-004**: Confidence Scoring Optimization
- [ ] **P2-B4-001**: Firebase Real-time Sync Setup (Multi-device support)
- [ ] **P2-B4-002**: Preference Analytics Enhancement (Full DB analysis)
- [ ] **P2-B4-003**: Romance-focused Recommendation Tuning
- [ ] **P2-B4-004**: Detailed Analytics for Personal Insights
- [ ] **P2-B5-001**: 🔴 **CRITICAL: File Organization & Cleanup** (Project structure)
- [ ] **P2-B5-002**: 🔴 **CRITICAL: Performance Optimization** (Caching & response times)
- [ ] **P2-B5-003**: 🔴 **CRITICAL: Remove Technical Debt** (Unused scripts/docs)
- [ ] **P2-B5-004**: 🔴 **CRITICAL: Development Workflow Setup** (Testing & CI/CD)

### **Phase 3: Production Deployment** 📋 **PLANNED**
*Free hosting optimization and set-and-forget automation*

**Status**: 📋 **PLANNED** (Target: August 2025)  
**Focus**: Zero-cost hosting, minimal maintenance, Firebase integration
- [ ] **P3-B1-001**: Free Hosting Deployment (Railway/Vercel)
- [ ] **P3-B1-002**: Firebase Free Tier Integration
- [ ] **P3-B1-003**: Environment Configuration & Failsafes
- [ ] **P3-B1-004**: Health Monitoring Setup
- [ ] **P3-B2-001**: Automated Testing Pipeline
- [ ] **P3-B2-002**: Set-and-Forget Automation
- [ ] **P3-B2-003**: Deployment Automation
- [ ] **P3-B2-004**: Performance Monitoring (Personal use optimized)
- [ ] **P3-B3-001**: Database Performance Optimization
- [ ] **P3-B3-002**: Caching for Full DB Analytics
- [ ] **P3-B3-003**: Mobile Response Optimization
- [ ] **P3-B3-004**: Backup & Recovery Automation

### **Phase 4: Advanced Features** 🎯 **STRATEGIC**
*Enhanced AI capabilities and personal analytics*

**Status**: 🎯 **STRATEGIC** (Target: Q1 2026)  
**Focus**: Personal use only, advanced analytics, AI learning enhancement
- [ ] **P4-B1-001**: Automated Reflection Generation (Book-type specific)
- [ ] **P4-B1-002**: Predictive Recommendations (Romance-focused)
- [ ] **P4-B1-003**: Reading Goal Tracking (Personal analytics)
- [ ] **P4-B1-004**: Trend Analysis & Predictions (Reading patterns)
- [ ] **P4-B2-001**: Enhanced Goodreads Integration (Personal sync only)
- [ ] **P4-B2-002**: Advanced Reading Analytics
- [ ] **P4-B2-003**: Mood-based Recommendation Engine
- [ ] **P4-B2-004**: Seasonal Reading Pattern Analysis
- [ ] **P4-B3-001**: Native Mobile App (Personal use)
- [ ] **P4-B3-002**: Offline Capability
- [ ] **P4-B3-003**: Voice Input for Quick Adds
- [ ] **P4-B3-004**: Advanced AI Learning Integration

---

## 📊 **CURRENT BATCH DETAILS**

### **Phase 2 - Batch 1: AI Integration** 🔄 **ACTIVE**
*Priority*: ⚡ **IMMEDIATE**  
*Target Completion*: July 21, 2025  
*Estimated Hours*: 12-16 hours

#### **P2-B1-001: CustomGPT Actions Configuration**
- **Status**: ✅ **COMPLETED**
- **Assignee**: Development Team
- **Priority**: ⚡ **CRITICAL**
- **Estimated Time**: 2-3 hours
- **Dependencies**: None
- **Description**: Configure OpenAI Actions for ChatGPT Plus integration
- **Files**: `shelfhelp-unified-api-schema.json`, GPT configuration
- **Success Criteria**: 
  - [x] Actions schema validated
  - [x] API endpoints accessible via ChatGPT
  - [x] Mobile chat interface functional
  - [x] Error handling tested
- **Blockers**: None
- **Notes**: ✅ Enhanced schema with ChatGPT-optimized descriptions and additional recommendation endpoints

#### **P2-B1-002: Claude Pro Integration**
- **Status**: ✅ **COMPLETED**
- **Assignee**: Development Team
- **Priority**: ⚡ **HIGH**
- **Estimated Time**: 1-2 hours
- **Dependencies**: P2-B1-001 (CustomGPT completion)
- **Description**: Optimize API responses for Claude Pro consumption
- **Files**: `scripts/api-server.js` response formatting
- **Success Criteria**:
  - [x] API responses optimized for Claude
  - [x] Token usage efficient
  - [x] Error messages helpful
  - [x] Integration tested
- **Blockers**: None
- **Notes**: ✅ Added Claude Pro response optimization middleware with AI-friendly metadata and user messages

#### **P2-B1-003: RSS-Driven Preference Learning Workflow**
- **Status**: ✅ **COMPLETED**
- **Assignee**: Development Team
- **Priority**: ⚡ **HIGH**
- **Estimated Time**: 4-6 hours
- **Dependencies**: P2-B1-001, P2-B1-002
- **Description**: Implement RSS intake → book completion → preference prompts → learning cycle
- **Files**: `_knowledge/conversational-interface-patterns.md`, API endpoints, RSS integration
- **Success Criteria**:
  - [x] RSS workflow documented and implemented
  - [x] Preference learning endpoints created
  - [x] Mobile-first patterns implemented
  - [x] Learning cycle validated
- **Blockers**: None
- **Notes**: ✅ Complete RSS-triggered preference learning workflow with mobile optimization

#### **P2-B1-004: RSS-Triggered Preference Learning Validation**
- **Status**: ✅ **COMPLETED**
- **Assignee**: Development Team
- **Priority**: ⚡ **HIGH**
- **Estimated Time**: 2-3 hours
- **Dependencies**: P2-B1-001, P2-B1-002, P2-B1-003
- **Description**: Validate RSS-triggered preference learning in chat interfaces
- **Files**: `test/rss-preference-learning-validation.js`, `test/run-validation.js`
- **Success Criteria**:
  - [x] RSS ingestion workflow validated
  - [x] Preference prompts tested
  - [x] Conversational patterns verified
  - [x] Mobile optimization confirmed
- **Blockers**: None
- **Notes**: ✅ All validations passed - workflow ready for deployment

---

## 🚨 **CRITICAL CLEANUP BATCH** (Phase 2 - Batch 5)

### **Phase 2 - Batch 5: Critical Infrastructure Cleanup** 🔄 **NEXT PRIORITY**
*Priority*: 🔴 **CRITICAL**  
*Target Completion*: July 21, 2025  
*Estimated Hours*: 16-20 hours  
*Based on*: BACKEND_AUDIT_REPORT.md findings

#### **P2-B5-001: File Organization & Cleanup**
- **Status**: 📋 **PLANNED**
- **Assignee**: Development Team
- **Priority**: 🔴 **CRITICAL**
- **Estimated Time**: 4-6 hours
- **Dependencies**: None
- **Description**: Reorganize scattered configuration, consolidate documentation, remove duplicates
- **Files**: `/config/`, `/docs/`, remove outdated files in root
- **Success Criteria**: 
  - [ ] Configuration files consolidated in `/config/`
  - [ ] Documentation merged into `/docs/`
  - [ ] Remove 6+ outdated files (SESSION_*.md, etc.)
  - [ ] Clean `/data/` backup clutter
  - [ ] Organize `/scripts/` into logical subdirectories
- **Blockers**: None
- **Notes**: **Health Score Impact**: +10 points (85→95/100)

#### **P2-B5-002: Performance Optimization**
- **Status**: 📋 **PLANNED**
- **Assignee**: Development Team
- **Priority**: 🔴 **CRITICAL**
- **Estimated Time**: 4-5 hours
- **Dependencies**: P2-B5-001 (file cleanup)
- **Description**: Add caching, pagination, optimize memory usage
- **Files**: `scripts/api-server.js`, new middleware files
- **Success Criteria**:
  - [ ] Response caching implemented (50-70% faster)
  - [ ] API pagination added (60-80% faster loads)
  - [ ] Memory usage optimization (40-50% reduction)
  - [ ] Request validation middleware
- **Blockers**: None
- **Notes**: **Target**: <200ms API response times

#### **P2-B5-003: Remove Technical Debt**
- **Status**: 📋 **PLANNED**
- **Assignee**: Development Team
- **Priority**: 🔴 **CRITICAL**
- **Estimated Time**: 3-4 hours
- **Dependencies**: P2-B5-001 (file organization)
- **Description**: Remove unused scripts, clean up 35+ script files, remove outdated docs
- **Files**: `/scripts/` cleanup, root directory cleanup
- **Success Criteria**:
  - [ ] Remove unused utility scripts
  - [ ] Organize scripts into `/core/`, `/maintenance/`, `/testing/`
  - [ ] Remove duplicate backup/test scripts
  - [ ] Archive old conversation files
- **Blockers**: None
- **Notes**: **Maintenance Reduction**: Eliminate confusion from unused files

#### **P2-B5-004: Development Workflow Setup**
- **Status**: 📋 **PLANNED**
- **Assignee**: Development Team
- **Priority**: 🔴 **CRITICAL**
- **Estimated Time**: 5-6 hours
- **Dependencies**: P2-B5-001, P2-B5-003 (cleanup tasks)
- **Description**: Add testing framework, CI/CD pipeline, code quality tools
- **Files**: `test/` directory, `.github/workflows/`, package.json updates
- **Success Criteria**:
  - [ ] Jest testing framework setup
  - [ ] Basic unit/integration test structure
  - [ ] GitHub Actions CI/CD pipeline
  - [ ] ESLint/Prettier code quality enforcement
- **Blockers**: None
- **Notes**: **Foundation** for reliable development workflow

---

## 🎯 **TASK TRACKING SYSTEM**

### **Task ID Format**: `P[Phase]-B[Batch]-[Task]`
- **P1**: Phase 1 (Core Infrastructure)
- **P2**: Phase 2 (AI Integration)
- **P3**: Phase 3 (Production Deployment)
- **P4**: Phase 4 (Advanced Features)

### **Status Indicators**:
- ✅ **COMPLETED**: Task finished and validated
- 🔄 **IN PROGRESS**: Currently being worked on
- 📋 **PLANNED**: Ready to start, dependencies met
- ⏳ **BLOCKED**: Cannot proceed due to dependencies
- 🎯 **STRATEGIC**: Future phase, not yet planned

### **Priority Levels**:
- ⚡ **CRITICAL**: Must complete immediately
- 🔥 **HIGH**: Complete within current batch
- ⚠️ **MEDIUM**: Complete within current phase
- 📍 **LOW**: Nice to have, flexible timing

---

## 📈 **PROGRESS TRACKING**

### **Overall Project Progress**
- **Phase 1**: ✅ **100%** (16/16 tasks complete)
- **Phase 2**: 🔄 **20%** (4/20 tasks complete)
- **Phase 3**: 📋 **0%** (0/12 tasks complete)
- **Phase 4**: 🎯 **0%** (0/12 tasks complete)

**Total Project**: **27%** (20/60 tasks complete)

### **Current Phase Progress (Phase 2)**
- **Batch 1**: ✅ **100%** (4/4 tasks complete)
- **Batch 2**: 📋 **0%** (0/4 tasks complete)
- **Batch 3**: 📋 **0%** (0/4 tasks complete)
- **Batch 4**: 📋 **0%** (0/4 tasks complete)
- **Batch 5**: 📋 **0%** (0/4 critical cleanup tasks)

### **Velocity Tracking**
- **Phase 1 Duration**: 45 days (May 28 - July 12, 2025)
- **Phase 1 Velocity**: 0.36 tasks/day
- **Projected Phase 2 Completion**: July 28, 2025 (14 days)
- **Projected Project Completion**: October 15, 2025

---

## 🔄 **TASK COMPLETION PROCESS**

### **Starting a Task**
1. Update task status to 🔄 **IN PROGRESS**
2. Assign to team member
3. Verify dependencies are met
4. Create branch (if applicable)
5. Begin development work

### **Completing a Task**
1. Complete all success criteria
2. Run relevant tests
3. Update documentation
4. Submit for review
5. Update task status to ✅ **COMPLETED**
6. Update progress tracking

### **Blocked Tasks**
1. Update status to ⏳ **BLOCKED**
2. Document blocking issue
3. Identify resolution steps
4. Escalate if necessary
5. Update when unblocked

---

## 📋 **BATCH MANAGEMENT**

### **Batch Completion Criteria**
- All tasks in batch marked ✅ **COMPLETED**
- Success criteria validated
- Documentation updated
- Tests passing
- Performance metrics met

### **Batch Transitions**
- Review batch completion
- Update progress tracking
- Plan next batch
- Adjust timelines if needed
- Communicate status updates

---

## 🎯 **STRATEGIC PRIORITIES**

### **July 2025 Focus** (Phase 2)
1. **🔴 CRITICAL CLEANUP**: File organization, performance optimization, technical debt removal (P2-B5)
2. **Metadata Quality**: Fix incomplete book data (P2-B3)
3. **Library APIs**: Accurate availability for TBR positioning (P2-B2)
4. **Firebase Integration**: Real-time sync for mobile use (P2-B4)
5. **Romance Focus**: Enhance recommendation algorithms (P2-B4)

### **August 2025 Focus** (Phase 3)
1. **Production**: Zero-cost hosting optimization
2. **Performance**: Full DB analytics capability
3. **Automation**: Set-and-forget maintenance
4. **Mobile**: Response time optimization

### **Q1 2026 Focus** (Phase 4)
1. **AI Enhancement**: Advanced personal analytics
2. **Predictions**: Reading pattern analysis
3. **Mobile**: Native app for personal use
4. **Analytics**: Deep reading insights

---

## 📊 **TASK DEPENDENCIES**

### **Critical Path Analysis**
- **P2-B1-001** → **P2-B1-002** → **P2-B1-003** → **P2-B1-004**
- **P2-B2-001** → **P2-B2-002** → **P2-B2-003** → **P2-B2-004**
- **P2-B3-001** → **P2-B3-002** → **P2-B3-003** → **P2-B3-004**

### **Parallel Work Opportunities**
- **P2-B1** and **P2-B2** can run simultaneously
- **P2-B3** can start after **P2-B1-001** completes
- **P3-B1** preparation can begin during **P2-B3**

---

## 🎯 **SUCCESS METRICS**

### **Quality Gates**
- **Code Quality**: 90%+ test coverage (currently 0%)
- **Performance**: <200ms API response times (currently ~500ms)
- **Security**: Zero vulnerabilities
- **Documentation**: 100% API coverage

### **User Experience**
- **Mobile Chat**: <2s response time (personal use optimized)
- **Metadata Completeness**: >95% (vs current ~60%)
- **Availability Accuracy**: Position TBR based on library wait times
- **Analytics Depth**: Full reading pattern analysis

### **Personal Use Metrics**
- **Cost**: $0 monthly operational costs (free tiers only)
- **Maintenance**: Set-and-forget automation
- **Reliability**: 99.5% success rate for personal workflows
- **Focus**: Romance recommendations with mood-based variety

### **Performance Targets** (From Backend Audit)
- **API Response Time**: <200ms (currently ~500ms) - 60% improvement needed
- **Memory Usage**: <512MB (currently ~1GB) - 50% reduction needed
- **Error Rate**: <1% (currently ~5%) - 80% improvement needed
- **Book Search**: <100ms response time
- **Queue Operations**: <50ms response time
- **Recommendation Generation**: <2s response time
- **Mobile Interface**: <3s initial load time

### **Development Metrics**
- **Deployment Time**: <5 minutes (currently manual)
- **Bug Detection**: <1 day (currently weeks)
- **Feature Delivery**: <1 week (currently months)
- **Code Quality**: >90% (currently unmeasured)
- **Project Health Score**: 95/100 (currently 85/100)

---

## 🔧 **MAINTENANCE GUIDELINES**

### **Daily Updates**
- Review active tasks
- Update progress status
- Identify blockers
- Communicate with team

### **Weekly Reviews**
- Complete batch assessments
- Update velocity tracking
- Adjust timelines
- Plan next batch

### **Monthly Planning**
- Phase completion review
- Strategic priority adjustment
- Resource allocation
- Timeline recalibration

---

## 🚀 **SUPERCLAUDE COMMAND REFERENCE**

### **For Vibe Coders: Step-by-Step Implementation Commands**

This section provides complete SuperClaude commands for implementing each task. Copy and paste these commands directly into Claude Code for automated implementation.

#### **📋 Phase 2 - Batch 5: Critical Infrastructure Cleanup**

**P2-B5-001: File Organization & Cleanup**
```bash
# Step 1: Consolidate configuration files
/sc:cleanup --target files --organize-by-type --create-config-dir

# Step 2: Merge documentation
/sc:document --merge --source _knowledge/ --output docs/ --remove-duplicates

# Step 3: Remove outdated files
/sc:cleanup --target outdated --files "SESSION_*.md,INTEGRATION_*.md" --archive-conversations
```

**P2-B5-002: Performance Optimization**
```bash
# Step 1: Add response caching
/sc:improve --target performance --add-memory-cache --optimize-frequent-queries

# Step 2: Implement API pagination
/sc:improve --target api --add-pagination --default-limit 20 --optimize-payloads

# Step 3: Optimize memory usage
/sc:improve --target performance --optimize-json --add-streaming --reduce-memory-40%
```

**P2-B5-003: Remove Technical Debt**
```bash
# Step 1: Clean up scripts directory
/sc:cleanup --target scripts --organize-subdirs core,maintenance,testing

# Step 2: Remove unused utilities
/sc:cleanup --target code --remove-unused --keep-essential-only

# Step 3: Archive old files
/sc:cleanup --target archive --move-conversations --clean-data-backups
```

**P2-B5-004: Development Workflow Setup**
```bash
# Step 1: Setup testing framework
/sc:test --setup --framework jest --types unit,integration --coverage-target 80%

# Step 2: Add CI/CD pipeline
/sc:deploy --setup-cicd --provider github-actions --test-on-commit

# Step 3: Add code quality tools
/sc:improve --target quality --add-eslint-prettier --setup-pre-commit-hooks
```

#### **📋 Phase 2 - Batch 2: Library API Integration**

**P2-B2-001: Library API Integration**
```bash
# Step 1: Analyze current library integration
/sc:analyze --focus architecture --target scripts/enhanced-availability-checker.js

# Step 2: Configure real API credentials
/sc:improve --target config --add-env-vars --validate-credentials

# Step 3: Test API connections
/sc:test --target library-apis --validate-connections --generate-report
```

**P2-B2-002: Availability Accuracy Fixes**
```bash
# Step 1: Analyze accuracy issues
/sc:analyze --focus quality --target availability-checking --identify-false-positives

# Step 2: Implement validation improvements
/sc:improve --target validation --add-confidence-scoring --reduce-false-positives

# Step 3: Test accuracy improvements
/sc:test --target accuracy --benchmark --compare-before-after
```

**P2-B2-003: KU/Hoopla False Positive Resolution**
```bash
# Step 1: Identify false positive patterns
/sc:analyze --focus patterns --target ku-hoopla-detection --generate-test-cases

# Step 2: Implement advanced validation
/sc:improve --target validation --add-multi-layer-checks --enhance-matching

# Step 3: Validate improvements
/sc:test --target false-positives --validate-reduction --measure-confidence
```

**P2-B2-004: Batch Availability Validation**
```bash
# Step 1: Implement batch processing
/sc:improve --target performance --add-batch-processing --optimize-rate-limits

# Step 2: Add validation metrics
/sc:improve --target monitoring --add-batch-metrics --validate-quality

# Step 3: Test batch operations
/sc:test --target batch-processing --validate-performance --check-accuracy
```

#### **📋 Phase 2 - Batch 3: AI Classification Backfill**

**P2-B3-001: AI Classification Backfill**
```bash
# Step 1: Analyze unclassified books
/sc:analyze --target books --identify-unclassified --estimate-effort

# Step 2: Implement AI classification pipeline
/sc:build --target classification --add-ai-agent --web-search-integration

# Step 3: Execute backfill process
/sc:task execute "classify-411-books" --strategy systematic --validate --persist
```

**P2-B3-002: Web Search Integration**
```bash
# Step 1: Add web search capability
/sc:improve --target search --add-web-integration --rate-limit-aware

# Step 2: Integrate with classification
/sc:improve --target classification --add-web-context --enhance-accuracy

# Step 3: Test web search features
/sc:test --target web-search --validate-results --check-rate-limits
```

#### **📋 Phase 3 - Batch 1: Production Deployment**

**P3-B1-001: Railway Production Deployment**
```bash
# Step 1: Prepare production config
/sc:deploy --env production --platform railway --optimize --validate

# Step 2: Setup environment variables
/sc:deploy --setup-env --secure-credentials --validate-config

# Step 3: Deploy and test
/sc:deploy --execute --validate-health --monitor-performance
```

**P3-B1-002: Vercel Backup Configuration**
```bash
# Step 1: Configure Vercel deployment
/sc:deploy --platform vercel --backup-config --api-only

# Step 2: Setup failover mechanism
/sc:deploy --setup-failover --monitor-primary --auto-switch

# Step 3: Test backup deployment
/sc:test --target deployment --validate-failover --check-sync
```

#### **📋 Performance Optimization Commands**

**Add Caching System**
```bash
# Step 1: Implement memory caching
/sc:improve --target performance --add-memory-cache --optimize-frequent-queries

# Step 2: Add Redis for distributed caching
/sc:improve --target cache --add-redis --configure-invalidation

# Step 3: Validate caching performance
/sc:test --target cache --benchmark --measure-improvement
```

**Database Migration to SQLite**
```bash
# Step 1: Design SQLite schema
/sc:design --target database --create-sqlite-schema --optimize-indexes

# Step 2: Implement migration scripts
/sc:build --target migration --json-to-sqlite --preserve-audit-trail

# Step 3: Execute migration and validate
/sc:migrate --execute --validate-data --benchmark-performance
```

#### **📋 Testing Implementation Commands**

**Setup Comprehensive Testing**
```bash
# Step 1: Setup testing framework
/sc:test --setup --framework jest --types unit,integration,e2e

# Step 2: Generate test cases
/sc:test --generate --target api --coverage 80 --include-edge-cases

# Step 3: Setup CI/CD testing
/sc:test --setup-ci --trigger-on-commit --generate-reports
```

**Performance Testing**
```bash
# Step 1: Setup load testing
/sc:test --setup-load --target api --concurrent-users 100

# Step 2: Benchmark current performance
/sc:test --benchmark --measure-response-times --memory-usage

# Step 3: Validate performance targets
/sc:test --validate-performance --targets "response<200ms,memory<512mb"
```

#### **📋 Code Quality Commands**

**Code Cleanup and Organization**
```bash
# Step 1: Organize file structure
/sc:cleanup --target files --organize-by-type --remove-duplicates

# Step 2: Clean up unused code
/sc:cleanup --target code --remove-unused --optimize-imports

# Step 3: Add code quality tools
/sc:improve --target quality --add-eslint-prettier --setup-pre-commit
```

**Documentation Generation**
```bash
# Step 1: Generate API documentation
/sc:document --target api --format openapi --include-examples

# Step 2: Create deployment guides
/sc:document --target deployment --step-by-step --include-troubleshooting

# Step 3: Update project documentation
/sc:document --target project --consolidate --organize-knowledge
```

#### **📋 Quick Task Commands**

**Daily Development Tasks**
```bash
# Quick health check
/sc:analyze --quick --target health --generate-report

# Run all tests
/sc:test --all --generate-report

# Deploy to staging
/sc:deploy --target staging --quick-validate

# Check performance
/sc:analyze --target performance --benchmark --compare-baseline
```

**Weekly Maintenance**
```bash
# Update dependencies
/sc:maintain --update-deps --check-security --test-compatibility

# Performance optimization
/sc:optimize --target performance --identify-bottlenecks --implement-fixes

# Backup and cleanup
/sc:maintain --backup-data --cleanup-logs --validate-backups
```

### **🎯 Command Execution Guidelines**

1. **Copy Command**: Copy the exact command syntax
2. **Paste in Claude Code**: Paste directly into Claude Code interface
3. **Review Output**: Check execution results and any errors
4. **Update Task Status**: Mark task as completed in this guide
5. **Commit Changes**: Run git commit after successful completion

### **⚡ Emergency Commands**

**Quick Recovery**
```bash
# Restore from backup
/sc:recover --from-backup --validate-data --test-functionality

# Fix production issues
/sc:fix --target production --identify-issues --implement-hotfix

# Emergency deployment rollback
/sc:deploy --rollback --validate-previous-version --monitor-health
```

---

## 📚 **REFERENCE LINKS**

### **Core Documentation**
- [Project Plan](_knowledge/Project_Plan.md)
- [Operating Instructions](_knowledge/Operating_Instructions.md)
- [Summary Status](_knowledge/summary.md)
- [Claude Instructions](../CLAUDE.md)
- [Backend Audit Report](../BACKEND_AUDIT_REPORT.md)

### **Technical References**
- [API Schema](../shelfhelp-unified-api-schema.json)
- [Classifications](../data/classifications.yaml)
- [Package Dependencies](../package.json)

### **Development Tools**
- [API Testing](../api-tests.http)
- [Deployment Configs](../render.yaml)
- [GitHub Actions](../.github/workflows/)

### **Audit & Questions**
- [Backend Audit Questions](../backend-audit-questions.txt)
- [**Backend Audit Report**](../BACKEND_AUDIT_REPORT.md) - **Critical findings integrated into P2-B5**
- [Optimization Recommendations](../BACKEND_AUDIT_REPORT.md#optimization-opportunities)

---

**File Location**: `_knowledge/Task_Management_Guide.md`  
**Maintained By**: Development Team  
**Update Frequency**: Daily during active phases  
**Version Control**: Git-tracked with commit history  
**Access**: All team members, AI assistants via API

*This document is the single source of truth for all ShelfHelp AI project tasks and should be updated immediately when task status changes.*