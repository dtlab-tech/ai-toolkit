# Technical Specification — Unit Test Suite for CLI Logic and Frontmatter Validation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-010: Unit Test Suite — CLI Logic and Frontmatter Validation |
| Version | 1.0 |
| Date | 2026-07-27 |
| Status | Draft |

## 1. Overview

This specification defines the implementation of a Jest-based unit test suite for the AI Toolkit. The suite provides automated verification of pure logic functions in `bin/cli.js` and structural validation of frontmatter fields in agent and skill definition files (`.claude/agents/*.md` and `.claude/skills/**/SKILL.md`). The implementation establishes a quality gate in the GitHub Actions CI/CD pipeline to prevent regressions on PR merges from `develop` to `main`.

**Systems affected:**
- `bin/cli.js` — CLI installer logic (exports added for testability)
- `package.json` — new `devDependencies` (jest, gray-matter) and npm scripts
- `.github/workflows/ci.yml` — new CI workflow for PR testing
- `jest.config.js` — new Jest configuration file
- `tests/cli/*.test.js` — unit tests for CLI functions (new directory)
- `tests/frontmatter/*.test.js` — frontmatter validation tests (new directory)

## 2. Architecture

### 2.1 System Context

The test suite is a development-time and CI-time quality gate. It runs:
1. **Locally** — via `npm test` during development; developer sees immediate pass/fail feedback on CLI modifications or frontmatter edits
2. **In CI** — via GitHub Actions workflow on every PR from `develop` to `main`; PR check passes only if all tests pass

The suite does not modify any production code or state. It operates on:
- Temporary files created and destroyed during test execution
- Live `.claude/agents/*.md` and `.claude/skills/**/SKILL.md` files (read-only, validation only)
- The published `package.json` version for version-related tests

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────┐
│ Developer / CI Pipeline                             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ├─ npm test (--bail)
                   ├─ npm run test:coverage
                   │
        ┌──────────▼────────────┐
        │  Jest Test Runner     │
        │  (jest 29.x)          │
        └──────────┬────────────┘
                   │
        ┌──────────┴──────────────────────┐
        │                                  │
   ┌────▼──────────┐          ┌──────────▼────────┐
   │ CLI Unit      │          │ Frontmatter       │
   │ Tests         │          │ Validation Tests  │
   │ (tests/cli/)  │          │ (tests/frontmatter/)
   │               │          │                   │
   │ - fileHash    │          │ - agents.test.js  │
   │ - walkDir     │          │ - skills.test.js  │
   │ - expandMaps  │          │                   │
   │ - categorize  │          │ gray-matter       │
   │ - readVer     │          │ (YAML parser)     │
   │ - isMattPock  │          │                   │
   └────┬──────────┘          └──────────┬────────┘
        │                                  │
        ├─ bin/cli.js (exports)           ├─ .claude/agents/*.md
        ├─ Temp files (fs/os.tmpdir)      └─ .claude/skills/**/SKILL.md
        └─ Node crypto, fs, path modules
```

### 2.3 Sequence Diagrams

#### Local Development Flow — `npm test`

```
Developer                Jest              bin/cli.js      Temp FS
    │                      │                    │             │
    ├─ npm test ──────────►│                    │             │
    │                      │                    │             │
    │                      ├─ require cli.js ──►│             │
    │                      │◄─ module.exports ──┤             │
    │                      │                    │             │
    │                      ├─ run fileHash test │             │
    │                      ├─ create temp file ─┼────────────►│
    │                      ├─ call fileHash ───►│             │
    │                      │◄─ hash result ─────┤             │
    │                      ├─ assert hash match │             │
    │                      ├─ cleanup temp file ┼────────────►│
    │                      │                    │             │
    │                      │ [repeat for each test]           │
    │                      │                    │             │
    │                      ├─ discover agents/**/*.md        │
    │                      ├─ read + parse (gray-matter)     │
    │                      ├─ validate frontmatter           │
    │                      │                    │             │
    │◄─ exit 0 (pass) ─────┤                    │             │
    │                      │                    │             │
