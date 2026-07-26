# Token Estimate — FTR-008 — Compact Instructions Block

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
| generate-requirements | haiku | 10,720 | $0.0193 | N/A | N/A | ✅ complete |
| generate-tech-spec | haiku | 13,975 | $0.0252 | N/A | N/A | ✅ complete |
| validate-feature-docs | haiku | 19,575 | $0.0352 | N/A | N/A | ✅ complete |
| generate-work-breakdown | haiku | 20,475 | $0.0369 | N/A | N/A | ✅ complete |
| developer-backend (×3 USs) | sonnet | 36,100 | $0.1949 | — | — | ⏳ pending |
| review-solution (×3) | sonnet | 36,000 | $0.1944 | — | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | — | — | ⏳ pending |

> Note: Agents ran inline (no subagent dispatch available in this context). Actual token counts
> are not available from `<usage>` blocks as the doc-gen agents were executed directly by the
> project-manager rather than as spawned subagents. Values marked N/A accordingly.

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 64,745 | $0.1166 | N/A | N/A |
| Phase 1 — US-01 Section Logic | 14,600 | $0.0788 | ⏳ pending | ⏳ pending |
| Phase 2 — US-02 + US-03 setup | 21,500 | $0.1161 | ⏳ pending | ⏳ pending |
| Phase 3 — US-03 completion + tests | 13,000 | $0.0702 | ⏳ pending | ⏳ pending |
| Review (×3 USs) | 36,000 | $0.1944 | ⏳ pending | ⏳ pending |
| Orchestrator | 80,000 | $0.4320 | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 216,845 | partial — updated at pipeline end |
| Total cost ($) | $1.17 | partial — updated at pipeline end |
