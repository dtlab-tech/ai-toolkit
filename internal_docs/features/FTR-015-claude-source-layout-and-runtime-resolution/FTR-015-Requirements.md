# Functional Requirements — Claude Source Layout and Runtime Resolution

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-015: Claude Source Layout and Runtime Resolution |
| Version | 1.0 |
| Date | 2026-08-12 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose

This requirements document specifies the migration and structural changes required to eliminate ambiguity in the toolkit's asset resolution. Currently, the `.claude/` directory serves four incompatible roles simultaneously: versioned source, auto-discovered runtime, npm-packaged payload, and personal configuration. This creates permission fatigue during development and runtime ambiguity when both local and global installations exist. This feature establishes a clear separation of concerns: `src/claude/` as the single authoritative source (editable without permission prompts), deterministic installation via `lib/asset-catalog.js`, explicit runtime resolution via `resolveClaudeRuntimeAsset()`, and read-only diagnostics via `doctor resolution`.

### 1.2 Scope

**In scope:**
- One-time migration of all versioned assets from `.claude/` to `src/claude/` and test files to `tests/`
- Creation of `lib/asset-catalog.js` as the single source of truth for installable asset categories
- Update of local and global installers to derive their copy plan exclusively from the asset catalog
- Introduction of `resolveClaudeRuntimeAsset()` for atomic, coherent runtime script resolution
- Addition of `doctor resolution` CLI command for provenance diagnostics
- Update of `package.json` `files[]` to reference `src/claude/` instead of `.claude/`
- Creation of `npm run toolkit:dev-install-global` as an explicit, non-automated installation script
- Removal of `.claude/.ai-toolkit-version` from git tracking and addition to `.gitignore`
- Update of documentation (`AGENTS.md`, `docs/reference.md`, `docs/installation.md`)
- Addition of regression tests to verify migration correctness and prevent regressions

**Out of scope:**
- Modification of functional content (agent logic, skill definitions, etc.)
- Redesign of pipeline phases (pm-phase1, pm-phase2, pm-phase3)
- Features that depend on this one (FTR-016 Execution Ledger, FTR-017 Task Checkpoints, FTR-018 Isolated Parallel Task Execution)
- Automatic global install triggered by tests, build steps, or npm install
- Automatic modification or deletion of user's personal configuration
- Retroactive rewriting of historical feature delivery artifacts

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Toolkit Developer | Engineer authoring or maintaining agents, skills, commands, workflows, and scripts. Needs frictionless editing without permission prompts. |
| Installer Process | Automated installation mechanism that copies versioned assets from `src/claude/` to target environments (local project or global home). Must be deterministic and catalog-driven. |
| Runtime Resolver | Mechanism (function and diagnostics command) that determines effective asset installation and returns paths for pipeline workflows. Must never mix assets from local and global installations. |
| CI/CD Pipeline | Automated test and packaging verification. Must confirm migration correctness, test isolation, and tarball content validity. |

## 2. Use Cases

### UC-01: Classify Files Under `.claude/`

| Field | Value |
|-------|-------|
| Actor | Toolkit Developer (via manual review and implementation plan) |
| Preconditions | Repository contains `.claude/` directory with versioned assets, tests, and personal configuration mixed together |
| Trigger | Feature implementation begins |
| Priority | Must |

**Main flow:**
1. Identify all files currently tracked under `.claude/`
2. Classify each file as one of: runtime asset, test-only, personal configuration, or ambiguous
3. Document classification decisions in the implementation plan
4. For any ambiguous file, halt the process and request explicit human decision

**Error flows:**
- [Ambiguous file encountered] → Halt migration; document ambiguous file path and provide context for manual classification decision
- [Incomplete .claude/ inventory] → Restart from step 1 after completing inventory

**Postconditions:**
- Every tracked file under `.claude/` has a documented classification
- No files are moved automatically until all classifications are known

---

### UC-02: Migrate Test Files to Top-Level `tests/` Hierarchy

| Field | Value |
|-------|-------|
| Actor | Installer/Migration Script |
| Preconditions | File classification complete (UC-01); test-only files identified |
| Trigger | Migration implementation phase 2 begins |
| Priority | Must |

**Main flow:**
1. For each file classified as test-only under `.claude/scripts/tests/**`:
   - Use history-preserving `git mv` to move file to `tests/<corresponding-path>`
   - Update all import paths and fixture references within moved files
2. Update `jest.config.js` to reference the new test location
3. Update `package.json` test scripts to point to the new `tests/` hierarchy
4. Run full test suite to verify all tests pass in new location

**Alternative flows:**
- [Fixture or helper file referenced] → Move fixture to `tests/<category>/fixtures/`; update import paths in dependent tests
- [Test helper file] → Move to `tests/<category>/helpers/`; update import paths

**Error flows:**
- [Import path update fails] → Preserve file state; document the import path transformation required; halt and request manual intervention
- [Tests fail after migration] → Revert moves; diagnose root cause before proceeding

**Postconditions:**
- All test files, fixtures, and helpers are under `tests/**`
- No test files remain under `.claude/**`
- All tests pass in the new location
- No git history is lost (files moved via `git mv`)

---

### UC-03: Migrate Runtime Assets to `src/claude/` Directory

