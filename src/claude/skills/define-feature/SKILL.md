---
description: "Define Feature — reads existing repo context, then grills only on the real gaps and writes feature.md in docs/features/FTR-XXX-slug/. Usage: /define-feature [source reference]"
disable-model-invocation: true
---

Spawn the `gaia-define-feature` agent, passing through whatever the user provided as a source reference (a backlog entry, ticket path, spec path, or free-text description). If the user gave nothing, pass an empty source.

```
subagent_type: gaia-define-feature
prompt: |
  Mode: define
  Start the feature definition session.
  Source reference (may be empty): {{user arguments verbatim}}
```

The agent runs Phase 0 (context ingestion) first — it reads AGENTS.md, the source reference, existing feature docs, and the relevant code, then pre-fills a draft and grills ONLY on the genuine gaps. Do not add instructions telling it to skip discovery.

## Handling the agent's return

This skill never writes files and never runs `check-definition` or `apply` itself. The agent resolves the features root with `ai-toolkit resolve-features-root` and performs every write.

- **DONE**: relay the written `feature.md` path or the created children, then stop. If the agent lists unevaluated signals, relay each one as described under "Unevaluated signals" below.
- **ERROR**: this covers a failed `ai-toolkit resolve-features-root` call and a `RECORD_INVALID` result. Relay the reason, state that nothing was written, and stop. Do not retry and do not continue to another phase.
- **CHECKPOINT: split-proposal**: present the proposal view below. The agent has ended its turn and has written nothing. Stop after presenting the view. Collecting the decision is a separate step.

## Grilling record

The grilling record (`record` in the CHECKPOINT block) is held in main-loop context only. Keep it in memory for the session. Never write it to disk, and never place it in any file, scratch file, or note. The record exists only so it can be passed back to the agent in the decision round.

## Proposal view

When a CHECKPOINT arrives, parse its `feature_id`, `record`, `check` and `proposal` keys, then show the user:

1. **Signal counts**: for each of actors, applications and flows, the count and the minimum from `check.signals`, and whether the minimum was met.
2. **Flows**: each flow in `check.flows` by name, with its one-line reason.
3. **Children**: for each entry in `proposal.children`, show the child's name and one-line purpose. Show its Summary and Keywords as editable items, and say that the user may edit them.
4. **Order**: the dependency order from `proposal.order`.
5. **Shared parts**: the grilling answers assigned to the first child, from `proposal.shared_first_child`.
6. **Unevaluated signals**: every name in `check.unevaluated`, each with the statement that this signal could not be evaluated and so did not count toward the split threshold.

## Unevaluated signals

Unevaluated signals are reported in every path, not only the flagged one. When the agent returns DONE, or any other return, and names signals that could not be evaluated, relay each name with the statement that it could not be evaluated and therefore did not count toward the split threshold.
