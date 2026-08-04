# Token Estimate — FTR-012 — Installer Bash Allowlist

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

## Phase 3 — Implementation (Est. vs Actual, by role)

Estimates based on 17 tasks (BE:9, INFRA:4, TEST:4), 5 User Stories.
Baseline: ~15,000 tokens/BE task, ~8,000/TEST task, ~5,000/INFRA task.

| Agent | Task | Model | Tokens Est. | Tokens Actual | Delta |
|-------|------|-------|------------|--------------|-------|
| developer-backend | Implement BE/INFRA tasks | sonnet | 155,000 | 47,004 | -107,996 |
| developer-testing | Implement TEST tasks | sonnet | 32,000 | 35,918 | +3,918 |
| review-solution (×5) | Architect review per US | sonnet | 40,000 | 59,548 | +19,548 |
| remediation | Fix review issues | sonnet | ~10,000 | — | — |
| pr-and-registry | Push branch, create PR | sonnet | ~5,000 | 12,437 | +7,437 |
| write-actuals | Update Token/Effort Estimate | sonnet | ~3,000 | — | — |
| final-test-run | Final test run | haiku | — | 320 | — |
| **Phase 3 total** | | | **245,000** | **155,227** | **-89,773** |

### Phase 3 — per-agent detail (actuals)

| Agent | Model | Tokens Actual |
|-------|-------|--------------|
| developer-backend:INFRA | sonnet | 0 |
| review-solution:INFRA | sonnet | 0 |
| developer-backend:US-01 | sonnet | 3,672 |
| developer-testing:US-01 | sonnet | 4,698 |
| review-solution:US-01 | sonnet | 10,443 |
| developer-backend:US-02 | sonnet | 8,879 |
| developer-testing:US-02 | sonnet | 10,813 |
| developer-backend:US-05 | sonnet | 29,141 |
| review-solution:US-02 | sonnet | 15,485 |
| developer-testing:US-05 | sonnet | 9,025 |
| review-solution:US-05 | sonnet | 10,197 |
| developer-backend:US-03 | sonnet | 5,312 |
| developer-testing:US-03 | sonnet | 3,740 |
| review-solution:US-03 | sonnet | 14,261 |
| developer-testing:US-04 | sonnet | 7,642 |
| review-solution:US-04 | sonnet | 9,162 |
| final-test-run | haiku | 320 |
| pr-and-registry | sonnet | 12,437 |
| **Detail total** | | **155,227** |

## Grand Total

| Phase | Tokens Est. | Tokens Actual | Delta |
|-------|------------|--------------|-------|
| Phase 1 — Documentation | — | — | — |
| Phase 2 — Work Breakdown | — | — | — |
| Phase 3 — Implementation | 245,000 | 155,227 | -89,773 |
| **Total** | **245,000** | **155,227** | **-89,773** |

## Implementation Summary

| Metric | Value |
|--------|-------|
| Implementation phases done | 6 |
| US passed | US-01, US-02, US-05, US-03, US-04 |
| US escalated | none |