| Field | Value |
|-------|-------|
| Actor | Installer/Migration Script |
| Preconditions | Test files migrated (UC-02); runtime assets identified |
| Trigger | Migration implementation phase 3 begins |
| Priority | Must |

**Main flow:**
1. For each file classified as runtime asset under `.claude/agents/`, `.claude/commands/`, `.claude/skills/`, `.claude/workflows/`, `.claude/scripts/*.js`:
   - Use history-preserving `git mv` to move to corresponding path under `src/claude/`
   - Preserve all functional content; no logic alterations
2. Verify all files are present at new locations
3. Confirm no versioned runtime assets remain under `.claude/`

**Alternative flows:**
- [Asset has local overrides] → Preserve overrides; document in implementation notes
- [Asset references other assets by path] → Update references to use new `src/claude/` paths if needed

**Error flows:**
- [File move fails] → Halt; diagnose issue; preserve original location

**Postconditions:**
- All runtime assets now reside under `src/claude/`
- No versioned runtime assets remain under `.claude/agents/`, `.claude/commands/`, `.claude/skills/`, `.claude/workflows/`, or `.claude/scripts/`
- Git history is preserved for all moved files
- No functional content has been altered

---

### UC-04: Update npm Packaging Configuration

| Field | Value |
|-------|-------|
| Actor | Installer/Migration Script |
| Preconditions | Runtime assets migrated to `src/claude/` (UC-03) |
| Trigger | Migration implementation phase 4 begins |
| Priority | Must |

**Main flow:**
1. Update `package.json` `files[]` array to replace `.claude` with `src/claude`
2. Remove any references to `.claude` in `files[]`
3. Run `npm pack --dry-run` to inspect tarball contents
4. Verify:
   - `src/claude/` is present in tarball
   - No root `.claude/` directory is present
   - No `tests/**` files are present
   - No `internal_docs/` files are present
5. Create regression test to prevent reintroduction of versioned `.claude/` or test files in tarball

**Error flows:**
- [Tarball contains `.claude/`] → Treat as packaging defect; update `package.json` and retry
- [Tarball contains test files] → Investigate inclusion path; update packaging rules

**Postconditions:**
- `package.json` `files[]` lists `src/claude` and not `.claude`
- `npm pack --dry-run` produces correct tarball contents
- Regression test prevents future regressions

---

### UC-05: Create Asset Catalog and Update Installers

| Field | Value |
|-------|-------|
| Actor | Installer/Migration Script |
| Preconditions | Runtime assets in `src/claude/` (UC-03) |
| Trigger | Migration implementation phase 5 begins |
| Priority | Must |

**Main flow:**
1. Create `lib/asset-catalog.js` module defining:
   - Installable asset categories (agents, commands, skills, workflows, scripts)
   - Source path for each category (relative to repository root: `src/claude/<category>`)
   - Runtime destination path for each category (`.claude/<category>`)
2. Implement catalog export function `getAssetCategories()` returning category definitions
3. Run `src/claude/` purity guard before any copy or packaging:
   - Fail-fast if any file under `src/claude/` is a `*.test.js`, or located in a `tests/`, `fixtures/`, `mocks/`, or `helpers/` directory
   - On violation: abort install with an error listing offending files; no files are copied
   - Single implementation: `validatePurityGuard(sourceDir)` function called by the installer before the first file copy, and exposed as `node bin/cli.js validate-purity` for the `prepack` lifecycle hook
   - Add to `package.json`: `"toolkit:validate-purity": "node bin/cli.js validate-purity"` and `"prepack": "npm run toolkit:validate-purity"`; `npm pack` fails before tarball creation if a violation is found
4. Update local installer:
   - Read asset categories from `lib/asset-catalog.js`
   - Use install formula: `path.join(targetDir, category.runtimeDir)` as destination
   - Generate and write installation manifest and version stamp after successful copy
5. Update global installer:
   - Read asset categories from `lib/asset-catalog.js`
   - Use install formula: `path.join(os.homedir(), category.runtimeDir)` as destination
   - Generate and write installation manifest and version stamp after successful copy
6. Add `--dry-run` flag: when set, all copy, manifest-write, version-write, and trash operations are skipped; only the planning summary is output; the filesystem is not modified
7. Replace FTR-014 `isDistributable()` filter with catalog membership; `isDistributable()` is removed
6. Create upgrade path:
   - Read previous manifest from installed location
   - Compare with current catalog
   - For any file in manifest but not in current catalog: move to `.ai-toolkit-trash/`
   - Do not delete user files not in the manifest

**Alternative flows:**
- [Installer encounters previous test files in manifest] → Move to `.ai-toolkit-trash/` for recovery; log action

**Error flows:**
- [Asset category directory missing from source] → Halt with explicit error; document missing category path
- [Upgrade path encounters conflict] → Move conflicting file to trash; log conflict for review

**Postconditions:**
- `lib/asset-catalog.js` is the single source of truth for asset categories
- Both local and global installers derive copy plan exclusively from catalog
- Previous installer manifest is consulted for upgrade path
- Orphaned test files are moved to trash, not deleted

---

### UC-06: Implement Runtime Asset Resolution

