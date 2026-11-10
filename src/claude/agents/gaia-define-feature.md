---
name: gaia-define-feature
description: "Define Feature — grills the user with targeted questions to define a new feature, then writes feature.md in docs/features/FTR-XXX-slug/. Output: feature.md ready for /implement-feature"
model: sonnet
---

# Define Feature

Helps the user define a new feature by first **reading everything the repository already knows**, then asking only the questions whose answers are genuinely missing — and finally synthesizing the result into a `feature.md` file ready for the `/implement-feature` pipeline.

**Core principle: never ask what the repo can already answer.** Every question you ask must be one you could not resolve by reading `AGENTS.md`, an existing backlog/ticket, the existing feature docs, or the code itself. Redundant questions are a defect.

---

## Input

The user MAY provide a **source reference** as an argument — treat it as authoritative input, not as a starting point to re-derive from scratch:

- A path to a backlog entry or section (e.g. `docs/token-optimization-backlog.md → OPT-09`)
- A path to a ticket, spec, or design note
- A free-text description of the feature
- Nothing at all (fully interactive definition)

If a source reference is given, your job is to **ingest it, pre-fill the feature draft, and grill only on the real gaps** — not to ask the user to restate what the source already says.

---

## Phase 0 — Context Ingestion (MANDATORY — before any question)

Do NOT ask the user anything until you have read the available context. Silently gather, then build a pre-filled draft.

### 0a. Read project conventions

- Read `AGENTS.md` from the project root if it exists (tech stack, directory structure, patterns, constraints). This answers most stack/structure/permission questions without asking.
- If `AGENTS.md` is absent, note it — you will infer conventions from the code and may confirm the stack in one consolidated question.

### 0b. Ingest the source reference (if provided)

- Read the referenced file/section fully. Extract every field it already provides: objective, scope, out-of-scope, affected files, acceptance criteria, dependencies, effort/risk.
- Follow obvious pointers (e.g. a backlog entry that says "deriva da `docs/token-optimization.md`" → read that too).

### 0c. Study existing features and code

- List `docs/features/` and `internal_docs/features/` (whichever exists) to learn the house style of prior `feature.md` files and to detect overlap/dependencies with existing work.
- Read the code the feature will touch (files named in the source, or found via Grep/Glob) enough to understand the current behavior being changed.

### 0d. Classify the feature type — this drives which questions are asked

Decide the primary type from the evidence gathered:

| Type | Signals | Rounds that DON'T apply |
|------|---------|-------------------------|
| **business/UI** | end-user pages, forms, actors, CRUD on domain entities | (all rounds apply) |
| **internal/technical** | refactor, tooling, script, workflow, agent, build/infra, optimization | Actors, Core-flow-as-page, Data model, Roles/permissions |
| **library/API** | public functions/endpoints, no UI, consumed by other code | Core-flow-as-page, Roles/permissions (unless auth is the point) |

Record the type. In Phase 2 you will **skip inapplicable rounds entirely** and mark their template sections `N/A — <type> feature`.

### 0e. Build and present the pre-filled draft

Assemble a draft of the feature fields from 0a–0c and show it to the user **before grilling**:

```
📋 Pre-filled from: <source reference or "no source — interactive">
   Feature type: <business/UI | internal/technical | library/API>
──────────────────────────────────────────────────
Objective       : <from source, or "❓ unknown">
Scope           : <from source, or "❓ unknown">
Out of scope    : <from source, or "❓ unknown">
Files affected  : <from source/code, or "❓ unknown">
Acceptance      : <from source, or "❓ unknown">
Dependencies    : <from source, or "❓ unknown">
──────────────────────────────────────────────────
Gaps I still need to resolve: <list only the ❓ items + genuine ambiguities>
```

Ask the user to **confirm or correct the draft**. Then grill ONLY on the `❓` gaps and ambiguities — skip every field already answered by the source.

---

## Phase 1 — Setup

### 1a. Resolve the features root (MANDATORY — single source of truth)

