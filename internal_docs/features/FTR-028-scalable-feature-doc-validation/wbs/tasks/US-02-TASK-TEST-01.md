<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover deterministic AC<->component traceability and the merge-forces-invalid behavior
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: an AC addressed by zero components produces a finding and forces needsTechSpecFix even when the LLM pass returns valid:true; a component referencing a nonexistent AC-ID is reported by name; no gaps + a clean LLM pass stays valid, unchanged from today
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-05
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover deterministic AC<->component traceability and the merge-before-guard behavior

**Implementation notes:**

Add a `describe('FTR-028 — deterministic AC<->component traceability (UC-02)', ...)` block to
`tests/integration/workflow-runtime.test.js` per `spec/components/workflow-runtime.test.js.md`:

1. **Orphan AC.** Seed `req/index.md`'s AC table with an AC (e.g. `AC-02`) that no `spec/index.md`
   File-Inventory row's Addresses column references. Mock `gaia-validate-feature-docs` to return
   `valid: true, findings: []` (a clean pass that never saw this gap — it's purely ID-based, not
   prose). Run `pm-phase1`; assert the persisted `{PREFIX}-Validation-Report.md` contains
   `"AC-02 is not addressed by any Tech-Spec component"`, and that a SECOND validation cycle was
   dispatched (`needsTechSpecFix` was forced true despite the LLM's own `valid: true`) — count
   `gaia-validate-feature-docs` dispatches via the `dispatchFn` mock, expect > 1.
2. **Hallucinated AC reference — discovered unreachable end to end.** The straightforward fixture
   (seed a component row with Addresses `"AC-99"` where `req/index.md` has no `AC-99`) never
   reaches the validation step at all: the pre-existing `tech-spec-ac-check` (FTR-023) already
   hard-rejects a dangling AC reference at Tech-Spec GENERATION time, before validation ever runs.
   Resolved by adding `tests/pm-phase1-ac-traceability.test.js` — a direct, deterministic unit test
   of `computeAcComponentTraceabilityGaps()` (hand-synced mirror + source-text guard, same pattern
   as `tests/pm-phase1-req-resume.test.js`) covering this direction instead. The integration suite
   keeps only a comment noting why, pointing at that file.
3. **Clean case, no regression.** Every AC addressed by exactly one component and vice versa; mock
   `valid: true, findings: []`; assert `result.validation.summary` contains `'clean'` and the
   Validation-Report has NO `"## Additional findings"` section appended (confirms `c.write` is not
   called a second time when `newFindings.length === 0`).
4. Case 1 does not converge to clean in this test (the mock never actually adds AC-02 coverage on
   a forced regen) — it asserts via `.rejects.toThrow('gaps remain after 3 cycles')`, exactly
   mirroring the pre-existing `'repeated negative document validation never reports Gate 1 ready'`
   test's own convention, then reads the persisted report (still on disk after the thrown error)
   for the finding text and counts `gaia-validate-feature-docs` dispatches.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-028 — deterministic AC<->component traceability"
```