| Field | Value |
|-------|-------|
| Actor | Installer/Migration Script (creates function) |
| Preconditions | Asset catalog created (UC-05) |
| Trigger | Migration implementation phase 6 begins |
| Priority | Must |

**Main flow:**
1. Add `resolveClaudeRuntimeAsset({ projectDir, relativePath })` function to `bin/cli.js`
2. Phase A — Detect presence at each location independently:
   - A location is present if: manifest file exists (any content) OR version stamp exists OR catalog payload check passes
   - settings.json and settings.local.json alone do NOT constitute presence
3. Phase B — Decide mode: local-only, global-only, both (error), none (error)
   - Both present → RAISE ERROR even if one has corrupt metadata
4. Phase C — Validate metadata of effective installation (warnings only, no abort):
   - Manifest schema validity, installationMode coherence, version stamp coherence, stale entries
5. Phase D — Validate completeness against expected payload:
   - Derive expected payload from catalog + package source files
   - Compare expected vs manifest.files (warn on differences); compare expected vs disk (error on missing)
6. Return `path.join(effectiveRoot, relativePath)` if asset exists; else RAISE ERROR
7. Add `resolve-asset` CLI facade: `node bin/cli.js resolve-asset --project <dir> <relativePath>`
   - stdout: resolved absolute path only; stderr: all diagnostics; exit 0 on success, 1 on error
8. Update all current workflow/agent references to runtime paths (Section 3.6):
   - The Claude Code workflow runtime does not expose `require`, `path`, or `__dirname`; `__dirname`-relative construction is not valid in workflow scripts
   - pm-phase2.js: replace hardcoded `node .claude/scripts/wb-*` with `ai-toolkit run-asset --project <projectDir> scripts/wb-*.js -- [args]`
   - am-phase1.js: the workflow runtime does not expose `spawnSync`, `require`, or `child_process`; am-phase1 continues to use `agent()` for its Discovery phase; the Discovery agent's prompt is updated to instruct the agent to run `ai-toolkit list-assets --project <projectDir> --category agents --format json`, parse the JSON array as the definitive list of installed agent paths, read exclusively the frontmatter of each listed path, and return the structured DISCOVERY_SCHEMA; no free scan of `.claude/agents/`; `spawnSync`, `require`, `child_process`, and `__dirname` are absent from am-phase1.js
   - install-toolkit.md: remove assumption that `src/claude/` exists in CWD; update agent prompt to delegate to `ai-toolkit install --project <target>` (or `--global`)

**Error flows:**
- [Both local and global installations present] → Raise explicit error with both runtimeRoot paths
- [No installation found] → Raise explicit error with suggestion to run installer
- [Installation incomplete] → Raise explicit error listing all missing files, mode, expected paths
- [Requested asset absent from effective installation] → Raise explicit error with path and mode

**Postconditions:**
- Function is available in `bin/cli.js` and exported via require.main guard
- `resolve-asset` CLI facade provides machine-readable access with clean stdout/stderr separation
- All pipeline workflow scripts invoke the `ai-toolkit` CLI facade for path resolution and execution (`run-asset`, `list-assets`); no hardcoded `.claude/` path references remain; no `__dirname`, `path`, or `require` constructs in workflow scripts
- Function raises explicit errors with full diagnostics on ambiguity, incompleteness, or missing asset
- All error messages include detected mode and relevant file paths

---

### UC-07: Implement `doctor resolution` Diagnostics Command

| Field | Value |
|-------|-------|
| Actor | Installer/Migration Script (creates command) |
| Preconditions | Runtime asset resolution function created (UC-06) |
| Trigger | Migration implementation phase 7 begins |
| Priority | Must |

**Main flow:**
1. Add `node bin/cli.js doctor resolution --project .` CLI command
2. Command executes read-only diagnostics:
   - Detect installed runtime mode (local-only, global-only, both, or none)
   - Report toolkit source path (`src/claude/`)
   - Report local runtime path if present (`<projectDir>/.claude/`)
   - Report global runtime path if present (`~/.claude/`)
   - Scan for homonymous agents with differing content or version stamps
   - Check for missing scripts in effective installation
   - Verify manifest consistency
   - Detect any residual versioned assets in `.claude/` that should not be there
3. Output comprehensive report with all findings
4. Exit with success (do not modify any files)

**Alternative flows:**
- [No installations found] → Report "no runtime installation detected"; suggest running installer
- [Only local installation] → Report local-only mode with path; note no global installation

**Error flows:**
- [Manifest file corrupted] → Report error reading manifest; include file path
- [Unexpected file in .claude/] → Report file and suggest cleanup

**Postconditions:**
- Diagnostic command provides full provenance visibility without modifying anything
- Output is human-readable and suitable for troubleshooting
- All detected issues are reported with file paths and context

---

### UC-08: Update Development Workflow and Documentation

| Field | Value |
|-------|-------|
| Actor | Toolkit Developer |
| Preconditions | All migration phases complete (UC-01 through UC-07) |
| Trigger | Migration implementation phase 8 begins |
| Priority | Must |

