# Token Estimate — FTR-015 — Claude Source Layout and Runtime Resolution

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
| generate-requirements | haiku | 15,000 | $0.0270 | 23,706 | $0.0427 | complete |
| generate-tech-spec | haiku | 30,000 | $0.0540 | 63,725 | $0.1147 | complete |
| validate-feature-docs | haiku | 40,000 | $0.0720 | 87,121 | $0.1568 | complete |
| generate-work-breakdown | haiku | 50,000 | $0.0900 | 107,318 | $0.1932 | complete |
| developer-backend (x29 tasks) | sonnet | 452,000 | $2.4408 | — | — | pending |
| developer-testing (x19 tasks) | sonnet | 344,000 | $1.8576 | — | — | pending |
| review-solution (x10 reviews) | sonnet | 100,000 | $0.5400 | — | — | pending |
| rework contingency (x3 est.) | sonnet | 90,000 | $0.4860 | — | — | pending |
| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | — | — | pending |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 135,000 | $0.2430 | 281,870 | $0.5074 |
| INFRA — Shared infrastructure | 116,000 | $0.6264 | pending | pending |
| US-01 — Classify files | 16,000 | $0.0864 | pending | pending |
| US-02 — Migrate test files | 52,000 | $0.2808 | pending | pending |
| US-03 — Migrate runtime assets | 18,000 | $0.0972 | pending | pending |
| US-04 — Update npm packaging | 28,000 | $0.1512 | pending | pending |
| US-05 — Catalog and installers | 146,000 | $0.7884 | pending | pending |
| US-06 — Runtime resolution | 188,000 | $1.0152 | pending | pending |
| US-07 — Doctor diagnostics | 42,000 | $0.2268 | pending | pending |
| US-08 — Dev workflow and docs | 114,000 | $0.6156 | pending | pending |
| US-09 — Migration verification | 84,000 | $0.4536 | pending | pending |
| Reviews + rework + orchestrator | 270,000 | $1.4580 | pending | pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 1,209,000 | partial — updated at pipeline end |
| Total cost ($) | $6.37 | partial — updated at pipeline end |

## Notes

- Doc-gen agents run on haiku (model: haiku per agent frontmatter). Blended rate: $0.001800/1k tokens.
- Implementation agents (developer-backend, developer-testing, review-solution, orchestrator) run on sonnet-4-6. Blended rate: $0.005400/1k tokens.
- developer-backend covers all BE domain tasks (18) and INFRA domain tasks (11) = 29 task invocations. Tasks may be batched by phase; actual invocation count may be lower.
- developer-testing covers all TEST domain tasks (19 after removing duplicate tarball test, correction #4).
- review-solution: 9 US reviews + 1 collective INFRA review = 10 invocations estimated at ~10,000 tokens each.
- Rework contingency: 30% probability × 10 US × 1 extra developer invocation (avg 20,000 tokens) + 1 extra review (10,000 tokens) = ~3 extra calls in expectation.
- Orchestrator: 80,000 tokens baseline for full pipeline run (phase coordination + process log + inter-agent messaging).
- Doc-gen actuals reflect the 6-revision cycle (R1..R6). validate-feature-docs and generate-work-breakdown token counts significantly exceed estimates due to the iterative correction process.
- US-04 token estimate increased by 4,000 (22,000 → 28,000 including task token increase after correction #4 merging the two tarball tests into one comprehensive test). US-09 reduced by 16,000 (removing the duplicate task).
