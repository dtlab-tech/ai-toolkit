# Work Breakdown — Assessment Token Estimation

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-001: Assessment Token Estimation |
| Version | 1.0 |
| Date | 2026-07-14 |
| Status | Draft |
| Source: Requirements | FTR-001-Requirements.md |
| Source: Tech-Spec | FTR-001-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 6 |
| Total Tasks | 19 |
| Domain distribution | BE: 19 |
| Complexity | S: 7, M: 10, L: 2 |
| Estimated total (Human) | 30h 30min |
| Estimated total (Agent) | 95min |
| Implementation phases | 6 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Add token estimation reference section to `docs/procedures/token-estimation.md` | BE | US-01, US-02, US-03, US-04, US-05, US-06 | S | 45min | 5min | Create or update guidance section in token-estimation.md with simplified estimation formula for assessment agents, system prompt weights per model (haiku ~2k, sonnet ~3k tokens), base overhead (~5k tokens), and input/output split (80/20) for cost computation. Reference existing pricing.md blended cost formula. |
| INFRA-T02 | Review and confirm `docs/pricing.md` structure for cost computation | BE | US-01, US-02, US-03, US-04, US-05, US-06 | S | 15min | 3min | Audit docs/pricing.md to confirm it contains: (1) per-model pricing (input/output rates), (2) blended cost calculation formula (80/20 split), (3) model names (sonnet, haiku, opus). Create or update the "Blended unit cost reference table" section if missing. This is a read-only check; if file is malformed, feature has graceful error handling. |

---

## 3. User Stories

### US-01: Write Token Estimate File at Phase 3 Completion

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | Assessment Manager agent |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-04, AC-07, AC-08 |

**Description:**
As the Assessment Manager orchestrator, I want to accumulate token usage from all Phase 3 assessment agents and write a structured Token Estimate file with assessment rows, estimates, and actuals filled in, so that the cost is tracked from the start of the assessment pipeline and cost data is available for partial review if the pipeline is aborted early.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Implement token accumulation logic in assessment-manager Phase 3 | BE | INFRA-T01, INFRA-T02 | M | 2h | 10min | After all Phase 3 assessment agents complete (in parallel), read and accumulate token usage data from each agent's result: extract `<usage>` block (input_tokens, output_tokens, model) or note if missing. Store in in-memory collection keyed by agent name. Handle gracefully if a block is missing or unparseable (set flag, log warning for later). |
| US-01-T02 | Implement estimation logic for Phase 3 agents | BE | INFRA-T01, US-01-T01 | M | 3h | 12min | Read `docs/procedures/token-estimation.md` to get model parameters (chars-per-token, system prompt weight per model, base overhead). Implement estimation formula: `est_tokens = base_overhead + system_prompt_weight + (input_size_bytes / chars_per_token)`. For assessment agents, use reasonable input size estimates (50–100k bytes of code for generic assessment, 30–50k for layered, etc.). Compute estimated tokens for each assessment agent (integer). |
| US-01-T03 | Implement cost computation for Phase 3 estimates | BE | INFRA-T02, US-01-T02 | M | 2h | 10min | Read `docs/pricing.md` to extract blended unit cost per model. Implement cost formula: `est_cost = est_tokens × (blended_rate / 1000)` with 4 decimal places per row. Handle gracefully if pricing.md is missing or model not found (set cost to "N/A", log warning, continue). |
| US-01-T04 | Extract actual tokens from Phase 3 agents | BE | US-01-T01 | M | 2h | 10min | For each assessment agent, extract actual_tokens from `<usage>` block: `actual_tokens = input_tokens + output_tokens`. If block is missing: set `actual_tokens = "N/A"`, log warning "[agent name] produced no <usage> block; token data unavailable". Store with agent metadata. |
| US-01-T05 | Compute actual costs for Phase 3 agents | BE | INFRA-T02, US-01-T04 | M | 1h 30min | 8min | For each assessment agent, compute `actual_cost = actual_tokens × (blended_rate / 1000)` using same blended formula and 4 decimal places. If `actual_tokens = "N/A"`: set `actual_cost = "N/A"`. If pricing.md missing: set all `actual_cost = "N/A"`. |
| US-01-T06 | Create Token Estimate file template and structure | BE | US-01-T02, US-01-T03, US-01-T05 | M | 3h | 15min | Create markdown file at `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md` (create directory if needed). Implement file structure with sections: (1) Header with description, (2) Estimation model parameters table (from token-estimation.md), (3) Assessment agents section with table (columns: agent, model, est_tokens, est_cost, actual_tokens, actual_cost, status="complete"), (4) Placeholder "Intervention documentation — to be populated" section, (5) Placeholder "Remediation agents — pending gate approval" section with note, (6) Phase subtotals table (assessment phase only with est/actual values), (7) Grand total section marked "partial — updated at pipeline end". Use markdown table format; all rows correct and aligned. |
| US-01-T07 | Implement Phase 3 file write and logging | BE | US-01-T06 | S | 1h | 5min | Write complete Token Estimate file to disk at end of Phase 3 assessment agents completion. Log timestamp and operation summary to process log: `"Phase 3 end: wrote Token Estimate file. Assessment agents: {N} rows ({completed} complete, {N/A} with N/A actuals). Location: docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md"`. Verify file is readable post-write. Handle file I/O errors gracefully (e.g., permission denied, disk full). |