**Main flow:**
1. Add `npm run toolkit:dev-install-global` npm script to `package.json`
   - Script executes three sequential phases: dry-run → install → version verification
   - **Dry-run phase:** calls `bin/cli.js install --global --dry-run`; outputs summary of what would be installed; no file is copied, no manifest written, no version stamp written, no `~/.claude/` modified
   - **Install phase:** runs only if dry-run completes without error
   - **Verify phase:** reads `.ai-toolkit-version` from `~/.claude/` and confirms the installed version matches `package.json` version
   - Output confirms installed version
   - Script is not wired to any automated step (tests, build, pre-commit, npm install)
2. Remove `.claude/.ai-toolkit-version` from git tracking:
   - Run `git rm --cached .claude/.ai-toolkit-version`
   - Add `.ai-toolkit-version` to `.gitignore`
3. Verify all remaining versioned content is removed from `.claude/`
4. Update documentation:
   - `AGENTS.md`: describe new source layout (`src/claude/`), development workflow, installer mapping
   - `docs/reference.md`: include path references to `src/claude/`; document `resolveClaudeRuntimeAsset()` and `doctor resolution`
   - `docs/installation.md`: describe installation process, asset categories, upgrade path, manifest handling
5. Document dev cycle: edit → test → dev-install-global → new session → end-to-end test

**Alternative flows:**
- [Developer runs npm script manually] → Script executes dry-run → install → verify; output confirms success
- [Global install already present] → Script compares versions; upgrades if newer

**Error flows:**
- [npm script wired to automated step] → Remove from that step; document in PR
- [Version file not readable] → Report error; suggest manual verification

**Postconditions:**
- `npm run toolkit:dev-install-global` is available and not automated
- `.claude/.ai-toolkit-version` is git-ignored
- Documentation describes new layout and development workflow
- No versioned assets remain in `.claude/`

---

### UC-09: Verify Migration Completeness

| Field | Value |
|-------|-------|
| Actor | CI/CD Pipeline |
| Preconditions | All migration phases complete (UC-01 through UC-08) |
| Trigger | Test suite runs after implementation |
| Priority | Must |

**Main flow:**
1. Run structural tests:
   - Verify no versioned runtime assets remain under `.claude/`
   - Verify all expected assets present under `src/claude/`
   - Verify `src/.claude/` does not exist
   - Verify no test files exist under `src/claude/`
   - Verify all test files are under `tests/`
2. Run installer tests:
   - Verify local installer copies from `src/claude/` to target
   - Verify global installer copies to `~/.claude/`
   - Verify both use `lib/asset-catalog.js`
3. Run resolution tests:
   - Test `resolveClaudeRuntimeAsset()` with local-only installation
   - Test with global-only installation
   - Test error behavior with both installations present
   - Test error behavior with missing assets
4. Run packaging tests:
   - Verify `npm pack --dry-run` contains `src/claude/`
   - Verify no root `.claude/` in tarball
   - Verify no test files in tarball
5. Run upgrade tests:
   - Verify orphaned test files moved to trash
   - Verify user files not in manifest are not touched
6. Run `npm test` and verify all tests pass
7. Verify Claude Code does not auto-discover `src/claude/` as configuration

**Error flows:**
- [Any test fails] → Halt; diagnose failure; fix implementation

**Postconditions:**
- All structural and functional tests pass
- Migration verified correct in all aspects
- No regressions introduced

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | No file is moved automatically without a documented known destination | UC-01 (classification phase) |
| BR-02 | Test files are separated from runtime assets and never distributed in packages | UC-02, UC-04, UC-05 |
| BR-03 | `lib/asset-catalog.js` is the single source of truth for installable asset categories and destinations | UC-05, UC-06, installers |
| BR-04 | The installer never copies, generates, or overwrites `.claude/settings.json` or `.claude/settings.local.json`; `.claude/settings.json` is removed from git tracking via `git rm --cached` (not moved, not distributed); `.claude/settings.local.json` is left in place as personal configuration | UC-01, UC-05 (installer), UC-08 |
| BR-05 | `resolveClaudeRuntimeAsset()` never mixes individual assets from local and global installations | UC-06, pipeline workflows |
| BR-06 | When both local and global installations are present, `resolveClaudeRuntimeAsset()` raises an explicit error with full diagnostics | UC-06 |
| BR-07 | When the effective installation is incomplete (required script missing), `resolveClaudeRuntimeAsset()` raises an explicit error with the missing path | UC-06 |
| BR-08 | `doctor resolution` is read-only and never modifies or deletes files | UC-07 |
| BR-09 | `npm run toolkit:dev-install-global` is not wired to any automated step (tests, build, pre-commit, npm install) | UC-08 |
| BR-10 | History-preserving git moves (`git mv`) are used during migration to preserve `git log --follow` lineage | UC-02, UC-03 |
| BR-11 | All structural tests must read from `src/claude/` after migration | UC-09 |
| BR-12 | Packaging (`npm pack --dry-run`) must never include root `.claude/` directory, test files, or internal documentation | UC-04, UC-09 |
| BR-13 | The `--dry-run` flag on the installer is non-mutating: no file copies, no manifest writes, no version stamp writes, no orphan moves, no `~/.claude/` modifications | UC-08, UC-09 |
| BR-14 | Workflow scripts (`pm-phase2.js`, `am-phase1.js`) must never hardcode `.claude/` paths; since the workflow runtime does not expose `require`, `path`, or `__dirname`, all runtime asset references must use the `ai-toolkit` CLI facade (`run-asset` or `list-assets`); `__dirname`-relative constructs are prohibited in workflow scripts | UC-06, UC-09 |
| BR-15 | The `resolve-asset`, `list-assets`, and `run-asset` commands follow a three-tier stdout/stderr model: (1) coherent install → exit 0, stdout = result, stderr = ""; (2) usable-with-warnings → exit 0, stdout = result, stderr = warnings; (3) error → exit 1, stdout = "", stderr = error message. `run-asset` child stdout/stderr are streamed separately from resolution diagnostics. | UC-06 |
| BR-16 | The `src/claude/` purity guard must run before any installer copy or `npm pack` invocation; it must block distribution of `*.test.js`, `tests/`, `fixtures/`, `mocks/`, `helpers/` | UC-05, UC-04 |
| BR-17 | `run-asset` can ONLY execute assets from the `scripts` catalog category with an explicitly allowed extension (`.js`); execution uses `spawnSync` with `shell: false`; arguments are forwarded as an argv array; no command concatenation | UC-06 |
| BR-18 | The `ai-toolkit` global binary on PATH is a mandatory prerequisite for the workflow runtime; `npx ai-toolkit` is prohibited during pipeline execution; consumer projects must run `npm install -g @dtlabs/ai-toolkit` once per machine | UC-06, UC-09 |

