# Functional Requirements — Atomic Work Breakdown

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-014 — Atomic Work Breakdown |
| Version | 1.0 |
| Date | 2026-08-05 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This requirements document specifies the functional behavior of the Atomic Work Breakdown feature (FTR-014). FTR-014 redefines the task as the smallest independently implementable, verifiable, and committable unit of work. It introduces a two-stage validation pipeline, upgrades the work breakdown output format to versioned JSON (schema v2) as the authoritative source, and renders deterministic Markdown and CSV views from that JSON. The goal is to reduce token consumption variability, rework cost, and estimation error by enforcing strict atomicity contracts.

### 1.2 Scope

**In scope:**
- Updated task contract with mandatory fields (`outcome`, `domain`, `agentType`, `dependsOn`, `acceptanceCriteria`, `verification`, `estimate`, `outputCount`, `groupingRationale`, `commit`)
- Phase-level `commit` field for use in CSV generation
- Two phase types: `infrastructure` (INFRA tasks) and `user-story` (US tasks)
- `{PREFIX}-Work-Breakdown.json` (schema v2) as the sole authoritative task source
- Deterministic JavaScript validator (`.claude/scripts/wb-validate.js`) performing structural and deterministic rule checks (no LLM)
- Deterministic JavaScript renderer (`.claude/scripts/wb-render.js`) producing Markdown and CSV outputs from JSON
- Semantic LLM validator agent (`validate-work-breakdown-semantic`) for coherence and scope analysis
- Updated `generate-work-breakdown` agent to produce schema v2 JSON
- Integration into `pm-phase2` with two-stage validation and Gate 2 upgrade
- CSV retention as a backward-compatibility layer for `pm-phase3`
- Four-band duration statistics and enhanced Gate 2 payload
- Automated test suite covering validators, renderer, and Gate 2 blocking logic

**Out of scope:**
- Execution ledger (FTR-015)
- Resume and checkpoint recovery (FTR-016)
- Modification of `pm-phase3` execution logic (continues to read CSV)
- Migration of `pm-phase3` to read JSON natively (follow-on FTR)
- Automatic commit creation per task at runtime
- Parallel worktrees
- Runtime token and duration monitoring
- Replan during implementation
- Formal waiver mechanism for the 21–30 minute warning band (deferred)
- Configurable duration thresholds (deferred)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `generate-work-breakdown` agent | LLM agent that decomposes feature requirements into atomic tasks, producing schema v2 JSON |
| `.claude/scripts/wb-validate.js` | Deterministic JavaScript module that performs structural and deterministic checks — no LLM, no network I/O |
| `validate-work-breakdown-semantic` agent | LLM agent (Sonnet) that performs semantic coherence and scope analysis — runs only after structural validation passes |
| `.claude/scripts/wb-render.js` | Deterministic JavaScript module that renders Markdown and CSV views from JSON |
| `pm-phase2` workflow | Orchestrates the two-stage validation pipeline and assembles Gate 2 payload |
| `pm-phase3` | Consumes CSV output (unchanged) for execution planning |
| Feature delivery stakeholders | Review Gate 2 payload and approve or reject work breakdown |

## 2. Use Cases

### UC-01: Generate atomic work breakdown from requirements

| Field | Value |
|-------|-------|
| Actor | `generate-work-breakdown` agent |
| Preconditions | Feature has passed Gate 1; Requirements, Tech-Spec, and Approvals documents are available |
| Trigger | `pm-phase1` invokes `generate-work-breakdown` |
| Priority | Must |

**Main flow:**
1. Agent reads Requirements, Tech-Spec, and Approvals documents
2. Agent decomposes work into infrastructure (INFRA) and user-story phases
3. For each phase, agent creates atomic tasks following the contract:
   - Exactly one observable outcome per task
   - Exactly one domain per task
   - Exactly one agentType per task
   - Verification commands specified
   - Estimate provided (agentMinutes targeting ≤ 15 min, tokens)
   - Commit subject specified
   - acceptanceCriteria list populated (may be empty if unscoped)
4. Agent sets phase-level `commit` field with type and subject
5. Agent writes `{PREFIX}-Work-Breakdown.json` (schema v2) as the sole authoritative source

**Alternative flows:**
- [task estimated > 15 min but ≤ 30 min] → agent documents business case and marks as above target or warning
- [multiple outputs required for a single outcome] → agent supplies `groupingRationale` explaining why bundling is necessary

**Error flows:**
- [cannot decompose coherently into ≤ 15 min tasks] → agent escalates in commit/description for Gate 2 review
- [AC requirements cannot be satisfied] → agent flags concern in Gate 2 payload

**Postconditions:**
- `{PREFIX}-Work-Breakdown.json` is written to feature directory
- JSON follows schema v2 structure (see Section 4.1)
- All tasks are atomic per the contract

---

### UC-02: Validate work breakdown structure and dependencies

| Field | Value |
|-------|-------|
| Actor | `.claude/scripts/wb-validate.js` (deterministic JavaScript module) |
| Preconditions | `{PREFIX}-Work-Breakdown.json` exists and is valid JSON; `wb-validate.js` is executable |
| Trigger | `pm-phase2` invokes `wb-validate.js` after `generate-work-breakdown` completes |
| Priority | Must |

