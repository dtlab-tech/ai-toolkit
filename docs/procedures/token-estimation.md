# Procedure: Token Estimation

Write `{PREFIX}-Token-Estimate.md` in the feature directory after Work Breakdown is generated. Doc-gen agent actuals are filled in immediately (they have already completed). Implementation agent actuals are filled in at pipeline end. The orchestrator row is appended by the `/implement-feature` skill.

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Agent system prompt weight — haiku | ~2,000 tokens |
| Agent system prompt weight — sonnet | ~3,000 tokens |
| Base overhead per agent call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Cost estimation

Read pricing data from `docs/pricing.md`. Use the **Blended unit cost reference** table for the model in use.

Cost formula per agent call:
```
cost ($) = tokens × blended_cost_per_token
         = tokens × (input_price × 0.80 + output_price × 0.20) / 1,000,000
```

The 80/20 input/output split is defined in `docs/pricing.md` — update there if the ratio changes.

## Input token estimation per agent type

- **Doc-gen agents**: system prompt + files to read (bytes ÷ 4) + base overhead
- **Developer agents**: tech-spec section + WB task size + relevant codebase files + base overhead
- **Review agents**: all files modified in the US scope + base overhead; output ≈ 1,500 tokens fixed
- **Orchestrator**: sum of all child result sizes (as input) + process log writes (as output) + base overhead
- **Rework contingency**: add 1 extra developer + 1 review per US (30% rework probability)

## Estimate template

```markdown
# Token Estimate — {PREFIX} — {Feature Title}

> Estimates computed before execution. Doc-gen actuals filled on completion of each agent.
> Implementation actuals filled at pipeline end. Orchestrator row added by /implement-feature.
> Pricing model: docs/pricing.md (80% input / 20% output split).

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Agent token estimates and early actuals

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|------------|--------------|---------------|----------------|--------|
| generate-requirements | haiku | N | $N.NNNN | N (actual) | $N.NNNN | ✅ complete |
| generate-tech-spec | haiku | N | $N.NNNN | N (actual) | $N.NNNN | ✅ complete |
| validate-feature-docs | haiku | N | $N.NNNN | N (actual) | $N.NNNN | ✅ complete |
| generate-work-breakdown | haiku | N | $N.NNNN | N (actual) | $N.NNNN | ✅ complete |
| developer-backend (×N) | sonnet | N | $N.NNNN | — | — | ⏳ pending |
| developer-frontend (×N) | sonnet | N | $N.NNNN | — | — | ⏳ pending |
| developer-testing (×N) | sonnet | N | $N.NNNN | — | — | ⏳ pending |
| review-solution (×N) | sonnet | N | $N.NNNN | — | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | N | $N.NNNN | — | — | ⏳ pending |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | N | $N.NNNN | N (actual) | $N.NNNN |
| Phase 1 — {name} | N | $N.NNNN | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | N | partial — updated at pipeline end |
| Total cost ($) | $N.NN | partial — updated at pipeline end |
```

## Actuals template (appended at pipeline end)

```markdown
---

## Actuals vs Estimate

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
| generate-requirements | {PREFIX} | haiku | N | N | ±N | $N.NNNN | $N.NNNN | Xmin |
| generate-tech-spec | {PREFIX} | haiku | N | N | ±N | $N.NNNN | $N.NNNN | Xmin |
| validate-feature-docs | {PREFIX} | haiku | N | N | ±N | $N.NNNN | $N.NNNN | Xmin |
| generate-work-breakdown | {PREFIX} | haiku | N | N | ±N | $N.NNNN | $N.NNNN | Xmin |
| developer-backend | US-01-T01, T02 | sonnet | N | N | ±N | $N.NNNN | $N.NNNN | Xmin |
| review-solution | US-01 | sonnet | N | N | ±N | $N.NNNN | $N.NNNN | Xmin |
| project-manager (orchestrator) | — | sonnet | N | N | ±N | $N.NNNN | $N.NNNN | Xh Ymin |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|----------------|------------------|-----------|-------|
| haiku | N | N | N | ±N | ↑/↓/→ |
| sonnet | N | N | N | ±N | ↑/↓/→ |

## Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | N | N | ±N |
| Total cost ($) | $N.NN | $N.NN | ±$N.NN |
| Total wall-clock | Xh Ymin | Xh Ymin | ±Zmin |
```

## Actuals rules

- One row per invocation — rework invocations get a "(rework)" suffix
- Delta (tokens): negative = fewer tokens than estimated, positive = more
- Cost: computed with blended formula from `docs/pricing.md`; use 4 decimal places for per-agent rows, 2 decimal places for totals
- Trend: "↑" if avg delta > +5% of avg est, "↓" if avg delta < -5% of avg est, otherwise "→"
- Duration: convert `duration_ms` to minutes/seconds
- Model: read from agent frontmatter, default to `sonnet` if not set
- Missing `<usage>` block → write `N/A`, exclude from accuracy stats and cost totals

## Assessment pipeline usage

The `assessment-manager` agent reads this procedure at Phase 3 start before dispatching assessment agents, in the same way that `project-manager` reads it before dispatching implementation agents. If this file is missing, the assessment pipeline halts with an error — this is the only non-graceful failure mode in the pipeline.

### Assessment agent input size estimates

All assessment agents and the `intervention-documentation-standard` agent run on **sonnet** — use the `$0.005400/1k tokens` blended rate from `docs/pricing.md`.

Apply the standard formula with the code input sizes below:

```
est_tokens = base_overhead + system_prompt_weight + (input_size_chars / 4)
           = 5,000        + 3,000 (sonnet)        + (input_size_chars / 4)
```

| Agent | Approx. input size | Input tokens (chars ÷ 4) | Est. total tokens |
|-------|--------------------|--------------------------|-------------------|
| generic-software-assessment | ~80,000 chars of code | ~20,000 | ~28,000 |
| layered-architecture-assessment | ~50,000 chars of code | ~12,500 | ~20,500 |
| concurrency-safety-assessment | ~40,000 chars of code | ~10,000 | ~18,000 |
| other assessment agents | ~30,000 chars of code | ~7,500 | ~15,500 |
| intervention-documentation-standard | ~30,000 chars of assessment findings | ~7,500 | ~15,500 |

### Remediation agents

Remediation agents receive an intervention document (~20,000 chars, ~5,000 tokens for the doc portion) plus relevant code sections. Use the intervention doc portion as the base input estimate and add code section tokens using the standard formula. Typical total range: 13,000–25,000 tokens depending on intervention scope.

### Orchestrator (assessment-manager)

Estimate as the sum of all child agent result sizes (as input) plus process log writes (as output), following the same orchestrator rule as `project-manager`. Use **80,000 tokens** as a conservative baseline for a full pipeline run (assessment + intervention documentation + remediation phases combined).
