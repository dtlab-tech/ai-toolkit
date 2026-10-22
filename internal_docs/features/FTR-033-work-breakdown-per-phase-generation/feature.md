# Work Breakdown Per-Phase Skeleton Generation

## Feature ID
FTR-033

## Summary
`pm-phase2.js`'s WBS skeleton call (`gaia-generate-work-breakdown`) decides the ENTIRE task graph
for a feature — every phase and every task's structural fields — in one continuous, monolithic
generation turn. FTR-032 confirmed and fixed a real cost anti-pattern in that same call (unbounded
self-directed exploration of Tech-Spec components), but a same-day follow-up on the real feature
that originally surfaced it (`Fincantieri.CommonLibraries.MFExample`, FTR-003 — 13 ACs, 10 UCs,
~34 files) showed the underlying failure (`API Error: ... timeout`) persists even after that fix:
with a small, bounded ~51K-token prompt confirmed, the SAME exact prompt — tested byte-for-byte,
both as the real headless worker dispatch and as a manual interactive invocation of the identical
agent — still fails, after up to ~1 hour of continuously active (not stalled) generation, with a
request/stream timeout. 12/12 consecutive attempts on this feature have now failed at this exact
step. The size/content of the INPUT is no longer implicated; the size of the single continuous
OUTPUT this one call must produce — a complete, internally-consistent task graph across dozens of
tasks, correctly cross-referencing IDs, dependencies, domains, and AC coverage for an entire
feature — is. This feature splits that one monolithic decision into the SAME two-tier
skeleton-then-per-item generation shape already proven, three times over, for every other
generated artifact in this pipeline (Requirements: skeleton + per-UC; Tech-Spec: skeleton +
per-component; Work Breakdown's own existing per-task DETAIL pass): a lightweight phase-enumeration
call, followed by one bounded generation call per phase, each producing only that phase's own
tasks.

## Problem Statement
Confirmed via direct evidence inspection (the shared `%LOCALAPPDATA%\Temp\ai-toolkit-workflows\`
worker-evidence files, read directly from this machine) across the full arc of this investigation:

1. **Before FTR-032**: the skeleton call's own prompt asked the model to also produce a per-task
   effort estimate, and — far more significantly — the agent's own instructions had it
   self-exploring the filesystem with `Read`/`Glob`/`Grep`, including an explicit "if unsure, read
   every file under `spec/components/`" fallback. For this feature (~34 Tech-Spec files), this
   produced 986K-1.65M tokens per attempt, 1.18M of which were `cache_read_input_tokens` — i.e.
   cost compounding from many self-directed tool-use turns, not from the declared JSON schema.
2. **FTR-032 (merged, shipped)**: removed the per-task estimate from the skeleton schema (moved to
   the per-task detail pass) and bounded the agent's own Tech-Spec exploration via a host-mediated
   `needsComponentDetail` drill-down (the same pattern already proven for the feature-doc
   validator, FTR-028) — the agent no longer self-explores `spec/components/*` at all; Requirements
   (full) and Tech-Spec (skeleton only) are inlined directly into its prompt by the host.
3. **Real-world retry after FTR-032 shipped (same day)**: token usage confirmed fixed — 51,094 /
   51,101 / 51,105 across 3 attempts, down from 986K-1.65M. The identical `"Stream idle timeout -
   no chunks received"` error still fired on all 3. Evidence inspection showed `duration_api_ms:
   11361` (~11s of real API processing) against `duration_ms: 312026` (~5.2 min total),
   `output_tokens: 213` (negligible) — the stream died early, not after a long generation, which
   initially suggested a transient infrastructure condition rather than a content-driven one.
4. **Decisive follow-up test, requested specifically to rule out a headless-dispatch-specific
   cause**: the exact same prompt (reconstructed byte-for-byte via the real `req-assembler.js`
   output plus the raw `spec/index.md` skeleton, confirmed against the real
   `buildSkeletonPrompt` concatenation this feature's own host code uses) was run a SECOND way —
   interactively, via a direct Agent-tool invocation of the same `gaia-generate-work-breakdown`
   agent, outside the headless `--print --no-session-persistence` dispatch path entirely. Result:
   **failed anyway**, after approximately one hour of continuously active, steadily-growing
   generation (confirmed not stalled/stuck — real token output was accumulating throughout), with
   `"Agent terminated early due to an API error: Request timed out (error type server_error)"` — a
   different exact error string than the headless case, but the same class of failure (a timeout),
   now proven to be independent of dispatch mechanism. As of this writing: 12/12 consecutive
   failures on this feature at this exact step, across both invocation styles.

The only variable still implicated by this evidence is the SIZE/DURATION of the single continuous
OUTPUT this one call is asked to produce: a complete, schema-conformant task graph — every phase,
every task's title/outcome/domain/agentType/dependsOn/acceptanceCriteria/outputCount/commit,
internally cross-referenced for ID validity, no dangling or cyclic dependencies, no duplicate
implementation across phases — for an ENTIRE feature, in one uninterrupted turn. For a small
feature (e.g. this toolkit's own FTR-029, 15 tasks total) this has never been observed to fail; for
a feature of FTR-003's real size (10 UCs, correspondingly many more tasks), it has now failed
12 times in a row, independent of prompt size or dispatch mechanism.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
Replaces the skeleton's single monolithic generation call with two bounded tiers, mirroring the
exact skeleton-then-per-item shape already proven for Requirements (FTR-021), Tech-Spec (FTR-024),
and this same Work Breakdown's own existing per-task DETAIL pass (FTR-020):

1. **UC-01 — Enumerate phases only (new, lightweight call).** A new, much smaller call to
   `gaia-generate-work-breakdown` (repurposed; no longer also decomposes tasks) decides ONLY the
   ordered list of phases — `id`, `type`, `title`, `sourceUC`, `commit` — never any task. Bounded
   by UC count (typically 10-20 rows), not by total task count; the same order of magnitude as
   Requirements'/Tech-Spec's own index-level skeleton calls, which have never shown this failure
   mode.
2. **UC-02 — Generate one phase's own tasks per call (new agent,
   `gaia-generate-work-breakdown-phase`).** Dispatched once per phase, in the SAME order the
   phases were enumerated (INFRA first, then US phases in priority order) — each call receives
   that phase's own Requirements detail (the UC(s) it realizes), the Tech-Spec skeleton (with the
   same bounded `needsComponentDetail` drill-down FTR-032 already built, reused unchanged), and
   the id/title/outcome/domain of every task already decided by a PRIOR phase (for cross-phase
   `dependsOn` references and duplicate-implementation avoidance) — never a later phase's tasks,
   since those do not exist yet. Produces only that phase's own tasks (same structural fields as
   today's skeleton task entry, unchanged). Each phase's result is persisted to `index.json`
   immediately after that phase's own call returns — a crash or failure partway through now loses
   at most one phase's own generation, not the whole feature's, and a re-run resumes from the
   first not-yet-generated phase.
3. **UC-03 — Per-task DETAIL generation is unaffected.** `gaia-generate-work-breakdown-task`
   (FTR-020) still runs exactly as it does today, once per task, reading the now-fully-assembled
   skeleton exactly as before — this feature only changes HOW the skeleton itself is produced,
   never its final on-disk shape (`index.json`'s own schema stays `schemaVersion: 3`, byte-for-byte
   compatible with every existing downstream consumer: `wbs-assembler.js`, `wb-render.js`,
   `wb-validate.js`, `wb-skeleton-check.js`, the task executor's own `_loadPlanDocs` fallback).

## Out of Scope
- Any change to `index.json`'s own on-disk schema or `schemaVersion` — stays exactly `3`; this
  feature only changes the GENERATION PROCESS, never the persisted shape.
- Any change to the per-task DETAIL generation pass (`gaia-generate-work-breakdown-task`,
  FTR-020) — unaffected, unchanged.
- Parallelizing per-phase generation calls — phases are still generated strictly sequentially, in
  order, because each phase's own call needs to see every PRIOR phase's already-decided tasks for
  cross-phase dependency references; this feature does not attempt concurrent phase generation.
- A phase referencing a LATER phase's task in `dependsOn` — already implicitly disallowed by this
  codebase's own phase-ordering convention ("INFRA phase first, then US phases in priority order");
  this feature makes that ordering constraint load-bearing for generation itself, not just
  stylistic, and does not attempt to support a genuinely backward-pointing cross-phase dependency.
- Splitting the phase-enumeration call (UC-01) itself any further — not evidenced as a problem at
  its own scale (bounded by UC count, typically 10-20 rows); only the per-phase task decomposition
  (UC-02) is split by this feature.
- Changing `needsComponentDetail`'s own bounded drill-down mechanism (FTR-032) — reused unchanged,
  per phase, not redesigned.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A feature with only one phase (e.g. this toolkit's own smaller internal features) | Still goes through both tiers — one phase-enumeration call returning a single-row list, one per-phase call for that single phase. No special-casing for "small enough, do it in one call" — the per-phase mechanism itself is the uniform path |
| A phase's own task-generation call fails/times out | Propagates unmodified (same fail-fast convention as every other worker-call failure in this file) — but since EARLIER phases' tasks are already persisted to `index.json`, a re-run resumes from this phase, not from the beginning |
| A phase references a task ID from a PRIOR phase in `dependsOn` | Valid — the prior phase's task IDs are given to this call explicitly |
| A phase's own generated task attempts to reference a task ID that does not yet exist (a later phase's task, or a typo) | Rejected by the EXISTING structural validation (`wb-skeleton-check.js`'s dangling-reference check), exactly as an invalid reference is rejected today — this feature does not change that check |
| `needsComponentDetail` is requested during a per-phase call | Same bounded, single-round, host-mediated drill-down FTR-032 already built — reused per phase, not reinvented |
| `--force`/a full regeneration re-enters this flow | Every phase is regenerated from scratch, in order, exactly as `--force` already means for every other regenerable artifact in this pipeline |
| A legacy feature (pre-split, monolithic `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`, no `req/`/`spec/` directories) | Unaffected by this feature's own scope — the per-phase split applies identically; only the SOURCE of the inlined Requirements/Tech-Spec content differs, exactly as it already does today for the single-call path |

## Data Model
No new on-disk artifact and no `schemaVersion` bump (stays `3`). `index.json`'s own phase entries
gain two ADDITIVE fields they did not carry before — `title` and `commit` — needed so a resumed
run, between phase-enumeration and the last phase's own completion, can still render every phase's
detail file without re-asking the phase-enumeration agent (that content was previously rendered
straight to each phase's own detail file and never persisted to `index.json` at all, since the
original single-call generator always had the full phase list in memory already; splitting
generation into separate calls means it must now be durably persisted somewhere). Purely additive
and backward-compatible: no existing reader (`wbs-assembler.js`'s `loadWorkBreakdown`) ever read
`title`/`commit` from `index.json`'s own phase entry — only from the phase's own rendered detail
file — so their presence there is simply unused by every other consumer, never conflicting with
it. The only OTHER persisted-shape addition is the same optional, never-persisted
`needsComponentDetail` field on a per-phase call's own intermediate response, already established
by FTR-032, reused unchanged here at the per-phase level instead of per-feature.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature's Requirements/Tech-Spec, approved at Gate 1 | The WBS generation step runs | A phase-enumeration call decides ONLY the ordered phase list (`id`/`type`/`title`/`sourceUC`/`commit`), never any task | Must |
| AC-02 | The phase list from AC-01 | The WBS generation step continues | One bounded call per phase, in the SAME order enumerated, produces that phase's own tasks only | Must |
| AC-03 | A phase's own task-generation call | Dispatched | It receives that phase's own Requirements detail, the Tech-Spec skeleton (with `needsComponentDetail` available), and every PRIOR phase's own task id/title/outcome/domain — never a later phase's tasks | Must |
| AC-04 | Phase N's own task-generation call succeeds | The next phase (N+1) has not yet been generated | Phase N's tasks are persisted to `index.json` immediately — a later failure/crash does not lose them | Must |
| AC-05 | A resumed run where phases 1..K already have `index.json` entries, phase K+1 does not | WBS generation re-runs | Generation resumes from phase K+1 — phases 1..K are never redispatched | Must |
| AC-06 | A complete, multi-phase skeleton produced via this feature's own per-phase flow | `wb-skeleton-check.js`/`wb-graph-checks.js`/`wb-validate.js` run against it | All pass exactly as they do today — `index.json`'s own shape is unchanged | Must |
| AC-07 | The complete skeleton from AC-06 | `gaia-generate-work-breakdown-task` (the existing per-task DETAIL pass) runs | Unaffected — reads the fully-assembled skeleton exactly as it does today | Must |
| AC-08 | A per-phase call reports `needsComponentDetail` | The host processes its response | The SAME bounded, single-round drill-down FTR-032 already built fires, scoped to that one phase's call | Must |
| AC-09 | All changes are delivered | `npm test` runs | All tests pass: new regression/integration tests for AC-01 through AC-08, and a full-suite regression | Must |

## MVP vs Deferred

### MVP (must ship)
- UC-01: phase-enumeration call (repurposed `gaia-generate-work-breakdown`).
- UC-02: new per-phase task-generation agent (`gaia-generate-work-breakdown-phase`) and host loop,
  with incremental per-phase persistence and resume.
- Automated tests per AC-09.

### Deferred (next iteration, only if real evidence justifies it)
- Parallelizing independent phases' own generation calls (explicitly Out of Scope above).
- Splitting phase-enumeration itself further.
- Any analogous per-item splitting for a DIFFERENT monolithic call elsewhere in the pipeline not
  evidenced as a problem by this investigation.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact prompt shape for the per-phase task-generation call — how much of "every prior phase's tasks" to include (full task objects vs. just id/title/outcome/domain) | **Open — resolve in Tech-Spec** | Lean toward the lightweight id/title/outcome/domain projection already used by `buildTaskPrompt`'s own "siblings" list for duplicate-awareness — full task objects would reintroduce unnecessary prompt growth as prior phases accumulate |
| 2 | Whether the new `gaia-generate-work-breakdown-phase` agent needs its own bounded `needsComponentDetail` drill-down identical to the phase-enumeration/old monolithic call, or whether phase-level scoping already makes this unnecessary in practice | **Open — resolve in Tech-Spec** | Lean toward keeping it available (cheap when unused — the common case is an empty array, costing nothing extra) rather than assuming phase-level scoping alone eliminates every genuine need for component-body detail |

## Dependencies and Assumptions
- FTR-020 (Work Breakdown split generation — the per-task DETAIL pass this feature's UC-03
  leaves unchanged), FTR-021/FTR-024 (Requirements/Tech-Spec's own proven skeleton-then-per-item
  shape, the direct precedent this feature extends to the WBS skeleton itself), FTR-028 (the
  `needsComponentDetail` bounded drill-down mechanism, reused per phase), FTR-032 (the immediately
  prior fix to this same call — necessary but, per this feature's own Problem Statement, not
  sufficient on its own) — all available, all reused, none replaced.
- Grounded in real, repeated evidence from one real consumer project
  (`Fincantieri.CommonLibraries.MFExample`, FTR-003) — 12/12 consecutive failures at this exact
  step as of this writing, confirmed independent of prompt size (post-FTR-032: ~51K tokens) and
  dispatch mechanism (headless and interactive both fail on the byte-identical prompt).
- `pm-phase2.js` remains a sandboxed workflow script with no `require()`; the new per-phase loop
  and prompt-building logic are inline, following the exact same pattern the existing per-task
  DETAIL loop already establishes in this same file.
- `npm test` is the only verification command; no separate build step exists.
