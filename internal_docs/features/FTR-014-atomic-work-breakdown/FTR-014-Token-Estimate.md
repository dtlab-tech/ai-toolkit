# Token Estimate — FTR-014 — Atomic Work Breakdown

## Phase 1 — Documentation (Actuals)

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | — | 10,771 | €0.0143 |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | — | 15,652 | €0.0207 |
| validate-feature-docs | Validate requirements + tech spec | haiku | — | — | 6,441 | €0.0085 |
| **Phase 1 total** | | | **—** | **—** | **32,864** | **€0.0435** |

## Phase 2 — Work Breakdown (Actuals)

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | — | 16,219 | €0.0215 |
| **Phase 2 total** | | | **—** | **—** | **16,219** | **€0.0215** |

## Phase 3 — Implementation (Actuals)

Inline tasks (12 BE + 2 TEST) were executed in the main conversation loop without dispatching a measurable subagent; their tokens are not_available and are never substituted with 0.

| Agent | Task / Scope | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|-------------|-------|------------|------------|--------------|--------------|
| developer-backend | 44 BE+INFRA tasks (32 obs., 12 inline) | sonnet | 540,000 | €2.6827 | 1,396,882 (partial) | €6.9397 (partial) |
| developer-testing | 18 TEST tasks (16 obs., 2 inline) | sonnet | 144,000 | €0.7154 | 873,774 (partial) | €4.3409 (partial) |
| review-solution | Full post-impl. review (entire FTR-014 scope) | sonnet | 56,000 | €0.2782 | 105,767 | €0.5255 |
| remediation | CRITICAL + W1 + W2 + W3 + I5 + I6 (6 items) | sonnet | 10,000 | €0.0497 | not_available | not_available |
| pr-and-registry | Push branch, create PR | sonnet | 5,000 | €0.0248 | — (pending) | — |
| write-actuals | Update Token/Effort Estimate | sonnet | 3,000 | €0.0149 | not_available | not_available |
| **Phase 3 total** | | | **758,000** | **€3.7657** | **2,376,423 (partial)** | **€11.8061 (partial)** |

## Grand Total

| Phase | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------------|------------|--------------|--------------|
| Phase 1 — Documentation | — | — | 32,864 | €0.0435 |
| Phase 2 — Work Breakdown | — | — | 16,219 | €0.0215 |
| Phase 3 — Implementation | 758,000 | €3.7657 | 2,376,423 (partial) | €11.8061 (partial) |
| **Total** | **758,000** | **€3.7657** | **2,425,506 (partial)** | **€11.8711 (partial)** |

---
*Not_available items (never substituted with 0): inline developer-backend tasks — US-03 T01–T03, US-05 T02–T06, US-06 T01–T03, US-07 T02 (12 tasks); inline developer-testing tasks — US-07 T04–T05 (2 tasks); all 6 remediation items (CRITICAL, W1, W2, W3, I5, I6); write-actuals (this operation). pr-and-registry pending.*
*Actual phase 3 tokens exceed estimate (2,376,423 vs 758,000 est.) because baseline assumptions (~15k/BE, ~5k/INFRA, ~8k/TEST) underestimated a complex structural validation system. Partial total — not_available entries excluded.*
*Cost assumes 80% input / 20% output token split. Pricing: sonnet $3.00/$15.00 per 1M, haiku $0.80/$4.00 per 1M (USD). Rate: $1 = €0.92 (2026-07-31, see docs/token-pricing.json).*
*Haiku blended rate: €1.3248/Mtok. Sonnet blended rate: €4.968/Mtok.*
