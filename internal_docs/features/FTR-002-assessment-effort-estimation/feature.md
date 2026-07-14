# Assessment Pipeline Effort Estimation

## Feature ID
FTR-002

## Summary
Extend the assessment pipeline to produce a `{PREFIX}-Effort-Estimate.md` file that tracks estimated and actual wall-clock time for every assessment agent invoked during a run. The estimate is computed from the planned intervention count and severity distribution, shown to the tech lead at the Remediation Gate alongside the Interventions Index, and completed with actuals appended at the end of Phase 4 (after `intervention-documentation-standard` completes). Remediation effort is explicitly out of scope — each approved intervention is tackled by the feature delivery pipeline, which has its own effort tracking.

## Problem Statement
Currently the assessment pipeline produces no effort estimate and no actuals record for the assessment work itself. Tech leads have no pre-gate signal for how long the assessment phase took or will take, making it impossible to plan sprint capacity or compare assessment runs over time. Without structured actuals, estimation accuracy cannot improve across repeated assessments. Teams either eyeball the Interventions Index or skip estimation entirely before deciding which interventions to approve for a sprint.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Tech Lead / Project Manager | Reviews the effort estimate at the Remediation Gate to inform sprint planning; reads actuals post-run to track trends | After each assessment pipeline run |
| Assessment Manager (orchestrator agent) | Writes the Effort Estimate file at end of Phase 3; appends actuals at end of Phase 4 | Every pipeline run |
| assess-codebase skill | No new responsibility for this file (contrast with FTR-001 Token Estimate where the skill appends the orchestrator row) | Every pipeline run |

## Core Flow (Happy Path)

1. `assessment-manager` completes Phase 2 planning and shows the plan to the user.
2. All assessment agents run in parallel (Phase 3). The orchestrator records start and end timestamps for each agent invocation using the process log.
3. At the end of Phase 3 — after all assessment agents complete — `assessment-manager` writes `{PREFIX}-Effort-Estimate.md` to the assessment output directory. The file contains:
   - One row per assessment agent with: agent name, estimated duration, actual duration (from process log timestamps), delta.
   - A "Remediation effort" section showing the intervention count and severity distribution, with per-intervention effort estimates (CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h), human sequential total, and a note that actual remediation effort is tracked by the feature delivery pipeline.
   - Assessment phase subtotal (estimated vs actual wall-clock).
   - Grand total marked "partial — remediation actuals tracked separately."
4. Phase 4 (`intervention-documentation-standard`) runs. On completion, its row is appended to the file with actuals filled in.
5. At the end of Phase 4 — after the Interventions Index is complete — `assessment-manager` finalises the assessment-phase actuals section with the `intervention-documentation-standard` row and updates the assessment subtotal.
6. The Remediation Gate (Phase 5) presents findings to the user. The gate display includes the `{PREFIX}-Effort-Estimate.md` remediation section summary (intervention count by severity, total estimated remediation hours) alongside the Interventions Index.
7. The user reviews and selects which interventions to pursue. The gate records the decision in `{PREFIX}-Approvals.md`. No code changes are triggered — approved interventions are candidates for the feature delivery pipeline.
8. The pipeline ends at the gate. No further updates to `{PREFIX}-Effort-Estimate.md` occur after Phase 5; the file is complete as written in steps 3–5.

## Out of Scope

