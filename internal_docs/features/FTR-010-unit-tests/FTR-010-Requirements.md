# Functional Requirements — Unit Test Suite for CLI Logic and Frontmatter Validation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-010: Unit Test Suite — CLI Logic and Frontmatter Validation |
| Version | 1.0 |
| Date | 2026-07-27 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This functional requirements document specifies the requirements for a Jest-based unit test suite that provides automated quality assurance for the AI Toolkit. The suite covers two core concerns: (1) unit testing of pure logic functions in `bin/cli.js` that currently lack coverage and pose an invisible regression risk, and (2) structural validation of required frontmatter fields in agent and skill definition files to prevent silent agent degradation at runtime.

### 1.2 Scope

**In scope:**
- Jest test framework setup with `jest-config.js`
- Unit tests for pure functions in `bin/cli.js`: `fileHash`, `walkDir`, `expandMappings`, `categorize`, `readInstalledVersion`, `isMattPocockInstalled`
- Frontmatter validation tests for all `.claude/agents/*.md` files (required fields: `name`, `description`, `model`)
- Frontmatter validation tests for all `.claude/skills/**/SKILL.md` files (required field: `description`)
- Optional frontmatter field validation (`argument-hint`) on both agent and skill files
- npm scripts: `npm test` (Jest with `--bail`) and `npm run test:coverage` (with lcov + HTML reporting)
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) triggered on PR to `main` from `develop`
- Test file organization: `tests/cli/` and `tests/frontmatter/` at repository root
- Development dependencies: `jest`, `gray-matter` (YAML frontmatter parser)

**Out of scope:**
- Workflow script mock runtime tests (deferred — no mock infrastructure defined yet)
- Behavioral tests of agent `.md` files (untestable with unit tests; behavior is interpreted by Claude Code runtime)
- End-to-end / integration tests that invoke the CLI as a child process
- Coverage threshold enforcement (coverage is diagnostic only; no minimum percentage enforced)
- Testing interactive prompts (`askConfirm`, `askMattPocock`, `installMattPocock`) — involve stdin/stdout
- Testing output formatting functions (`banner`, `divider`, `clr`, etc.)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Developer | Software engineer who modifies `bin/cli.js` or agent/skill `.md` files; runs `npm test` and `npm run test:coverage` locally during development sessions |
| CI Pipeline | Automated GitHub Actions workflow that executes tests on every PR from `develop` to `main` and reports pass/fail status to GitHub PR checks |

## 2. Use Cases

### UC-01: Developer Runs Tests Locally During Development

| Field | Value |
|-------|-------|
| Actor | Developer |
| Preconditions | Repository is cloned; `npm install` has been executed; developer has modified code in `bin/cli.js` or `.claude/` markdown files |
| Trigger | Developer executes `npm test` from repository root |
| Priority | Must |

**Main flow:**
1. Developer runs `npm test` from the repository root
2. Jest discovers all test files under `tests/cli/` and `tests/frontmatter/`
3. Jest executes all discovered tests in sequence
4. Jest stops on the first test failure (due to `--bail` flag) and reports the error
5. All tests pass and Jest reports summary to stdout (count of suites, count of tests, total time)
6. Jest exits with code 0 (all pass) or non-zero code (any failure)

**Alternative flows:**
- If tests fail early due to `--bail`, developer sees failure details, fixes the issue, and re-runs
- Developer may run `npm run test:coverage` instead to also generate a coverage report

**Error flows:**
- If Jest or dependencies are not installed, npm prints an error and exits non-zero
- If test files are malformed or have syntax errors, Jest reports a parsing error
- If source code under test throws an exception, Jest catches it and reports as a test failure

**Postconditions:**
- Exit code matches test outcome (0 for all-pass, non-zero if any test failed)
- Developer receives clear signal on code correctness before committing changes

---

### UC-02: Developer Generates Coverage Report Locally

| Field | Value |
|-------|-------|
| Actor | Developer |
| Preconditions | Repository is cloned; `npm install` has been executed |
| Trigger | Developer executes `npm run test:coverage` from repository root |
| Priority | Must |

**Main flow:**
1. Developer runs `npm run test:coverage` from the repository root
2. Jest runs all tests with coverage instrumentation enabled
3. Jest collects coverage metrics (line coverage, branch coverage, function coverage)
4. Jest generates coverage reports in `coverage/` directory:
   - `coverage/lcov.info` (LCOV format, machine-readable)
   - `coverage/index.html` (interactive HTML report)
   - Text summary printed to stdout
