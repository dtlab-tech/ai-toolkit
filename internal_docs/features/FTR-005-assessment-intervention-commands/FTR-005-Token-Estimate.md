# Token Estimate — FTR-005 — Assessment Intervention Commands

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
| generate-requirements | haiku | 9,500 | $0.0171 | 14,200 | $0.0256 | complete |
| generate-tech-spec | haiku | 11,500 | $0.0207 | 19,800 | $0.0356 | complete |
| validate-feature-docs | haiku | 14,000 | $0.0252 | 11,400 | $0.0205 | complete |
| generate-work-breakdown | haiku | 15,000 | $0.0270 | 13,800 | $0.0248 | complete |
| developer-backend (×2, US-01 + US-02) | sonnet | 33,000 | $0.1782 | — | — | pending |
| review-solution (×2, US-01 + US-02) | sonnet | 26,000 | $0.1404 | — | — | pending |
| developer-backend rework contingency (×2, 30%) | sonnet | 33,000 | $0.1782 | — | — | pending |
| review-solution rework contingency (×2, 30%) | sonnet | 26,000 | $0.1404 | — | — | pending |
| project-manager (orchestrator) | sonnet | 60,000 | $0.3240 | — | — | pending |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 50,000 | $0.0900 | 59,200 | $0.1065 |
| Phase 1 — Command Implementation | 118,000 | $0.6372 | pending | pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 228,000 | partial — updated at pipeline end |
| Total cost ($) | $1.23 | partial — updated at pipeline end |

---

## Notes

- Doc-gen actuals are from the process log token ledger (generate-requirements: 14,200; generate-tech-spec: 19,800; validate-feature-docs: 11,400; generate-work-breakdown: 13,800).
- Developer agents use sonnet (blended $0.005400/1k). Rework contingency adds 30% probability × 2 US = ~1 expected extra dev + review pair each; shown as separate rows.
- Orchestrator estimate uses 60,000 tokens as a conservative baseline for this pipeline size (2 US, 1 phase, light coordination overhead vs. the 80,000 baseline for full assessment pipelines).
- All sonnet estimates use Claude Sonnet 4.6 rate ($3.00/$15.00 per MTok; blended $0.005400/1k).