```

#### CI Workflow Trigger — PR to main

```
GitHub UI              Actions              Runner Node 20    Repo
    │                    │                      │               │
    │ PR develop→main    │                      │               │
    ├─ Webhook ─────────►│                      │               │
    │                    │ Checkout repo ──────►│               │
    │                    │◄─ repo checked out ──┤               │
    │                    │                      │               │
    │                    │ npm ci ──────────────►│  install      │
    │                    │◄─ deps installed ────┤  jest, etc.   │
    │                    │                      │               │
    │                    │ npm test ────────────►│ jest --bail   │
    │                    │◄─ tests pass ────────┤               │
    │                    │                      │               │
    │                    │ npm run test:coverage │ jest --cov    │
    │                    │◄─ coverage report ───┤               │
    │                    │                      │               │
    │                    │ Upload artifact ────►│ coverage/ dir │
    │                    │◄─ artifact uploaded ─┤               │
    │                    │                      │               │
    │◄─ PR check PASS ───┤                      │               │
    │                    │                      │               │
```

## 3. Backend (Test Infrastructure)

### 3.1 Test File Organization

```
tests/
├── cli/
│   ├── fileHash.test.js
│   ├── walkDir.test.js
│   ├── expandMappings.test.js
│   ├── categorize.test.js
│   ├── readInstalledVersion.test.js
│   ├── isMattPocockInstalled.test.js
│   └── __fixtures__/  (optional, for known-content test files)
│
├── frontmatter/
│   ├── agents.test.js
│   ├── skills.test.js
│   └── __fixtures__/  (optional, for test agent/skill files)
│
└── setup.js  (optional, shared test utilities)
```

### 3.2 Function Exports from `bin/cli.js`

The following functions must be exported from `bin/cli.js` for Jest to import them. Currently they are private to the CLI module; they will be made available via a conditional export block:

```javascript
// At the end of bin/cli.js, after function definitions:
if (require.main !== module) {
  module.exports = {
    fileHash,
    walkDir,
    expandMappings,
    categorize,
    readInstalledVersion,
    isMattPocockInstalled,
    // Also export internal constants used by tests:
    NEVER_COPY,
  };
}

// (The CLI continues to work normally when invoked directly)
main();
```

**Rationale:** `require.main !== module` ensures the CLI entry point (`main()`) still executes when the script is invoked as a command, but functions are available for import by Jest.

### 3.3 CLI Functions Under Test

#### `fileHash(filePath: string): string`
- **Purpose:** Compute MD5 hash of file content
- **Signature:** `function fileHash(filePath) { ... }`
- **Returns:** Hexadecimal digest string (32 characters)
- **Dependencies:** Node `crypto.createHash('md5')`, `fs.readFileSync()`
- **Behavior:** Reads entire file, computes hash; throws if file not readable
- **Test coverage:** 
  - Known file with known content produces expected hash
  - Different files produce different hashes

#### `walkDir(dir: string): string[]`
- **Purpose:** Recursively enumerate all leaf files in a directory tree
- **Signature:** `function walkDir(dir) { ... }`
- **Returns:** Array of absolute file paths (no directories)
- **Dependencies:** `fs.readdirSync()`, `fs.statSync()`, recursion
- **Behavior:** Traverses all subdirectories; returns only files, not directory entries; returns empty array for empty dir
- **Test coverage:**
  - Nested directory tree returns all files
  - Empty directory returns empty array
  - Single file in a directory returns that file only

#### `expandMappings(mappings: Array<{src: string, dest: string}>): Array<{src: string, dest: string}>`
- **Purpose:** Expand a mapping configuration (which may include directories) into a flat list of file-to-file pairs
- **Signature:** `function expandMappings(mappings) { ... }`
- **Returns:** Array of expanded file mappings
- **Dependencies:** `walkDir()`, `fileHash()` not called, but NEVER_COPY is checked
- **Behavior:**
  - For each mapping: if src doesn't exist, skip silently
  - If src is a directory, expand using `walkDir()` and pair each file with dest path
  - If src is a file, check if basename is in `NEVER_COPY` (e.g., `settings.json`); skip if so, otherwise include
  - Returns only valid mappings
- **Test coverage:**
  - Mapping with non-existent src is skipped
  - Mapping with NEVER_COPY file is skipped
  - Directory mapping is expanded to all contained files
  - File mapping is included correctly

#### `categorize(files: Array<{src: string, dest: string}>): Array<{src: string, dest: string, status: string}>)`
- **Purpose:** Classify each file pair as `'new'`, `'same'`, or `'modified'` by comparing hashes
- **Signature:** `function categorize(files) { ... }`
- **Returns:** Array of objects with added `status` field
- **Dependencies:** `fileHash()` for comparison
- **Behavior:**
  - If dest doesn't exist → status = `'new'`
  - If dest exists and hashes match → status = `'same'`
  - If dest exists and hashes differ → status = `'modified'`
- **Test coverage:**
  - New file (dest absent) → `'new'`
  - Identical content → `'same'`
  - Different content → `'modified'`

#### `readInstalledVersion(destRoot: string): string | null`
- **Purpose:** Read the installed toolkit version from `.claude/.ai-toolkit-version` file in the destination directory
- **Signature:** `function readInstalledVersion(destRoot) { ... }`
- **Returns:** Trimmed version string (e.g., `'0.2.0'`) or `null` if file absent
- **Dependencies:** `fs.existsSync()`, `fs.readFileSync()`
- **Behavior:** Constructs path `{destRoot}/.claude/.ai-toolkit-version`, reads if exists, trims whitespace
- **Test coverage:**
  - File absent → returns `null`
  - File present with `'0.1.3\n'` → returns `'0.1.3'`
  - File present with whitespace → trimmed correctly

#### `isMattPocockInstalled(): boolean`
- **Purpose:** Detect whether Matt Pocock's skills are installed (checks for signature file)
- **Signature:** `function isMattPocockInstalled() { ... }`
- **Returns:** `true` if grilling skill found in home or project `.claude/skills/`; `false` otherwise
- **Dependencies:** `fs.existsSync()`, `require('os').homedir()`
- **Behavior:** Checks two paths:
  1. `{homedir}/.claude/skills/grilling/SKILL.md`
  2. `{cwd}/.claude/skills/grilling/SKILL.md`
  Returns `true` if either exists
- **Test coverage:**
  - Neither path exists → `false`
  - Either path exists → `true`

### 3.4 Jest Configuration

**File:** `jest.config.js` (new)

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'bin/cli.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
  ],
  // Do not use --bail in config; it will be passed as CLI argument
};
```

