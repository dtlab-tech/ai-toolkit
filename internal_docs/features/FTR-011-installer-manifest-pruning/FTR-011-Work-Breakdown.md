# Work Breakdown — Installer Manifest and Orphan Pruning

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-011 — Installer Manifest and Orphan Pruning |
| Version | 1.0 |
| Date | 2026-07-29 |
| Status | Draft |
| Source: Requirements | FTR-011-Requirements.md |
| Source: Tech-Spec | FTR-011-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 6 |
| Total Tasks | 22 |
| Domain distribution | BE: 12, TEST: 10 |
| Complexity | S: 6, M: 14, L: 2 |
| Estimated total (Human) | 60h |
| Estimated total (Agent) | 240min |
| Implementation phases | 6 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Audit existing `bin/cli.js` structure and exports | BE | US-01, US-02, US-03, US-04, US-05, US-06 | M | 2h | 10min | Read and understand current module structure, export guard, existing functions, and integration points with `runInstall()`. Identify where new functions will be added and how manifest phase will be wired in. |

---

## 3. User Stories

### US-01: Implement `readManifest()` Function

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | Installer process |
| Priority | Must |
| Acceptance Criteria | AC-14, AC-15, AC-16 |

**Description:**
As the installer process, I want to read the previous manifest file (or handle its absence gracefully), so that I can compute which files are orphaned and need cleanup.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Implement `readManifest(destRoot)` function in `bin/cli.js` | BE | INFRA-T01 | M | 1.5h | 10min | Create pure function that reads `.claude/.ai-toolkit-manifest.json` from destination root. Return `{ files: [] }` if file missing or corrupt JSON. Normalize backslash paths to forward slashes. |
| US-01-T02 | Create unit test file `tests/cli/readManifest.test.js` | TEST | US-01-T01 | M | 2h | 10min | Write Jest tests covering: (1) missing manifest returns `{ files: [] }`, (2) valid manifest is parsed correctly, (3) corrupt JSON returns `{ files: [] }` with warning logged, (4) backslash paths are normalized. |
| US-01-T03 | Export `readManifest` via module.exports guard | BE | US-01-T01 | S | 0.5h | 5min | Add `readManifest` to the exports object in `bin/cli.js` `require.main` guard to allow unit tests to import it. |

---

### US-02: Implement `computeOrphans()` Function

| Field | Value |
|-------|-------|
| Derived from | UC-06 |
| Actor | Installer process |
| Priority | Must |
| Acceptance Criteria | AC-18, AC-19, AC-20 |

**Description:**
As the installer process, I want to compute the set difference between old and new file sets, so that I can identify which files are orphaned and should be moved to trash.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Implement `computeOrphans(oldFiles, newFiles)` function in `bin/cli.js` | BE | INFRA-T01 | S | 0.75h | 5min | Create pure function that returns set difference: files in `oldFiles` but not in `newFiles`. Normalize backslashes. Handle empty arrays and duplicates. |
| US-02-T02 | Create unit test file `tests/cli/computeOrphans.test.js` | TEST | US-02-T01 | M | 1.5h | 10min | Write Jest tests: `(['a','b','c'], ['b','c'])` → `['a']`; `(['a','b'], ['a','b'])` → `[]`; `([], ['a','b'])` → `[]`; case sensitivity, no duplicates. |
| US-02-T03 | Export `computeOrphans` via module.exports guard | BE | US-02-T01 | S | 0.5h | 5min | Add `computeOrphans` to the exports object in `bin/cli.js` guard. |

---

### US-03: Implement `moveToTrash()` Function

| Field | Value |
|-------|-------|
| Derived from | UC-07 |
| Actor | Installer process |
| Priority | Must |
| Acceptance Criteria | AC-03, AC-04, AC-11 |

**Description:**
As the installer process, I want to safely move orphaned files to a trash folder while preserving their relative path structure, so that users can recover them if needed and the destination is cleaned up.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Implement `moveToTrash(destRoot, relativePath)` function in `bin/cli.js` | BE | INFRA-T01 | M | 2h | 10min | Create function that moves a file to `.claude/.ai-toolkit-trash/` preserving relative path. Create intermediate directories. Silently skip if source missing. Use `fs.renameSync()` with EXDEV fallback (copy + delete). |
| US-03-T02 | Create unit test file `tests/cli/moveToTrash.test.js` | TEST | US-03-T01 | L | 3h | 15min | Write Jest tests: (1) file is moved with directory structure preserved, (2) intermediate directories created, (3) missing source file silently skipped, (4) cross-device EXDEV fallback works, (5) source location empty after move. Use `fs.mkdtempSync` for isolated test directories. |
| US-03-T03 | Export `moveToTrash` via module.exports guard | BE | US-03-T01 | S | 0.5h | 5min | Add `moveToTrash` to the exports object in `bin/cli.js` guard. |

---

### US-04: Implement `writeManifest()` Function

| Field | Value |
|-------|-------|
| Derived from | UC-05 |
| Actor | Installer process |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02, AC-12, AC-13, AC-17 |

