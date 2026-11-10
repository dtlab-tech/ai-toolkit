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

## Late-child route (`--epic`)

Route a request to late-child mode when it names an existing epic with `--epic <FTR-ID>`:

```text
route(user_request):
  if request contains --epic <FTR-ID>:
      mode = "late-child"          # epic ID named by the user
  elif request is ambiguous between a new feature and a late child:
      ask user: "new feature, or add a missing child to an existing epic?"   # no spawn yet
  else:
      mode = "define"
```

In late-child mode there is no grilling round. Before any spawn, ask the user two questions in the main loop, one at a time:

1. the child title (a short name for the new child), stored as `childTitle`
2. the child purpose (one line), stored as `childPurpose`

Do not ask grilling questions on this path. Then spawn the agent with this prompt. The `Mode:` line is the first line:

```text
Mode: late-child
epicId: {{FTR-ID from --epic}}
childTitle: {{childTitle}}
childPurpose: {{childPurpose}}
Start the feature definition session.
Source reference (may be empty): {{user arguments verbatim}}
```

The agent resolves the features root with `ai-toolkit resolve-features-root` and performs the epic lookup. No path is hard-coded in this skill. Relay the agent's report on each refusal:

- A missing epic (no folder under the features root named by the ID, or by the ID and a hyphen, that contains `epic.md`) creates nothing.
- An epic whose registry status is not `epic` is refused and creates nothing. There is no standalone fallback.
- If the child's `feature.md` already exists, the agent reports it and stops. Nothing is overwritten.

This skill never writes files and never runs `check-definition`, `apply`, or `register` itself.

## Late-child proposal (LATE_PROPOSAL)

This section applies only to late-child mode. The split decision round below does not apply to a late child.

When the agent returns a `CHECKPOINT: late-child-proposal` block, this skill calls it the LATE_PROPOSAL. The agent has ended its turn and has written nothing. The block carries `epic_id`, `proposal.child` (name, purpose, summary, keywords) and `depends_on`, which names the epic's previous last child.

Show the proposal in the main loop:

```text
Late child proposal for epic {epicId}
  Name:     {child.name}
  Purpose:  {child.purpose}
  Summary:  {child.summary}     (editable)
  Keywords: {child.keywords}    (editable)
  Position: last; depends on {previousLastChild}
```

Then ask the user once, in the main loop, to choose accept, edit or reject. The user may also edit Summary and Keywords. A subagent cannot ask mid-run, so the skill asks the question, and the agent is never asked for the decision.

Re-invoke the agent in late-child mode. The `Mode:` line is the first line. There is no `record`, because the late path has no grilling round:

```text
Mode: late-child
CHECKPOINT: decision
epicId: {epicId}
decision: accept | edit | reject
proposal: child: {"name":"...","purpose":"...","summary":"...","keywords":[...]}    # unchanged, or with the user's Summary and Keywords edits
edits: "<user's free-text edits>"    # only when decision = edit
```

Routing per decision:

1. **accept**: re-invoke with `decision: accept` and the proposal unchanged. The agent runs `apply --parent {epicId}` with the one child. On DONE, relay the created child path and child ID, then stop. The skill never calls `register` for a late child. On an error, relay the apply error text as reported and stop. Offer no retry, edit or reject choice, because the partial-apply offer applies to the define path only.
2. **edit**: re-invoke with `decision: edit`, the `edits` text and the proposal as held. The agent validates the edit and returns a revised LATE_PROPOSAL with `violations` and `foundationWarnings`. Report each violation and each foundation warning, then re-present the revised proposal and ask again. Edits require a new explicit accept. Edit rounds write nothing.
3. **reject**: re-invoke with `decision: reject`. The agent writes nothing and reports "no child created". Relay that result and stop. There is no standalone fallback: do not offer a standalone feature or any other alternative.

The skill never writes files and never runs `check-definition`, `apply` or `register` itself. The epic and its registry entry are unchanged unless `apply` succeeds on accept, and `register` is not called for a late child in any case.

## Handling the agent's return

This skill never writes files and never runs `check-definition` or `apply` itself. The agent resolves the features root with `ai-toolkit resolve-features-root` and performs every write.