---

### US-02: Append Intervention Documentation Agent Row at Phase 4

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Assessment Manager agent |
| Priority | Must |
| Acceptance Criteria | AC-01 |

**Description:**
As the Assessment Manager, I want to append a row for the intervention-documentation-standard agent to the Token Estimate file after Phase 4 completes, so that intervention documentation costs are tracked separately and the file stays current throughout the pipeline.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Extract Phase 4 agent token usage and estimate | BE | INFRA-T01, INFRA-T02, US-01-T06 | S | 1h | 5min | After intervention-documentation-standard agent completes, extract `<usage>` block (input_tokens, output_tokens, model). Estimate tokens using formula: `est_tokens = base_overhead + system_prompt_weight + (intervention_doc_size_bytes / 4)` (~5–6k tokens typical). Compute estimated cost using blended formula. Handle missing block (set actual to "N/A", log warning). |
| US-02-T02 | Append intervention-documentation row to Token Estimate file | BE | US-02-T01, US-01-T06 | S | 1h | 5min | Open existing Token Estimate file. Find or create "Intervention documentation (Phase 4)" section (new section if not yet present). Append one row: [agent="intervention-documentation-standard", model=(from frontmatter), est_tokens, est_cost, actual_tokens, actual_cost, status="complete"]. Use same 4 decimal place cost format. Update process log: `"Phase 4 end: appended intervention-documentation-standard row to Token Estimate file. Actual tokens: {N} | Cost: $X.XXXX"`. |

---

### US-03: Gate Approval — Assessment Only Path

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | assess-codebase skill (orchestrator) |
| Priority | Must |
| Acceptance Criteria | AC-02 |

**Description:**
As the assess-codebase skill, I want to handle the "assessment only" path where users do not proceed with remediation, so that the Token Estimate file is finalized with only assessment and intervention documentation costs, and the orchestrator row is appended correctly.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Detect assessment-only gate selection in assess-codebase | BE | US-02-T02 | S | 30min | 3min | At Phase 5 gate: read assessment-manager's decision logic to determine if user selected "Assessment only" vs "Proceed with remediation". If assessment-only: skip Phase 6 remediation dispatch and jump directly to Phase 8 summary. Ensure "Remediation agents — pending gate approval" placeholder section is left unchanged (not replaced). |
| US-03-T02 | Handle Phase 8 finalization for assessment-only runs | BE | US-03-T01, US-05-T01, US-06-T01, US-06-T02 | M | 2h | 10min | In assess-codebase Phase 8 handler: read Token Estimate file (contains assessment + intervention rows). Extract orchestrator's `<usage>` block from assessment-manager result. Append orchestrator row. Append "Actuals vs Estimate" summary table (per-agent rows with delta analysis). If ≥2 models present: append "Estimation accuracy by agent type" table. Append final grand total section (with updated "Partial" → "Final" marker). All sections conform to schema; costs are 2 decimal places for subtotals/totals. |

