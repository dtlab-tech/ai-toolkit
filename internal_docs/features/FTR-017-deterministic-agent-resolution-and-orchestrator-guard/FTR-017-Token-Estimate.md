# Token Estimate — FTR-017 — Deterministic Agent Resolution and Orchestrator Guard

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
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | — | 16099 | — |
| **Phase 2 total** | | | **—** | **—** | **16099** | **—** |

## Phase 3 — Implementation (Estimates)

Estimates aggregated from each task's `estimate.tokens` in the Work Breakdown JSON:
58 tasks (BE: 45, FE: 0, DB: 0, INFRA: 0, TEST: 13), 13 User Stories.
BE/INFRA-phase tasks total 1,154,000 tokens; TEST tasks total 378,000 tokens.

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| developer-backend | Implement BE tasks (incl. INFRA phase) | sonnet | 1154000 | €5.7331 | — | — |
| developer-testing | Implement TEST tasks | sonnet | 378000 | €1.8779 | — | — |
| review-solution (×13) | Architect review per US | sonnet | 104000 | €0.5167 | — | — |
| remediation | Fix review issues | sonnet | ~10,000 | €0.0497 | — | — |
| pr-and-registry | Push branch, create PR | sonnet | ~5,000 | €0.0248 | — | — |
| write-actuals | Update Token/Effort Estimate | sonnet | ~3,000 | €0.0149 | — | — |
| **Phase 3 total** | | | **1654000** | **€8.2171** | **—** | **—** |

For the "Est. cost €" column in Phase 3: use the formula tokens * (0.8 * 3.00 + 0.2 * 15.00) / 1_000_000 * 0.92 for sonnet rows. Round to 4 decimal places, prefix with €.

## Grand Total

| Phase | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------------|------------|--------------|--------------|
| Phase 1 — Documentation | — | — | — (filled by orchestrator) | — |
| Phase 2 — Work Breakdown | — | — | 16099 | — |
| Phase 3 — Implementation | 1654000 | €8.2171 | — | — |
| **Total** | **1654000** | **€8.2171** | **16099 (partial)** | **— (partial)** |

---
*Actuals will be appended by pm-phase3 after implementation completes.*
*Cost assumes 80% input / 20% output token split. Pricing: sonnet $3.00/$15.00 per 1M, haiku $0.80/$4.00 per 1M (USD). Rate: $1 = €0.92 (see docs/token-pricing.json).*
