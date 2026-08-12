# Atomic Work Breakdown

## Feature ID
FTR-014

## Summary
This feature redefines the task as the smallest independently implementable, verifiable,
and committable unit of work. It enforces a strict atomicity contract in
`generate-work-breakdown` (updated), introduces a two-stage validation pipeline
(deterministic JavaScript module `bin/wb-validate.js` + semantic LLM agent
`validate-work-breakdown-semantic`), and upgrades Gate 2 to surface the full validator
result and a four-band duration breakdown. The authoritative machine-readable output shifts
to a versioned JSON format (`{PREFIX}-Work-Breakdown.json`, schema v2); Markdown and CSV
views are rendered deterministically from that JSON by `bin/wb-render.js`. The CSV is
retained as a compatibility layer for `pm-phase3`, which is not modified in this feature.
The goal is to reduce token consumption variability, rework cost, and estimation error by
ensuring each task has exactly one observable outcome, one domain, and one agent type,
targeting 15 minutes of agent time per task.

## Problem Statement
The current work breakdown can assign multiple independent outputs to a single agent
invocation. This creates cascading problems: longer execution windows, higher per-invocation
context, wider estimation variance, costlier reviews, broader rework, and greater loss in
case of interruption. A real delivery run consumed approximately 2.85 million tokens against
a 322,000-token estimate (8.9x overshoot). One User Story required two full rework cycles;
another bundled nine sheet types into a single 448,000-token block. Finer-grained tasks with
explicit verification and time bounds cap these failure modes at the task level rather than
letting them compound across an entire phase.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change. The execution path, not a user-facing flow, is described
below.

1. `generate-work-breakdown` reads Requirements, Tech-Spec, and Approvals as before.
2. It decomposes work into phases of two types:
   - `infrastructure` — shared setup tasks propedeutic to multiple User Stories (IDs:
     `INFRA-TASK-{DOMAIN}-{NN}`)
   - `user-story` — one phase per US (task IDs: `{US-ID}-TASK-{DOMAIN}-{NN}`, counter
     resets per US)
   Each task follows the atomicity contract: one observable outcome, one domain, one agent
   type, one commit subject, estimated duration targeting ≤ 15 minutes.
3. The LLM writes `{PREFIX}-Work-Breakdown.json` (schema v2, sole authoritative source)
   with all task fields (see Data Model) and a phase-level `commit` field used as
   `commit_message` in the CSV.
4. `bin/wb-render.js` reads the JSON and generates deterministically:
   - `{PREFIX}-Work-Breakdown.md` — human-readable view for Gate 2
   - `{PREFIX}-Work-Breakdown.csv` — pipe-separated compatibility view for `pm-phase3`,
     respecting the exact eight-column contract:
     `phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type`
     Task-level `dependsOn` references are converted to phase-level: for each referenced
     task ID the renderer identifies its owner phase, collects unique phase IDs, removes
     any that belong to the current phase, and joins them with spaces in `depends_on`.
5. `bin/wb-validate.js` runs deterministic structural checks against the JSON (no LLM):
   - Unique task IDs across the entire feature
   - All required fields present and non-null
   - Valid domain values and agentType values
   - `dependsOn` references resolve to existing task IDs
   - No dependency cycles (full graph traversal)
   - No unreachable tasks
   - Duration policy: ≤15 min → target (no flag); 16–20 min → valid above target (no flag);
     21–30 min → warning (non-blocking); >30 min → split required (blocks Gate 2)
   - `outputCount > 1` without `groupingRationale` → blocks Gate 2
   - Tasks without verification commands → blocks Gate 2
   - Tasks without commit subject → blocks Gate 2
   - `acceptanceCriteria` references: each ID must exist in the Requirements AC list,
     must belong to the task's User Story (or be unscoped), and every Must-priority AC
     must be covered by at least one task → uncovered Must ACs block Gate 2
   - Text fields that will appear in CSV columns (`phase.title`, `task.title`,
     `commit.subject`) must not contain `|`, CR, or LF characters → flagged as validation
     error; Gate 2 blocked
   Exits 0 (pass) or non-zero (one or more blocking errors). Always emits a structured
   JSON report regardless of exit code.
6. Only if `wb-validate.js` exits 0: `validate-work-breakdown-semantic` (sonnet LLM agent)
   runs coherence checks: multiple behaviours in a title or description, hidden multiplicity
   (N types / all adapters / complete CRUD), independently verifiable activities bundled
   together, estimate incompatible with scope, US-task scope misalignment, tasks that would
   cause extended rework on failure. Returns a structured JSON result (see Data Model).
