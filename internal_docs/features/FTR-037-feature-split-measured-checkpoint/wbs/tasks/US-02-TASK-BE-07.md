<a id="task-US-02-TASK-BE-07"></a>
### US-02-TASK-BE-07

- **Task ID:** US-02-TASK-BE-07
- **Title:** Add the no-write guarantees and the outcome sentences to Step 1a
- **Outcome:** SKILL.md Step 1a states that accept runs feature-split.js apply in the main loop and stops for the parent without reaching Gate 1. It states that reject continues to Gate 1 unchanged and stores nothing. It also states that nothing is created before an explicit accept and that an unanswered proposal stores nothing.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-06
- **Acceptance criteria:** AC-13
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add accept and reject outcomes to implement-feature Step 1a

**Implementation notes:**

This task only edits the prose of the implement-feature SKILL.md, Step 1a. It adds no code and does not change `feature-split.js`. The supplied Tech-Spec excerpt covers only `feature-split.js`, so it does not give the SKILL.md path, the current Step 1a line numbers, or the exact arguments of `feature-split.js apply`. Those must come from the FTR-035 apply contract and the current skill file, not from this note. Step 1a's decision loop (accept / edit / reject) is written by US-02-TASK-BE-06. This task adds only the outcome rules below and must not redefine the edit loop.

Add the following three rules to the accept/reject part of Step 1a, after the decision prompt and the edit-loop text from BE-06. The no-write guarantees (AC-13) are this task. The accept and reject lines are one sentence each, as the outcome of the decision: the arguments of `apply` are added by US-03-TASK-BE-01, the report of the created children and the stop for the parent by US-03-TASK-BE-02, and the discard of the edits on a reject by US-03-TASK-BE-05. Do not write those details here.

```text
Accept:
- On an explicit written accept, the main-loop agent runs `feature-split.js apply`
  with the proposal shown to the user (Keywords filled in). This is the only point
  where anything is created.
- After apply succeeds, stop and report to the parent. Do not continue to Gate 1.

Reject:
- On an explicit reject, continue to Gate 1 unchanged.
- Store nothing: do not run apply and do not create any child folder or file.

No writes before accept:
- Nothing is created before an explicit accept. The proposal exists only in the
  conversation.
- An unanswered proposal stores nothing. Do not treat silence as accept or reject.
```

Constraints for this edit:
- The `apply` call is written in the skill only. It must not appear in the pm-phase1 workflow (US-01-TASK-BE-08), and US-02-TASK-TEST-03 checks this.
- Do not add any numeric threshold to the skill text. Thresholds come from the FTR-035 configuration.
- Keep the existing Step 1a wording for `passed`, `skipped`, and `unavailable` (BE-04) unchanged.

**Verification commands:**

```
grep -q "Nothing is created before an explicit accept" src/claude/skills/implement-feature/SKILL.md
```

```
npm test
```