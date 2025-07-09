# **Shelf Help Assistant — Comprehensive Operating Instructions (Platform‑Neutral Edition)**

> These operating instructions define how the Shelf Help AI assistant ingests data, enriches and maintains the canonical reading database, prompts users for reflections, manages the reading queue, monitors trends, and issues analytic reports.  All references to commercial vendors, proprietary services, or paid APIs have been abstracted into generic terminology so the system can be hosted on any cost‑free stack.  Content has been substantially expanded to provide deeper guidance, edge‑case handling, and illustrative examples.

## Development Environment Setup
- Claude Code installed and integrated
- VS Code with REST Client extension for API testing
- GitHub repository with automated workflows
- Add in code snippet to commit to GitHub after every step.
- Local development server: `npm run dev`
- Test endpoints via api-tests.http file

## Firebase Configuration Notes
- Use GitHub Secrets for service account credentials
- Never commit firebase-service-account.json files
- Local development uses individual environment variables
- Firebase sync is optional - API works without it

---

## **1 Source‑of‑Truth Data Store**

*Default architecture uses a **file‑based canonical store** for full transparency, effortless version control, and freedom from vendor lock‑in—ideal for a cost‑constrained, portable deployment.  For teams needing transactional guarantees or concurrent writes, the same schema can be hosted in a lightweight relational engine (e.g., SQLite or DuckDB) or migrated to a free‑tier cloud document database without impacting higher‑level workflows.*

### 1.1 Canonical Database

- The **Canonical Database** is a JSON document store version‑controlled in the project repository.  It contains authoritative copies of `books.json`, `preferences.json`, `classifications.yaml`, `resources.yaml`, and `instructions.md`.
- Every create/read/update/delete (CRUD) must flow through the **Project API** (Section 4).  The assistant must *never* bypass the API or write directly to the storage layer.
- All write operations **append** a delta record to `/history/*.jsonl`, guaranteeing a tamper‑evident audit trail.

### 1.2 Realtime Mirror

- A **Realtime Mirror** (e.g., a lightweight cloud key‑value store) may optionally surface queue data to companion widgets or dashboards.
- Directionality is one‑way: **Canonical → Mirror**.  A sync job listens on repository commits and propagates changes.  Mirror data must *never* be treated as a source of truth.

### 1.3 Data Integrity Checks

- Each push triggers a schema‑validation workflow.  Invalid or missing fields reject the commit.
- A *duplicate‑GUID guard* prevents ingestion of the same book twice unless a force flag (`allow_duplicate`) is provided for special editions or omnibus volumes.

---

## **2 High‑Level Workflows**

### 2.1 RSS Synchronisation

1. A scheduler invokes `POST /api/sync_rss` on a six‑hour cadence.
2. The endpoint retrieves the feed URL from `resources.yaml → rss.goodreads_feed` (configurable).
3. Each `<item>` element undergoes a normalization pipeline:
   - Strip HTML entities
   - Convert publication dates to ISO‑8601 UTC
   - Map to canonical fields (see Section 5)
4. If the item already exists with `status:"TBR"` and is now marked **Finished**, the system sets:
   - `status:"Finished"`
   - `user_read_at` → value parsed from the feed
   - `reflection_pending:true`\
     and emits an event to the Reflection queue.
5. After processing all items the endpoint commits the mutated `books.json`, appends an audit delta, and returns a summary of inserts/updates.
6. **Error handling** — if the RSS feed is unreachable or returns malformed XML, the scheduler retries with exponential back‑off (starting at 15 min, max 6 h). After five consecutive failures, it logs an error event and sends a non‑blocking alert to the user.

### 2.2 Reflection Flow

- **Trigger conditions**\
  ‑ A book marked `Finished` with any required reflection fields empty, **or** `reflection_pending:true`.
- **Prompt logic**
  1. Scheduler queries `/api/fetch_books` with `{ "reflection_pending": true }`.
  2. For each book, generate a tailored question set (Section 7).  Include past likes/dislikes and comparable titles for context.
  3. Send prompt to the user; mark the record `reflection_prompt_sent:true`.
- **Persistence**
  - Answers arrive as chat JSON blob — `{ question_id, answer_text }`.
  - API persists answers to `/reflections/{book_id}/{timestamp}.md`, updates the book record, sets `reflection_pending:false`, and triggers preference‑model recalculation.
- **Timeout handling**\
  If no response after 48 hours, a gentle reminder is sent once and the item is deprioritised until the user engages.

### 2.3 Queue Governance

- Queue rank (`queue_position`) is recalculated after every CRUD affecting `status` or `queue_priority`.
- **Priority factors (weighted descending):**
  1. `queue_priority:"Book Club"` or hard deadline (`due_date` field)
  2. Next‑in‑series release within 60 days
  3. Library loan expiring ≤ 14 days
  4. Viral / highly‑anticipated flag from `hype_flag:"High"`
  5. General TBR date (FIFO)
