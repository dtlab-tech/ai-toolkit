# Functional Requirements — Assessment Token Estimation

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-001: Assessment Token Estimation |
| Version | 1.0 |
| Date | 2026-07-14 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose

This requirements document specifies the functional behavior of the Assessment Token Estimation feature, which extends the assessment pipeline to produce a structured cost summary artifact (`{PREFIX}-Token-Estimate.md`). The document serves as the authoritative specification for implementation, testing, and stakeholder review.

### 1.2 Scope

**In Scope:**
- Token and cost tracking for all assessment agents invoked during an `assess-codebase` run
- Progressive population of the Token Estimate file through Phases 3–7 of the assessment pipeline
- Integration of estimation model parameters from `docs/procedures/token-estimation.md`
- Graceful handling of missing `<usage>` blocks and malformed pricing data
- "Assessment only" path (user selects this at Phase 5 gate)
- Remediation rework cycles (same agent invoked multiple times)
- Appending of orchestrator row and final grand total by `assess-codebase` skill

**Out of Scope:**
- Token tracking for the feature delivery pipeline (`/implement-feature`, `project-manager`)
- Automatic pricing updates from provider APIs
- Dashboard integration, budget gating in CI, or machine-readable exports (JSON/CSV)
- Changes to `process-log.txt` format
- Token estimation for `assessment-manager` orchestrator during the run (only known at end)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Project Manager / Tech Lead | Reviews the Token Estimate file post-run to track cost, justify spend, and improve estimation accuracy. Read-only consumer; may be automated reporting tool in future. |
| Assessment Manager (orchestrator agent) | Orchestrates the assessment pipeline (Phases 1–5). Creates and progressively updates the Token Estimate file at end of Phase 3 and after Phase 4. |
| assess-codebase skill (orchestrator) | High-level skill that drives the entire assessment pipeline. At pipeline completion (after Phase 7), appends orchestrator row and final grand total to the file. |
| Remediation Agents | Run during Phase 6 (after user approval at Phase 5 gate). Each agent's token usage is captured and added to the file as actuals become available. |
| Pipeline Tooling / CI (future) | Potential future consumer that reads the file to feed cost data into dashboards or budget alerts. Out of scope for MVP. |

## 2. Use Cases

### UC-01: Generate and Populate Token Estimate File at Phase 3 Completion

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | All Phase 3 assessment agents have completed and produced `<usage>` blocks (or no blocks). Assessment output directory (`docs/assessments/{PREFIX}/`) exists. |
| Trigger | Assessment Manager receives signal that Phase 3 assessment agents have all completed. |
| Priority | Must |

**Main flow:**
1. Assessment Manager accumulates token usage data from each completed assessment agent's `<usage>` block (input_tokens, output_tokens, model).
2. Assessment Manager retrieves estimation model parameters from `docs/procedures/token-estimation.md` (chars-per-token, system prompt weights, overhead).
3. Assessment Manager retrieves pricing data from `docs/pricing.md` (per-model costs, blended rate formula).
4. For each assessment agent: compute estimated tokens using estimation model; compute estimated cost using blended formula (80/20 input/output split).
5. For each assessment agent: extract actual tokens from `<usage>` block; compute actual cost.
6. Construct Token Estimate file with sections:
   - Header with estimation model parameters
   - "Assessment agents" section: one row per assessment agent with columns [agent, model, est_tokens, est_cost, actual_tokens, actual_cost, status="complete"]
   - "Remediation — pending gate approval" placeholder section with note "No rows yet. Populated after gate approval."
   - "Phase subtotals" (assessment phase only) with rows for total tokens (est, actual) and total cost (est, actual)
   - "Grand total" section marked "partial — updated at pipeline end"
7. Write file to `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md`.

**Alternative flows:**
- If an assessment agent has no `<usage>` block: record "N/A" for actual_tokens and actual_cost in its row; exclude that row from phase subtotals and grand total; log a warning in process log.
- If `docs/pricing.md` is missing or malformed: log a warning; write "N/A" for all cost columns; proceed with token counts.

**Error flows:**
- If assessment output directory does not exist: Assessment Manager creates it before writing the file.
- If `docs/procedures/token-estimation.md` is missing: Assessment Manager logs error and halts file write (estimation model is non-negotiable).

