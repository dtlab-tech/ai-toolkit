# Unit Test Suite — CLI Logic and Frontmatter Validation

## Feature ID
FTR-010

## Summary
This feature introduces a Jest-based unit test suite for the AI Toolkit. It covers two
concerns: (1) the pure functions inside `bin/cli.js` that are currently untested and
therefore constitute an invisible regression risk every time the installer is touched,
and (2) structural validation of the frontmatter fields (`name`, `description`, `model`,
`argument-hint`) declared in every agent `.md` and skill `SKILL.md` file shipped with
the toolkit. The suite integrates into GitHub Actions CI on pull requests from `develop`
to `main`, giving the project its first automated quality gate.

## Problem Statement
`bin/cli.js` contains non-trivial pure logic — file hashing, directory walking, file
categorization, version reading, frontmatter-agnostic path detection — that is exercised
only by running the full CLI interactively. A broken `walkDir` or `categorize` regression
would ship silently. Similarly, agent and skill `.md` files carry frontmatter contracts
(`name`, `description`, `model`) that are consumed by Claude Code at runtime; a missing
or mistyped field causes silent agent degradation, and nothing currently enforces those
fields are present and valid. There are no `devDependencies`, no `npm test` script, and
no CI test job.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Developer | Runs `npm test` locally while modifying `cli.js` or agent `.md` files | Per coding session |
| CI pipeline | Runs `npm test` and `npm run test:coverage` automatically on every PR from `develop` to `main` | Per PR |

## Core Flow (Happy Path)

### Local development
1. Developer modifies a function in `bin/cli.js` or edits an agent `.md` frontmatter field.
2. Developer runs `npm test`.
3. Jest discovers all test files under `tests/cli/` and `tests/frontmatter/`.
4. Jest runs tests and stops on the first failure (`--bail`).
5. All tests pass; developer proceeds.

### CI on PR
1. A PR from `develop` to `main` is opened or updated.
2. GitHub Actions triggers the `ci.yml` workflow.
3. The workflow checks out the repo, installs dependencies (`npm ci`), and runs `npm test`.
4. On success, the PR check is green.
5. Optionally, `npm run test:coverage` runs in the same job and uploads the coverage report
   as a workflow artifact (HTML report) — coverage result is informational only, no
   threshold is enforced.

## Out of Scope
- Workflow script mock runtime tests (deferred — no mock infrastructure defined yet).
- Behavioral tests of agent `.md` files (untestable with unit tests; behavior is interpreted
  by the Claude Code runtime, not by this codebase).
- End-to-end / integration tests that invoke the CLI as a child process.
- Coverage thresholds — no minimum percentage is enforced; coverage is diagnostic only.
- Testing interactive prompts (`askConfirm`, `askMattPocock`, `installMattPocock`) — these
  involve stdin/stdout and child process spawning; excluded from this iteration.
- Testing `console.log` / output formatting functions (`banner`, `divider`, `clr`, etc.).

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| `fileHash` called on a non-existent file | Jest test uses a temp file; non-existence is not directly tested (left to FS error) |
| `walkDir` on an empty directory | Returns an empty array |
| `walkDir` on a nested directory tree | Returns all leaf files, no directories |
| `expandMappings` src path does not exist | Entry is silently skipped; result does not include it |
| `expandMappings` src is a file in `NEVER_COPY` | Entry is silently skipped |
| `categorize` dest file does not exist | Entry gets status `'new'` |
| `categorize` src and dest have identical content | Entry gets status `'same'` |
| `categorize` src and dest differ | Entry gets status `'modified'` |
| `readInstalledVersion` — version file absent | Returns `null` |
| `readInstalledVersion` — version file present | Returns trimmed version string |
| `isMattPocockInstalled` — neither path exists | Returns `false` |
| Agent `.md` missing `name` field | Frontmatter test fails with clear message naming the file and field |
| Agent `.md` missing `description` field | Frontmatter test fails with clear message |
| Agent `.md` `model` field has invalid value | Frontmatter test fails; valid values: `haiku`, `sonnet`, `opus` |
| Skill `SKILL.md` missing `description` field | Frontmatter test fails with clear message |

## Data Model

### Entities
No persistent data is created or modified by the test suite itself. The tests operate
on temporary directories and files created in `beforeEach` / `afterEach` blocks and
cleaned up after each test.

### Key test inputs
- Temporary directories and files created programmatically (using Node's `fs` and
  `os.tmpdir()`).
- The actual `.claude/agents/*.md` and `.claude/skills/**/SKILL.md` files read from
  the repository at test time (no copies; tests read the live files).

### Validation Rules — frontmatter fields

| File type | Required field | Constraint |
|-----------|---------------|------------|
| `.claude/agents/*.md` | `name` | Non-empty string |
| `.claude/agents/*.md` | `description` | Non-empty string |
| `.claude/agents/*.md` | `model` | One of: `haiku`, `sonnet`, `opus` |
| `.claude/skills/**/SKILL.md` | `description` | Non-empty string |

