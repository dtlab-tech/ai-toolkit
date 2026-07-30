# Token Estimate — FTR-011 — Installer Manifest and Orphan Pruning

## Phase 1 — Documentation (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | 7532 |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | 8687 |
| validate-feature-docs | Validate requirements + tech spec | haiku | — | 5473 |
| **Phase 1 total** | | | **—** | **8677** |

## Phase 2 — Work Breakdown (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | 9000 |
| **Phase 2 total** | | | **—** | **9000** |

## Phase 3 — Implementation (Estimates)

Estimates based on 22 tasks (DB:0, BE:12, FE:0, INFRA:0, TEST:10), 6 User Stories.
Baseline: ~15,000 tokens/BE task, ~8,000/TEST task, ~5,000/INFRA task.

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| developer-backend | Implement BE/INFRA tasks | sonnet | 180000 | — |
| developer-testing | Implement TEST tasks | sonnet | 80000 | — |
| review-solution (×6) | Architect review per US | sonnet | 48000 | — |
| remediation | Fix review issues | sonnet | ~10,000 | — |
| pr-and-registry | Push branch, create PR | sonnet | ~5,000 | — |
| write-actuals | Update Token/Effort Estimate | sonnet | ~3,000 | — |
| **Phase 3 total** | | | **326000** | **—** |

## Grand Total

| Phase | Tokens Est. | Tokens Actual |
|-------|------------|--------------|
| Phase 1 — Documentation | — | 8677 |
| Phase 2 — Work Breakdown | — | 9000 |
| Phase 3 — Implementation | 326000 | — |
| **Total** | **326000** | **17677 (partial)** |

---
*Actuals will be appended by pm-phase3 after implementation completes.*
