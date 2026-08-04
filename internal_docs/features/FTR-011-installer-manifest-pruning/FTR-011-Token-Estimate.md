# Token Estimate — FTR-011 — Installer Manifest and Orphan Pruning

## Phase 1 — Documentation

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | 7,532 |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | 8,687 |
| validate-feature-docs | Validate requirements + tech spec | haiku | — | 5,473 |
| **Phase 1 total** | | | **—** | **21,692** |

## Phase 2 — Work Breakdown

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | 8,677 |
| **Phase 2 total** | | | **—** | **8,677** |

## Phase 3 — Implementation (Est. vs Actual, by role)

Estimates were made per role (22 tasks: BE:12, TEST:10, 6 User Stories, review ×6).
Actuals are grouped from the per-agent ledger below to align with the estimate rows.

| Role | Model | Tokens Est. | Tokens Actual | Delta |
|------|-------|------------|--------------|-------|
| developer-backend (BE/INFRA + reworks) | sonnet | 180,000 | 111,182 | −68,818 (−38%) |
| developer-testing (TEST) | sonnet | 80,000 | 160,831 | +80,831 (+101%) |
| review-solution (×10 incl. re-reviews) | sonnet | 48,000 | 208,970 | +160,970 (+335%) |
| remediation | sonnet | 10,000 | 0 | −10,000 (folded into rework cycles) |
| pr-and-registry | sonnet | 5,000 | 2,120 | −2,880 |
| final-test-run | haiku | — | 339 | — (centralized single run) |
| write-actuals | sonnet | 3,000 | 3,560 | +560 |
| **Phase 3 total** | | **326,000** | **487,002** | **+161,002 (+49%)** |

> `write-actuals` (3,560) is included in the estimate reconciliation total above but
> cannot fully measure its own consumption; the budget-tracked Phase 3 delta excluding
> it is **483,442**.

### Phase 3 — per-agent detail (actuals)

| Agent | Model | Tokens Actual |
|-------|-------|--------------|
| developer-backend:INFRA | sonnet | 9,895 |
| review-solution:INFRA | sonnet | 11,770 |
| developer-backend:INFRA:rework1 | sonnet | 37,322 |
| review-solution:INFRA | sonnet | 10,925 |
| developer-backend:INFRA:rework2 | sonnet | 15,070 |
| review-solution:INFRA | sonnet | 13,999 |
| developer-backend:US-01 | sonnet | 10,412 |
| developer-backend:US-02 | sonnet | 9,869 |
| developer-backend:US-03 | sonnet | 11,071 |
| developer-backend:US-04 | sonnet | 11,565 |
| developer-testing:US-01 | sonnet | 12,557 |
| developer-testing:US-02 | sonnet | 42,868 |
| developer-testing:US-03 | sonnet | 20,991 |
| developer-testing:US-04 | sonnet | 78,986 |
| review-solution:US-01 | sonnet | 33,768 |
| review-solution:US-02 | sonnet | 27,783 |
| review-solution:US-03 | sonnet | 41,126 |
| review-solution:US-04 | sonnet | 15,498 |
| developer-backend:US-05 | sonnet | 2,933 |
| review-solution:US-05 | sonnet | 19,959 |
| developer-backend:US-05:rework1 | sonnet | 3,045 |
| review-solution:US-05 | sonnet | 24,755 |
| developer-testing:US-06 | sonnet | 5,429 |
| review-solution:US-06 | sonnet | 9,387 |
| final-test-run | haiku | 339 |
| pr-and-registry | sonnet | 2,120 |
| **Detail total (budget-tracked)** | | **483,442** |

## Grand Total

| Phase | Tokens Est. | Tokens Actual | Delta |
|-------|------------|--------------|-------|
| Phase 1 — Documentation | — | 21,692 | — |
| Phase 2 — Work Breakdown | — | 8,677 | — |
| Phase 3 — Implementation | 326,000 | 483,442 | +157,442 (+48%) |
| **Total** | **326,000** | **513,811** | **+187,811** |

## Notes on accuracy

- **review-solution** was the largest overrun (+335% vs estimate): the review loop ran
  10 times (INFRA ×3 and US-05 ×2 due to rework cycles, plus one per remaining US). The
  48k estimate assumed a single clean review per US.
- **developer-testing** overran (+101%): US-02 and US-04 test files were substantially
  larger than the ~8k/task baseline (42.9k and 79.0k respectively).
- **developer-backend** came in under estimate (−38%) despite two INFRA reworks.
- **final-test-run** cost just 339 tokens — the centralized single test run replaced
  N per-agent build/test runs, as intended.

## Implementation Summary

| Metric | Value |
|--------|-------|
| Implementation phases done | 7 (INFRA + US-01…US-06) |
| US passed | US-01, US-02, US-03, US-04, US-05, US-06 |
| US escalated | none |
| Rework cycles | INFRA ×2, US-05 ×1 |
| Test suite | 163/163 passing (11 suites) |
