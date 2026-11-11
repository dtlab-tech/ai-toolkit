<a id="task-US-01-TASK-BE-04"></a>
### US-01-TASK-BE-04

- **Task ID:** US-01-TASK-BE-04
- **Title:** Add Phase 3a flagged proposal and CHECKPOINT return to the agent
- **Outcome:** gaia-define-feature.md handles status flagged by building a split proposal and ending its turn with a CHECKPOINT block without writing any file. The proposal lists child names, one-line purposes, dependency order, shared parts for the first child, each flow with a one-line reason, editable Summary and Keywords per child, and any unevaluated signals.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-03
- **Acceptance criteria:** AC-01, AC-04, AC-07, AC-08
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** return split proposal CHECKPOINT from Phase 3a when flagged

**Implementation notes:**

Scope: add only the `flagged` branch to Phase 3a of `src/claude/agents/gaia-define-feature.md`. The `skipped` and `not-flagged` branches are owned by US-01-TASK-BE-03 and must not be changed here. The excerpt does not give the current line numbers of the agent file, so insert the new text directly after the Phase 3a `switch result.status` block, under the existing `"flagged"` line. Do not edit the Phase 4 text in this task.

Behaviour to write into the `"flagged"` case, in this order:

1. Write nothing. No `mkdir`, no `feature.md`, no ledger entry, no `register`, no `apply`. The record stays in memory only (D-03).
2. Build the proposal from the `check-definition` result and the in-memory record:
   - `signals`: copy `result.signals` (count, minimum and met for each of actors, applications, flows).
   - `flows`: copy `result.flows` (each flow name with its one-line reason).
   - `children`: one entry per child, each `{ name, purpose, summary, keywords }`.
   - `order`: child names in dependency order.
   - `shared_first_child`: the grilling answer ids whose content is shared and assigned to the first child (D-09).
   - `unevaluated`: copy `result.unevaluated`. For each name, state that the signal could not be evaluated and so cannot raise the flag (BR-02).
3. Child ids are not assigned here. `apply` (FTR-035) assigns them, so the proposal carries names only.
4. Show the proposal to the user as readable text, then end the turn with the CHECKPOINT block below. The agent does not ask the user anything itself, because the skill collects the decision in the main loop.

Block to add (returned as the final output of the turn):

```text
CHECKPOINT: split-proposal
feature_id: FTR-XXX
record: {"actors":[...],"applications":[...],"flows":[{"name":"","reason":""}]}
check: {"status":"flagged","signals":{...},"flows":[...],"unevaluated":[...]}
proposal:
  parent: FTR-XXX
  children: [{"name":"","purpose":"","summary":"","keywords":[]}]
  order: [child names in dependency order]
  shared_first_child: [grilling answer ids]
```

The `record` field is included so the skill can return it in the decision round. It is never written to disk (D-03). Unevaluated names go in `check.unevaluated` and in the readable text, not in a separate file.

Gaps to surface at Gate 1, not resolved by the excerpt:
- The derivation of each child's `summary` and `keywords` is not stated for the split path. The standalone path derives Summary as the first sentence of the Summary section and Keywords from the title and main terms (D-08), but the excerpt does not say how a child's values are drafted. The agent should draft them and mark both as editable (D-07), and the exact rule needs confirming.
- The format of `shared_first_child` ids (for example whether they are grilling answer numbers or quoted text) is not fixed by the excerpt. The block above uses a list placeholder.
- The excerpt does not say whether the parent's own Summary is part of the CHECKPOINT block. This task does not add it.

Length: this is a single prompt addition of roughly 30 to 40 lines of agent text, plus a manual read-through to confirm it sits after the Phase 3a switch and before Phase 4.

**Verification commands:**

```
npm test
```

```
grep -q "CHECKPOINT: split-proposal" src/claude/agents/gaia-define-feature.md
```

```
grep -q "unevaluated" src/claude/agents/gaia-define-feature.md
```