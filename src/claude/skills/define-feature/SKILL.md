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
- **CHECKPOINT: split-proposal**: present the proposal view below. The agent has ended its turn and has written nothing. Present the proposal view, then collect the user's decision as described under "Decision round".

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

## Decision round

After the proposal view, ask the user once, in the main loop, to choose one option:

- `accept`: the proposal is confirmed as shown.
- `edit`: the user gives free-text edits to names, purposes, dependency order, shared parts, Summary or Keywords.
- `reject`: continue as one standalone feature.

The user's decision is the only trigger for a write. Nothing is written before accept or reject. The skill never writes files and never runs `check-definition` or `apply` itself. The decision is collected in the main loop, and the agent is never asked for it.

Re-invoke the agent with this decision block. The `record` and `proposal` values come from the CHECKPOINT block held in main-loop context, not from disk:

```
Mode: define
CHECKPOINT: decision
feature_id: {FTR-XXX}
decision: accept | edit | reject
record: <unchanged JSON from the PROPOSAL block>
proposal: <unchanged, or with the user's edits applied>
edits: "<user's free-text edits>"    # only when decision = edit
```

Routing per decision:

- **accept**: re-invoke with `decision: accept` and the proposal unchanged. Relay the DONE result. An ERROR is handled as under "Handling the agent's return".
- **reject**: re-invoke with `decision: reject`. Relay the DONE result and state that the feature continues as one standalone feature. Relay the sentence "Checkpoint 2 remains available for this feature." unchanged when the result contains it.
- **edit**: re-invoke with `decision: edit`, the `edits` text, and the proposal unchanged. The agent returns a revised CHECKPOINT block with `violations` and `foundationWarnings`. Report each violation. Show the foundation warning from the returned block for each entry in `foundationWarnings`. Then re-present the revised proposal with the proposal view and return to this decision round. The next decision carries the revised `proposal`. Repeat until the user chooses accept or reject. Edit rounds write nothing.

## Non-flagged result

When the spawn returns with no CHECKPOINT block, status `skipped` or `not-flagged`, no proposal is shown.

- **`skipped`**: relay the agent's stop reason and stop. Show no Keywords prompt.
- **`not-flagged`**: show the Keywords prompt that the agent returns, with the derived Keywords as an editable item. Collect the confirmed keywords in the main loop and pass them back as `confirmed_keywords: "<k1,k2>"`. The name must be aligned with US-02-TASK-BE-01 before implementation. Also name each `unevaluated` signal, as described under "Unevaluated signals".

## Unevaluated signals

Unevaluated signals are reported in every path, not only the flagged one. When the agent returns DONE, or any other return, and names signals that could not be evaluated, relay each name with the statement that it could not be evaluated and therefore did not count toward the split threshold.
