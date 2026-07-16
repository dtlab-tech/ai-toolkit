# Technical Specification — Assessment Pipeline Effort Estimation

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-002: Assessment Pipeline Effort Estimation |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |

---

## 1. Overview

This feature extends the codebase assessment pipeline to produce and maintain a wall-clock effort summary artifact: `{PREFIX}-Effort-Estimate.md`. The file tracks estimated and actual elapsed time for every agent invoked during an assessment run, and projects remediation effort from the Interventions Index.

**What is being built:**
- Effort tracking (wall-clock duration) for all assessment agents (Phase 3) and the `intervention-documentation-standard` agent (Phase 4)
- A remediation effort estimate section (severity counts × fixed flat rates) derived from `{PREFIX}-Interventions-Index.md`
- Presentation of the remediation effort summary at the Remediation Gate (Phase 5) alongside the Interventions Index
- Removal of Phases 6 and 7 from `assessment-manager.md` (remediation implementation and PR creation are out of scope for the assessment pipeline)

**Which systems are affected:**
- `.claude/agents/assessment-manager.md` — extended to write and update Effort Estimate file; Phases 6 and 7 removed
- `docs/procedures/effort-estimation.md` — referenced for terminology alignment only (no changes to this file)
- `docs/procedures/process-log.md` — read for timestamps; format unchanged