---

## 4. Data Requirements

### 4.1 Entities

#### Asset Catalog (`lib/asset-catalog.js`)

**Structure:**
```javascript
{
  categories: [
    {
      name: "agents",
      sourceDir: "src/claude/agents",
      runtimeDir: ".claude/agents"
    },
    {
      name: "commands",
      sourceDir: "src/claude/commands",
      runtimeDir: ".claude/commands"
    },
    {
      name: "skills",
      sourceDir: "src/claude/skills",
      runtimeDir: ".claude/skills"
    },
    {
      name: "workflows",
      sourceDir: "src/claude/workflows",
      runtimeDir: ".claude/workflows"
    },
    {
      name: "scripts",
      sourceDir: "src/claude/scripts",
      runtimeDir: ".claude/scripts"
    }
  ]
}
```

**Fields:**
- `name` (string): human-readable category identifier
- `sourceDir` (string): path to source files relative to repository root
- `runtimeDir` (string): path to runtime destination relative to installation root
- All paths use forward slashes; no trailing slashes

**Constraints:**
- Each category must have exactly one source and one runtime destination
- Source directories must exist and contain files
- Runtime directories are created by the installer

#### Installation Manifest

**Structure:**
```json
{
  "version": "0.10.1",
  "installedAt": "2026-08-12T14:30:00Z",
  "installationMode": "local",
  "files": [
    ".claude/agents/agent-name.md",
    ".claude/commands/cmd-name.md",
    ".claude/skills/skill-dir/SKILL.md",
    ".claude/workflows/pm-phase1.js",
    ".claude/scripts/wb-validate.js"
  ]
}
```

**Fields:**
- `version` (string): installer/toolkit version
- `installedAt` (ISO 8601 string): installation timestamp
- `installationMode` (enum): "local" or "global"
- `files` (array of strings): destination-relative paths (forward-slash normalized)

**Constraints:**
- Manifest is written after successful installation
- Used to detect orphaned files during upgrades
- Never includes test files or personal configuration
- All file paths are relative to the installation root (e.g., `.claude/` for local, `~/.claude/` for global)

#### Upgrade Trash Directory

**Location:** `.claude/.ai-toolkit-trash/`

**Purpose:** Recoverable storage for files that are no longer part of the current manifest (detected during upgrade)

**Contents:**
- Files moved here are renamed with timestamp: `<original-name>.<timestamp>.trash`
- Directory is not tracked in git
- User can recover files manually if needed

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| File classification (UC-01) | Every file under `.claude/` must be classified as runtime, test-only, personal-config, or ambiguous. No classification defaults. |
| Asset source path | All source paths must be under `src/claude/` and correspond to a catalog category |
| Asset runtime path | All runtime paths must start with `.claude/` or `~/.claude/` depending on installation mode |
| Manifest file list | All files in manifest must exist at their declared runtime paths after installation |
| Installation completeness | After local or global installation, all files listed in asset catalog must be present at runtime paths |
| Resolution validation | `resolveClaudeRuntimeAsset()` must not return a path unless the asset exists and the installation is complete |
| Tarball content | `npm pack` must include `src/claude/` and exclude `.claude/`, `tests/`, and `internal_docs/` |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Permission & Usability | Edits to `src/claude/` must not trigger Claude Code write-permission prompts when `acceptEdits` is active |
| NFR-02 | Determinism | Installation must be reproducible; same source version always produces identical runtime structure |
| NFR-03 | Explicitness | `resolveClaudeRuntimeAsset()` must never silently fall back or return partial results; all errors must be explicit with diagnostics |
| NFR-04 | Coherence | No asset can be loaded from multiple sources; either local-only, global-only, or explicit error |
| NFR-05 | History Preservation | All file moves during migration must use `git mv` to preserve commit history and enable `git log --follow` |
| NFR-06 | Non-destructiveness | Upgrade path must never delete user files; only manifest-tracked files are moved to trash |
| NFR-07 | Testability | All regression tests must be automated and part of the standard test suite (`npm test`) |
| NFR-08 | Documentation | Development workflow must be documented so developers understand when to run `toolkit:dev-install-global` |
| NFR-09 | Diagnostics | `doctor resolution` command must provide human-readable output with file paths and actionable error messages |
| NFR-10 | Performance | Installation process must complete in under 5 seconds for typical asset count (< 50 files per category) |
| NFR-11 | Reliability | Manifest corruption must not cause silent failures; errors must be detected and reported |