5. Jest prints coverage summary to console (coverage percentages by file)
6. Jest exits with code 0 (all tests pass) or non-zero (any test failed)

**Alternative flows:**
- None; behavior is deterministic

**Error flows:**
- Same as UC-01 (Jest not installed, malformed tests, etc.)
- If coverage directory cannot be written, Jest reports a file I/O error

**Postconditions:**
- HTML report is viewable at `coverage/index.html` in a web browser
- Coverage metrics are available for diagnostic inspection
- Developer can identify untested code paths (coverage is informational, no threshold enforced)

---

### UC-03: CI Pipeline Runs Tests on PR to Main

| Field | Value |
|-------|-------|
| Actor | CI Pipeline (GitHub Actions) |
| Preconditions | A PR from `develop` to `main` is opened or updated; `.github/workflows/ci.yml` is checked into the repository |
| Trigger | GitHub detects a pull request event targeting `main` and triggers the workflow |
| Priority | Must |

**Main flow:**
1. GitHub Actions workflow (`ci.yml`) is triggered
2. Workflow checks out the PR branch and switches to the PR commit
3. Workflow sets up Node.js 20 environment on `ubuntu-latest` runner
4. Workflow runs `npm ci` (clean install from package-lock.json) to install dependencies
5. Workflow runs `npm test` to execute all tests with `--bail` flag
6. On test success, workflow runs `npm run test:coverage` to generate coverage report
7. Workflow uploads coverage report as a GitHub workflow artifact (HTML + LCOV files)
8. Workflow job completes with exit code 0
9. GitHub marks the PR check as "passed" (green check mark visible to reviewer)

**Alternative flows:**
- If a test fails during `npm test`, Jest exits with non-zero code
- Workflow skips coverage generation and artifact upload
- Workflow job fails immediately

**Error flows:**
- If `npm ci` fails (missing packages in lock file, network error), workflow fails with dependency error
- If Node.js 20 is not available on the runner, workflow setup fails
- If `npm test` exits non-zero, subsequent commands are skipped and job fails
- If coverage artifacts cannot be written, job fails

**Postconditions:**
- On success: All tests passed; coverage artifact is available for download; PR check is green
- On failure: At least one test failed; error details are visible in the workflow job logs; PR check is red; PR cannot be merged (if branch protection is enabled)

---

### UC-04: Frontmatter Validator Detects Missing Required Fields

| Field | Value |
|-------|-------|
| Actor | Test framework (Jest) executing frontmatter tests |
| Preconditions | All `.claude/agents/*.md` and `.claude/skills/**/SKILL.md` files exist in the repository; frontmatter validation tests are executing |
| Trigger | Jest executes `tests/frontmatter/` test files |
| Priority | Must |

**Main flow:**
1. Frontmatter tests discover all `.claude/agents/*.md` files
2. For each agent file, tests read the file and parse the frontmatter YAML block using `gray-matter`
3. Tests validate that `name` field exists, is a string, and is non-empty
4. Tests validate that `description` field exists, is a string, and is non-empty
5. Tests validate that `model` field exists and has one of the allowed values: `haiku`, `sonnet`, `opus`
6. Tests validate that if `argument-hint` field is present, it is a non-empty string
7. Tests repeat for all `.claude/skills/**/SKILL.md` files, validating `description` as required (no `model` required for skills)
8. If all validations pass for all files, tests pass
9. If any validation fails, test fails with a clear error message naming the specific file and the specific field that failed

**Alternative flows:**
- Optional fields (`argument-hint`) that are omitted are not flagged as failures; only presence and content are validated if the field is declared

**Error flows:**
- Missing `name` field on agent file → Test fails immediately with message: "agents/[filename].md: missing required field 'name'"
- Missing `description` field → Test fails with message naming the file and field
- Invalid `model` value (e.g., `'claude'`) → Test fails with message: "agents/[filename].md: invalid value for 'model' field: must be one of ['haiku', 'sonnet', 'opus']"
- If a file cannot be read (permissions error), test fails with file access error
- If frontmatter cannot be parsed (malformed YAML), test fails with parse error message

**Postconditions:**
- All required frontmatter fields are present and valid across the entire agent and skill file set
- Any deviation from the contract is surfaced immediately with detailed error messages

