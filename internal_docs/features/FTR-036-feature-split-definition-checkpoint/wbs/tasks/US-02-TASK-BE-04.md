<a id="task-US-02-TASK-BE-04"></a>
### US-02-TASK-BE-04

- **Task ID:** US-02-TASK-BE-04
- **Title:** Add edit validation loop to the agent
- **Outcome:** gaia-define-feature.md handles checkpoint decision edit. It pipes the proposal and edit to validate-proposal, reports violations and the foundation warning, and returns the revised proposal in a new CHECKPOINT. It writes nothing and requires a new explicit accept.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-04, INFRA-TASK-BE-03
- **Acceptance criteria:** AC-11
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add edit validation loop to define-feature agent

**Implementation notes:**

Target file: `src/claude/agents/gaia-define-feature.md`. This task adds one branch to the "Checkpoint decisions" section, between the `accept` and `reject` branches. It does not touch Phase 3a, the Phase 4 write branches, or the input modes already added by US-01-TASK-BE-04 and US-02-TASK-BE-02/03. Read the current file first and find the existing checkpoint decision block (`accept`, `edit`, `reject`) so the edit text is inserted in place. Only the `edit` branch changes.

The excerpt does not give the exact stdin key names for `validate-proposal`. The design says only that it takes "the proposal and an edit on stdin" and returns "the revised proposal, the violations and the foundation warnings". Before writing the payload example, check the key names in the INFRA-TASK-BE-03 implementation of `validate-proposal` in `src/claude/scripts/feature-split.js`. If that implementation is not present yet, write the payload with the placeholder keys shown below and flag the placeholder in the agent text as "keys per validate-proposal contract".

Required behaviour for `decision: edit`:

```text
input: checkpoint: { decision: "edit", proposal: {...}, record: {...}, edits: "<user free text>" }

1. Do NOT re-run grilling and do NOT re-run check-definition.
2. Apply the user's edits to the proposal in memory (names, purposes, dependsOn,
   shared parts, Summary, Keywords). Child ids are not assigned here.
3. Pipe the edited proposal and the edit to validate-proposal:

   cat <<'JSON' | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
       validate-proposal --features-root "$featuresRoot" --feature-id "$PREFIX"
   { "proposal": <edited proposal JSON>, "edits": "<user edits>" }
   JSON

4. If exit != 0: STOP. Report the error. Write nothing.
5. Parse the single JSON line: revised proposal, violations[], foundationWarnings[].
6. Report every violation and every foundation warning to the user.
   Violations cover: names empty or duplicated; dependsOn naming an unlisted child
   or forming a cycle; a shared part not assigned to exactly one child.
7. Return a new CHECKPOINT: split-proposal block carrying the revised proposal,
   the same record, and the violations and warnings. Keep the feature_id.
8. STOP. Write no file, create no folder, open no ledger entry, call no register
   and no apply. Nothing changes until the user sends a new explicit accept.
   A new accept runs the Phase 4 split branch on the revised proposal.
```

Text the file must contain for this branch: the `edit` label, the `validate-proposal` command literal, "foundation warning", "new CHECKPOINT" or "CHECKPOINT", and an explicit statement that nothing is written and that a new accept is required. The branch must not mention `check-definition` as a step.

Keep the section to roughly 25 to 35 lines. Do not restate the Phase 4 split steps here; point to them.

**Verification commands:**

```
npm test
```

```
grep -n "validate-proposal" src/claude/agents/gaia-define-feature.md
```

```
grep -n -i "foundation warning" src/claude/agents/gaia-define-feature.md
```

```
grep -n -i "new explicit accept\|new accept" src/claude/agents/gaia-define-feature.md
```