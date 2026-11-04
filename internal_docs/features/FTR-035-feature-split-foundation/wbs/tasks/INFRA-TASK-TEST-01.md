<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Add tests for infrastructure helpers and facade contract
- **Outcome:** tests/scripts/feature-split.test.js exists with passing tests for FeatureSplitError fields, the slug rule, registry read, registry temp-and-rename write, first-sentence helper, staging leftover scan and the facade stdout and exit code contract, and npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-02, INFRA-TASK-BE-03, INFRA-TASK-BE-04, INFRA-TASK-BE-05, INFRA-TASK-BE-06, INFRA-TASK-BE-07
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add feature-split infrastructure tests

**Implementation notes:**

Scope: create one new file, `tests/scripts/feature-split.test.js`. Do not modify `src/claude/scripts/feature-split.js` or any other source file. If a test fails because the implementation is wrong, report the failure; do not change the source to make the test pass.

Important limit on this plan: the Tech-Spec excerpt given to this task does not include the component design file `components/feature-split.js.md`, so the exact export names of the helpers are not fixed here. The skeleton fixes only behaviour, not names. Before writing the tests, read the `module.exports` object of `src/claude/scripts/feature-split.js` (as built by INFRA-TASK-BE-01 to BE-07) and use the names found there. The names confirmed by the Tech-Spec are `slug`, `writeRegistryAtomic`, `assertNoStagingLeftovers` and `firstSentence` (which keeps the period). The registry read helper name must be read from `module.exports`. If an export is missing, stop and report it instead of guessing. `FeatureSplitError` is built as `new FeatureSplitError(code, message, { key, file })` (INFRA-TASK-BE-01).

Behaviour the tests must pin (all from the skeleton and the Tech-Spec):
- `FeatureSplitError` carries `code`, `key` (nullable) and `file` (nullable).
- Slug rule: rejects empty names, path separators, `..` and Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) with `INVALID_NAME`.
- Registry read: a missing `REGISTRY.md` gives an empty registry; a `## FTR-NNN — Title` entry with `**Keywords:**`, `**Status:**`, `**Summary:**`, `**Parent:**`, `**Depends on:**` and `→ [Detail](...)` lines is parsed; an unreadable file throws `REGISTRY_IO`.
- Registry write: content goes to `REGISTRY.md.tmp-<run id>` and is renamed over `REGISTRY.md`; no temp file remains; on failure the previous registry is intact and `REGISTRY_IO` is thrown.
- First-sentence helper: returns the text up to and including the first period followed by whitespace.
- Staging leftover scan: finds `.split-staging-*` directories and `REGISTRY.md.tmp-*` files, throws `STAGING_LEFTOVER` listing the exact paths, and removes nothing.
- Facade contract: stdout is exactly one JSON object; success exits 0; failure exits 1 with `{ "error": { code, key, file, message } }`.

Test file skeleton (adapt the helper names to the real exports):

```javascript
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB    = require('../../src/claude/scripts/feature-split');
const FACADE = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const { FeatureSplitError, slug, firstSentence } = LIB; // names confirmed by the Tech-Spec

describe('FeatureSplitError', () => {
  test('exposes code, key and file fields from its constructor', () => {
    const err = new FeatureSplitError('CONFIG_INVALID', 'bad value', { key: 'thresholds.useCases', file: 'feature-split.config.json' });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.key).toBe('thresholds.useCases');
    expect(err.file).toBe('feature-split.config.json');
  });
});

describe('slug rule', () => {
  test('rejects a Windows reserved device name with INVALID_NAME', () => {
    expect(() => slug('CON')).toThrow(expect.objectContaining({ code: 'INVALID_NAME' }));
  });
  test('rejects a name containing ".." with INVALID_NAME', () => {
    expect(() => slug('../escape')).toThrow(FeatureSplitError);
  });
});

describe('firstSentence()', () => {
  test('returns text up to the first period followed by whitespace', () => {
    expect(firstSentence('Does one thing. Then another.')).toBe('Does one thing.');
  });
});

describe('facade stdout and exit contract', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-test-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('an unknown command prints one JSON error object on stdout and exits 1', () => {
    // register is only a stub in the INFRA phase (implemented in US-05), so it is not used here
    const r = spawnSync(process.execPath, [FACADE, 'no-such-command'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);            // stdout must be exactly one JSON object
    expect(out.error).toEqual(expect.objectContaining({ code: expect.any(String), message: expect.any(String) }));
  });
});
```

Also add `describe` blocks for the registry read (missing file gives empty registry; a sample entry is parsed with each key), the registry write (temp file is renamed, no `.tmp-` file remains, and a write into a non-existent directory throws `REGISTRY_IO` while the prior content is untouched), and the staging leftover scan (a planted `.split-staging-abc` directory and `REGISTRY.md.tmp-abc` file are both listed in the thrown error and still exist afterwards). Each `test()` covers one behaviour, uses its own `mkdtempSync` directory, and cleans up in `afterEach`.

Successful `register` (exit 0, `{ id, status: "defined" }`) is covered by the facade test in `feature-split-install.test.js` or the main feature test. Include it here only if the command syntax is confirmed from `feature-split.js`.

Length note: this is a test-only task, so keep the file to the four helper groups plus the facade group above.

**Verification commands:**

```
npx jest tests/scripts/feature-split.test.js
```

```
npm test
```