# Token Estimate — FTR-002 — Assessment Pipeline Effort Estimation

> Estimates computed before execution. Doc-gen actuals filled on completion of each agent.
> Implementation actuals filled at pipeline end. Orchestrator row added by /implement-feature.
> Pricing model: docs/pricing.md (80% input / 20% output split).
> Model in use: Claude Sonnet 4.6 — $0.005400/1k tokens blended.

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
| generate-requirements | sonnet | 9,500 | $0.0513 | 0 | $0.0000 | ⏭ skipped (doc already existed) |
| generate-tech-spec | sonnet | 15,500 | $0.0837 | 0 | $0.0000 | ⏭ skipped (doc already existed) |
| validate-feature-docs | sonnet | 20,500 | $0.1107 | 0 | $0.0000 | ⏭ skipped (doc already existed) |
| generate-work-breakdown | sonnet | 25,500 | $0.1377 | 50,387 | $0.2721 | ✅ complete |
| developer-backend US-01 | sonnet | 22,000 | $0.1188 | — | — | ⏳ pending |
| review-solution US-01 | sonnet | 18,000 | $0.0972 | — | — | ⏳ pending |
| developer-backend US-02 | sonnet | 24,000 | $0.1296 | — | — | ⏳ pending |
| review-solution US-02 | sonnet | 18,000 | $0.0972 | — | — | ⏳ pending |
| developer-backend US-03 | sonnet | 18,000 | $0.0972 | — | — | ⏳ pending |
| review-solution US-03 | sonnet | 18,000 | $0.0972 | — | — | ⏳ pending |
| developer-backend US-04 | sonnet | 20,000 | $0.1080 | — | — | ⏳ pending |
| review-solution US-04 | sonnet | 18,000 | $0.0972 | — | — | ⏳ pending |
| rework contingency (×4 US × 30%) | sonnet | 24,000 | $0.1296 | — | — | ⏳ pending (30% probability) |
| project-manager (orchestrator) | sonnet | 40,000 | $0.2160 | — | — | ⏳ pending |

> Rework contingency: 1 extra developer + 1 extra review per US × 4 US × 30% probability = 0.30 × (22000+18000+24000+18000+18000+18000+20000+18000) / 4 per US avg ≈ 0.30 × (40000 × 4) / 4 = 0.30 × 40000 = 12000 per US rounded to 6000/US × 4 = 24000 tokens total allocated.

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation (skipped) | 71,000 | $0.3834 | 50,387 | $0.2721 |
| Phase 1 — Shared Infrastructure | included in Phase 2 | — | ⏳ pending | ⏳ pending |
| Phase 2 — US-01: Write Effort Estimate File | 40,000 | $0.2160 | ⏳ pending | ⏳ pending |
| Phase 3 — US-02: Finalise Remediation Section | 42,000 | $0.2268 | ⏳ pending | ⏳ pending |
| Phase 4 — US-03: Gate Display | 36,000 | $0.1944 | ⏳ pending | ⏳ pending |
| Phase 5 — US-04: Remove Phases 6/7 | 38,000 | $0.2052 | ⏳ pending | ⏳ pending |
| Rework contingency | 24,000 | $0.1296 | ⏳ pending | ⏳ pending |
| Orchestrator | 40,000 | $0.2160 | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 291,000 | partial — 50,387 (doc-gen) — updated at pipeline end |
| Total cost ($) | $1.57 | partial — $0.27 — updated at pipeline end |

> Note: Est. tokens exclude generate-requirements, generate-tech-spec, and validate-feature-docs actuals (those agents were skipped; prior runs recorded their actuals as 0 this session). The estimated column retains the estimates for completeness; actual tokens for those rows are 0 (docs already approved from a prior session).