---

### US-04: Gate Approval — Remediation Path with Progressive Updates

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | Assessment Manager agent |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-05 |

**Description:**
As the Assessment Manager, I want to replace the remediation placeholder with actual approved remediation agent rows after the Phase 5 gate, and progressively fill in actual tokens and costs as each remediation agent completes, so that remediation costs are tracked in real-time and the Token Estimate file is continuously updated through Phase 6.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Implement placeholder section replacement at gate approval | BE | INFRA-T01, INFRA-T02, US-02-T02 | M | 2h | 10min | After Phase 5 gate approval (user selects "Proceed with remediation"): read `{PREFIX}-Interventions-Index.md` (from intervention-documentation-standard agent) to identify approved interventions and their assigned remediation agents. Read `{PREFIX}-Approvals.md` to confirm gate decision. For each approved intervention: extract INT-NNN identifiers and assigned remediation agent name. Estimate tokens for each remediation agent using formula: `est_tokens = base_overhead + system_prompt_weight + (intervention_doc_size_bytes / 4)` (~10–15k tokens typical depending on intervention complexity). Compute estimated costs. Replace "Remediation agents — pending gate approval" placeholder section with actual rows: [agent, task_scope (INT-NNN list), model, est_tokens, est_cost, actual_tokens="pending", actual_cost="pending", status="pending"]. |
| US-04-T02 | Implement progressive remediation row updates as agents complete | BE | US-04-T01 | M | 3h | 15min | As each remediation agent completes during Phase 6: (1) Extract agent's `<usage>` block, (2) Update corresponding Token Estimate row: set actual_tokens, compute actual_cost, set status="complete", (3) Handle missing blocks: set actual to "N/A", log warning, (4) Log each update: `"Phase 6: updated {agent_name} row in Token Estimate with actuals. Actual tokens: {N} | Cost: $X.XXXX"`. Implement row lookup by agent name to find and update the correct row. Preserve all other row fields (estimates remain unchanged). |
| US-04-T03 | Implement rework cycle handling | BE | US-04-T02 | M | 2h | 10min | When a remediation agent is dispatched a second time (rework) for the same INT-NNN: do NOT update the existing row. Instead: append a NEW row with agent name suffixed with " (rework)" (e.g., "god-class-decomposition (rework)"). The rework row has: [agent with " (rework)" suffix, same task_scope, model, new est_tokens (for rework scope), new est_cost, actual_tokens="pending", actual_cost="pending", status="pending"]. When rework completes, update its own row (not original). Both original and rework rows are included in phase subtotals and accuracy statistics. Log: `"Phase 6: god-class-decomposition rework invocation dispatched for INT-001. New row appended with '(rework)' suffix"`. |

---

### US-05: Missing Usage Block and Pricing Data Handling

| Field | Value |
|-------|-------|
| Derived from | UC-07, UC-08 |
| Actor | Assessment Manager agent |
| Priority | Must |
| Acceptance Criteria | AC-03, AC-07 |