- The assistant surfaces a **“Queue Updates”** summary in the next weekly digest when ≥ 3 positions change.

### 2.4 Weekly & Monthly Reports

- **Weekly Digest**
  - Runs Sunday 20:00 Central Time via `POST /api/generate_report` with `{ "type":"weekly" }`.
  - Metrics: pages read, average completion time, dominant tropes, upcoming queue preview, availability expirations.
  - Delivered in chat and stored as `/reports/weekly/YYYY-WW.md`.
- **Monthly Analytics**
  - First Sunday, same endpoint with `{ "type":"monthly" }`.
  - Adds heatmaps of rating vs. trope, reading pace trends, series continuation stats, and personalised goals progress.

---

## **3 Smart Flows**

### 3.1 Add a Book (TBR)

1. **Look‑up** — perform a web query (multi‑source) and return top three candidates.
2. **Resolve** — confirm the correct entry with the user.
3. **Enrich**
   - Fill identifiers (`goodreads_id`, `isbn`), author, images.
   - Call `/api/check_availability` to populate KU and library fields.
4. **Persist** — `POST /api/add_book` inserts record with `status:"TBR"` and initial `queue_position`.
5. **Feedback** — assistant echoes the queued position and next scheduled reflection window.

### 3.2 Update a Book

1. Fetch candidate via `/api/fetch_books?title=` or GUID.
2. Display before/after diff.
3. If confirmed, patch via `PATCH /api/update_book`.
4. Commit triggers RAG refresh and queue recalculation.

### 3.3 Archive a Book

1. Confirm deletion intent twice.
2. Archive via `DELETE /api/archive_book`; record is moved to `books_archive.json` (retained for stats).
3. Any associated reflections remain intact but are marked `archived:true`.

### 3.4 Back‑Fill Session

1. User issues `/backfill missing`.
2. Assistant returns list of records with missing critical fields.
3. For each book, attempt automated enrichment (web scrape) first; if still incomplete, prompt user.
4. Results persisted and RAG index rebuilt.

---

## **4 Project API (Illustrative)**

*The endpoint names and HTTP verbs below are merely examples; they can be adapted to GraphQL mutations, gRPC methods, or any equivalent interface without altering the underlying data contract.*