- Remediation agent effort tracking — the assessment pipeline does not execute remediation; each approved intervention is implemented via `/implement-feature`, which has its own effort-estimation procedure (`docs/procedures/effort-estimation.md`).
- Phases 6 and 7 of `assessment-manager` as currently written (remediation implementation and PR creation) — these are architecturally out of scope for the assessment pipeline and should be removed or moved to a separate agent.
- Historical trend analysis across multiple assessment runs (e.g., comparing ASSESS-001 vs ASSESS-002 accuracy) — deferred to a future iteration.
- Machine-readable output (JSON/CSV export) — deferred.
- Per-agent complexity ratings beyond severity-based flat rates — the assessment pipeline has no task-level complexity tagging equivalent to the feature pipeline's simple/medium/complex scale.
- Token estimation — covered by FTR-001; this feature tracks wall-clock time only.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| An assessment agent produces no timestamp in the process log | Write "N/A" for actual duration for that row; exclude it from accuracy stats. Log a warning in the process log. |
| User aborts the pipeline after Phase 3 but before Phase 4 completes | The Effort Estimate file exists with assessment agent rows; the `intervention-documentation-standard` row is absent. File is left as-is (partial). |
| The Interventions Index contains zero interventions (no findings) | The remediation section shows 0 interventions across all severities; remediation estimated hours = 0h; a note is added that no remediation is required. |
| User selects "Assessment only" at the gate | The file is complete as written in phases 3–4. The gate display still shows the remediation effort summary section (so the user has the data), but no `{PREFIX}-Approvals.md` approval record is written for any intervention. |
| `assessment-manager` is invoked with `--scope` limiting assessment agents | The effort estimate file includes only the agents that actually ran; the remediation section is based on findings from those agents only. A note records the scope filter applied. |
| Two assessment agent invocations overlap in timestamp (parallel execution) | Actual duration per agent = elapsed time of that agent's own invocation window; it is NOT the wall-clock window of the whole parallel batch. The phase subtotal uses the batch's wall-clock window (max end − min start). |
| A single assessment agent fails and produces no output | That agent's row shows "N/A" for actual duration; it is excluded from the subtotal. The assessment continues with the remaining agents (partial assessment). |

## Data Model

### Entities

**Effort Estimate File** (`{PREFIX}-Effort-Estimate.md`)
- Location: `docs/assessments/{PREFIX}/` (same directory as all other assessment output files)
- One file per assessment run
- Written at end of Phase 3; finalised at end of Phase 4

**Assessment agent row** (one per agent that ran in Phase 3, plus one for `intervention-documentation-standard` added at end of Phase 4):

| Field | Type | Notes |
|-------|------|-------|
| agent | string | Agent name from frontmatter |
| est_duration | string | Estimated elapsed time (e.g., "~15min"); derived from codebase size heuristic or prior-run baseline if available; otherwise "N/A" for first run |
| actual_duration | string | Elapsed time from process log timestamps (e.g., "12min"); "N/A" if timestamps missing |
| delta | string | actual − estimated; negative = faster; "N/A" if either is missing |
| status | string | "complete" or "N/A" |

**Remediation estimate section** (written at end of Phase 4, after Interventions Index exists):

| Field | Type | Notes |
|-------|------|-------|
| severity | string | CRITICAL / HIGH / MEDIUM / LOW |
| count | integer | Number of interventions at this severity |
| rate | string | Flat rate per intervention: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h |
| subtotal | string | count × rate (e.g., "16h") |

Plus:
- Human sequential total (sum of all subtotals)
- Note: "Actual remediation effort tracked by feature delivery pipeline per intervention."

**Assessment phase subtotal**:
- Estimated total (sum of est_duration where available)
- Actual total (wall-clock of Phase 3 batch + Phase 4 elapsed)
- Delta

### Validation Rules

| Field | Rule |
|-------|------|
| actual_duration | Derived from process log timestamps; rounded to the nearest minute |
| est_duration | "N/A" is valid on the first run for an assessment configuration; subsequent runs may use prior actuals as baseline |
| delta | Negative = faster than estimated; positive = slower; "N/A" if either input is missing |
| remediation rate | Fixed: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h — not configurable in MVP |
| severity count | Must match the count in `{PREFIX}-Interventions-Index.md`; mismatch is a data error — log a warning |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| assessment-manager (agent) | Create and update the Effort Estimate file during Phase 3 and Phase 4 |
| Human user / Tech Lead | Read-only; views the remediation estimate summary at the gate |
| assess-codebase skill | No writes to this file (contrast with FTR-001) |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A full assessment pipeline run completes through Phase 4 | `intervention-documentation-standard` finishes | `{PREFIX}-Effort-Estimate.md` exists in `docs/assessments/{PREFIX}/` and contains a row for every assessment agent that ran (with actual durations from the process log) plus the `intervention-documentation-standard` row | Must |
| AC-02 | The Interventions Index contains N interventions across CRITICAL / HIGH / MEDIUM / LOW | The file is finalised at end of Phase 4 | The remediation section shows the correct per-severity count, per-severity subtotal, and human sequential total using the fixed rates | Must |
| AC-03 | The Remediation Gate is presented to the user | The gate display is shown | The gate includes the remediation effort estimate summary (intervention count by severity, total estimated hours) from the Effort Estimate file alongside the Interventions Index link | Must |
| AC-04 | Phase 3 ends (regardless of what happens next) | The file is first written | The file contains assessment agent rows with actual durations (or "N/A"), a "remediation — pending intervention documentation" placeholder for the remediation section, and a partial assessment subtotal | Must |
| AC-05 | An assessment agent produces no process log timestamps | Phase 3 ends and the file is written | That agent's row shows "N/A" for actual duration and delta; it is excluded from the assessment subtotal; a warning is logged in the process log | Must |
| AC-06 | The Interventions Index contains zero findings | Phase 4 ends | The remediation section shows 0 interventions at all severities, remediation estimated hours = 0h, and a note that no remediation is required | Must |
| AC-07 | User selects "Assessment only" at the gate | The pipeline reaches its summary | The Effort Estimate file is complete as-is (assessment actuals filled, remediation estimate section present); no further modifications occur | Must |
| AC-08 | The assessment is run with `--scope` limiting to a subset of agents | Phase 3 ends | The file contains rows only for agents that actually ran; a note records the scope filter | Should |
| AC-09 | A subsequent assessment run is performed on the same codebase | Phase 3 planning begins | Prior-run actuals from a previous `{PREFIX}-Effort-Estimate.md` (if available) are used as the est_duration baseline for the current run's rows | Could |