**Description:**
As the Assessment Manager, I want to gracefully handle edge cases where an agent produces no `<usage>` block or `docs/pricing.md` is missing, so that the Token Estimate file is still written with available data, the pipeline continues, and users are informed of data unavailability.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-05-T01 | Implement missing `<usage>` block handling | BE | US-01-T04, US-01-T05, US-02-T01 | S | 1h | 5min | When reading agent results and a `<usage>` block is missing or unparseable: (1) Set actual_tokens="N/A", actual_cost="N/A" for that row, (2) Log warning: `"[agent_name] produced no <usage> block; token data unavailable"`, (3) Mark the row in Token Estimate with "N/A" values, (4) Exclude this row from phase subtotals and grand total calculations (do not sum "N/A" rows), (5) Exclude from accuracy statistics (delta calculation, trend analysis). Estimated tokens are still recorded (from estimation model). Status remains "complete". |
| US-05-T02 | Implement missing pricing.md graceful degradation | BE | INFRA-T02, US-01-T03, US-01-T05, US-02-T01 | S | 1h | 5min | When reading `docs/pricing.md` at start of token estimation: (1) Check if file exists and is readable, (2) If missing or malformed (JSON parse error, missing required fields): log warning `"docs/pricing.md missing/malformed; cost columns will show N/A"`, (3) Set all cost columns (est_cost, actual_cost) to "N/A" for all rows, (4) Token counts (estimated and actual) are still recorded with full precision, (5) Phase subtotals and grand total cost rows show "N/A", (6) Pipeline continues (does not halt). Delta cost and delta % show "N/A" if pricing unavailable. |
| US-05-T03 | Implement mandatory estimation model check | BE | INFRA-T01 | S | 30min | 3min | At Phase 3 start, before token estimation begins: check if `docs/procedures/token-estimation.md` exists and is readable. If missing: log error and halt pipeline (estimation model is non-negotiable; this is the only non-graceful error). If present: parse and validate that it contains required fields (chars-per-token, system prompt weights per model, base overhead). Store parameters in memory for reuse across Phase 3–6 calculations. |

---

### US-06: Phase 8 Finalization — Orchestrator Row and Grand Total

| Field | Value |
|-------|-------|
| Derived from | UC-06 |
| Actor | assess-codebase skill (orchestrator) |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-09 |

**Description:**
As the assess-codebase skill, I want to read the orchestrator's token usage, append an orchestrator row to the Token Estimate file, and generate summary sections (Actuals vs Estimate, Estimation accuracy by agent type, final Grand Total), so that the cost analysis is complete and users can understand overall pipeline efficiency.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-06-T01 | Extract orchestrator token usage from assessment-manager result | BE | US-04-T02 | S | 45min | 5min | At Phase 8 start, receive assessment-manager's result with `<usage>` block (total tokens consumed by orchestrator across entire Phases 1–7). Extract: actual_tokens (total input + output tokens from <usage> block), duration_ms (wall-clock time). If <usage> block is missing: log warning, set actual_tokens="N/A". Store orchestrator data for row append. |
| US-06-T02 | Append orchestrator row and final sections to Token Estimate file | BE | US-06-T01, US-03-T02 | L | 4h | 25min | Read existing Token Estimate file. Append orchestrator row: [agent="assessment-manager (orchestrator)", model="sonnet", est_tokens=(estimated for orchestrator, typically sum of all child agents * 20%), actual_tokens=(from <usage>), status="complete"]. Then append four new sections: (1) Horizontal rule ("---"), (2) "Actuals vs Estimate" summary table with all agents (assessment + intervention + remediation + orchestrator) showing: agent, est_tokens, actual_tokens, delta (actual - est), delta_%, est_cost, actual_cost. Exclude rows with "N/A" actual tokens from accuracy calculations, but show them in the table. (3) If ≥2 distinct models present in actual rows: "Estimation accuracy by agent type" table with rows per model: model, count (number of invocations), avg_est_tokens, avg_actual_tokens (excluding "N/A"), avg_delta, trend ("↑" if over by >5%, "↓" if under by >5%, "→" within 5%). (4) "Grand Total" section (final, not partial) with table: metric (total tokens, total cost), estimated, actual, delta, delta_%. All cost values 2 decimal places; token values integers. Update grand total header from "partial — updated at pipeline end" to "Final". Compute wall-clock duration (from assessment-manager result). Log: `"Phase 8: appended orchestrator row and final grand total to Token Estimate file. Grand total: {total_actual_tokens} tokens | ${total_actual_cost}"`. |
| US-06-T03 | Implement accuracy analysis calculations | BE | US-06-T02 | M | 2h | 10min | Implement calculation logic for accuracy analysis: (1) Per-agent delta: actual_tokens - est_tokens (can be negative). (2) Per-agent delta_%: (delta / est_tokens) × 100, formatted to 1 decimal place; "N/A" if est_tokens=0 or actual="N/A". (3) Per-model trend: group agents by model; calculate avg_est_tokens (mean of estimated), avg_actual_tokens (mean of actual, excluding "N/A"), avg_delta (mean of deltas). Trend indicator: "↑" if avg_delta > (avg_est × 0.05), "↓" if < -(avg_est × 0.05), "→" otherwise (within 5%). (4) Grand total deltas: sum all agent tokens/costs (excluding "N/A" rows), compute deltas, compute grand delta_%. Format all percentages to 1 decimal place. Handle edge cases: division by zero (show "N/A"), all "N/A" rows in a model (show "N/A" for trend). |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable User Story. Within a phase, tasks execute in dependency order; independent tasks within the same layer may run in parallel.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Add token estimation reference section to `docs/procedures/token-estimation.md` | BE |
| INFRA-T02 | Review and confirm `docs/pricing.md` structure for cost computation | BE |

