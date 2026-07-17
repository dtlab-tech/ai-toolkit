# Token Estimate — FTR-004 — Assessment Registry

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
| generate-requirements | haiku | 10,000 | $0.0180 | 18,279 | $0.0329 | ✅ complete |
| generate-tech-spec | haiku | 15,000 | $0.0270 | 46,199 | $0.0832 | ✅ complete |
| validate-feature-docs | haiku | 22,000 | $0.0396 | 31,071 | $0.0559 | ✅ complete |
| generate-work-breakdown | haiku | 22,000 | $0.0396 | 41,735 | $0.0751 | ✅ complete |
| developer-backend (×4) | sonnet | 68,000 | $0.3672 | — | — | ⏳ pending |
| developer-testing (×3) | sonnet | 45,000 | $0.2430 | — | — | ⏳ pending |
| review-solution (×6) | sonnet | 72,000 | $0.3888 | — | — | ⏳ pending |
| rework contingency (~30%) | sonnet | 58,000 | $0.3132 | — | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | 35,000 | $0.1890 | — | — | ⏳ pending |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 69,000 | $0.1242 | 137,284 | $0.2471 |
| Phase 1 — Shared Infrastructure | 17,000 | $0.0918 | ⏳ pending | ⏳ pending |
| Phase 2 — Core Registry Write | 61,000 | $0.3294 | ⏳ pending | ⏳ pending |
| Phase 3 — Edge Cases and Testing | 65,000 | $0.3510 | ⏳ pending | ⏳ pending |
| Orchestrator | 35,000 | $0.1890 | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 347,000 | partial — updated at pipeline end |
| Total cost ($) | $1.63 | partial — updated at pipeline end |
