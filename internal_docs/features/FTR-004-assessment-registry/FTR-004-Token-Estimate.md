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
| developer-backend (×3 calls) | sonnet | 68,000 | $0.3672 | 104,678 | $0.5652 | ✅ complete |
| developer-testing (×2 calls) | sonnet | 45,000 | $0.2430 | 96,540 | $0.5213 | ✅ complete |
| review-solution (×2 calls) | sonnet | 72,000 | $0.3888 | 98,461 | $0.5317 | ✅ complete |
| rework contingency | sonnet | 58,000 | $0.3132 | included above | — | ✅ complete |
| project-manager (orchestrator) | sonnet | 35,000 | $0.1890 | 90,597 | $0.4892 | ✅ complete |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 69,000 | $0.1242 | 137,284 | $0.2471 |
| Phase 1 — Shared Infrastructure | 17,000 | $0.0918 | 49,670 | $0.2682 |
| Phase 2 — Core Registry Write | 61,000 | $0.3294 | 55,008 | $0.2970 |
| Phase 3 — Edge Cases and Testing | 65,000 | $0.3510 | 140,001 | $0.7560 |
| Orchestrator | 35,000 | $0.1890 | 90,597 | $0.4892 |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 347,000 | 472,560 (incl. orchestrator) |
| Total cost ($) | $1.63 | $2.56 (incl. orchestrator) |

---

## Actuals vs Estimate

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
| generate-requirements | FTR-004 | haiku | 10,000 | 18,279 | +8,279 | $0.0180 | $0.0329 | 1min 14s |
| generate-tech-spec | FTR-004 | haiku | 15,000 | 46,199 | +31,199 | $0.0270 | $0.0832 | 2min 25s |
| validate-feature-docs | FTR-004 | haiku | 22,000 | 31,071 | +9,071 | $0.0396 | $0.0559 | 42s |
| generate-work-breakdown | FTR-004 | haiku | 22,000 | 41,735 | +19,735 | $0.0396 | $0.0751 | 2min |
| developer-backend | INFRA-T01, INFRA-T02 | sonnet | 17,000 | 49,670 | +32,670 | $0.0918 | $0.2682 | 1min 32s |
| developer-backend | US-01-T01–T06, US-02-T01–T05 | sonnet | 34,000 | 55,008 | +21,008 | $0.1836 | $0.2970 | 4min 11s |
| developer-backend (rework) | assessment-manager WARNINGs | sonnet | — | N/A | — | — | — | — |
| developer-testing | US-01-T07–T10, US-02-T06, US-03-T02, US-04-T01, US-05-T01, US-06-T01–T03 | sonnet | 45,000 | 30,000 | -15,000 | $0.2430 | $0.1620 | — |
| developer-testing (rework) | test spec CRITICAL fixes | sonnet | — | 66,540 | — | — | $0.3593 | 4min 55s |
| review-solution | assessment-manager Phase 6 | sonnet | 36,000 | 25,000 | -11,000 | $0.1944 | $0.1350 | — |
| review-solution | FTR-004-Test-Spec.md | sonnet | 36,000 | 73,461 | +37,461 | $0.1944 | $0.3967 | 16min 19s |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|----------------|------------------|-----------|-------|
| haiku | 4 | 17,250 | 34,321 | +17,071 | ↑ |
| sonnet | 7 | 31,857 | 49,954 | +18,097 | ↑ |

## Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents, excl. orchestrator) | 312,000 | 381,963 | +69,963 |
| Total cost ($) | $1.44 | $2.07 | +$0.63 |
| Total wall-clock | ~2h 55min | ~35min | -2h 20min |