#### Phase 2 — US-01: Write Token Estimate File at Phase 3 Completion (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Implement token accumulation logic in assessment-manager Phase 3 | BE |
| US-01-T02 | Implement estimation logic for Phase 3 agents | BE |
| US-01-T03 | Implement cost computation for Phase 3 estimates | BE |
| US-01-T04 | Extract actual tokens from Phase 3 agents | BE |
| US-01-T05 | Compute actual costs for Phase 3 agents | BE |
| US-01-T06 | Create Token Estimate file template and structure | BE |
| US-01-T07 | Implement Phase 3 file write and logging | BE |

#### Phase 3 — US-02: Append Intervention Documentation Agent Row at Phase 4 (depends on Phase 2)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Extract Phase 4 agent token usage and estimate | BE |
| US-02-T02 | Append intervention-documentation row to Token Estimate file | BE |

#### Phase 4 — US-05: Missing Usage Block and Pricing Data Handling (depends on Phase 2, Phase 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-05-T01 | Implement missing `<usage>` block handling | BE |
| US-05-T02 | Implement missing pricing.md graceful degradation | BE |
| US-05-T03 | Implement mandatory estimation model check | BE |

#### Phase 5 — US-04: Gate Approval — Remediation Path with Progressive Updates (depends on Phase 4)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Implement placeholder section replacement at gate approval | BE |
| US-04-T02 | Implement progressive remediation row updates as agents complete | BE |
| US-04-T03 | Implement rework cycle handling | BE |

