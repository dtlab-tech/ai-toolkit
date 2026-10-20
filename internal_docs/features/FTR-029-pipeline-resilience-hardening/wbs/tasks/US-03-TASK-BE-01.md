<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Recover an unclosed whole-response fence wrap in extractMarkdownDocument
- **Outcome:** lib/workflow-control.js gains _stripUnclosedLeadingFence(text), wired into extractMarkdownDocument as a third recovery strategy, re-validated via the existing _hasUnfencedHeading before use
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** workflow-control
- **Commit subject:** recover an unclosed whole-response fence wrap

**Implementation notes:**

Per `spec/components/workflow-control.js.md`'s "Edit 2" — add `_stripUnclosedLeadingFence(text)`
near `_unwrapWholeResponseFence` (`lib/workflow-control.js:516-537`), exactly as shown there (checks
the first non-blank line for a fence-open marker, confirms NO line in the rest of the text closes a
fence of the same backtick length, strips just that opener line). Extend `extractMarkdownDocument`
(`lib/workflow-control.js:538-543`) to try this third strategy, re-validated via
`_hasUnfencedHeading` before being used, same as the existing closed-fence-unwrap already is.

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js
```