**Main flow:**
1. `wb-validate.js` reads `{PREFIX}-Work-Breakdown.json`
2. Checks schema version is 2
3. Validates structural requirements:
   - All task IDs are unique across the feature
   - All required fields are present and non-null
   - Task ID format conforms to scheme (`INFRA-TASK-{DOMAIN}-{NN}` or `{US-ID}-TASK-{DOMAIN}-{NN}`)
   - Domain and agentType values are valid (whitelist defined in schema)
4. Validates dependencies — task level:
   - All task IDs in `dependsOn` fields exist in the feature
   - A task must not depend on itself (`task.id` must not appear in its own `dependsOn`)
   - Task ID prefix must match the phase that contains it (`INFRA-TASK-*` only in the INFRA phase; `{US-ID}-TASK-*` only in the `{US-ID}` phase)
   - No task-level dependency cycles (full graph traversal; report cycle members explicitly)
5. Validates dependencies — phase level:
   - Compute the phase-level `depends_on` aggregate using the same projection applied by `wb-render.js`
   - All phase IDs referenced in the phase-level graph must exist in the feature
   - A phase must not depend on itself
   - No phase-level dependency cycles (report cycle members explicitly)
   - Applying `pm-phase3`'s `buildWaves` algorithm to the phase graph must consume all phases without error; if any phase cannot be scheduled, it is a blocking error
6. Validates duration policy:
   - Tasks ≤ 15 min marked as target (no flag)
   - Tasks 16–20 min marked as above target (no flag)
   - Tasks 21–30 min flagged as warning (non-blocking)
   - Tasks > 30 min flagged as `splitRequired` (blocking)
7. Validates output bundling:
   - Tasks with `outputCount > 1` must have non-null `groupingRationale`
8. Validates verification:
   - Every task has non-empty `verification.commands` list
9. Validates commit subject:
   - Every task has non-null `commit.subject`
10. Validates acceptance criteria:
   - Each AC ID in `acceptanceCriteria` must exist in the `## 7. Acceptance Criteria` table of Requirements
   - Each AC references one or more UC-NN values in the `Related UC` column
   - Each UC-NN maps to the corresponding US-NN (e.g., UC-02 → US-02); a task in US-NN may only reference ACs whose `Related UC` includes UC-NN
   - An AC whose `Related UC` is `All UCs` or an explicit global marker is unscoped and may be referenced by any task
   - An AC linked to multiple UCs is valid for each corresponding US but is not automatically unscoped
   - AC priority is derived from the priority of the referenced Use Case(s); when linked to multiple UCs, the strongest priority applies: Must > Should > Could
   - References to non-existent UC-NN values in `Related UC` are a blocking error
   - Use Cases without a defined priority are a blocking error
   - Every AC whose derived priority is Must must be covered by at least one task in the feature
11. Validates text fields:
    - `phase.title`, `task.title`, `commit.subject` must not contain `|`, CR, or LF characters
12. Emits structured JSON report with results, warnings, errors
13. Exits with code 0 (all checks pass) or non-zero (blocking errors found)

**Alternative flows:**
- None — validation is deterministic; flow is fixed

**Error flows:**
- [JSON is malformed] → abort with explicit error message; exit non-zero
- [schema version ≠ 2] → flag error; exit non-zero
- [task ID not unique] → flag task, list duplicates, exit non-zero
- [required field missing or null] → flag task and field, exit non-zero
- [dependsOn references non-existent task] → flag task, list bad references, exit non-zero
- [task depends on itself] → flag task ID, exit non-zero
- [task ID prefix does not match containing phase] → flag task and expected prefix, exit non-zero
- [task-level dependency cycle detected] → flag all tasks in cycle with explicit description, exit non-zero
- [phase-level dependency cycle detected] → flag all phases in cycle with explicit description, exit non-zero
- [phase referenced in phase-level graph does not exist] → flag phase ID, exit non-zero
- [phase graph cannot be fully scheduled by buildWaves] → flag unschedulable phase(s), exit non-zero
- [task estimated > 30 min] → flag as `splitRequired`; exit non-zero
- [outputCount > 1 without groupingRationale] → flag task, exit non-zero
- [AC ID does not exist in Requirements AC table] → flag task and AC ID, exit non-zero
- [AC's Related UC does not include the task's US mapping] → flag task, AC, and the allowed US list, exit non-zero
- [Related UC references a UC-NN that does not exist] → flag AC ID and invalid UC reference, exit non-zero
- [Use Case has no defined priority] → flag UC ID, exit non-zero
- [Must-priority AC (derived) has no covering task] → list uncovered ACs, exit non-zero
- [text field contains forbidden characters] → flag field, show character, exit non-zero

**Postconditions:**
- Structured validation report is emitted (JSON format) regardless of exit code
- Exit code signals overall validation result to calling process
- If exit code is 0, semantic validation may proceed
- If exit code is non-zero, semantic validation is skipped

---

### UC-03: Validate work breakdown semantics and coherence

| Field | Value |
|-------|-------|
| Actor | `validate-work-breakdown-semantic` agent (Sonnet LLM) |
| Preconditions | `wb-validate.js` has exited with code 0 (all structural checks pass); `{PREFIX}-Work-Breakdown.json` and Requirements are available |
| Trigger | `pm-phase2` invokes agent only if `wb-validate.js` passed |
| Priority | Must |