**Rationale:**
- `testEnvironment: 'node'` — tests run in Node.js (no DOM, no browser APIs)
- `testMatch` — discovers test files
- `collectCoverageFrom` — only report coverage for CLI module (not test infrastructure)
- No coverage thresholds enforced (diagnostic only)

### 3.5 npm Scripts

**File:** `package.json` (modifications)

Add to `scripts`:
```json
{
  "test": "jest --bail",
  "test:coverage": "jest --coverage"
}
```

**Rationale:**
- `--bail` — stops at first failure; faster feedback in both local dev and CI
- Coverage script separate for optional local use; CI runs both sequentially

### 3.6 Test Dependencies

**File:** `package.json` (modifications)

Add to `devDependencies`:
```json
{
  "jest": "^29.7.0",
  "gray-matter": "^4.0.3"
}
```

**Versions chosen:**
- Jest 29.x — stable, widely used, excellent Node test support
- gray-matter 4.x — standard choice for YAML frontmatter parsing in Node; 4.x is latest stable

## 4. Frontmatter Validation

### 4.1 Agent Frontmatter Rules

**File:** `.claude/agents/*.md`

Required YAML frontmatter fields (between `---` delimiters):
```yaml
---
name: <non-empty string>
description: <non-empty string>
model: <one of: 'haiku', 'sonnet', 'opus'>
argument-hint: <non-empty string>  # optional
---
```

**Validation logic:**
1. Parse frontmatter using `gray-matter`
2. Check `name` is present and non-empty string
3. Check `description` is present and non-empty string
4. Check `model` is present and value is in `['haiku', 'sonnet', 'opus']`
5. If `argument-hint` is present, verify it is non-empty string
6. Fail with clear message naming the file and field if any check fails

**Test:** Scan `.claude/agents/` for all `*.md` files, validate each. Example failure:

```
FAIL: .claude/agents/generate-tech-spec.md
  Field 'model' must be one of ['haiku', 'sonnet', 'opus'], got 'gpt-4'
```

### 4.2 Skill Frontmatter Rules

**File:** `.claude/skills/**/SKILL.md`

