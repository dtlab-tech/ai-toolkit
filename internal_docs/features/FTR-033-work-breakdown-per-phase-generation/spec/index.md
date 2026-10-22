# Technical Specification — Work Breakdown Per-Phase Skeleton Generation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-033 |
| Version | 1.0 |
| Date | 2026-10-22 |
| Status | Draft |

## 1. Overview

Splits `pm-phase2.js`'s WBS skeleton generation from one monolithic call (deciding the ENTIRE
feature's task graph at once) into two bounded tiers: a lightweight phase-enumeration call
(repurposed `gaia-generate-work-breakdown`, now producing only `id`/`type`/`title`/`sourceUC`/
`commit` per phase), followed by one bounded call per phase (new
`gaia-generate-work-breakdown-phase` agent, producing only that phase's own tasks + its narrative
`context`). Each phase's result is persisted to `index.json` immediately, enabling phase-level
resume. `index.json`'s own on-disk shape is unchanged (`schemaVersion: 3`).

## 2. Architecture

### 2.1 System Context

No new script, no new CLI command, no new installer catalog entry beyond one new agent file.
Changes: `src/claude/agents/gaia-generate-work-breakdown.md` (narrowed), a new
`src/claude/agents/gaia-generate-work-breakdown-phase.md`, `src/claude/workflows/pm-phase2.js`
(schema split, new per-phase loop, incremental persistence/resume, new prompt builders, a new local
Requirements-UC-table helper mirroring the existing local Tech-Spec-table helper).

### 2.2 Component Diagram

```
Before (today, post-FTR-032):
  pm-phase2.js: ONE call (gaia-generate-work-breakdown, SKELETON_SCHEMA) decides EVERY phase AND
                EVERY task for the whole feature, in one continuous turn -- confirmed to fail
                (timeout) at real feature scale (10 UCs), independent of prompt size/dispatch mode
  index.json: written ALL AT ONCE after that one call returns -- a failure loses everything

After (this feature):
  pm-phase2.js: Tier 1 -- ONE call (gaia-generate-work-breakdown, PHASE_ENUMERATION_SCHEMA)
                decides ONLY the ordered phase list (no tasks) -- bounded by UC count
                -> index.json written immediately (phases known, taskIds empty, tasks: {})
                Tier 2 -- for each phase, IN ORDER: one call (gaia-generate-work-breakdown-phase,
                PHASE_TASKS_SCHEMA) decides ONLY that phase's own tasks + context, given:
                  - that phase's own scoped Requirements excerpt (index.md + its own sourceUC's
                    use-case file(s) only)
                  - the Tech-Spec skeleton (unchanged from today) + bounded needsComponentDetail
                    drill-down (FTR-032's own mechanism, reused unmodified)
                  - every PRIOR phase's own tasks, as a lightweight id/title/outcome/domain
                    projection (never a later phase's tasks, which do not exist yet)
                -> that phase's tasks merged into index.json, phase's own detail file rendered,
                   BOTH persisted before the next phase's call is ever dispatched
  index.json: grows phase by phase -- a failure on phase N+1 never loses phase N's own work; a
              re-run resumes from the first phase whose taskIds is still empty
```

### 2.3 Sequence Diagrams

**UC-01, phase enumeration (once per feature):**
```
pm-phase2.js: if !c.exists(indexPath):
  requirementsForSkeleton = full Requirements text (unchanged from today)
  techSpecSkeletonForSkeleton = Tech-Spec skeleton only (unchanged from today)
  phaseList = c.worker('gaia.agent.planner.work-breakdown', buildPhaseEnumerationPrompt(...),
                        { schema: PHASE_ENUMERATION_SCHEMA })
  index = { schemaVersion: 3, feature, phases: phaseList.phases.map(p => ({...p,
            detailFile: `user-stories/${p.id}.md`, taskIds: []})), tasks: {} }
  c.writeOutput(indexPath, JSON.stringify(index, null, 2))  -- persisted BEFORE any per-phase call
```

