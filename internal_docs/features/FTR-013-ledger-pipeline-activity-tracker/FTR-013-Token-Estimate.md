# Token Estimate — FTR-013 — Ledger as Full Pipeline Activity Tracker

## Phase 1 — Documentation (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | 7,671 |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | 14,140 |
| validate-feature-docs | Validate requirements + tech spec (cycle 1) | haiku | — | 4,931 |
| **Phase 1 total** | | | **—** | **26,742** |

## Phase 2 — Work Breakdown (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | 10,231 |
| **Phase 2 total** | | | **—** | **10,231** |

## Phase 3 — Implementation (Est. vs Actual, by role)

Estimates based on 17 tasks (BE:15, TEST:2), 4 User Stories.
Baseline: ~15,000 tokens/BE task, ~8,000/TEST task, ~5,000/INFRA task.

| Role | Model | Tokens Est. | Tokens Actual | Delta |
|------|-------|------------|--------------|-------|
| developer-backend | sonnet | 225,000 | 949,946 | +724,946 |
| developer-testing | sonnet | 16,000 | 526,813 | +510,813 |
| review-solution | sonnet | 32,000 | 386,709 | +354,709 |
| remediation | sonnet | ~10,000 | — | — |
| pr-and-registry | sonnet | ~5,000 | — | — |
| write-actuals | sonnet | ~3,000 | — | — |
| **Phase 3 total** | | **291,000** | **1,863,468** | **+1,572,468** |

### Phase 3 — per-agent detail (actuals)

| Agent | Model | Tokens Actual |
|-------|-------|--------------|
| developer-backend:INFRA | sonnet | 47,205 |
| review-solution:INFRA | sonnet | 12,978 |
| developer-backend:US-01 | sonnet | 87,528 |
| developer-testing:US-01 | sonnet | 39,240 |
| review-solution:US-01 | sonnet | 92,276 |
| developer-backend:US-02 | sonnet | 72,788 |
| developer-testing:US-02 | sonnet | 51,199 |
| review-solution:US-02 | sonnet | 45,274 |
| developer-backend:US-02:rework1 | sonnet | 79,373 |
| developer-testing:US-02:rework1 | sonnet | 106,106 |
| review-solution:US-02 | sonnet | 22,097 |
| developer-backend:US-03 | sonnet | 127,151 |
| developer-testing:US-03 | sonnet | 28,310 |
| review-solution:US-03 | sonnet | 89,007 |
| developer-backend:US-03:rework1 | sonnet | 209,843 |
| developer-testing:US-03:rework1 | sonnet | 77,107 |
| review-solution:US-03 | sonnet | 35,853 |
| developer-backend:US-03:rework2 | sonnet | 16,187 |
| developer-testing:US-03:rework2 | sonnet | 57,483 |
| review-solution:US-03 | sonnet | 14,724 |
| developer-backend:US-04 | sonnet | 162,208 |
| developer-testing:US-04 | sonnet | 102,379 |
| review-solution:US-04 | sonnet | 45,814 |
| developer-backend:US-04:rework1 | sonnet | 91,556 |
| developer-testing:US-04:rework1 | sonnet | 44,593 |
| review-solution:US-04 | sonnet | 13,119 |
| developer-backend:US-04:rework2 | sonnet | 55,107 |
| developer-testing:US-04:rework2 | sonnet | 20,396 |
| review-solution:US-04 | sonnet | 15,567 |
| **Detail total** | | **1,863,468** |

## Grand Total

| Phase | Tokens Est. | Tokens Actual | Delta |
|-------|------------|--------------|-------|
| Phase 1 — Documentation | — | 26,742 | — |
| Phase 2 — Work Breakdown | — | 10,231 | — |
| Phase 3 — Implementation | 291,000 | 1,863,468 | +1,572,468 |
| **Total** | **291,000** | **1,900,441** | **+1,609,441** |

## Implementation Summary

| Metric | Value |
|--------|-------|
| Implementation phases done | 5 |
| US passed | US-01, US-02, US-03, US-04 |
| US escalated | none |

> **Note:** Phase 3 actuals significantly exceed estimates. FTR-013 is a cross-cutting change
> touching 4 workflow files with complex in-place update logic. US-03 and US-04 required 2 rework
> cycles each due to review findings. Estimate baseline (~15k tokens/BE task) underestimated
> the complexity of multi-file JS workflow changes with atomic read-modify-write patterns.
