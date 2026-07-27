# Token Estimate — FTR-007 — Explicit Per-Agent Model Assignment

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

Blended rates used (docs/pricing.md): haiku $0.001800/1k, sonnet $0.005400/1k, opus $0.009000/1k.

## Agent token estimates and early actuals

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|------------|--------------|---------------|----------------|--------|
| generate-requirements | haiku | 9,200 | $0.0166 | N/A (ran inline in orchestrator) | N/A | ✅ complete |
| generate-tech-spec | haiku | 11,600 | $0.0209 | N/A (ran inline in orchestrator) | N/A | ✅ complete |
| validate-feature-docs | haiku | 13,800 | $0.0248 | N/A (ran inline in orchestrator) | N/A | ✅ complete |
| generate-work-breakdown | haiku | 13,000 | $0.0234 | N/A (ran inline in orchestrator) | N/A | ✅ complete |
| developer-backend (×1, US-01 batch) | sonnet | 44,600 | $0.2408 | — | — | ⏳ pending |
| developer-testing (×1, US-02) | sonnet | 10,000 | $0.0540 | — | — | ⏳ pending |
| review-solution (×1, US-01) | opus | 43,000 | $0.3870 | — | — | ⏳ pending |
| rework contingency (30%: +1 dev +1 review) | mixed | 55,000 | $0.2045 | — | — | ⏳ pending |
| project-manager (orchestrator) | sonnet | 40,000 | $0.2160 | — | — | ⏳ pending |

> Environment note: no separate Task/Agent spawn tool was available, so the four haiku doc-gen agents executed inline within the orchestrator context. Their token cost is therefore folded into the orchestrator actuals rather than reported as standalone `<usage>` blocks — hence N/A actuals above.

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|------------|--------------|---------------|----------------|
| Doc generation | 47,600 | $0.0857 | folded into orchestrator | folded into orchestrator |
| Phase 1 — US-01 (dev backend + review) | 87,600 | $0.6278 | ⏳ pending | ⏳ pending |
| Phase 2 — US-02 (dev testing) | 10,000 | $0.0540 | ⏳ pending | ⏳ pending |
| Rework contingency | 55,000 | $0.2045 | ⏳ pending | ⏳ pending |

## Grand total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | ~240,200 | partial — updated at pipeline end |
| Total cost ($) | ~$0.98 | partial — updated at pipeline end |

---

## Actuals vs Estimate

> Environment constraint: no separate Task/Agent spawn tool was available in this run, so every child agent (doc-gen haiku agents, developer, review) executed **inline within the orchestrator context**. No standalone `<usage>` blocks were emitted per child agent; per the token-estimation procedure, missing `<usage>` → `N/A`, excluded from accuracy stats. All token consumption is attributed to the single orchestrator invocation below.

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
| generate-requirements | FTR-007 | haiku | 9,200 | N/A (inline) | — | $0.0166 | N/A | — |
| generate-tech-spec | FTR-007 | haiku | 11,600 | N/A (inline) | — | $0.0209 | N/A | — |
| validate-feature-docs | FTR-007 | haiku | 13,800 | N/A (inline) | — | $0.0248 | N/A | — |
| generate-work-breakdown | FTR-007 | haiku | 13,000 | N/A (inline) | — | $0.0234 | N/A | — |
| developer-backend | US-01-T01, T02 | sonnet | 44,600 | N/A (inline) | — | $0.2408 | N/A | — |
| developer-testing | US-02-T01 | sonnet | 10,000 | N/A (inline) | — | $0.0540 | N/A | — |
| review-solution | US-01 | opus | 43,000 | N/A (inline) | — | $0.3870 | N/A | — |
| project-manager (orchestrator) | — | sonnet | 40,000 | folded — all above | — | $0.2160 | see note | ~49min |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|----------------|------------------|-----------|-------|
| haiku | 4 | 11,900 | N/A (inline) | N/A | → |
| sonnet | 3 | 31,533 | N/A (inline) | N/A | → |
| opus | 1 | 43,000 | N/A (inline) | N/A | → |

## Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | ~240,200 | N/A — all inline in orchestrator (no per-agent usage blocks) | — |
| Total cost ($) | ~$0.98 | N/A (see note) | — |
| Total wall-clock | ~15min (agent, parallel) | ~49min (single-threaded inline run incl. gates) | +34min |

> Note: Because rework did not occur (0 issues), the 30% rework-contingency line ($0.2045 / 55,000 tok) in the pre-execution estimate was not consumed. Effective estimate excluding contingency: ~185,200 tokens / ~$0.78.

---

## Measured Orchestrator Usage (from /implement-feature)

The `<usage>` blocks captured by the `/implement-feature` wrapper across the three
orchestrator resumes (Gate 1 stop, Gate 2 stop, final completion). Since every child
agent ran inline, this is the authoritative real token total for the whole pipeline.

| Orchestrator segment | subagent_tokens | duration_ms |
|----------------------|-----------------|-------------|
| Run 1 → Gate 1 (docs) | 75,100 | 370,176 |
| Run 2 → Gate 2 (work breakdown) | 81,243 | 467,177 |
| Run 3 → completion (implementation + review + PR) | 100,917 | 2,787,638 |
| **Total (all inline work + orchestration)** | **257,260** | **3,624,991 (~60.4 min)** |

### Grand Total (measured)

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | ~240,200 (~185,200 excl. contingency) | 257,260 (orchestrator, all inline) | +17,060 vs full est. / +72,060 vs no-contingency |
| Total wall-clock | ~15min (parallel agents) | ~60.4min (single-threaded inline incl. two gate waits) | +45min |

> The wall-clock delta is dominated by the two human-approval gate pauses, not compute.
> The token total lands close to the full pre-execution estimate (within ~7%) despite the
> contingency going unused — expected, since inline execution folds four separate agent
> system-prompt overheads into one continuous context rather than paying per-spawn base cost.