**UC-02, per phase, in enumerated order:**
```
reqIndexContent = c.read(reqIndexPath)  -- read once, outside the loop
taskIdToPhase = new Map()  -- grows incrementally as prior phases complete
for phase of index.phases:
  if phase.taskIds.length > 0: taskIdToPhase += phase's own (already-persisted) tasks; continue
  reqExcerpt = buildPhaseRequirementsExcerpt(reqIndexContent, phase.sourceUC, reqDir)
  priorTasks = Object.entries(index.tasks).map(([id,t]) => ({id, title, outcome, domain}))
  phaseResult = c.worker('gaia.agent.planner.work-breakdown-phase',
                          buildPhaseTaskPrompt(phase, reqExcerpt, techSpecSkeletonForSkeleton, priorTasks),
                          { schema: PHASE_TASKS_SCHEMA })
  if hasSpec && phaseResult.needsComponentDetail?.length:
    drillDownText = buildComponentDrillDownText(...)  -- FTR-032's own function, reused unmodified
    if drillDownText: phaseResult = c.worker(..., buildPhaseTaskPrompt(..., drillDownText), ...)
  for (taskId, t) of phaseResult.tasks: index.tasks[taskId] = {...t, detailFile, status:'pending'}
  phase.taskIds = Object.keys(phaseResult.tasks)
  taskIdToPhase += phase's own newly-added tasks
  dependsOnPhases = computeDependsOnPhases(index, phase.id, taskIdToPhase)  -- UNCHANGED function;
    correct with incremental data since it only ever looks at PRIOR phases (BR-03's own guarantee)
  c.writeOutput(phase detail file, renderPhaseDetailBlock({...phase, context: phaseResult.context},
                taskTitles, dependsOnPhases))
  c.writeOutput(indexPath, JSON.stringify(index, null, 2))  -- persisted before the NEXT phase's call
```

## 3. Backend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 4. Frontend

N/A — internal/technical feature; no UI surface.

## 5. External Integrations

None.

## 6. Security Considerations

None new — no new external input-validation boundary; `needsComponentDetail` fileSlug validation
is FTR-032's own existing mechanism, reused unmodified per phase.

## 7. Database Changes

None.

## 8. Configuration

None — phase generation order (INFRA first, then US phases in priority order) and the
prior-phase-tasks projection shape are both fixed code behavior, not configurable, consistent with
this codebase's own "no real evidence yet justifies external tuning" precedent.

## 9. File Inventory