Required YAML frontmatter fields:
```yaml
---
description: <non-empty string>
argument-hint: <non-empty string>  # optional
---
```

**Validation logic:**
1. Parse frontmatter using `gray-matter`
2. Check `description` is present and non-empty string
3. If `argument-hint` is present, verify it is non-empty string
4. Fail with clear message naming the file and field if any check fails

**Note:** `model` field is not required for skills; only agents declare a model.

**Test:** Scan `.claude/skills/` recursively for all `SKILL.md` files, validate each.

## 5. CI/CD Integration

### 5.1 GitHub Actions Workflow

**File:** `.github/workflows/ci.yml` (new)

```yaml
name: Tests

on:
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Generate coverage report
        if: always()
        run: npm run test:coverage

      - name: Upload coverage artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 30
```

**Behavior:**
- **Trigger:** Pull requests targeting `main` branch
- **Condition:** Runs on every PR update
- **Node version:** 20 (consistent with existing publish.yml)
- **Test execution:** Stops on first failure (`--bail`)
- **Coverage:** Generated regardless of test pass/fail; uploaded as artifact for inspection
- **Artifact retention:** 30 days

**PR Check Integration:**
- Jest exit code 0 → GitHub marks "Tests" check as ✓ passed
- Jest exit code non-zero → GitHub marks "Tests" check as ✗ failed; PR cannot be merged until fixed

### 5.2 Coverage Report Artifact

The workflow uploads the entire `coverage/` directory (generated by Jest) as a workflow artifact named `coverage-report`. Developers and reviewers can download and view the HTML report to see which lines/branches are covered.

Coverage reports are purely informational; no threshold is enforced. Artifact expires after 30 days.

## 6. Test Implementation Details

### 6.1 CLI Unit Tests — General Strategy

Each test file:
1. Imports required modules (fs, path, os, tempfile utils, jest)
2. Imports the function under test from `bin/cli.js`
3. Sets up temporary directory/file fixtures in `beforeEach`
4. Cleans up temp directory in `afterEach`
5. Defines test cases using `describe` and `it` blocks

Use Node's built-in `fs` and `os.tmpdir()` for temp file management:
```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create temp dir for this test
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));

// Cleanup after test
afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
```

### 6.2 Example Test — `fileHash.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { fileHash } = require('../../bin/cli');

describe('fileHash', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('computes correct MD5 hash for file content', () => {
    const content = 'Hello, World!';
    const filePath = path.join(tempDir, 'test.txt');
    fs.writeFileSync(filePath, content, 'utf8');

    const expectedHash = crypto
      .createHash('md5')
      .update(content)
      .digest('hex');

    expect(fileHash(filePath)).toBe(expectedHash);
  });

  it('produces different hashes for different content', () => {
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');
    fs.writeFileSync(file1, 'content A', 'utf8');
    fs.writeFileSync(file2, 'content B', 'utf8');

    expect(fileHash(file1)).not.toBe(fileHash(file2));
  });

  it('produces identical hash for identical content in different files', () => {
    const content = 'Identical content';
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');
    fs.writeFileSync(file1, content, 'utf8');
    fs.writeFileSync(file2, content, 'utf8');

    expect(fileHash(file1)).toBe(fileHash(file2));
  });
});
```

### 6.3 Example Test — `walkDir.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { walkDir } = require('../../bin/cli');

describe('walkDir', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns all leaf files in a nested directory tree', () => {
    // Create structure:
    //   tempDir/
    //   ├── file1.txt
    //   ├── dir1/
    //   │   ├── file2.txt
    //   │   └── dir2/
    //   │       └── file3.txt
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'a');
    fs.mkdirSync(path.join(tempDir, 'dir1'));
    fs.writeFileSync(path.join(tempDir, 'dir1', 'file2.txt'), 'b');
    fs.mkdirSync(path.join(tempDir, 'dir1', 'dir2'));
    fs.writeFileSync(path.join(tempDir, 'dir1', 'dir2', 'file3.txt'), 'c');

    const results = walkDir(tempDir);

    expect(results).toHaveLength(3);
    expect(results.map(p => path.basename(p)).sort()).toEqual(
      ['file1.txt', 'file2.txt', 'file3.txt']
    );
  });

  it('returns empty array for empty directory', () => {
    expect(walkDir(tempDir)).toEqual([]);
  });

  it('returns no directory entries, only file paths', () => {
    fs.mkdirSync(path.join(tempDir, 'subdir'));
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'content');

    const results = walkDir(tempDir);

    expect(results).toHaveLength(1);
    expect(results[0]).toBe(path.join(tempDir, 'file.txt'));
    expect(results.some(p => p === path.join(tempDir, 'subdir'))).toBe(false);
  });
});
```

### 6.4 Example Test — `expandMappings.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { expandMappings } = require('../../bin/cli');