**Main flow:**
1. Agent reads `{PREFIX}-Work-Breakdown.json` and Requirements
2. For each task, analyzes:
   - Hidden multiplicity: multiple behaviors bundled in title/description (e.g., "N types", "all adapters", "complete CRUD")
   - Scope creep: task scope misaligned with assigned User Story
   - Estimate incompatibility: agentMinutes estimate unrealistic for declared scope
   - Bundled verifiable activities: multiple independently verifiable outcomes in one task
   - Other coherence issues
3. For each finding, generates structured result:
   - `taskId` — which task has the issue
   - `type` — category of issue (hidden_multiplicity, scope_creep, estimate_incompatible, bundled_verifiable, other)
   - `severity` — error or warning
   - `blocking` — whether Gate 2 must be blocked
   - `splitRequired` — whether task must be split (implies `blocking: true`)
   - `description` — human-readable explanation
4. Returns JSON object with `valid` boolean and `findings[]` array

**Alternative flows:**
- [scope creep is correctable without splitting] → `blocking: true`, `splitRequired: false` (correction possible, e.g., move task to different US)

**Error flows:**
- [agent fails technically — timeout, invalid output, or schema mismatch] → error recorded in ledger as `failed`; renderer skipped; Gate 2 blocked with explicit error message
- [agent output does not conform to required schema] → treated as technical failure; Gate 2 blocked

**Postconditions:**
- Structured semantic validation result is returned as JSON when agent completes successfully
- `valid: false` when any finding has `blocking: true`
- Findings are included in Gate 2 payload
- Agent status recorded in ledger: `done` if completed (even with blocking findings), `failed` if technical error, `skipped` if precondition not met

---

### UC-04: Render markdown and CSV views from JSON

| Field | Value |
|-------|-------|
| Actor | `.claude/scripts/wb-render.js` (deterministic JavaScript module) |
| Preconditions | `wb-validate.js` has exited with code 0; `validate-work-breakdown-semantic` has completed (successfully or with findings — but not with a technical failure) |
| Trigger | `pm-phase2` invokes `wb-render.js` sequentially after semantic validation completes; if semantic validator fails technically, rendering is skipped |
| Priority | Must |

**Main flow:**
1. `wb-render.js` reads `{PREFIX}-Work-Breakdown.json`
2. Generates `{PREFIX}-Work-Breakdown.md`:
   - Human-readable Markdown with task summary, estimated durations, domains, agent types
   - Organized by phase with task details
3. Generates `{PREFIX}-Work-Breakdown.csv`:
   - Pipe-separated format (not comma, to match `pm-phase3` expectation)
   - Exactly eight columns: `phase_id`, `phase_title`, `commit_message`, `depends_on`, `task_id`, `task_title`, `domain`, `agent_type`
   - One row per task
4. Maps JSON fields to CSV columns:
   - `phase_id` ← `phase.id`
   - `phase_title` ← `phase.title` (with defensive strip of `|`, CR, LF)
   - `commit_message` ← constructed from phase-level `commit`: `phase.commit.type + "(" + feature + "): " + phase.commit.subject`
   - `depends_on` ← phase-level aggregate (see below)
   - `task_id` ← `task.id`
   - `task_title` ← `task.title` (with defensive strip of `|`, CR, LF)
   - `domain` ← `task.domain`
   - `agent_type` ← `task.agentType`
5. Computes phase-level `depends_on` as follows:
   - Collect all task IDs from `dependsOn` fields across all tasks in the phase
   - For each collected task ID, look up its owner phase
   - Remove the current phase from the set (intra-phase dependencies are implicit)
   - Deduplicate and join with space
   - **Write the same `depends_on` value on every CSV row of that phase**
6. Defensively strips `|`, CR, LF from text fields before writing CSV (second pass safety net)

**Alternative flows:**
- None — rendering is deterministic

**Error flows:**
- [JSON is malformed] → abort with explicit error message; exit non-zero
- [required field missing] → abort with explicit field name; exit non-zero
- [phase-level aggregate logic fails] → abort with explicit error; exit non-zero

**Postconditions:**
- `{PREFIX}-Work-Breakdown.md` is written to feature directory
- `{PREFIX}-Work-Breakdown.csv` is written to feature directory
- CSV is fully consistent with JSON (testable regression)
- CSV respects eight-column pipe-separated contract for `pm-phase3`

---

### UC-05: Assemble and block Gate 2

| Field | Value |
|-------|-------|
| Actor | `pm-phase2` workflow |
| Preconditions | The pipeline has run sequentially: generate-work-breakdown → wb-validate → semantic validator → wb-render; Gate 2 is assembled from whatever results are available (including failure states) |
| Trigger | `pm-phase2` reaches Gate 2 assembly after each step completes or is skipped due to prior failure |
| Priority | Must |

**Main flow:**
1. Collects results from each pipeline step in order: `wb-validate.js`, then `validate-work-breakdown-semantic` (if ran), then `wb-render.js` (if ran); missing steps are represented as skipped/failed
2. Computes four-band duration statistics:
   - Count of tasks ≤ 15 min (within target)
   - Count of tasks 16–20 min (above target)
   - Count of tasks 21–30 min (warning)
   - Count of tasks > 30 min (split required)
   - Maximum estimated duration across all tasks
3. Computes domain distribution (count of tasks per domain)
4. Extracts:
   - List of tasks in the 21–30 min warning band with `groupingRationale` if present
   - List of tasks > 30 min (should be empty after `wb-validate.js` checks)
   - List of Must-priority ACs with no covering task
   - List of grouped tasks (`outputCount > 1`) with `groupingRationale`
