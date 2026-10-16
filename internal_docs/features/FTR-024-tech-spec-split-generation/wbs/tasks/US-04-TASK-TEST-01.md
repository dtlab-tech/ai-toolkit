<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Integration tests: pm-phase1 Tech-Spec resume-by-existence, fileSlug collisions, and existing-suite regression
- **Outcome:** tests/integration/workflow-runtime.test.js's shared Tech-Spec mock fixture is updated to the new skeleton+per-component contract and every existing Tech-Spec-related pm-phase1 test (truncation, needsTechSpecFix, tech-spec-ac-check dangling-reference rejection) passes against the new path; new tests assert resume-by-existence dispatches only missing components, and that two components with colliding basenames receive distinct, deterministically-disambiguated fileSlug values
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** AC-03, AC-08
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Fixing the shared pm-phase1 mock fixtures (the fallout this exact wiring pattern caused twice before, in FTR-021 and FTR-023) and adding the two new resume/collision tests are inseparable: the new tests cannot run against the old fixture shape, and verifying the fixture fix means re-running the whole existing Tech-Spec-related suite, not a separable sub-task.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 tech-spec resume and fileSlug-collision integration tests

**Implementation notes:**

**This is the FTR-024 instance of the same fixture-fallout pattern FTR-021 and FTR-023 both hit**
when they wired a new generation path / structural check into `pm-phase1.js`: the shared mocks
were never designed for the new contract, and the existing test suite breaks before any new test
is even added. Budget for fixing the shared fixtures as part of this task, then re-run the
**full** existing suite, not just the tests you add.

**Replace** `phase1Dispatch`'s `gaia-generate-tech-spec` branch (currently `sectionedDoc(12)`,
the old fully-assembled-shaped mock) with a skeleton-shaped response — missing Sections 3, 4, 5,
10 (per OQ-1's routing), but with a real Section 9 Components table carrying the new `Domain`/
`Spec` columns:

```js
// Column order matters: Addresses MUST stay the 3rd column — tech-spec-graph-checks.js's
// existing, unmodified, positional parser (FTR-023) always reads cells[2] as "Addresses".
// Domain/Spec are new trailing columns, safely ignored by that parser. Also: "Addresses" must
// cite a real AC ID the Requirements fixture actually declares ("AC-01"), not "All UCs" — that
// sentinel is recognized by the Requirements AC table's own "Related UC" column, not by
// tech-spec-graph-checks.js's Addresses parser, which treats anything other than "—" as a
// literal AC ID to resolve.
const COMPONENTS_TABLE =
  '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
  '| a.js | example | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n';
const techSpecSkeletonDoc = () => [1,2,6,7,8,9,11,12].map(n =>
  n === 9 ? `## 9. File Inventory\n\n${COMPONENTS_TABLE}` : `## ${n}. Section ${n}\n`
).join('\n');
const techSpecComponentDetailDoc = () =>
  '# a.js — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\nExample body.\n\n## Tests\n\nExample tests.\n';
```

Add `gaia-generate-tech-spec-component` to `phase1Dispatch`'s `known` agent list and its content
branch (returning `techSpecComponentDetailDoc()`), the same way FTR-021 added
`gaia-generate-requirements-use-case`.

**Update the dispatch-sequence assertion** ("document findings trigger host revision..." test,
currently asserting an exact 5-call-then-2-call sequence) to insert
`'gaia-generate-tech-spec-component'` immediately after every `'gaia-generate-tech-spec'` entry —
mirrors exactly how FTR-021 updated this same test for `gaia-generate-requirements-use-case`.

**Update the Tech-Spec truncation test** (currently `success('## 1. Overview\n\n## 2.
Architecture\n')`, asserting `assertCompleteSections` catches the gap) the same way FTR-021 fixed
the analogous Requirements test: truncate the **skeleton** after enough real sections that the
pre-check (now at the skeleton level) still passes, so the truncation is still caught by
`assertCompleteSections` on the assembled document, not by `tech-spec-ac-check` catching a
missing Section 9 earlier. Since Section 9 must be present for `tech-spec-ac-check` to parse the
Components table at all, truncate *after* Section 9 instead (e.g. keep 1, 2, 6, 7, 8, 9, drop 11,
12) — update the regex/assertion accordingly if the exact missing-section numbers it checks
change.

**Update `techSpecDocWithFileInventory`** (the dangling-reference fixture) to the skeleton shape
too (5-column table, `Domain` included) — since `tech-spec-ac-check` now runs against
`spec/index.md` before any per-component dispatch, the existing "rejects a Tech-Spec with a
dangling Addresses reference" test's assertion that `gaia-validate-feature-docs` must not be
dispatched should be **strengthened**: also assert `gaia-generate-tech-spec-component` is never
dispatched either (the check now happens strictly earlier than before — before per-component
generation even starts, not just before semantic validation).

**New tests**, added alongside the above fixture fixes:

```js
test('pm-phase1 Tech-Spec resume-by-existence dispatches only missing components', async () => {
  // Pre-seed spec/index.md (fresh, matching feature.md's mtime) and one of two components'
  // detail files already present; assert only the missing component's
  // gaia-generate-tech-spec-component call is dispatched on a second run.
  //
  // Found only by actually running this: generateTechSpec() is never even called on a second
  // run unless the OUTER gate (pm-phase1.js's `!fresh(file('Tech-Spec'), ...)`) trips — that
  // gate is keyed on the ASSEMBLED FTR-0NN-Tech-Spec.md's own freshness, not on anything under
  // spec/. Deleting only the missing component's detail file leaves the assembled doc looking
  // fresh, so the whole stage is skipped and nothing is dispatched at all. The realistic
  // scenario this test needs to simulate is a crash between "component never got written" and
  // "assembly never got re-run" — so also delete the assembled file before the second run.
});

test('two components with colliding basenames receive distinct, deterministic fileSlug values', async () => {
  // Skeleton with two rows both named "index.js" in different directories (e.g.
  // "src/a/index.js" and "src/b/index.js"); assert the written spec/index.md's Spec column
  // links resolve to two different fileSlug values, both of which the per-component loop
  // successfully dispatches against and writes.
});
```

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```
