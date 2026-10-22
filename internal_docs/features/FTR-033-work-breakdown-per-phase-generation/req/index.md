# FTR-033 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Split the WBS skeleton call's single monolithic task-graph decision into the same
skeleton-then-per-item generation shape already proven for Requirements (per-UC), Tech-Spec
(per-component), and this same Work Breakdown's own existing per-task DETAIL pass: a lightweight
phase-enumeration call, followed by one bounded generation call per phase. Grounded in real,
repeated evidence (12/12 consecutive failures on a real feature, confirmed independent of prompt
size and dispatch mechanism) that a single continuous turn asked to decide an entire feature's task
graph at once is itself the remaining failure mode, even after FTR-032 already fixed the call's
unbounded self-exploration and reduced its input to ~51K tokens.

### 1.2 Scope

In scope: `src/claude/agents/gaia-generate-work-breakdown.md` (repurposed to phase-enumeration
only), a new `src/claude/agents/gaia-generate-work-breakdown-phase.md` agent, `pm-phase2.js`'s
skeleton-generation step (new phase-enumeration + per-phase loop, incremental persistence, resume).

Out of scope: `index.json`'s own on-disk schema (`schemaVersion` stays `3`, unchanged);
`gaia-generate-work-breakdown-task.md` (the existing per-task DETAIL pass, unaffected); parallel
phase generation; splitting phase-enumeration itself further; any change to the
`needsComponentDetail` drill-down mechanism itself (FTR-032, reused unchanged per phase).

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `gaia-generate-work-breakdown` (repurposed agent) | Decides ONLY the ordered phase list — id/type/title/sourceUC/commit — never any task |
| `gaia-generate-work-breakdown-phase` (new agent) | Decides one phase's own tasks, given that phase's Requirements/Tech-Spec context and every prior phase's already-decided tasks |
| `pm-phase2` workflow (coordinator) | Owns phase-enumeration dispatch, the per-phase loop, incremental persistence, and resume |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Enumerate Phases Only | `gaia-generate-work-breakdown` | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Generate One Phase's Own Tasks Per Call | `gaia-generate-work-breakdown-phase` / `pm-phase2` coordinator | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Per-Task Detail Generation Is Unaffected | `gaia-generate-work-breakdown-task` | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | The phase-enumeration call produces `id`/`type`/`title`/`sourceUC`/`commit` per phase and nothing else — no task, no `context` prose (that stays phase-detail-file content, produced alongside each phase's own task-generation call, same as today) | UC-01 |
| BR-02 | Phases are generated strictly in the SAME order they were enumerated — INFRA first (if present), then US phases in priority order; never concurrently, never out of order | UC-02 |
| BR-03 | A phase's own task-generation call receives every PRIOR phase's already-decided tasks (id/title/outcome/domain only, not full task objects) for cross-phase `dependsOn` references and duplicate-implementation avoidance — never a later phase's tasks, since those do not exist yet | UC-02 |
| BR-04 | Each phase's generated tasks are persisted to `index.json` immediately after that phase's own call returns — before the next phase's call is ever dispatched | UC-02 |
| BR-05 | A resumed run skips every phase already present with tasks in `index.json` and resumes from the first phase without one — never redispatching an already-completed phase | UC-02 |
| BR-06 | `needsComponentDetail`'s existing bounded, single-round, host-mediated drill-down (FTR-032) is available per phase call, unchanged in mechanism — reused, not redesigned | UC-02 |
| BR-07 | `index.json`'s own on-disk shape (`schemaVersion: 3`, phase/task fields) is byte-for-byte unchanged by this feature — only the PROCESS that produces it changes | UC-01, UC-02, UC-03 |
| BR-08 | `gaia-generate-work-breakdown-task` (the existing per-task DETAIL pass) is dispatched exactly as it is today, once the full skeleton (all phases' tasks) is assembled — it does not know or care whether the skeleton was produced by one call or many | UC-03 |
| BR-09 | `index.json`'s own phase entries additively persist `title`/`commit` (previously rendered straight to each phase's own detail file and never persisted to `index.json` at all) — purely additive, needed so a resumed run between phase-enumeration and the last phase's completion can still render every phase's detail file without re-asking the phase-enumeration agent | UC-01, UC-02 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