---

### UC-05: Unit Test Validates File Hashing

| Field | Value |
|-------|-------|
| Actor | Jest test framework |
| Preconditions | Tests in `tests/cli/fileHash.test.js` are executing; Jest has created temporary test files via `beforeEach` hook |
| Trigger | Jest runs the `fileHash` unit test |
| Priority | Must |

**Main flow:**
1. Jest test setup (beforeEach) creates a temporary file with known content (e.g., "hello world")
2. Test calls `fileHash(filePath)` with the path to the temporary file
3. Function reads the file's complete content from disk
4. Function computes the MD5 hash of the file's byte content
5. Function returns the hash as a hexadecimal string (32 characters)
6. Test asserts that the returned hash string matches the pre-computed expected MD5 digest for that content
7. If hash matches, test passes
8. Test teardown (afterEach) deletes the temporary file

**Alternative flows:**
- Multiple files with different content are tested; each produces a different correct hash

**Error flows:**
- If the file path does not exist, function behavior is undefined (FS error handling is out of scope; tests use temp files to avoid this)
- If the file cannot be read due to permissions, function throws an error (not tested in MVP)

**Postconditions:**
- Hash function is verified to produce correct MD5 output for valid files
- Hash computation is deterministic (same input always produces same output)

---

### UC-06: Unit Test Validates Directory Walking

| Field | Value |
|-------|-------|
| Actor | Jest test framework |
| Preconditions | Tests in `tests/cli/walkDir.test.js` are executing; Jest has created a nested directory structure via `beforeEach` hook |
| Trigger | Jest runs the `walkDir` unit test |
| Priority | Must |

**Main flow:**
1. Jest test setup creates a nested temporary directory tree:
   - `root/file1.js`
   - `root/subdir1/file2.js`
   - `root/subdir1/subdir2/file3.js`
   - `root/subdir3/` (empty directory)
2. Test calls `walkDir(rootPath)` with the root directory path
3. Function recursively traverses all directories starting at `rootPath`
4. Function collects all file paths at every level (leaf files and files at intermediate levels)
5. Function returns an array of file paths
6. Test asserts that the returned array contains exactly 3 file paths (the files created above)
7. Test asserts that no directory paths are included in the result (only files)
8. If assertions pass, test passes
9. Test teardown deletes the temporary directory tree

**Alternative flows:**
- Test case: `walkDir` is called on an empty directory → returns an empty array
- Test case: `walkDir` is called on a single-level directory with files → returns all files in that directory

**Error flows:**
- If a directory cannot be read due to permissions, function behavior is undefined (not tested)

**Postconditions:**
- Directory traversal function correctly enumerates all files in a nested structure
- Directory paths themselves are excluded from the result; only leaf and non-directory file paths are returned

---

### UC-07: Unit Test Validates Mapping Expansion

| Field | Value |
|-------|-------|
| Actor | Jest test framework |
| Preconditions | Tests in `tests/cli/expandMappings.test.js` are executing; temporary source files may be created via `beforeEach` hooks |
| Trigger | Jest runs the `expandMappings` unit test |
| Priority | Must |

**Main flow:**
1. Test provides a mapping array with objects, each containing `src` and `dest` fields:
   ```
   [{ src: '/path/to/existing/file.js', dest: '/path/to/dest/file.js' },
    { src: '/path/to/missing/file.js', dest: '/path/to/dest/file.js' },
    { src: '/path/to/settings.json', dest: '/path/to/dest/settings.json' }]
   ```
2. Test calls `expandMappings(mappings)`
3. Function iterates over each mapping entry:
   - Checks if `src` path exists on disk; if not, skips the entry (adds nothing to result)
   - Checks if the filename (basename) of `src` is in the `NEVER_COPY` list (e.g., `settings.json`, `CLAUDE.md`); if so, skips the entry
   - Otherwise, adds the entry to the result array
4. Function returns the filtered array of valid mappings (entries that exist and are not blacklisted)
5. Test asserts that the result contains only valid mappings; skipped entries are not in result
6. Test passes

**Alternative flows:**
- Test case: all mappings have non-existent `src` paths → result is empty array
- Test case: all mappings are valid → result contains all mappings
- Test case: mix of valid and skipped mappings → result contains only valid ones

**Error flows:**
- If `src` field is missing from a mapping object, function behavior is undefined (invalid input, out of scope)

