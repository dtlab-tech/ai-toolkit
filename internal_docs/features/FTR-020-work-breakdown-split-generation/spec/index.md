# FTR-020 — Technical Specification (Index)

> Manual, exploratory split of `FTR-020-Tech-Spec.md` into a directory format, produced to
> decide whether the Work Breakdown/Requirements split architecture is worth extending to the
> Tech-Spec too. Not yet a real format — see "What moved out of this file, and why" at the
> bottom.

## 1. Baseline

- Branch: `develop`. `wb-validate.js` and `wb-render.js` live at `src/claude/scripts/`
  (1051 and 408 lines respectively, schema v2, both standalone top-level scripts with no
  `module.exports`). `gaia-generate-work-breakdown.md` is a sonnet agent with `tools: Read, Glob,
  Grep` (no Write) whose entire response is the JSON file content. `pm-phase2.js`
  (`src/claude/workflows/pm-phase2.js`) orchestrates: `c.worker('gaia.agent.planner.work-breakdown',
  ..., { outputs: [{ path: jsonPath, ... }] })` → `wb-validate.js` via `c.command` →
  `gaia.agent.planner.validate-work-breakdown` semantic check → `wb-render.js` via `c.command` →
  Gate 2 payload.
- `lib/workflow-control.js`'s `worker()` enforces exactly one declared output per call
  (`if (outputs.length > 1) throw new Error(...)`); this is relied on identically by
  `pm-phase1.js` and `am-phase1.js` and is **not modified** by this feature.
- `lib/task-executor/plan.js` (`parseMarkdown`/`parseCSV`/`mapPhases`/`validateDAG`/
  `createPlanSnapshot`/`computeReadyQueue`) parses only the rendered
  `{PREFIX}-Work-Breakdown.md` + `.csv`. It is **not modified**.

## 2. Resolution of Open Questions

<!-- Same principle as Requirements' Business Rules: an OQ resolution that affects exactly one
     component moves into that component's own file (see OQ-02 → wb-graph-checks.md). An OQ
     whose resolution affects several components stays here and cross-references them, same as
     a Business Rule applying to several UCs. -->

### OQ-03 (feature.md): skeleton/detail field split

**Affects:** `wbs-assembler.md`, `gaia-generate-work-breakdown.md`, `gaia-generate-work-breakdown-task.md`

**Decision:** skeleton (`index.json`, per task) owns: `id` (map key), `title`, `outcome`,
`domain`, `agentType`, `dependsOn`, `acceptanceCriteria`, `estimate` (`agentMinutes` + `tokens`),
`outputCount`, `commit`, `status`. Detail (`tasks/{id}.md`) owns: `verification.commands`,
`groupingRationale`. The per-task detail block format (reused verbatim from today's rendered
"Task Details" section) restates every skeleton field too — the per-task generation agent is
instructed to copy them forward unchanged from its given skeleton entry — but the assembler
(see `wbs-assembler.md`) always takes `title`/`outcome`/`domain`/`agentType`/`dependsOn`/
`acceptanceCriteria`/`estimate`/`outputCount`/`commit` from `index.json`, never from the task
file, so a disagreement is structurally impossible to act on even if a careless generation
restates them differently. `feature.md`'s Data Model section omitted `title` from the enumerated
skeleton fields; this is corrected here and is the authoritative list.

### OQ-04 (added after Gate 1, user-requested): third tier for phase-level content

**Affects:** `wbs-assembler.md`, `pm-phase2.md`, `gaia-generate-work-breakdown.md`

**Decision:** add `user-stories/{phaseId}.md`, one file per phase, mirroring the user's original
`features/`/`user-stories/`/`tasks/` three-tier example — including its literal directory name
(`user-stories/`, not `phases/`), even though this directory also holds the one `INFRA.md` entry,
which is not itself a user story; `id`/`type` on the skeleton side still distinguish it. Unlike
the task split (which exists to shrink per-turn generation volume and bound truncation blast
radius), phases are **not** generated incrementally — the one skeleton call already decides
every phase's `title` and `commit` in the same turn it decides the task graph. So this tier is
added for **structural symmetry and future extensibility** (room for a real per-phase narrative
field later), not for truncation mitigation, and that distinction matters for the field split:
`id` and `type` stay in `index.json` because `wb-graph-checks.js`'s checks (ID-format-vs-phase-type,
phase cycle/schedulability) need them before any file beyond `index.json` is read, and there is
no generation-order reason to defer them. `title` and `commit` move entirely to the phase detail
file — `index.json`'s phase entries carry `{ id, type, sourceUC, detailFile, taskIds }` (see
OQ-05 below for `sourceUC`), no content. This was verified end-to-end (assemble → real
`wb-validate.js` → real `wb-render.js`) to still produce byte-identical rendered `.md`/`.csv`
output, the same way the two-tier design was verified before it.

