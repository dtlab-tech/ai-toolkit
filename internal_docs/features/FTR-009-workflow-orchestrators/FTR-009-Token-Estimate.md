# Token Estimate — FTR-009 — Rewrite Orchestrators as Workflow Scripts

> Estimates computed before execution. Doc-gen actuals filled on completion of each agent.
> Implementation actuals filled at pipeline end. Orchestrator row added by /implement-feature.
> Pricing model: docs/pricing.md (80% input / 20% output split).
> Note: doc-gen agents ran inline (no subagent boundary) — actual tokens unavailable (N/A).

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
| generate-requirements | haiku | 10,400 | $0.0187 | N/A | N/A | ✅ complete |
| generate-tech-spec | haiku | 25,750 | $0.0464 | N/A | N/A | ✅ complete |
| validate-feature-docs | haiku | 19,500 | $0.0351 | N/A | N/A | ✅ complete |
| generate-work-breakdown | haiku | 22,625 | $0.0407 | — | — | ⏳ pending |
| developer-backend (×3) | sonnet | 69,000 | $0.3726 | — | — | ⏳ pending |
| review-solution (×4) | sonnet | 80,000 | $0.4320 | — | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | — | — | ⏳ pending |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 78,275 | $0.1409 | N/A | N/A |
| Implementation phases | 171,625 | $0.9261 | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 307,900 | partial — updated at pipeline end |
| Total cost ($) | $1.44 | partial — updated at pipeline end |
