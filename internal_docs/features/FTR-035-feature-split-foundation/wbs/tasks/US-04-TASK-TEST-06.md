<a id="task-US-04-TASK-TEST-06"></a>
### US-04-TASK-TEST-06

- **Task ID:** US-04-TASK-TEST-06
- **Title:** Add facade apply stdout and exit tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests that run the apply command with the proposal on stdin. Success prints exactly one JSON object { epic, children: [{ id, dir }], registry: true } with exit 0. A FeatureSplitError exits 1 with a JSON error object. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-12
- **Acceptance criteria:** AC-36
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add facade apply contract tests

**Implementation notes:**

This task adds one `describe` block to `tests/scripts/feature-split.test.js`. It exercises the facade (`run-asset scripts/feature-split.js ... -- apply`) as a child process, so it checks stdout and exit status, not the library function. The facade is built by US-04-TASK-BE-12, which this task depends on. The `sampleProposal` and `tmpProject` helpers are defined by earlier tasks in the same file. This task does not redefine them.

Duplicate check: US-04-TASK-BE-12 is the implementation this task verifies. This is a TEST task, so the overlap is expected.

Open points the host should confirm before implementation:
1. **Test runner.** The Tech-Spec assumes `node:test` with `node:assert/strict`. The AGENTS.md sample uses Jest (`describe`/`test`/`expect`, `beforeEach`/`afterEach`). The code below follows the Tech-Spec. If the project runs Jest, swap `assert.*` for `expect(...)` and keep the same cases.
2. **Invocation on Windows.** `spawnSync('run-asset', ...)` may need `shell: true` or the `.cmd` shim on win32. Confirm how the existing tests launch `run-asset`.
3. **Registry heading.** The fixture uses the em-dash heading `## FTR-001 — Parent`, as stated in the Tech-Spec component index. Change Gap 6 says the colon form is assumed. Check the live `REGISTRY.md` and use whichever form it actually has.
4. **Error code.** The test asserts only that `error.code` is a non-empty string for the one-child refusal. The spec does not name the code `validateProposal` raises, so the test does not invent one. Only `INVALID_PROPOSAL` for unparseable stdin is named by BE-12.

Scope: the tests here do not depend on the pending gaps (late child, malformed override, epic Detail target, rollback seam).

```js
const { spawnSync } = require('node:child_process');

function runFacadeApply({ projectRoot, featuresRoot, parentId, stdin }) {
  const result = spawnSync(
    'run-asset',
    ['scripts/feature-split.js', '--project', projectRoot, '--',
     'apply', '--features-root', featuresRoot, '--parent', parentId],
    { input: stdin, encoding: 'utf8' }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('facade apply command', () => {
  let root;
  let featuresRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-facade-'));
    featuresRoot = path.join(root, 'internal_docs', 'features');
    fs.mkdirSync(path.join(featuresRoot, 'FTR-001'), { recursive: true });
    fs.writeFileSync(path.join(featuresRoot, 'FTR-001', 'feature.md'),
      '# Parent\n\n## Summary\n\nOriginal summary. More.\n');
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'),
      '## FTR-001 — Parent\n\n**Keywords:** auth\n**Status:** defined\n**Summary:** Original summary. More.\n\n---\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('prints exactly one JSON result object and exits 0 on success', () => {
    const r = runFacadeApply({
      projectRoot: root, featuresRoot, parentId: 'FTR-001',
      stdin: JSON.stringify(sampleProposal()),
    });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout); // throws if stdout holds more than one object
    assert.deepEqual(Object.keys(out).sort(), ['children', 'epic', 'registry']);
    assert.ok(out.epic);
    assert.equal(out.children.length, 2);
    for (const child of out.children) {
      assert.ok(child.id);
      assert.ok(child.dir);
    }
    assert.equal(out.registry, true);
  });

  test('exits 1 and prints a JSON error object when a FeatureSplitError is raised', () => {
    const oneChild = sampleProposal({ children: [sampleProposal().children[0]] });
    const r = runFacadeApply({
      projectRoot: root, featuresRoot, parentId: 'FTR-001',
      stdin: JSON.stringify(oneChild),
    });
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(typeof out.error.code, 'string');
    assert.ok(out.error.message.length > 0);
  });

  test('exits 1 with INVALID_PROPOSAL when stdin is not valid JSON', () => {
    const r = runFacadeApply({
      projectRoot: root, featuresRoot, parentId: 'FTR-001',
      stdin: '{not json',
    });
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).error.code, 'INVALID_PROPOSAL');
  });
});
```

Length check: the block above is the full addition for this task. Each case states one behavior: the success shape and exit 0, a refused proposal with exit 1 and a JSON error object, and unparseable stdin.

**Verification commands:**

```
grep -qF "describe('facade apply command'" tests/scripts/feature-split.test.js
```

```
npm test
```