5. Assembles `gate2_payload` with:
   - JS validator structured report
   - Semantic validator structured result
   - Four-band duration statistics
   - Domain distribution
   - Warning-band tasks with rationale
   - Split-required tasks
   - Uncovered Must ACs
   - Grouped tasks with rationale
6. Determines Gate 2 block status:
   - Blocked if `wb-validate.js` exited non-zero
   - Blocked if any task has `estimate.agentMinutes > 30`
   - Blocked if any semantic finding has `blocking: true`
   - Blocked if any Must-priority AC is uncovered
   - Otherwise, Gate 2 is not blocked

**Alternative flows:**
- None — blocking logic is deterministic

**Error flows:**
- [wb-validate.js exits non-zero] → semantic validator skipped (`skipped`); renderer skipped (`skipped`); Gate 2 blocked with validator report
- [semantic validator fails technically] → renderer skipped (`skipped`); Gate 2 blocked with technical error
- [semantic validator returns blocking findings] → renderer runs; Gate 2 blocked with findings
- [wb-render.js fails] → Gate 2 blocked; CSV unavailable (pm-phase3 cannot proceed)
- [gate2_payload construction fails] → report error; assume Gate 2 blocked
- [duration statistics computation fails] → report error; assume Gate 2 blocked

**Postconditions:**
- `gate2_payload` is assembled and passed to Gate 2 notification
- Gate 2 is either blocked or not blocked based on deterministic rules
- Gate 2 presentation includes all payload data for user review

---

---

### UC-06: Track pipeline activities in the FTR-013 ledger

| Field | Value |
|-------|-------|
| Actor | `pm-phase2` workflow |
| Preconditions | FTR-013 ledger is present; ledger file is writable |
| Trigger | Each new pipeline activity starts or concludes |
| Priority | Must |

**Main flow:**

For each of the three new pipeline activities — `wb-validate:phase2`, `validate-work-breakdown-semantic:phase2`, `wb-render:phase2`:

1. Before starting: append a ledger entry with status `running`, token count 0, `started_at` timestamp, `completed_at` null
2. After successful completion: update the entry to status `done`, record actual token delta, `completed_at` timestamp
3. If the activity fails technically: update the entry to status `failed`, record actual token delta consumed up to the point of failure, `completed_at` timestamp, `error_summary`, and `exit_code` when available
4. If the activity is skipped due to an unmet precondition: append (or update) the entry with status `skipped`, token count 0, timestamps set to skip moment

Each ledger entry must include at minimum:
- `agent` — activity key (e.g., `wb-validate:phase2`)
- `phase` — `phase2`
- `model` — the model used (haiku for validate and render; sonnet for semantic)
- `status` — `running` | `done` | `failed` | `skipped`
- `phase_delta_tokens` — actual tokens consumed; 0 only for `skipped` entries
- `started_at` — UTC ISO timestamp
- `completed_at` — UTC ISO timestamp or null while running

For `failed` entries, additionally:
- `error_summary` — human-readable description of the failure (command error, timeout, schema mismatch, empty stdout, missing output files, agent exception)
- `exit_code` — the script exit code when available; null otherwise

**Status semantics:**
- `done` — activity completed successfully; includes activities that completed with findings (semantic validator returned blocking findings is `done`, not `failed`)
- `failed` — technical error: script not found, timeout, unhandled exception, stdout empty, output schema mismatch, missing output files; token delta is the actual amount consumed before failure (may be non-zero)
- `skipped` — activity not started because a prerequisite step failed or was itself skipped; token delta is always 0

