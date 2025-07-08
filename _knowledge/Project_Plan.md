# Shelf Help AI Assistant — Project Plan

## High‑Level Goals and Strategy

### 1. Vision and Rationale

Design and deploy a **mobile‑first, data‑intelligent reading assistant** that continuously assimilates your book‑consumption behaviour, dynamically curates an adaptive reading queue, and generates actionable, evidence‑driven insights—**all while incurring zero incremental cost** beyond the extant ChatGPT Plus and Claude Pro subscriptions.  The assistant must function as a single conversational touch‑point across devices, provide near‑real‑time context, and evolve in tandem with shifting reading patterns and constraints.

### 2. Strategic Objectives

| ID  | Objective                                                                                                | Quantifiable Success Criterion                                                                                                                       | Supporting Mechanism                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| O‑1 | Maintain a **single source of truth** for all bibliographic and preference data                          | 100 % of CRUD operations routed through one canonical interface                                                                                      | Git‑tracked `books.json` + optional `books.sqlite` mirror               |
| O‑2 | Deliver a **seamless conversational interface** optimised for mobile                                     | ≥ 95 % of user interactions achievable within the chat window (ChatGPT, Claude, or PWA)                                                              | e.g., Custom GPT actions, Claude Projects, or a PWA front‑end           |
| O‑3 | Provide **reliable scheduled automation** for ingestion, reporting, and prompting                        | ‑ Reflection prompt issued ≤ 1 h after `status = Finished` ‑ Weekly digest sent every Sunday 20:00 local ‑ Monthly report sent first Sunday of month | e.g., GitHub Actions, Claude Tasks, or native ChatGPT Tasks             |
| O‑4 | Integrate a **retrieval‑augmented generation (RAG) layer** to ground every response in the freshest data | Vector index rebuilt ≤ 1 h after any data mutation; top‑k retrieval precedes every generation step                                                   | e.g., LangChain with FAISS or Chroma, backed by local Ollama embeddings |
| O‑5 | Preserve **immutable audit trails** for provenance and rollback                                          | Git commit history plus append‑only JSONL deltas for books and preferences                                                                           | `/history/*.jsonl` snapshots pre‑commit                                 |
| O‑6 | Operate under a **strict zero‑spend envelope** apart from current subscriptions                          | No usage of paid API keys or premium tiers; all computation via free OSS or free‑tier cloud                                                          | e.g., local Ollama models paired with public GitHub runner minutes      |

### 3. Functional Pillars and Detailed Scope