**Postconditions:**
- Mapping expansion correctly filters out entries with non-existent sources
- NEVER_COPY rule correctly blocks specified files from being included

---

### UC-08: Unit Test Validates File Categorization

| Field | Value |
|-------|-------|
| Actor | Jest test framework |
| Preconditions | Tests in `tests/cli/categorize.test.js` are executing; temporary source and destination files are created via `beforeEach` hooks |
| Trigger | Jest runs the `categorize` unit test |
| Priority | Must |

**Main flow:**
1. Test setup creates three file pair scenarios:
   - **Scenario 1 (new):** `src/file1.txt` exists with content "abc", `dest/file1.txt` does not exist
   - **Scenario 2 (same):** `src/file2.txt` exists with content "xyz", `dest/file2.txt` exists with identical content "xyz"
   - **Scenario 3 (modified):** `src/file3.txt` exists with content "abc", `dest/file3.txt` exists with different content "def"
2. Test calls `categorize([{src: 'src/file1.txt', dest: 'dest/file1.txt'}, ...])` with an array of file pair objects
3. For each pair, function:
   - Reads the source file content
   - Checks if destination file exists:
     - If not, assigns status `'new'` and adds to result
     - If yes, reads destination file content and compares with source:
       - If content is identical, assigns status `'same'`
       - If content differs, assigns status `'modified'`
   - Adds the pair with status to result array
4. Function returns an array of categorized entries: `[{src: ..., dest: ..., status: 'new'}, {src: ..., dest: ..., status: 'same'}, {src: ..., dest: ..., status: 'modified'}]`
5. Test asserts that each entry has the correct status:
   - `file1` has status `'new'` ✓
   - `file2` has status `'same'` ✓
   - `file3` has status `'modified'` ✓
6. If all assertions pass, test passes
7. Test teardown deletes all temporary files

**Alternative flows:**
- None; behavior is deterministic for the three cases

**Error flows:**
- If source file cannot be read, function throws an error (not tested in MVP)
- If destination file cannot be read, function throws an error (not tested in MVP)

**Postconditions:**
- File comparison function correctly categorizes all three states (new, same, modified)
- Status assignment is accurate and consistent

---

### UC-09: Unit Test Validates Version File Reading

| Field | Value |
|-------|-------|
| Actor | Jest test framework |
| Preconditions | Tests in `tests/cli/readInstalledVersion.test.js` are executing |
| Trigger | Jest runs the `readInstalledVersion` unit test |
| Priority | Must |

**Main flow:**
1. **Test case A: Version file absent**
   - Test does not create a version file
   - Test calls `readInstalledVersion(versionFilePath)` with a path that does not exist
   - Function attempts to read the file; file does not exist
   - Function returns `null` (or similar sentinel value indicating absence)
   - Test asserts return value is `null` ✓
   - Test passes

2. **Test case B: Version file present with content**
   - Test creates a temporary version file with exact content `0.1.3\n` (with trailing newline)
   - Test calls `readInstalledVersion(versionFilePath)` with the path to the temp file
   - Function reads the file content as a string
   - Function trims leading and trailing whitespace (including newlines)
   - Function returns the trimmed string `'0.1.3'` (no newline)
   - Test asserts returned value strictly equals `'0.1.3'` ✓
   - Test passes

**Alternative flows:**
- Version file with different version strings (e.g., `1.0.0`, `2.5.3-beta`, `v1.2.3`) → function trims and returns the version string as-is (no validation of version format)
- Version file with only whitespace/newlines → function returns empty string after trimming

**Error flows:**
- If version file cannot be read due to permissions, function throws an error (not tested in MVP)

**Postconditions:**
- Version reader correctly handles both absent and present version files
- Whitespace trimming is applied consistently
- Return values are deterministic for a given input file state

---

### UC-10: Unit Test Validates Matt Pocock Installation Detection

| Field | Value |
|-------|-------|
| Actor | Jest test framework |
| Preconditions | Tests in `tests/cli/isMattPocockInstalled.test.js` are executing |
| Trigger | Jest runs the `isMattPocockInstalled` unit test |
| Priority | Must |

**Main flow:**
1. **Test case A: Neither local nor global path exists**
   - Test does not create any directories
   - Test calls `isMattPocockInstalled(localPath, globalPath)` with two paths that do not exist
   - Function checks if local path exists on disk; it does not
   - Function checks if global path exists on disk; it does not
   - Function returns `false`
   - Test asserts return value is `false` ✓
   - Test passes