**Description:**
As the installer process, I want to write a new manifest file after installation completes, so that future installs can identify which files are orphaned and which were actually installed by this toolkit.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Implement `writeManifest(destRoot, fileList)` function in `bin/cli.js` | BE | INFRA-T01 | M | 1.5h | 10min | Create function that writes `.claude/.ai-toolkit-manifest.json` with `version`, `installedAt` (ISO 8601), and `files` (normalized to forward slashes). Filter out paths starting with `.ai-toolkit-trash/` and settings files. Create `.claude/` directory if needed. |
| US-04-T02 | Create unit test file `tests/cli/writeManifest.test.js` | TEST | US-04-T01 | L | 3h | 15min | Write Jest tests: (1) manifest file created with correct JSON structure, (2) version matches current toolkit version, (3) installedAt is valid ISO 8601 timestamp, (4) all files in fileList appear (except filtered), (5) paths normalized to forward slashes, (6) `.ai-toolkit-trash/` paths excluded, (7) `.claude/` directory created if absent. |
| US-04-T03 | Export `writeManifest` via module.exports guard | BE | US-04-T01 | S | 0.5h | 5min | Add `writeManifest` to the exports object in `bin/cli.js` guard. |

---

### US-05: Integrate Prune Phase into `runInstall()` and Add UI Display

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Installer process, Developer/User |
| Priority | Must |
| Acceptance Criteria | AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10 |

**Description:**
As the installer and user, I want the prune phase to be executed before file copy with proper display and confirmation, so that orphans are safely moved to trash and the user understands what is being cleaned up.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-05-T01 | Integrate prune phase calls into `runInstall()` before file copy | BE | US-01-T01, US-02-T01, US-03-T01, US-04-T01 | L | 4h | 20min | Add `readManifest()`, `computeNewFileSet()`, and `computeOrphans()` calls before file copy. Display REMOVED plan section showing each orphan file (matching NEW/MODIFIED/SAME format). Compute confirmed removals based on user prompts. Call `moveToTrash()` for each confirmed orphan. |
| US-05-T02 | Implement interactive prompts for orphan confirmation in `runInstall()` | BE | US-05-T01 | M | 2h | 10min | Add per-orphan "Move to trash?" prompts matching existing MODIFIED "Overwrite?" pattern. Only shown in interactive mode (when `--force` is not provided). Use existing `askConfirm()` helper function. |
| US-05-T03 | Implement `--force` flag to auto-move all orphans | BE | US-05-T01 | M | 1h | 5min | Integrate existing `force` parameter into prune phase decision logic. When `force=true`, skip all prompts and move all orphans automatically. Display summary showing files moved. |
| US-05-T04 | Display REMOVED plan section and prune summary in console output | BE | US-05-T01 | M | 1.5h | 10min | Format and display REMOVED section showing each orphan with consistent color/symbol coding (∅ in red for REMOVED items). Display summary: "Moved to trash: N file(s)" with path `.claude/.ai-toolkit-trash/`. Match existing NEW/MODIFIED/SAME styling. |

---

### US-06: Add CI Safety Net — Agent Name-to-Filename Alignment Check

| Field | Value |
|-------|-------|
| Derived from | UC-08 |
| Actor | CI/CD system, Developer |
| Priority | Must |
| Acceptance Criteria | AC-22, AC-25 |

**Description:**
As the CI system and developer, I want a test that verifies agent `name` frontmatter field matches the filename, so that renamed agents are caught at commit time before they reach destinations and leave orphans.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-06-T01 | Add agent name-check assertion to `tests/frontmatter/agents.test.js` | TEST | INFRA-T01 | M | 1.5h | 10min | Add test assertion inside `describe.each` block: agent `name` field must equal filename without `.md` extension (e.g., file `developer-backend.md` → `name: developer-backend`). Fail with clear message identifying file and mismatch. |
| US-06-T02 | Run full test suite and verify all tests pass | TEST | US-01-T02, US-02-T02, US-03-T02, US-04-T02, US-06-T01 | M | 2h | 10min | Execute `npm test` to verify all new tests pass and no regressions in existing test suite (FTR-010 tests and all other existing tests). Fix any failures. Document final test status. |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable User Story. Within a phase, tasks execute in dependency order (BE → TEST); independent tasks within the same layer may run in parallel.

#### Phase 0 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Audit existing `bin/cli.js` structure and exports | BE |

#### Phase 1 — US-01: Implement `readManifest()` Function (depends on INFRA)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Implement `readManifest(destRoot)` function | BE |
| US-01-T03 | Export `readManifest` via module.exports guard | BE |
| US-01-T02 | Create unit test file `tests/cli/readManifest.test.js` | TEST |

#### Phase 2 — US-02: Implement `computeOrphans()` Function (depends on INFRA)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Implement `computeOrphans(oldFiles, newFiles)` function | BE |
| US-02-T03 | Export `computeOrphans` via module.exports guard | BE |
| US-02-T02 | Create unit test file `tests/cli/computeOrphans.test.js` | TEST |

