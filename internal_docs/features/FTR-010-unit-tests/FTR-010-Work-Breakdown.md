# Work Breakdown — Unit Test Suite for CLI Logic and Frontmatter Validation

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-010: Unit Test Suite — CLI Logic and Frontmatter Validation |
| Version | 1.0 |
| Date | 2026-07-27 |
| Status | Draft |
| Source: Requirements | FTR-010-Requirements.md |
| Source: Tech-Spec | FTR-010-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 4 |
| Total Tasks | 18 |
| Domain distribution | INFRA: 4, BE: 8, TEST: 6 |
| Complexity | S: 8, M: 8, L: 2 |
| Estimated total (Human) | 34h |
| Estimated total (Agent) | 145min |
| Implementation phases | 4 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Add conditional exports to `bin/cli.js` | INFRA | US-01, US-02, US-03 | M | 2h | 10min | Add `if (require.main !== module)` export block at end of cli.js to expose `fileHash`, `walkDir`, `expandMappings`, `categorize`, `readInstalledVersion`, `isMattPocockInstalled`, and `NEVER_COPY` constant for Jest imports; verify CLI still works when invoked directly. |
| INFRA-T02 | Create Jest configuration file (`jest.config.js`) | INFRA | US-01, US-02, US-03 | S | 1h | 5min | Write `jest.config.js` with test environment (node), test match pattern (`**/tests/**/*.test.js`), coverage collection config (only `bin/cli.js`), and coverage path ignore patterns. |
| INFRA-T03 | Update `package.json` with test scripts and dependencies | INFRA | US-01, US-02, US-03 | S | 1h | 5min | Add `test` script (`jest --bail`), `test:coverage` script (`jest --coverage`) to scripts section; add `jest@^29.7.0` and `gray-matter@^4.0.3` to devDependencies. Run `npm install` to verify. |
| INFRA-T04 | Create test directory structure (`tests/cli/` and `tests/frontmatter/`) | INFRA | US-01, US-02, US-03 | S | 30min | 3min | Create directories: `tests/cli/` for CLI function tests, `tests/frontmatter/` for frontmatter validation tests; optionally create `tests/cli/__fixtures__/` for test data (defer if not needed). |

---

## 3. User Stories

### US-01: Developer Runs Unit Tests for CLI Functions

| Field | Value |
|-------|-------|
| Derived from | UC-01, UC-05, UC-06, UC-07, UC-08, UC-09, UC-10 |
| Actor | Developer |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10 |

**Description:**
As a developer, I want to run `npm test` locally to verify that pure logic functions in `bin/cli.js` (`fileHash`, `walkDir`, `expandMappings`, `categorize`, `readInstalledVersion`, `isMattPocockInstalled`) are working correctly, so that I can catch regressions immediately while modifying the CLI.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Write unit tests for `fileHash()` function | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 3h | 15min | Create `tests/cli/fileHash.test.js` with test cases: (1) correctly computes MD5 hash for known content, (2) produces different hashes for different files, (3) produces identical hashes for identical content. Use temp files created in `beforeEach` and cleaned in `afterEach`. Verify all tests pass locally. |
| US-01-T02 | Write unit tests for `walkDir()` function | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 3h | 15min | Create `tests/cli/walkDir.test.js` with test cases: (1) returns all leaf files in nested directory tree, (2) returns empty array for empty directory, (3) returns no directory paths, only file paths. Create temp directory structures in beforeEach. Verify no directory entries are included. |
| US-01-T03 | Write unit tests for `expandMappings()` function | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 3h | 15min | Create `tests/cli/expandMappings.test.js` with test cases: (1) skips mapping with non-existent src, (2) skips files in NEVER_COPY list (e.g., settings.json), (3) expands directory mappings to individual file pairs with correct dest paths. Use temp src directories. |
| US-01-T04 | Write unit tests for `categorize()` function | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 3h | 15min | Create `tests/cli/categorize.test.js` with test cases: (1) classifies non-existent dest as 'new', (2) classifies identical files as 'same', (3) classifies different content as 'modified'. Create temp src and dest files with various content patterns. |
| US-01-T05 | Write unit tests for `readInstalledVersion()` function | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | S | 2h | 10min | Create `tests/cli/readInstalledVersion.test.js` with test cases: (1) returns null when version file absent, (2) returns trimmed version string when file exists with content "0.1.3\n", (3) correctly trims leading/trailing whitespace. Use temp .claude directory structure. |
| US-01-T06 | Write unit tests for `isMattPocockInstalled()` function | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 2h | 10min | Create `tests/cli/isMattPocockInstalled.test.js` with test cases: (1) returns false when neither path exists, (2) returns true when at least one path exists (local or global grilling skill dir). Simple verification of boolean return type and basic logic; note: advanced home dir mocking is out of scope for MVP. |
| US-01-T07 | Verify local `npm test` execution | TEST | US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05, US-01-T06 | S | 1h | 5min | Run `npm test` locally and verify all CLI unit tests pass; exit code is 0; Jest output shows all test suites passing; --bail flag works (stops at first failure if manually broken). Test output matches expected format with test counts and summary. |