2. **Test case B: At least one path exists**
   - Test creates a temporary directory for the local path
   - Test calls `isMattPocockInstalled(localPath, globalPath)` where local path exists but global does not
   - Function checks paths; at least one exists
   - Function returns `true`
   - Test asserts return value is `true` ✓
   - Test passes

**Alternative flows:**
- Only local path exists, global path does not → function returns `true`
- Only global path exists, local path does not → function returns `true`
- Both local and global paths exist → function returns `true`

**Error flows:**
- If path existence check fails due to permissions, behavior is undefined (FS errors out of scope)

**Postconditions:**
- Installation detection correctly reports whether Matt Pocock skills are present
- Function returns boolean; no intermediate states

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Functions under test must be exported from `bin/cli.js` or a separate module to be importable by Jest; CLI must continue to work when invoked directly | UC-05–UC-10 |
| BR-02 | Jest test execution uses `--bail` flag; stops at first failure without running remaining tests | UC-01, UC-02, UC-03 |
| BR-03 | Coverage reports are generated as diagnostic information only; no minimum percentage threshold is enforced | UC-02, UC-03 |
| BR-04 | All `.claude/agents/*.md` files must declare: non-empty `name` string, non-empty `description` string, `model` with value in `['haiku', 'sonnet', 'opus']` | UC-04 |
| BR-05 | All `.claude/skills/**/SKILL.md` files must declare: non-empty `description` string | UC-04 |
| BR-06 | Optional `argument-hint` field on both agent and skill files must be non-empty string if present; absence does not trigger a failure | UC-04 |
| BR-07 | File hashing uses MD5 algorithm and returns result as hexadecimal string | UC-05 |
| BR-08 | Directory walking returns only file paths; directory paths are excluded from results | UC-06 |
| BR-09 | Mapping expansion silently skips entries with non-existent `src` paths (no error thrown) | UC-07 |
| BR-10 | Mapping expansion skips entries whose `src` filename (basename) is in the `NEVER_COPY` list | UC-07 |
| BR-11 | File categorization assigns `'new'` status when destination file does not exist | UC-08 |
| BR-12 | File categorization assigns `'same'` status when source and destination file content is byte-identical | UC-08 |
| BR-13 | File categorization assigns `'modified'` status when source and destination file content differs | UC-08 |
| BR-14 | Version file reading returns `null` if version file does not exist | UC-09 |
| BR-15 | Version file reading trims all leading and trailing whitespace from file content before returning | UC-09 |
| BR-16 | Installation detection returns `false` if neither local nor global path exists | UC-10 |
| BR-17 | Installation detection returns `true` if at least one of the local or global paths exists | UC-10 |
| BR-18 | CI workflow is triggered only on PRs from `develop` to `main`; test status determines PR check pass/fail | UC-03 |
| BR-19 | Target runtime is Node.js 20 for both local development and CI execution; consistency with existing publish.yml workflow | UC-01, UC-02, UC-03 |

## 4. Data Requirements

### 4.1 Entities

The test suite operates on temporary files and directories created during test execution and cleaned up automatically after each test. No persistent data is created or modified by the test suite itself.

**Test inputs:**
- **Temporary files and directories** created via Node.js `fs` and `os.tmpdir()` in `beforeEach` hooks
- **Live repository files** read at test time without copying:
  - All `.claude/agents/*.md` files
  - All `.claude/skills/**/SKILL.md` files

**Test outputs:**
- **Coverage report** directory (`coverage/`) generated locally and in CI:
  - `coverage/lcov.info` (LCOV format, machine-readable)
  - `coverage/index.html` (HTML report, human-readable)
  - Text summary to console
