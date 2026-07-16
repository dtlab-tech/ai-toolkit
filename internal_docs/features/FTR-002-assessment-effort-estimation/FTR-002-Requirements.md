# Functional Requirements — Assessment Pipeline Effort Estimation

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-002: Assessment Pipeline Effort Estimation |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Purpose

This requirements document specifies the functional behavior of the Assessment Pipeline Effort Estimation feature, which extends the assessment pipeline to produce a structured wall-clock effort summary artifact (`{PREFIX}-Effort-Estimate.md`). The document serves as the authoritative specification for implementation, testing, and stakeholder review.

### 1.2 Scope

**In Scope:**
- Wall-clock effort tracking for all assessment agents invoked during an `assess-codebase` run
- Writing `{PREFIX}-Effort-Estimate.md` at the end of Phase 3 of the assessment pipeline
- Finalising the file at the end of Phase 4 with the `intervention-documentation-standard` row
- Remediation effort estimation section derived from the Interventions Index (severity counts × fixed flat rates)
- Presenting the remediation effort summary at the Remediation Gate (Phase 5) alongside the Interventions Index
- Graceful handling of missing process log timestamps (N/A rows, process log warning)
- Graceful handling of zero-finding assessments (0h remediation estimate, appropriate note)
- Removing or stubbing out Phases 6 and 7 from `assessment-manager` (remediation implementation and PR creation are architecturally out of scope for the assessment pipeline)

