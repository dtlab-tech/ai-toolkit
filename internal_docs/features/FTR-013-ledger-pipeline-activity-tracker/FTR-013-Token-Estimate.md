# Token Estimate — FTR-013 — Ledger as Full Pipeline Activity Tracker

## Phase 1 — Documentation (Actuals)

Phase 1 ran in a separate workflow (pm-phase1); its per-agent token actuals are filled in
by the orchestrator after implementation. Leave the Tokens Actual cells as "—" here.

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | — |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | — |
| validate-feature-docs | Validate requirements + tech spec | haiku | — | — |
| **Phase 1 total** | | | **—** | **—** |

## Phase 2 — Work Breakdown (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | — |
| **Phase 2 total** | | | **—** | **—** |

## Phase 3 — Implementation (Estimates)

Estimates based on 17 tasks (BE:15, TEST:2), 4 User Stories.
Baseline: ~15,000 tokens/BE task, ~8,000/TEST task, ~5,000/INFRA task.

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| developer-backend | Implement BE/INFRA tasks | sonnet | 225,000 | — |
| developer-testing | Implement TEST tasks | sonnet | 16,000 | — |
| review-solution (×4) | Architect review per US | sonnet | 32,000 | — |
| remediation | Fix review issues | sonnet | ~10,000 | — |
| pr-and-registry | Push branch, create PR | sonnet | ~5,000 | — |
| write-actuals | Update Token/Effort Estimate | sonnet | ~3,000 | — |
| **Phase 3 total** | | | **291,000** | **—** |

## Grand Total

| Phase | Tokens Est. | Tokens Actual |
|-------|------------|--------------|
| Phase 1 — Documentation | — | — (filled by orchestrator) |
| Phase 2 — Work Breakdown | — | — |
| Phase 3 — Implementation | 291,000 | — |
| **Total** | **291,000** | **— (partial — Phase 1 & 3 pending)** |

---
*Actuals will be appended by pm-phase3 after implementation completes.*
