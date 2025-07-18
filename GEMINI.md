# Project Overview: ShelfHelp AI Assistant

## Primary Purpose:
This project is a personal AI assistant designed to help me track my reading, analyze my preferences, and provide personalized book recommendations.

## Key Functionality:
1.  **Goodreads Integration:** Automatically updates book completion from Goodreads RSS feed into a Firebase Realtime Database (main knowledge base).
2.  **Book Data Enrichment:** Upon book completion, it browses the web to look up and fill in additional book data (genres, subgenres, tone, tropes, spice level, etc.).
3.  **Preference Analysis:** Prompts me with questions on what I liked and didn't like about the book so it can determine my preferences, rather than just go off my star rating, which is highly inconsistent, and determine its own ranking for me.
4.  **To-Be-Read (TBR) Management:** Allows adding books to a TBR list, automatically looking up information, adding to the database, and placing it in a numbered queue.
5.  **Recommendations:** Provides personalized book recommendations based on analyzed preferences.
6.  **Analytics & Reporting:** Offers on-demand analytics and generates weekly reports on reading habits and allows looking up ebook and audiobook availability on Kindle Unlimited, Hoopla, and my digital library memberships (Libby).

## Technical Considerations & Desired Hosting:
* **Core Technologies:** Node.js, JavaScript, Firebase Realtime Database (for main knowledge base).
* **Accessibility:** Desired through a mobile-friendly AI platform (like ChatGPT or Claude, not a custom mobile app).
* **Recurring Tasks:** Must support recurring automated tasks.
* **Cost:** Must be free beyond existing ChatGPT Plus and Claude Pro subscriptions.

## Authoritative Project Documentation:
* The **current and authoritative project plan** is located at `docs/workflows/Project_Plan.md`.
* All content within the `docs/archived/` folder is outdated and and should be ignored for the purpose of this review.

## SuperClaude Workflow Directives and Current Challenges:
* `CLAUDE.md`, `docs/workflows/Session_Workflow_Protocol.md`, and `docs/workflows/Task_Management_Guide.md` are intended to be the main directives for how Claude Code (with SuperClaude) should act and manage tasks.
* **Current Challenges:** SuperClaude often fails to consistently update tasks, incorporate new tasks (especially from `/sc:analyze` or `/sc:test`), follow command references, and tends to skip steps or go on tangents (e.g., completing steps 2 and 3 when only step 1 was requested). It seems to lack the granular context of the current development step to know when to pause and await further direction.
* My goal is to establish a **workable and maintainable project management system within SuperClaude** that it can constantly update and modify, ensuring adherence to workflow protocols and incorporating newly discovered issues (like errors or improvements) into the task list at the most appropriate time (immediate fix vs. later batching).

## Additional Context and Guiding Principles for Review:
Gemini, please refer to the following files and directories for additional context on coding style, architectural principles, design considerations, and existing documentation. This includes understanding the intended workflow and task management for SuperClaude and *how SuperClaude itself is designed to operate based on its framework documentation*:
* `CLAUDE.md` (primary directive for SuperClaude behavior)
* `docs/workflows/Session_Workflow_Protocol.md` (intended session workflow for SuperClaude)
* `docs/workflows/Task_Management_Guide.md` (my current task list and task management directives for SuperClaude)
* **Crucially, consult the documentation within the SuperClaude_Framework repository's `docs/` folder (e.g., User Guide, Commands Guide, Flags Guide, Personas Guide) to understand its intended behavior and optimal interaction patterns.** Do NOT consult SuperClaude's GitHub issues for this.
* All other `.md` and `.txt` files within *this project's* `docs/` folder (excluding `docs/archived/`). Pay particular attention to:
    * `docs/guides/` (for AI assistant context)
    * `docs/reports/` (for existing reporting structures)
    * Any `README.md` files at the root or within subdirectories.
    * `backend-audit-questions.txt` and `BACKEND_AUDIT_REPORT.md` for insights into past reviews or areas of focus.

## Output Requirements for PROJECT_REVIEW.md:
* **Do NOT make any changes to the codebase.** Your only output is the `PROJECT_REVIEW.md` file.
* Create a **single, comprehensive Markdown file** named `PROJECT_REVIEW.md` in the project root.
* This file must include:
    1.  **Actual code issues:** Bugs, inefficiencies, potential security vulnerabilities (even minor ones), performance bottlenecks, maintainability issues.
    2.  **Placeholders or incomplete code sections:** Clearly identify any areas that are incomplete or marked as `TODO`, `FIXME`, or similar.
    3.  **Inconsistencies:** Any discrepancies between the existing code, the current task list (as implied by the code and project state and `docs/workflows/Task_Management_Guide.md`), and the project plan outlined in `docs/workflows/Project_Plan.md` and this `GEMINI.md`.
    4.  **Documentation Issues:** Note areas where documentation is missing, outdated, or inconsistent with the code/plan. Specifically, analyze the current state and intended purpose of the `docs` folder and suggest a concrete clean-up and reorganization strategy to make it more effective for both human developers and the AI assistant (Claude).
    5.  **SuperClaude Workflow & Task Management Issues Analysis and Solutions:**
        * Conduct an in-depth analysis of *why* SuperClaude might be going on tangents, skipping steps, or failing to consistently update the task list and incorporate new issues/tasks from its own analysis and testing (`/sc:analyze`, `/sc:test`). Base this analysis on your understanding of its intended behavior from its documentation and the observed current challenges.
        * Propose concrete, actionable changes to `CLAUDE.md`, `docs/workflows/Session_Workflow_Protocol.md`, and `docs/workflows/Task_Management_Guide.md` to make them more effective, atomic, and structured for SuperClaude to follow rigorously. This might include suggestions for:
            * New sections or explicit numbering to guide sequential execution.
            * Clear directives for SuperClaude to acknowledge completion of a step and *await explicit next instructions* before proceeding.
            * A revised method for task insertion (e.g., using specific tags, sections, or prompts that guide SuperClaude to place new tasks at the "best time to fix" – either immediately or batched by functionality).

* **Interactive Prompting (Gemini-to-You AND SuperClaude-to-You):**
    * For each issue or discrepancy found (code, documentation, or SuperClaude workflow):
        * **Gemini-to-You Interaction:** If Gemini requires your input during its review process, it will **ask you a clarifying question** about your preference (e.g., if multiple ways to address an issue, or if an intended direction is unclear). It will then provide you with the exact command structure for your reply, which is specific to this Gemini session:
            ```
            [Your Question Here]? Reply using this format: /continue_review --response "[Your Preference/Answer Here]"
            ```
            Once you provide this response, Gemini will proceed.
        * **SuperClaude-to-You Prompts for Interaction (Prescribing SuperClaude's Behavior):** For every "Recommended Change" (whether for code, documentation, or workflow), `PROJECT_REVIEW.md` will provide the **exact, atomic SuperClaude prompt(s