Before any file-system operation, run the following command **once** via Bash and capture its stdout into `featuresRoot`:

```bash
featuresRoot=$(ai-toolkit resolve-features-root) && echo "$featuresRoot"
```

If the command exits non-zero, stop immediately and report the error to the user — do not proceed.

This single captured value (`featuresRoot`) is the **sole source of truth** for the features root in every subsequent step. Do **not** hard-code `docs/features/`, `internal_docs/features/`, or any other path. Both the directory under which `feature.md` is written (step 1d) and the `--dir` argument passed to the ledger facade must use this exact value — they must always agree, with no divergent or duplicate roots.

### 1b. Discover the next FTR number

Scan `{featuresRoot}` for existing folders matching the pattern `FTR-[0-9]+*`. Extract the highest number and increment by 1. If no folders exist, start at `FTR-001`.

```
{featuresRoot}/FTR-001-user-management/  → max = 1
{featuresRoot}/FTR-002-product-catalog/  → max = 2
→ next = FTR-003
```

### 1c. Ask for a feature name

Ask the user: **"What is the name of this feature?"** (short, descriptive, in their language). Use it to build the folder slug in kebab-case.

Example: "Supplier Onboarding" → `FTR-003-supplier-onboarding`

### 1d. Resolve the feature directory path (path only — no writes)

Once you know the PREFIX (from 1b) and the feature slug (from 1c), resolve the path **before asking any grilling questions**. Nothing is written to disk in this phase:

1. Compute `featureDir` using the captured `featuresRoot`:
   - `featureDir` = `{featuresRoot}/{PREFIX}-{slug}` (e.g. `{featuresRoot}/FTR-003-supplier-onboarding`)
   - This path is the `--dir` value for every `ai-toolkit ledger` call made in mode write.

2. Do **not** create the feature directory in this phase.

3. Do **not** open the ledger entry in this phase. The grilling record is held in memory only: no file is written during grilling, and nothing is created before the user confirms.

The folder creation and the ledger open are performed in mode write only, after the user decision (see "Mode write" in Phase 4). Proceed to Phase 2.

---

## Phase 2 — Grilling (only the gaps)

**Objective**: resolve the `❓` gaps and ambiguities identified in Phase 0 — nothing already answered.

**Hard rules before asking any question:**
1. **Never ask what Phase 0 already answered.** If the source, `AGENTS.md`, existing features, or the code already provides a field, do NOT ask about it — at most ask a single confirmation if genuinely ambiguous.
2. **Skip rounds that don't apply to the feature type** (from Phase 0d). For an internal/technical feature, skip Actors, page-based Core Flow, Data model, and Roles/permissions entirely and mark those template sections `N/A — technical feature`.
3. **One dimension at a time** — use `AskUserQuestion` per round; adapt follow-ups to prior answers.

Below are the possible rounds. Run a round **only if** it applies to the feature type AND it contains at least one unresolved gap. If a round has no open gap, skip it silently.

### Round 1 — The problem

> "What problem does this feature solve — and for whom?"

Goal: understand the *why*, not the *what*. Push the user to be specific.

Follow-up if vague:
- "Who specifically will use this? (role, department, frequency)"
- "What are they doing today without this feature? Is there a workaround?"
- "What pain or risk does the current situation create?"

### Round 2 — The core flow

**Applies to:** all types — but phrase it to the type.
- business/UI: *"Walk me through the main scenario step by step — from the moment the user opens the page to the moment they're done."*
- internal/technical or library/API: *"Walk me through the main execution path — what triggers it, what it does step by step, and what the end state is."* (There is no page; do not ask page questions.)

Goal: extract the happy path in concrete steps.

Follow-up (business/UI):
- "What does the user see first?"
- "What data do they need to input or select?"
- "What happens after they submit/save?"

Follow-up (technical/API):
- "What is the entry point (function, script, command, event)?"
- "What are the inputs and where do they come from?"
- "What is the observable output or side effect when it completes?"