7. `pm-phase2` assembles the `gate2_payload` including:
   - JS validator structured report
   - Semantic validator structured result
   - Four-band duration statistics (within target / above target / warning / split required)
   - Domain distribution
   - Tasks in the warning band (21–30 min) with rationale
   - Tasks requiring split (>30 min)
   - Must ACs without covering task
   - Grouped tasks with `groupingRationale`
8. Gate 2 is blocked when any of the following is true:
   - `wb-validate.js` exits non-zero
   - Any task has `estimate.agentMinutes > 30`
   - Any semantic finding has `blocking: true`
   - Any Must-priority AC has no covering task

## Out of Scope
- Execution ledger (FTR-015)
- Any modification to `pm-phase3` execution logic (continues to read the CSV)
- Migration of `pm-phase3` to read JSON natively (follow-on FTR)
- Automatic commit creation per task at runtime
- Resume and checkpoint recovery (FTR-016)
- Parallel worktrees
- Runtime token and duration monitoring
- Replan during implementation
- Formal waiver mechanism for the 21–30 minute warning band (deferred)
- Configurable duration thresholds (deferred)

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Task estimated > 30 minutes | JS validator flags `splitRequired`; Gate 2 blocked; no waiver |
| Task estimated 21–30 minutes | JS validator emits warning (non-blocking); surfaced in Gate 2 payload; Gate 2 not blocked |
| Task estimated 16–20 minutes | Valid; above target; counted in "above target" band in Gate 2 stats; no flag |
| Task estimated ≤ 15 minutes | Target; no flag |
| `outputCount > 1` with no `groupingRationale` | JS validator blocks Gate 2 |
| Dependency cycle detected | JS validator exits non-zero with explicit cycle description; Gate 2 blocked |
| `dependsOn` references non-existent task ID | JS validator exits non-zero; Gate 2 blocked |
| AC reference points to non-existent AC | JS validator exits non-zero; Gate 2 blocked |
| Must AC has no covering task | JS validator exits non-zero; AC listed in Gate 2 payload; Gate 2 blocked |
| AC assigned to task in a different US | JS validator exits non-zero; Gate 2 blocked |
| Unreachable task in dependency graph | JS validator exits non-zero |
| `wb-validate.js` exits non-zero | Semantic validation is skipped entirely; Gate 2 blocked |
| Semantic finding with `blocking: true` | Gate 2 blocked regardless of JS validator result |
| Semantic finding with `splitRequired: false`, `blocking: false` | Surfaced in Gate 2 payload as advisory; Gate 2 not blocked |
| Scope creep detected by semantic validator | Finding with `blocking: true`, `splitRequired` depends on severity (may be false if no split is needed, only scope correction) |
| Work Breakdown JSON is malformed | Renderer and validator both abort with explicit error before Gate 2 |
| Existing feature has only a CSV (legacy) | `pm-phase3` continues to read the legacy CSV; JSON is produced only for features using FTR-014+ tooling |
| INFRA task depended on by multiple User Stories | Valid; any US task may list an INFRA task ID in `dependsOn` |
| Phase has no tasks | JS validator flags empty phase; Gate 2 blocked |

## Data Model
N/A — internal/technical feature

### Work Breakdown JSON (schema v2)

The JSON schema for `{PREFIX}-Work-Breakdown.json` is the authoritative task contract.
Two phase types are supported. Each phase carries a **phase-level `commit`** used by
`wb-render.js` to populate the CSV `commit_message` column.

```json
{
  "schemaVersion": 2,
  "feature": "FTR-NNN",
  "phases": [
    {
      "id": "INFRA",
      "type": "infrastructure",
      "title": "Shared infrastructure setup",
      "commit": { "type": "feat", "subject": "shared infrastructure" },
      "tasks": [
        {
          "id": "INFRA-TASK-BE-01",
          "title": "...",
          "outcome": "Single observable outcome statement",
          "domain": "BE",
          "agentType": "developer-backend",
          "dependsOn": [],
          "acceptanceCriteria": [],
          "verification": { "commands": ["npx tsc --noEmit"] },
          "estimate": { "agentMinutes": 10, "tokens": 20000 },
          "outputCount": 1,
          "groupingRationale": null,
          "commit": { "type": "feat", "subject": "add shared infrastructure" }
        }
      ]
    },
    {
      "id": "US-01",
      "type": "user-story",
      "title": "As a... I want... so that...",
      "commit": { "type": "feat", "subject": "implement US-01" },
      "tasks": [
        {
          "id": "US-01-TASK-BE-01",
          "title": "...",
          "outcome": "Single observable outcome statement",
          "domain": "BE",
          "agentType": "developer-backend",
          "dependsOn": ["INFRA-TASK-BE-01"],
          "acceptanceCriteria": ["AC-01", "AC-03"],
          "verification": { "commands": ["npx tsc --noEmit", "npm test"] },
          "estimate": { "agentMinutes": 14, "tokens": 30000 },
          "outputCount": 1,
          "groupingRationale": null,
          "commit": { "type": "feat", "subject": "add US-01 backend handler" }
        }
      ]
    }
  ]
}
```

