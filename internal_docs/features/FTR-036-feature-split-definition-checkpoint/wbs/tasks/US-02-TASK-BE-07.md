<a id="task-US-02-TASK-BE-07"></a>
### US-02-TASK-BE-07

- **Task ID:** US-02-TASK-BE-07
- **Title:** Add partial apply failure recovery offer to the skill
- **Outcome:** define-feature/SKILL.md relays an apply ERROR block by listing the children already created. It offers retry, edit or reject, and reports that later applies are blocked while a .split-staging-* leftover exists.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-06, US-02-TASK-BE-05
- **Acceptance criteria:** AC-12
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** offer retry edit or reject after failed apply in skill

**Implementation notes:**

This is a text-only change to `src/claude/skills/define-feature/SKILL.md`. The skill never writes files and never runs `apply` or `check-definition` itself, so the change adds a relay and a decision branch to the main loop. Do not add any hard-coded features-root path (D-10).

Gaps in the excerpt that the implementer must resolve against the current file and the agent text from US-02-TASK-BE-05:

- The current `SKILL.md` text is not in the excerpt, so exact line ranges cannot be given. Insert the new section after the existing ERROR handling in the "on agent return" flow, and leave the spawn block and its sentence "Do not add instructions telling it to skip discovery" verbatim.
- The ERROR block shape for a failed `apply` is defined by BE-05 in the agent, which is not in the excerpt. Parse the created-children list from whatever field BE-05 defines. If that field name is not known, say so in the skill text rather than guessing.
- The decision block gains an explicit `retry` value, defined by US-02-TASK-BE-05. The skill sends `decision: retry`, never `decision: accept`: the agent's accept branch refuses to run when the parent feature.md already exists (BR-04 guard), and the parent was already written and registered by the first attempt. State this in the skill text so a reader can see it.

Proposed text to add to the skill, after the ERROR case in the orchestration flow:

```markdown
**If the agent returns ERROR from a partial `apply`:**

1. List the child folders the ERROR block reports as already created. Do not delete them.
2. Report whether a `.split-staging-*` leftover exists. If it does, state that later applies are blocked until it is resolved.
3. Offer the user three choices:
   - **retry**: send `decision: retry` with the unchanged `record` and `proposal`. The agent skips the parent write and `register` (already done) and re-runs the leftover check first.
   - **edit**: re-send `decision: edit` with the user's changes. The agent re-presents the proposal.
   - **reject**: send `decision: reject`. The parent stays as a standalone feature, already registered, and is not written or registered a second time. Created children are reported and kept.
4. Never write files or run `apply` from the skill.
```

Length guidance: the new section should be roughly 15 to 25 lines. Do not restate the accept order or the late-child rules here; those belong to US-02-TASK-TEST-02 and the earlier skill tasks.

Test anchors this change must satisfy (checked by `tests/cli/define-feature-checkpoint-text.test.js`): the skill text contains `retry`, `edit`, `reject` in the partial-failure context, and `.split-staging-*`, with a statement that later applies are blocked while it exists. Also confirm the test file's skill assertions still pass after the edit.

**Verification commands:**

```
grep -q "decision: retry" src/claude/skills/define-feature/SKILL.md
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```