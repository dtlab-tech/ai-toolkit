# Token Estimate — FTR-001 — Assessment Pipeline Token Estimation

> Estimates computed before execution. Doc-gen actuals filled on completion of each agent.
> Implementation actuals filled at pipeline end. Orchestrator row added by /implement-feature.
> Pricing model: docs/pricing.md (80% input / 20% output split).
> Note: this is a toolkit-internal feature delivered by project-manager, not assess-codebase.

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
| developer-backend (×5) | sonnet | 266,000 | $1.4364 | 215,236 | $1.1623 | ✅ complete |
| review-solution (×2) | sonnet | 126,000 | $0.6804 | 116,304 | $0.6280 | ✅ complete |
| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | — | — | ⏳ pending |

> developer-backend: 7 calls × 38,000 tokens each (3k sys + 5k overhead + ~30k WB tasks + codebase context)
> review-solution: 7 calls × 18,000 tokens each (3k sys + 5k overhead + ~10k modified files)
> orchestrator: estimated 80k tokens (child result sizes as input + process log writes as output)

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 108,000 | $0.1944 | 185,934 | $0.3347 |
| Implementation (Phase 1–6) | 392,000 | $2.1168 | 331,540 | $1.7903 |

| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | N/A | N/A | ✅ complete |

> Orchestrator tokens tracked as child agent totals; own session tokens unavailable from within the run.

## Grand total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens | 500,000 | 517,474 (child agents) | +17,474 |
| Total cost ($) | $2.31 | $2.13 | −$0.18 |

---

## Actuals vs Estimate

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
| generate-requirements | FTR-001 | haiku | 18,000 | 23,585 | +5,585 | $0.0324 | $0.0425 | 1m 59s |
| generate-tech-spec | FTR-001 | haiku | 32,000 | 53,092 | +21,092 | $0.0576 | $0.0956 | 4m 12s |
| validate-feature-docs | FTR-001 | haiku | 30,000 | 50,072 | +20,072 | $0.0540 | $0.0901 | 1m 13s |
| generate-work-breakdown | FTR-001 | haiku | 28,000 | 59,185 | +31,185 | $0.0504 | $0.1065 | 1m 55s |
| developer-backend | INFRA-T01, T02 | sonnet | 38,000 | 48,450 | +10,450 | $0.2052 | $0.2616 | 1m 34s |
| developer-backend | US-01 (T01–T07) | sonnet | 38,000 | 65,006 | +27,006 | $0.2052 | $0.3510 | ~110m |
| developer-backend | US-02, US-05 | sonnet | 38,000 | 36,976 | −1,024 | $0.2052 | $0.1997 | 5m 34s |
| developer-backend | US-04 | sonnet | 38,000 | 34,832 | −3,168 | $0.2052 | $0.1881 | 3m 01s |
| developer-backend | US-03, US-06 | sonnet | 38,000 | 30,454 | −7,546 | $0.2052 | $0.1644 | 11m 50s |
| review-solution | all changed files | sonnet | 18,000 | 67,841 | +49,841 | $0.0972 | $0.3663 | ~78m |
| developer-backend (rework) | fix 2 CRITICALs + 6 WARNINGs | sonnet | 38,000 | 51,518 | +13,518 | $0.2052 | $0.2782 | 8m |
| review-solution (rework) | re-review after rework | sonnet | 18,000 | 48,463 | +30,463 | $0.0972 | $0.2617 | ~17m |
| project-manager (orchestrator) | — | sonnet | 80,000 | N/A | N/A | $0.4320 | N/A | ~2h 30m |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|----------------|------------------|-----------|-------|
| haiku | 4 | 27,000 | 46,484 | +19,484 (+72%) | ↑ |
| sonnet | 8 | 38,750 | 47,942 | +9,192 (+24%) | ↑ |