---

## 6. UI Requirements

### 6.1 CLI Commands

#### Command 1: `node bin/cli.js doctor resolution --project .`

**Purpose:** Provide read-only diagnostics for runtime installation mode, asset resolution, and potential conflicts.

**Output Format:**
```
Toolkit Runtime Resolution Diagnostics
=====================================

Toolkit Source: <path>/src/claude/

Runtime Installation Mode: [local-only | global-only | both | none]

Local Runtime:
  Status: [present | not found]
  Path: <projectDir>/.claude/
  Assets: [count and summary]

Global Runtime:
  Status: [present | not found]
  Path: ~/.claude/
  Assets: [count and summary]

Duplicate Agents (local vs global):
  [if any, list with paths and version info]

Manifest Consistency:
  Status: [OK | WARNING | ERROR]
  [details if not OK]

Residual Versioned Assets in .claude/:
  [if any, list with paths]

Summary: [diagnostic conclusion]
```

**User Interactions:**
- No interactive prompts
- User runs command to diagnose state
- Output suggests actions if issues detected (e.g., "Run 'npm run toolkit:dev-install-global'")

---

#### Command 2: `npm run toolkit:dev-install-global`

**Purpose:** Explicitly install the toolkit globally in the developer's home directory with verification.

**Output Format:**
```
AI Toolkit Global Installation
==============================

Dry Run Summary:
  Source: <repo>/src/claude/
  Destination: ~/.claude/
  Categories: agents, commands, skills, workflows, scripts
  Total files to install: [count]

Proceed with installation? [y/n] 

Installing assets...
  agents:     [count] files
  commands:   [count] files
  skills:     [count] files
  workflows:  [count] files
  scripts:    [count] files

Installation complete.

Verification:
  Manifest written: ~/.claude/.ai-toolkit-manifest.json
  Version stamp: 0.10.1
  Installation mode: global

Ready for testing. Start a new Claude Code session.
```

**User Interactions:**
- Script provides dry-run summary before installing
- User confirms before proceeding
- Output includes next steps (start new session)

---

### 6.2 Navigation Flow

Not applicable — this is an internal/technical feature with only CLI interfaces. No UI pages or navigation flow.

---

## 7. Acceptance Criteria

### Acceptance Criteria Table