- **Test execution logs** (console output, GitHub Actions workflow logs)
- **GitHub workflow artifacts** (coverage HTML report uploaded after successful test run)

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `.claude/agents/*.md` → `name` | Required; must be non-empty string |
| `.claude/agents/*.md` → `description` | Required; must be non-empty string |
| `.claude/agents/*.md` → `model` | Required; must be one of: `haiku`, `sonnet`, `opus` |
| `.claude/agents/*.md` → `argument-hint` | Optional; if present must be non-empty string |
| `.claude/skills/**/SKILL.md` → `description` | Required; must be non-empty string |
| `.claude/skills/**/SKILL.md` → `argument-hint` | Optional; if present must be non-empty string |
| File hash (MD5) | Hexadecimal string; exactly 32 characters (128 bits) |
| Directory walk result | Array of file paths; no directory paths; order not specified |
| Mapping expansion result | Array of mapping objects; only entries with existing src not in NEVER_COPY |
| Categorization status | One of: `'new'`, `'same'`, `'modified'` (string enum) |
| Version string | Text without leading/trailing whitespace; format not validated |
| Installation flag | Boolean: `true` or `false` |
| Test file locations | `tests/cli/` for utility function tests; `tests/frontmatter/` for frontmatter validation |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | `npm test` must complete all CLI unit tests in <10 seconds on a developer machine (baseline: 2–3 GHz processor, 4GB+ RAM) |
| NFR-02 | Performance | `npm test` must complete all frontmatter validation tests in <5 seconds (reading and parsing ~10–20 markdown files) |
| NFR-03 | Performance | CI job must complete all tests in <30 seconds on `ubuntu-latest` runner (including dependency installation, test execution, and coverage report generation) |
| NFR-04 | Performance | `npm run test:coverage` must complete without significant time overhead (<10 seconds) compared to `npm test` |
| NFR-05 | Reliability | All tests must be deterministic; same code always produces same test result; no flaky tests or race conditions |
| NFR-06 | Reliability | CI workflow must not fail due to temporary network issues or transient runner state; dependencies fetched from npm cache or public registry |
| NFR-07 | Maintainability | Test file organization (`tests/cli/` and `tests/frontmatter/`) must scale to 50+ test files without reorganization |
| NFR-08 | Maintainability | Each test must be independent; tests can run in any order without side effects or shared state |
| NFR-09 | Maintainability | Test failure messages must clearly identify: (1) which test failed, (2) the assertion that failed, (3) expected vs. actual values |
| NFR-10 | Maintainability | Frontmatter validation error messages must clearly identify: (1) the file path, (2) the field name, (3) the reason for failure (missing, invalid value, etc.) |
| NFR-11 | Compatibility | Jest version ≥27 (supports `--bail`, coverage, `beforeEach`/`afterEach`) |
| NFR-12 | Compatibility | gray-matter ≥4.0 (parses YAML frontmatter correctly) |
| NFR-13 | Compatibility | Node.js 20.x LTS (consistent with existing `publish.yml` workflow) |
| NFR-14 | Compatibility | GitHub Actions `ubuntu-latest` runner (must support Node.js 20 setup action) |
| NFR-15 | Security | Tests must not leave behind temporary files or directories if a test crashes or is interrupted; cleanup must be guaranteed |
| NFR-16 | Security | No hardcoded secrets or credentials in test files or test data |
| NFR-17 | Observability | Jest stdout must include test summary line: "Test Suites: X passed, X total" and "Tests: X passed, X total" |
| NFR-18 | Observability | Coverage report must include percentages for: line coverage, branch coverage, function coverage, statement coverage |
| NFR-19 | Observability | Coverage HTML report must be browsable and highlight uncovered code lines in source files |
| NFR-20 | Accessibility | Test output must be readable in standard terminal and GitHub Actions web UI; no special formatting required |

## 6. UI Requirements

No user-facing graphical interface is defined for this feature. The test suite is invoked via command-line interface and outputs results to the terminal and static HTML files.

### 6.1 Command-Line Interface

| Command | Purpose | Output Destination |
|---------|---------|-------------------|
| `npm test` | Run all tests with `--bail` flag; stop at first failure | Console/stdout; exit code 0 (pass) or non-zero (fail) |
| `npm run test:coverage` | Run all tests and generate coverage report | Console/stdout + `coverage/` directory with HTML and LCOV files |

### 6.2 Output Format — Console

**Successful test run:**
```
PASS  tests/cli/fileHash.test.js
  fileHash
    ✓ returns MD5 hash for a valid file (X ms)
    ✓ returns trimmed hash value (X ms)

PASS  tests/cli/walkDir.test.js
  walkDir
    ✓ returns all leaf files in a nested directory (X ms)
    ✓ returns empty array for empty directory (X ms)

PASS  tests/frontmatter/agents.test.js
  Agent frontmatter validation
    ✓ all agents have required fields (X ms)
    ✓ all agent models are valid (X ms)

Test Suites: 6 passed, 6 total
Tests:       20 passed, 20 total
Snapshots:   0 total
Time:        X.XXXs
```