**Note:** OQ-02 (skeleton pre-check reuse strategy) affects exactly one component and moved to
[components/wb-graph-checks.md](components/wb-graph-checks.md) — see it there, not here.

### OQ-05 (added after the req/spec split exercise): explicit phase→UC traceability field

**Affects:** `wbs-assembler.md`, `gaia-generate-work-breakdown.md`

**Decision:** add `sourceUC` (array of UC-IDs, possibly empty) to every phase entry in
`index.json`. Before this field existed, a phase's originating Use Case was only inferable from
matching phase/UC numbering (`US-01` ↔ `UC-01`) — a convention, not a guarantee. Building the
coverage matrix (see `coverage-matrix/index.md` at the feature root) surfaced two concrete cases where
that convention silently breaks: an orchestration phase (`US-04`, wiring `pm-phase2.js`) whose
tasks implement mechanics belonging to *four* UCs at once (`UC-01`, `UC-02`, `UC-03`, `UC-04`),
and a case where one UC (`UC-05`, "Assemble and Validate/Render Unchanged") is realized across
*two* separate phases (`US-02` for `wb-validate.js`, `US-05` for `wb-render.js`). A single-value
field would have been wrong in both directions (too narrow for `US-04`, too narrow for `UC-05`'s
split across phases) — hence an array, and hence explicit rather than inferred. `sourceUC: []` is
valid and expected for `INFRA` (shared setup has no single originating UC, the same reasoning
Business Rules/NFRs in `req/` use for content that isn't owned by one UC).

## 3. Components (index)

<!-- "Addresses" is a projection of each component's own `Addresses:` field (see
     component-template.md) — kept here too, duplicated, purely as an at-a-glance summary; the
     per-component file is authoritative, not this column. -->

| File | Change | Addresses | Spec |
|---|---|---|---|
| `src/claude/scripts/wb-graph-checks.js` | New | AC-02, AC-08, AC-09 | [components/wb-graph-checks.md](components/wb-graph-checks.md) |
| `src/claude/scripts/wb-validate.js` | Modified | AC-04, AC-08, AC-09 | [components/wb-validate.md](components/wb-validate.md) |
| `src/claude/scripts/wb-render.js` | Modified | AC-05, AC-08, AC-09 | [components/wb-render.md](components/wb-render.md) |
| `src/claude/scripts/wbs-assembler.js` | New | AC-04, AC-05, AC-06, AC-07, AC-08, AC-09 | [components/wbs-assembler.md](components/wbs-assembler.md) |
| `src/claude/agents/gaia-generate-work-breakdown.md` | Modified | AC-01, AC-08, AC-09 | [components/gaia-generate-work-breakdown.md](components/gaia-generate-work-breakdown.md) |
| `src/claude/agents/gaia-generate-work-breakdown-task.md` | New | AC-02, AC-08, AC-09 | [components/gaia-generate-work-breakdown-task.md](components/gaia-generate-work-breakdown-task.md) |
| `src/claude/workflows/pm-phase2.js` | Modified | AC-01, AC-02, AC-03, AC-08, AC-09 | [components/pm-phase2.md](components/pm-phase2.md) |

