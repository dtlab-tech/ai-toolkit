# Procedure: Token Estimation

Write `{PREFIX}-Token-Estimate.md` in the feature directory after Work Breakdown is generated. Doc-gen agent actuals are filled in immediately (they have already completed). Implementation agent actuals are filled in at pipeline end. The orchestrator row is appended by the `/implement-feature` skill.

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Agent system prompt weight — haiku | ~2,000 tokens |
| Agent system prompt weight — sonnet | ~3,000 tokens |
| Base overhead per agent call | ~5,000 tokens |

## Input token estimation per agent type

- **Doc-gen agents**: system prompt + files to read (bytes ÷ 4) + base overhead
- **Developer agents**: tech-spec section + WB task size + relevant codebase files + base overhead
- **Review agents**: all files modified in the US scope + base overhead; output ≈ 1,500 tokens fixed
- **Orchestrator**: sum of all child result sizes (as input) + process log writes (as output) + base overhead
- **Rework contingency**: add 1 extra developer + 1 review per US (30% rework probability)

## Estimate template

```markdown
# Token Estimate — {PREFIX} — {Feature Title}

> Estimates computed before execution. Doc-gen actuals filled on completion of each agent.
> Implementation actuals filled at pipeline end. Orchestrator row added by /implement-feature.

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |

## Agent token estimates and early actuals

| Agent | Model | Est. tokens | Actual tokens | Status |
|-------|-------|------------|---------------|--------|
| generate-requirements | haiku | N | N (actual) | ✅ complete |
| generate-tech-spec | haiku | N | N (actual) | ✅ complete |
| validate-feature-docs | haiku | N | N (actual) | ✅ complete |
| generate-work-breakdown | haiku | N | N (actual) | ✅ complete |
| developer-backend (×N) | sonnet | N | — | ⏳ pending |
| developer-frontend (×N) | sonnet | N | — | ⏳ pending |
| developer-testing (×N) | sonnet | N | — | ⏳ pending |
| review-solution (×N) | sonnet | N | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | N | — | ⏳ pending |

## Phase subtotals

| Phase | Est. tokens | Actual tokens |
|-------|------------|---------------|
| Doc generation | N | N (actual) |
| Phase 1 — {name} | N | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | N | partial — updated at pipeline end |

## Notes

Estimation assumptions.
```

## Actuals template (appended at pipeline end)

```markdown
---

## Actuals vs Estimate

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Duration |
|-------|-------------|-------|------------|---------------|-------|----------|
| generate-requirements | {PREFIX} | haiku | N | N | ±N | Xmin |
| generate-tech-spec | {PREFIX} | haiku | N | N | ±N | Xmin |
| validate-feature-docs | {PREFIX} | haiku | N | N | ±N | Xmin |
| generate-work-breakdown | {PREFIX} | haiku | N | N | ±N | Xmin |
| developer-backend | US-01-T01, T02 | sonnet | N | N | ±N | Xmin |
| review-solution | US-01 | sonnet | N | N | ±N | Xmin |
| project-manager (orchestrator) | — | sonnet | N | N | ±N | Xh Ymin |

## Estimation accuracy by agent type

| Agent type | Invocations | Avg est. | Avg actual | Avg delta | Trend |
|-----------|------------|---------|-----------|-----------|-------|
| haiku agents | N | N | N | ±N | over/under/on-target |
| sonnet agents | N | N | N | ±N | over/under/on-target |

## Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | N | N | ±N |
| Total wall-clock | Xh Ymin | Xh Ymin | ±Zmin |
```

## Actuals rules

- One row per invocation — rework invocations get a "(rework)" suffix
- Delta: negative = fewer tokens than estimated, positive = more
- Trend: over-target if avg delta > +20%, under-target if < -20%, otherwise on-target
- Duration: convert `duration_ms` to minutes/seconds
- Model: read from agent frontmatter, default to `sonnet` if not set
- Missing `<usage>` block → write `N/A`, exclude from accuracy stats