**Task ID scheme:**
- Infrastructure tasks: `INFRA-TASK-{DOMAIN}-{NN}` — globally unique at feature level
- User Story tasks: `{US-ID}-TASK-{DOMAIN}-{NN}` — counter resets per US; US prefix
  disambiguates at feature level

**Duration policy (hard-coded thresholds, enforced by `wb-validate.js`):**

| Band | Range | Flag | Gate 2 impact |
|------|-------|------|---------------|
| Target | ≤ 15 min | none | counted in "within target" stats |
| Above target | 16–20 min | none | counted in "above target" stats |
| Warning | 21–30 min | warning | non-blocking; surfaced in Gate 2 payload |
| Split required | > 30 min | error | Gate 2 blocked; no waiver |

**Gate 2 four-band statistics (example):**
```
Task totali:              27
Task entro il target:     23   (≤ 15 min)
Task sopra il target:      2   (16–20 min)
Task in warning:           2   (21–30 min)
Task da suddividere:       0   (> 30 min)
Durata massima stimata:   27 min
```

### wb-render.js — CSV column mapping

`wb-render.js` maps JSON → CSV columns as follows. Before writing, it strips any `|`, CR,
and LF characters from text fields (`phase_title`, `task_title`, `commit_message`) as a
defensive measure, even though `wb-validate.js` already rejects such characters earlier in
the pipeline.

| CSV column | Source |
|------------|--------|
| `phase_id` | `phase.id` |
| `phase_title` | `phase.title` |
| `commit_message` | `phase.commit.type + "(" + feature + "): " + phase.commit.subject` — `subject` must NOT include the conventional prefix; `wb-render.js` constructs the full message |
| `depends_on` | **Phase-level aggregate**: union of all task `dependsOn` IDs in the phase → owner phase IDs → remove current phase → deduplicate → join with space → **same value on every row of the phase** |
| `task_id` | `task.id` |
| `task_title` | `task.title` |
| `domain` | `task.domain` |
| `agent_type` | `task.agentType` |

**Dependency conversion rule (phase-level aggregate):** `wb-render.js` computes `depends_on`
once per phase, then writes the same value on every CSV row of that phase:

1. Collect all task IDs referenced in `dependsOn` across **all tasks** of the phase.
2. For each referenced task ID, look up its owner phase.
3. Remove the current phase from the set (intra-phase deps are implicit).
4. Deduplicate and join with space.

This ensures that a dependency present only in the second or later task of a phase is not
silently dropped, because `pm-phase3` reads `depends_on` only from the first row it
encounters for each phase.

Example:
```
JSON phase US-01 has two tasks:
  US-01-TASK-DB-01.dependsOn = []
  US-01-TASK-BE-01.dependsOn = ["INFRA-TASK-BE-01"]

Aggregate deps for US-01: {"INFRA-TASK-BE-01"} → owner phase "INFRA"
Remove current phase US-01 → {"INFRA"}

CSV (both rows of US-01):
  US-01|...|...|INFRA|US-01-TASK-DB-01|...|DB|developer-backend
  US-01|...|...|INFRA|US-01-TASK-BE-01|...|BE|developer-backend
```

### Semantic validator result schema

`validate-work-breakdown-semantic` returns a structured JSON object:

```json
{
  "valid": true,
  "findings": [
    {
      "taskId": "US-01-TASK-BE-01",
      "type": "hidden_multiplicity | scope_creep | estimate_incompatible | bundled_verifiable | other",
      "severity": "error | warning",
      "blocking": true,
      "splitRequired": false,
      "description": "Human-readable explanation of the finding"
    }
  ]
}
```

