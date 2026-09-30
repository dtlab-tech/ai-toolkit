# Token Estimate — FTR-018 — Deterministic Task Execution, Checkpoints and Resume

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
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | — | — | — |
| **Phase 2 total** | | | **—** | **—** | **—** | **—** |

## Phase 3 — Implementation (Estimates)

Estimates based on **46 tasks** (BE: 34, FE: 0, DB: 0, INFRA: 5, TEST: 7), 9 User Stories.
Task-implementation rows are the **bottom-up sum of each task's own `estimate.tokens`** from
`FTR-018-Work-Breakdown.json` (INFRA-domain tasks use `developer-backend`), consistent with the
effort reconciliation — not a flat per-domain heuristic. Overhead rows (review, remediation, PR,
write-actuals) remain heuristic allowances and are listed separately from the task-implementation sum.

| Agent | Task | Model | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------|-------|------------|------------|--------------|--------------|
| developer-backend | Implement BE/INFRA tasks (Σ 39 tasks' `estimate.tokens`) | sonnet | 1109000 | €5.5095 | — | — |
| developer-testing | Implement TEST tasks (Σ 7 tasks' `estimate.tokens`) | sonnet | 205000 | €1.0184 | — | — |
| **Task-implementation subtotal** | 46 tasks (bottom-up) | | **1314000** | **€6.5279** | **—** | **—** |
| review-solution (×9) | Architect review per US (overhead) | sonnet | 72000 | €0.3577 | — | — |
| remediation | Fix review issues (overhead) | sonnet | ~10,000 | €0.0497 | — | — |
| pr-and-registry | Push branch, create PR (overhead) | sonnet | ~5,000 | €0.0248 | — | — |
| write-actuals | Update Token/Effort Estimate (overhead) | sonnet | ~3,000 | €0.0149 | — | — |
| **Phase 3 total** | task-impl + overhead | | **1404000** | **€6.9751** | **—** | **—** |

> The US-09-TASK-TEST-02 real-runtime paid E2E carries `estimate.tokens = 0` in the Work
> Breakdown by design (a planned, authorized run whose token cost depends on feature size); it
> is therefore excluded from the sums above.
>
> **Actual (2026-09-30):** executed under Approvals.md cycles 7–8, against an isolated
> throwaway fixture (never this repo). Real observed cost **$0.155639** across 2 real
> `dispatchTaskAttempt` calls (both hit `budget_exhausted` before the fixture task completed —
> outcome PARTIAL, not a full checkpoint-to-commit cycle). Full record:
> `evidence/FTR-018-e2e/run-manifest.json`. This is a genuinely observed cost for a distinct,
> isolated qualification run — excluded from the Phase 3 sums above (which track this feature's
> own delivery-pipeline cost, not the runtime-bridge qualification run's cost).

## Grand Total

| Phase | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € |
|-------|------------|------------|--------------|--------------|
| Phase 1 — Documentation | — | — | — (filled by orchestrator) | — |
| Phase 2 — Work Breakdown | — | — | — | — |
| Phase 3 — Implementation | 1404000 | €6.9751 | — | — |
| **Total** | **1404000** | **€6.9751** | **— (partial)** | **— (partial)** |

---
*Actuals will be appended by pm-phase3 after implementation completes.*
*Cost assumes 80% input / 20% output token split. Pricing: sonnet $3.00/$15.00 per 1M, haiku $0.80/$4.00 per 1M (USD). Rate: $1 = €0.92 (see docs/token-pricing.json).*