#### Phase 6 — US-03: Gate Approval — Assessment Only Path (depends on Phase 3) + US-06: Phase 8 Finalization (depends on Phase 5)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Detect assessment-only gate selection in assess-codebase | BE |
| US-03-T02 | Handle Phase 8 finalization for assessment-only runs | BE |
| US-06-T01 | Extract orchestrator token usage from assessment-manager result | BE |
| US-06-T02 | Append orchestrator row and final sections to Token Estimate file | BE |
| US-06-T03 | Implement accuracy analysis calculations | BE |

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01, INFRA-T02 → US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05, US-01-T06, US-01-T07 
→ US-02-T01, US-02-T02 
→ US-05-T01, US-05-T02, US-05-T03 
→ US-04-T01, US-04-T02, US-04-T03 
→ US-06-T02 (largest task)
```

**Estimated critical path (human):** 2h (infrastructure) + 13h (US-01) + 2h (US-02) + 2h 30min (US-05) + 7h (US-04) + 4h (US-06-T02) = **30h 30min**

**Estimated critical path (agent):** 8min (infrastructure) + 52min (US-01) + 10min (US-02) + 13min (US-05) + 35min (US-04) + 25min (US-06) = **2h 23min**

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| BE | 19 | 7 | 10 | 2 | 30h 30min | 95min |
| **Total** | **19** | **7** | **10** | **2** | **30h 30min** | **95min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05, US-01-T06, US-01-T07 | AC-01, AC-04, AC-07, AC-08 |
| UC-02 | US-02 | US-02-T01, US-02-T02 | AC-01 |
| UC-03 | US-03 | US-03-T01, US-03-T02 | AC-02 |
| UC-04 | US-04 | US-04-T01, US-04-T02, US-04-T03 | AC-01, AC-05, AC-06 |
| UC-05 | US-04 | US-04-T03 | AC-05 |
| UC-06 | US-06 | US-06-T01, US-06-T02, US-06-T03 | AC-01, AC-09 |
| UC-07 | US-05 | US-05-T01 | AC-03 |
| UC-08 | US-05 | US-05-T02 | AC-07 |
| UC-09 | US-03, US-06 | US-03-T02, US-06-T02 | AC-02 |

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Integration with `{PREFIX}-Interventions-Index.md` — exact file structure and INT-NNN identifiers not fully specified in Tech-Spec | US-04-T01 depends on reading this file to identify approved interventions and task scope; if file structure differs, row mapping may fail | Clarify with intervention-documentation-standard agent developer before implementing US-04-T01. Alternatively: add defensive parsing with error handling (if file structure is unexpected, log error and skip Phase 6 remediation dispatch). |
| 2 | Assessment-manager agent's result object structure — unclear if `<usage>` block is top-level or nested within result | US-06-T01 needs to extract orchestrator usage from assessment-manager result; if nested path is different, extraction fails | Confirm with assessment-manager agent implementation team how usage block is returned. Add JSON/object path parsing logic that is flexible (e.g., try multiple paths, fallback to "N/A"). |
| 3 | File I/O concurrency — single-writer assumption may not hold in future parallel pipelines | US-01-T07, US-02-T02, US-04-T02, US-06-T02 all write/update Token Estimate file; if multiple instances run for same PREFIX, data corruption possible | For MVP: document assumption that only one assess-codebase instance per PREFIX runs at a time. If parallelism added later: implement file locking (e.g., .lock file) before write/append operations. For now, log warning if attempting to write to a file that is locked. |
| 4 | Decimal precision in markdown tables — markdown tables may not preserve exact 4dp formatting when rendered in different editors | US-01-T06, US-06-T02 write cost values as $X.XXXX; if markdown table renders with different precision, cost accuracy could appear wrong | Use consistent markdown table formatting with backticks or code blocks for cost values if needed (e.g., `` `$0.0444` ``). Test file rendering in multiple markdown viewers. Alternatively, validate post-write by reading file back and parsing table values. |
| 5 | Estimation model parameters in `docs/procedures/token-estimation.md` — if parameters are not present or are sparse, estimation may be inaccurate | All token estimation tasks (US-01-T02, US-02-T01, US-04-T01) depend on accurate parameters | INFRA-T01 includes creating/updating a guidance section with clear parameter values. If values are missing: use conservative defaults (base_overhead=5000, system_prompt_weight_sonnet=3000, chars_per_token=4) and log warning "Using default token estimation parameters; consider updating docs/procedures/token-estimation.md for accuracy." |
| 6 | Rework cycle identification — unclear how assessment-manager knows whether a remediation agent dispatch is a "rework" vs initial dispatch | US-04-T03 needs to detect rework to append "(rework)" suffix; if no signal from orchestrator, rows may be duplicated or missed | Clarify with assessment-manager developer: does orchestrator provide a "rework" flag when re-dispatching an agent? If yes: use flag to detect. If no: infer from Approvals file or remediation dispatch log (detect if agent is already in Token Estimate for same INT-NNN). Add defensive logic to avoid duplicate rows. |
| 7 | Delta % calculation with 0 estimated tokens — if estimation produces 0 tokens (edge case), delta % formula `(delta / est) × 100` has division by zero | US-06-T03 computes per-agent and per-model delta_%; needs to handle est=0 case | Always show "N/A" for delta_% if est_tokens is 0. Estimation logic (US-01-T02, US-02-T01, US-04-T01) should never produce 0 (formula includes base_overhead + system_prompt); add validation that est_tokens ≥ 1000. If somehow 0 is encountered: log warning and treat as invalid. |