**Integration with existing patterns:**
- FTR-001 introduced `{PREFIX}-Token-Estimate.md` in the same `docs/assessments/{PREFIX}/` directory. FTR-002 adds `{PREFIX}-Effort-Estimate.md` as an independent, parallel artifact. Both files coexist and are written by `assessment-manager`.
- This feature does NOT add a skill-level append step (unlike FTR-001's `assess-codebase` skill step). The file is complete when Phase 5 closes.

---

## 2. Architecture

### 2.1 System Context

The assessment pipeline consists of phases orchestrated by `assessment-manager` (invoked by `assess-codebase` skill):

```
Phase 1: Discovery             ┐
Phase 2: Planning              ├─ assessment-manager planning (no file written)
                               ┘
                       ↓
Phase 3: Run assessment agents in parallel
         → at end: write {PREFIX}-Effort-Estimate.md (Phase 3 agent rows + placeholder)
                       ↓
Phase 4: Run intervention-documentation-standard
         → at end: append row + replace remediation placeholder with estimate
                       ↓
Phase 5: Remediation Gate → display remediation effort summary → user decides
         → {PREFIX}-Effort-Estimate.md is complete and frozen
                       ↓
         Pipeline ends at gate. No Phases 6 or 7.
```

**Effort Estimate file lifecycle:**
1. **Phase 3 (end)**: `assessment-manager` writes file with Phase 3 agent rows (actual durations from process log) and a remediation placeholder.
2. **Phase 4 (end)**: `assessment-manager` appends `intervention-documentation-standard` row and replaces the placeholder with the computed remediation section.
3. **Phase 5 (gate)**: File is displayed to user as part of the gate. No writes.
4. **After Phase 5**: File is frozen. No further modifications.

### 2.2 Component Diagram

```
assess-codebase (skill)
    │
    └─→ assessment-manager (agent)
         │
         ├─ Phase 3: Dispatch assessment agents in parallel
         │    ├─ generic-software-assessment
         │    ├─ layered-architecture-assessment
         │    ├─ concurrency-safety-assessment
         │    └─ ... (other assessment agents)
         │
         ├─→ Writes: {PREFIX}-Effort-Estimate.md (initial, Phase 3 end)
         │    └─ Assessment phase table: one row per Phase 3 agent
         │    └─ Remediation section: placeholder
         │    └─ Assessment subtotal: partial (Phase 3 only)
         │
         ├─ Phase 4: Dispatch intervention-documentation-standard
         │    └─→ Updates {PREFIX}-Effort-Estimate.md (Phase 4 end):
         │         ├─ Appends intervention-documentation-standard row
         │         ├─ Replaces placeholder with remediation section
         │         └─ Updates assessment subtotal (includes Phase 4 row)
         │
         └─ Phase 5: Remediation Gate
              └─ Reads remediation section from {PREFIX}-Effort-Estimate.md
              └─ Displays summary to user
              └─ File is FROZEN after this point
```

### 2.3 Sequence Diagram

```
Phase 3: Assessment Agents
─────────────────────────────────────────────────────────────────
assessment-manager → spawn 3–7 assessment agents in parallel
  (each agent runs with: codebase path, prefix, output dir)
  (process log records START and END timestamps per agent)

[all assessment agents complete]

assessment-manager: read process log timestamps for each Phase 3 agent
  → compute actual_duration per agent (end − start, rounded to nearest minute)
  → est_duration = "N/A" on first run
  → delta = "N/A" (est is N/A)
  → batch wall-clock = max(end_times) − min(start_times)
assessment-manager: write {PREFIX}-Effort-Estimate.md
  ├─ Section: "Assessment phase" table
  │    (one row per agent: agent | est_duration | actual_duration | delta | status)
  │    (if agent has no timestamps: actual_duration="N/A", delta="N/A", excluded from subtotal)
  ├─ Section: "Remediation effort" — placeholder: "Pending intervention documentation"
  └─ Section: "Assessment phase subtotal" (Phase 3 actual = batch wall-clock)

Phase 4: Intervention Documentation
─────────────────────────────────────────────────────────────────
assessment-manager → spawn: intervention-documentation-standard
  (process log records START and END timestamps)

[intervention-documentation-standard completes]

assessment-manager: read process log timestamps for intervention agent
  → compute actual_duration
assessment-manager: read {PREFIX}-Interventions-Index.md
  → extract intervention counts by severity: CRITICAL=X, HIGH=Y, MEDIUM=Z, LOW=W
  → compute per-severity subtotals: CRITICAL × 8h, HIGH × 4h, MEDIUM × 2h, LOW × 1h
  → compute human sequential total

assessment-manager: update {PREFIX}-Effort-Estimate.md
  → append intervention-documentation-standard row to assessment phase table
  → replace remediation placeholder with full remediation section
  → update assessment phase subtotal (add Phase 4 row actual_duration to wall-clock total)

Phase 5: Remediation Gate
─────────────────────────────────────────────────────────────────
assessment-manager: read remediation section from {PREFIX}-Effort-Estimate.md
assessment-manager: present gate to user, including:
  ├─ Interventions Index link ({PREFIX}-Interventions-Index.md)
  └─ Remediation effort summary:
       Per-severity counts and estimated hours
       Human sequential total
       Note: "Actual remediation tracked by feature delivery pipeline"

[user makes selection]
  → {PREFIX}-Approvals.md updated
  → Pipeline ends. {PREFIX}-Effort-Estimate.md frozen.
```

---

## 3. Implementation (Agent & Procedure Changes)

### 3.1 Assessment Manager — Phase 3 Additions

**File:** `.claude/agents/assessment-manager.md`

After all Phase 3 assessment agents complete, before moving to Phase 4, insert the following steps:

**Step 1 — Read process log timestamps.**

For each completed Phase 3 assessment agent:
- Scan `{PREFIX}-process-log.txt` for lines matching:
  - `Agent START: {agent_name}` → extract start timestamp
  - `Agent DONE: {agent_name}` → extract end timestamp
- If both timestamps are present:
  - Compute `actual_duration = end_timestamp − start_timestamp`, rounded to the nearest minute
  - Express as `"Xmin"` or `"Xh Ymin"` (e.g., `"12min"`, `"1h 5min"`)
- If start or end timestamp is missing: set `actual_duration = "N/A"`; log warning in process log: `"[agent_name] has no timestamp in the process log; actual duration unavailable"`

For the batch wall-clock:
- `batch_start = minimum of all Phase 3 agent start timestamps`
- `batch_end = maximum of all Phase 3 agent end timestamps`
- `batch_actual = batch_end − batch_start`, rounded to nearest minute

**Step 2 — Compute estimates.**

On the first run (no prior `{PREFIX}-Effort-Estimate.md` exists), set `est_duration = "N/A"` for all agent rows.

On subsequent runs (prior file exists), extract the `actual_duration` from the previous run's rows for each agent and use as the new `est_duration`. If the prior file has `"N/A"` for an agent, continue using `"N/A"` as the estimate.

**Step 3 — Compute delta.**

`delta = actual_duration − est_duration`. If either is `"N/A"`, set `delta = "N/A"`.

For numeric values:
- Express as `"-Xmin"` (faster) or `"+Xmin"` (slower) or `"0min"` (on target)

**Step 4 — Write `{PREFIX}-Effort-Estimate.md`.**

Write to `docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md`. Create the directory if it does not exist.

```markdown
# Effort Estimate — {PREFIX} — Assessment Pipeline

> Wall-clock effort tracking for the assessment pipeline.
> Assessment agent durations: filled at end of Phase 3.
> Intervention documentation duration: filled at end of Phase 4.
> Remediation effort: estimated from Interventions Index at end of Phase 4 using fixed rates.
> Actual remediation effort tracked by feature delivery pipeline per intervention.
> Effort rates: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h (human hours, sequential).

## Assessment phase

| Agent | Est. duration | Actual duration | Delta | Status |
|-------|--------------|-----------------|-------|--------|
| {agent_name} | {est_duration} | {actual_duration} | {delta} | {status} |
... (one row per Phase 3 agent, plus intervention-documentation-standard appended at Phase 4 end)

## Assessment phase subtotal

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Phase 3 assessment batch | {est_batch} | {actual_batch} | {delta_batch} |
| intervention-documentation-standard | {est} | {actual} | {delta} |
| Total | {total_est} | {total_actual} | {total_delta} |

> Note: Phase 3 "Actual" row uses batch wall-clock (max end − min start), not sum of individual durations.
> Individual agent durations are in the assessment phase table above.

## Remediation effort estimate

> Pending intervention documentation completion.
```

**Step 5 — Log the write.**

Append to the process log:
```
[timestamp] Phase 3 end: wrote Effort Estimate file
  Assessment agents: {N} rows ({completed} with actuals, {na_count} with N/A)
  Location: docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md
```

---

### 3.2 Assessment Manager — Phase 4 Update

After `intervention-documentation-standard` completes, insert the following steps:

**Step 1 — Read timestamps and compute duration.**

- Scan `{PREFIX}-process-log.txt` for `Agent START: intervention-documentation-standard` and `Agent DONE: intervention-documentation-standard` timestamps.
- Compute `actual_duration` (same formula as Phase 3 agents).
- If missing: set `actual_duration = "N/A"`; log warning.

**Step 2 — Append intervention-documentation-standard row.**

Open `{PREFIX}-Effort-Estimate.md` and append one row to the "Assessment phase" table:

```
| intervention-documentation-standard | {est_duration} | {actual_duration} | {delta} | complete |
```

Note: `est_duration` follows the same first-run / subsequent-run logic as Phase 3 agents.

**Step 3 — Update assessment phase subtotal.**

Update the "Assessment phase subtotal" table by filling in the `intervention-documentation-standard` row values and the Total row.

**Step 4 — Build remediation section.**

Read `{PREFIX}-Interventions-Index.md` to extract intervention counts by severity. Apply the fixed rates:

| Severity | Rate | Subtotal |
|----------|------|----------|
| CRITICAL | 8h | count × 8h |
| HIGH | 4h | count × 4h |
| MEDIUM | 2h | count × 2h |
| LOW | 1h | count × 1h |

Sum all subtotals for the human sequential total.

**Edge case — zero findings:**
If all counts are 0: human sequential total = 0h. Add note: "No remediation required — zero findings identified."

**Step 5 — Replace placeholder.**

Replace the `> Pending intervention documentation completion.` line in the "Remediation effort estimate" section with the full remediation section:

```markdown
## Remediation effort estimate

> Derived from {PREFIX}-Interventions-Index.md. Rates: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h (human hours, sequential).
> Actual remediation effort tracked by feature delivery pipeline per intervention.

| Severity | Count | Rate | Subtotal |
|----------|-------|------|---------|
| CRITICAL | {count} | 8h | {subtotal} |
| HIGH | {count} | 4h | {subtotal} |
| MEDIUM | {count} | 2h | {subtotal} |
| LOW | {count} | 1h | {subtotal} |
| **Total** | **{total_count}** | — | **{total_hours}h** |

Human sequential total: {total_hours}h
```

If the Interventions Index contains zero findings, add:
```
> Note: No remediation required — zero findings identified.
```

If a scope filter was applied:
```
> Note: Scope filter applied ({scope}). This estimate reflects only {scope} assessment areas.
```

**Step 6 — Validate severity count.**

Assert that `sum(CRITICAL + HIGH + MEDIUM + LOW)` in the remediation section equals the total intervention count in `{PREFIX}-Interventions-Index.md`. If they differ, log a warning: `"Severity count mismatch between Effort Estimate and Interventions Index — check {PREFIX}-Interventions-Index.md"`.

**Step 7 — Log the update.**

```
[timestamp] Phase 4 end: updated Effort Estimate with intervention-documentation-standard row
  Actual duration: {X}min
[timestamp] Phase 4 end: populated remediation effort section
  CRITICAL: {N}, HIGH: {N}, MEDIUM: {N}, LOW: {N}
  Human sequential total: {X}h
  Location: docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md
```

---

### 3.3 Assessment Manager — Phase 5 Gate Update

**File:** `.claude/agents/assessment-manager.md` — Phase 5 (Remediation Gate)

**Before presenting the gate**, read the remediation section from `{PREFIX}-Effort-Estimate.md` and include a summary in the gate display:

```
Remediation Effort Estimate (from {PREFIX}-Effort-Estimate.md)
─────────────────────────────────────────────────────────────
  CRITICAL: {N} × 8h = {Xh}
  HIGH:     {N} × 4h = {Xh}
  MEDIUM:   {N} × 2h = {Xh}
  LOW:      {N} × 1h = {Xh}
  Total estimated (human sequential): {Xh}
─────────────────────────────────────────────────────────────
Interventions Index: {PREFIX}-Interventions-Index.md
```

No writes to the Effort Estimate file during Phase 5.

---

### 3.4 Assessment Manager — Remove Phases 6 and 7

**File:** `.claude/agents/assessment-manager.md`

Remove or replace Phase 6 (Remediation Implementation) and Phase 7 (Pull Request) from the agent definition. The assessment pipeline ends at Phase 5 (the Remediation Gate).

Replace with a clear end-of-pipeline summary (Phase 6 → Summary):

```markdown
## Phase 6 — Summary

Report:

```
Assessment Manager — Run Summary
─────────────────────────────────────────────────────
Target: {codebase path}  |  Prefix: {PREFIX}
─────────────────────────────────────────────────────
Assessment:
  ✅ {agent_1}    → {PREFIX}-{output}.md
  ✅ {agent_2}    → {PREFIX}-{output}.md
  ...
─────────────────────────────────────────────────────
Findings:      N CRITICAL | N HIGH | N MEDIUM | N LOW
Interventions: N proposed
─────────────────────────────────────────────────────
Effort Estimate: {PREFIX}-Effort-Estimate.md
Token Estimate:  {PREFIX}-Token-Estimate.md
Process log:     docs/assessments/{PREFIX}/{PREFIX}-process-log.txt
─────────────────────────────────────────────────────
Remediation gate complete. Approved interventions are
candidates for the feature delivery pipeline (/implement-feature).
─────────────────────────────────────────────────────
```
```

---

### 3.5 Data Model — Effort Estimate File

**File location:** `docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md`

**File format:** Markdown with tables, built in two phases.

**Sections (in order):**

1. **Header** — file description, rates legend.
2. **Assessment phase table** — one row per Phase 3 agent (written at Phase 3 end); `intervention-documentation-standard` row appended at Phase 4 end.
3. **Assessment phase subtotal** — Phase 3 batch wall-clock + Phase 4 elapsed + total.
4. **Remediation effort estimate** — placeholder at Phase 3 write; replaced with full section at Phase 4 end.

**Full example (after Phase 4 finalisation):**

```markdown
# Effort Estimate — ASSESS-001 — Assessment Pipeline

> Wall-clock effort tracking for the assessment pipeline.
> Assessment agent durations: filled at end of Phase 3.
> Intervention documentation duration: filled at end of Phase 4.
> Remediation effort: estimated from Interventions Index at end of Phase 4 using fixed rates.
> Actual remediation effort tracked by feature delivery pipeline per intervention.
> Effort rates: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h (human hours, sequential).

## Assessment phase

| Agent | Est. duration | Actual duration | Delta | Status |
|-------|--------------|-----------------|-------|--------|
| generic-software-assessment | N/A | 18min | N/A | complete |
| layered-architecture-assessment | N/A | 14min | N/A | complete |
| concurrency-safety-assessment | N/A | 11min | N/A | complete |
| intervention-documentation-standard | N/A | 22min | N/A | complete |

## Assessment phase subtotal

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Phase 3 assessment batch | N/A | 20min | N/A |
| intervention-documentation-standard | N/A | 22min | N/A |
| Total | N/A | 42min | N/A |

> Note: Phase 3 "Actual" row uses batch wall-clock (max end − min start), not sum of individual durations.
> Individual agent durations are in the assessment phase table above.

## Remediation effort estimate

> Derived from ASSESS-001-Interventions-Index.md. Rates: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h (human hours, sequential).
> Actual remediation effort tracked by feature delivery pipeline per intervention.

| Severity | Count | Rate | Subtotal |
|----------|-------|------|---------|
| CRITICAL | 1 | 8h | 8h |
| HIGH | 3 | 4h | 12h |
| MEDIUM | 5 | 2h | 10h |
| LOW | 2 | 1h | 2h |
| **Total** | **11** | — | **32h** |

Human sequential total: 32h
```

---

### 3.6 Process Logging

New log entries added by this feature (in `{PREFIX}-process-log.txt`):

```
[2026-07-15 09:31:00] Phase 3 end: wrote Effort Estimate file
  Assessment agents: 3 rows (3 with actuals, 0 with N/A)
  Location: docs/assessments/ASSESS-001/ASSESS-001-Effort-Estimate.md

[2026-07-15 09:31:00] generic-software-assessment has no timestamp in the process log; actual duration unavailable

[2026-07-15 09:45:22] Phase 4 end: updated Effort Estimate with intervention-documentation-standard row
  Actual duration: 22min

[2026-07-15 09:45:22] Phase 4 end: populated remediation effort section
  CRITICAL: 1, HIGH: 3, MEDIUM: 5, LOW: 2
  Human sequential total: 32h
  Location: docs/assessments/ASSESS-001/ASSESS-001-Effort-Estimate.md

[2026-07-15 09:45:22] WARNING: Severity count mismatch between Effort Estimate and Interventions Index — check ASSESS-001-Interventions-Index.md
```

---

### 3.7 Error Handling

| Scenario | Behavior |
|----------|----------|
| Agent has no process log timestamps | Write `"N/A"` for actual_duration; exclude from subtotal; log warning |
| Assessment output directory does not exist | Create it before writing |
| File I/O write fails | Log error; continue pipeline (file write failure does not halt assessment) |
| Interventions Index missing at Phase 4 | Log warning; write remediation section as: "Interventions Index not found — remediation estimate unavailable" |
| Severity count mismatch | Log warning; write the counts from the Interventions Index (authoritative source) |
| Zero findings in Interventions Index | Write remediation section with 0h; add note "No remediation required" |

---

## 4. File Inventory

### New files

None — this feature adds new sections to an existing agent and writes a new markdown artifact at runtime (not a source file).

### Modified files

| Path | Change description |
|------|-------------------|
| `.claude/agents/assessment-manager.md` | Phase 3: add Effort Estimate file write (Steps 1–5 in §3.1). Phase 4: add row append + remediation section (Steps 1–7 in §3.2). Phase 5: add remediation summary to gate display (§3.3). Remove Phase 6 (remediation implementation) and Phase 7 (PR creation); replace with Phase 6 Summary (§3.4). |

### Runtime artifacts (written by agent during execution)

| Path | Description |
|------|-------------|
| `docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md` | Effort estimate artifact; written at Phase 3 end, finalised at Phase 4 end |

---

## 5. External Integrations

| File | Usage | Error handling |
|------|-------|----------------|
| `{PREFIX}-process-log.txt` | Read for agent start/end timestamps to compute actual durations | If timestamps missing: write `"N/A"`, log warning, continue |
| `{PREFIX}-Interventions-Index.md` | Read at Phase 4 end to extract severity counts | If missing: write remediation placeholder note, log warning, continue |
| `docs/procedures/effort-estimation.md` | Referenced for terminology alignment (human estimate unit definitions) | No interaction — read-only conceptual reference |

---

## 6. Security Considerations

**No sensitive data handling:**
- Duration metrics and effort estimates are technical metrics, not secrets.
- File written to `docs/assessments/{PREFIX}/` alongside other assessment outputs.
- No authentication or authorization required.

**Data integrity:**
- Duration values are derived from process log timestamps (authoritative source).
- Severity counts are derived from Interventions Index (authoritative source).
- Mismatch between the two is detected and logged as a warning.

---

## 7. Database Changes

None — this feature is markdown artifact generation only.

---

## 8. Configuration

### Environment variables

None required.

### Feature flags

None. Feature is always enabled once the agent is updated.

---

## 9. Implementation Order

Dependency-aware sequence:

1. **Update `.claude/agents/assessment-manager.md` — Phase 3 section** (§3.1)
   - Add steps to read process log timestamps for Phase 3 agents
   - Compute actual durations, estimates (N/A on first run), deltas
   - Write `{PREFIX}-Effort-Estimate.md` (assessment phase table, placeholder, subtotal)
   - Add process log entries
   - Depends on: nothing (uses existing process log format)

2. **Update `.claude/agents/assessment-manager.md` — Phase 4 section** (§3.2)
   - Add steps to append `intervention-documentation-standard` row
   - Build and insert remediation section from Interventions Index
   - Update assessment phase subtotal
   - Add process log entries
   - Depends on: Step 1 (file must exist from Phase 3 write)

3. **Update `.claude/agents/assessment-manager.md` — Phase 5 gate display** (§3.3)
   - Read remediation section from Effort Estimate file
   - Add remediation effort summary to gate display
   - Depends on: Step 2 (remediation section must be finalised)

4. **Update `.claude/agents/assessment-manager.md` — Remove Phases 6 and 7** (§3.4)
   - Remove Phase 6 (remediation implementation) and Phase 7 (PR creation)
   - Replace with Phase 6 Summary (end-of-pipeline report)
   - Depends on: Steps 1–3 (all new content must be in place before old phases are removed)

---

## 10. Testing Strategy

### Unit test scenarios

1. **Phase 3 write — nominal case:**
   - Process log has start/end timestamps for all Phase 3 agents
   - Verify: file written with correct rows, actual_duration computed, status="complete"
   - Verify: assessment phase subtotal uses batch wall-clock, not sum of durations

2. **Phase 3 write — missing timestamps:**
   - One agent has no timestamps in process log
   - Verify: that agent's row has actual_duration="N/A", delta="N/A"
   - Verify: warning logged
   - Verify: that row excluded from assessment subtotal

3. **Phase 4 update — remediation section with findings:**
   - Interventions Index has 1 CRITICAL, 3 HIGH, 5 MEDIUM, 2 LOW
   - Verify: remediation section shows correct subtotals (8h, 12h, 10h, 2h) and total (32h)

4. **Phase 4 update — zero findings:**
   - Interventions Index has 0 interventions at all severities
   - Verify: remediation section shows 0h and note "No remediation required"

5. **Phase 4 update — missing Interventions Index:**
   - File does not exist
   - Verify: remediation section replaced with warning note
   - Verify: warning logged
   - Verify: pipeline continues

6. **Phase 5 gate display:**
   - Verify: gate shows remediation effort summary (severity counts and totals)
   - Verify: gate shows Interventions Index link

7. **Scope filter:**
   - `--scope=security` passed
   - Verify: file has rows only for security-scope agents
   - Verify: scope filter note appended

### Manual verification steps

1. Run a mock `assess-codebase` pipeline.
2. After Phase 3: open `{PREFIX}-Effort-Estimate.md` and verify Phase 3 agent rows with actual durations.
3. After Phase 4: verify intervention row appended, remediation section filled.
4. At Phase 5 gate: verify remediation summary is displayed.
5. After pipeline: verify file is frozen (no further changes).
6. Verify process log entries for all write events.

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Process log timestamps are missing or malformed | Actual durations show "N/A"; subtotals incomplete | Graceful handling: write "N/A", exclude from subtotals, log warning. Pipeline continues. |
| Interventions Index is missing at Phase 4 | Remediation section cannot be computed | Write warning note in remediation section; log warning; pipeline continues. |
| Severity count mismatch between Interventions Index and remediation section | Inaccurate remediation estimate | Log warning; use Interventions Index counts (authoritative). |
| Phase 3 agents run with varying parallelism | Batch wall-clock calculation may not reflect sequential runs | Implementation uses max(end) − min(start) regardless of parallelism level. |
| File I/O failure when writing | Effort Estimate file is not created | Log error; pipeline continues without the file (not a hard stop). |
| Assessment manager Phases 6/7 removal breaks existing integrations | assess-codebase skill or tests break | Verify assess-codebase SKILL.md does not invoke Phase 6/7 logic from assessment-manager directly. Update skill if needed. |

---

## 12. Dependencies & Assumptions

### External dependencies

- **`{PREFIX}-process-log.txt`**: Contains agent start/end timestamps. This file is maintained by `assessment-manager` during the run; format defined in `docs/procedures/process-log.md`.
- **`{PREFIX}-Interventions-Index.md`**: Authoritative source for intervention count by severity. Written by `intervention-documentation-standard` at Phase 4 completion.

### Assumptions

- **FTR-001 is already merged**: Both files coexist. The assessment-manager already writes `{PREFIX}-Token-Estimate.md`; this feature adds `{PREFIX}-Effort-Estimate.md` as a parallel artifact.
- **Process log timestamps exist and are accurate**: The process log already records `Agent START:` and `Agent DONE:` entries. This feature reads them; it does not add new timestamp format requirements.
- **Fixed rates are stable**: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h. Not configurable in MVP.
- **assess-codebase skill requires no changes**: No skill-level append step (unlike FTR-001). The skill invokes `assessment-manager` and waits; effort file is complete when the agent returns.
- **Single-writer model**: Only one instance of `assess-codebase` runs per PREFIX at a time. No file locking needed.