- `blocking: true` → Gate 2 is blocked regardless of `splitRequired`
- `splitRequired: true` → task must be split; implies `blocking: true`
- `splitRequired: false` + `blocking: true` → correction required but split is not the only remedy
  (e.g., scope creep correctable by moving a task to a different US without splitting it)
- `valid: false` when any finding has `blocking: true`

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature has been through Gate 1 | `generate-work-breakdown` runs | It produces a valid `{PREFIX}-Work-Breakdown.json` with `schemaVersion: 2` | Must |
| AC-02 | A task is produced | Always | It declares exactly one observable outcome in the `outcome` field | Must |
| AC-03 | A task is produced | Always | It has exactly one domain and one agentType | Must |
| AC-04 | A task is produced | Always | It contains verification commands, an estimate (`agentMinutes` + `tokens`), a commit subject, and an `acceptanceCriteria` list | Must |
| AC-05 | A task has `estimate.agentMinutes > 30` | `wb-validate.js` runs | The task is flagged as `splitRequired`; Gate 2 is blocked; no waiver | Must |
| AC-06 | A task has `estimate.agentMinutes` in 21–30 | `wb-validate.js` runs | A non-blocking warning is emitted; Gate 2 payload includes the task in the warning band | Must |
| AC-07 | A task has `estimate.agentMinutes` ≤ 15 | Gate 2 stats are produced | Task is counted in the "within target" band; Gate 2 payload shows four-band breakdown | Must |
| AC-08 | A task has `outputCount > 1` | `wb-validate.js` runs | Gate 2 is blocked unless `groupingRationale` is present and non-null | Must |
| AC-09 | A task lists AC IDs in `acceptanceCriteria` | `wb-validate.js` runs | Each referenced AC exists in Requirements; each belongs to the task's User Story or is unscoped; every Must-priority AC is covered by at least one task; uncovered Must ACs block Gate 2 | Must |
| AC-10 | `wb-validate.js` exits 0 | `pm-phase2` continues | `validate-work-breakdown-semantic` (sonnet) runs and its structured JSON result (with `valid`, `findings[]` each having `taskId`, `type`, `severity`, `blocking`, `splitRequired`, `description`) is included in `gate2_payload` | Must |
| AC-11 | A semantic finding has `blocking: true` | Gate 2 is evaluated | Gate 2 is blocked; `splitRequired` may be true or false independently | Must |
| AC-12 | Gate 2 is assembled | Always | It is blocked when: `wb-validate.js` non-zero OR any task > 30 min OR any semantic finding `blocking: true` OR any Must AC uncovered | Must |
| AC-13 | The INFRA phase is present | `generate-work-breakdown` runs | INFRA tasks have IDs of the form `INFRA-TASK-{DOMAIN}-{NN}`; any US task may list an INFRA task ID in `dependsOn`; the JS validator resolves cross-phase deps correctly | Must |
| AC-14 | `{PREFIX}-Work-Breakdown.json` is written | `wb-render.js` runs | It produces `{PREFIX}-Work-Breakdown.md` and `{PREFIX}-Work-Breakdown.csv` fully consistent with the JSON | Must |
| AC-15 | `{PREFIX}-Work-Breakdown.csv` is produced by `wb-render.js` | A regression test runs the same CSV parsing and wave-building logic used by `pm-phase3` | The test parses the CSV without error, builds the correct wave execution plan, `depends_on` is the phase-level aggregate (same on every row of the phase), and `commit_message` contains the full conventional message constructed by the renderer | Must |
| AC-16 | A text field (`phase.title`, `task.title`, `commit.subject`) contains `\|`, CR, or LF | `wb-validate.js` runs | It exits non-zero and Gate 2 is blocked; `wb-render.js` also strips such characters defensively before writing the CSV | Must |
| AC-17 | All changes are delivered | `npm test` runs | All tests pass: JSON schema validation, JS validator logic (IDs, thresholds, AC coverage, dependency cycles, unreachable tasks, pipe chars), renderer output consistency, CSV regression against pm-phase3 parser, Gate 2 blocking logic | Must |

## MVP vs Deferred

### MVP (must ship)
- Updated task contract: all fields required (`outcome`, `domain`, `agentType`, `dependsOn`,
  `acceptanceCriteria`, `verification`, `estimate`, `outputCount`, `groupingRationale`,
  `commit`) plus phase-level `commit` field
- Two phase types: `infrastructure` (`INFRA-TASK-{DOMAIN}-{NN}`) and `user-story`
  (`{US-ID}-TASK-{DOMAIN}-{NN}`)