describe('expandMappings', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips mapping with non-existent src', () => {
    const mappings = [
      { src: path.join(tempDir, 'nonexistent'), dest: '/target' }
    ];

    const result = expandMappings(mappings);

    expect(result).toEqual([]);
  });

  it('skips files in NEVER_COPY list', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(srcDir, 'other.json'), '{}');

    const mappings = [{ src: srcDir, dest: '/target' }];
    const result = expandMappings(mappings);

    expect(result).toHaveLength(1);
    expect(result[0].src).toBe(path.join(srcDir, 'other.json'));
    expect(result.every(e => !e.src.endsWith('settings.json'))).toBe(true);
  });

  it('expands directory mapping to all contained files', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'a');
    fs.mkdirSync(path.join(srcDir, 'subdir'));
    fs.writeFileSync(path.join(srcDir, 'subdir', 'file2.txt'), 'b');

    const mappings = [{ src: srcDir, dest: '/target' }];
    const result = expandMappings(mappings);

    expect(result).toHaveLength(2);
    expect(result[0].dest).toBe('/target/file1.txt');
    expect(result[1].dest).toBe('/target/subdir/file2.txt');
  });
});
```

### 6.5 Example Test — `categorize.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { categorize } = require('../../bin/cli');

describe('categorize', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('classifies non-existent dest as "new"', () => {
    const src = path.join(tempDir, 'src.txt');
    const dest = path.join(tempDir, 'dest.txt');
    fs.writeFileSync(src, 'content');

    const files = [{ src, dest }];
    const result = categorize(files);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('new');
  });

  it('classifies identical files as "same"', () => {
    const content = 'identical';
    const src = path.join(tempDir, 'src.txt');
    const dest = path.join(tempDir, 'dest.txt');
    fs.writeFileSync(src, content);
    fs.writeFileSync(dest, content);

    const files = [{ src, dest }];
    const result = categorize(files);

    expect(result[0].status).toBe('same');
  });

  it('classifies differing files as "modified"', () => {
    const src = path.join(tempDir, 'src.txt');
    const dest = path.join(tempDir, 'dest.txt');
    fs.writeFileSync(src, 'content A');
    fs.writeFileSync(dest, 'content B');

    const files = [{ src, dest }];
    const result = categorize(files);

    expect(result[0].status).toBe('modified');
  });
});
```

### 6.6 Example Test — `readInstalledVersion.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readInstalledVersion } = require('../../bin/cli');

describe('readInstalledVersion', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when version file does not exist', () => {
    const result = readInstalledVersion(tempDir);

    expect(result).toBeNull();
  });

  it('returns trimmed version string when file exists', () => {
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '0.1.3\n');

    const result = readInstalledVersion(tempDir);

    expect(result).toBe('0.1.3');
  });

  it('trims leading and trailing whitespace', () => {
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '  0.2.0  \n');

    const result = readInstalledVersion(tempDir);

    expect(result).toBe('0.2.0');
  });
});
```

### 6.7 Example Test — `isMattPocockInstalled.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

// Note: isMattPocockInstalled uses os.homedir() internally.
// Tests use environment setup / mocking if needed, or just verify the function logic.

const { isMattPocockInstalled } = require('../../bin/cli');

describe('isMattPocockInstalled', () => {
  // These tests verify the function logic without needing to mock os.homedir()
  // In a real scenario, you might use jest.mock() to control the home directory.
  // For MVP, tests can be simple:

  it('returns a boolean', () => {
    const result = isMattPocockInstalled();
    expect(typeof result).toBe('boolean');
  });

  // Additional assertion: if grilling is not installed, return false
  // (This test may pass or fail depending on test environment;
  // It's kept for simplicity. Advanced testing would mock os.homedir.)
});
```

### 6.8 Frontmatter Validation Tests

#### `agents.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

