# Technical Specification — Assessment Token Estimation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-001: Assessment Token Estimation |
| Version | 1.0 |
| Date | 2026-07-14 |
| Status | Draft |

---

## 1. Overview

This feature extends the codebase assessment pipeline to produce and maintain a structured cost summary artifact: `{PREFIX}-Token-Estimate.md`. The file tracks estimated and actual token usage (and cost in USD) for every agent invoked during an assessment run.

**What is being built:**
- Token estimation and cost computation for all assessment agents (Phase 3), the intervention-documentation agent (Phase 4), and all approved remediation agents (Phase 6)
- Progressive population of the Token Estimate file through Phases 3–8 of the assessment pipeline
- Graceful handling of missing pricing data and missing `<usage>` blocks  
- Final orchestrator row and grand total appended by the `assess-codebase` skill at pipeline completion

**Which systems are affected:**
- `.claude/agents/assessment-manager.md` — extended to write and update Token Estimate file
- `.claude/skills/assess-codebase/SKILL.md` — extended to append orchestrator row and final grand total
- `docs/procedures/token-estimation.md` — referenced for estimation model parameters and cost formula (no changes to this file)
- `docs/pricing.md` — referenced for pricing data at write time

**Integration with existing patterns:**
This feature mirrors the token estimation pattern already implemented in the feature delivery pipeline (`/implement-feature` → `project-manager`). The `implement-feature` skill appends the project-manager orchestrator row and grand total (see `.claude/skills/implement-feature/SKILL.md`). The assessment pipeline will follow the same pattern with `assess-codebase` appending the assessment-manager orchestrator row.

---

## 2. Architecture

### 2.1 System Context

The assessment pipeline consists of 8 phases orchestrated by `assessment-manager` (invoked by `assess-codebase` skill):

```
Phase 1: Discovery             ┐
Phase 2: Planning              ├─ assessment-manager planning
                               ┘
                       ↓
Phase 3: Run assessment agents in parallel, accumulate tokens
                       ↓
Phase 4: Run intervention-documentation agent, document findings
                       ↓
Phase 5: Gate — user approves or selects assessment-only
                       ↓
         ┌─ Assessment only → skip to Phase 8
         │
Phase 6: Run approved remediation agents, progressively fill actuals
         │
Phase 7: Create PR
         │
         └─ All paths converge
                       ↓
Phase 8: Summary (assess-codebase appends orchestrator row + grand total)
```

**Token Estimate file lifecycle:**
1. **Phase 3 (end)**: assessment-manager writes file with assessment agent rows (estimates + actuals)
2. **Phase 4 (end)**: assessment-manager updates file with intervention-documentation row
3. **Phase 5 (gate)**: File is ready for partial review if user aborts
4. **Phase 6**: assessment-manager appends remediation rows with estimates; fills actuals progressively as agents complete
5. **Phase 8 (end)**: assess-codebase appends orchestrator row and final grand total

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
         ├─→ Writes: {PREFIX}-Token-Estimate.md (initial)
         │    └─ Contains: Assessment agent rows (est + actual)
         │    └─ Contains: Placeholder "Remediation — pending gate approval"
         │
         ├─ Phase 4: Dispatch intervention-documentation-standard
         │    └─→ Appends: intervention-documentation row to Token Estimate
         │
         ├─ Phase 5: Remediation Gate (user approval)
         │    └─ If assessment-only: file stays as-is
         │    └─ If remediation: file awaits remediation rows
         │
         ├─ Phase 6: Dispatch approved remediation agents
         │    ├─ god-class-decomposition
         │    ├─ domain-model-refactoring
         │    ├─ ... (other remediation agents)
         │    └─→ Appends + updates: remediation rows with actuals
         │
         └─ Returns: {PREFIX}-Token-Estimate.md (partial)
              └─ Marked "updated at pipeline end"
                  
    ↓ (assess-codebase receives assessment-manager result)
    
assess-codebase (skill) — Phase 8
    │
    ├─ Extracts: orchestrator <usage> block from assessment-manager result
    │
    └─→ Appends to {PREFIX}-Token-Estimate.md:
         ├─ Orchestrator row (agent="assessment-manager (orchestrator)")
         ├─ "Actuals vs Estimate" summary section
         ├─ "Estimation accuracy by agent type" table (if ≥2 models)
         └─ Grand total (estimated vs actual vs delta)

```

### 2.3 Sequence Diagram (Happy Path)

```
Phase 3: Assessment Agents
─────────────────────────────
assessment-manager → (spawn 5 assessment agents in parallel)
  (each agent runs with: codebase path, prefix, output dir)
  
[all assessment agents complete with <usage> blocks]

assessment-manager: accumulate token usage from each agent
assessment-manager: read estimation model from docs/procedures/token-estimation.md
assessment-manager: read pricing from docs/pricing.md
assessment-manager: compute estimates for each agent (using model + pricing)
assessment-manager: extract actuals from each agent's <usage> block
assessment-manager: write {PREFIX}-Token-Estimate.md
  ├─ Section: "Estimation model" (params from token-estimation.md)
  ├─ Section: "Assessment agents" (5 rows: agent | model | est_tokens | est_cost | actual_tokens | actual_cost | status="complete")
  ├─ Section: "Remediation — pending gate approval" (placeholder with note)
  ├─ Section: "Phase subtotals" (assessment phase only)
  └─ Section: "Grand total" (marked "partial — updated at pipeline end")

Phase 4: Intervention Documentation
─────────────────────────────────────
assessment-manager → spawn: intervention-documentation-standard
  (with all assessment outputs + prefix)

[intervention-documentation-standard completes with <usage> block]

assessment-manager: read <usage> block from intervention agent
assessment-manager: compute estimate & extract actual
assessment-manager: append row to Token Estimate file in new "Intervention documentation" section

Phase 5: Gate
─────────────
[user presented with approval dialog]

If "Assessment only":
  assessment-manager: skip Phase 6, return to assess-codebase
  
If "Proceed with remediation":
  assessment-manager: continue to Phase 6

Phase 6: Remediation Agents (if applicable)
─────────────────────────────────────────────
For each approved remediation agent:
  assessment-manager → spawn: remediation agent
    (with intervention doc path + codebase path)
  
  [remediation agent completes with <usage> block]
  
  assessment-manager: read <usage> block
  assessment-manager: update corresponding row in Token Estimate with actual_tokens, actual_cost, status="complete"