**Postconditions:**
- Ledger contains one entry per activity per pm-phase2 run
- Entry is in final state (`done`, `failed`, or `skipped`) when pm-phase2 completes
- Token delta is the actual amount consumed for `done` and `failed` entries; zero only for `skipped`

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Each task must have exactly one observable outcome (no "and" or plural subjects in outcome statement) | UC-01, UC-02 |
| BR-02 | Each task must have exactly one domain and exactly one agentType | UC-01, UC-02 |
| BR-03 | Task ID format must be `INFRA-TASK-{DOMAIN}-{NN}` for infrastructure or `{US-ID}-TASK-{DOMAIN}-{NN}` for user-story | UC-01, UC-02 |
| BR-04 | Counter in task ID (NN) resets per US; INFRA counter is global at feature level | UC-01, UC-02 |
| BR-05 | Target task duration is ≤ 15 minutes; this is a goal, not a hard constraint for MVP | UC-01 |
| BR-06 | Tasks 16–20 min are valid (above target); tasks 21–30 min are warning (non-blocking); tasks > 30 min must be split (blocking) | UC-02, UC-05 |
| BR-07 | Tasks with `outputCount > 1` must include a non-null `groupingRationale` explaining why bundling is necessary | UC-02 |
| BR-08 | Every task must include verification commands (at least one entry in `verification.commands`) | UC-02 |
| BR-09 | Every task must include a `commit.subject` (the subject line only; prefix is constructed by renderer) | UC-02 |
| BR-10 | Each AC in `acceptanceCriteria` must exist in the Requirements AC table; the task's US must be among the ACs allowed user stories (derived from `Related UC`); unscoped ACs (`All UCs`) may be referenced by any task | UC-02 |
| BR-11 | AC priority is derived from the priority of the referenced UC(s); multiple UCs → strongest priority (Must > Should > Could); every AC with derived priority Must must be covered by at least one task | UC-02 |
| BR-12 | Text fields (`phase.title`, `task.title`, `commit.subject`) must not contain `\|`, CR, or LF characters | UC-02 |
| BR-13 | INFRA tasks may be depended upon by multiple User Story tasks; a single INFRA task can be referenced in `dependsOn` by any number of US tasks | UC-02 |
| BR-14 | Task-level dependency cycles are forbidden; a task must not depend on itself; graph traversal must detect and report all cycle members | UC-02 |
| BR-15 | A task's ID prefix must match the phase that contains it; cross-phase task ID placement is a structural error | UC-02 |
| BR-16 | `{PREFIX}-Work-Breakdown.json` is the sole authoritative source; Markdown and CSV are derived views | UC-04 |
| BR-17 | CSV `depends_on` is phase-level aggregate (same value on every row of a phase), computed as union of all task `dependsOn` IDs, mapped to owner phases, filtered by current phase; this projection is intentionally lossy | UC-04 |
| BR-18 | Pipeline is strictly sequential: generate-work-breakdown → wb-validate → semantic validator → wb-render → Gate 2; each step is skipped or blocked if a prior step failed | UC-03, UC-04, UC-05 |
| BR-19 | Phase-level dependency graph produced for CSV must be acyclic and fully schedulable by `pm-phase3` `buildWaves`; failure blocks Gate 2 | UC-02, UC-05 |
| BR-20 | Gate 2 is blocked if: `wb-validate.js` exits non-zero, or phase graph unschedulable, or semantic validator fails technically, or any semantic finding `blocking: true`, or any Must AC uncovered | UC-05 |
| BR-21 | PM-phase3 reads CSV (unchanged); JSON is not used for execution planning in this feature | UC-04 |
| BR-22 | Each new pm-phase2 activity (`wb-validate:phase2`, `validate-work-breakdown-semantic:phase2`, `wb-render:phase2`) must be tracked in the FTR-013 ledger with status `running`→`done`/`failed`/`skipped` | UC-06 |
| BR-23 | Ledger status `done` means successful completion (findings present is still `done`); `failed` means technical error — records actual tokens consumed up to the point of failure plus `error_summary` and `exit_code` when available; `skipped` means precondition was not met and records zero tokens | UC-06 |

## 4. Data Requirements

### 4.1 Entities

#### Phase (in JSON)

**Fields:**
- `id` (string): Phase identifier (e.g., "INFRA", "US-01")
- `type` (enum): "infrastructure" or "user-story"
- `title` (string): Human-readable phase title; must not contain `|`, CR, or LF
- `commit` (object): Phase-level commit metadata
  - `type` (string): Conventional commit type (e.g., "feat", "refactor")
  - `subject` (string): Commit subject line (no prefix); must not contain `|`, CR, or LF
- `tasks` (array): Ordered list of Task objects

**Relationships:**
- One phase contains one or more tasks
- Infrastructure phase shares task dependencies with all user-story phases (INFRA task IDs can appear in US task `dependsOn` lists)

#### Task (in JSON)

**Fields:**
- `id` (string): Unique task identifier (global at feature level)
  - Infrastructure: `INFRA-TASK-{DOMAIN}-{NN}` (NN is zero-padded, resets at feature level)
  - User-story: `{US-ID}-TASK-{DOMAIN}-{NN}` (NN is zero-padded, resets per US)
- `title` (string): Human-readable task title; must not contain `|`, CR, or LF
- `outcome` (string): Single observable outcome statement; describes what is produced/verified
- `domain` (string): Technical domain (e.g., "BE", "FE", "DB", "DevOps")
- `agentType` (string): Agent type that will implement (e.g., "developer-backend", "developer-frontend")
- `dependsOn` (array of strings): Task IDs this task depends on (may include INFRA tasks); empty array if no dependencies
- `acceptanceCriteria` (array of strings): AC IDs from Requirements (may be empty if unscoped)
- `verification` (object): Verification specification
  - `commands` (array of strings): Shell commands to verify task completion (must be non-empty)
- `estimate` (object): Time and token estimate
  - `agentMinutes` (integer): Estimated agent execution time in minutes
  - `tokens` (integer): Estimated token consumption
- `outputCount` (integer): Number of independent outputs produced
- `groupingRationale` (string | null): Explanation of why multiple outputs are bundled; required if `outputCount > 1`
- `commit` (object): Task-level commit metadata
  - `type` (string): Conventional commit type
  - `subject` (string): Commit subject line (no prefix); must not contain `|`, CR, or LF

**Relationships:**
- Task belongs to one phase
- Task may depend on zero or more other tasks (in same or different phases)
- Task may reference zero or more ACs (must belong to same US or be unscoped)
- Task must have one domain and one agentType

#### Acceptance Criteria (in Requirements)

**Reference interface (derived by wb-validate.js from the `## 7. Acceptance Criteria` table):**
- AC ID (string): Unique identifier within Requirements (e.g., "AC-01"); format `AC-NN`
- Related UC (string or list): One or more UC-NN values, or a global marker (`All UCs`); parsed from the `Related UC` column of the AC table
- Allowed user stories (derived): each UC-NN maps to the corresponding US-NN; a task in US-NN may reference this AC only if UC-NN is in the Related UC list
- Unscoped (boolean, derived): true if `Related UC` is `All UCs` or a formally defined global marker; false otherwise
- Priority (derived): the priority of the referenced UC(s); when multiple UCs are referenced, the strongest applies (Must > Should > Could); requires UC priority to be defined