`model` is not required on skill `SKILL.md` files (skills do not declare a model).
`argument-hint` is optional on both agent and skill files; if present it must be a
non-empty string.

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| Developer | Run `npm test`, `npm run test:coverage` locally |
| CI pipeline | Run `npm test` and `npm run test:coverage`; read repo files; write workflow artifacts |

No authentication or authorization logic is introduced by this feature.

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A developer has cloned the repo and run `npm install` | They run `npm test` | Jest runs all tests under `tests/cli/` and `tests/frontmatter/`, stops on first failure, exits 0 if all pass | Must |
| AC-02 | A developer runs `npm run test:coverage` | Jest completes | A coverage report is generated under `coverage/` (lcov + HTML); no threshold is enforced | Must |
| AC-03 | `fileHash` is called with a path to a known file | The test executes | The returned MD5 hex string matches the expected digest for that file's content | Must |
| AC-04 | `walkDir` is called on a nested directory tree | The test executes | All leaf file paths are returned; no directory paths are included | Must |
| AC-05 | `expandMappings` is called with a mapping whose `src` does not exist | The test executes | The non-existent src is silently skipped; the result is an empty array | Must |
| AC-06 | `expandMappings` is called with a mapping whose `src` is a file named `settings.json` | The test executes | The file is excluded from the result (NEVER_COPY rule) | Must |
| AC-07 | `categorize` is called on a set of file pairs | The test executes | Each pair is classified as `'new'`, `'same'`, or `'modified'` correctly | Must |
| AC-08 | `readInstalledVersion` is called when no version file exists | The test executes | Returns `null` | Must |
| AC-09 | `readInstalledVersion` is called when a version file with content `0.1.3\n` exists | The test executes | Returns `'0.1.3'` (trimmed) | Must |
| AC-10 | `isMattPocockInstalled` is called when neither expected path exists | The test executes | Returns `false` | Must |
| AC-11 | All `.claude/agents/*.md` files are read from the live repo | Frontmatter tests run | Every file has non-empty `name`, non-empty `description`, and `model` in `['haiku', 'sonnet', 'opus']` | Must |
| AC-12 | All `.claude/skills/**/SKILL.md` files are read from the live repo | Frontmatter tests run | Every file has a non-empty `description` field | Must |
| AC-13 | A PR from `develop` to `main` is opened on GitHub | The CI workflow triggers | `npm test` runs on `ubuntu-latest` with Node 20; the job passes if all tests pass | Must |
| AC-14 | `npm test` is run | Jest exits | Exit code is 0 on all-pass, non-zero on any failure | Must |

## MVP vs Deferred

### MVP (must ship)
- Jest + `jest-config.js` setup
- `devDependencies`: `jest`, `gray-matter` (for frontmatter parsing)
- `npm test` → `jest --bail`
- `npm run test:coverage` → `jest --coverage`
- `tests/cli/` — unit tests for: `fileHash`, `walkDir`, `expandMappings`, `categorize`,
  `readInstalledVersion`, `isMattPocockInstalled`
- `tests/frontmatter/` — structural validation of all agent `.md` and skill `SKILL.md` files
- `.github/workflows/ci.yml` — new workflow, trigger: `pull_request` targeting `main`,
  runs `npm ci` + `npm test` + `npm run test:coverage` + uploads coverage artifact

### Deferred (next iteration)
- E2E / subprocess tests for CLI entry points (`installLocal`, `installGlobal`)
- Interactive prompt tests (stdin mocking)
- Coverage threshold enforcement
- Workflow mock runtime tests

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should the CI job also run on `push` to `develop` (not only on PRs to `main`)? | Low — broadens feedback loop but increases CI minutes usage |
| 2 | Should coverage artifacts be uploaded to a service (Codecov, Coveralls) rather than kept as workflow artifacts? | Low — purely informational for now |

## Dependencies and Assumptions
- Node.js 20 is the target runtime (consistent with the existing `publish.yml` workflow).
- `gray-matter` is available on npm and is the standard choice for YAML frontmatter
  parsing in Node; it is added as a `devDependency` only.
- The functions under test (`fileHash`, `walkDir`, `expandMappings`, `categorize`,
  `readInstalledVersion`, `isMattPocockInstalled`) must be exported from `bin/cli.js`
  (or extracted to a separate module) for Jest to import them. Currently `cli.js` has
  no exports; the implementation work includes adding a conditional export block:
  `if (require.main !== module) { module.exports = { ... }; }` so the CLI continues
  to work normally when invoked directly.
- No existing CI workflow is appropriate for PR-based test runs: `publish.yml` triggers
  on version tags, `release-please.yml` triggers on push to `main`. A new `ci.yml` is
  required.
- Test file layout decision (delegated by user): `tests/` at repo root with
  `tests/cli/` and `tests/frontmatter/` subdirectories. Rationale: flat enough to avoid
  bureaucracy, separated by concern so the suite scales without reorganization.
- `npm test` uses `--bail` (delegated by user). Rationale: stops at first failure in
  both local dev and CI, giving faster signal without wading through a cascade of
  downstream errors.
