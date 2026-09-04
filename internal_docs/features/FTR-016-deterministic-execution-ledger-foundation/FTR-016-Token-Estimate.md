# Token Estimate — FTR-016 — Deterministic Execution Ledger Foundation

## Phase 1 — Documentation (Actuals)

Phase 1 ran in a separate workflow (pm-phase1); its per-agent token actuals are filled in
by the orchestrator after implementation. Leave the Tokens Actual cells as "—" here.

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | — | — | — |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | — | — | — |
| validate-feature-docs | Validate requirements + tech spec | haiku | — | — | — | — |
| **Phase 1 total** | | | **—** | **—** | **—** | **—** |

## Phase 2 — Work Breakdown (Actuals)

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | — | 44102 | — |
| **Phase 2 total** | | | **—** | **—** | **44102** | **—** |

## Phase 3 — Implementation (Estimates)

Estimates based on 40 tasks (BE: 26, FE: 0, DB: 0, INFRA: 0, TEST: 14), 11 User Stories.
Per-task implementation tokens are taken **directly from `FTR-016-Work-Breakdown.json` `estimate.tokens`**:
BE-domain tasks sum to 750,000; TEST-domain tasks sum to 336,000 (implementation total 1,086,000).
Review / remediation / PR / write-actuals rows are fixed orchestration baselines (not task-derived).

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| developer-backend | Implement BE tasks (26, incl. INFRA-phase BE) | sonnet | 750000 | €3.7260 | — | — |
| developer-testing | Implement TEST tasks (14) | sonnet | 336000 | €1.6692 | — | — |
| review-solution (×11) | Architect review per US | sonnet | 88000 | €0.4372 | — | — |
| remediation | Fix review issues | sonnet | 10000 | €0.0497 | — | — |
| pr-and-registry | Push branch, create PR | sonnet | 5000 | €0.0248 | — | — |
| write-actuals | Update Token/Effort Estimate | sonnet | 3000 | €0.0149 | — | — |
| **Phase 3 total** | | | **1192000** | **€5.9219** | **—** | **—** |

For the "Est. cost €" column in Phase 3: use the formula tokens * (0.8 * 3.00 + 0.2 * 15.00) / 1_000_000 * 0.92 for sonnet rows. Round to 4 decimal places, prefix with €.

## Grand Total

| Phase | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------------|------------|--------------|--------------|
| Phase 1 — Documentation | — | — | — (filled by orchestrator) | — |
| Phase 2 — Work Breakdown | — | — | 44102 | — |
| Phase 3 — Implementation | 1192000 | €5.9219 | — | — |
| **Total** | **1192000** | **€5.9219** | **44102 (partial)** | **— (partial)** |

---
*Actuals will be appended by pm-phase3 after implementation completes.*
*Cost assumes 80% input / 20% output token split. Pricing: sonnet $3.00/$15.00 per 1M, haiku $0.80/$4.00 per 1M (USD). Rate: $1 = €0.92 (see docs/token-pricing.json).*
