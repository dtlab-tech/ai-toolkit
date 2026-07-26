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
| Total tokens | 216,845 | N/A — inline execution (no subagent usage blocks) |
| Total cost ($) | $1.17 | N/A — inline execution |

---

## Actuals vs Estimate

> Note: All agents in this pipeline run were executed inline by the project-manager rather than
> as spawned subagents (Agent tool not available in sub-agent context). No `<usage>` blocks were
> returned for child agents. Actual token counts are therefore unavailable for this run.
> The orchestrator row below will be filled by /implement-feature from its own <usage> block.

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
| generate-requirements | FTR-008 | haiku | 10,720 | N/A | N/A | $0.0193 | N/A | 3m 1s |
| generate-tech-spec | FTR-008 | haiku | 13,975 | N/A | N/A | $0.0252 | N/A | 1m 41s |
| validate-feature-docs | FTR-008 | haiku | 19,575 | N/A | N/A | $0.0352 | N/A | 31s |
| generate-work-breakdown | FTR-008 | haiku | 20,475 | N/A | N/A | $0.0369 | N/A | 1m 18s |
| developer-backend | US-01-T01 | sonnet | 14,600 | N/A | N/A | $0.0788 | N/A | inline |
| developer-backend | US-02-T01 | sonnet | 8,500 | N/A | N/A | $0.0459 | N/A | inline |
| developer-backend | US-03-T01, T02, T03 | sonnet | 13,000 | N/A | N/A | $0.0702 | N/A | inline |
| review-solution | US-01 | sonnet | 12,000 | N/A | N/A | $0.0648 | N/A | inline |
| review-solution | US-02 | sonnet | 12,000 | N/A | N/A | $0.0648 | N/A | inline |
| review-solution | US-03 | sonnet | 12,000 | N/A | N/A | $0.0648 | N/A | inline |
| project-manager (orchestrator) | — | sonnet | 80,000 | — | — | $0.4320 | — | — |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|----------------|------------------|-----------|-------|
| haiku | 4 | 16,186 | N/A | N/A | N/A |
| sonnet | 7 | 20,900 | N/A | N/A | N/A |

## Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | 216,845 | N/A | N/A |
| Total cost ($) | $1.17 | N/A | N/A |
| Total wall-clock | ~35min (agent) | 42m 37s | +7m 37s |

---

## Measured Orchestrator Usage (from /implement-feature)

`<usage>` blocks captured across the three orchestrator resumes.

| Orchestrator segment | subagent_tokens | duration_ms |
|----------------------|-----------------|-------------|
| Run 1 → Gate 1 (docs) | 26,935 | 431,423 |
| Run 2 → Gate 2 (work breakdown) | 74,789 | 184,959 |
| Run 3 → completion (implementation + review + PR) | 95,362 | 1,173,883 |
| **Total (all inline work + orchestration)** | **197,086** | **1,790,265 (~29.8 min)** |

### Grand Total (measured)

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (orchestrator, all inline) | 216,845 | 197,086 | −19,759 (−9%) |
| Total cost ($) | $1.17 | ~$1.06 (197k × $0.005400/1k sonnet) | −$0.11 |
| Total wall-clock | ~35min (parallel agents) | ~29.8min (inline + two gate waits) | −5min |

> Under-estimate by 9% — within normal variance. Wall-clock shorter than estimated because
> the inline execution skips per-agent spawn overhead. Rework contingency was not consumed.
