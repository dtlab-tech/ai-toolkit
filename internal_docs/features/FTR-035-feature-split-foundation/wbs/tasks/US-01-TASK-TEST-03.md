<a id="task-US-01-TASK-TEST-03"></a>
### US-01-TASK-TEST-03

- **Task ID:** US-01-TASK-TEST-03
- **Title:** Add installer placement test for default config
- **Outcome:** tests/scripts/feature-split-install.test.js exists with passing checks. They confirm the default config file exists in src/claude/scripts and that ai-toolkit --local on an empty directory places it, byte-identical, at .claude/scripts/feature-split.config.json. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-INFRA-01
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add config install placement test

**Implementation notes:**

Create one new file, `tests/scripts/feature-split-install.test.js`. Change no existing code and no installer code. The file depends on INFRA-TASK-INFRA-01, which creates `src/claude/scripts/feature-split.config.json`.

Deviation from the Tech-Spec excerpt: the excerpt's sketch uses `node:test` and ESM. AGENTS.md states that `npm test` runs Jest and that test files use `'use strict'`, CommonJS `require`, and the global `describe`/`test`/`beforeAll`/`afterAll`. This task follows the AGENTS.md pattern so it runs under the same runner as the other test files. The checks themselves are the four cases from the Tech-Spec.

Open points to confirm before writing (the Tech-Spec leaves them open):
- Installer entry point. AGENTS.md shows `require('../../bin/cli')` exporting helpers, so `bin/cli.js` exists at the repo root. The plan spawns it with `process.execPath` and passes `--local <dir>`. This avoids depending on `ai-toolkit` being on PATH, which is unreliable on Windows with `shell: true`. If `bin/cli.js` does not run the installer when executed directly, use the package bin entry instead.
- Jest `testMatch` must pick up `tests/scripts/*.test.js`. Check the existing files in that directory.

Implementation (new file, complete):

```javascript
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT     = path.join(__dirname, '..', '..');
const SOURCE_CONFIG = path.join(REPO_ROOT, 'src', 'claude', 'scripts', 'feature-split.config.json');
const CLI_BIN       = path.join(REPO_ROOT, 'bin', 'cli.js'); // confirm entry point, see above

describe('feature-split.config.json distribution (D-06)', () => {
  let targetDir;
  let runResult;

  beforeAll(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft035-install-'));
    runResult = spawnSync(process.execPath, [CLI_BIN, '--local', targetDir], { encoding: 'utf8' });
    if (runResult.status !== 0) {
      throw new Error(
        `installer failed (status ${runResult.status})\nstdout: ${runResult.stdout}\nstderr: ${runResult.stderr}`
      );
    }
  });

  afterAll(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  test('default config exists as a regular file in src/claude/scripts', () => {
    expect(fs.statSync(SOURCE_CONFIG).isFile()).toBe(true);
  });

  test('ai-toolkit --local on an empty directory exits with status 0', () => {
    // A non-zero status makes beforeAll throw with stdout and stderr attached.
    expect(runResult.status).toBe(0);
  });

  test('installed config sits at .claude/scripts/ and is byte-identical to the source', () => {
    const installed = path.join(targetDir, '.claude', 'scripts', 'feature-split.config.json');
    expect(fs.existsSync(installed)).toBe(true);
    expect(fs.readFileSync(installed)).toEqual(fs.readFileSync(SOURCE_CONFIG));
  });

  test('no *.test.js file is installed under .claude/scripts/', () => {
    const dir = path.join(targetDir, '.claude', 'scripts');
    const testFiles = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => name.endsWith('.test.js'))
      : [];
    expect(testFiles).toEqual([]);
  });
});
```

Scope limits: the file checks placement and distribution only. Config values, overlay behaviour and error types belong to `tests/scripts/feature-split.test.js` (US-01-TASK-TEST-01/02) and are not asserted here. The file imports no product code.

Estimate basis: one small test file, one installer run, and one `npm test` run. About 12 minutes is realistic, including resolving the two open points above.

**Verification commands:**

```
grep -qF "describe('feature-split.config.json distribution (D-06)'" tests/scripts/feature-split-install.test.js
```

```
test -f src/claude/scripts/feature-split.config.json
```

```
npm test -- --testPathPattern=feature-split-install
```

```
npm test
```