**Relationships:**
- AC is defined in Requirements
- AC may be referenced by zero or more tasks
- ACs with derived priority Must must be covered by at least one task
- AC must not be assigned to a task in a US outside its allowed user stories (except unscoped ACs)
- An AC linked to multiple UCs is not unscoped unless explicitly marked with a global value

### 4.2 Validation Rules

#### Structural validation (wb-validate.js)

| Field / Check | Rule |
|---|---|
| `id` | Unique across all tasks in the feature |
| `id` format | Matches scheme: `INFRA-TASK-{DOMAIN}-{NN}` or `{US-ID}-TASK-{DOMAIN}-{NN}` |
| `title` | Non-empty string; must not contain `\|`, CR, LF |
| `outcome` | Non-empty string; describes single observable outcome (no "and" or ambiguous plural) |
| `domain` | Non-empty; value is in whitelist (BE, FE, DB, DevOps, etc.) |
| `agentType` | Non-empty; value is in whitelist (developer-backend, developer-frontend, etc.) |
| `dependsOn[]` | Each ID must exist in the feature; task must not depend on itself; task ID prefix must match containing phase; task graph must be acyclic; phase graph derived from task deps must be acyclic and fully schedulable |
| `acceptanceCriteria[]` | Each ID must exist in Requirements AC table; task's US must be in the AC's allowed user stories (derived from Related UC); unscoped ACs (All UCs) are universally allowed; AC priority derived from UC priority; Must-priority ACs must be covered by at least one task |
| `verification.commands[]` | Non-empty array; each entry is non-empty string |
| `estimate.agentMinutes` | Positive integer; checked against duration policy (≤15 target, 16–20 above target, 21–30 warning, >30 error) |
| `estimate.tokens` | Non-negative integer |
| `outputCount` | Positive integer; if > 1, `groupingRationale` must be non-null |
| `groupingRationale` | String or null; required if `outputCount > 1` |
| `commit.subject` | Non-empty string; must not contain `\|`, CR, LF |
| Must AC coverage | Every Must-priority AC in Requirements must be referenced by at least one task |

#### Semantic validation (validate-work-breakdown-semantic agent)

| Finding Type | Check |
|---|---|
| hidden_multiplicity | Title or outcome suggests multiple behaviors (e.g., "N types", "all adapters", "complete CRUD") but is described as single task |
| scope_creep | Task scope does not align with assigned User Story (e.g., crosses US boundaries, implements out-of-scope feature) |
| estimate_incompatible | Estimate (agentMinutes + tokens) is unrealistic for declared scope (too low for complex work, too high for simple work) |
| bundled_verifiable | Multiple independently verifiable outcomes in a single task (e.g., "add API" + "add tests" without clear verification boundary) |
| other | Any other coherence or quality issue |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-00 | Installability | After installation via any of the three supported methods (local copy, global copy, `install-toolkit` agent), `.claude/scripts/wb-validate.js` and `.claude/scripts/wb-render.js` must be present at the expected path in the target project and invocable by `pm-phase2` without access to the ai-toolkit repository |
| NFR-01 | Determinism | `wb-validate.js` and `wb-render.js` must produce identical output on identical input across multiple runs and across platforms (Windows, macOS, Linux) |
| NFR-02 | Determinism | JSON schema v2 must be stable; no breaking changes to the schema without versioning and migration tooling |
| NFR-03 | Performance | `wb-validate.js` must complete in < 1 second on features with up to 100 tasks |
| NFR-04 | Performance | `wb-render.js` must complete in < 500 ms on features with up to 100 tasks |
| NFR-05 | Performance | Semantic validation agent must complete in < 5 minutes per feature |
| NFR-06 | Compatibility | CSV format must maintain exact eight-column pipe-separated contract for `pm-phase3` (no breaking changes to CSV structure) |
| NFR-07 | Safety | `wb-validate.js` errors must be actionable: include task ID, field name, and specific constraint violation |
| NFR-08 | Safety | Rendering must defensively strip `|`, CR, LF from all text fields even if earlier validation rejected them |
| NFR-09 | Liveness | All three validators must complete and return results even if errors are found (except for JSON parse failures) |
| NFR-10 | Usability | Gate 2 payload must be human-readable and include all details needed for reviewer decision without consulting source JSON or agent logs |

## 6. UI Requirements

This is an internal tooling feature with no user-facing UI. All outputs are Markdown documents and JSON data files consumed by other tools.

### 6.1 Documents (Output)

#### `{PREFIX}-Work-Breakdown.json`

**Purpose:** Authoritative task specification for the feature. Serves as the sole source of truth for task identity, relationships, and estimates.

**Structure:** JSON object with `schemaVersion: 2`, `feature` ID, and `phases[]` array. See Section 4.1 and feature document Section "Data Model" for schema detail.

**Generated by:** `generate-work-breakdown` agent  
**Consumed by:** `wb-validate.js`, `wb-render.js`, semantic validator, Gate 2 payload assembly

---

#### `{PREFIX}-Work-Breakdown.md`

**Purpose:** Human-readable summary of the work breakdown for stakeholder review at Gate 2.

**Contents:**
- Feature and phase summary
- Task list organized by phase
- Per-task details: ID, title, outcome, domain, agentType, duration estimate, dependencies, ACs, verification commands
- Four-band duration statistics
- Domain distribution
- Summary of grouped tasks and warning-band tasks