**Failed test run:**
```
FAIL  tests/frontmatter/agents.test.js
  Agent frontmatter validation
    ✗ all agents have required fields (X ms)

Error: agents/foo.md: missing required field 'model'

Test Suites: 0 passed, 1 failed, 1 total
Tests:       0 passed, 1 failed, 1 total
Time:        X.XXXs
```

**Coverage report text summary:**
```
-----------|---------|---------|---------|---------|
File       | % Stmts | % Branch| % Funcs | % Lines |
-----------|---------|---------|---------|---------|
All files  |  85.5   |  78.2   |  88.0   |  85.5   |
-----------|---------|---------|---------|---------|
```

### 6.3 Output Format — HTML Coverage Report

- **Location:** `coverage/index.html`
- **Viewable in:** Any web browser
- **Content:** Browsable source code view with uncovered lines highlighted, coverage percentages, and drill-down by file
- **No user interaction required:** Static HTML files generated by Jest

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a developer has cloned the repo and run `npm install`, when they run `npm test`, then Jest discovers all tests under `tests/cli/` and `tests/frontmatter/`, executes them in sequence, stops on first failure (via `--bail`), and exits with code 0 if all pass or non-zero if any fail | UC-01 |
| AC-02 | Given a developer runs `npm run test:coverage`, when Jest completes, then a coverage report is generated in `coverage/` directory (lcov.info and index.html), text summary is printed to console, and no coverage threshold is enforced | UC-02 |
| AC-03 | Given `fileHash` is called with a path to a file containing "hello world", when the test executes, then the returned MD5 hex string equals "5eb63bbbe01eeed093cb22bb8f5acdc3" | UC-05 |
| AC-04 | Given `walkDir` is called on a nested directory tree with files at multiple levels, when the test executes, then all leaf file paths are returned and no directory paths are included in the result | UC-06 |
| AC-05 | Given `expandMappings` is called with a mapping whose `src` path does not exist on disk, when the test executes, then the non-existent src entry is silently skipped and the result does not include it | UC-07 |
| AC-06 | Given `expandMappings` is called with a mapping whose `src` filename is `settings.json`, when the test executes, then the entry is excluded from the result per NEVER_COPY rule | UC-07 |
| AC-07 | Given `categorize` is called on three file pairs (new, same, modified), when the test executes, then each pair is assigned the correct status: `'new'`, `'same'`, or `'modified'` respectively | UC-08 |
| AC-08 | Given `readInstalledVersion` is called when no version file exists at the provided path, when the test executes, then the function returns `null` | UC-09 |
| AC-09 | Given `readInstalledVersion` is called when a version file with content `0.1.3\n` exists, when the test executes, then the function returns the string `'0.1.3'` (trailing newline trimmed) | UC-09 |
| AC-10 | Given `isMattPocockInstalled` is called when neither the local nor global path exists, when the test executes, then the function returns `false` | UC-10 |
| AC-11 | Given `isMattPocockInstalled` is called when at least one of the local or global paths exists, when the test executes, then the function returns `true` | UC-10 |
| AC-12 | Given all `.claude/agents/*.md` files are read from the live repository, when frontmatter validation tests run, then every agent file has non-empty `name` field, non-empty `description` field, and `model` field with value in `['haiku', 'sonnet', 'opus']`; if any file fails validation, the test reports which file and which field is invalid | UC-04 |
| AC-13 | Given all `.claude/skills/**/SKILL.md` files are read from the live repository, when frontmatter validation tests run, then every skill file has non-empty `description` field; if any file fails validation, the test reports which file and which field is invalid | UC-04 |
| AC-14 | Given a PR from `develop` to `main` is opened on GitHub, when the CI workflow (`.github/workflows/ci.yml`) is triggered, then `npm ci` installs dependencies on `ubuntu-latest` with Node.js 20, `npm test` runs all tests with `--bail`, and the GitHub PR check passes if all tests pass or fails if any test fails | UC-03 |
| AC-15 | Given `npm test` is run locally or in CI, when Jest exits, then the exit code is 0 on all-pass and non-zero on any failure; test output clearly identifies which tests passed and which failed | UC-01, UC-03 |
| AC-16 | Given frontmatter validation detects a missing or invalid field in an agent or skill file, when the test fails, then the error message clearly identifies the specific file path and the specific field that failed validation (e.g., "agents/foo.md: missing required field 'model'") | UC-04 |