**Postconditions:**
- `{PREFIX}-Token-Estimate.md` exists in `docs/assessments/{PREFIX}/` with assessment agent data, both estimates and actuals.
- "Remediation — pending gate approval" placeholder is present.
- Phase 3 assessment actuals are final and will not be re-written.

---

### UC-02: Update Token Estimate with Intervention Documentation Agent Row

| Field | Value |
|-------|-------|
| Actor | Assessment Manager (agent) |
| Preconditions | Token Estimate file was written at end of Phase 3. Phase 4 (intervention-documentation-standard agent) has completed. |
| Trigger | Assessment Manager receives completion signal from Phase 4 agent with its `<usage>` block. |
| Priority | Must |

**Main flow:**
1. Assessment Manager retrieves `<usage>` block from intervention-documentation-standard agent.
2. Assessment Manager computes estimated and actual tokens/costs as per UC-01.
3. Assessment Manager appends a new row to the Token Estimate file in a new "Intervention documentation" section (or integrates into "Assessment phase" subtotal — see Open Question #1).
4. Assessment Manager updates phase subtotals if integrated into assessment phase.

**Alternative flows:**
- If agent has no `<usage>` block: record "N/A" and log warning.

**Postconditions:**
- Token Estimate file includes intervention-documentation-standard row with actuals.

---

### UC-03: Gate Approval — Assessment Only Path

| Field | Value |
|-------|-------|
| Actor | User (via `assess-codebase` skill) |
| Preconditions | Token Estimate file exists with assessment and intervention-documentation rows. Phase 5 gate is presented to user. |
| Trigger | User selects "Assessment only" option at Phase 5 gate (no remediation). |
| Priority | Must |

**Main flow:**
1. User selects "Assessment only" at gate.
2. `assess-codebase` skill skips Phase 6 (remediation agents) and moves to Phase 8 (Summary).
3. Token Estimate file is left as-is: assessment rows with actuals, intervention-documentation row with actuals.
4. "Remediation — pending gate approval" placeholder section remains unchanged (not replaced).
5. `assess-codebase` appends orchestrator row (with actuals from orchestrator's `<usage>` block at end).
6. `assess-codebase` appends "Actuals vs Estimate" summary section showing per-agent deltas.
7. `assess-codebase` appends "Estimation accuracy by agent type" table (if ≥2 agent types present).
8. `assess-codebase` appends grand total (estimated vs actual vs delta).
9. Summary is shown to user with link to Token Estimate file.

**Postconditions:**
- Token Estimate file is final. No remediation rows added. Orchestrator and grand total appended.

---

### UC-04: Gate Approval — Remediation Path

| Field | Value |
|-------|-------|
| Actor | Assessment Manager, assess-codebase skill |
| Preconditions | Token Estimate file exists with assessment and intervention-documentation rows. Phase 5 gate is presented to user. Phase 6 remediation agents are approved for dispatch. |
| Trigger | User selects to proceed with remediation at Phase 5 gate. |
| Priority | Must |

**Main flow:**
1. User reviews intervention approvals and selects which to remediate.
2. Assessment Manager replaces "Remediation — pending gate approval" placeholder with actual approved intervention rows.
3. For each approved remediation agent: Assessment Manager computes estimated tokens/cost based on intervention scope (once known post-gate).
4. Assessment Manager appends remediation row(s) with: [agent, task_scope (INT-NNN IDs), model, est_tokens, est_cost, actual_tokens="pending", actual_cost="pending", status="pending"]
5. Each remediation agent runs during Phase 6.
6. As each remediation agent completes, its `<usage>` block is captured and Assessment Manager updates its row with actual_tokens, actual_cost, status="complete".
7. After all agents complete (or are deferred), Assessment Manager computes updated phase subtotals and grand total.
8. Phase 7: PR is created.
9. Phase 8: `assess-codebase` appends orchestrator row and final grand total.

**Alternative flows:**
- If a remediation agent is dispatched for rework (invoked a second time): a new row is appended with agent name suffixed with "(rework)"; both original and rework rows are included in totals and accuracy stats.
- If an approved intervention is later deferred (not dispatched): no token row is written for it; it appears in Approvals file but not in Token Estimate.

**Error flows:**
- If a remediation agent produces no `<usage>` block: record "N/A" for actuals; log warning; exclude from accuracy stats and cost totals.

**Postconditions:**
- Token Estimate file contains assessment rows, intervention-documentation row, and all dispatched remediation rows (with actuals filled progressively).
- Grand total is marked "partial — updated at pipeline end" until final append.

---

### UC-05: Remediation Agent Rework Cycle

| Field | Value |
|-------|-------|
| Actor | Remediation Agent, Assessment Manager |
| Preconditions | A remediation agent has already completed and has a row in the Token Estimate file. The agent is invoked again (rework cycle). |
| Trigger | Assessment Manager receives signal to re-dispatch the same remediation agent. |
| Priority | Must |

**Main flow:**
1. Assessment Manager appends a new row for the remediation agent with suffix "(rework)" in the agent name column.
2. Estimated tokens and cost are computed for this new row based on revised intervention scope.
3. New row has status="pending".
4. Remediation agent completes and produces `<usage>` block.
5. Assessment Manager fills actual_tokens, actual_cost, and sets status="complete" for the rework row.
6. Both original and rework rows are included in phase subtotals, accuracy stats, and grand total.

**Postconditions:**
- Token Estimate file shows both original and "(rework)" rows for the remediation agent.
- Totals include both invocations.

---

### UC-06: Orchestrator Row Append and Final Grand Total

| Field | Value |
|-------|-------|
| Actor | assess-codebase skill (orchestrator) |
| Preconditions | Entire assessment pipeline (Phases 1–7) has completed. Token Estimate file exists with assessment, intervention-documentation, and all remediation rows. |
| Trigger | Pipeline finishes; `assess-codebase` is about to display summary. |
| Priority | Must |

**Main flow:**
1. `assess-codebase` retrieves `<usage>` block from its own orchestrator invocation (assessment-manager agent's final call with timing for Phases 1–7).
2. `assess-codebase` appends orchestrator row: [agent="assessment-manager (orchestrator)", model="sonnet", est_tokens=X, actual_tokens=Y, status="complete"]
3. `assess-codebase` appends "Actuals vs Estimate" summary section with per-agent rows showing estimated tokens, actual tokens, delta, delta %.
4. If ≥2 distinct agent models present: `assess-codebase` appends "Estimation accuracy by agent type" table with rows per model showing avg estimated, avg actual, avg delta, trend indicator.
5. `assess-codebase` appends grand total row: [total_est_tokens, total_actual_tokens, total_delta, total_est_cost, total_actual_cost, total_delta_cost]
6. Grand total section updates the "partial" marker to show final scope.

**Postconditions:**
- Token Estimate file is finalized with all actuals and orchestrator row.
- File is suitable for cost review and historical tracking.

---

### UC-07: Missing Usage Block Handling

| Field | Value |
|-------|-------|
| Actor | Assessment Manager |
| Preconditions | An assessment or remediation agent has completed but produced no `<usage>` block in its output. |
| Trigger | Assessment Manager attempts to read `<usage>` block during Phase 3 write or remediation update. |
| Priority | Must |

**Main flow:**
1. Assessment Manager detects missing `<usage>` block.
2. Assessment Manager writes "N/A" for actual_tokens and actual_cost in that agent's row.
3. Assessment Manager logs warning in process log: "[agent name] produced no <usage> block; token data unavailable."
4. Assessment Manager excludes that row from:
   - Phase subtotals (both token and cost)
   - Grand total
   - Accuracy statistics
5. Estimation for that agent (estimated tokens and cost) is still recorded if available from estimation model.
6. Agent's status remains "complete" (the agent did complete; data capture was the issue).

**Postconditions:**
- Agent row exists but with "N/A" actuals; does not skew totals or averages.

---

### UC-08: Missing or Malformed Pricing Data

| Field | Value |
|-------|-------|
| Actor | Assessment Manager |
| Preconditions | Assessment Manager attempts to compute costs. `docs/pricing.md` is missing, unreadable, or does not contain expected model entries. |
| Trigger | Assessment Manager tries to read pricing data for cost computation. |
| Priority | Must |

**Main flow:**
1. Assessment Manager detects missing or malformed `docs/pricing.md`.
2. Assessment Manager logs warning: "docs/pricing.md missing/malformed; cost columns will show N/A."
3. Assessment Manager writes "N/A" for all cost columns (est_cost, actual_cost) for all agents.
4. Assessment Manager still records token counts (estimated and actual).
5. File is written with complete token data and N/A costs.
6. Grand total cost rows show "N/A".

**Postconditions:**
- Token Estimate file is complete with tokens; cost data is unavailable but clearly marked N/A.
- Token counts are still useful for post-hoc analysis.

---

### UC-09: Pipeline Abort Before Final Append

| Field | Value |
|-------|-------|
| Actor | User, assess-codebase skill |
| Preconditions | Token Estimate file was written at end of Phase 3. User aborts pipeline after Phase 3 but before Phase 8 summary. |
| Trigger | Pipeline is interrupted (user halt or system error) between Phase 3 completion and Phase 8. |
| Priority | Must |

**Main flow:**
1. Token Estimate file exists from Phase 3 with assessment agent rows (actuals), intervention-documentation row if Phase 4 ran.
2. Pipeline halts (e.g., user cancels, gate not submitted, remediation blocked).
3. No orchestrator row or grand total is appended (because pipeline did not reach Phase 8).
4. Token Estimate file is left as-is, marked partial.

**Postconditions:**
- Token Estimate file is incomplete (no final grand total or orchestrator row).
- File is still valid for partial cost review; users are aware it is incomplete.

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Estimated tokens must be computed using the estimation model from `docs/procedures/token-estimation.md` with parameters: chars-per-token, system prompt weights, base overhead. | UC-01, UC-04, UC-05 |
| BR-02 | Estimated cost must be computed using the blended formula from `docs/pricing.md` with 80% input tokens, 20% output tokens weighting. | UC-01, UC-04, UC-05 |
| BR-03 | Actual tokens must come from the agent's `<usage>` block (input_tokens + output_tokens). | UC-01, UC-02, UC-04, UC-05, UC-07 |
| BR-04 | Actual cost must be computed from actual tokens using the same blended formula and rates as estimates. | UC-01, UC-02, UC-04, UC-05 |
| BR-05 | If an agent's `<usage>` block is missing, its actual tokens and actual cost are recorded as "N/A" and excluded from totals and accuracy statistics. | UC-07 |
| BR-06 | If `docs/pricing.md` is missing or malformed, all cost columns show "N/A" but token counts are still recorded. | UC-08 |
| BR-07 | Assessment agent rows are written at the end of Phase 3 with both estimates and actuals; they are never re-written. | UC-01 |
| BR-08 | Remediation agent rows are written after Phase 5 gate approval with estimates only; actuals are filled in progressively as agents complete. | UC-04 |
| BR-09 | A remediation agent invoked for rework gets a new row with "(rework)" suffix; both original and rework rows are included in totals and accuracy statistics. | UC-05 |
| BR-10 | The orchestrator row is appended only by `assess-codebase` skill at pipeline completion (Phase 8), not by Assessment Manager. | UC-06 |
| BR-11 | Phase subtotals and grand total exclude rows with "N/A" actual tokens or costs. | UC-01, UC-02, UC-07, UC-08 |
| BR-12 | An approved intervention that is deferred (not dispatched) does not get a token row in the Token Estimate file. | UC-04 |

---

## 4. Data Requirements

### 4.1 Entities

**Token Estimate File** (`{PREFIX}-Token-Estimate.md`)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| location | file path | Fixed | `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md` |
| written_at | phase | Fixed | End of Phase 3 (first write); progressively updated through Phase 6; final append at Phase 8. |
| format | markdown | Fixed | Markdown tables for rows, sections with headers. |

**Assessment Agent Row**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | Non-empty | Name of assessment agent from frontmatter (e.g., "generic-software-assessment", "layered-architecture-assessment") |
| model | string | Must exist in `docs/pricing.md` or default "sonnet" | Model used by agent (e.g., "sonnet", "haiku", "opus") |
| est_tokens | integer | Positive | Estimated tokens computed at Phase 3 using estimation model |
| est_cost | decimal (4dp) | Positive or "N/A" | Estimated cost in USD; 4 decimal places; "N/A" if pricing unavailable |
| actual_tokens | integer or "N/A" | Positive or "N/A" | Actual tokens from `<usage>` block; "N/A" if block missing |
| actual_cost | decimal (4dp) or "N/A" | Positive or "N/A" | Actual cost computed from actual tokens; "N/A" if pricing unavailable or tokens missing |
| status | string | "complete" | Always "complete" for assessment agents at Phase 3 write |

**Intervention Documentation Agent Row** (Phase 4)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | Fixed | "intervention-documentation-standard" |
| model | string | Must exist in `docs/pricing.md` | Agent's model |
| est_tokens | integer | Positive | Estimated tokens |
| est_cost | decimal (4dp) or "N/A" | Positive or "N/A" | Estimated cost |
| actual_tokens | integer or "N/A" | Positive or "N/A" | Actual from `<usage>` block |
| actual_cost | decimal (4dp) or "N/A" | Positive or "N/A" | Actual cost |
| status | string | "complete" | Always "complete" at Phase 4 completion |

**Remediation Agent Row** (Phase 6, after gate approval)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | Non-empty, may have "(rework)" suffix | Name of remediation agent (e.g., "god-class-decomposition", "god-class-decomposition (rework)") |
| task_scope | string | Non-empty | INT-NNN identifier(s) handled by this invocation (e.g., "INT-001, INT-003" or "INT-002") |
| model | string | Must exist in `docs/pricing.md` | Agent's model |
| est_tokens | integer | Positive | Estimated tokens; computed after gate once scope is known |
| est_cost | decimal (4dp) or "N/A" | Positive or "N/A" | Estimated cost |
| actual_tokens | integer, "N/A", or "pending" | Positive, "N/A", or "pending" | Filled on completion; "pending" during Phase 6; "N/A" if block missing |
| actual_cost | decimal (4dp), "N/A", or "pending" | Positive, "N/A", or "pending" | Filled on completion; "pending" during Phase 6; "N/A" if pricing unavailable |
| status | string | "pending" until completion, then "complete" | Status of remediation agent invocation |

**Orchestrator Row** (appended by assess-codebase at Phase 8)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | Fixed | "assessment-manager (orchestrator)" |
| model | string | Fixed | "sonnet" |
| est_tokens | integer | Positive | Estimated tokens for orchestrator; computed at plan time |
| actual_tokens | integer | Positive | Actual tokens from orchestrator's `<usage>` block at end of Phase 7 |
| status | string | Fixed | "complete" |

**Phase Subtotal Row**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| label | string | Fixed per section | "Assessment phase total", "Remediation phase total", etc. |
| est_tokens | integer | Sum of agent rows | Total estimated tokens for phase |
| actual_tokens | integer | Sum of agent rows with non-N/A actuals | Total actual tokens for phase (excludes N/A rows) |
| est_cost | decimal (2dp) or "N/A" | Sum of agent rows | Total estimated cost for phase; 2 decimal places |
| actual_cost | decimal (2dp) or "N/A" | Sum of agent rows with non-N/A actuals | Total actual cost for phase; 2 decimal places; "N/A" if any agent has N/A |

**Grand Total Row**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| label | string | Fixed | "Grand total" or "Grand total — partial (updated at pipeline end)" until Phase 8 |
| est_tokens | integer | Sum across all phases | Total estimated tokens for entire run |
| actual_tokens | integer | Sum across all phases (excluding N/A) | Total actual tokens for entire run |
| est_cost | decimal (2dp) or "N/A" | Sum of phase subtotals | Total estimated cost; 2 decimal places; "N/A" if pricing unavailable |
| actual_cost | decimal (2dp) or "N/A" | Sum of phase subtotals (excluding N/A) | Total actual cost; 2 decimal places; "N/A" if pricing unavailable |
| delta_tokens | integer | actual_tokens - est_tokens | Difference (can be negative) |
| delta_cost | decimal (2dp) or "N/A" | actual_cost - est_cost | Difference (can be negative); "N/A" if either cost is N/A |
| delta_% | decimal (1dp) or "N/A" | (delta / est) × 100 | Percentage difference; "N/A" if est is 0 or pricing unavailable |

**Actuals vs Estimate Summary Section** (appended at Phase 8)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | Non-empty | Agent name (same as row label) |
| est_tokens | integer | Positive | From agent row |
| actual_tokens | integer or "N/A" | Positive or "N/A" | From agent row |
| delta | integer or "N/A" | Any integer or "N/A" | actual - estimated |
| delta_% | decimal (1dp) or "N/A" | Any value or "N/A" | (delta / est) × 100; "N/A" if est is 0 |

**Estimation Accuracy by Agent Type Table** (appended at Phase 8, if ≥2 models)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| model | string | Non-empty | Model name (e.g., "sonnet", "haiku", "opus") |
| count | integer | Positive | Number of invocations with this model |
| avg_est_tokens | decimal (0dp) | Positive | Average estimated tokens for invocations with this model |
| avg_actual_tokens | decimal (0dp) | Positive or "N/A" | Average actual tokens (excluding N/A rows) |
| avg_delta | decimal (0dp) | Any value or "N/A" | Average delta per invocation |
| trend | string | "↑" (over), "↓" (under), "→" (within 5%) | Indicator of estimation accuracy trend for model |

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| est_tokens | Must be a positive integer; computed using estimation model; cannot be 0 |
| actual_tokens | Must be a positive integer or "N/A"; if present, must match sum of input_tokens + output_tokens from `<usage>` block |
| est_cost | Must be 4 decimal places for per-row values; computed using blended formula from `docs/pricing.md`; must be >= 0 |
| actual_cost | Must be 4 decimal places for per-row values; computed same way as est_cost; must be >= 0 or "N/A" |
| cost subtotals and grand total | Must be 2 decimal places (not 4) |
| model | Must match a model name in `docs/pricing.md`; if not found in agent frontmatter, default to "sonnet" |
| status (assessment agents) | Must be "complete" |
| status (remediation agents) | Must be "pending" or "complete"; transitions from pending to complete when agent finishes |
| agent name | Non-empty string; may include "(rework)" suffix for rework invocations; must match agent identity in assessment output |
| task_scope (remediation rows) | Non-empty string; one or more INT-NNN identifiers separated by commas; e.g., "INT-001, INT-003" |
| delta_% | Must be 1 decimal place; "N/A" if estimated tokens is 0 or pricing unavailable; formula: (delta / est_tokens) × 100 |
| trend indicator | Must be one of: "↑" (actual > est × 1.05), "↓" (actual < est × 0.95), "→" (within 5% of estimate) |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | Token Estimate file must be written within 5 seconds of Phase 3 completion, even with 20+ assessment agents. |
| NFR-02 | Performance | Updating a remediation row with actuals must complete within 2 seconds per row update. |
| NFR-03 | Reliability | File I/O operations (write, update, append) must handle concurrent access gracefully (lock on write, queue updates if needed). |
| NFR-04 | Usability | File format must be human-readable markdown with clear section headers and labeled columns; no binary or machine-only formats in MVP. |
| NFR-05 | Accuracy | Token counts recorded in file must match those reported in `<usage>` blocks with zero loss of precision. |
| NFR-06 | Accuracy | Cost computations must use exact decimal arithmetic with 4 decimal places for per-row values, 2 for subtotals and totals. |
| NFR-07 | Maintainability | File template and sections must be independent of agent count; new agents do not require schema changes. |
| NFR-08 | Robustness | Missing or malformed `docs/pricing.md` must not halt pipeline; costs show "N/A" and process log is warned. |
| NFR-09 | Robustness | Missing `<usage>` blocks must not halt pipeline; affected agent shows "N/A" and process log is warned. |
| NFR-10 | Auditability | Every write, update, and append operation must log timestamp and scope (e.g., "Phase 3: wrote 8 agent rows") in process log. |

---

## 6. UI Requirements

### 6.1 Pages / Screens

**Token Estimate File Display** (markdown document, displayed post-run)

| Aspect | Specification |
|--------|---------------|
| Purpose | Present the complete cost and token summary to user after pipeline completion. |
| Primary consumer | Project Manager / Tech Lead reviewing spend and accuracy. |
| Format | Markdown tables with labeled columns and summary sections. |
| Interactivity | Read-only document; user may copy, export, or reference in reports. |
| Sections | Estimation parameters (header), agent rows grouped by phase, phase subtotals, grand total, accuracy summary, per-model analysis. |
| Navigation | Link from pipeline summary (end of Phase 8) to Token Estimate file in `docs/assessments/{PREFIX}/`. |

**Phase 5 Gate Dialog** (no change; reference for context)

| Aspect | Specification |
|--------|---------------|
| Purpose | User selects remediation scope (assessment only or full remediation). |
| Impact on Token Estimate | If user selects "Assessment only", remediation section remains as placeholder; orchestrator row and grand total appended without remediation rows. |
| Display hint | Pipeline may mention "Token Estimate file will be available at `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md` after completion." |

### 6.2 Navigation Flow

1. **Phase 1–2**: No UI for Token Estimate (file not yet written).
2. **Phase 3 completion**: Assessment Manager writes Token Estimate file to `docs/assessments/{PREFIX}/`. File is ready for review if user aborts at this point.
3. **Phase 4 completion**: Token Estimate updated with intervention-documentation row if Phase 4 ran.
4. **Phase 5 gate**: User selects assessment-only or remediation path.
   - If assessment-only → Phase 8 summary shows link to completed Token Estimate.
   - If remediation → Phase 6 begins.
5. **Phase 6**: Remediation agents run; Token Estimate updated progressively with actuals as agents complete.
6. **Phase 7**: PR created (no Token Estimate interaction).
7. **Phase 8 summary**: `assess-codebase` appends orchestrator row and final grand total; displays summary and link to final Token Estimate file.

User flow at Phase 5:

```
[Phase 4 completes] 
  → Assessment Manager updates Token Estimate with intervention row
  → Phase 5 gate is shown to user
  ↓
  ├─→ [User selects "Assessment only"]
  │    → Skip Phase 6, jump to Phase 8 summary
  │    → Token Estimate is complete (assessment + intervention rows + orchestrator row)
  │    → Summary shows: "See Token Estimate at docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md"
  │
  └─→ [User selects "Proceed with remediation"]
       → Phase 6: Remediation agents run
       → Assessment Manager appends remediation rows and fills actuals as agents complete
       → Phase 7: PR created
       → Phase 8: Orchestrator appends final row and grand total
       → Summary shows final link
```

---

## 7. Acceptance Criteria

| ID | Given | When | Then | Related UC |
|----|-------|------|------|-----------|
| AC-01 | A full assessment pipeline run completes with all phases (assessment, intervention docs, gate approval, remediation, PR) | The `assess-codebase` skill finishes the pipeline | `{PREFIX}-Token-Estimate.md` exists in `docs/assessments/{PREFIX}/` with (1) a row for every assessment agent that ran, (2) intervention-documentation row, (3) a row for every dispatched remediation agent, (4) orchestrator row, (5) all estimated and actual tokens/costs filled in, (6) grand total with partial → final update | UC-01, UC-02, UC-04, UC-06 |
| AC-02 | The user selects "Assessment only" at the Phase 5 gate | The pipeline reaches Phase 8 summary | `{PREFIX}-Token-Estimate.md` exists with (1) assessment agent rows (actuals filled), (2) intervention-documentation row (actuals filled), (3) orchestrator row with actuals, (4) "Remediation — pending gate approval" placeholder section present and unchanged, (5) grand total reflects assessment-only scope (excludes remediation phase), (6) accuracy summary shows only assessment agents | UC-03 |
| AC-03 | An assessment agent completes without a `<usage>` block | Phase 3 ends and the file is written | That agent's row shows "N/A" for actual_tokens and actual_cost, (2) it is excluded from phase subtotals and grand total, (3) it is excluded from accuracy statistics and trend analysis, (4) a warning appears in process log: "[agent name] produced no <usage> block; token data unavailable" | UC-07 |
| AC-04 | Phase 3 ends (assessment agents complete) | Assessment Manager writes the Token Estimate file | The file contains (1) assessment agent rows with both estimated and actual tokens/costs, (2) a "Remediation — pending gate approval" placeholder section with note, (3) partial phase subtotal for assessment phase only, (4) grand total section marked "partial — updated at pipeline end" | UC-01 |
| AC-05 | A remediation agent is invoked a second time (rework cycle) | The rework invocation completes | A second row for that agent appears with "(rework)" suffix appended to agent name, (2) both original and rework rows are included in phase subtotals, grand total, and accuracy statistics, (3) each row has independent estimated and actual tokens/costs | UC-05 |
| AC-06 | An intervention is approved at the Phase 5 gate but later deferred (not dispatched) | The pipeline ends | No token row exists for that deferred intervention in the Token Estimate file; only dispatched remediation agents appear as rows | UC-04 |
| AC-07 | `docs/pricing.md` is missing or malformed | The orchestrator reaches Phase 3 and attempts cost computation | All cost columns (est_cost, actual_cost) in all rows show "N/A", (2) all token count columns are still populated with correct values, (3) a warning is logged: "docs/pricing.md missing/malformed; cost columns will show N/A", (4) grand total cost rows show "N/A" | UC-08 |
| AC-08 | The estimation model is applied to an agent's row before dispatch | Any agent's estimated tokens row is written | The estimated cost is computed using the blended formula from `docs/pricing.md` as: (est_tokens × 0.8 × input_rate + est_tokens × 0.2 × output_rate) with 4 decimal places | UC-01, UC-04 |
| AC-09 | The pipeline completes with at least two different agent models (e.g., haiku and sonnet) represented in actual rows | The "Estimation accuracy by agent type" table is written at Phase 8 | The table shows (1) one row per distinct model, (2) count of invocations per model, (3) avg estimated tokens, (4) avg actual tokens, (5) avg delta per invocation, (6) trend indicator ("↑", "↓", or "→") per model | UC-06 |

---

## 8. Dependencies & Assumptions

### External Dependencies

- **`docs/procedures/token-estimation.md`**: Defines the estimation model parameters (chars-per-token, system prompt weights, base overhead). This feature extends its usage to the assessment pipeline.
- **`docs/pricing.md`**: Authoritative source for model pricing (input/output rates per model). Feature reads this file at write time for cost computation. Manual updates required; no auto-refresh.
- **Assessment agent `<usage>` blocks**: Each agent's execution result includes a `<usage>` block with input_tokens, output_tokens, and model. Feature depends on all agents producing this block (or gracefully handling its absence).
- **Assessment output directory**: `docs/assessments/{PREFIX}/` is created by `assessment-manager` during Phase 1–2. Feature assumes directory exists before Phase 3 ends.
- **Process log**: Existing `process-log.txt` continues to be used for logging; feature adds warnings and notifications to it. Feature does not modify process-log format.

### Assumptions

- **Pricing data is current**: `docs/pricing.md` is kept up-to-date by maintainers. Feature does not validate pricing accuracy; it uses values as-is.
- **Estimation model is stable**: `docs/procedures/token-estimation.md` parameters are stable during a single pipeline run. Feature does not handle mid-run updates to the model.
- **Assessment agent set is fixed**: The list of assessment agents (generic-software-assessment, god-class-decomposition, etc.) is fixed at pipeline start. Feature does not support dynamic agent registration.
- **Orchestrator token count is available at Phase 8**: `assess-codebase` skill has access to its own `<usage>` block at end of Phase 7 and can append orchestrator row with actuals. If not available, orchestrator row is marked "actual_tokens: N/A".
- **Remediation agents know their task scope**: When a remediation agent is dispatched, Assessment Manager has access to the INT-NNN identifiers it is handling (from gate approval). Feature assumes this scope is provided by the orchestrator at dispatch time.
- **File system is writable**: `docs/assessments/{PREFIX}/` is writable by Assessment Manager and `assess-codebase` skill. Feature does not handle permission errors (they halt the pipeline).
- **No concurrent writes**: Only one instance of `assess-codebase` runs at a time for a given `{PREFIX}`. Feature does not implement multi-writer locking (assumes single-writer model).
- **Estimation model is always present**: `docs/procedures/token-estimation.md` is mandatory. If missing, pipeline halts with error (non-graceful). (Cost computation via `docs/pricing.md` is graceful, but estimation model is not.)

---

## 9. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | Should the `intervention-documentation-standard` agent's row be included in the "Assessment phase" subtotal or in a separate "Intervention documentation phase" row? | Affects how phase subtotals are grouped and labeled in the file; also affects interpretation of "assessment phase cost" in reports. | **Option A**: Include in "Assessment phase" subtotal (simpler, treats intervention docs as part of assessment scope). **Option B**: Create separate "Intervention documentation phase" section (clearer phase boundaries). **Option C**: Leave as open point to discuss later and decide during implementation. |
| 2 | When a remediation agent handles multiple interventions in one call (batched), is the remediation row keyed by agent name or by INT-NNN intervention IDs? If batched, how are tokens attributed per intervention? | Affects remediation row schema; determines whether remediation rows can be aggregated per agent across batches or whether they must be split per batch. | **Option A**: Row is keyed by agent name; task_scope column lists all INT-NNNs handled in that invocation; tokens are attributed to the batch as a whole (not split per intervention). **Option B**: Create separate rows per INT-NNN even if handled in same agent call (more granular but verbose). **Option C**: Leave as open point to discuss later and align with how `assessment-manager` actually dispatches remediation agents (answer should come from implementation). |