**Generated by:** `wb-render.js` (from JSON)  
**Consumed by:** Gate 2 review, stakeholders

---

#### `{PREFIX}-Work-Breakdown.csv`

**Purpose:** Machine-readable task list for `pm-phase3` execution planning. Maintains backward compatibility with `pm-phase3` CSV parser.

**Format:** Pipe-separated (UTF-8), with header row

**Columns (in order):**
1. `phase_id` — Phase identifier (e.g., "INFRA", "US-01")
2. `phase_title` — Phase human-readable title
3. `commit_message` — Full conventional commit message (constructed from phase-level commit)
4. `depends_on` — Space-separated list of inter-phase dependencies (phase-level aggregate)
5. `task_id` — Task identifier (e.g., "INFRA-TASK-BE-01")
6. `task_title` — Task human-readable title
7. `domain` — Task domain
8. `agent_type` — Task agent type

**Generated by:** `wb-render.js` (from JSON)  
**Consumed by:** `pm-phase3` execution planner

---

### 6.2 Gate 2 Payload (Output)

**Purpose:** Comprehensive summary of validation results for stakeholder review and decision.

**Contents:**
- JS validator structured report (summary: pass/fail, error count, warning count, details)
- Semantic validator structured result (valid boolean, findings[])
- Four-band duration statistics (target, above target, warning, split required counts; max duration)
- Domain distribution (count per domain)
- Warning-band tasks (21–30 min) with titles, estimates, rationale
- Split-required tasks (> 30 min) — should be empty after validation passes
- Uncovered Must-priority ACs (list of AC IDs with no covering task)
- Grouped tasks (`outputCount > 1`) with titles and rationale
- Gate 2 block status (blocked or not blocked) with reason(s)

**Presented to:** Gate 2 step (user review before approval/rejection)

---

## 7. Acceptance Criteria

For each use case, testable acceptance criteria:

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a feature has passed Gate 1, when `generate-work-breakdown` runs, then it produces a valid `{PREFIX}-Work-Breakdown.json` with `schemaVersion: 2` | UC-01 |
| AC-02 | Given a task is produced, when it is written to JSON, then it declares exactly one observable outcome in the `outcome` field | UC-01 |
| AC-03 | Given a task is produced, when it is written to JSON, then it has exactly one domain and exactly one agentType | UC-01 |
| AC-04 | Given a task is produced, when it is written to JSON, then it contains verification commands, an estimate (`agentMinutes` + `tokens`), a commit subject, and an `acceptanceCriteria` list | UC-01 |
| AC-05 | Given a task has `estimate.agentMinutes > 30`, when `wb-validate.js` runs, then the task is flagged as `splitRequired`; Gate 2 is blocked; no waiver mechanism is available | UC-02, UC-05 |
| AC-06 | Given a task has `estimate.agentMinutes` in 21–30, when `wb-validate.js` runs, then a non-blocking warning is emitted; Gate 2 payload includes the task in the warning band | UC-02, UC-05 |
| AC-07 | Given a task has `estimate.agentMinutes` ≤ 15, when Gate 2 stats are produced, then task is counted in the "within target" band; Gate 2 payload shows four-band breakdown | UC-05 |
| AC-08 | Given a task has `outputCount > 1`, when `wb-validate.js` runs, then Gate 2 is blocked unless `groupingRationale` is present and non-null | UC-02, UC-05 |
| AC-09 | Given a task lists AC IDs in `acceptanceCriteria`, when `wb-validate.js` runs, then: each AC exists in the Requirements AC table; the task's US is in the AC's allowed user stories (derived from `Related UC`); unscoped ACs (`All UCs`) are accepted for any task; AC priority is derived from UC priority (strongest when multi-UC); every Must-priority AC is covered by at least one task; uncovered Must ACs block Gate 2; non-existent UC references or missing UC priorities block with explicit error | UC-02, UC-05 |
| AC-10 | Given `wb-validate.js` exits 0, when `pm-phase2` continues, then `validate-work-breakdown-semantic` (Sonnet) runs and its structured JSON result (with `valid`, `findings[]` each having `taskId`, `type`, `severity`, `blocking`, `splitRequired`, `description`) is included in `gate2_payload` | UC-03, UC-05 |
| AC-11 | Given a semantic finding has `blocking: true`, when Gate 2 is evaluated, then Gate 2 is blocked; `splitRequired` may be true or false independently | UC-03, UC-05 |
| AC-12 | Given Gate 2 is assembled, when blocking logic is applied, then Gate 2 is blocked when: `wb-validate.js` non-zero OR any task > 30 min OR any semantic finding `blocking: true` OR any Must AC uncovered | UC-05 |
| AC-13 | Given the INFRA phase is present, when `generate-work-breakdown` runs, then INFRA tasks have IDs of the form `INFRA-TASK-{DOMAIN}-{NN}`; any US task may list an INFRA task ID in `dependsOn`; the JS validator resolves cross-phase deps correctly | UC-01, UC-02 |
| AC-14 | Given `{PREFIX}-Work-Breakdown.json` is written, when `wb-render.js` runs, then it produces `{PREFIX}-Work-Breakdown.md` and `{PREFIX}-Work-Breakdown.csv` fully consistent with the JSON | UC-04 |
| AC-15 | Given `{PREFIX}-Work-Breakdown.csv` is produced by `wb-render.js`, when a regression test runs the same CSV parsing and wave-building logic used by `pm-phase3`, then the test parses the CSV without error, builds the correct wave execution plan, `depends_on` is the phase-level aggregate (same on every row of the phase), and `commit_message` contains the full conventional message constructed by the renderer | UC-04 |
| AC-16 | Given a text field (`phase.title`, `task.title`, `commit.subject`) contains `\|`, CR, or LF, when `wb-validate.js` runs, then it exits non-zero and Gate 2 is blocked; `wb-render.js` also strips such characters defensively before writing the CSV | UC-02, UC-04 |
| AC-17 | Given all changes are delivered, when `npm test` runs, then all tests pass: JSON schema validation, JS validator logic (IDs, thresholds, AC coverage, dependency cycles, self-deps, task/phase mismatch, pipe chars, phase graph schedulability), renderer output consistency, CSV regression against pm-phase3 parser, Gate 2 blocking logic | All UCs |
| AC-18 | Given `wb-validate.js` is invoked and exits non-zero, when `pm-phase2` evaluates the result, then `validate-work-breakdown-semantic` is not started (ledger entry: `skipped`) and `wb-render.js` is not started (ledger entry: `skipped`); Gate 2 is blocked | UC-02, UC-05, UC-06 |
| AC-19 | Given `validate-work-breakdown-semantic` fails technically (timeout, schema mismatch, or unhandled error), when `pm-phase2` evaluates the result, then `wb-render.js` is not started (ledger entry: `skipped`); Gate 2 is blocked with the technical error; semantic ledger entry is `failed` | UC-03, UC-05, UC-06 |
| AC-20 | Given `validate-work-breakdown-semantic` returns blocking findings, when `pm-phase2` evaluates the result, then `wb-render.js` is executed normally; Gate 2 is blocked; semantic ledger entry is `done` | UC-03, UC-04, UC-05, UC-06 |
| AC-21 | Given `pm-phase2` runs, when it completes (with any outcome), then the ledger contains entries for `wb-validate:phase2`, `validate-work-breakdown-semantic:phase2`, and `wb-render:phase2`; each entry has: agent key, phase, model, status (`done`/`failed`/`skipped`), `phase_delta_tokens` (actual for `done`/`failed`; zero for `skipped`), `started_at`, `completed_at`; `failed` entries additionally include `error_summary` and `exit_code` (when available) | UC-06 |
| AC-22 | Given the toolkit is installed via local copy, global copy, or `install-toolkit` agent (NFR-00), when `pm-phase2` invokes `.claude/scripts/wb-validate.js` and `.claude/scripts/wb-render.js` in the target project, then both scripts are present at those paths and execute successfully without access to the ai-toolkit source repository | All UCs |