- **DONE**: relay the written `feature.md` path or the created children, then stop. If the agent lists unevaluated signals, relay each one as described under "Unevaluated signals" below.
- **ERROR**: this covers a failed `ai-toolkit resolve-features-root` call and a `RECORD_INVALID` result. Relay the reason, state that nothing was written, and stop. Do not retry and do not continue to another phase. An `ERROR: partial-apply` block is different: handle it under "Partial apply failure" below.
- **CHECKPOINT: split-proposal**: present the proposal view below. The agent has ended its turn and has written nothing. Present the proposal view, then collect the user's decision as described under "Decision round".

## Partial apply failure

When the agent returns `ERROR: partial-apply`, the parent `feature.md` is already written and registered as `defined`, and some children may already exist. Hold the block's `feature_id`, `created_children`, `staging_leftover` and `reason` in main-loop context, together with the `record` and `proposal`. Like the grilling record, keep them in memory only.

1. Relay the block: the `created_children` list (or "none"), the `staging_leftover` list (or "none"), and the `reason`. Do not delete any listed child or leftover.
2. If `staging_leftover` is not "none", state that the `.split-staging-*` leftover blocks later applies until it is resolved. A retry stops without running `apply` while the leftover exists.
3. Offer the user one choice of `retry`, `edit` or `reject`:
   - **retry**: send `decision: retry` with `apply_failed`, the unchanged `record` and `proposal`. The agent skips the parent write and `register`, and runs the leftover check before `apply`.
   - **edit**: send `decision: edit` with `apply_failed` and the user's `edits`. The agent returns a revised CHECKPOINT, which is presented under the proposal view. The next decision is then sent as `retry`, carrying `apply_failed`.
   - **reject**: send `decision: reject` with `apply_failed`. The feature stays a standalone feature, already registered as `defined`. The agent writes nothing. Relay the result and the created children and leftover as reported.
4. Never send `decision: accept` after a partial failure, because the parent already exists and the agent refuses to rewrite it. While `apply_failed` is held, an accept is sent as `retry`. The skill never writes files and never runs `apply` or `check-definition` itself.

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
decision: accept | edit | reject | retry
record: <unchanged JSON from the PROPOSAL block>
proposal: <unchanged, or with the user's edits applied>
edits: "<user's free-text edits>"    # only when decision = edit
apply_failed: <held from the last ERROR: partial-apply block>    # only after a partial apply failure
```

Routing per decision:

- **accept**: re-invoke with `decision: accept` and the proposal unchanged. Relay the DONE result. An ERROR is handled as under "Handling the agent's return". If `apply_failed` is held, send `decision: retry` instead, as under "Partial apply failure".
- **retry**: only after a partial apply failure. Re-invoke with `decision: retry`, `apply_failed` and the unchanged proposal. Relay the DONE result. A new ERROR: partial-apply is handled under "Partial apply failure".
- **reject**: re-invoke with `decision: reject`, including `apply_failed` when it is held. Relay the DONE result and state that the feature continues as one standalone feature. Relay the sentence "Checkpoint 2 remains available for this feature." unchanged when the result contains it.
- **edit**: re-invoke with `decision: edit`, the `edits` text, and the proposal unchanged. The agent returns a revised CHECKPOINT block with `violations` and `foundationWarnings`. Report each violation. Show the foundation warning from the returned block for each entry in `foundationWarnings`. Then re-present the revised proposal with the proposal view and return to this decision round. The next decision carries the revised `proposal`. Repeat until the user chooses accept or reject. Edit rounds write nothing.

## Non-flagged result

When the spawn returns with no CHECKPOINT block, status `skipped` or `not-flagged`, no proposal is shown.

- **`skipped`**: relay the agent's stop reason and stop. Show no Keywords prompt.
- **`not-flagged`**: show the Keywords prompt that the agent returns, with the derived Keywords as an editable item. Collect the confirmed keywords in the main loop and pass them back as `confirmed_keywords: "<k1,k2>"`. The name must be aligned with US-02-TASK-BE-01 before implementation. Also name each `unevaluated` signal, as described under "Unevaluated signals".

## Unevaluated signals

Unevaluated signals are reported in every path, not only the flagged one. When the agent returns DONE, or any other return, and names signals that could not be evaluated, relay each name with the statement that it could not be evaluated and therefore did not count toward the split threshold.