No new persisted data shape, `schemaVersion` stays `3`. `index.json`'s own phase entries gain two
ADDITIVE fields (`title`, `commit`) so a resumed run between phase-enumeration and the last
phase's completion can still render every phase's own detail file without re-asking the
phase-enumeration agent — purely additive, no existing reader ever consumed `title`/`commit` from
`index.json` itself (only from each phase's own rendered detail file). The only OTHER addition is
an optional, never-persisted `needsComponentDetail` field on a per-phase call's own intermediate
response — already established by FTR-032 at the whole-feature level, reused here at the per-phase
level.

### 4.1 Entities

N/A — no new entity; `index.json`'s existing phase/task shape is reused unchanged.

### 4.2 Validation Rules

| Rule | Enforced by |
|------|-------------|
| A phase's generated tasks may only reference task IDs from itself or a PRIOR phase, never a later one | Naturally enforced by generation order (BR-02/BR-03) — a later phase's task IDs are not yet known to an earlier phase's own call. The EXISTING `wb-skeleton-check.js` dangling-reference check still catches any violation, unchanged |
| `index.json` reflects exactly the phases/tasks generated so far, phase by phase | `pm-phase2.js`'s incremental per-phase write (BR-04) |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Reliability | A single phase's own task-generation call must complete within a bounded, reliable duration for a real-world feature size that previously failed when decided in one monolithic call |
| NFR-02 | Resilience | A phase-generation failure partway through a feature must not lose any PRIOR phase's already-generated tasks |
| NFR-03 | Compatibility | `index.json`'s own on-disk shape, and every existing downstream consumer (`wbs-assembler.js`, `wb-render.js`, `wb-validate.js`, `wb-skeleton-check.js`, the task executor's own `_loadPlanDocs` fallback) must continue to work unmodified against a skeleton produced by this feature's own per-phase flow |
| NFR-04 | Cost | The common case (no `needsComponentDetail` requested) must cost exactly one dispatch per phase plus one phase-enumeration call — no unconditional extra round |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given a feature's Requirements/Tech-Spec, approved at Gate 1, when the WBS generation step runs, then a phase-enumeration call decides ONLY the ordered phase list (`id`/`type`/`title`/`sourceUC`/`commit`), never any task | UC-01 | Must |
| AC-02 | Given the phase list from AC-01, when the WBS generation step continues, then one bounded call per phase, in the SAME order enumerated, produces that phase's own tasks only | UC-02 | Must |
| AC-03 | Given a phase's own task-generation call, when dispatched, then it receives that phase's own Requirements detail, the Tech-Spec skeleton (with `needsComponentDetail` available), and every PRIOR phase's own task id/title/outcome/domain — never a later phase's tasks | UC-02 | Must |
| AC-04 | Given phase N's own task-generation call succeeds, when the next phase (N+1) has not yet been generated, then phase N's tasks are persisted to `index.json` immediately — a later failure/crash does not lose them | UC-02 | Must |
| AC-05 | Given a resumed run where phases 1..K already have `index.json` entries and phase K+1 does not, when WBS generation re-runs, then generation resumes from phase K+1 — phases 1..K are never redispatched | UC-02 | Must |
| AC-06 | Given a complete, multi-phase skeleton produced via this feature's own per-phase flow, when `wb-skeleton-check.js`/`wb-graph-checks.js`/`wb-validate.js` run against it, then all pass exactly as they do today | UC-01, UC-02 | Must |
| AC-07 | Given the complete skeleton from AC-06, when `gaia-generate-work-breakdown-task` (the existing per-task DETAIL pass) runs, then it is unaffected — reads the fully-assembled skeleton exactly as it does today | UC-03 | Must |
| AC-08 | Given a per-phase call reports `needsComponentDetail`, when the host processes its response, then the SAME bounded, single-round drill-down FTR-032 already built fires, scoped to that one phase's call | UC-02 | Must |
| AC-09 | Given all changes are delivered, when `npm test` runs, then all tests pass: new regression/integration tests for AC-01 through AC-08, and a full-suite regression | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020, FTR-021, FTR-024, FTR-028, FTR-032 (available): reused unmodified as described in
  `feature.md`'s own Dependencies section.
- Grounded in real, repeated evidence (12/12 consecutive failures on
  `Fincantieri.CommonLibraries.MFExample` FTR-003 at this exact step, confirmed independent of
  prompt size post-FTR-032 and of dispatch mechanism — headless and interactive both fail on the
  byte-identical prompt).
- `pm-phase2.js` remains a sandboxed workflow script with no `require()`; the new per-phase loop is
  inline, following the exact pattern the existing per-task DETAIL loop already establishes.
- `npm test` is the only verification command; no separate build step exists.