| ID | Criterion | Related UC | Priority |
|----|-----------|-----------|----------|
| AC-01 | Given the migration is complete, when `grep -r "" .claude/agents .claude/commands .claude/skills .claude/workflows .claude/scripts 2>/dev/null` runs, then the command returns no results (no versioned runtime assets remain under `.claude/`) | UC-03 | Must |
| AC-02 | Given the migration is complete, when `ls src/claude/` runs, then all agent, command, skill, workflow, and script assets that were under `.claude/` are now present under `src/claude/` | UC-03 | Must |
| AC-03 | Given the migration is complete, when `ls src/.claude 2>/dev/null` runs, then the directory does not exist | UC-03 | Must |
| AC-04 | Given the migration is complete, when a Claude Code session is started in the toolkit repository, then Claude Code does not auto-discover `src/claude/` as a configuration directory | UC-03 | Must |
| AC-05 | Given a local installation is performed on a target project, when the installer runs, then `<target>/.claude/` is populated from `src/claude/` via `lib/asset-catalog.js`; all expected asset categories are present | UC-05, UC-06 | Must |
| AC-06 | Given a global installation is performed, when the installer runs, then `~/.claude/agents`, `~/.claude/skills`, `~/.claude/commands`, `~/.claude/workflows`, `~/.claude/scripts` are each populated from the corresponding `src/claude/<category>/` | UC-05, UC-06 | Must |
| AC-07 | Given local and global installers both run, when `lib/asset-catalog.js` is the sole source of the copy plan, then both installers produce a copy plan and manifest derived exclusively from the same catalog; no category or destination is defined in more than one place | UC-05 | Must |
| AC-08 | Given an installation runs, when `settings.json` or `settings.local.json` would be candidates for copying, then neither file is ever copied or overwritten by the installer | UC-05 | Must |
| AC-09 | Given `npm pack --dry-run` runs, when the tarball contents are inspected, then `src/claude/` is present; no root `.claude/` copy is present; no `tests/**` file is present; no `internal_docs/` file is present | UC-04 | Must |
| AC-10 | Given the migration is complete, when `find src/claude -name "*.test.js" -o -name "fixtures" -o -name "helpers" 2>/dev/null` runs, then no test files, fixtures, mocks, or test-only helpers exist under `src/claude/` | UC-02, UC-09 | Must |
| AC-11 | Given the migration is complete, when `ls tests/` runs, then all test files previously under `.claude/scripts/tests/` now reside under the top-level `tests/` hierarchy | UC-02 | Must |
| AC-12 | Given `npm pack --dry-run` runs, when the tarball is inspected, then no file matching `tests/**`, `*.test.js`, fixture, mock, or test helper is present | UC-04 | Must |
| AC-13 | Given a local or global installation is performed, when the installed destination is inspected, then no test file, fixture, mock, or test helper is present in the installed runtime | UC-05 | Must |
| AC-14 | Given upgrading from a version that distributed test files in the manifest, when the installer runs, then orphaned test files are detected via manifest diff and moved to `.ai-toolkit-trash/` (recoverable); user files not in the manifest are not touched | UC-05, UC-09 | Must |
| AC-15 | Given the migration is complete, when all structural tests (frontmatter validation, presence checks, naming checks) run, then they read from `src/claude/` and pass | UC-09 | Must |
| AC-16 | Given a pipeline workflow invokes `resolveClaudeRuntimeAsset()`, when the effective runtime is local-only or global-only and the asset exists, then the function returns the correct absolute path without mixing assets from both installations | UC-06, UC-09 | Must |
| AC-17 | Given `resolveClaudeRuntimeAsset()` is called, when both local and global installations are present, or the required asset is absent from the effective installation, then the function raises an explicit error with diagnostics; it does not silently fall back or return a partial result | UC-06, UC-09 | Must |
| AC-18 | Given `node bin/cli.js doctor resolution --project .` runs, when the toolkit repository is the working directory, then output reports: effective runtime mode, toolkit source path, local/global runtime paths, duplicate agents if any, mixed-version status, residual `.claude/` assets if any | UC-07 | Must |
| AC-19 | Given `doctor resolution` runs on the toolkit repository after migration, when the repository has a global installation and no local `.claude/` runtime assets, then output reports a single runtime source (global); no duplicates or mixed versions | UC-07 | Must |
| AC-20 | Given normal source edits are made to `src/claude/`, when Claude Code's `acceptEdits` permission is active, then no write-permission prompt is raised for edits under `src/claude/` | UC-08 | Must |
| AC-21 | Given `npm run toolkit:dev-install-global` is invoked, when the script runs, then it executes dry-run → install → version verification in sequence; it is not wired to any automated step; output confirms the installed version | UC-08 | Must |
| AC-22 | Given `npm test` and `npm pack --dry-run` are run after all changes, when all phases of implementation are complete, then both commands complete successfully; no test failures, no unexpected tarball contents | UC-09 | Must |
| AC-23 | Given a developer reads `AGENTS.md`, `docs/reference.md`, or `docs/installation.md`, when after migration, then the documents describe the new source layout (`src/claude/`), the development workflow (edit → test → dev-install-global → new session → end-to-end test), and the installer mapping; no references to the old `.claude/` source layout remain in current documentation | UC-08 | Must |
| AC-24 | Given `npm run toolkit:dev-install-global` runs the dry-run phase, when the dry-run phase completes, then `~/.claude/` is byte-identical to its state before the dry-run; no files are created, modified, or deleted | UC-08 | Must |
| AC-25 | Given the toolkit is installed globally (global-only mode) and a pm-phase pipeline runs, when the workflow executes wb-validate.js and wb-render.js (via `ai-toolkit run-asset`) and am-phase1.js uses `agent()` with a prompt instructing the Discovery agent to run `ai-toolkit list-assets --category agents --format json`, then all paths resolve correctly to the effective installation; am-phase1.js contains no free `.claude/agents/` scan, no `__dirname`, no `spawnSync`, and no `child_process` | UC-06, UC-08 | Must |
| AC-26 | Given the toolkit is installed locally on a consumer project (local-only mode) and a pm-phase pipeline runs, when the workflow executes wb-validate.js and wb-render.js, then both scripts are resolved via `ai-toolkit run-asset` to `<project>/.claude/scripts/`; pipeline completes without path errors; no `__dirname` or `require` constructs in workflow scripts | UC-06 | Must |
| AC-27 | Given `ai-toolkit resolve-asset --project <dir> scripts/wb-validate.js` runs on a project with a single effective installation, then exit code is 0 and stdout contains only the resolved absolute path (one line, no extra output); if the installation is fully coherent, stderr is also empty; if there are non-blocking metadata warnings (Phase C), they appear on stderr and stdout remains the path | UC-06 | Must |
| AC-28 | Given `node bin/cli.js resolve-asset` fails (no installation or ambiguous), then stdout is empty, stderr contains the error message, and exit code is 1 | UC-06 | Must |
| AC-29 | Given the installer or `npm pack` encounters a `*.test.js` file or a `tests/`, `fixtures/`, `mocks/`, or `helpers/` directory under `src/claude/`, then the operation aborts with an error listing the offending files; no files are copied | UC-05 | Must |
| AC-30 | Given `resolveClaudeRuntimeAsset()` is called when the local `.claude/` directory contains a full toolkit payload but a corrupt manifest, AND a valid global installation also exists, then the function raises an ambiguous-installation error (both installations are detected); it does not return the global path unilaterally | UC-06 | Must |
| AC-31 | Given the E2E test suite runs, when `--home <tmpdir>` is passed to all CLI commands under test, then `os.homedir()` is neither read nor written — the real home directory is not consulted at any point; all local-only and global-only resolution scenarios execute and verify correctly using temporary directories only | UC-06, UC-09 | Must |
| AC-32 | Given `npm pack` is invoked, when any `*.test.js` file or `tests/`, `fixtures/`, `mocks/`, or `helpers/` directory exists under `src/claude/`, then `npm pack` fails before creating any tarball (via the `prepack` lifecycle hook invoking `toolkit:validate-purity`); no partial tarball is produced | UC-04, UC-05 | Must |
| AC-33 | Given `ai-toolkit run-asset` is invoked with a path outside the `scripts` catalog category (e.g., an agent `.md` file or a command), then it exits 1 with an error on stderr before executing anything; given it is invoked with a `.js` file in the `scripts` category, it executes that file via `spawnSync` with `shell: false` and propagates the exit code | UC-06 | Must |
| AC-34 | Given `resolveClaudeRuntimeAsset()` is called with a `relativePath` that is empty, absolute, contains `..` segments, or contains null bytes, then it raises an error immediately (Phase 0) before any filesystem access; given a `relativePath` that points to a file existing under `.claude/` but not registered in the asset catalog, then it raises a "not a registered catalog asset" error (Phase D) | UC-06 | Must |
| AC-35 | Given the `ai-toolkit` global binary is not on PATH when a pipeline workflow invokes `run-asset`, `list-assets`, or `resolve-asset`, then the workflow fails immediately with a clear "binary not found" error; `npx ai-toolkit` is never used as a fallback during pipeline execution | UC-06 | Must |