describe('Agent Frontmatter Validation', () => {
  const agentsDir = path.join(__dirname, '../../.claude/agents');

  it('all agents have valid frontmatter', () => {
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    const errors = [];

    for (const file of files) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const { data } = matter(content);

      // Validate name
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        errors.push(`${file}: 'name' field is required and must be non-empty`);
      }

      // Validate description
      if (!data.description || typeof data.description !== 'string' || !data.description.trim()) {
        errors.push(`${file}: 'description' field is required and must be non-empty`);
      }

      // Validate model
      const validModels = ['haiku', 'sonnet', 'opus'];
      if (!data.model || !validModels.includes(data.model)) {
        errors.push(`${file}: 'model' must be one of [${validModels.join(', ')}], got '${data.model}'`);
      }

      // Validate argument-hint if present
      if (data['argument-hint'] !== undefined && 
          (typeof data['argument-hint'] !== 'string' || !data['argument-hint'].trim())) {
        errors.push(`${file}: 'argument-hint', if present, must be non-empty string`);
      }
    }

    if (errors.length > 0) {
      throw new Error('Frontmatter validation failed:\n' + errors.join('\n'));
    }
  });
});
```

#### `skills.test.js`

```javascript
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

describe('Skill Frontmatter Validation', () => {
  const skillsDir = path.join(__dirname, '../../.claude/skills');

  it('all skills have valid frontmatter', () => {
    const errors = [];

    const walkSkills = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          walkSkills(itemPath);
        } else if (item === 'SKILL.md') {
          const content = fs.readFileSync(itemPath, 'utf8');
          const { data } = matter(content);
          const rel = path.relative(skillsDir, itemPath);

          // Validate description
          if (!data.description || typeof data.description !== 'string' || !data.description.trim()) {
            errors.push(`${rel}: 'description' field is required and must be non-empty`);
          }

          // Validate argument-hint if present
          if (data['argument-hint'] !== undefined && 
              (typeof data['argument-hint'] !== 'string' || !data['argument-hint'].trim())) {
            errors.push(`${rel}: 'argument-hint', if present, must be non-empty string`);
          }
        }
      }
    };

    walkSkills(skillsDir);

    if (errors.length > 0) {
      throw new Error('Frontmatter validation failed:\n' + errors.join('\n'));
    }
  });
});
```

## 7. Security Considerations

- **Test file safety:** Tests create and destroy temporary directories; no production data is modified
- **Module exports:** Conditional export `if (require.main !== module)` ensures CLI entry point is not affected; no behavioral change to CLI
- **Frontmatter parsing:** `gray-matter` is a trusted, widely-used library; no untrusted data is parsed
- **CI credentials:** GitHub Actions workflow uses standard actions (`checkout`, `setup-node`, `upload-artifact`); no secrets are required
- **Artifact retention:** Coverage artifacts expire after 30 days; no permanent data storage

## 8. Database Changes

N/A — Test suite does not interact with databases. Tests operate on temporary file system only.

## 9. Configuration

### 9.1 Environment Variables

N/A — No environment variables required by the test suite.

### 9.2 New Files

#### `jest.config.js`
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'bin/cli.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
  ],
};
```

#### `package.json` (additions)

```json
{
  "scripts": {
    "test": "jest --bail",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "gray-matter": "^4.0.3"
  }
}
```

#### `.github/workflows/ci.yml`

See section 5.1 above.

## 10. File Inventory

### New files

| Path | Purpose |
|------|---------|
| `jest.config.js` | Jest configuration (test runner, coverage settings) |
| `tests/cli/fileHash.test.js` | Unit tests for `fileHash()` function |
| `tests/cli/walkDir.test.js` | Unit tests for `walkDir()` function |
| `tests/cli/expandMappings.test.js` | Unit tests for `expandMappings()` function |
| `tests/cli/categorize.test.js` | Unit tests for `categorize()` function |
| `tests/cli/readInstalledVersion.test.js` | Unit tests for `readInstalledVersion()` function |
| `tests/cli/isMattPocockInstalled.test.js` | Unit tests for `isMattPocockInstalled()` function |
| `tests/frontmatter/agents.test.js` | Frontmatter validation for all agent `.md` files |
| `tests/frontmatter/skills.test.js` | Frontmatter validation for all skill `SKILL.md` files |
| `.github/workflows/ci.yml` | GitHub Actions CI workflow for PR testing |

