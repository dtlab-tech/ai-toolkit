# Token Estimate — FTR-010 — Unit Test Suite — CLI Logic and Frontmatter Validation

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
| generate-requirements | sonnet | — | — | — | — | complete |
| generate-tech-spec | sonnet | — | — | — | — | complete |
| validate-feature-docs | sonnet | — | — | — | — | complete |
| generate-work-breakdown | sonnet | — | — | — | — | complete |
| implementation-orchestrator | sonnet | — | — | 27612 | — | complete |
| pr-and-registry | sonnet | — | — | 2827 | — | complete |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | — | — | — | — |
| Implementation (pm-phase3) | — | — | 30439 | — |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | — | 30439 (pm-phase3 exact) |
| Total cost ($) | — | — |

---

## Actuals vs Estimate

> Per-agent values are proportional distributions of the phase total.
> Phase totals (pm-phase3 total: 30439 tokens) are exact measurements.
> Individual agent breakdown is estimated proportionally.

| Agent | Task / Scope | Model | Phase delta tokens | Notes |
|-------|-------------|-------|-------------------|-------|
| implementation-orchestrator | — | sonnet | 27612 | exact phase delta |
| pr-and-registry | — | sonnet | 2827 | exact phase delta |

## Grand Total (pm-phase3)

| Metric | Value |
|--------|-------|
| Total tokens (pm-phase3) | 30439 (exact) |
| Implementation phases | 4 |
| US passed | US-01, US-02, US-03, US-04 |
| US escalated | none |

---

## Actuals vs Estimate — Full Pipeline

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|-------------|---------------|-------|---------------|-----------------|----------|
| generate-requirements | Generate requirements | haiku | — | 6,579 | N/A | — | $0.0035 | — |
| generate-tech-spec | Generate tech spec | haiku | — | 14,156 | N/A | — | $0.0077 | — |
| validate-feature-docs (cycle 1) | Validate docs | haiku | — | 3,034 | N/A | — | $0.0016 | — |
| validate-feature-docs (cycle 2) | Validate docs | haiku | — | 3,553 | N/A | — | $0.0019 | — |
| generate-work-breakdown | Generate work breakdown | haiku | — | 9,305 | N/A | — | $0.0050 | — |
| implementation-orchestrator | Full implementation loop | sonnet | — | 27,612 | N/A | — | $0.1491 | — |
| pr-and-registry | Push branch, create PR | sonnet | — | 2,827 | N/A | — | $0.0153 | — |
| write-actuals | Update Token/Effort Estimate | sonnet | — | 1,844 | N/A | — | $0.0100 | — |
| project-manager/pm-phase3 (orchestrator) | — | sonnet | 80,000 | 138,664 | +58,664 | $0.4320 | $0.7488 | 45min 42s |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|-----------------|-------------------|-----------|-------|
| haiku | 5 | N/A | 7,325 | N/A | — |
| sonnet | 4 | N/A | 42,737 | N/A | — |

## Grand Total (Final)

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens (all agents) | 80,000 | 138,664 | +58,664 | +73.3% |
| Total cost ($) | $0.4320 | $0.7488 | +$0.3168 | +73.3% |
| Total wall-clock | — | 45min 42s | — | — |
