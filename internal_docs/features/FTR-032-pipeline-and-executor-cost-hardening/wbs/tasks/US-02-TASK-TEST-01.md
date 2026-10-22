<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover dispatch evidence capture end to end
- **Outcome:** New tests/task-executor/dispatch-evidence.test.js proves a real implementation dispatch and a real review dispatch each leave an independently-readable evidence file, including on a failed attempt
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** task-executor
- **Commit subject:** cover implementation/review dispatch evidence capture end to end

**Implementation notes:**

Per `spec/components/dispatch-evidence.test.js.md`. New file, mirroring
`tests/task-executor/executor.sequential.test.js`'s exact real-dispatch harness (copy its
`initRepo`/`writeFile`/`commitAll`/`writeWorkBreakdownFixture`/`gitCmd` helpers and
`beforeEach`/`afterEach` setup — same `claudeProcess.verifyAgentIdentity` stub via `jest.spyOn`,
same `fake-claude-cli.js` fixture via `process.execPath`, same per-test `fs.mkdtempSync` repo).

Two tests:
1. A single-task run (`--mode=write-file-and-succeed` / `--mode=review-verdict-pass`) completes;
   assert `fs.readdirSync(path.join(executionRoot, 'evidence', result.runId))` contains at least 2
   `.json` files, and that parsing them finds one record with
   `invocation.dispatchKind === 'implementation'` and one with `'review'`, both
   `outcome === 'done'`, both independently `JSON.parse`-able.
2. A run whose implementation agent reports success but writes nothing real (`--mode=echo-json`,
   mirroring the existing mandatory-negative-test convention) still ends up with at least one
   implementation evidence record present (`outcome` either `'done'` or `'failed'`, since this
   fixture mode itself exits cleanly — the point is evidence exists regardless of what verification
   later decides, not that this specific record is marked failed).

**Verification commands:**

```
npx jest tests/task-executor/dispatch-evidence.test.js
```