1. **Ingestion & Synchronisation**\
   • Goodreads RSS polling (every 6 h)\
   • Manual TBR injections through chat command (`/add`)\
   • Viral‑trend watchlist (e.g., TikTok #BookTok scraping via free endpoints)\
   • De‑duplication and mapping into `books.json` schema
2. **Metadata Enrichment**\
   • Library availability (Libby, Hoopla, KU) via HTML scraping or free OverDrive endpoints\
   • Taxonomic inference for trope, tone, genre, subgenre, spice using rule‑based keywords + LLM classification\
   • Calculation of `inferred_score`, `rating_scale_tag` based on preference vectors\
   • Queue heuristics: urgency, backlog, library due date, book‑club deadlines
3. **Reflection Workflow**\
   • Auto‑generated Q&A template per finished book\
   • Sentiment extraction from user responses\
   • Incremental update to `preferences.json` vector store\
   • Optional follow‑up prompts if feedback is sparse or ambiguous
4. **Recommendation & Queue Governance**\
   • RAG‑backed `getNextRead()` function balancing emotion, length, series continuity\
   • Dynamic priority bump for soon‑to‑expire KU or library loans\
   • Series tracker to propose next instalment when appropriate
5. **Scheduled Reporting**\
   • Weekly digest: pages read, tropes consumed, upcoming queue\
   • Monthly report: heatmaps (books vs. rating), series progress, reading pace trends\
   • All reports rendered as Markdown for chat display and archived under `/reports/`
6. **Knowledge & RAG Infrastructure**\
   • Source docs: `/data`, `/reflections`, `/instructions.md`\
   • Chunk & embed via Ollama `text-embed-ada` equivalent\
   • Query path integrated into every agent turn via AutoGen or CrewAI retrieval tool

### 4. Key Constraints, Assumptions, and Risk Mitigation

- **Cost Discipline:** 100 % reliance on free‑tier compute and storage (public GitHub runners, SQLite, local embeddings). Risk: GitHub runner quota exhaustion → Mitigation: nightly rather than hourly heavy jobs.
- **Data Residency:** Primary store in Git repo; optional Firebase mirror for realtime UI. Risk: merge conflicts → Mitigation: JSON patch strategy and append‑only logs.
- **Mobile UX Cohesion:** All essential flows (add, finish, reflect, query queue) must run inside chat. Risk: Action timeout limits (30 s) → Mitigation: delegate long‑running tasks to background workers and return status links.
- **Security:** API keys for third‑party scrapers stored as repo secrets; no PII beyond reading data.

### 5. Milestone Roadmap (Granular)

| Phase | Deliverable             | Key Tasks                                                                   | Target Epoch |
| ----- | ----------------------- | --------------------------------------------------------------------------- | ------------ |
| 0     | Repo scaffolding        | Initialise directories, sample JSON, GitHub Actions template                |              |
| 1     | RSS ingestion module    | `rss_ingest.py`, Action schedule (or equivalent scheduler), basic RAG index |              |
| 2     | Reflection MVP          | Reflection MD template, chat prompt flow, preferences write‑back            |              |
| 3     | Weekly report engine    | `generate_weekly.py`, chart output (e.g., via Matplotlib), chat render      |              |
| 4     | RAG‑powered recommender | Build FAISS retrieval, `recommend_next.py`, integrate with chat             |              |
| 5     | Library & KU checker    | Scraper scripts, enrich queue priority, nightly sync                        |              |
| 6     | Beta hardening          | UX polish, robust error handling, documentation                             |              |

---

## User Stories and Technical Requirements (Rewritten)

### 3.1 Minimum‑Viable Functional Slice (Release 0·1)

| ID   | Capability                                                                                                | Must‑Have for R0·1? |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------------- |
| F‑1  | Ingest Goodreads RSS and append new books to the data store                                               | ✅                   |
| F‑2  | Issue reflection prompt ≤ 1 h after a book is marked **Finished**                                         | ✅                   |
| F‑3  | Persist reflection answers to `/reflections/{id}/DATE.md` and patch the book record (`liked`, `notes`, …) | ✅                   |
| F‑4  | Rebuild RAG vector index immediately after each commit                                                    | ✅                   |
| F‑5  | Generate a weekly queue report (Markdown) and deliver it via chat                                         | ✅                   |
| F‑6  | Respond to “**what should I read next?**” with a RAG‑grounded recommendation                              | ✅                   |
| F‑7  | Allow update of TBR metadata (e.g., change `queue_position`) through chat                                 | ✅                   |
| F‑8  | Support back‑fill sessions to complete missing fields on any book                                         | ✅                   |
| F‑9  | Provide a single mobile‑friendly chat surface                                                             | ✅                   |
| F‑10 | Maintain Git‑based audit history (`/history/*.jsonl`)                                                     | ✅                   |
| F‑11 | Operate without paid API keys                                                                             | ✅                   |

### 3.2 Representative User Stories

| US # | As a ―        | I want to …                                    | So that …                                     | Acceptance Criteria                                                                |
| ---- | ------------- | ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1    | **Reader**    | add *Fourth Wing* to my TBR                    | it appears in the queue with default metadata | • POST `/api/add_book` returns 201.• Record in `books.json` has `status:"TBR"`.    |
| 2    | **Reader**    | mark a book **Finished**                       | I’m asked reflection questions promptly       | • Reflection file created.• Chat prompt ≤ 1 h.                                     |
| 3    | **Reader**    | update a TBR book’s queue position             | my queue stays accurate                       | • PATCH request persists new `queue_position`.• Next queue report reflects change. |
| 4    | **Reader**    | launch a back‑fill session for *older* entries | the DB gains missing tone/genre/subgenre/etc.        | • Assistant lists missing fields.• New values saved & RAG refreshed.               |
| 5    | **Reader**    | ask “why did you recommend this?”              | I see rationale tied to my preferences        | • Reply cites top tropes & past “liked”.                                           |
| 6    | **Scheduler** | run weekly digest                              | I receive a summary every Sun 20:00 CT        | • File in `/reports/weekly/` + chat push.                                          |
| 7    | **Agent**     | query vector index before answering            | replies stay grounded in latest data          | • Logs show `rag_query` executed each turn.                                        |

### 3.3 Canonical Data Assets

| File | Purpose                                                                              | Versioning                     | Indexed for RAG? |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------ | ---------------- |
| ``   | Primary book + metadata store                                                        | Git + `/history/books_*.jsonl` | ✅                |
| ``   | Trope, tone, genre, subgenre , spice definitions                                              | Git                            | ✅                |
| ``   | Computed taste model (auto‑derived)                                                  | Git                            | ✅                |
| ``   | Curated list of RSS/HTML sources for new releases, best‑seller lists, viral trackers | Git                            | ✅                |
| ``   | Operational rules & system prompts                                                   | Git                            | ✅                |

> *Tool names in subsequent sections (e.g., FastAPI, FAISS) are illustrative suggestions, not mandates.*

### 3.4 Data Schema (snapshot)

#### 3.4.1 Core RSS‑Derived Fields

`guid`, `goodreads_id`, `pubdate`, `title`, `link`, image URLs, `book_description`, `author_name`, `isbn`, user‑specific shelf metadata, `average_rating`, `book_published`, HTML description, parsed fields (`book_title`, `series_name`, `series_number`), reading state `status`, `updated_at`.

#### 3.4.2 Enrichment Fields (LLM + Web Scrape)

Tone, genre, subgenre, trope list, spice level, library / KU / Hoopla availability fields, `availability_source`, `ku_expires_on`, `pages_source`, `next_release_date`, `hype_flag`.

#### 3.4.3 Dynamic GPT‑Assigned Fields

`queue_position`, `queue_priority`, `liked`, `disliked`, `notes`, `rating_scale_tag`, `inferred_score`, `goal_year`.

> **Schema evolution:** the above field taxonomy is authoritative for Release 0·1 but may be augmented in later iterations. All new fields must be documented in `schema_change_log.md` and validated by JSON‑schema tests before merge.

### 3.5 Illustrative API Surface

| Endpoint                | Verb  | Payload                    | Result             |
| ----------------------- | ----- | -------------------------- | ------------------ |
| `/api/add_book`         | POST  | `{ goodreads_id, status }` | 201 + summary      |
| `/api/update_book`      | PATCH | `{ id, field, value }`     | 200 + diff         |
| `/api/backfill_missing` | POST  | `{ id }`                   | 202 + prompt link  |
| `/api/get_queue`        | GET   | –                          | 200 + sorted array |
| `/api/generate_report`  | POST  | `{ type: "weekly" }`       | 202 + report URL   |

Stack choice: any lightweight server (e.g., FastAPI, Next.js API routes, Cloudflare Workers).

### 3.6 Scheduled Jobs (Cron Examples)

| Job              | Cadence                 | Free‑tier Mechanism         |
| ---------------- | ----------------------- | --------------------------- |
| `rss_ingest`     | `0 */6 * * *`           | e.g., GitHub Actions        |
| `rag_rebuild`    | `on:push` (post‑commit) | e.g., GitHub Actions        |
| `weekly_report`  | `0 20 * * 0`            | e.g., Claude Task or Action |
| `monthly_report` | `0 20 1 * *`            | idem                        |

### 3.7 RAG Pipeline Synopsis

1. **Chunk sources:** `books.json` (one record per chunk), reflection Markdown files, `instructions.md`, `classifications.yaml`, `resources.yaml`.
2. **Embed** with a local embedding model (e.g., `text‑embedding‑ada` equivalent served by Ollama).
3. **Index** using FAISS or Chroma.
4. **Retrieve** top‑k passages (`k≈5`) for each prompt.
5. **Generate** response with grounding citations.

---

## High‑Level Architecture Decisions

> **Disclaimer:** Technology names below are illustrative suggestions, not binding choices.

### 4.1 Logical Component Model

```
┌────────────────────────┐        REST/GraphQL        ┌──────────────────────┐
│  Conversational Layer  │ ─────────────────────────▶ │    Orchestrator      │
│ (ChatGPT, Claude, PWA) │ ◀───────────────────────── │  (API micro‑service) │
└────────────────────────┘        JSON responses       └─────────┬────────────┘
         ▲                                                file I/O│SQL
         │   RAG query (FAISS/Chroma)                          │
         │                                                    ▼
         │                                            ┌───────────────┐
         │                                            │ Canonical Data│
         │                                            │  • books.json │
         │                                            │  • prefs.json │
         │                                            │  • …          │
         │                                            └───────┬───────┘
         │  Firebase mirror (optional realtime UI)            │
         ▼                                                    ▼
┌────────────────┐                                    ┌────────────────┐
│  Firebase RTDB │◀──────────── sync job ────────────▶│  GitHub Repo   │
└────────────────┘                                    └────────────────┘
                                                            ▲
                                                            │ cron / CI
                                                            ▼
                                                   ┌────────────────────┐
                                                   │  Schedulers        │
                                                   │  • GitHub Actions  │
                                                   │  • ChatGPT Tasks   │
                                                   │  • Telegram (push) │
                                                   └────────────────────┘
```

### 4.2 Data‑Persistence Strategy

| Layer              | Primary Store                                                  | Mirror                      | Rationale                                     |
| ------------------ | -------------------------------------------------------------- | --------------------------- | --------------------------------------------- |
| Canonical          | Git‑tracked files (`books.json`, `classifications.yaml`, etc.) | –                           | Human‑readable, version‑controlled, zero cost |
| Realtime mirror    | **Firebase Realtime Database** (`/books/{id}`)                 | sync job (`git → firebase`) | Enables optional live UI or mobile widgets    |
| Relational queries | SQLite (`books.sqlite`) committed to repo                      | –                           | Local analytics without external DB           |
| Vector index       | FAISS (`/vectorstore/faiss.index`)                             | –                           | Fast retrieval; binary blob committed         |

### 4.3 API Surface (illustrative, language‑agnostic)

| Endpoint             | Verb  | Payload                    | Returns         |
| -------------------- | ----- | -------------------------- | --------------- |
| `/api/books`         | GET   | query params               | 200 list        |
| `/api/books`         | POST  | `{ goodreads_id, status }` | 201 summary     |
| `/api/books/{id}`    | PATCH | `{ field, value }`         | 200 diff        |
| `/api/backfill/{id}` | POST  | `{}`                       | 202 prompt‑link |
| `/api/report/weekly` | POST  | `{}`                       | 202 report URL  |

Implementation choices:

- **Python stack:** FastAPI + Pydantic
- **JavaScript stack:** Next.js API routes + TypeScript Stakeholder expresses no strong preference; either stack is acceptable.

### 4.4 Scheduler & Notification Plan

| Task                         | Trigger             | Mechanism                                                  |
| ---------------------------- | ------------------- | ---------------------------------------------------------- |
| RSS ingest                   | `0 */6 * * *`       | GitHub Actions cron job                                    |
| RAG rebuild                  | `on: push`          | GitHub Actions                                             |
| Weekly digest                | Sunday 20:00 CT     | **ChatGPT Scheduled Task** (native, push notification)     |
| Monthly report               | 1st Sunday 20:00 CT | ChatGPT Task                                               |
| Push alerts for Claude users | same schedule       | Telegram bot (free) delivering deep‑link to Claude Project |

> **Viability check:** *ChatGPT Scheduled Tasks* are now GA for Plus users and support weekly or monthly cadence with push notifications. Claude Pro currently lacks an equivalent; hence Telegram/email fallback.

### 4.5 Retrieval‑Augmented Generation (RAG) Pipeline

1. **Chunk**: `books.json` (one record each), all reflection Markdown, `instructions.md`, `classifications.yaml`, `resources.yaml`.
2. **Embed**: local embedding model (e.g., `e5‑small‑v2`) served via Ollama.
3. **Index**: FAISS flat index (or Chroma) stored in repo.
4. **Retrieve**: top‑k (`k≈5`) per prompt using AutoGen/CrewAI retrieval tools.
5. **Generate**: LLM response with cited context.
6. **Write‑back**: updated content triggers automatic re‑embedding.

### 4.6 Tech‑Stack Matrix (no preference fixed)

| Concern         | Python‑centric Path | JavaScript‑centric Path |
| --------------- | ------------------- | ----------------------- |
| API             | FastAPI             | Next.js API routes      |
| Background jobs | GH Actions (Python) | GH Actions (Node)       |
| Vector DB       | FAISS via LangChain | Chroma‑js               |
| Scheduler push  | ChatGPT Tasks       | same                    |
| Charts          | Matplotlib          | Chart.js                |

### 4.7 Open Questions (Resolved)

1. **API language preference** → *No hard preference.*  Either stack acceptable.
2. **Scheduler split** → *Yes.* GitHub handles ingestion; ChatGPT Tasks handle push. Claude users receive Telegram notifications.
3. **Realtime Firebase mirror** → *Include now.* Sync job from Git JSON to Firebase runs `on:push`.

### 4.8 Risk & Mitigation Snapshot

| Risk                            | Likelihood                  | Mitigation                                     |
| ------------------------------- | --------------------------- | ---------------------------------------------- |
| GitHub runner minutes exhausted | Low (public repo unlimited) | Use private self‑hosted runner if rate‑limited |
| Firebase quota saturation       | Low for \~10k records       | Archival script moves old refs to cold storage |
| Telegram API changes            | Moderate                    | Retain email fallback                          |

---

## Step‑by‑Step Implementation Guide

*(Phases are aligned with the Milestone Roadmap; tooling names are suggestions, not mandates.)*

### Phase 0 Repository Bootstrap

1. **Fork / create** `shelfhelp-ai` public repo.
2. `mkdir -p data history reflections reports scripts vectorstore .github/workflows`
3. Seed files:
   - `data/books.json` → `[]`
   - `data/classifications.yaml` → consolidated taxonomy
   - `data/preferences.json` → `{}`
   - `data/resources.yaml` → initial URL list
   - `instructions.md` → copy from *ShelfHelp\_Instructions.txt*
4. Add `` for `__pycache__/`, local `.env`, editor temp files.
5. Commit & push → GitHub Action `on:push` fires (empty job for now).

### Phase 1 Environment & Local RAG Scaffold

1. **Python path**  (if choosing Python):\
   `pip install fastapi uvicorn langchain faiss-cpu pyyaml python-dotenv`
2. Write `scripts/rag_ingest.py`  → chunks source files and builds `vectorstore/faiss.index`.
3. Add GitHub Action `rag_rebuild.yml`
   ```yaml
   on: push
   jobs:
     build-rag:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Install deps
           run: pip install -r requirements.txt
         - name: Build index
           run: python scripts/rag_ingest.py
         - name: Commit index
           run: |
             git add vectorstore/faiss.index
             git commit -m "Rebuild RAG index" || echo "no change"
             git push
   ```
4. Verify: pushing a trivial README edit triggers index build.

### Phase 2 RSS Ingestion Pipeline

1. `scripts/rss_ingest.py`
   - Pull Goodreads RSS URL from `os.environ["GOODREADS_RSS_URL"]`.
   - Parse `<item>`s; upsert any unseen `guid` to `books.json` (`status: "Finished"`).
2. GitHub Action `rss_ingest.yml` with cron `0 */6 * * *`.
3. On success: commit updated `books.json` → triggers RAG rebuild.

### Phase 3 Reflection MVP

1. In API server, add endpoint `POST /api/mark_finished`.
2. On call, create template at `reflections/{goodreads_id}/{today}.md`:
   ```md
   ---
   book_id: 123
   date: 2025-07-30
   ---
   ## Guided Questions
   1. What emotions stood out to you?
   ...
   ```
3. **ChatGPT Task**: schedule hourly check → if new reflection file exists with empty answers, push a prompt to user with deep link.
4. When user replies in chat, API updates the MD file, writes `liked`, `disliked`, `notes` back to `books.json`.

### Phase 4 Weekly Report Generator

1. `scripts/generate_weekly.py`
   - Query `books.json` where `updated_at` in last 7 days.
   - Compute pages read, trope distribution, queue preview.
   - Render `reports/weekly/YYYY-WW.md` (Markdown + inline charts via base64 PNG, optional Matplotlib).
2. GitHub Action `weekly_report.yml` Sunday 20:00 CT → runs script, commits report, and pings ChatGPT Task to notify.

### Phase 5 Recommendation Engine + Queue Logic

1. Implement `scripts/recommend_next.py`
   - Accept current preference vectors from `preferences.json`.
   - Call RAG retriever for candidate books (unread).
   - Score via cosine similarity + queue heuristics.
2. Add chat command `/next` → API returns formatted card for top recommendation + rationale.

### Phase 6 Library / KU / Hoopla Enrichment

1. `scripts/library_check.py` scrapes OverDrive / Hoopla pages using **Requests‑HTML** (or Playwright).
2. Nightly cron updates availability fields in `books.json` and bumps `availability_source`.

### Phase 7 Firebase Mirror & PWA

1. Create RTDB at `firebaseapp.com`.
2. `scripts/git_to_firebase.py` runs `on:push` → sync diff from Git files to Firebase JSON nodes.
3. (Optional) Scaffold a minimal **LobeChat** or **React PWA** that reads from Firebase for instant queue view.

### Phase 8 Hardening & Documentation

1. Write `docs/setup.md` with local dev steps.
2. Add JSON-schema validation pre‑commit hook for `books.json`.
3. Implement basic error handling & retries in all scripts.
4. Final walkthrough with stakeholder.

---

---