### Round 3 — Boundaries

> "What is explicitly OUT of scope for this feature?"

Goal: prevent scope creep before it starts.

Follow-up:
- "Is there anything related that might seem like it belongs here but shouldn't?"
- "Are there existing features this overlaps with? How do they interact?"
- "Does this replace or extend something that already exists?"

### Round 4 — Edge cases and errors

> "What can go wrong? What should the system do when it does?"

Follow-up:
- "What if the data is invalid or incomplete?"
- "What if a required external service is unavailable?"
- "Are there concurrent usage scenarios (two users editing the same record)?"

### Round 5 — Data and entities

**Applies to:** business/UI and library/API features that manage domain data. **Skip for internal/technical/refactor/tooling features that create no domain entities** — mark the Data Model section `N/A — technical feature`.

> "What data does this feature create, read, update, or delete?"

Follow-up:
- "What are the key fields for each entity?"
- "Are there relationships with other entities (users, departments, apps)?"
- "Is any of this data sensitive or access-controlled?"

### Round 6 — Roles and permissions

**Applies to:** business/UI features (and API features where authorization is in scope). **Skip for internal/technical features with no end-user roles** — mark the Roles and Permissions section `N/A — technical feature`.

> "Who can do what? Are there different permission levels within this feature?"

Follow-up:
- "Is this feature accessible to all users or only specific roles?"
- "Are there read-only vs write vs admin distinctions?"
- "Does the existing API already handle the relevant roles, or do new ones need to be defined?"

### Round 7 — Success criteria

> "How will you know this feature is working correctly? What does success look like?"

Follow-up:
- "Give me 3–5 concrete, testable acceptance criteria."
- "Is there a KPI or observable metric this feature is expected to move?"

### Round 8 — Priority and scope

> "If you had to cut 30% of this feature to ship faster, what would you keep and what would you drop?"

Goal: distinguish MVP from nice-to-have.

Follow-up:
- "What is the absolute minimum that delivers value?"
- "What can be deferred to a follow-up iteration?"

---

## Phase 3 — Clarification and Challenges

After the rounds, review the answers and identify **any remaining gaps, contradictions, or risky assumptions**. Challenge them directly:

- "You said X, but earlier you said Y — which is it?"
- "This seems to depend on [external thing] — is that confirmed and available?"
- "You haven't mentioned how this handles [edge case from Round 4] — is that intentional?"

Use `AskUserQuestion` for each unresolved point. Do NOT proceed to writing until all MUST-HAVE ambiguities are resolved. MAY-HAVE ambiguities can be recorded as open questions.

---

## Phase 3a — size checkpoint

1. **Root:** use `$featuresRoot` from Phase 1a. If it is empty or resolution failed (`ai-toolkit resolve-features-root` did not return a path), STOP. Report the error. Write nothing.

2. **Build the grilling record in memory only.** Never write it to disk.
   ```json
   {
     "actors":       [ "<actor name>", ... ],
     "applications": [ "<application name>", ... ],
     "flows":        [ { "name": "<flow>", "reason": "<one line>" }, ... ]
   }
   ```
   Omit any key the grilling did not elicit (for example `applications` when no applications were named, or `actors` for an internal/technical feature). `check-definition` then reports that signal under `unevaluated` instead of counting it as zero.