---

### US-02: Developer Generates Coverage Report

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Developer |
| Priority | Must |
| Acceptance Criteria | AC-02 |

**Description:**
As a developer, I want to run `npm run test:coverage` to generate a coverage report of `bin/cli.js`, so that I can see which lines and branches are covered by the test suite and identify untested code paths.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Execute coverage report generation locally | TEST | INFRA-T01, INFRA-T02, INFRA-T03, US-01-T07 | S | 1h | 5min | Run `npm run test:coverage` and verify: (1) Jest completes with exit code 0, (2) coverage/ directory is created, (3) coverage/index.html exists and is browsable, (4) coverage/lcov.info is present in LCOV format, (5) text summary printed to console shows coverage percentages. Verify no coverage threshold is enforced (diagnostic only). |
| US-02-T02 | Validate coverage HTML report is viewable | TEST | US-02-T01 | S | 1h | 5min | Open `coverage/index.html` in a browser and verify: (1) page renders without errors, (2) bin/cli.js is listed with coverage metrics, (3) uncovered lines are highlighted or indicated, (4) coverage percentages are displayed (statements, branches, functions, lines), (5) interactive navigation between files works (if supported). |

---

### US-03: Frontmatter Validation Tests for Agents and Skills

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | Test framework (Jest) |
| Priority | Must |
| Acceptance Criteria | AC-11, AC-12, AC-16 |

**Description:**
As a quality gate, I want frontmatter validation tests to automatically check all `.claude/agents/*.md` and `.claude/skills/**/SKILL.md` files for required fields and valid values, so that silent agent or skill degradation due to missing frontmatter is prevented at test time.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Write frontmatter validation test for agent files | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 3h | 15min | Create `tests/frontmatter/agents.test.js` that: (1) discovers all `.claude/agents/*.md` files, (2) parses each with gray-matter, (3) validates `name` field is present and non-empty, (4) validates `description` field is present and non-empty, (5) validates `model` field is present and value is in ['haiku', 'sonnet', 'opus'], (6) validates `argument-hint` if present is non-empty string, (7) on failure, reports file name and specific field that failed. Run against live agent files from repo. |
| US-03-T02 | Write frontmatter validation test for skill files | TEST | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | M | 3h | 15min | Create `tests/frontmatter/skills.test.js` that: (1) recursively discovers all `SKILL.md` files in `.claude/skills/`, (2) parses each with gray-matter, (3) validates `description` field is present and non-empty, (4) validates `argument-hint` if present is non-empty string, (5) on failure, reports file path (relative to skills dir) and specific field that failed. Note: `model` is not required for skills. Run against live skill files from repo. |
| US-03-T03 | Verify frontmatter tests detect validation failures | TEST | US-03-T01, US-03-T02 | S | 2h | 10min | Manually test frontmatter validation: (1) intentionally remove or corrupt a field (e.g., delete `name` from an agent file), (2) run `npm test` and verify frontmatter test fails with clear error message naming the file and field, (3) restore the field and verify tests pass again. Confirm error messages follow format: "agents/[filename].md: missing required field 'name'" or "skills/[path]: invalid value for 'model' field". |
| US-03-T04 | Verify frontmatter tests pass with all live files | TEST | US-03-T01, US-03-T02, US-03-T03 | S | 1h | 5min | Run `npm test` against all actual `.claude/agents/*.md` and `.claude/skills/**/SKILL.md` files in the repository and verify all tests pass (no missing or invalid frontmatter in existing files). If any file fails, document and resolve before proceeding. |