- `{PREFIX}-Work-Breakdown.json` as sole authoritative source (schema v2)
- `bin/wb-validate.js` — deterministic JavaScript validator (no LLM): unique IDs, required
  fields, valid domains/agentTypes, dependency resolution and cycle detection, unreachable
  tasks, four-band duration policy, `outputCount`/rationale, AC references and Must coverage
- `bin/wb-render.js` — deterministic JavaScript renderer: produces `{PREFIX}-Work-Breakdown.md`
  and `{PREFIX}-Work-Breakdown.csv` from JSON, including task-to-phase dependency conversion
- `validate-work-breakdown-semantic` agent (sonnet): coherence and scope checks; returns
  structured JSON result with `valid`, `findings[]` (each with `taskId`, `type`, `severity`,
  `blocking`, `splitRequired`, `description`)
- Updated `generate-work-breakdown` agent: produces JSON following schema v2, targeting
  ≤ 15 minutes per task, setting phase-level `commit`
- Two-stage validation wired into `pm-phase2`: `wb-validate.js` → semantic agent → Gate 2
- Four-band duration policy enforced by `wb-validate.js`; Gate 2 stats show all four bands
- Gate 2 blocked when: `wb-validate.js` non-zero OR task > 30 min OR semantic `blocking: true`
  OR Must AC uncovered
- `{PREFIX}-Work-Breakdown.csv` retained as compatibility view for `pm-phase3` (generated
  from JSON by `wb-render.js`, respecting the exact eight-column pipe-separated contract)
- Updated Gate 2 payload: JS validator report, semantic validator result, four-band stats,
  domain distribution, warning-band tasks, split-required tasks, uncovered Must ACs,
  grouped tasks with rationale
- `wb-validate.js` rejects `|`, CR, LF in text fields; `wb-render.js` strips them defensively
- `depends_on` in CSV is a phase-level aggregate (same on every row of the phase)
- `commit.subject` contains only the subject; `wb-render.js` constructs the full conventional message
- Automated tests: JSON schema, JS validator logic (including pipe chars), renderer consistency,
  CSV regression against pm-phase3 parser (including `depends_on` aggregation), Gate 2 blocking logic

### Deferred (next iteration)
- Migration of `pm-phase3` to read `{PREFIX}-Work-Breakdown.json` natively (deprecating CSV)
- Configurable duration thresholds (currently fixed: target 15 min, warning 21 min,
  split 30 min)
- Per-task token limit (pending calibration data)
- Formal waiver mechanism for tasks in the 21–30 minute warning band
- Migration tooling for existing features with CSV-only work breakdowns
- Per-element split guidance when N identical items are grouped (currently judgment-based)

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Should `validate-work-breakdown-semantic` return structured JSON or freeform text? | Resolved | **Structured JSON** — schema defined in Data Model above |
| 2 | Should the CSV be kept? | Resolved | **Yes, temporarily** — generated from JSON by `wb-render.js`; `pm-phase3` reads it; deprecated in a follow-on FTR |
| 3 | What is the deterministic source for AC IDs used by `wb-validate.js` to verify existence, priority, and US scope? | **Open — mandatory to resolve in Tech Spec before implementation starts** | Options: (a) JS parsing of a formally structured section of `Requirements.md`; (b) a machine-readable `{PREFIX}-Requirements.json` produced alongside the MD; (c) a deterministic extraction script that builds an AC index at validation time. LLM extraction during deterministic validation is not permitted. |

## Dependencies and Assumptions
- FTR-013 (Ledger Pipeline Activity Tracker) is deployed; the token ledger format it
  introduced is already in use and will not be changed by this feature.
- The Execution Ledger (FTR-015) and Task Checkpoints and Resume (FTR-016) depend on the
  stable task IDs and contract defined here; they must not be started before this feature
  ships.
- `pm-phase3` continues to read `{PREFIX}-Work-Breakdown.csv` for all features (legacy and
  new). For new features, `wb-render.js` generates the CSV from the JSON maintaining the
  exact eight-column pipe-separated contract; legacy features retain their existing CSV.
- `npm test` is the only verification command; no separate build step exists.
- Duration thresholds (target 15 min, warning band 21–30 min, split > 30 min) are
  hard-coded in the first version; configurability is deferred.
- Open Question 3 (AC source for `wb-validate.js`) must be resolved during Tech-Spec
  generation before implementation can begin. If unresolved, Gate 1 must not be approved.
