<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Integration test: pm-phase1 rejects a dangling Tech-Spec AC reference before semantic validation
- **Outcome:** tests/integration/workflow-runtime.test.js (or a new file) asserts a Tech-Spec mock containing a dangling Addresses reference causes pm-phase1 to fail before gaia-validate-feature-docs is ever dispatched, and that a clean/dash-only Tech-Spec proceeds through the existing validation flow unchanged
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 tech-spec AC-reference integration test

**Implementation notes:**

**Important prerequisite, likely to surface when this task actually runs against the real test
suite (not just a theoretical risk — call it out explicitly rather than let it be a surprise):**
`tech-spec-graph-checks.js`'s CLI calls `parseAcTable(requirementsPath)`, which hard-exits if
`{PREFIX}-Requirements.md` has no real `## 7. Acceptance Criteria` heading with an actual
`| ID | ... |` table underneath. `tests/integration/workflow-runtime.test.js`'s shared
`requirementsSkeletonDoc()` fixture (used by nearly every existing `pm-phase1` test via
`phase1Dispatch`) currently renders Section 7 as a bare `## 7. Section 7` placeholder with no
table at all. Once `US-02-TASK-BE-02` wires `tech-spec-ac-check` into `pm-phase1.js`, **every**
existing `pm-phase1` test that reaches the validation block will fail at this new check, not just
the new tests this task adds — because none of them have a real AC table to resolve against.

Fix this once, in the shared fixture, as part of this task: give `requirementsSkeletonDoc()`'s
Section 7 a minimal real table, e.g.:

```js
if (n === 7) return '## 7. Section 7\n\n| ID | Criterion | Related UC |\n|---|---|---|\n| AC-01 | placeholder | All UCs |\n';
```

(`All UCs` avoids any phase/UC-scope coupling — this fixture's job is only to make `parseAcTable`
succeed, not to exercise scope logic, which is unrelated to Tech-Spec's own tests.) Re-run the
**full** existing `tests/integration/workflow-runtime.test.js` suite after this change — not just
the new tests below — to confirm every pre-existing test still passes with the new check now
active in the pipeline for all of them.

New Tech-Spec content helper, mirroring `requirementsSkeletonDoc`'s style:

```js
const techSpecDocWithFileInventory = addresses => Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  if (n === 9) return `## 9. File Inventory\n\n### New files\n| Path | Purpose | Addresses |\n|---|---|---|\n| a.js | x | ${addresses} |\n`;
  return `## ${n}. Section ${n}\n`;
}).join('\n');
```

New tests:

```js
test('pm-phase1 rejects a Tech-Spec with a dangling Addresses reference before semantic validation', async () => {
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-tech-spec')) return success(techSpecDocWithFileInventory('AC-99'));
    if (options.args.includes('gaia-validate-feature-docs')) throw new Error('must not be dispatched — tech-spec-ac-check should reject first');
    return phase1Dispatch(options);
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
    .rejects.toThrow(/dangling AC references/);
  expect(f.entries()[0].status).toBe('failed');
});

test('pm-phase1 proceeds unchanged for a clean (dash-only) Tech-Spec', async () => {
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-tech-spec')) return success(techSpecDocWithFileInventory('—'));
    return phase1Dispatch(options);
  };
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(result.validation.summary).toContain('0 gaps');
});
```

The first test's `gaia-validate-feature-docs` branch throwing is deliberate, not incidental — it
turns "semantic validation was dispatched" into an immediate, loud test failure rather than a
silent pass, making AC-02/AC-03's dispatch-order requirement a hard assertion, not an inference
from call count.

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```