---

### US-04: CI Pipeline Test Automation

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | CI Pipeline (GitHub Actions) |
| Priority | Must |
| Acceptance Criteria | AC-13, AC-14, AC-15 |

**Description:**
As a quality gate, I want GitHub Actions to automatically run tests on every PR from `develop` to `main`, so that test failures are caught before code is merged and the PR check is marked green or red based on test outcome.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Create GitHub Actions CI workflow (`.github/workflows/ci.yml`) | INFRA | INFRA-T01, INFRA-T02, INFRA-T03 | M | 2h | 10min | Write `.github/workflows/ci.yml` with: (1) trigger on pull_request to main branch, (2) runs-on: ubuntu-latest, (3) checkout repo, (4) setup Node.js 20 using actions/setup-node@v4, (5) run `npm ci` for clean install, (6) run `npm test` (stops at first failure), (7) run `npm run test:coverage` if always(), (8) upload coverage artifact (coverage/) with 30-day retention. Verify workflow file is valid YAML. |
| US-04-T02 | Test CI workflow on actual PR | BE | US-04-T01 | L | 6h | 30min | Create a PR from develop to main and verify: (1) GitHub Actions workflow is triggered automatically, (2) checkout, setup-node, npm ci steps complete successfully, (3) `npm test` runs and all tests pass, (4) exit code is 0, (5) "Tests" check mark appears in PR checks (green ✓), (6) `npm run test:coverage` runs and coverage artifact is generated and uploadable. Intentionally break a test and push commit to verify PR check fails (red ✗) and fails the workflow. |
| US-04-T03 | Verify PR check gates merge | INFRA | US-04-T02 | M | 2h | 10min | Confirm: (1) PR with failing test cannot be merged (if branch protection is enabled), (2) PR with passing tests can be merged, (3) error messages from failed tests are visible in GitHub Actions job logs, (4) coverage artifact is available for download from workflow run details. Document the PR check behavior for developers. |
| US-04-T04 | Document CI workflow and local test setup | INFRA | INFRA-T01, INFRA-T02, INFRA-T03, US-04-T01, US-04-T02 | S | 1h | 5min | Create brief developer documentation (optional: in README or separate docs file) covering: (1) how to run tests locally (`npm test`, `npm run test:coverage`), (2) what CI does on PR (runs tests, generates coverage), (3) how to interpret test failures and coverage reports, (4) how to update tests when cli.js functions change. Keep it concise and actionable. |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable unit of work. Within a phase, tasks execute in dependency order; independent tasks within the same layer may run in parallel.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Add conditional exports to `bin/cli.js` | INFRA |
| INFRA-T02 | Create Jest configuration file (`jest.config.js`) | INFRA |
| INFRA-T03 | Update `package.json` with test scripts and dependencies | INFRA |
| INFRA-T04 | Create test directory structure (`tests/cli/` and `tests/frontmatter/`) | INFRA |

**Deliverable:** Project is ready for test development; Jest and dependencies are configured; cli.js functions are exportable.

#### Phase 2 — US-01: CLI Unit Tests (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Write unit tests for `fileHash()` function | TEST |
| US-01-T02 | Write unit tests for `walkDir()` function | TEST |
| US-01-T03 | Write unit tests for `expandMappings()` function | TEST |
| US-01-T04 | Write unit tests for `categorize()` function | TEST |
| US-01-T05 | Write unit tests for `readInstalledVersion()` function | TEST |
| US-01-T06 | Write unit tests for `isMattPocockInstalled()` function | TEST |
| US-01-T07 | Verify local `npm test` execution | TEST |

**Dependencies:** All depend on Phase 1 shared infrastructure tasks.

**Execution order within phase:** Test files (US-01-T01 through US-01-T06) can be written in parallel; US-01-T07 verification runs after all test files are written.

**Deliverable:** All CLI functions have unit test coverage; `npm test` runs successfully locally with --bail flag; all tests pass.