### New files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/agents/gaia-generate-work-breakdown-phase.md | New agent: generates one phase's own tasks + context per call, given that phase's scoped Requirements excerpt, the Tech-Spec skeleton, and every prior phase's own task id/title/outcome/domain. Implements the SAME needsComponentDetail protocol as the repurposed phase-enumeration agent | AC-02, AC-03, AC-08 | BE | [components/gaia-generate-work-breakdown-phase.md.md](components/gaia-generate-work-breakdown-phase.md.md) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/agents/gaia-generate-work-breakdown.md | Narrowed to phase-enumeration ONLY — produces id/type/title/sourceUC/commit per phase, never a task, never `context`; drops Step 0 (AGENTS.md read, no longer needed at this tier) and Glob/Grep tool access (Read retained, for feature.md only) | AC-01 | BE | [components/gaia-generate-work-breakdown.md.md](components/gaia-generate-work-breakdown.md.md) |
| lib/agent-registry.js | New CATALOG entry for `gaia.agent.planner.work-breakdown-phase` -> `gaia-generate-work-breakdown-phase`, mirroring the existing `work-breakdown`/`work-breakdown-task` entries exactly (same role/type/authorisedPhases/allowedPipelines/minimumToolkitVersion/platforms) | AC-02 | BE | [components/agent-registry.js.md](components/agent-registry.js.md) |
| src/claude/workflows/pm-phase2.js | `SKELETON_SCHEMA` replaced by `PHASE_ENUMERATION_SCHEMA` + `PHASE_TASKS_SCHEMA`; new per-phase loop with incremental `index.json` persistence and phase-level resume; new `buildPhaseEnumerationPrompt`/`buildPhaseTaskPrompt`/`buildPhaseRequirementsExcerpt` helpers; new local `parseUseCaseIndexTableLocal` (mirrors req-assembler.js's own `parseUseCaseIndexTable`, reusing the already-local `_findSectionRange`/`_parseTableRows`) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08 | BE | [components/pm-phase2.js.md](components/pm-phase2.js.md) |
| tests/integration/workflow-runtime.test.js | New tests for AC-01 through AC-08: phase-enumeration-only output, per-phase dispatch order, scoped Requirements/prior-task visibility, incremental persistence, resume, structural-check compatibility, per-task DETAIL pass unaffected, needsComponentDetail at the per-phase tier | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/agents/gaia-generate-work-breakdown-phase.md` — depends on: nothing (new, standalone agent definition)
2. `src/claude/agents/gaia-generate-work-breakdown.md` — depends on: nothing (narrows an existing, independent agent definition)
3. `lib/agent-registry.js` — depends on: 1 (the new agentId must name a real, already-written agent file)
4. `src/claude/workflows/pm-phase2.js` — depends on: 1, 2, 3 (dispatches both agents by name; both must be registered first)
5. `tests/integration/workflow-runtime.test.js` — depends on: 1, 2, 3, 4

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| A phase's own task-generation call could, in principle, still produce a large-enough output to risk the same timeout class if a single PHASE itself happens to be unusually large (e.g. one UC decomposing into dozens of tasks) | The same failure mode recurs at phase granularity instead of feature granularity | Accepted as a real but far less likely residual risk than today's guaranteed whole-feature-sized generation — bounded by UC count per phase (normally one UC's worth of tasks, typically single digits to low tens), not by total feature size; if real evidence shows a specific phase is still too large, further per-phase splitting is a natural, separate follow-up (not attempted here without evidence, per this feature's own Out of Scope) |
| Scoping Requirements per phase to only its own `sourceUC`'s use-case file(s) could omit cross-UC context a task decision genuinely needs | A task decomposition decision misses relevant detail from a DIFFERENT UC | Mitigated: `req/index.md` itself (feature-wide Business Rules, AC table, NFRs — never per-UC-scoped) is ALWAYS included in full, regardless of phase; only the PER-UC FLOW detail (the verbose part) is scoped. A phase's own `sourceUC` already reflects what UC(s) the phase's own tasks are meant to realize (decided at UC-01's own enumeration step), so this is the same boundary the Work Breakdown's own existing "acceptanceCriteria must be scoped to this task's own phase" rule already enforces today |
| Incremental persistence writes `index.json` N+1 times (once per phase, once for enumeration) instead of once — more I/O | Marginally more disk writes per run | Accepted: each write is small, local, and already uses this host's existing `c.writeOutput` primitive (same one every other incremental-write step in this file already relies on, e.g. the existing per-task detail loop's own `c.writeOutput(indexPath, ...)` after every task) |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact prompt shape for "every prior phase's tasks" in a per-phase call | **Resolved** | Lightweight `{id, title, outcome, domain}` projection, mirroring `buildTaskPrompt`'s own existing "siblings" list for the per-task DETAIL pass — not full task objects |
| 2 | Whether `gaia-generate-work-breakdown-phase` needs its own `needsComponentDetail` drill-down | **Resolved** | Yes, kept available (same FTR-032 mechanism, reused unmodified) — cheap when unused (empty array, the common case), and phase-level scoping alone is not assumed to eliminate every genuine need for component-body detail |

## Dependencies and Assumptions

- FTR-020, FTR-021, FTR-024, FTR-028, FTR-032 (available): reused unmodified as described in
  `req/index.md`'s own Dependencies section.
- `pm-phase2.js` remains a sandboxed workflow script with no `require()`; the new per-phase loop,
  prompt builders, and local Requirements-table helper are all inline, following the exact pattern
  the existing per-task DETAIL loop and local Tech-Spec-table helper (`parseComponentsTableLocal`,
  `_findSectionRange`, `_parseTableRows`) already establish in this same file.
- `npm test` is the only verification command; no separate build step exists.
- Grounded in real, repeated evidence (12/12 consecutive failures on
  `Fincantieri.CommonLibraries.MFExample` FTR-003 at this exact step, confirmed independent of
  prompt size and dispatch mechanism) — not a hypothetical performance concern.