> **Legend:** **File** — real path of the file this feature creates or modifies. **Change** —
> New or Modified. **Addresses** — which Acceptance Criteria (from
> [req/index.md §6](../req/index.md#6-acceptance-criteria)) this component's design satisfies;
> read by the backward half of the traceability check below — never invent an AC here that
> doesn't exist in `req/index.md`. **Spec** — this component's own design file.

**AC coverage check (forward, manual for now):** AC-01✓ AC-02✓ AC-03✓ AC-04✓ AC-05✓ AC-06✓
AC-07✓ AC-08✓(all) AC-09✓(all) — every Must AC in
[req/index.md](../req/index.md#6-acceptance-criteria) is addressed by at least one component.

## 4. Traceability

This document is the last link in the three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (Requirements) → `spec/` (this document). The **backward** direction of the bidirectional
check resolves here: every AC a component's `Addresses:` field cites (§3's table, or each
component file directly) must exist in [req/index.md](../req/index.md#6-acceptance-criteria) —
a component may never claim to address an AC that was never approved. The **forward** direction
(every Must AC in `req/` is addressed by ≥1 component — §3's coverage check above) is the other
half; see [req/index.md](../req/index.md#traceability) for the forward-direction description.
Only after both resolve with no errors does content-level (semantic) review of each component's
actual design proceed. See `../coverage-matrix/index.md` for the worked example that pivots both
directions, plus `spec/` and the Work Breakdown, into one AC-per-row view — and for two findings
from building it: the component-based path is more precise than a pure UC-based path whenever a
Use Case bundles independent mechanics (here, `UC-05` bundles validate+render), and the exercise
caught a real misassignment in `wbs/index.json`'s `sourceUC` field on first use.

**Governance decision:** this check is not a new, separate gate — it is a two-stage validation
(coverage, then semantic) folded into **Gate 1** (feature.md↔req↔spec, described in
`req/index.md`'s Traceability section) and **Gate 2** (req/spec↔Work Breakdown, resolved here):
Gate 2 runs a coverage check (does every Must AC trace to ≥1 WB phase, per the matrix) before any
semantic judgment of whether the Work Breakdown's tasks actually realize what `spec/` promised —
mirroring the Work Breakdown's own existing `wb-validate.js`→semantic-validator two-stage pattern,
one level up in the document chain.

## 5. Legacy Compatibility

A feature whose `{PREFIX}-Work-Breakdown.json` already exists (pre-FTR-020) is never migrated.
`loadWorkBreakdown()` dispatches purely on whether the given path is a file or a directory, so
re-running `wb-validate.js`/`wb-render.js` by hand against an old feature's existing JSON file
continues to work identically (AC-06). New features created after this ships always get the
directory form from `pm-phase2.js`.

## 6. Shared test fixture

`internal_docs/features/FTR-020-work-breakdown-split-generation/wbs/` is a real, hand-authored
split-format directory (16 tasks, 6 phases, both tiers) produced during this feature's own
definition and already verified — by a throwaway script, before any production code existed —
to assemble and round-trip through the real (pre-extraction) `wb-validate.js`/`wb-render.js`
with byte-identical rendered output to the equivalent legacy `FTR-020-Work-Breakdown.json`. Copy
it into the test fixtures directory instead of hand-building an equivalent one from scratch —
referenced by both `wbs-assembler.md`'s and `wb-render.md`'s own test sections, hence kept here
rather than duplicated in each.

---

## What moved out of this file, and why

Section **3 "New and Modified Files"** was already, in effect, an index table — it mapped one
row to one component exactly, the same shape as Requirements' Use Cases index. So **everything
owned by exactly one component moved into that component's own file**: the `loadWorkBreakdown`
algorithm (→ `wbs-assembler.md`), the `pm-phase2.js` control flow (→ `pm-phase2.md`), each
schema that only one component produces/consumes, and — importantly — the **Test Plan**, which
the monolithic Tech-Spec had centralized in one `## 8` section but where every single bullet
already named exactly one component's own test file. Unlike Requirements' Business
Rules/NFRs/Data Requirements (genuinely referenced by several UCs each), nothing forced the Test
Plan to stay centralized — so each test-plan bullet now lives with the component it tests, and
only the one fixture note shared by two components' tests (§5 above) stays here.

What stayed central: **Baseline** (feature-wide context), **Open Questions whose resolution
touches more than one component** (OQ-03, OQ-04 — exactly like a Business Rule applying to
several UCs; OQ-02 touches only one component and moved out), and **Legacy Compatibility** (a
feature-wide guarantee, not owned by any one file).
