<a id="task-US-03-TASK-BE-05"></a>
### US-03-TASK-BE-05

- **Task ID:** US-03-TASK-BE-05
- **Title:** Add late-child proposal relay and decision handling to the skill
- **Outcome:** define-feature/SKILL.md presents the single-child proposal (title, purpose, editable Summary and Keywords, dependency on the previous last child), collects accept, edit or reject in the main loop, and re-invokes the agent in late-child mode. It states that reject creates nothing with no standalone fallback, and that register is not called for a late child.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-04
- **Acceptance criteria:** AC-17, AC-18, AC-19
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add late-child proposal relay to define-feature skill

**Implementation notes:**

Only file touched: `src/claude/skills/define-feature/SKILL.md`. The Tech-Spec excerpt does not quote the current text or line numbers of that file, so this task adds a new block and changes no existing lines. Place the block after the `--epic` late-child routing that US-03-TASK-BE-04 adds. Keep the spawn block and its sentence "Do not add instructions telling it to skip discovery" verbatim. If BE-04 is not yet present when this runs, stop and report, because this block depends on its routing text.

Duplicate check: BE-04 covers routing and the child title and purpose prompt. BE-05 covers only what happens after the agent returns a `LATE_PROPOSAL` block. No other task builds the skill's relay, so there is no duplicate.

1. **Relay the single-child proposal.** When the agent returns a `LATE_PROPOSAL` block, the skill shows this in the main loop:

```text
Late child proposal for epic {epicId}
  Name:     {child.name}
  Purpose:  {child.purpose}
  Summary:  {child.summary}     (editable)
  Keywords: {child.keywords}    (editable)
  Position: last; depends on {previousLastChild}
```

2. **Collect the decision in the main loop.** Ask the user to choose accept, edit or reject, and to edit Summary and Keywords if they want. A subagent cannot ask mid-run, so this question must be asked by the skill.

3. **Re-invoke in late-child mode.** The spawn prompt keeps the first line `Mode: late-child`. Pass the decision block:

```text
CHECKPOINT: decision
feature_id: {epicId}
decision: accept | edit | reject
record: none            # late path has no grilling round
proposal: <unchanged, or with the user's Summary/Keywords edits>
edits: "<user free-text edits>"    # only when decision = edit
```

Using `feature_id: {epicId}` is my reading, because the child id is assigned by apply and the proposal carries names only. The `record: none` value is also my choice, since the Tech-Spec says the late path has no grilling record. Both are open points, listed below.

4. **Decision handling:**
   - `accept`: the agent runs `apply --parent` for the epic with one child. The skill relays DONE with the created child path and ID. The skill never calls `register` for the child.
   - `edit`: the agent validates the edit through validate-proposal and returns a new `LATE_PROPOSAL`. The skill re-presents it and asks again. Edits require a new explicit accept.
   - `reject`: the agent writes nothing. The skill reports "no child created" and stops. Do not offer a standalone feature as a fallback.

5. **Never write or run anything from the skill.** The skill does not write files, run `check-definition`, `apply` or `register`, and does not offer a standalone fallback.

Open points not settled by the excerpt, to report rather than invent: (a) the shape of `record` on the late path; (b) what the skill offers if a late-child `apply` fails (the retry, edit or reject offer in the Tech-Spec is written for the define path only); (c) whether reject is sent to the agent at all, or handled by the skill alone. Options (b) and (c) are not in the Tech-Spec excerpt, so this task does not decide them.

**Verification commands:**

```
test -f src/claude/skills/define-feature/SKILL.md
```

```
grep -q "LATE_PROPOSAL" src/claude/skills/define-feature/SKILL.md
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```