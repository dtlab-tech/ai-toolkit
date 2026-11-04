<a id="task-US-05-TASK-TEST-04"></a>
### US-05-TASK-TEST-04

- **Task ID:** US-05-TASK-TEST-04
- **Title:** Add facade register stdout and exit tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests that run the register command through the facade. Success prints exactly one JSON object { id, status: 'defined' } with exit 0. A missing feature.md exits 1 with a JSON error object. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-03
- **Acceptance criteria:** AC-37
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add facade register stdout and exit tests

**Implementation notes:**

Append one `describe` block to the existing `tests/scripts/feature-split.test.js`. Do not edit earlier tests. This block covers only the facade's `register` path (BE-03), so it does not re-test `register()` internals.

Scope and inputs:
- The facade contract (from INFRA-TASK-BE-02) is: exactly one JSON object on stdout. Exit 0 on success. On `FeatureSplitError` or an operational error, print `{ error: { code, key, file, message } }` and exit 1.
- `register` takes `--features-root <dir>`, a feature directory argument, and an optional `--keywords a,b` comma list (US-05-TASK-BE-03).
- A feature folder with no `feature.md` makes `readFeatureForRegister` throw `FEATURE_INVALID` (US-05-TASK-BE-01). The facade must map that to exit 1 and the error object.
- `FTR-001` is derived from the folder prefix. The success result is `{ id: 'FTR-001', status: 'defined' }`.

Runner conflict to flag at Gate 1: the Tech-Spec header assumes `node:test`, but AGENTS.md documents Jest (`describe`/`test`/`expect`, `beforeEach`/`afterEach`). The snippet below uses the AGENTS.md Jest style. Match whatever style the file already uses (set by INFRA-TASK-TEST-01 and earlier tests). The facade invocation helper `runFacade` should reuse the helper and path constant the earlier facade tests already use. Do not add a new `run-asset` path, because the Tech-Spec does not give one.

Fixture and helper (reuse the file's existing helpers if present):

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Reuse the run-asset invocation helper from the existing facade tests.
// Returns { status, stdout } for `run-asset scripts/feature-split.js --project <root> -- <args...>`.
function runFacade(project, args) { /* existing helper */ }

describe('facade register command (stdout and exit contract)', () => {
  let root;
  let featuresRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-register-facade-'));
    featuresRoot = path.join(root, 'internal_docs', 'features');
    fs.mkdirSync(featuresRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('prints exactly one JSON object { id, status: "defined" } and exits 0 on success', () => {
    const featureDir = path.join(featuresRoot, 'FTR-001-login');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'feature.md'),
      '# Login\n\n## Summary\n\nUsers sign in. Sessions expire.\n'
    );

    const r = runFacade(root, [
      'register', '--features-root', featuresRoot, featureDir, '--keywords', 'auth,login',
    ]);

    expect(r.status).toBe(0);
    // JSON.parse on the whole trimmed stdout fails if more than one object was printed.
    expect(JSON.parse(r.stdout.trim())).toEqual({ id: 'FTR-001', status: 'defined' });
  });

  test('exits 1 and prints a JSON error object when feature.md is missing', () => {
    const featureDir = path.join(featuresRoot, 'FTR-002-empty');
    fs.mkdirSync(featureDir, { recursive: true }); // no feature.md

    const r = runFacade(root, ['register', '--features-root', featuresRoot, featureDir]);

    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout.trim());
    expect(out.error.code).toBe('FEATURE_INVALID');
    expect(typeof out.error.message).toBe('string');
  });
});
```

Notes on the assertions:
- The success case asserts the whole stdout, so an extra log line or a second object makes the test fail.
- The error case checks `error.code` only. It does not depend on the exact message text.
- Both cases use temp directories under the OS temp dir and remove them in `afterEach`. Neither touches `internal_docs/features/` of the real repo.

Verification commands:

```
npm test
```

```
test -f tests/scripts/feature-split.test.js && grep -c "facade register command" tests/scripts/feature-split.test.js
```

**Verification commands:**

```
npm test
```

```
test -f tests/scripts/feature-split.test.js && grep -c "facade register command" tests/scripts/feature-split.test.js
```