---

## 8. Dependencies & Assumptions

### External Dependencies

- **FTR-013 (Ledger Pipeline Activity Tracker)** — Already deployed. The token ledger format is stable and will not be changed by this feature.
- **pm-phase2 workflow** — Must be updated to orchestrate `wb-validate.js` → semantic agent → Gate 2 assembly
- **`npm test` framework** — Jest or equivalent must be available for unit tests
- **Bash/Node.js** — `.claude/scripts/wb-validate.js` and `.claude/scripts/wb-render.js` must run under Node.js in a Bash environment

### Related Features

- **FTR-015 (Execution Ledger)** — Depends on stable task IDs and contract defined here; must not start before FTR-014 ships
- **FTR-016 (Task Checkpoints and Resume)** — Depends on stable task IDs and contract defined here; must not start before FTR-014 ships

### Assumptions

- `{PREFIX}-Work-Breakdown.json` schema v2 will not change during MVP; versioning is in place for future compatibility
- Duration thresholds (target 15 min, warning band 21–30 min, split > 30 min) are hard-coded; configurability is deferred
- Acceptance Criteria source for `wb-validate.js` is the `## 7. Acceptance Criteria` table in Requirements.md (Option A, resolved in Open Question 3 and Tech-Spec Section 3.2)
- Text field constraints (`|`, CR, LF rejection) are sufficient to ensure CSV compatibility with `pm-phase3` parser
- `pm-phase3` CSV parser does not change during this feature; the eight-column pipe-separated contract is stable
- Semantic validation by Sonnet LLM is cost-effective and completes within time budgets
- All tasks in a feature fit within a single `{PREFIX}-Work-Breakdown.json` file (no partitioning needed)
- Phase-level `depends_on` aggregation (unioning task-level dependencies) is sufficient for `pm-phase3` wave planning
- No requirement for task reordering or topological sorting; tasks are listed in feature order in JSON and CSV

---

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should `validate-work-breakdown-semantic` return structured JSON or freeform text? | Gate 2 payload consistency; testing and tooling ease | **Resolved:** Structured JSON with `valid`, `findings[]` schema defined in Section 4.1 and feature document Data Model |
| 2 | Should the CSV be kept? | Backward compatibility; deprecation timeline | **Resolved:** Yes, CSV retained as temporary compatibility layer for `pm-phase3`; migration to JSON reading is a follow-on FTR |
| 3 | What is the deterministic source for AC IDs used by `wb-validate.js` to verify existence, priority, and US scope? | — | **Resolved:** Option A — JavaScript parsing of the `## 7. Acceptance Criteria` section of `{PREFIX}-Requirements.md`. Full parsing contract defined in Tech-Spec Section 3.2. LLM extraction remains prohibited. |

