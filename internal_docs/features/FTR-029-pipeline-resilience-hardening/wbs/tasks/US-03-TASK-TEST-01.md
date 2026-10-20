<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Cover unclosed-fence recovery end to end against the real pm-phase1 dispatch path
- **Outcome:** tests/cli/workflow-worker-contract.test.js has passing tests: an unclosed fence wrap with a real heading after the opener is recovered; an unclosed fence whose remainder reveals no heading is left unchanged; a CLOSED fence wrap is still recovered (regression)
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** workflow-control
- **Commit subject:** cover unclosed-fence recovery and the closed-fence regression

**Implementation notes:**

Add the 3 tests exactly as shown in `spec/components/workflow-worker-contract.test.js.md`'s
Algorithm section to the existing `describe('extractMarkdownDocument (non-schema plain-text
worker payload)', ...)` block in `tests/cli/workflow-worker-contract.test.js` — using this file's
own existing `createControl`/`c.worker(id, 'test')` style, not a mocked extraction function.

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js -t "unclosed"
```
