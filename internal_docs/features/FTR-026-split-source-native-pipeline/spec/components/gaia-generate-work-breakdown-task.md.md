# src/claude/agents/gaia-generate-work-breakdown-task.md — Modified

## Change

**A real, pre-existing gap, found while scoping this feature:** this agent's own `description`
frontmatter and Input §2 already say it receives "the relevant Tech-Spec excerpt for this task's
domain (not the whole Tech-Spec — keeps this call small, which is the whole point of the per-task
split)" — but `pm-phase2.js`'s `buildTaskPrompt()` has, since this agent was first introduced,
always sent the **entire** assembled Tech-Spec text, never an actual excerpt. This feature finally
delivers on that already-stated, never-honored contract — same "designed but never implemented"
pattern as the phase Context/Tasks-in-phase template sections and the task Implementation notes field
found in earlier work on this lineage.

Input §2's wording is corrected from "for this task's domain" to name the actual matching mechanism
now implemented: the host matches by this task's own `acceptanceCriteria` against each component's
`Addresses` column in `spec/index.md` (not by `domain`, which would be a cruder filter — a feature
can have several components sharing one `domain` but addressing different ACs). The fallback case
(no component matches) is documented explicitly, since the agent must not treat a fallback excerpt
(the full Components table) the same as a normal, narrowly-matched one.

## Service Interface

```markdown
<!-- BEFORE -->
2. **The relevant Tech-Spec excerpt** for this task's domain (not the whole Tech-Spec — keeps this
   call small, which is the whole point of the per-task split).

<!-- AFTER -->
2. **The relevant Tech-Spec excerpt** for this task's own Acceptance Criteria (matched by the host
   against each component's `Addresses` column in `spec/index.md` — not the whole Tech-Spec, which
   is the whole point of the per-task split). If no component's `Addresses` column cites any of this
   task's Acceptance Criteria, you instead receive the full Components table from `spec/index.md` as
   a fallback — in that case, use your own judgment about which listed component(s) are actually
   relevant, the same way you would if asked to work from the full Tech-Spec directly.
```

No other section changes — Steps/Output/constraints already operate on "the given Tech-Spec excerpt"
as an opaque input, regardless of how it was selected.

## Tests

`tests/integration/workflow-runtime.test.js` (see `pm-phase2.js`'s own component, which is where the
excerpt is actually computed and asserted): the mock dispatch for
`gaia.agent.planner.work-breakdown-task` asserts the received prompt's Tech-Spec section contains
only the matched component's content for a task whose `acceptanceCriteria` matches, and the full
Components table for a task whose `acceptanceCriteria` matches none — no dedicated test for this
agent file itself, same convention as `gaia-generate-work-breakdown.md`'s own component (a prompt
file's wording isn't exercised by the mocked test suite, only the shape of what's dispatched to it).