#### Phase 3 — US-02: Coverage Report and US-03: Frontmatter Validation (depends on Phase 1 and Phase 2)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Execute coverage report generation locally | TEST |
| US-02-T02 | Validate coverage HTML report is viewable | TEST |
| US-03-T01 | Write frontmatter validation test for agent files | TEST |
| US-03-T02 | Write frontmatter validation test for skill files | TEST |
| US-03-T03 | Verify frontmatter tests detect validation failures | TEST |
| US-03-T04 | Verify frontmatter tests pass with all live files | TEST |

**Dependencies:** All depend on Phase 1 shared infrastructure. US-02-T02 depends on US-02-T01. US-03-T03, US-03-T04 depend on US-03-T01, US-03-T02.

**Execution order within phase:**
- US-02 tasks (US-02-T01, US-02-T02) can run in parallel with US-03 tasks (US-03-T01, US-03-T02).
- US-02-T02 requires US-02-T01 completion.
- US-03-T03 and US-03-T04 require US-03-T01 and US-03-T02 completion.

**Deliverable:** Coverage reports are generated and viewable; frontmatter validation tests are in place and passing; all live agent and skill files have valid frontmatter.

#### Phase 4 — US-04: CI Pipeline (depends on Phase 1, Phase 2, Phase 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Create GitHub Actions CI workflow (`.github/workflows/ci.yml`) | INFRA |
| US-04-T02 | Test CI workflow on actual PR | BE |
| US-04-T03 | Verify PR check gates merge | INFRA |
| US-04-T04 | Document CI workflow and local test setup | INFRA |

**Dependencies:** All depend on Phase 1, Phase 2, Phase 3 completion.

**Execution order within phase:** US-04-T01 must complete first (workflow is created). US-04-T02 requires US-04-T01. US-04-T03 requires US-04-T02. US-04-T04 can run in parallel with other tasks or at the end.

**Deliverable:** GitHub Actions CI workflow is active and gates PRs to main branch; test failures are caught automatically; PR checks pass/fail correctly; coverage artifacts are uploadable.

---

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01 (2h) → INFRA-T02 (1h) → INFRA-T03 (1h) → INFRA-T04 (0.5h)
    → US-01-T01 (3h) + US-01-T02 (3h) + US-01-T03 (3h) + US-01-T04 (3h) + US-01-T05 (2h) + US-01-T06 (2h)
    → US-01-T07 (1h)
    → US-03-T01 (3h) + US-03-T02 (3h)
    → US-03-T03 (2h) + US-03-T04 (1h)
    → US-04-T01 (2h) → US-04-T02 (6h) → US-04-T03 (2h) → US-04-T04 (1h)