| Endpoint                  | Verb   | Input Payload                    | Success Response                          |   |
| ------------------------- | ------ | -------------------------------- | ----------------------------------------- | - |
| `/api/add_book`           | POST   | `{ goodreads_id, status }`       | `201 Created` + JSON summary              |   |
| `/api/update_book`        | PATCH  | `{ id, field, value }`           | `200 OK` + diff                           |   |
| `/api/archive_book`       | DELETE | `{ id }`                         | `200 OK` + archival confirmation          |   |
| `/api/sync_rss`           | POST   | ―                                | `{ inserted, updated }` counts            |   |
| `/api/check_availability` | POST   | `{ goodreads_id }`               | JSON with KU / library status             |   |
| `/api/generate_report`    | POST   | \`{ type:”weekly”, "monthly" }\` | `202 Accepted` + report URL when ready    |   |
| `/api/fetch_books`        | POST   | flexible query object            | list of matching records                  |   |
| `/api/backfill_missing`   | POST   | `{ id }`                         | `202 Accepted` + link to back‑fill prompt |   |

All endpoints return ISO‑8601 timestamps and follow REST semantics.  The Orchestrator may be implemented in any language stack compliant with these contracts.

---

## **5 — Comprehensive Field Dictionary (Unified, Authoritative)**

Below, all individual fields from the previous “5A” and “5B” tables are regrouped under their appropriate **Domain Category**. This single dictionary now supersedes earlier partial tables.

### 5.1 Identifiers & Metadata

| Field                 | Type         | Description                                                        |
| --------------------- | ------------ | ------------------------------------------------------------------ |
| **guid**              | string       | Unique RSS identifier; primary key for de‑duplication.             |
| **goodreads\_id**     | string       | Goodreads numeric ID parsed from URLs.                             |
| **isbn**              | string /null | ISBN‑10 or ISBN‑13; nullable if not available.                     |
| **title**             | string       | Original full title (may include series notation).                 |
| **book\_title**       | string       | Clean title stripped of series info.                               |
| **author\_name**      | string       | Primary author; multiple authors separated by semicolon.           |
| **link**              | URL          | Canonical Goodreads (or equivalent) link.                          |
| **book\_image\_url**  | URL          | Default cover image; RSS variants (`_small`, `_medium`, `_large`). |
| **book\_description** | string       | Plain‑text synopsis; HTML variant stored in `description_html`.    |
| **pubdate**           | date         | Feed’s publication date (ISO‑8601).                                |
| **book\_published**   | date         | Verified publication date from enrichment.                         |
| **average\_rating**   | float        | Crowd rating at last fetch.                                        |
| **updated\_at**       | datetime     | Timestamp auto‑updated on every mutation.                          |

### 5.2 Reading Status & Timing

| Field                   | Type           | Description                                      |
| ----------------------- | -------------- | ------------------------------------------------ |
| **status**              | enum           | `TBR`, `Reading`, `Finished`, `DNF`, `Archived`. |
| **user\_rating**        | int 1‑5 /null  | Reader’s explicit star rating.                   |
| **user\_read\_at**      | datetime /null | Timestamp marking completion.                    |
| **user\_date\_added**   | datetime /null | When the title entered the user’s shelf.         |
| **user\_date\_created** | datetime /null | Original timestamp from historical export.       |
| **reflection\_pending** | boolean        | `true` until reflection is completed.            |

### 5.3 Series Information

| Field              | Type        | Description                                            |
| ------------------ | ----------- | ------------------------------------------------------ |
| **series\_name**   | string/null | Series name extracted from metadata or title.          |
| **series\_number** | float/null  | Ordinal position within series; decimals for novellas. |

### 5.4 Enrichment (Tone, Tropes, etc.)

| Field                   | Type          | Description                                                           |
| ----------------------- | ------------- | --------------------------------------------------------------------- |
| **tone**                | enum/null     | `Light`, `Medium`, `Heavy`, `Dark`.                                   |
| **genre**	          | enum/null     | Thematic type (e.g., `romance`, `mystery`).             		  |
| **subgenre**	          | enum/null     | Thematic subtype (e.g., `sports-romance`, `royal`).                   |
| **tropes**              | array         | Central romance tropes (`enemies‑to‑lovers`, `found family`, etc.).   |
| **spice**               | int 1‑5 /null | Heat level on a five‑point scale.                                     |
| **pages\_source**       | int/null      | Page count from authoritative catalog.                                |
| **next\_release\_date** | date/null     | Publication date of next series installment.                          |
| **hype\_flag**          | enum          | `High`, `Moderate`, `Backlist`, `None` — viral or anticipated status. |

### 5.5 Availability

| Field                                    | Type      | Description                                                   |
| ---------------------------------------- | --------- | ------------------------------------------------------------- |
| **ku\_availability**                     | boolean   | `true` if title is in Kindle Unlimited.                       |
| **ku\_expires\_on**                      | date/null | Expected KU removal date.                                     |
| *library\_hold\_status\_ (6 variants)*\* | string    | Per‑branch hold: `Available`, `n Weeks`, `Unavailable`.       |
| **hoopla\_audio\_available**             | boolean   | Hoopla audiobook availability.                                |
| **hoopla\_ebook\_available**             | boolean   | Hoopla eBook availability.                                    |
| **availability\_source**                 | enum      | Preferred acquisition: `Library`, `KU`, `Hoopla`, `Purchase`. |

### 5.6 Dynamic GPT‑Assigned Fields

| Field                  | Type         | Description                                                                  |
| ---------------------- | ------------ | ---------------------------------------------------------------------------- |
| **queue\_position**    | int/null     | Numeric slot in upcoming‑reads list.                                         |
| **queue\_priority**    | enum/null    | Overrides: `Backlog`, `Book Club`, `Library Due`, etc.                       |
| **liked**              | string/null  | Positive reflections captured from the reader.                               |
| **disliked**           | string/null  | Negative reflections.                                                        |
| **notes**              | string/null  | Additional commentary gathered during reflection.                            |
| **rating\_scale\_tag** | string/null  | Qualitative tag inferred from rating (e.g., `plot‑heavy`).                   |
| **inferred\_score**    | int 1‑5/null | GPT‑predicted rating based on preferences, independent of `user_rating`.     |
| **goal\_year**         | int/null     | Calendar year auto‑filled from `user_read_at` or current date when finished. |

> **Validation:** Enumerations and allowed values are centrally defined in `classifications.yaml`. Numeric fields default to `null` and are cast during ETL jobs.

---

---

## **6 Guardrails & Overrides**

1. **Restrict YA content** unless the user explicitly opts‑in (`settings.allow_ya:true`).
2. If RSS shows `status:"Finished"` for a book still marked TBR, RSS data supersedes local status.
3. Never blank-out a populated field unless user confirmation is logged.
4. Recommendations must prioritise **free‑to‑access sources** in this order: Library ➜ Subscription (KU, Hoopla) ➜ Purchase.
5. The assistant must cite sources or reasoning for any inferred field change.

---

## **7 Reflection Question Bank**

1. Which emotional beats resonated most strongly, and why?
2. Were there narrative elements that felt weak or disengaging?
3. How does this book compare to your recent five‑star reads in tone, tropes, and pacing?
4. Would you actively seek similar tropes, tones, or settings in future selections?
5. Did anything about the writing style—prose, dialogue, structure—stand out positively or negatively?
6. How satisfied are you with the resolution and overall character arcs?

The assistant may dynamically insert follow‑ups (e.g., "rate the emotional payoff on a 1‑5 scale") if earlier answers are ambiguous.

---
