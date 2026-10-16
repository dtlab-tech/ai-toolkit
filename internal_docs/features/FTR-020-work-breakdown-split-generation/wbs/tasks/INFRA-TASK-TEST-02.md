<a id="task-INFRA-TASK-TEST-02"></a>
### INFRA-TASK-TEST-02

- **Task ID:** INFRA-TASK-TEST-02
- **Title:** Unit tests for wbs-assembler.js
- **Outcome:** tests/wbs-assembler.test.js exists covering: directory-format vs. legacy-JSON parity using the internal_docs/features/FTR-020-work-breakdown-split-generation/wbs/ fixture (deep-equal assembled output), missing index.json, missing referenced task file, missing referenced phase file, malformed task detail block, malformed phase detail block (each asserting a structured error naming the exact path), a parseTaskDetailBlock/renderTaskDetailBlock round-trip including verification commands with embedded pipes and backticks, a parsePhaseDetailBlock/renderPhaseDetailBlock round-trip, and a regression test parsing US-03-TASK-INFRA-01.md itself (whose Implementation notes contain an illustrative field-line example) asserting the real field values are returned, not the example's placeholder text
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 19
- **Estimate — tokens:** 36000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for wbs-assembler.js

**Implementation notes:**

Copy `internal_docs/features/FTR-020-work-breakdown-split-generation/wbs/` into a test
fixtures directory (e.g. `tests/fixtures/ftr-020-wbs/`) rather than hand-building a new one — it
is already real, reviewed content. Key cases:

```js
const { loadWorkBreakdown, parseTaskDetailBlock, renderTaskDetailBlock,
        parsePhaseDetailBlock, renderPhaseDetailBlock } = require('../src/claude/scripts/wbs-assembler');

test('directory format and legacy JSON produce deep-equal assembled structures', () => {
  const fromDir = loadWorkBreakdown(path.join(FIXTURES, 'ftr-020-wbs'));
  const fromJson = loadWorkBreakdown(path.join(FIXTURES, 'ftr-020-wbs-legacy.json')); // same
  // content, hand-exported once from the directory fixture for this comparison
  expect(fromDir).toEqual(fromJson);
});

test('missing phase detail file throws naming the exact path', () => {
  const tmp = makeBrokenCopy(FIXTURES_DIR, { delete: 'user-stories/US-01.md' });
  expect(() => loadWorkBreakdown(tmp)).toThrow(/user-stories[\\/]US-01\.md/);
});

test('verification commands with embedded pipes and backticks survive a round-trip', () => {
  const task = { id: 'T-01', title: 't', outcome: 'o', domain: 'BE', agentType: 'developer-backend',
    dependsOn: [], acceptanceCriteria: [], estimate: { agentMinutes: 5, tokens: 1000 },
    outputCount: 1, groupingRationale: null, commit: { type: 'feat', scope: null, subject: 's' },
    verification: { commands: ["grep -E 'a|b|c' file.js", 'echo `date`'] } };
  const rendered = renderTaskDetailBlock(task);
  const parsed = parseTaskDetailBlock(rendered);
  expect(parsed.verificationCommands).toEqual(task.verification.commands);
});
```
For the "malformed detail block" cases, write a file missing a required field line (e.g. no
`- **Commit subject:**` line) and assert the resulting assembled task/phase surfaces the field as
`undefined`/throws downstream — match whatever `loadWorkBreakdown` actually does on a short
block (decide and assert the real behavior, don't assume).

**Regression case for the self-referential-example bug found during this feature's own
definition:**
```js
test('parsing a task file with an illustrative field-line example in its notes returns the real values, not the example', () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'ftr-020-wbs', 'tasks', 'US-03-TASK-INFRA-01.md'), 'utf8');
  const parsed = parseTaskDetailBlock(text);
  // The example inside Implementation notes uses placeholders like "{taskId}", "{title}" —
  // a naive global scan would have returned those literal strings instead of the real
  // groupingRationale ("—" -> null here) and the real verification command.
  expect(parsed.groupingRationale).toBeNull();
  expect(parsed.verificationCommands).toEqual(['npx jest --testPathPattern=tests/frontmatter']);
});
```

Also fix `tests/wbs-assembler.test.js`'s own JSON schema at `US-04-TASK-TEST-01`'s point of view:
when this test fixture directory is assembled via `loadWorkBreakdown`, assert the resulting
`US-03-TASK-INFRA-01` task object's `title`/`outcome` match the real `index.json` skeleton
values, not anything from the example block.

**Verification commands:**

```
npx jest --testPathPattern=tests/wbs-assembler.test.js
```