```

**Critical path duration (human):**
- Phase 1: 4.5h (sequential: 2 + 1 + 1 + 0.5)
- Phase 2: 16h (parallel execution of tests + 1h verification = ~17h on single developer, ~16h if distributed)
- Phase 3: 9h (parallel US-02 and US-03 = ~9h simultaneous, ~12h if sequential)
- Phase 4: 13h (sequential: 2 + 6 + 2 + 1)

**Total critical path (human): ~43h** (assuming single developer, some parallelization)

**Note:** With a team of 2–3 developers, Phases 2 and 3 tasks can run in parallel, reducing critical path to ~30h.

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| INFRA | 4 | 2 | 2 | 0 | 4.5h | 23min |
| BE | 1 | 0 | 0 | 1 | 6h | 30min |
| TEST | 13 | 6 | 6 | 1 | 23.5h | 92min |
| **Total** | **18** | **8** | **8** | **2** | **34h** | **145min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05, US-01-T06, US-01-T07 | AC-01, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-14, AC-15 |
| UC-02 | US-02 | US-02-T01, US-02-T02 | AC-02 |
| UC-03 | US-04 | US-04-T01, US-04-T02, US-04-T03, US-04-T04 | AC-13, AC-14, AC-15 |
| UC-04 | US-03 | US-03-T01, US-03-T02, US-03-T03, US-03-T04 | AC-11, AC-12, AC-16 |
| UC-05 | US-01 | US-01-T01 | AC-03 |
| UC-06 | US-01 | US-01-T02 | AC-04 |
| UC-07 | US-01 | US-01-T03 | AC-05, AC-06 |
| UC-08 | US-01 | US-01-T04 | AC-07 |
| UC-09 | US-01 | US-01-T05 | AC-08, AC-09 |
| UC-10 | US-01 | US-01-T06 | AC-10 |

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Cross-platform path handling in tests (Windows `\` vs. Unix `/`) | US-01-T01 through US-01-T06; tests must run on Windows, macOS, Linux CI runners | Use Node.js `path` module (`path.join()`, `path.resolve()`) for all path operations; do not hardcode path separators in test code. Jest and Node.js handle this automatically. |
| 2 | Home directory mocking for `isMattPocockInstalled()` test | US-01-T06; simple test may not cover all path combinations (local vs. global) | For MVP, basic boolean return type test is sufficient. Advanced testing with `jest.mock('os')` can be deferred to next iteration if needed. Current simple test verifies function is callable and returns boolean. |
| 3 | `.gitignore` update for coverage/ directory | US-02-T01, US-02-T02; coverage reports may clutter git status if not ignored | Add `coverage/` to `.gitignore` if not already present. Ensure `.gitignore` includes `node_modules/` (standard for npm projects). This is a one-line change before running coverage. |
| 4 | AGENTS.md file not present in project | Reference: AGENTS.md conventions not available | Project tech stack conventions (Node.js, npm, Jest) are clear from feature docs and existing workflows (publish.yml uses Node.js 20). No blocking issue; proceed with work breakdown. |
| 5 | Branch protection on `main` not confirmed enabled | US-04-T03; PR check gating depends on GitHub branch protection policy | Verify with repo maintainer that branch protection is enabled on `main` (requires PR checks to pass before merge). If not, enable in GitHub repo settings under Branches > Branch protection rules. |
| 6 | Agent/skill file contents not inspected for actual frontmatter issues | US-03-T04; may discover invalid frontmatter during test execution | This is expected; tests validate frontmatter against live files. If tests fail on existing files, document the specific files and fields that are invalid, then update those files in a separate commit before merging test feature. |

---

## Appendix A: Implementation Notes

### Task Execution Tips

1. **INFRA tasks (Phase 1):** These can be done in parallel or sequentially. INFRA-T03 (package.json update) should be done after INFRA-T02 (jest.config.js) is created, so the configuration file is referenced. Run `npm install` after updating package.json to lock in dependency versions.

2. **CLI unit test tasks (Phase 2, US-01-T01 through US-01-T06):** Each test file is independent of the others; assign different developers to each task if available. All tests import from `bin/cli.js` (which is exported via INFRA-T01), so INFRA-T01 must be complete before these tasks start.

3. **Coverage report tasks (Phase 3, US-02):** US-02-T01 runs the coverage command; US-02-T02 is manual browser verification. Both are quick and can be done after Phase 2 is complete.

4. **Frontmatter validation tasks (Phase 3, US-03):** US-03-T01 and US-03-T02 write the test files; US-03-T03 and US-03-T04 verify them against live files. These may uncover invalid frontmatter in existing agent/skill files, requiring fixes before the feature is complete.

5. **CI workflow tasks (Phase 4, US-04):** US-04-T01 creates the workflow file; US-04-T02 tests it by creating an actual PR; US-04-T03 verifies branch protection behavior; US-04-T04 documents the setup. US-04-T02 requires a real PR, which may take time in a real project (waiting for GitHub Actions to trigger and complete).

### Quality Checks

- **Local verification:** Before committing Phase 2, run `npm test` and verify all CLI tests pass.
- **Coverage verification:** Before committing Phase 3, run `npm run test:coverage` and spot-check the HTML report.
- **Frontmatter audit:** Before committing Phase 3, verify all agent and skill files in the repo pass frontmatter validation.
- **CI workflow:** Before merging Phase 4, create a real PR and verify the workflow triggers and reports results correctly.

### Rollback Plan

If a task introduces a breaking change:
1. **INFRA-T01 breaks CLI:** The `require.main !== module` guard ensures the CLI entry point (`main()`) still executes; if this is broken, revert the export block and verify CLI works with `node bin/cli.js --help`.
2. **Test fails unexpectedly:** Use `npm test` with `--testNamePattern` or `--testPathPattern` to isolate the failing test; fix the test or the code under test.
3. **CI workflow fails:** Check GitHub Actions job logs for the specific step that failed; adjust the workflow YAML and re-run the PR.

---

**Document End**
