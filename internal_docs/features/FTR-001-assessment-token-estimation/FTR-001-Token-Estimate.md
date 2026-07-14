# Token Estimate — FTR-001 — Assessment Pipeline Token Estimation

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
| generate-requirements | haiku | 18,000 | $0.0324 | 23,585 | $0.0425 | ✅ complete |
| generate-tech-spec | haiku | 32,000 | $0.0576 | 53,092 | $0.0956 | ✅ complete |
| validate-feature-docs | haiku | 30,000 | $0.0540 | 50,072 | $0.0901 | ✅ complete |
| generate-work-breakdown | haiku | 28,000 | $0.0504 | 59,185 | $0.1065 | ✅ complete |
| developer-backend (×7) | sonnet | 266,000 | $1.4364 | — | — | ⏳ pending |
| review-solution (×7) | sonnet | 126,000 | $0.6804 | — | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | — | — | ⏳ pending |

> developer-backend: 7 calls × 38,000 tokens each (3k sys + 5k overhead + ~30k WB tasks + codebase context)
> review-solution: 7 calls × 18,000 tokens each (3k sys + 5k overhead + ~10k modified files)
> orchestrator: estimated 80k tokens (child result sizes as input + process log writes as output)

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 108,000 | $0.1944 | 185,934 | $0.3347 |
| Implementation (Phase 1–6) | 392,000 | $2.1168 | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 500,000 | partial — updated at pipeline end |
| Total cost ($) | $2.31 | partial — updated at pipeline end |