Phase 8: Final Summary
──────────────────────
assess-codebase (skill): receive assessment-manager result
assess-codebase: extract orchestrator <usage> block (from assessment-manager's invocation)
assess-codebase: read {PREFIX}-Token-Estimate.md
assess-codebase: append orchestrator row:
  │ assessment-manager (orchestrator) | sonnet | est_tokens | actual_tokens | status="complete" |
assess-codebase: append "Actuals vs Estimate" section:
  (per-agent rows showing: agent | est_tokens | actual_tokens | delta | delta_% | est_cost | actual_cost)
assess-codebase: if ≥2 distinct models present: append "Estimation accuracy by agent type":
  (per-model rows showing: model | count | avg_est_tokens | avg_actual_tokens | avg_delta | trend)
assess-codebase: append final grand total:
  (total_est_tokens | total_actual_tokens | total_delta | total_est_cost | total_actual_cost | total_delta_cost)
assess-codebase: update grand total section header from "partial" to "final"

Display to user:
  "Token usage summary: {total_actual_tokens} tokens | ${total_actual_cost}
   See docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md"
```

---

## 3. Backend (Agent & Skill Implementation)

### 3.1 Assessment Manager Agent — Phase 3 Execution

**File:** `.claude/agents/assessment-manager.md`

**New procedures to follow:**
Add before Phase 3 execution:
- Read `docs/procedures/token-estimation.md` for estimation model parameters
- Read `docs/pricing.md` for model pricing and blended cost formula

**Phase 3 execution changes:**

After all assessment agents complete (in parallel), before moving to Phase 4:

1. **Accumulate token usage:**
   - For each completed assessment agent: extract its result's `<usage>` block
   - Record: `agent_name`, `model`, `input_tokens`, `output_tokens`, `<usage>` block present (boolean)

2. **Estimate tokens for each agent:**
   - Read `docs/procedures/token-estimation.md`
   - Use estimation model with params: chars-per-token, system prompt weight (per model), base overhead
   - For assessment agents, estimate based on: system prompt weight + agent type + assessment scope
   - Formula: `est_tokens = system_prompt_weight + base_overhead + (input_size_bytes / chars_per_token)`
   - For now, use simplified estimation: base overhead (~5,000) + system prompt weight (~2,000–3,000 depending on model)
   - Result: `est_tokens` per agent (integer)

3. **Compute estimated cost:**
   - Read `docs/pricing.md` (Blended unit cost reference table)
   - Use blended cost per model: `est_cost = est_tokens × (blended_rate_per_1k_tokens / 1000)`
   - Formula per docs/pricing.md: `blended = (input_price × 0.80 + output_price × 0.20) / 1,000`
   - Precision: 4 decimal places per row (e.g., $0.0342)

4. **Extract actual tokens:**
   - If agent's `<usage>` block exists: `actual_tokens = input_tokens + output_tokens`
   - If agent's `<usage>` block is missing: set `actual_tokens = "N/A"`, log warning: `"[agent name] produced no <usage> block; token data unavailable."`

5. **Compute actual cost:**
   - If `actual_tokens` is not "N/A": `actual_cost = actual_tokens × (blended_rate / 1000)`
   - If `actual_tokens` is "N/A": set `actual_cost = "N/A"`
   - If `docs/pricing.md` missing/malformed: set `est_cost = "N/A"` and `actual_cost = "N/A"`, log warning

6. **Write Token Estimate file:**
   - Location: `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md`
   - Create directory if does not exist
   - Format: Markdown with tables (see Section 3.2 below)
   - Timestamp in log: `"Phase 3 end: wrote Token Estimate file with {N} assessment agent rows"`

**Phase 3 token file template:**

```markdown
# Token Estimate — {PREFIX} — Assessment Pipeline

> Estimates computed before execution. Actuals accumulated as agents complete.
> Assessment agents (Phase 3) actuals: filled at end of phase.
> Intervention documentation (Phase 4) actuals: filled on completion.
> Remediation agents (Phase 6) actuals: filled progressively as agents complete.
> Orchestrator row added by assess-codebase skill at pipeline end.
> Pricing model: docs/pricing.md (80% input / 20% output split).

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Assessment agents (Phase 3)

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
| generic-software-assessment | sonnet | 8234 | $0.0444 | 7891 | $0.0426 | complete |
| layered-architecture-assessment | sonnet | 7654 | $0.0413 | 8102 | $0.0437 | complete |
| ... | ... | ... | ... | ... | ... | ... |

## Intervention documentation (Phase 4)

> To be populated after Phase 4 completion.

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|

## Remediation agents — pending gate approval

No rows yet. This section will be populated after Phase 5 gate approval if remediation is approved.

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|-------------|---------------|---------------|-----------------|
| Assessment (Phase 3) | 15888 | $0.0857 | 15993 | $0.0863 |
| Intervention documentation (Phase 4) | — | — | — | — |
| Remediation (Phase 6) | — | — | — | — |

## Grand total

> Partial — updated at pipeline end.

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens | {est_tokens_total} | partial — updated at pipeline end | — | — |
| Total cost ($) | ${est_cost_total_2dp} | partial — updated at pipeline end | — | — |
```

**Error handling:**
- If `docs/procedures/token-estimation.md` is missing: log error and halt (estimation model is mandatory)
- If `docs/pricing.md` is missing or malformed: log warning, set all cost fields to "N/A", continue
- If assessment output directory does not exist: create it before writing the file
- If a row with an agent name already exists (no-op): do not re-write; skip
- If `<usage>` block is present but unparseable: log warning, treat as missing

---

### 3.2 Assessment Manager Agent — Phase 4 Update

**After intervention-documentation-standard completes:**

1. **Read intervention agent's `<usage>` block**
   - Extract: `input_tokens`, `output_tokens`, `model`

2. **Compute estimate and actual for intervention agent**
   - Follow same logic as Phase 3 agents

3. **Append row to Token Estimate file**
   - Location: Add new row under "Intervention documentation (Phase 4)" section
   - Timestamp in log: `"Phase 4 end: appended intervention-documentation-standard row to Token Estimate file"`

4. **Do NOT update phase subtotals yet**
   - Subtotals are updated only at Phase 8 (in assess-codebase)
   - Exception: if manually recalculating during Phase 6, sum the intervention row into its own subtotal

---

### 3.3 Assessment Manager Agent — Phase 6 Remediation Updates

**Before dispatching remediation agents (after gate approval):**

1. **Replace placeholder section:**
   - Read `{PREFIX}-Interventions-Index.md` (from intervention-documentation agent)
   - For each approved intervention: get assigned remediation agent + INT-NNN identifier(s)
   - Replace "Remediation — pending gate approval" section with actual approved remediation rows
   - Each row: `agent | task_scope (INT-NNN list) | model | est_tokens | est_cost | actual_tokens="pending" | actual_cost="pending" | status="pending"`

2. **Estimate tokens for remediation agents**
   - Use estimation model with intervention scope size (from INT-NNN document)
   - Conservative estimate: base overhead + system prompt weight + intervention scope size
   - Formula: `est_tokens = 5000 + system_prompt_weight + (intervention_doc_size_bytes / 4)`

3. **Compute estimated cost**
   - Same as Phase 3; use blended formula

**After each remediation agent completes:**

1. **Update corresponding row in Token Estimate file**
   - Find row by agent name (or agent name + "(rework)" if rework)
   - Set `actual_tokens` from `<usage>` block
   - Compute `actual_cost` from actual tokens
   - Set `status = "complete"`
   - Timestamp in log: `"Phase 6: updated {agent name} row in Token Estimate with actuals"`

**Rework invocations:**
- If an agent is dispatched again for the same INT-NNN (rework cycle):
  - Do NOT update the existing row
  - Append a NEW row with agent name suffixed with " (rework)"
  - Both original and rework rows are included in totals and accuracy stats

**Deferred interventions:**
- If an approved intervention is deferred (not dispatched):
  - Do NOT write a row for it in Token Estimate
  - The intervention still appears in `{PREFIX}-Approvals.md` but is skipped in token accounting

**Error handling:**
- If `<usage>` block is missing from a remediation agent: set actual_tokens="N/A", log warning, exclude from totals
- If pricing data is missing when updating: set actual_cost="N/A"

---

### 3.4 Assess-Codebase Skill — Phase 8 Finalization

**File:** `.claude/skills/assess-codebase/SKILL.md`

**New responsibilities:**

After assessment-manager completes (before displaying summary):

1. **Extract orchestrator token usage:**
   - Read the assessment-manager result's `<usage>` block
   - Extract: `subagent_tokens` (total tokens for orchestrator's entire run)
   - Extract: `duration_ms` (wall-clock duration)

2. **Read Token Estimate file:**
   - Open `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md`
   - Parse existing rows (assessment agents, intervention-documentation, remediation agents)

3. **Append orchestrator row:**
   - Add row: `assessment-manager (orchestrator) | sonnet | est_tokens | actual_tokens | status="complete"`
   - Estimate: compute reasonable estimate for orchestrator (e.g., sum of all child agent results)
   - Actual: use `subagent_tokens` from assessment-manager's `<usage>` block

4. **Append "Actuals vs Estimate" section:**
   - Create summary table with one row per agent (all agents: assessment, intervention-documentation, remediation, orchestrator)
   - Columns: `Agent | Est. tokens | Actual tokens | Delta | Delta % | Est. cost ($) | Actual cost ($) | Status`
   - Delta = actual - estimated (negative = under, positive = over)
   - Delta % = (delta / estimated) × 100 (1 decimal place; "N/A" if estimated is 0)
   - Exclude rows with "N/A" actual tokens from accuracy calculations (but show them in table)

5. **Append "Estimation accuracy by agent type" table (if ≥2 models present):**
   - Group agents by model
   - Columns: `Model | Count | Avg Est. tokens | Avg actual tokens | Avg delta | Trend`
   - Count = number of invocations with this model
   - Avg Est. tokens = mean of estimated tokens for this model
   - Avg actual tokens = mean of actual tokens (excluding "N/A"); "N/A" if all rows are N/A
   - Avg delta = mean of deltas (actual - estimated) for this model
   - Trend = "↑" if avg delta > +(estimated × 5%), "↓" if < -(estimated × 5%), "→" otherwise
     - Example: if avg estimated is 8000 and avg actual is 8500, delta is +500 (6.25% over) → "↑"

6. **Append final grand total:**
   - Sum all tokens and costs across all agents
   - Exclude rows with "N/A" actual tokens from cost totals (but include in token totals if actual is numeric)
   - Format: 
     ```markdown
     ## Grand Total
     
     | Metric | Estimated | Actual | Delta | Delta % |
     |--------|-----------|--------|-------|---------|
     | Total tokens | X | Y | ±Z | ±N.N% |
     | Total cost ($) | $X.XX | $Y.YY | ±$Z.ZZ | ±N.N% |
     | Wall-clock duration | — | Xh Ym | — | — |
     ```

7. **Update grand total section header:**
   - Change from "partial — updated at pipeline end" to "Final"

**Template snippet for Phase 8 append:**

```markdown
---

## Actuals vs Estimate

| Agent | Est. tokens | Actual tokens | Delta | Delta % | Est. cost ($) | Actual cost ($) |
|-------|-------------|---------------|-------|---------|---------------|-----------------|
| generic-software-assessment | 8234 | 7891 | -343 | -4.2% | $0.0444 | $0.0426 |
| layered-architecture-assessment | 7654 | 8102 | +448 | +5.9% | $0.0413 | $0.0437 |
| intervention-documentation-standard | 5432 | 5678 | +246 | +4.5% | $0.0293 | $0.0306 |
| god-class-decomposition | 12500 | 13200 | +700 | +5.6% | $0.0675 | $0.0712 |
| assessment-manager (orchestrator) | 15000 | 14567 | -433 | -2.9% | $0.0810 | $0.0786 |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|-----------------|-------------------|-----------|-------|
| sonnet | 5 | 9764 | 9888 | +124 | → |
| haiku | 1 | 8234 | 7891 | -343 | ↓ |

## Grand Total

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens | 49320 | 49438 | +118 | +0.2% |
| Total cost ($) | $0.2659 | $0.2667 | +$0.0008 | +0.3% |
| Wall-clock duration | — | 47m 23s | — | — |
```

**Error handling:**
- If Token Estimate file does not exist: create it from scratch using available data
- If `<usage>` block from assessment-manager is missing: set orchestrator actual_tokens="N/A", log warning
- If pricing data is missing: set all cost columns to "N/A"
- If grand total already has orchestrator row: do not duplicate; replace if already present

---

### 3.5 Token Estimation & Cost Computation

**Estimation Model (from `docs/procedures/token-estimation.md`):**

- Chars per token: 4
- System prompt weight — Haiku: ~2,000 tokens
- System prompt weight — Sonnet: ~3,000 tokens
- Base overhead per agent call: ~5,000 tokens

**Simplified estimation formula for assessment agents:**
```
est_tokens = base_overhead + system_prompt_weight + (input_size_bytes / 4)
```

For assessment agents, approximate input size as:
- Generic assessment of a medium-sized codebase: 50,000–100,000 bytes of code files
- Layered architecture assessment: 30,000–50,000 bytes of relevant files
- Concurrency assessment: 20,000–40,000 bytes of concurrent code
- Intervention documentation: 5,000–10,000 bytes (sum of all assessment outputs)

Approximate estimate per agent type:
- Assessment agents: 7,500–8,500 tokens (depending on scope)
- Intervention documentation: 5,000–6,000 tokens
- Remediation agents: 10,000–15,000 tokens (depending on intervention scope)
- Orchestrator: sum of all results (typically 12,000–20,000 tokens)

**Cost Computation (from `docs/pricing.md`):**

Read blended unit cost from `docs/pricing.md` → **Blended unit cost reference** table.

For each model (haiku, sonnet, opus):
- Look up model in table → Blended ($/1k tokens)
- `est_cost = (est_tokens / 1,000) × blended_rate_per_1k_tokens` (4 decimal places)
- `actual_cost = (actual_tokens / 1,000) × blended_rate_per_1k_tokens` (4 decimal places)

Example (Sonnet 5 promo at $0.003600 per 1k tokens):
- `(8,000 / 1,000) × $0.003600 = 8 × $0.003600 = $0.0288`

Phase subtotals and grand total use 2 decimal places (rounded up from per-row 4dp totals).

---

### 3.6 Data Model — Token Estimate File

**File location:** `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md`

**File format:** Markdown with tables, built incrementally through phases

**Sections (in order):**

1. **Header**
   ```markdown
   # Token Estimate — {PREFIX} — Assessment Pipeline
   
   > Estimates computed before execution. Actuals accumulated as agents complete.
   > ...
   > Pricing model: docs/pricing.md (80% input / 20% output split).
   ```

2. **Estimation model parameters** (static, from docs/procedures/token-estimation.md)
   ```
   | Parameter | Value |
   | Avg chars per token | 4 |
   | Haiku system prompt | ~2,000 tokens |
   | Sonnet system prompt | ~3,000 tokens |
   | Base overhead per call | ~5,000 tokens |
   | Input/output split | 80% / 20% |
   ```

3. **Assessment agents (Phase 3)** — populated at Phase 3 end
   ```
   | Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
   | generic-software-assessment | sonnet | 8234 | $0.0444 | 7891 | $0.0426 | complete |
   ```
   - One row per assessment agent
   - Status = "complete"
   - Actual tokens: integer or "N/A"
   - Actual cost: $X.XXXX or "N/A"

4. **Intervention documentation (Phase 4)** — populated at Phase 4 end
   ```
   | Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
   | intervention-documentation-standard | sonnet | 5432 | $0.0293 | 5678 | $0.0306 | complete |
   ```
   - One row per intervention-documentation invocation
   - Status = "complete"

5. **Remediation agents — pending gate approval** — added at Phase 3, updated at Phase 6
   - Phase 3–5: Placeholder section with note "No rows yet. Populated after gate approval."
   - Phase 6 (after gate): Section replaced with approved remediation agent rows
   ```
   | Agent | Task scope | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
   | god-class-decomposition | INT-001, INT-003 | sonnet | 12500 | $0.0675 | pending | pending | pending |
   | god-class-decomposition (rework) | INT-001 | sonnet | 10000 | $0.0540 | 10200 | $0.0550 | complete |
   ```
   - `Task scope`: INT-NNN identifiers (comma-separated) handled by this invocation
   - Status: "pending" → "complete"
   - Rework invocations: agent name suffixed with " (rework)"

6. **Phase subtotals** — updated progressively
   ```
   | Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
   | Assessment (Phase 3) | 15888 | $0.0857 | 15993 | $0.0863 |
   | Intervention documentation (Phase 4) | 5432 | $0.0293 | 5678 | $0.0306 |
   | Remediation (Phase 6) | 22500 | $0.1215 | pending | pending |
   ```
   - Sum of est_tokens and est_cost for all rows in phase
   - Sum of actual_tokens and actual_cost for completed rows only
   - If phase has pending rows, actual_cost shows "pending" until all rows complete
   - Exclude "N/A" rows from totals

7. **Grand total** — updated at Phase 8
   - Phase 3–7: Marked "partial — updated at pipeline end"
   - Phase 8: Final values appended
   ```
   ## Grand Total
   
   | Metric | Estimated | Actual | Delta | Delta % |
   | Total tokens | 43820 | pending | — | — |
   | Total cost ($) | $0.2365 | pending | — | — |
   ```
   - Updated to show final values with delta

8. **Actuals vs Estimate** (appended at Phase 8)
   - Summary table with per-agent delta analysis

9. **Estimation accuracy by agent type** (appended at Phase 8, if ≥2 models)
   - Analysis of accuracy trend per model

---

### 3.7 Validation Rules

**Per-row validation:**

| Field | Rule |
|-------|------|
| `est_tokens` | Positive integer; must be computed using estimation model; cannot be 0 |
| `actual_tokens` | Positive integer, "N/A", or "pending"; if numeric, must match sum of input + output from `<usage>` block |
| `est_cost` | Format: $X.XXXX (4 decimal places); must be ≥ 0; computed via blended formula |
| `actual_cost` | Format: $X.XXXX (4 decimal places), "N/A", or "pending"; must be ≥ 0; computed from actual_tokens if available |
| `model` | Must match a model in `docs/pricing.md` (e.g., "sonnet", "haiku", "opus"); default to "sonnet" if not found in agent frontmatter |
| `status` | Assessment/intervention agents: "complete" only; Remediation agents: "pending" or "complete"; Orchestrator: "complete" |
| `agent` | Non-empty string; may include " (rework)" suffix for rework invocations |
| `task_scope` | Non-empty string; comma-separated INT-NNN identifiers (e.g., "INT-001, INT-003"); only for remediation rows |

**Phase subtotal validation:**

| Field | Rule |
|-------|------|
| `est_tokens` | Sum of agent rows in phase |
| `est_cost` | Sum of per-row est_cost (format: $X.XX, 2 decimal places) |
| `actual_tokens` | Sum of agent rows with numeric actual_tokens (exclude "N/A" and "pending") |
| `actual_cost` | Sum of per-row actual_cost (format: $X.XX, 2 decimal places); "pending" if any row is "pending"; "N/A" if any row is "N/A" |

**Grand total validation:**

| Field | Rule |
|-------|------|
| `total_est_tokens` | Sum of phase subtotals |
| `total_est_cost` | Sum of phase est_cost (format: $X.XX, 2 decimal places) |
| `total_actual_tokens` | Sum of phase subtotals (exclude "N/A" and "pending") |
| `total_actual_cost` | Sum of phase actual_cost (format: $X.XX, 2 decimal places); "pending" until all rows complete; "N/A" if pricing unavailable |
| `delta_tokens` | total_actual_tokens - total_est_tokens (can be negative) |
| `delta_cost` | total_actual_cost - total_est_cost (format: $X.XX, 2 decimal places; "N/A" if pricing unavailable) |
| `delta_%` | (delta_tokens / total_est_tokens) × 100 (1 decimal place; "N/A" if total_est_tokens is 0 or pricing unavailable) |

**Actuals vs Estimate section validation:**

| Field | Rule |
|-------|------|
| `agent` | Non-empty string; exactly matches row from data sections |
| `est_tokens` | Positive integer; from corresponding data row |
| `actual_tokens` | Positive integer or "N/A"; from corresponding data row |
| `delta` | Integer; actual_tokens - est_tokens; "N/A" if actual_tokens is "N/A"; can be negative |
| `delta_%` | Decimal (1dp) or "N/A"; formula: (delta / est_tokens) × 100; "N/A" if est_tokens is 0 or actual_tokens is "N/A" |
| `est_cost` | Format: $X.XXXX; from corresponding data row |
| `actual_cost` | Format: $X.XXXX or "N/A"; from corresponding data row |

**Estimation accuracy by agent type validation:**

| Field | Rule |
|-------|------|
| `model` | Non-empty string (e.g., "sonnet", "haiku"); must appear in ≥1 agent row |
| `count` | Positive integer; number of agents with this model |
| `avg_est_tokens` | Decimal (0dp); mean of est_tokens for agents with this model |
| `avg_actual_tokens` | Decimal (0dp) or "N/A"; mean of actual_tokens (excluding "N/A" and "pending") for agents with this model |
| `avg_delta` | Decimal (0dp) or "N/A"; mean delta (actual - est); "N/A" if all actual_tokens are "N/A" or "pending" |
| `trend` | One of: "↑" (over by >5%), "↓" (under by >5%), "→" (within 5%); "N/A" if all actual_tokens are "N/A" |

---

### 3.8 Process Logging

**New log entries (in `{PREFIX}-process-log.txt`):**

Timestamp each major file operation:

```
[2026-07-14 14:32:10] Phase 3 end: wrote Token Estimate file
  Assessment agents: 5 rows (4 complete, 1 with N/A actuals)
  Location: docs/assessments/ASSESS-001/ASSESS-001-Token-Estimate.md

[2026-07-14 14:35:22] Assessment agent 'concurrency-safety-assessment' produced no <usage> block; token data unavailable

[2026-07-14 14:38:15] docs/pricing.md missing/malformed; cost columns will show N/A

[2026-07-14 14:45:30] Phase 4 end: appended intervention-documentation-standard row to Token Estimate file
  Actual tokens: 5678 | Cost: $0.0306

[2026-07-14 15:10:45] Phase 6: remediation gate approved; replacing placeholder section
  Approved interventions: 3
  Remediation agents to dispatch: 2

[2026-07-14 15:15:22] Phase 6: updated god-class-decomposition row in Token Estimate with actuals
  Actual tokens: 12100 | Cost: $0.0652

[2026-07-14 15:18:10] Phase 6: god-class-decomposition rework invocation dispatched for INT-001
  New row appended with "(rework)" suffix

[2026-07-14 16:42:08] Phase 8: appended orchestrator row and final grand total to Token Estimate file
  Orchestrator tokens: 14567 | Cost: $0.0786
  Grand total: 49438 tokens | $0.2667
```

---

## 4. File Inventory

### New files

| Path | Purpose |
|------|---------|
| `docs/procedures/assessment-token-estimation.md` | (Optional) Assessment-specific adaptation of token-estimation.md; if not created, assessment-manager references the main token-estimation.md |

### Modified files

| Path | Change description |
|------|-------------------|
| `.claude/agents/assessment-manager.md` | Add Phase 3 token estimation & file write; add Phase 4 row append; add Phase 6 remediation row management; add process logging |
| `.claude/skills/assess-codebase/SKILL.md` | Add Phase 8 finalization: orchestrator row append, actuals summary, accuracy analysis, grand total |
| `docs/procedures/token-estimation.md` | Add assessment pipeline guidance section (optional; or create separate assessment-token-estimation.md) |

---

## 5. External Integrations

### Dependency on existing files

| File | Usage | Error handling |
|------|-------|-----------------|
| `docs/procedures/token-estimation.md` | Estimation model params (chars-per-token, system prompt weights, base overhead) | If missing: log error, halt Phase 3 (mandatory) |
| `docs/pricing.md` | Model pricing for cost computation (blended unit cost per model) | If missing/malformed: log warning, set all costs to "N/A", continue (graceful) |
| `.claude/agents/{assessment-agent}.md` | Frontmatter `model` field for each assessment agent | If missing: default to "sonnet" |

### Integration with assessment output files

- Token Estimate file references and includes data from:
  - Each assessment agent's `<usage>` block (for actual tokens)
  - `{PREFIX}-Interventions-Index.md` (for INT-NNN scope in remediation rows)
  - Each remediation agent's `<usage>` block (for actual tokens)
  - assessment-manager's final `<usage>` block (for orchestrator row)

---

## 6. Security Considerations

**No sensitive data handling:**
- Token counts and cost estimates are technical metrics, not secrets
- File is written to `docs/assessments/{PREFIX}/` (same directory as public assessment outputs)
- No authentication or authorization required (assessment-manager and assess-codebase are trusted agents)

**Data integrity:**
- Token counts are extracted from agent `<usage>` blocks (authoritative source)
- Cost computation is deterministic (token count × rate from pricing.md)
- No data truncation or loss; all values stored with full precision

**File I/O safety:**
- File writes are atomic per phase (no concurrent writes expected within a single PREFIX)
- If file already exists, assess-codebase appends only; does not truncate (progressive updates)
- If a row appears to be duplicate (same agent name in same phase), skip (idempotent)

---

## 7. Database Changes

None — this feature is markdown artifact generation, not a database schema change.

---

## 8. Configuration

### Environment variables

None required. Feature reads from existing project files:
- `docs/procedures/token-estimation.md`
- `docs/pricing.md`
- Assessment output directory (passed to agents)

### Feature flags

None. Feature is always enabled once agents are updated.

---

## 9. Implementation Order

Dependency-aware sequence:

1. **Update `docs/procedures/token-estimation.md`** (or create `docs/procedures/assessment-token-estimation.md`)
   - Add guidance section for assessment pipeline token estimation
   - Define simplified estimation formula for assessment agents
   - Clarify when estimation model is applied (Phase 3 vs Phase 6)
   - *Depends on:* Nothing; provides reference material

2. **Update `.claude/agents/assessment-manager.md` — Phase 3 section**
   - Add token accumulation logic after all assessment agents complete
   - Add estimation logic (read token-estimation.md, compute est_tokens & est_cost per agent)
   - Add actual token extraction (read `<usage>` blocks, handle missing blocks)
   - Add Token Estimate file write (markdown with sections: header, estimation model, assessment agents, placeholder, phase subtotals, grand total)
   - Add process logging
   - *Depends on:* Step 1 (token-estimation.md updated)

3. **Update `.claude/agents/assessment-manager.md` — Phase 4 section**
   - Add row append after intervention-documentation-standard completes
   - Same estimation & actual extraction as Phase 3
   - *Depends on:* Step 2

4. **Update `.claude/agents/assessment-manager.md` — Phase 6 section**
   - Add placeholder section replacement (read approvals, list approved remediation agents)
   - Add remediation row estimation & initial append (with est, but actual="pending")
   - Add row update loop (as each agent completes, update its actual_tokens, actual_cost, status)
   - Add rework handling (append new row with "(rework)" suffix)
   - *Depends on:* Step 3

5. **Update `.claude/skills/assess-codebase/SKILL.md`**
   - After assessment-manager completes, read its `<usage>` block
   - Read Token Estimate file
   - Append orchestrator row (with assessment-manager's actual tokens)
   - Append "Actuals vs Estimate" section (per-agent summary)
   - If ≥2 models: append "Estimation accuracy by agent type" table
   - Append final grand total (sum all, compute deltas)
   - Update grand total header from "partial" to "final"
   - Add summary output to user
   - *Depends on:* Steps 2–4

6. **Integration testing**
   - Run a mock assessment pipeline end-to-end
   - Verify Token Estimate file is created, updated, finalized correctly
   - Verify calculations (estimates, actuals, costs, deltas)
   - Verify error handling (missing pricing.md, missing <usage> blocks, deferred interventions)
   - *Depends on:* All steps above

---

## 10. Testing Strategy

### Unit test coverage targets

**assessment-manager.md:**
- Token estimation algorithm: 100% coverage (all model types, edge cases)
- Cost computation: 100% coverage (all models, edge cases: 0 tokens, N/A pricing)
- File write/update: 100% coverage (first write, append, update, error cases)
- Process logging: 100% coverage (all log statements)

**assess-codebase/SKILL.md:**
- Usage block parsing: 100% coverage
- Orchestrator row append: 100% coverage
- Accuracy analysis: 100% coverage (summary calculation, delta computation, trend logic)
- Grand total: 100% coverage (sum, delta, percentage calculation)

### Integration test scenarios

1. **Happy path — full remediation:**
   - Run assess-codebase with mock codebase
   - Verify: Token Estimate file exists at Phase 3 with 5 assessment agents
   - Verify: Phase 4 row appended
   - Verify: User selects "Proceed with remediation"
   - Verify: Phase 6 replaces placeholder, appends remediation rows
   - Verify: As agents complete, rows updated with actuals
   - Verify: Phase 8 appends orchestrator row + summary + grand total
   - Verify: All estimates, actuals, costs, deltas are numerically correct

2. **Assessment-only path:**
   - User selects "Assessment only" at Phase 5 gate
   - Verify: Token Estimate file stops updating (no Phase 6)
   - Verify: assess-codebase appends orchestrator row + grand total
   - Verify: Remediation section remains as placeholder

3. **Missing pricing.md:**
   - Remove or corrupt `docs/pricing.md`
   - Verify: Token Estimate file written with cost columns as "N/A"
   - Verify: Token counts still populated
   - Verify: Warning logged to process log
   - Verify: Pipeline continues (not halted)

4. **Missing <usage> blocks:**
   - Mock an assessment agent with no `<usage>` block
   - Verify: Token Estimate row shows "N/A" for actual_tokens and actual_cost
   - Verify: Row excluded from phase subtotals and grand total
   - Verify: Warning logged to process log

5. **Rework cycle:**
   - Mock a remediation agent dispatched twice for same INT-NNN
   - Verify: First row + "(rework)" row both appear in Token Estimate
   - Verify: Both rows included in totals and accuracy stats

6. **Deferred intervention:**
   - Mock an approved intervention not dispatched (deferred)
   - Verify: No token row written for that intervention

### Manual verification steps

1. **Output format validation:**
   - Open `{PREFIX}-Token-Estimate.md` in markdown viewer
   - Verify: All tables render correctly
   - Verify: Headers and section formatting are readable
   - Verify: Cost values display with correct decimal places (4dp per-row, 2dp subtotal/total)

2. **Numerical accuracy:**
   - Pick a test agent: verify est_tokens matches manual calculation from estimation model
   - Verify: est_cost = est_tokens × (blended_rate / 1000)
   - Verify: actual_tokens = input_tokens + output_tokens from <usage> block
   - Verify: actual_cost computed same way as est_cost
   - Verify: Phase subtotals sum correctly
   - Verify: Grand total sums correctly
   - Verify: Deltas (actual - est) computed correctly
   - Verify: Delta % formula correct

3. **Error message quality:**
   - Verify: "missing <usage> block" warning is clear and includes agent name
   - Verify: "docs/pricing.md missing/malformed" warning is clear
   - Verify: Process log includes timestamps and operation summary (e.g., "wrote 5 agent rows")

4. **Consistency across phases:**
   - Phase 3: verify assessment agent rows are never re-written
   - Phase 4: verify intervention row appended correctly
   - Phase 6: verify placeholder replaced with actual rows (not duplicated)
   - Phase 6: verify rework rows appended (not replacing original)
   - Phase 8: verify orchestrator row appended only once

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `docs/pricing.md` is missing or out-of-date | Cost columns show "N/A" or incorrect values; reduces usefulness of cost tracking for budget planning | Graceful error handling: costs show "N/A", token counts still populated. Log warning. Process can continue. Recommend documentation requiring pricing.md to be updated when provider pricing changes. Periodic validation check (e.g., in CI) to ensure pricing.md is recent. |
| Agent `<usage>` block is missing or unparseable | Actual tokens unavailable; row shows "N/A"; skews totals if not excluded | Graceful error handling: treat as "N/A", exclude from totals, log warning. Validation logic to check for well-formed <usage> blocks. Test with mock agents. |
| Token estimation is significantly off (e.g., estimate 8000 but actual is 20000) | Cost estimates are inaccurate; accuracy analysis table shows "↑" (over-estimated) trend; reduces confidence in future estimates | Mitigate via iterative refinement: collect actual data run-to-run, periodically review accuracy table, adjust estimation model parameters in token-estimation.md. Feature inherently supports this (actuals vs estimate comparison is built-in). |
| File I/O contention (two orchestrators writing to same PREFIX simultaneously) | Potential data loss or corruption | Assume single-writer model (only one assess-codebase instance per PREFIX). If parallelism is added in future, implement file locking. For MVP: document assumption that PREFIX is unique per pipeline run. |
| Phase 6 remediation agents are retried multiple times (many rework cycles) | Token Estimate file grows very large with many "(rework)" rows; accuracy analysis table becomes hard to read | Design accommodates rework rows (each gets its own row). No hard limit on retries (by design). If this becomes a problem, could add a "rework summary" row or cap displayed rework cycles. For MVP: accept growth; document expectation that rework is rare. |
| User aborts pipeline between phases (e.g., after Phase 3 but before Phase 8) | Token Estimate file is partial; no orchestrator row or final grand total | Acceptable behavior (acknowledged in requirements). File is still valid for partial cost review. Recommend user documentation noting that incomplete runs may have "pending" or missing sections. |
| Estimation model parameters change during a run (someone updates token-estimation.md mid-pipeline) | Inconsistent estimates (Phase 3 agents estimated with old params, Phase 6 with new params) | Unlikely in practice (token-estimation.md is a stable reference file). Mitigate by documenting that token-estimation.md is frozen during active pipeline runs. For MVP: accept assumption that params do not change mid-run. |
| Assessment agent's model field is missing from frontmatter | Default to "sonnet"; may not match actual model used | Graceful fallback. Recommend validation check: scan all agent frontmatter for model field presence. Log warning if missing. For MVP: document that model field is required; add to AGENTS.md checklist. |
| Cost deltas are very small or 0 (e.g., delta_% = 0.0%) | Trend indicator "→" may be misleading if "within 5%" is too wide; user may not find small improvements meaningful | Acceptable. 5% threshold aligns with typical estimation variance. If finer-grained analysis needed, future iteration could add more granular trend buckets. For MVP: use 5% threshold. |
| Phase 5 gate approval information is unavailable when Phase 6 starts | Cannot determine which remediation agents to dispatch; cannot populate remediation rows | Mitigate by ensuring assessment-manager always reads {PREFIX}-Approvals.md before Phase 6. If file is missing, halt Phase 6 (hard error, not graceful). For MVP: assume approvals file always exists after gate. |
| Orchestrator token usage is not available until Phase 8 | Cannot estimate orchestrator cost until end; grand total is incomplete until final append | Acceptable by design (orchestrator cost is only known at end). Grand total section is marked "partial" until Phase 8 to indicate this. User understands final costs appear only at end. |

---

## 12. Open Questions Resolved

**OQ-1: Should intervention-documentation-standard row be in "Assessment phase" subtotal or separate "Intervention documentation" phase?**

**Resolution:** Create a separate "Intervention documentation (Phase 4)" section in the Token Estimate file. This clarifies phase boundaries and makes it easier to understand which costs are from assessment vs documentation. Phase subtotals table has separate rows for each phase.

**OQ-2: When a remediation agent handles multiple interventions in one call (batched), how are tokens attributed?**

**Resolution:** Row is keyed by agent name (or agent name + "(rework)" if rework). The `task_scope` column lists all INT-NNN identifiers handled in that invocation (comma-separated). Tokens are attributed to the batch as a whole, not split per intervention. If finer-grained attribution is needed in future, tokens could be pro-rated per INT-NNN, but MVP does not require this.

---

## 13. Dependencies & Assumptions

### External dependencies

- **`docs/procedures/token-estimation.md`**: Defines estimation model parameters. Feature reads at Phase 3 start. If missing, pipeline halts (non-graceful).
- **`docs/pricing.md`**: Defines model pricing for cost computation. Feature reads at Phase 3 start. If missing or malformed, feature logs warning and sets costs to "N/A" (graceful).
- **Assessment agent `<usage>` blocks**: Each agent's execution result must include a `<usage>` block (or no block). Feature handles both cases (actual tokens recorded, or "N/A" if block missing).
- **`{PREFIX}-Interventions-Index.md`**: Output from intervention-documentation-standard agent. Feature reads this to identify approved interventions and assign remediation agents (Phase 6 start). If missing, halt Phase 6.
- **`{PREFIX}-Approvals.md`**: Output from assessment approval gate. Feature reads to identify which interventions were approved and which deferred. If missing, halt Phase 6.

### Assumptions

- **Pricing data is stable during a run**: `docs/pricing.md` is not updated while a pipeline is executing. If pricing changes, the next pipeline run will see the new prices.
- **Assessment agent set is fixed at pipeline start**: No dynamic agent registration during the run.
- **File system is writable**: `docs/assessments/{PREFIX}/` is always writable by assessment-manager and assess-codebase.
- **Single-writer model**: Only one instance of assess-codebase runs for a given PREFIX at a time. No multi-writer concurrency control.
- **Orchestrator token count is available at Phase 8**: The assess-codebase skill has access to assessment-manager's `<usage>` block at completion and can extract total tokens.
- **Estimation model is always present**: `docs/procedures/token-estimation.md` exists and is readable. If missing, pipeline halts.

---

## Appendix A: Example Token Estimate File (Complete Flow)

```markdown
# Token Estimate — ASSESS-001 — Assessment Pipeline

> Estimates computed before execution. Actuals accumulated as agents complete.
> Assessment agents (Phase 3) actuals: filled at end of phase.
> Intervention documentation (Phase 4) actuals: filled on completion.
> Remediation agents (Phase 6) actuals: filled progressively as agents complete.
> Orchestrator row added by assess-codebase skill at pipeline end.
> Pricing model: docs/pricing.md (80% input / 20% output split).

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Assessment agents (Phase 3)

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
| generic-software-assessment | sonnet | 8234 | $0.0444 | 7891 | $0.0426 | complete |
| layered-architecture-assessment | sonnet | 7654 | $0.0413 | 8102 | $0.0437 | complete |
| concurrency-safety-assessment | haiku | 6521 | $0.0117 | N/A | N/A | complete |
| domain-model-refactoring | sonnet | 8000 | $0.0432 | 7954 | $0.0429 | complete |
| dependency-injection-refactoring | sonnet | 7891 | $0.0426 | 8345 | $0.0450 | complete |

## Intervention documentation (Phase 4)

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
| intervention-documentation-standard | sonnet | 5432 | $0.0293 | 5678 | $0.0306 | complete |

## Remediation agents

| Agent | Task scope | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-----------|-------|-------------|---------------|---------------|-----------------|--------|
| god-class-decomposition | INT-001, INT-003 | sonnet | 12500 | $0.0675 | 13200 | $0.0712 | complete |
| security-hardening | INT-002 | sonnet | 10000 | $0.0540 | 9876 | $0.0533 | complete |
| god-class-decomposition (rework) | INT-001 | sonnet | 10000 | $0.0540 | 10200 | $0.0550 | complete |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|-------------|---------------|---------------|-----------------|
| Assessment (Phase 3) | 38300 | $0.2066 | 38292 | $0.2065 |
| Intervention documentation (Phase 4) | 5432 | $0.0293 | 5678 | $0.0306 |
| Remediation (Phase 6) | 32500 | $0.1755 | 33276 | $0.1795 |

## Grand Total

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens | 76232 | 77246 | +1014 | +1.3% |
| Total cost ($) | $0.4114 | $0.4166 | +$0.0052 | +1.3% |

---

## Actuals vs Estimate

| Agent | Est. tokens | Actual tokens | Delta | Delta % | Est. cost ($) | Actual cost ($) |
|-------|-------------|---------------|-------|---------|---------------|-----------------|
| generic-software-assessment | 8234 | 7891 | -343 | -4.2% | $0.0444 | $0.0426 |
| layered-architecture-assessment | 7654 | 8102 | +448 | +5.9% | $0.0413 | $0.0437 |
| concurrency-safety-assessment | 6521 | N/A | N/A | N/A | $0.0117 | N/A |
| domain-model-refactoring | 8000 | 7954 | -46 | -0.6% | $0.0432 | $0.0429 |
| dependency-injection-refactoring | 7891 | 8345 | +454 | +5.8% | $0.0426 | $0.0450 |
| intervention-documentation-standard | 5432 | 5678 | +246 | +4.5% | $0.0293 | $0.0306 |
| god-class-decomposition | 12500 | 13200 | +700 | +5.6% | $0.0675 | $0.0712 |
| security-hardening | 10000 | 9876 | -124 | -1.2% | $0.0540 | $0.0533 |
| god-class-decomposition (rework) | 10000 | 10200 | +200 | +2.0% | $0.0540 | $0.0550 |
| assessment-manager (orchestrator) | 15000 | 14567 | -433 | -2.9% | $0.0810 | $0.0786 |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|-----------------|-------------------|-----------|-------|
| sonnet | 8 | 9669 | 9824 | +155 | → |
| haiku | 1 | 6521 | N/A | N/A | N/A |

## Final Grand Total

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens | 76232 | 77246 | +1014 | +1.3% |
| Total cost ($) | $0.4114 | $0.4166 | +$0.0052 | +1.3% |
| Wall-clock duration | — | 1h 14m | — | — |
```

---

## Appendix B: Assessment-Only Path (Partial File)

If user selects "Assessment only" at Phase 5 gate, the Token Estimate file contains no remediation rows but is otherwise complete:

```markdown
# Token Estimate — ASSESS-001 — Assessment Pipeline

[... header and estimation model sections ...]

## Assessment agents (Phase 3)

[5 rows with actuals filled]

## Intervention documentation (Phase 4)

[1 row with actuals filled]

## Remediation agents — pending gate approval

No rows yet. This section will be populated after Phase 5 gate approval if remediation is approved.

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|-------------|---------------|---------------|-----------------|
| Assessment (Phase 3) | 38300 | $0.2066 | 38292 | $0.2065 |
| Intervention documentation (Phase 4) | 5432 | $0.0293 | 5678 | $0.0306 |
| Remediation (Phase 6) | — | — | — | — |

## Grand Total

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens | 43732 | 43970 | +238 | +0.5% |
| Total cost ($) | $0.2359 | $0.2371 | +$0.0012 | +0.5% |

---

## Actuals vs Estimate

[6 rows: 5 assessment agents + 1 intervention agent]

---

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|-----------------|-------------------|-----------|-------|
| sonnet | 5 | 7844 | 7946 | +102 | → |

## Final Grand Total

[Same as above, now labeled "Final"]
```

Note: Remediation section remains as placeholder. Orchestrator row and accuracy summaries are appended by assess-codebase.