#### Phase 3 — US-03: Implement `moveToTrash()` Function (depends on INFRA)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Implement `moveToTrash(destRoot, relativePath)` function | BE |
| US-03-T03 | Export `moveToTrash` via module.exports guard | BE |
| US-03-T02 | Create unit test file `tests/cli/moveToTrash.test.js` | TEST |

#### Phase 4 — US-04: Implement `writeManifest()` Function (depends on INFRA)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Implement `writeManifest(destRoot, fileList)` function | BE |
| US-04-T03 | Export `writeManifest` via module.exports guard | BE |
| US-04-T02 | Create unit test file `tests/cli/writeManifest.test.js` | TEST |

#### Phase 5 — US-05: Integrate Prune Phase into `runInstall()` (depends on INFRA, US-01, US-02, US-03, US-04)

| Task ID | Task | Domain |
|---------|------|--------|
| US-05-T01 | Integrate prune phase calls into `runInstall()` | BE |
| US-05-T02 | Implement interactive prompts for orphan confirmation | BE |
| US-05-T03 | Implement `--force` flag to auto-move all orphans | BE |
| US-05-T04 | Display REMOVED plan section and prune summary | BE |

#### Phase 6 — US-06: Add CI Safety Net and Verify (depends on INFRA, US-01, US-02, US-03, US-04, US-05)

| Task ID | Task | Domain |
|---------|------|--------|
| US-06-T01 | Add agent name-check assertion to `tests/frontmatter/agents.test.js` | TEST |
| US-06-T02 | Run full test suite and verify all tests pass | TEST |

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01 → US-01-T01 + US-02-T01 + US-03-T01 + US-04-T01 (parallel)
          → US-01-T03 + US-02-T03 + US-03-T03 + US-04-T03 (parallel)
          → US-05-T01 → US-05-T02 → US-05-T03 → US-05-T04
          → US-06-T01 → US-06-T02
```

Estimated critical path (human): INFRA-T01 (2h) + [max of US-01/02/03/04 BE phases] (7h) + US-05 (8.5h) + US-06 (3.5h) = ~21h

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| BE | 12 | 3 | 6 | 3 | 19.75h | 100min |
| TEST | 10 | 3 | 8 | 2 | 40.25h | 140min |
| **Total** | **22** | **6** | **14** | **2** | **60h** | **240min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03 | AC-01 (via AC-17 for manifest write) |
| UC-02 | US-02, US-03, US-04, US-05 | US-02-T01..T03, US-03-T01..T03, US-04-T01..T03, US-05-T01..T04 | AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10 |
| UC-03 | US-05 | US-05-T03 | AC-09 |
| UC-04 | US-01 | US-01-T01, US-01-T02, US-01-T03 | AC-14, AC-15, AC-16, AC-21 |
| UC-05 | US-04 | US-04-T01, US-04-T02, US-04-T03 | AC-01, AC-02, AC-12, AC-13, AC-17, AC-21 |
| UC-06 | US-02 | US-02-T01, US-02-T02, US-02-T03 | AC-18, AC-19, AC-20, AC-21 |
| UC-07 | US-03 | US-03-T01, US-03-T02, US-03-T03 | AC-03, AC-04, AC-11, AC-21 |
| UC-08 | US-06 | US-06-T01, US-06-T02 | AC-22, AC-25 |

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Windows path handling with backslashes | All BE tasks involving path normalization (US-01, US-02, US-04) must correctly normalize `\` to `/`. Tests must verify this on Windows-like scenarios. | All path normalization code includes `.replace(/\\/g, '/')`. Unit tests explicitly check backslash handling. Documented in code comments. |
| 2 | Cross-device move (EXDEV) error recovery | US-03-T01 and US-03-T02 must implement and test the copy + delete fallback to `fs.renameSync()` | Implement fallback in `moveToTrash()` with `fs.copyFileSync()` + `fs.unlinkSync()`. US-03-T02 includes explicit test case for EXDEV scenario. |
| 3 | Determining correct `newFileSet` from expanded mappings | US-05-T01 must correctly compute the set of all files from expanded mappings (including filters for NEVER_COPY). | Use output of `expandMappings()` and `categorize()` which already filter NEVER_COPY entries. Compute `newFileSet` as array of destination-relative paths from these existing functions. |
| 4 | Test isolation and cleanup | All unit test files (US-01-T02, US-02-T02, US-03-T02, US-04-T02) must clean up temporary directories. | Each test uses `fs.mkdtempSync()` in `beforeEach` and `fs.rmSync(..., { recursive: true, force: true })` in `afterEach`. Pattern follows existing FTR-010 test structure. |
| 5 | Manifest version field accuracy | US-04-T01 must read the correct version from `package.json`. | Examine existing code in `bin/cli.js` for how TOOLKIT_VERSION is currently read; reuse the same approach. Store in a module-level constant for consistency. |