---

## 8. Dependencies & Assumptions

### External Dependencies

- **FTR-014 (Atomic Work Breakdown):** This feature is a prerequisite. The contract (`{PREFIX}-Work-Breakdown.json`, `wb-validate.js`, `wb-render.js`, `isDistributable()`) must be stable. FTR-015 replaces `isDistributable()` with the catalog but does not change any Work Breakdown behavior.

- **Subsequent features blocked until FTR-015 ships:**
  - FTR-016 (Execution Ledger)
  - FTR-017 (Task Checkpoints and Resume)
  - FTR-018 (Isolated Parallel Task Execution)
  
  These features add or modify scripts and workflows whose source paths this feature redefines.

### Key Assumptions

1. **Git history preservation:** History-preserving git moves (`git mv` or equivalent) are used throughout migration so that `git log --follow` can trace asset lineage.

2. **No compile/build step:** `npm test` is the only verification command; no separate compile or build step exists.

3. **Ambiguous files produce hard stops:** Any file that cannot be clearly classified as runtime, test-only, or personal-config triggers a halt; no automatic fallback is permitted.

4. **`lib/` directory doesn't exist:** `lib/asset-catalog.js` is a new module; the `lib/` directory does not currently exist and must be created.

5. **Configuration handling:** `.claude/settings.json` is removed from git tracking (`git rm --cached`) and is not moved, not generated, and not distributed by the installer; it may remain on the local filesystem. `.claude/settings.local.json` is not modified by the installer or migration; it remains as personal gitignored configuration.

6. **Single npm package:** The toolkit is distributed as a single npm package with one `files[]` array; no per-category distribution.

7. **Asset catalog centrality:** All installers (local and global), resolution functions, and tests derive asset definitions exclusively from `lib/asset-catalog.js`.

---

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should `.claude/settings.json` (currently tracked and commits `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`) be removed from tracking and generated by the installer, or remain as a versioned toolkit-internal file? | If it stays tracked, AC-01 needs a precise definition of "runtime asset" that explicitly excludes it. If it moves to being installer-generated, the installer must create it on first install. Affects whether `.claude/settings.json` is included in `.gitignore`. | **Resolved in Tech-Spec:** removed from git tracking via `git rm --cached`; not moved; not generated or distributed by the installer. The file has already been removed locally; any self-hosted config needed is covered by global user settings. AC-01 is unaffected (its grep does not reference settings files). |
| 2 | Does `resolveClaudeRuntimeAsset()` validate completeness by checking manifest presence, by checking all catalog-listed assets, or just by checking whether the requested file exists? | Affects correctness of the "valid and complete" check and the test surface. Impacts whether incomplete installations are caught early or only when a missing asset is requested. | **Resolved in Tech-Spec:** full expected payload comparison — the function enumerates all assets from the catalog + package source and verifies each is present on disk; a stale manifest missing a new catalog asset does not mask its absence from disk. |

---

## Document Approval Checklist

- [ ] All actors identified and described
- [ ] All use cases have main flow, alternative flows, and error flows
- [ ] All business rules cross-referenced to relevant use cases
- [ ] Data requirements include entity structures and validation rules
- [ ] Non-functional requirements are testable and measurable
- [ ] All acceptance criteria follow Given/When/Then format and are testable
- [ ] Dependencies and assumptions are explicit
- [ ] Open questions documented with impact and suggested resolution
- [ ] No content invented; all derived from feature document
- [ ] Ready for Tech-Spec generation and implementation planning
