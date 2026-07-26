# Token Estimate — FTR-009 — Rewrite Orchestrators as Workflow Scripts

> Estimates computed before execution. Doc-gen actuals filled on completion of each agent.
> Implementation actuals filled at pipeline end. Orchestrator row added by /implement-feature.
> Pricing model: docs/pricing.md (80% input / 20% output split).
> Note: doc-gen agents ran inline (no subagent boundary) — actual tokens unavailable (N/A).

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
| generate-requirements | haiku | 10,400 | $0.0187 | N/A | N/A | ✅ complete |
| generate-tech-spec | haiku | 25,750 | $0.0464 | N/A | N/A | ✅ complete |
| validate-feature-docs | haiku | 19,500 | $0.0351 | N/A | N/A | ✅ complete |
| generate-work-breakdown | haiku | 22,625 | $0.0407 | N/A | N/A | ✅ complete |
| developer-backend (×3) | sonnet | 69,000 | $0.3726 | N/A | N/A | ✅ complete |
| review-solution (×4) | sonnet | 80,000 | $0.4320 | N/A | N/A | ✅ complete |
| project-manager (orchestrator) | sonnet | 80,000 | $0.4320 | N/A | N/A | ✅ complete |

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 78,275 | $0.1409 | N/A | N/A |
| Implementation phases | 171,625 | $0.9261 | N/A | N/A |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | 307,900 | N/A (pipeline ran inline — no subagent boundaries) |
| Total cost ($) | $1.44 | N/A |

> Note: All agents ran inline in the orchestrator context (CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2 with project-manager as subagent at depth 2). This is precisely the condition FTR-009 addresses — actual per-agent token data is unavailable for this run. The new workflow-based pipeline will produce real per-agent actuals from the next run forward.