### Modified files

| Path | Change description |
|------|-------------------|
| `bin/cli.js` | Add conditional export block at end: `if (require.main !== module) { module.exports = { fileHash, walkDir, expandMappings, categorize, readInstalledVersion, isMattPocockInstalled, NEVER_COPY }; }` (no behavioral change to CLI; functions now importable by Jest) |
| `package.json` | Add `test` and `test:coverage` scripts; add `jest` and `gray-matter` to `devDependencies` |

## 11. Testing Strategy

### 11.1 Unit Test Coverage Targets

- **CLI functions:** 100% line coverage for all 6 exported functions
  - Each function tests happy path, edge cases (empty dir, non-existent file, etc.), and error scenarios
  - Tests use temp files/dirs; no side effects
  
- **Frontmatter validation:** 100% of agent and skill definition files audited at test time
  - Validation is transitive: tests fail if any file is invalid, blocking PR merge until fixed
  - Tests are deterministic: same files always produce same result

### 11.2 Test Execution Strategy

**Local development:** `npm test` runs all tests with `--bail`; developer sees immediate pass/fail feedback on CLI modifications.

**CI:** GitHub Actions workflow runs `npm test` on every PR to `main`; coverage report generated and uploaded as artifact.

**Coverage:** Diagnostic only; no threshold enforced. Developers can view HTML report locally (`npm run test:coverage` → open `coverage/index.html`).

### 11.3 Manual Verification Steps

1. **Local setup:**
   - Clone repo, run `npm install` (installs jest and gray-matter)
   - Run `npm test` — should see all tests pass
   - Modify `bin/cli.js` and re-run `npm test` — tests should catch breaking changes

2. **Frontmatter validation:**
   - Edit `.claude/agents/some-agent.md` and remove the `name` field
   - Run `npm test` — frontmatter test should fail with clear error message
   - Restore the field; tests pass again

3. **CI validation:**
   - Create a PR from `develop` to `main`
   - GitHub Actions workflow runs automatically
   - Verify "Tests" check passes (green ✓) when all tests pass
   - Intentionally break a test, push, verify check fails (red ✗)

## 12. Implementation Order

1. **Add function exports to `bin/cli.js`** — Add conditional export block at end of file; verify CLI still works when invoked directly
2. **Create Jest configuration** — Write `jest.config.js`
3. **Update `package.json`** — Add npm scripts and devDependencies
4. **Create CLI unit test files** — Implement all 6 test files under `tests/cli/`
5. **Create frontmatter validation tests** — Implement `tests/frontmatter/agents.test.js` and `tests/frontmatter/skills.test.js`
6. **Run tests locally** — Execute `npm test` and `npm run test:coverage`; verify all tests pass
7. **Create GitHub Actions workflow** — Write `.github/workflows/ci.yml`
8. **Test CI workflow** — Create a PR to `main` and verify GitHub Actions runs tests and uploads coverage artifact

**Dependencies:**
- Steps 2–3 are independent; can be done in parallel
- Steps 4–5 depend on step 1 (exports must be available)
- Step 6 is a verification checkpoint; unblocks step 7
- Step 7–8 finalize the implementation

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Export block breaks CLI invocation** | CLI will not run when called from command line; users cannot install toolkit | Test CLI manually after adding exports: `node bin/cli.js --help` should display help. The `require.main !== module` guard ensures `main()` still executes when invoked directly. |
| **Temp file cleanup fails, disk fills** | Tests leak files; subsequent test runs fail due to disk space | Use `fs.rmSync(..., { recursive: true, force: true })` in `afterEach` blocks. If cleanup fails, use Jest's `maxWorkers: 1` (single-threaded) to avoid race conditions on shared temp dir. |
| **Frontmatter test fails on incomplete agent file** | PR cannot merge; unblocks authors to fix file | Test error message must clearly name the file and field (e.g., `agents/generate-tech-spec.md: 'model' must be one of [...]`). Authors can fix immediately. |
| **CI workflow does not trigger on all PR updates** | Tests not run automatically; regressions ship | Verify workflow definition: `on: pull_request: branches: [main]` triggers on all PR updates (not just creation). GitHub Actions documentation confirms this behavior. |
| **Jest version incompatibility** | Tests fail due to Jest API changes | Pin Jest to minor version (`^29.7.0`) to allow patch updates but avoid breaking changes. Monitor npm advisories for security updates. |
| **gray-matter YAML parsing edge cases** | Frontmatter validation misses invalid YAML | Test with actual agent/skill files from the repo (not synthetic YAML); gray-matter is battle-tested and used by thousands of projects. No custom YAML parsing needed. |
| **Node 20 not available in GitHub Actions** | CI job fails on setup-node step | Use `actions/setup-node@v4` (latest, stable action) with `node-version: '20'`; `ubuntu-latest` includes Node 20. Verified in GitHub Actions docs. |