## 8. Dependencies & Assumptions

### External Dependencies
- **Jest** (npm package, `devDependency`) — test framework; version ≥27
- **gray-matter** (npm package, `devDependency`) — YAML frontmatter parser for Node.js; version ≥4.0
- **Node.js 20.x LTS** — target runtime for local and CI test execution
- **npm** — package manager; uses `package-lock.json` for reproducible installs
- **GitHub Actions** — CI platform; `ubuntu-latest` runner must support Node.js 20
- **File system access** — tests read/write temporary directories and read live `.claude/` files

### Code Assumptions
- **Module exports:** Functions `fileHash`, `walkDir`, `expandMappings`, `categorize`, `readInstalledVersion`, `isMattPocockInstalled` must be exported from `bin/cli.js` (or extracted to a separate module). Currently `cli.js` has no exports; implementation includes adding: `if (require.main !== module) { module.exports = { fileHash, walkDir, expandMappings, categorize, readInstalledVersion, isMattPocockInstalled }; }`
- **CLI behavior unchanged:** Adding conditional exports to `bin/cli.js` must not change the behavior of the CLI when invoked directly from the command line (e.g., `node bin/cli.js install`)
- **Frontmatter structure:** All agent and skill files use YAML frontmatter in standard front-matter format delimited by `---` lines at the start of the file; `gray-matter` can parse all existing files without modification
- **Test framework:** Jest is the chosen test framework (no Mocha, Vitest, or other alternatives in scope)
- **Directory structure:** Tests are organized in `tests/` at the repository root with subdirectories `tests/cli/` (utility function tests) and `tests/frontmatter/` (frontmatter validation tests)
- **CI trigger:** GitHub Actions is configured to trigger CI on `pull_request` events targeting `main` branch; no additional triggers (e.g., `push` to `develop`) are planned in MVP
- **Coverage is informational:** No minimum coverage percentage threshold is enforced in MVP; coverage reports are for diagnostic inspection only; failed tests fail the job, but passing tests with low coverage still pass
- **Temporary file cleanup:** Each test is responsible for cleaning up its own temporary files in `afterEach` hooks; Node.js `fs` and OS-provided `os.tmpdir()` are available and functional
- **No interactive testing:** Testing of interactive prompts (`askConfirm`, `askMattPocock`, `installMattPocock`) and stdin/stdout is explicitly out of scope; only synchronous, non-interactive pure functions are tested

### Configuration Assumptions
- **Test file naming:** Test files follow Jest convention: `*.test.js` or `*.spec.js` (default Jest pattern)
- **Jest configuration:** Configured via `jest-config.js` at repository root or `jest` field in `package.json`
- **npm scripts:** `package.json` includes:
  - `"test": "jest --bail"`
  - `"test:coverage": "jest --coverage"`
- **Coverage output:** Jest writes coverage reports to `coverage/` directory (LCOV and HTML formats); `.gitignore` includes `coverage/`
- **Node 20 availability:** Both local development machines and GitHub Actions `ubuntu-latest` runner must have Node.js 20 available

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should the CI job also run on `push` to `develop` (not only on PRs to `main`)? | Low — broadens feedback loop but increases CI minutes usage | Recommend: No for MVP; keep CI narrowly scoped to PR checks for now. Revisit in next iteration if feedback latency becomes a bottleneck. |
| 2 | Should coverage artifacts be uploaded to an external service (Codecov, Coveralls) rather than kept as workflow artifacts? | Low — purely informational for now | Recommend: No for MVP; keep coverage as local workflow artifacts only. Revisit if tracking coverage trends over time becomes important. |
| 3 | How should test files handle cross-platform path separators (Windows `\` vs. Unix `/`)? | Low | Recommend: Use Node.js `path` module (`path.join()`, `path.resolve()`) for all path operations to ensure automatic cross-platform compatibility. Do not use string literal paths with hardcoded separators. |
| 4 | Should the test suite include performance benchmarks (e.g., verify `fileHash` completes in <100ms)? | Low | Recommend: No for MVP; focus on correctness only. Performance benchmarks can be added in follow-up iteration if needed. |

---

**Document End**
