# ShelfHelp AI - AI-Powered Reading Assistant

**Status**: Phase 2 AI Integration - Active Development  
**Health Score**: 95/100 (post-cleanup)  
**Architecture**: Node.js Express API + File-based storage + Optional Firebase sync

## Overview

AI-powered reading assistant with real-time queue management and intelligent book classification. Provides conversational interfaces for managing reading queues, generating personalized recommendations, and automating reflection workflows.

**Core Philosophy**: Zero-cost operation, file-based canonical storage with Firebase real-time sync, comprehensive audit trails, mobile-first conversational interfaces, personal use focused.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production deployment
npm start
```

## Documentation Structure

### 📋 Core Documentation
- **[Task Management Guide](workflows/Task_Management_Guide.md)** - Master project tracking
- **[Project Plan](workflows/Project_Plan.md)** - Complete strategy & architecture
- **[Operating Instructions](guides/Operating_Instructions.md)** - Field dictionary & rules

### 🚀 Deployment
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment instructions
- **[Configuration](../config/)** - Environment & deployment configurations

### 📊 Reports & Status
- **[Project Summary](reports/summary.md)** - Current status & priorities
- **[Backend Audit](../BACKEND_AUDIT_REPORT.md)** - Architecture analysis
- **[Library Integration Report](reports/P2-B2_Library_Integration_Report.md)**

### 🔧 Development Guides
- **[Backfill Strategy](guides/backfill-strategy-guide.md)** - AI classification workflow
- **[Historical Import](guides/historical-import-guide.md)** - Data migration process
- **[Workflow Protocol](workflows/Session_Workflow_Protocol.md)** - Development process
- **[Conversational Patterns](guides/conversational-interface-patterns.md)** - Mobile UI patterns

### 🎯 Development Examples
- **[AI Classification Demo](guides/ai-classification-demo.md)** - Live classification examples
- **[Fuzzy Classification](guides/fuzzy-classification-examples.md)** - Matching examples

## Key Features

### ✅ Completed
- **AI Assistant Security Foundation** - Mandatory auth, knowledge API, AI-safe errors
- **Core API Server** - Full CRUD operations + AI-enhanced endpoints
- **Smart Queue Management** - Intelligent TBR prioritization
- **Comprehensive Reading Insights** - Yearly analytics with seasonal patterns
- **AI-Driven Backfill** - Complete strategy with web search integration
- **Enhanced Availability System** - KU, Hoopla, library integration
- **Fuzzy Classification** - Intelligent matching with AI validation

### 🔄 In Progress (Phase 2)
- **🔴 CRITICAL CLEANUP** - File organization, performance optimization (P2-B5)
- **Metadata Quality** - Fix incomplete book data (P2-B3)
- **Library APIs** - Accurate availability for TBR positioning (P2-B2)
- **Firebase Integration** - Real-time sync for mobile use (P2-B4)

## Technical Architecture

- **Backend**: Express.js API with AI-assistant-optimized security
- **Authentication**: Mandatory API key with AI platform CORS
- **Data Storage**: Local JSON with optional Firebase sync
- **Classification**: YAML taxonomy with fuzzy matching
- **AI Integration**: Complete endpoint suite for autonomous operation
- **Audit Trail**: Complete source attribution and reasoning

## Performance Targets

- **API Response Time**: <200ms (currently ~500ms)
- **Memory Usage**: <512MB (currently ~1GB)
- **Error Rate**: <1% (currently ~5%)
- **Test Coverage**: 80%+ (currently 0%)

## Development Commands

```bash
# Health check
npm run health

# API testing
npm run test:api

# Lint & format
npm run lint
npm run format

# Schema validation
npm run validate-schema
```

## File Structure

```
├── config/          # Deployment configurations
├── data/           # Canonical data store
├── docs/           # Documentation (this directory)
├── scripts/        # API server and utilities
├── src/            # Core application modules
└── test/           # Testing framework
```

## Contributing

1. Check [Task Management Guide](workflows/Task_Management_Guide.md) for active tasks
2. Follow [Session Workflow Protocol](workflows/Session_Workflow_Protocol.md)
3. Reference [Operating Instructions](guides/Operating_Instructions.md) for data rules
4. Update documentation with changes

## Support

- **Issues**: GitHub Issues
- **Documentation**: This docs/ directory
- **Task Tracking**: workflows/Task_Management_Guide.md
- **Architecture**: ../BACKEND_AUDIT_REPORT.md

---

*Last Updated: July 15, 2025*  
*Health Score: 95/100 (post-cleanup)*