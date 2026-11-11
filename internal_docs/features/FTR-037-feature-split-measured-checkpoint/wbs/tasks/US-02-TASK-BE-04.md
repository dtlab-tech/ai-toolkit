<a id="task-US-02-TASK-BE-04"></a>
### US-02-TASK-BE-04

- **Task ID:** US-02-TASK-BE-04
- **Title:** Add Step 1a status branches to implement-feature skill
- **Outcome:** SKILL.md has a Step 1a between pm-phase1 and Gate 1 that reads split_checkpoint. It treats a missing, non-object or unknown-status result as unavailable. passed and skipped continue to Gate 1 with no prompt. unavailable prints each count and reason as a plain error, is not a gate or approval prompt, and stops before Gate 1.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-08
- **Acceptance criteria:** AC-05, AC-06, AC-19
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Step 1a status branches to implement-feature skill

**Implementation notes:**

Scope: edit only `src/claude/skills/implement-feature/SKILL.md`. Insert a new Step 1a section after the Step 1 section that invokes `pm-phase1`, and before the Step 2 section that holds Gate 1. The excerpt does not contain the current SKILL.md text or line numbers, so locate the insertion point by the existing heading text and confirm it before editing. If the headings are named differently, say so and stop rather than guessing.

This task covers only the `passed`, `skipped` and `unavailable` branches, plus a fallback for unknown values. The `split-proposed` branch (keyword derivation, proposal presentation, accept/edit/reject) belongs to US-02-TASK-BE-05, BE-06 and BE-07. Until BE-05 lands, a `split-proposed` result falls into the unknown-status fallback below and stops. That is intended: it is fail-closed, and it never passes.

Read `split_checkpoint` from the `pm-phase1` return value. Insert this section, adapting only the heading level to match the file:

```text
Step 1a — Split checkpoint

Read split_checkpoint from the pm-phase1 result.

1. If split_checkpoint is missing, is not an object, or has no string status:
   treat it as unavailable with the reason "split checkpoint result missing or malformed".
2. If status is "passed" or "skipped": continue to Gate 1 (Step 2). Show no prompt.
3. If status is "unavailable": print a plain error, not a gate and not an approval prompt:
       Feature split check unavailable. Cannot proceed to Gate 1.
       - <count>: <reason>        (one line per entry in split_checkpoint.unavailable)
   Then STOP. Do not reach Gate 1. Do not ask the user anything.
4. Any other status (including "split-proposed" until US-02-TASK-BE-05 lands):
   treat it as unavailable with the reason "unknown split checkpoint status: <status>",
   print it in the same way as step 3, and STOP.
```

Rules this section must state and not break:
- Step 1a never calls `feature-split.js apply`, never builds a proposal and never prompts. Those belong to the later tasks.
- An unknown or malformed result must never lead to Gate 1. Only `passed` and `skipped` continue.
- The unavailable message must not contain the words "accept", "approve" or "confirm", so it cannot read as an approval prompt.

Verification: the grep checks below confirm the section exists and names the status values. The ordering and no-prompt assertions are pinned by `tests/workflows/split-checkpoint-static.test.js`, which is created and extended by US-01-TASK-TEST-04 and US-02-TASK-TEST-03. Those tests are not part of this task, so do not create them here.

**Verification commands:**

```
grep -n "Step 1a" src/claude/skills/implement-feature/SKILL.md
```

```
grep -n "split_checkpoint" src/claude/skills/implement-feature/SKILL.md
```

```
grep -n -i "unavailable" src/claude/skills/implement-feature/SKILL.md
```

```
npm test
```