**Out of Scope:**
- Remediation agent effort tracking — approved interventions are implemented via `/implement-feature`, which uses `docs/procedures/effort-estimation.md`
- Historical trend analysis across multiple assessment runs
- Machine-readable output (JSON/CSV export)
- Per-agent complexity ratings beyond severity-based flat rates
- Token estimation — covered by FTR-001; this feature tracks wall-clock time only
- Configurable severity-to-effort rate mapping (fixed rates in MVP: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Tech Lead / Project Manager | Reviews the Effort Estimate file at the Remediation Gate to inform sprint planning; reads actuals post-run to compare assessment duration trends. Read-only consumer. |
| Assessment Manager (orchestrator agent) | Writes the Effort Estimate file at end of Phase 3; appends the `intervention-documentation-standard` row and finalises the remediation section at end of Phase 4. |
| assess-codebase skill | No writes to this file (contrast with FTR-001 Token Estimation where the skill appends the orchestrator row). |

---

## 2. Use Cases

### UC-01: Write Effort Estimate File at Phase 3 Completion

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | All Phase 3 assessment agents have completed. Assessment output directory (`docs/assessments/{PREFIX}/`) exists. Process log has been updated with agent start/end timestamps. |
| Trigger | Assessment Manager receives completion of all Phase 3 assessment agents. |
| Priority | Must |

**Main flow:**
1. Assessment Manager reads start and end timestamps for each Phase 3 agent invocation from the process log.
2. For each assessment agent: compute actual duration (end timestamp − start timestamp); round to nearest minute.
3. For the first run (no prior Effort Estimate file for this PREFIX), set `est_duration = "N/A"` for all rows.
4. For each agent: compute `delta = actual_duration − est_duration`; set `delta = "N/A"` if either input is missing.
5. Assessment Manager constructs the Effort Estimate file with:
   - One row per assessment agent (Phase 3) with fields: agent, est_duration, actual_duration, delta, status.
   - A "Remediation effort — pending intervention documentation" placeholder section.
   - An assessment phase subtotal row (estimated total and actual total).
6. Assessment Manager writes the file to `docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md`.
7. Assessment Manager logs the write to the process log.

**Alternative flows:**
- If a Phase 3 agent has no start or end timestamp in the process log: set `actual_duration = "N/A"` and `delta = "N/A"` for that row; log a warning; exclude the row from the assessment subtotal.
- If `--scope` was applied: include only agents that actually ran; append a note to the file recording the scope filter.

**Error flows:**
- If the assessment output directory does not exist: Assessment Manager creates it before writing.

**Postconditions:**
- `{PREFIX}-Effort-Estimate.md` exists in `docs/assessments/{PREFIX}/` with Phase 3 agent rows filled in.
- Remediation section contains a placeholder noting intervention documentation is pending.
- Phase 3 assessment agent rows are final and will not be re-written.

---

### UC-02: Finalise Effort Estimate at Phase 4 Completion

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | `{PREFIX}-Effort-Estimate.md` was written at end of Phase 3. `intervention-documentation-standard` has completed and its timestamps are in the process log. `{PREFIX}-Interventions-Index.md` exists. |
| Trigger | Assessment Manager receives completion of the `intervention-documentation-standard` agent. |
| Priority | Must |

**Main flow:**
1. Assessment Manager reads start and end timestamps for the `intervention-documentation-standard` invocation from the process log.
2. Computes actual duration; rounds to nearest minute.
3. Assessment Manager opens `{PREFIX}-Effort-Estimate.md` and appends the `intervention-documentation-standard` row to the assessment phase table.
4. Assessment Manager reads `{PREFIX}-Interventions-Index.md` to obtain intervention count by severity (CRITICAL, HIGH, MEDIUM, LOW).
5. Validates that the total severity count from `{PREFIX}-Interventions-Index.md` matches the sum in the remediation section; logs a warning if they differ.
6. Assessment Manager replaces the "Remediation effort — pending intervention documentation" placeholder with the full remediation section:
   - Per-severity row: severity, count, rate (flat), subtotal.
   - Human sequential total (sum of all per-severity subtotals).
   - Note: "Actual remediation effort tracked by feature delivery pipeline per intervention."
7. Assessment Manager updates the assessment phase subtotal to include the `intervention-documentation-standard` row.
8. Assessment Manager logs the update to the process log.

**Alternative flows:**
- If `intervention-documentation-standard` has no timestamps: set `actual_duration = "N/A"` for that row; log warning; exclude from subtotal.
- If Interventions Index contains zero findings: the remediation section shows 0 interventions across all severities, remediation estimated hours = 0h, and a note that no remediation is required.

**Postconditions:**
- `{PREFIX}-Effort-Estimate.md` is complete with Phase 3 rows, Phase 4 row, and remediation estimate section.
- File is ready for display at the Remediation Gate.

---

### UC-03: Display Effort Summary at Remediation Gate

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | `{PREFIX}-Effort-Estimate.md` has been finalised (after Phase 4). Remediation Gate (Phase 5) is being presented to the user. |
| Trigger | Assessment Manager presents the Phase 5 Remediation Gate to the user. |
| Priority | Must |

**Main flow:**
1. Assessment Manager reads the remediation section from `{PREFIX}-Effort-Estimate.md`.
2. Gate display includes:
   - Interventions Index link.
   - Remediation effort estimate summary: intervention count by severity, estimated hours per severity, human sequential total.
3. User reviews the gate and makes a selection (approved interventions, assessment-only, etc.).
4. Gate records the decision in `{PREFIX}-Approvals.md`.

**Postconditions:**
- No further modifications to `{PREFIX}-Effort-Estimate.md` occur after Phase 5.
- The file is complete as written in Phases 3–4.

---

### UC-04: Handle Missing Process Log Timestamps

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | Assessment Manager attempts to compute actual duration for a Phase 3 or Phase 4 agent. The process log does not contain a start or end timestamp for that agent. |
| Trigger | Assessment Manager reads the process log and finds missing timestamps. |
| Priority | Must |

**Main flow:**
1. Assessment Manager detects missing start or end timestamp for the agent.
2. Assessment Manager writes `"N/A"` for `actual_duration` and `delta` in that agent's row.
3. Assessment Manager logs a warning: `"[agent name] has no timestamp in the process log; actual duration unavailable"`.
4. Assessment Manager excludes that row from the assessment phase subtotal.
5. Agent's status remains `"complete"` (the agent did complete; data capture was the issue).

**Postconditions:**
- Agent row exists with `"N/A"` actual duration; does not skew subtotals or averages.

---

### UC-05: Handle Zero-Finding Assessment

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | All Phase 3 assessment agents completed and Phase 4 ran, but `{PREFIX}-Interventions-Index.md` contains zero interventions. |
| Trigger | Assessment Manager reads the Interventions Index at Phase 4 end and finds no findings. |
| Priority | Must |

**Main flow:**
1. Assessment Manager constructs the remediation section with zero counts for all severities.
2. Human sequential total = 0h.
3. Assessment Manager adds a note: "No remediation required — zero findings identified."
4. File is written normally.

**Postconditions:**
- Remediation section shows 0h estimated; note indicates no remediation is required.

---

### UC-06: Scope-Filtered Assessment Run

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | `assess-codebase` was invoked with `--scope` limiting which assessment agents run. |
| Trigger | Phase 3 ends with only a subset of agents having run. |
| Priority | Should |

**Main flow:**
1. Assessment Manager writes the Effort Estimate file with rows only for agents that actually ran.
2. A note is appended: "Scope filter applied: {scope values}. Only agents covering these areas ran."
3. Remediation estimate is based on findings from those agents only.

**Postconditions:**
- Effort Estimate file reflects only the agents in scope; scope filter is noted.

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | `actual_duration` is derived exclusively from process log timestamps (end − start), rounded to the nearest minute. | UC-01, UC-02, UC-04 |
| BR-02 | `est_duration` is `"N/A"` on the first run for a given assessment configuration; subsequent runs may use prior-run actuals from a previous `{PREFIX}-Effort-Estimate.md` as the baseline. | UC-01 |
| BR-03 | `delta = actual_duration − est_duration`. Negative = faster than estimated; positive = slower. `"N/A"` if either input is missing. | UC-01, UC-02 |
| BR-04 | If an assessment agent produces no timestamps in the process log, its row shows `"N/A"` for `actual_duration` and `delta`; it is excluded from the assessment subtotal; a warning is logged. | UC-04 |
| BR-05 | Remediation effort rates are fixed: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h. These are human-hours, sequential. | UC-02 |
| BR-06 | The severity counts in the remediation section must match the Interventions Index totals. A mismatch is a data error — log a warning. | UC-02 |
| BR-07 | Phase 3 assessment agent rows are written at end of Phase 3 and are never re-written. | UC-01 |
| BR-08 | The `intervention-documentation-standard` row is written at end of Phase 4 and is never re-written. | UC-02 |
| BR-09 | The assessment phase subtotal includes Phase 3 agent rows (excluding N/A rows) and the `intervention-documentation-standard` row (excluding N/A). | UC-02 |
| BR-10 | No further modifications to `{PREFIX}-Effort-Estimate.md` occur after Phase 5 (the Remediation Gate). | UC-03 |
| BR-11 | The `assess-codebase` skill makes no writes to `{PREFIX}-Effort-Estimate.md` (unlike FTR-001 token estimation). | UC-03 |
| BR-12 | The assessment pipeline ends at the gate; actual remediation effort is tracked by the feature delivery pipeline per intervention. | UC-03 |
| BR-13 | The phase subtotal actual total uses the batch's wall-clock window (max end − min start) for parallel Phase 3 agents, not the sum of individual agent durations. | UC-01 |
| BR-14 | For individual agent rows, `actual_duration` is the elapsed time of that agent's own invocation window (not the batch window). | UC-01 |

---

## 4. Data Requirements

### 4.1 Entities

**Effort Estimate File** (`{PREFIX}-Effort-Estimate.md`)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| location | file path | Fixed | `docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md` |
| written_at | phase | Fixed | End of Phase 3 (first write); updated at end of Phase 4 |
| format | markdown | Fixed | Markdown tables |

**Assessment Agent Row** (one per Phase 3 agent + one for `intervention-documentation-standard`)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | Non-empty | Agent name from frontmatter |
| est_duration | string | Non-empty | e.g., `"~15min"` or `"N/A"` on first run |
| actual_duration | string | Non-empty | e.g., `"12min"` or `"N/A"` if timestamps missing |
| delta | string | Non-empty | e.g., `"-3min"` or `"N/A"` if either is missing |
| status | string | `"complete"` or `"N/A"` | `"N/A"` if agent did not produce timestamps |

**Remediation Estimate Row** (one per severity level)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| severity | string | CRITICAL, HIGH, MEDIUM, LOW | Severity level |
| count | integer | >= 0 | Number of interventions at this severity |
| rate | string | Fixed: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h | Flat rate per intervention |
| subtotal | string | e.g., `"16h"` | count × rate |

**Assessment Phase Subtotal**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| estimated_total | string | Sum of est_duration where not N/A | e.g., `"~60min"` or `"N/A"` |
| actual_total | string | Wall-clock of Phase 3 batch + Phase 4 elapsed | e.g., `"45min"` |
| delta | string | actual − estimated | e.g., `"-15min"` or `"N/A"` |

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| actual_duration | Derived from process log timestamps; rounded to nearest minute; `"N/A"` if timestamps missing |
| est_duration | `"N/A"` is valid on first run; subsequent runs may use prior actuals as baseline |
| delta | Negative = faster; positive = slower; `"N/A"` if either input is missing |
| remediation rate | Fixed: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h — not configurable in MVP |
| severity count | Must match count in `{PREFIX}-Interventions-Index.md`; mismatch → log warning |
| phase subtotal actual_total | Uses batch wall-clock window (max end − min start), not sum of individual durations |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | Effort Estimate file must be written within 5 seconds of Phase 3 completion. |
| NFR-02 | Reliability | File I/O operations must handle cases where the output directory does not exist (create it). |
| NFR-03 | Usability | File must be human-readable markdown with clear section headers and labeled columns. |
| NFR-04 | Accuracy | Duration values must be computed from process log timestamps with rounding to the nearest minute. |
| NFR-05 | Maintainability | File template and sections must be independent of agent count; new agents do not require schema changes. |
| NFR-06 | Robustness | Missing timestamps must not halt the pipeline; affected rows show `"N/A"` and a warning is logged. |
| NFR-07 | Auditability | Every write and update operation must be logged in the process log with timestamp and scope. |

---

## 6. UI Requirements

### 6.1 Pages / Screens

**Effort Estimate File Display** (markdown document)

| Aspect | Specification |
|--------|---------------|
| Purpose | Present wall-clock effort actuals and remediation estimate to the tech lead. |
| Primary consumer | Tech Lead / Project Manager at the Remediation Gate. |
| Format | Markdown tables with labeled columns. |
| Sections | Assessment phase table, remediation estimate section, assessment phase subtotal. |

**Phase 5 Remediation Gate Dialog**

| Aspect | Specification |
|--------|---------------|
| Purpose | User selects remediation scope or assessment-only. |
| Effort display | Gate display includes the remediation effort estimate summary (intervention count by severity, total estimated hours) from the Effort Estimate file alongside the Interventions Index. |

### 6.2 Navigation Flow

1. Phases 1–2: No Effort Estimate file (not yet written).
2. Phase 3 end: Assessment Manager writes file with Phase 3 assessment agent rows.
3. Phase 4 end: Assessment Manager appends `intervention-documentation-standard` row and replaces remediation placeholder.
4. Phase 5 gate: Effort Estimate remediation section is shown to user alongside Interventions Index.
5. After Phase 5: No further modifications to the file.

```
[Phase 4 completes]
  → Assessment Manager finalises Effort Estimate (intervention row + remediation section)
  → Phase 5 gate is shown to user
       Gate display includes remediation effort summary from Effort Estimate file
  ↓
  User makes selection
       → File is complete; no further modifications
```

---

## 7. Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A full assessment pipeline run completes through Phase 4 | `intervention-documentation-standard` finishes | `{PREFIX}-Effort-Estimate.md` exists in `docs/assessments/{PREFIX}/` and contains a row for every Phase 3 assessment agent that ran (with actual durations from the process log) plus the `intervention-documentation-standard` row | Must |
| AC-02 | The Interventions Index contains N interventions across CRITICAL / HIGH / MEDIUM / LOW | The file is finalised at end of Phase 4 | The remediation section shows the correct per-severity count, per-severity subtotal, and human sequential total using the fixed rates | Must |
| AC-03 | The Remediation Gate is presented to the user | The gate display is shown | The gate includes the remediation effort estimate summary (intervention count by severity, total estimated hours) from the Effort Estimate file alongside the Interventions Index link | Must |
| AC-04 | Phase 3 ends (regardless of what happens next) | The file is first written | The file contains assessment agent rows with actual durations (or "N/A"), a "remediation — pending intervention documentation" placeholder for the remediation section, and a partial assessment subtotal | Must |
| AC-05 | An assessment agent produces no process log timestamps | Phase 3 ends and the file is written | That agent's row shows `"N/A"` for `actual_duration` and `delta`; it is excluded from the assessment subtotal; a warning is logged in the process log | Must |
| AC-06 | The Interventions Index contains zero findings | Phase 4 ends | The remediation section shows 0 interventions at all severities, estimated hours = 0h, and a note that no remediation is required | Must |
| AC-07 | User selects "Assessment only" at the gate | The pipeline reaches its summary | The Effort Estimate file is complete as-is (assessment actuals filled, remediation estimate section present); no further modifications occur | Must |
| AC-08 | The assessment is run with `--scope` limiting to a subset of agents | Phase 3 ends | The file contains rows only for agents that actually ran; a note records the scope filter | Should |
| AC-09 | Phases 6 and 7 of `assessment-manager` (remediation implementation and PR) exist in the current agent definition | Feature is implemented | Phases 6 and 7 are removed or stubbed out from `assessment-manager.md`; the pipeline ends at Phase 5 (Remediation Gate) | Must |

---

## 8. Dependencies & Assumptions

### External Dependencies

- **`docs/procedures/process-log.md`**: Records agent invocation timestamps. This feature depends on those timestamps being present and accurate. Format is not changed by this feature.
- **`{PREFIX}-Interventions-Index.md`**: Authoritative source for intervention count and severity distribution. The remediation estimate section is computed from it at end of Phase 4. If missing at Phase 4, the remediation section shows a warning note.
- **Assessment output directory** (`docs/assessments/{PREFIX}/`): Created by `assessment-manager` before Phase 3 ends; the Effort Estimate file is written into it.

### Assumptions

- **FTR-001 (Token Estimation) is already merged**: FTR-002 is additive. Both `{PREFIX}-Token-Estimate.md` and `{PREFIX}-Effort-Estimate.md` coexist independently in the same directory.
- **Process log timestamps are present and accurate**: This feature does not change the process log format; it reads existing timestamps.
- **Fixed rates are human-hours, sequential**: The remediation estimate uses the same unit as the feature pipeline's effort-estimation procedure.
- **Current `assessment-manager` Phases 6 and 7 must be removed**: They are architecturally inconsistent with the assessment-pipeline-ends-at-gate model. Removal is a prerequisite.
- **assess-codebase skill makes no writes to this file**: Unlike FTR-001, there is no orchestrator row or final-append responsibility for the skill.

---

## 9. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | Should `intervention-documentation-standard` have its own row in the assessment phase subtotal, or be listed separately as a "documentation phase"? | Affects subtotal grouping and gate display labels | **Resolution applied in spec**: `intervention-documentation-standard` row is appended to the assessment phase table; the assessment phase subtotal covers both Phase 3 agents and Phase 4. A separate "documentation phase" section header is not created; Phase 4 is treated as the tail of the assessment phase. |
| 2 | On the first run, should est_duration for assessment agents be left as "N/A" or have a static default? | Affects usefulness of the estimate at the gate on first run | **Deferred to implementation team**: MVP ships with `"N/A"` on first run (per feature.md); a static default could be added in a future iteration. |
| 3 | If `--scope` is applied, should the remediation estimate carry a prominent disclaimer noting it only reflects a partial assessment? | Affects accuracy of the gate's total remediation scope view | **Suggested resolution**: Add a note to the remediation section when scope filter was applied: "Note: scope filter applied — remediation estimate reflects {scope} areas only." Deferred as "Should" per AC-08. |
