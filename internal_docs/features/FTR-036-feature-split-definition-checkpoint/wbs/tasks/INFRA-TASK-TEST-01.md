<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Unit test checkDefinition evaluation and skip behaviour
- **Outcome:** tests/scripts/feature-split.test.js has a check-definition describe block. It covers skipped for epic.md, Approvals and wbs folders without reading stdin, the new-folder cases, each signal at its boundary, not-flagged, unevaluated signals, a config override of minActors, and an unchanged features-root snapshot after each call.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover check-definition evaluation and skip cases

**Implementation notes:**

Scope and assumptions. The Tech-Spec excerpt gives the behaviour but not the test-harness details. The component design body (`components/feature-split.test.js.md`) and the existing `tests/scripts/feature-split.test.js` were not in my input, so I have not read them. The code below is written against the behaviour in the skeleton and Tech-Spec. Before running it, align these items with the output of INFRA-TASK-BE-01 and BE-02:

1. **Harness.** The `runCheck` and `spyStdin` helpers call `main()` the same way the existing `apply` and `register` tests do. Copy the existing stdin-stubbing and stdout-capture mechanism. Do not invent a new one.
2. **Record shape.** The examples assume `actors`, `applications` and `flows` as arrays, with `null` meaning unevaluated (Tech-Spec §6). The flow item shape `{ name, reason }` is an assumption. Match it to the D-03 record rules in the BE-01 implementation.
3. **Signal keys in `signals`.** The examples assume the result keys `actors`, `applications` and `flows`, matching the `definitionSignals` config keys `minActors`, `minApplications` and `minFlows`. Confirm the exact keys in the BE-02 return value. Each signal value is the object `{ count, minimum, met }` that evaluateDefinition returns (INFRA-TASK-BE-01), so the tests assert on `.met`, not on a boolean. Flow names are passed through unchanged, so there is no trimming test.
4. **Config override.** `loadConfig` reads an optional project override (Tech-Spec §8). Write the `minActors` override to the path that `loadConfig` reads, inside a temp project directory. Do not edit `src/claude/scripts/feature-split.config.json`.

Do not add tests for `validate-proposal`, `RECORD_INVALID`, `FEATURE_INVALID` or dispatch. Those belong to INFRA-TASK-TEST-02 and INFRA-TASK-TEST-03.

Structure. Add one `describe('check-definition', …)` block to the existing `tests/scripts/feature-split.test.js`. Each test creates its own `fs.mkdtempSync` root and removes it in `afterEach`. Each test covers one behaviour.

Helpers (inside the describe block):

```javascript
const crypto = require('crypto');

function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else out[path.relative(root, full)] =
        crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  if (fs.existsSync(root)) walk(root);
  return JSON.stringify(out);
}

const FLAGGED = {
  actors: ['Customer', 'Admin'],
  applications: ['web', 'api'],
  flows: [{ name: 'Sign up', reason: 'independent' },
          { name: 'Pay', reason: 'independent' },
          { name: 'Refund', reason: 'independent' }],
};
const ZERO = { actors: [], applications: [], flows: [] };

// Assumed helper: stubs stdin like the existing tests and counts reads.
// runCheck(root, id, record) -> parsed JSON from main(); must match the existing harness.
```

Representative tests (complete the rest from the outcome list in the same style):

```javascript
describe('check-definition', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-def-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('returns skipped without reading stdin when the folder contains epic.md', () => {
    const dir = path.join(root, 'FTR-034-parent');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'epic.md'), '# epic');
    const stdin = spyStdin();
    const out = runCheck(root, 'FTR-034', FLAGGED, stdin);
    expect(out.status).toBe('skipped');
    expect(stdin.reads).toBe(0);
  });

  test('returns skipped without reading stdin when the folder contains a wbs directory', () => {
    const dir = path.join(root, 'FTR-035-x');
    fs.mkdirSync(path.join(dir, 'wbs'), { recursive: true });
    const stdin = spyStdin();
    expect(runCheck(root, 'FTR-035', FLAGGED, stdin).status).toBe('skipped');
    expect(stdin.reads).toBe(0);
  });

  test('treats a missing feature folder as new and evaluates the record', () => {
    const out = runCheck(root, 'FTR-040', FLAGGED, spyStdin());
    expect(out.status).toBe('flagged');
  });

  test('does not flag when actors is one below minActors and nothing else reaches its minimum', () => {
    const out = runCheck(root, 'FTR-041', { ...ZERO, actors: ['Customer'] }, spyStdin());
    expect(out.status).toBe('not-flagged');
  });

  test('flags when applications reaches minApplications exactly (boundary)', () => {
    const out = runCheck(root, 'FTR-042', { ...ZERO, applications: ['web', 'api'] }, spyStdin());
    expect(out.status).toBe('flagged');
    expect(out.signals.applications.met).toBe(true);
  });

  test('a null signal does not raise the flag and is listed in unevaluated', () => {
    const out = runCheck(root, 'FTR-043',
      { actors: null, applications: ['web'], flows: FLAGGED.flows.slice(0, 2) }, spyStdin());
    expect(out.status).toBe('not-flagged');
    expect(out.unevaluated).toEqual(['actors']);
  });

  test('a config override of minActors changes the flag decision', () => {
    // write the project override to the path loadConfig reads (see note 4), minActors: 3
    const out = runCheck(root, 'FTR-045', { ...ZERO, actors: ['a', 'b'] }, spyStdin());
    expect(out.status).toBe('not-flagged');
  });

  test('leaves the features root unchanged after each call', () => {
    const before = snapshot(root);
    runCheck(root, 'FTR-046', FLAGGED, spyStdin());
    expect(snapshot(root)).toBe(before);
  });
});
```

Coverage to reach from the outcome: add the remaining "new folder" case (an existing empty folder with no markers counts as new), a signal test at `minFlows` 3 versus 2, and the Approvals-marker skip. Each signal boundary (below and at minimum) needs its own test. The skip tests must assert zero stdin reads.

Dispatch note. The duplicate check is satisfied: this task tests the behaviour that INFRA-TASK-BE-01 and BE-02 built, which is what a TEST domain task should do. No BE implementation is written here.

**Describe title (required).** Name the describe block of this task exactly `check-definition` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('check-definition'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js -t "check-definition"
```

```
npm test
```