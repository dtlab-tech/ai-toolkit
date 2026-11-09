<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Add checkpoint reject re-invocation handling to the agent
- **Outcome:** gaia-define-feature.md accepts a checkpoint re-invocation with decision reject, without repeating grilling. It routes to the standalone branch, discards any edits, and states that checkpoint 2 remains available for the feature.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-01-TASK-BE-04
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** handle reject decision in define-feature agent

**Implementation notes:**

The excerpt gives section names and algorithm text but not current line numbers in `src/claude/agents/gaia-define-feature.md`, so locate each edit by heading. This task only adds text to that one file. It does not change Phase 3a, the accept branch, or the edit branch. Those belong to US-02-TASK-BE-03 and US-02-TASK-BE-04.

1. **Input section — add a checkpoint re-invocation entry mode.** Under the existing input modes, add this entry. Keep the existing "Fresh definition" and "Late child" entries unchanged.

```text
- **Checkpoint re-invocation**: the skill passes
  `checkpoint: { decision: "accept" | "edit" | "reject", proposal: {...}, record: {...} }`.
  The agent does not re-run grilling or `check-definition`.
  - decision `reject`: discard the proposal and any user edits to it, then go to
    "Phase 4 — standalone branch". Do not validate the proposal and do not write
    any split file.
```

2. **Checkpoint decisions block — add the reject line.** The existing block in the "Checkpoint decisions" section already has a `reject` line. Replace it so the discard and the checkpoint-2 statement are explicit:

```text
# before
reject  -> Phase 4 standalone (D-05)

# after
reject  -> discard the proposal and all edits (they are not used anywhere);
           Phase 4 standalone (D-05); the standalone branch derives its
           own Summary and Keywords as defined there
```

3. **Phase 4 — standalone branch — add the entry note.** Add one line at the top of the branch:

```text
Reached from: Phase 3a status "not-flagged", or checkpoint decision "reject".
Nothing is written before step 1 (BR-04 guard) passes.
```

4. **Final report on the reject path.** After step 5 (`register`) completes, the agent's DONE report on this path must include the sentence below, verbatim, so the skill can relay it:

```text
Checkpoint 2 remains available for this feature.
```

Do not invent the trigger for checkpoint 2. The excerpt names it but does not define it. The sentence is a fixed statement only.

**Open point to flag, not resolve here:** Phase 4 standalone step 3 uses AskUserQuestion to confirm Summary and Keywords. The skill spec says a subagent cannot ask the user mid-run. The reject path inherits this step as written in US-02-TASK-BE-01. Confirm the intended behaviour before merging. Also confirm the exact `register` flag names and the standalone status value against FTR-035 D-25, as the Tech-Spec's open gaps list.

Do not add a test in this task. The static assertions for reject routing belong to US-02-TASK-TEST-01.

**Verification commands:**

```
grep -q "checkpoint: { decision" src/claude/agents/gaia-define-feature.md
```

```
grep -q "decision \`reject\`" src/claude/agents/gaia-define-feature.md
```

```
grep -q "Checkpoint 2 remains available for this feature." src/claude/agents/gaia-define-feature.md
```

```
npm test
```