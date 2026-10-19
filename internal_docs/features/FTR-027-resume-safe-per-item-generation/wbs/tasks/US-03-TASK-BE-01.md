<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add a parseTaskDetailBlock-based validity check to Work Breakdown task resume
- **Outcome:** pm-phase2.js gains a local hasVerificationCommands(content) (duplicating wbs-assembler.js's _parseVerificationCommands last-marker-wins algorithm as a boolean check); the per-task resume-by-status loop requires it in addition to status === 'generated' && c.exists()
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase2
- **Commit subject:** regenerate an invalid Work Breakdown task instead of trusting status alone

**Implementation notes:**

Add near the top of `src/claude/workflows/pm-phase2.js`, alongside the other duplicated
primitives:

```js
// Duplicates wbs-assembler.js's _parseVerificationCommands algorithm (last occurrence of the
// marker wins) — returns a boolean instead of the parsed array, since this call site only needs
// the yes/no signal.
const FENCE_RE_LOCAL = /```[^\n]*\n([\s\S]*?)```/g
function hasVerificationCommands(content) {
  const marker = '**Verification commands:**

```
npm test -- tests/pm-phase2-wbs-resume.test.js
```

**Verification commands:**



```
<command>
```