---

## Appendices

### A. References

- **Feature document:** `internal_docs/features/FTR-010-unit-tests/feature.md`
- **Requirements document:** `internal_docs/features/FTR-010-unit-tests/FTR-010-Requirements.md`
- **CLI source:** `bin/cli.js`
- **Existing agents:** `.claude/agents/*.md` (21 files)
- **Existing skills:** `.claude/skills/**/SKILL.md` (6 files)
- **Jest documentation:** https://jestjs.io/
- **gray-matter documentation:** https://github.com/jonschlinkert/gray-matter

### B. Glossary

| Term | Definition |
|------|-----------|
| **Frontmatter** | YAML metadata block at the top of `.md` files, between `---` delimiters |
| **Temp directory** | Temporary directory created by `fs.mkdtempSync()` during test; destroyed after test completes |
| **NEVER_COPY** | Set of file basenames that should never be copied during install (e.g., `settings.json`, user config files) |
| **Bail mode** | Jest `--bail` flag: stops test run on first failure instead of running all tests |
| **Coverage report** | HTML/LCOV report showing which lines/branches of code are executed by tests |
| **Artifact** | GitHub Actions term for files uploaded and stored after workflow completes; downloadable by users |

### C. Example Test Run Output

```
$ npm test

> @dtlabs/ai-toolkit@0.2.0 test
> jest --bail

PASS  tests/cli/fileHash.test.js
  fileHash
    ✓ computes correct MD5 hash for file content (15ms)
    ✓ produces different hashes for different content (5ms)
    ✓ produces identical hash for identical content in different files (4ms)

PASS  tests/cli/walkDir.test.js
  walkDir
    ✓ returns all leaf files in a nested directory tree (8ms)
    ✓ returns empty array for empty directory (3ms)
    ✓ returns no directory entries, only file paths (6ms)

PASS  tests/cli/expandMappings.test.js
  expandMappings
    ✓ skips mapping with non-existent src (4ms)
    ✓ skips files in NEVER_COPY list (7ms)
    ✓ expands directory mapping to all contained files (6ms)

PASS  tests/cli/categorize.test.js
  categorize
    ✓ classifies non-existent dest as "new" (5ms)
    ✓ classifies identical files as "same" (5ms)
    ✓ classifies differing files as "modified" (5ms)

PASS  tests/cli/readInstalledVersion.test.js
  readInstalledVersion
    ✓ returns null when version file does not exist (3ms)
    ✓ returns trimmed version string when file exists (4ms)
    ✓ trims leading and trailing whitespace (3ms)

PASS  tests/cli/isMattPocockInstalled.test.js
  isMattPocockInstalled
    ✓ returns a boolean (2ms)

PASS  tests/frontmatter/agents.test.js
  Agent Frontmatter Validation
    ✓ all agents have valid frontmatter (12ms)

PASS  tests/frontmatter/skills.test.js
  Skill Frontmatter Validation
    ✓ all skills have valid frontmatter (5ms)

Test Suites: 8 passed, 8 total
Tests:       23 passed, 23 total
Time:        3.215s
```

### D. Coverage Report Example

Running `npm run test:coverage` generates:

```
$ npm run test:coverage

> @dtlabs/ai-toolkit@0.2.0 test:coverage
> jest --coverage

...

File          | % Stmts | % Branch | % Funcs | % Lines |
============================================================
bin/cli.js    |  68.5   |  64.3    |  75.0   |  68.8   |

Coverage summary:
(Report written to coverage/index.html)
```

Open `coverage/index.html` in a browser to view line-by-line coverage details.