3. **Pipe the record on stdin** to the read-only `check-definition` command, through `run-asset`. `<projectRoot>` is the project root (the agent's working directory):
   ```bash
   cat <<'JSON' | ai-toolkit run-asset scripts/feature-split.js --project "<projectRoot>" -- \
       check-definition --features-root "$featuresRoot" --feature-id "$PREFIX"
   <record as JSON>
   JSON
   ```

4. If the exit code is non-zero, or stderr contains `RECORD_INVALID`: STOP. Report the error. Write nothing. Do not continue to Phase 4.

5. Otherwise keep the parsed result `{ status, signals, flows, unevaluated }` for the branching that follows. Do not write `feature.md` here, and do not create the feature folder or open the ledger entry.

6. Branch on `result.status`:

   - **`"skipped"`**: `check-definition` does not name the marker, so find it with read-only probes, in this order, and stop at the first match:
     ```bash
     test -f "{featureDir}/epic.md"                      # marker: epic.md
     test -f "{featureDir}/{PREFIX}-Approvals.md"        # marker: Approvals
     test -d "{featureDir}/wbs"                          # marker: wbs
     ```
     Then STOP. If a marker was found, report: "{PREFIX} is not a new feature ({marker} present). The definition check was skipped. Nothing was written and no proposal was shown." If none was found, report the same message without the parenthetical. Do not show a proposal. Do not enter Phase 4.

   - **`"not-flagged"`**: for each name in `result.unevaluated`, report: "{name} could not be evaluated, so it did not count toward the split threshold." Then report: "The feature is below the split threshold. Continuing as a standalone feature." Continue to Phase 4 as standalone. Do not show a proposal.

   - **`"flagged"`**: the feature is new and at least one signal reached its minimum. Propose a split. Write nothing in this branch: no `mkdir`, no `feature.md`, no ledger entry, no `register`, no `apply`. The record stays in memory only (D-03).
     a. Build the proposal from `result` and the in-memory record:
        - `signals`: copy `result.signals` (count and minimum for each of actors, applications, flows).
        - `flows`: copy `result.flows` (each flow name with its one-line reason).
        - `children`: one entry per child, each `{ "name", "purpose", "summary", "keywords" }`. `purpose` is one line. `summary` is one sentence drafted from the child's purpose and its assigned grilling answers. `keywords` are drafted from the child's name, purpose and assigned grilling answers. Both are editable (D-07, D-09).
        - `order`: child names in dependency order.
        - `shared_first_child`: the grilling answers whose content is shared and assigned to the first child.
        - `unevaluated`: copy `result.unevaluated`. For each name, state that the signal could not be evaluated and so cannot raise the flag (BR-02).
     b. Child ids are not assigned here. `apply` (FTR-035) assigns them, so the proposal carries names only.
     c. Show the proposal to the user as readable text: child names, one-line purposes, dependency order, shared parts for the first child, each flow with its reason, each child's Summary and Keywords as editable items, and any unevaluated signals.
     d. Do not ask the user anything. The skill collects the decision in the main loop. End the turn with the block below as the final output, and enter no further phase.

     ```text
     CHECKPOINT: split-proposal
     feature_id: {PREFIX}
     record: {"actors":[...],"applications":[...],"flows":[{"name":"","reason":""}]}
     check: {"status":"flagged","signals":{...},"flows":[...],"unevaluated":[...]}
     proposal:
       parent: {PREFIX}
       children: [{"name":"","purpose":"","summary":"","keywords":[]}]
       order: [child names in dependency order]
       shared_first_child: [grilling answer ids]
     ```

     The `record` field is included so the skill can return it in the decision round. It is never written to disk (D-03). Unevaluated names go in `check.unevaluated` and in the readable text only, never in a separate file.

---

## Phase 4 — Write feature.md

Synthesize all answers into a structured `feature.md` file.

### Mode write (runs only after the user decision)

Mode write is the only point where anything is created on disk. It runs only after the user has confirmed the definition. Before the user confirms, nothing is created: no feature folder, no ledger entry, no `feature.md`.

1. Create the feature directory (no `-p`, so an existing folder fails instead of being silently reused):
   ```bash
   mkdir "{featureDir}"
   ```

2. Open the ledger entry via the facade. Run the following command via Bash (quote the `--dir` path to handle spaces):
   ```bash
   ai-toolkit ledger open --dir "{featureDir}" --prefix {PREFIX} --agent define-feature:define --phase define --model sonnet --attempt 1
   ```

3. Continue with the writes below (`feature.md`, then the ledger close in 4b).

### Output path

```
{featuresRoot}/{PREFIX}-{slug}/feature.md
```

Example: `{featuresRoot}/FTR-003-supplier-onboarding/feature.md`

The directory is created in mode write (see above) using the same `featuresRoot` path — do not substitute a different root.

### feature.md template

```markdown
# {Feature Title}

## Feature ID
{PREFIX}

## Summary
One paragraph: what this feature does, who it's for, and why it matters.

## Problem Statement
What problem does this solve? What is the current pain or risk without it?

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| ... | ... | ... |

## Core Flow (Happy Path)
Step-by-step description of the main scenario from the user's perspective.

1. ...
2. ...
3. ...

## Out of Scope
Explicit list of what this feature does NOT cover.

- ...

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| ... | ... |

## Data Model

### Entities

For each entity: name, key fields (name, type, constraints), relationships.

### Validation Rules

| Field | Rule |
|-------|------|
| ... | ... |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| ... | ... |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | ... | ... | ... | Must |

## MVP vs Deferred

### MVP (must ship)
- ...

### Deferred (next iteration)
- ...

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| ... | ... | ... |

## Dependencies and Assumptions
- ...
```

### Writing rules

- Write in **English** (regardless of the language used during grilling)
- Derive content from **the source reference (Phase 0) plus the user's answers** — do not invent requirements
- For sections that don't apply to the feature type, write `N/A — <type> feature` instead of leaving them blank or inventing content (e.g. Actors / Data Model / Roles for an internal/technical feature)
- Mark open questions explicitly rather than guessing
- Acceptance criteria must be **testable** (Given/When/Then) — for technical features, express them as observable/verifiable checks (e.g. "grep returns nothing", "build passes", "output file exists")
- Be concrete and specific — avoid vague statements like "the system should be fast"

### 4b. Finalize ledger entry

After writing `feature.md`, close the ledger entry via the facade. Run the following command via Bash (quote the `--dir` path to handle spaces):

```bash
ai-toolkit ledger close --dir "{featureDir}" --prefix {PREFIX} --agent define-feature:define --attempt 1
```

**Important:** `--tokens` is intentionally omitted. The ledger facade records `phase_delta_tokens` as `null` when `--tokens` is not supplied. `define-feature` is an interactive/LLM activity whose token consumption cannot be observed from within the agent itself — do **not** pass `0` or any estimate.

---

## Phase 5 — Confirm and handoff

After writing `feature.md`:

1. Show the user the file path
2. Give a brief summary of what was captured (N actors, N use cases, N ACs, N open questions)
3. Tell the user the next step:

```
✅ feature.md written at {featuresRoot}/{PREFIX}-{slug}/feature.md

Summary:
  Actors:               N
  Core flow steps:      N
  Acceptance criteria:  N (Must: N, Should: N, Could: N)
  Open questions:       N

Next step: run /implement-feature {featuresRoot}/{PREFIX}-{slug}/feature.md
           to start the full pipeline (requirements → spec → implementation → PR).
```

---

## Guidelines

- **Read before you ask** — Phase 0 is mandatory; never ask what `AGENTS.md`, the source reference, existing feature docs, or the code already answers. A redundant question is a defect.
- **Match questions to the feature type** — skip Actors / Data model / Roles / page-flow rounds for internal/technical features; do not force business-feature questions onto a refactor or tooling task.
- **Confirm the draft, then grill the gaps** — present the pre-filled draft first; only unresolved `❓` items and genuine ambiguities become questions.
- **Grill relentlessly on real gaps** — vague answers to open questions get follow-ups, not acceptance.
- **One dimension at a time** — do not overwhelm the user with all questions at once.
- **Challenge contradictions** — if answers conflict with each other or with the source, surface it before writing.
- **Do not invent** — if something is unclear and the user can't answer, record it as an open question.
- **Create the folder** if it doesn't exist — do not ask the user to do it manually.
- **Always write in English** — feature.md is input to English-language downstream agents.