## MVP vs Deferred

### MVP (must ship)
- Write `{PREFIX}-Effort-Estimate.md` at end of Phase 3 with assessment agent rows (actual durations from process log; est_duration = "N/A" on first run)
- Finalise the file at end of Phase 4 with the `intervention-documentation-standard` row and assessment subtotal
- Remediation estimate section: per-severity counts from the Interventions Index × fixed rates (CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h), human sequential total
- Gate display includes the remediation effort estimate summary alongside the Interventions Index
- Handle missing process log timestamps gracefully (N/A + process log warning)
- Handle zero-finding assessments gracefully (0h remediation estimate)
- Remove or stub out Phases 6 and 7 from `assessment-manager` (remediation implementation and PR creation) — these are out of scope for the assessment pipeline

### Deferred (next iteration)
- Using prior-run actuals as est_duration baseline (AC-09)
- Historical trend analysis across multiple assessment runs
- Machine-readable output (JSON/CSV export)
- Per-agent complexity ratings beyond severity-based flat rates
- Configurable severity-to-effort rate mapping

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should `intervention-documentation-standard` have its own row in the assessment phase subtotal, or should it be listed separately as a "documentation phase"? The current spec puts it in the assessment section, but it runs sequentially after Phase 3. | Affects subtotal grouping and how the gate display labels phases |
| 2 | On the first run (no prior actuals available), should est_duration for assessment agents be left as "N/A" or should there be a static default (e.g., "~15min" per agent)? A static default would make the gate display more useful but risks being misleading. | Affects usefulness of the estimate at the gate on first run |
| 3 | The Interventions Index severity counts drive the remediation estimate. If the user has filtered (`--scope`) and the Interventions Index only reflects a subset of findings, should the remediation estimate carry a prominent disclaimer? | Affects how accurately the gate represents total remediation scope |

## Dependencies and Assumptions
- `docs/procedures/process-log.md` records agent invocation timestamps; this feature depends on those timestamps being present and accurate. It does not change the process log format.
- The assessment output directory (`docs/assessments/{PREFIX}/`) is created by `assessment-manager` before Phase 3 ends; the Effort Estimate file is written into it at that point.
- `{PREFIX}-Interventions-Index.md` is the authoritative source for intervention count and severity distribution; the remediation estimate section is computed from it at end of Phase 4.
- Remediation effort estimation uses fixed flat rates (CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h) — these rates are the same unit (human-hours, sequential) as the feature pipeline's effort-estimation procedure.
- The assessment pipeline ends at the gate; actual remediation effort is tracked by the feature delivery pipeline per intervention (via `docs/procedures/effort-estimation.md`), not by this feature.
- The current `assessment-manager` Phases 6 and 7 (remediation implementation and PR) are architecturally inconsistent with the above. Their removal or relocation is a prerequisite for clean implementation of this feature.
- This feature is additive to FTR-001 (Token Estimation); both files coexist in the same assessment output directory and are independent.
