<a id="task-INFRA-TASK-TEST-03"></a>
### INFRA-TASK-TEST-03

- **Task ID:** INFRA-TASK-TEST-03
- **Title:** Unit test the validate-proposal command
- **Outcome:** tests/scripts/feature-split.test.js has a validate-proposal describe block, run through main. It covers a valid edit, a violation (for example a dependency cycle), a foundation warning, a malformed stdin payload, and an unchanged features-root snapshot after the call. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-03, INFRA-TASK-TEST-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover validate-proposal command

**Implementation notes:**

Scope: add one `describe('validate-proposal command', ...)` block to the existing `tests/scripts/feature-split.test.js`. Do not change any existing test, and do not change `feature-split.js`. This task is test-only. BE-03 already implemented `validate-proposal` (read-only, wraps `editProposal` and `validateProposal`, returns one JSON line with the revised proposal, `violations` and foundation warnings). TEST-02 already added its own describe block to the same file, so run after it to avoid merge conflicts.

Gaps I could not close from the inputs. Do not guess these. Resolve each from BE-03's implementation and the existing `apply` fixtures in the same test file before writing the block:
1. The exact stdin shape: the proposal object and the edit object, including field names.
2. The name of the stdin-and-argv helper that the TEST-01 and TEST-02 blocks use to call `main()` and capture stdout, exit code and stdin. The snippet below calls it `runFacade`. Rename it to match the file.
3. The fixture that triggers a foundation warning. Reuse the one the FTR-035 foundation tests use.
4. The error code and exit code for a malformed stdin payload. The spec's facade convention is exit 1 with an error code, so assert exit 1 and the code BE-03 emits.

Helper for the features-root snapshot (recursive, sorted, path plus content):

```javascript
function snapshotTree(root) {
  const entries = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const rel = path.relative(root, p);
      if (e.isDirectory()) { entries.push(rel + '/'); walk(p); }
      else entries.push(`${rel}\n${fs.readFileSync(p, 'utf8')}`);
    }
  };
  walk(root);
  return entries;
}
```

Test block (shape only; the bracketed items come from the gaps above):

```javascript
describe('validate-proposal command', () => {
  let featuresRoot;

  beforeEach(() => {
    featuresRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-vp-'));
    // seed one or more feature folders here, using the same fixture builder as the apply tests
  });

  afterEach(() => {
    fs.rmSync(featuresRoot, { recursive: true, force: true });
  });

  test('returns the revised proposal with no violations for a valid edit', () => {
    const before = snapshotTree(featuresRoot);
    const { exitCode, stdout } = runFacade(
      ['validate-proposal', '--features-root', featuresRoot],
      JSON.stringify({ proposal: /* valid proposal fixture */, edit: /* valid edit */ })
    );
    const result = JSON.parse(stdout.trim());
    expect(exitCode).toBe(0);
    expect(result.violations).toEqual([]);
    expect(snapshotTree(featuresRoot)).toEqual(before);
  });

  test('reports a dependency cycle as a violation', () => {
    const { exitCode, stdout } = runFacade(
      ['validate-proposal', '--features-root', featuresRoot],
      JSON.stringify({ proposal: /* two children */, edit: /* makes child A depend on B and B on A */ })
    );
    const result = JSON.parse(stdout.trim());
    expect(exitCode).toBe(0);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test('returns a foundation warning for a foundation-affecting edit', () => {
    const { stdout } = runFacade(
      ['validate-proposal', '--features-root', featuresRoot],
      JSON.stringify({ proposal: /* fixture from FTR-035 foundation tests */, edit: /* edit that triggers it */ })
    );
    const result = JSON.parse(stdout.trim());
    expect(result.foundationWarnings.length).toBeGreaterThan(0);
  });

  test('rejects a malformed stdin payload with exit code 1', () => {
    const before = snapshotTree(featuresRoot);
    const { exitCode } = runFacade(
      ['validate-proposal', '--features-root', featuresRoot],
      'not json'
    );
    expect(exitCode).toBe(1);
    expect(snapshotTree(featuresRoot)).toEqual(before);
  });

  test('leaves the features root unchanged after a valid call', () => {
    const before = snapshotTree(featuresRoot);
    runFacade(['validate-proposal', '--features-root', featuresRoot], JSON.stringify({ /* valid payload */ }));
    expect(snapshotTree(featuresRoot)).toEqual(before);
  });
});
```

Notes for the implementer:
- Each test does one logical thing. Keep the AAA layout (arrange the fixture, act through `runFacade`, assert).
- The `expect(exitCode).toBe(0)` on the violation and foundation cases assumes BE-03 returns violations as data and not as an error. If BE-03 exits non-zero for violations, change the assertion to match and say so in the commit body.
- Do not assert on exact violation or warning text. Assert on the array contents' presence or absence, so the test survives wording changes.
- Estimate: about 12 minutes. The work is one describe block with five tests, plus reading the existing fixtures. The scope is well inside the 15-minute target.

**Describe title (required).** Name the describe block of this task exactly `validate-proposal` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('validate-proposal'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js -t "validate-proposal"
```

```
npm test
```