# Functional Requirements — Installer Manifest and Orphan Pruning

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-011 — Installer Manifest and Orphan Pruning |
| Version | 1.0 |
| Date | 2026-07-29 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This document specifies the functional requirements for extending the AI Toolkit installer with a manifest mechanism and a safe orphan pruning feature. The manifest tracks all files deposited by the installer at the destination, enabling detection and cleanup of stale artifacts from renamed or deleted toolkit components while preserving user files and third-party additions in shared installations.

### 1.2 Scope

**In scope:**
- Manifest creation, reading, and updating during install operations
- Detection of orphan files (files listed in old manifest but not in current shipped set)
- Interactive and non-interactive (force) confirmation of orphan removal
- Safe move of orphans to a recoverable trash directory (`.ai-toolkit-trash/`)
- Manifest validation and error recovery
- CI safety nets for agent name/filename alignment
- Unit tests for all new pure functions

**Out of scope:**
- Hard deletion of files (backup-to-trash only)
- Auto-cleanup of the trash directory
- Modification of settings files (`settings.json`, `settings.local.json`)
- Pruning of the `install-toolkit/` directory
- Pruning files not listed in the old manifest
- End-to-end subprocess tests for CLI entry points
- Skill `name` field validation (AC-23, deferred to next iteration)
- Cross-file reference validation (AC-24, deferred to next iteration)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Developer / User | Runs the installer locally or globally; interacts with prompts; may provide `--force` flag |
| CI/CD system | Runs `npm test` to validate manifest integrity and file alignment |
| Installer process | `bin/cli.js` — executes the install flow with prune and manifest steps |

## 2. Use Cases

### UC-01: First Install (No Previous Manifest)

| Field | Value |
|-------|-------|
| Actor | Developer / User |
| Preconditions | Destination directory exists; no `.ai-toolkit-manifest.json` exists at `<destRoot>/.claude/` |
| Trigger | User runs `ai-toolkit` (local) or `ai-toolkit --global` |
| Priority | Must |

**Main flow:**
1. Installer runs `checkVersion` (existing behavior)
2. Installer computes file plan (NEW/MODIFIED/SAME files)
3. `runInstall` copies NEW and MODIFIED files to destination
4. After file copy completes, `writeManifest(destRoot, fileList)` is called
5. Manifest is written to `<destRoot>/.claude/.ai-toolkit-manifest.json` containing:
   - `version` matching `package.json`
   - `installedAt` as ISO 8601 timestamp
   - `files` array of destination-relative paths (forward slashes)
6. `writeInstalledVersion` runs (existing behavior)
7. Install completes — no prune step (no old manifest exists)

**Postconditions:**
- Manifest file exists and is valid JSON
- All installed files are listed in the manifest
- Manifest contains correct version and timestamp

### UC-02: Reinstall or Update (Manifest Exists)

| Field | Value |
|-------|-------|
| Actor | Developer / User |
| Preconditions | Destination directory exists; a previous `.ai-toolkit-manifest.json` exists at `<destRoot>/.claude/` |
| Trigger | User runs `ai-toolkit` or `ai-toolkit --global` (same or different version) |
| Priority | Must |

**Main flow:**
1. Installer runs `checkVersion` (existing behavior)
2. **Prune phase begins:**
   a. `readManifest(destRoot)` reads the previous manifest; returns `{ files: [] }` if absent or corrupt
   b. `computeNewFileSet(mappings)` expands current mappings to destination-relative paths
   c. `computeOrphans(oldFiles, newFiles)` calculates paths in old manifest but not in current set
   d. For each orphan, check if the physical file exists at destination
   e. Display installation plan including REMOVED section showing each orphan
   f. In interactive mode: prompt user for each orphan ("Move to trash?")
   g. With `--force` flag: move all orphans automatically without prompting
   h. For each confirmed orphan: move file to `<destRoot>/.claude/.ai-toolkit-trash/<relative-path>`
3. `runInstall` copies NEW and MODIFIED files as in UC-01
4. After file copy, `writeManifest` writes new manifest with current shipped file set
5. `writeInstalledVersion` runs (existing behavior)
6. Install completes

**Alternative flows:**
- User declines all orphan prompts → files remain at destination; new manifest still written; orphans will reappear next install
- User partially accepts (some "y", some "n") → only confirmed orphans moved; declined orphans remain

**Error flows:**
- Old manifest file is corrupt or unparseable JSON → log warning; treat as empty manifest; continue with install; overwrite with new manifest
- Orphan file has already been manually deleted → skip silently (no error, no prompt)

**Postconditions:**
- New manifest written with current file set
- Confirmed orphans moved to trash directory with relative path structure preserved
- Declined orphans remain at destination
- All new files copied and ready for use

### UC-03: Force Install with Automatic Orphan Removal

| Field | Value |
|-------|-------|
| Actor | Developer / User |
| Preconditions | Previous manifest exists; `--force` flag is provided |
| Trigger | User runs `ai-toolkit --force` or `ai-toolkit --global --force` |
| Priority | Should |

**Main flow:**
1. Same as UC-02 up to the confirmation phase
2. All orphans are automatically moved to trash without prompting
3. REMOVED summary shows all moved files
4. Rest of install proceeds as normal

**Postconditions:**
- All orphans moved to trash without user interaction
- New manifest reflects current file set

### UC-04: Read and Validate Manifest

| Field | Value |
|-------|-------|
| Actor | Installer process, CI tests |
| Preconditions | Destination directory may or may not contain a manifest |
| Trigger | `readManifest(destRoot)` is called during prune phase or from tests |
| Priority | Must |

**Main flow:**
1. Attempt to read `<destRoot>/.claude/.ai-toolkit-manifest.json`
2. If file does not exist, return `{ files: [] }`
3. If file exists, parse JSON
4. If parse succeeds, return parsed object
5. If parse fails, log warning and return `{ files: [] }`

**Postconditions:**
- Caller receives manifest object with `files` array (may be empty)
- No exception thrown; error is handled gracefully

### UC-05: Write Manifest After Install

| Field | Value |
|-------|-------|
| Actor | Installer process |
| Preconditions | File copy operation has completed; new file set is known |
| Trigger | `writeManifest(destRoot, fileList)` is called after `runInstall` |
| Priority | Must |

**Main flow:**
1. Create manifest object with:
   - `version` from `package.json`
   - `installedAt` as current ISO 8601 timestamp
   - `files` array containing all destination-relative paths from fileList
2. Normalize all paths to forward slashes
3. Exclude any paths beginning with `.ai-toolkit-trash/`
4. Exclude settings files (`settings.json`, `settings.local.json`)
5. Write JSON to `<destRoot>/.claude/.ai-toolkit-manifest.json` (create directory if needed)

**Postconditions:**
- Manifest file is valid, parseable JSON
- All shipped files are listed with forward-slash paths
- Trash folder and settings files are excluded

### UC-06: Compute Orphan Files

| Field | Value |
|-------|-------|
| Actor | Installer process (via `computeOrphans` function) |
| Preconditions | Old manifest has been read; new file set has been computed |
| Trigger | Prune phase executes |
| Priority | Must |

**Main flow:**
1. Compare `oldFiles` array from previous manifest with `newFiles` array from current mappings
2. Return set difference: files in `oldFiles` but not in `newFiles`

**Postconditions:**
- Orphan list is accurate and can be acted upon

### UC-07: Move Orphan to Trash

| Field | Value |
|-------|-------|
| Actor | Installer process (via `moveToTrash` function) |
| Preconditions | Orphan file exists at destination; user has confirmed removal |
| Trigger | For each confirmed orphan in UC-02 prune phase |
| Priority | Must |

**Main flow:**
1. Calculate destination path: `<destRoot>/.ai-toolkit-trash/<relative-orphan-path>`
2. Create all intermediate directories (recursive)
3. Move file from original location to trash location using `fs.renameSync`
4. If `renameSync` fails with `EXDEV` (cross-device), fall back to copy + delete: `fs.cpSync` then `fs.unlinkSync`
5. Verify file exists at new location; original location is empty

**Error flows:**
- File does not exist at original location → skip silently
- Trash directory cannot be created → error propagates (hard constraint: trash must be creatable)

**Postconditions:**
- File is at trash location with relative path structure preserved
- Original location is empty (file moved, not copied)

### UC-08: CI Check — Agent Name and Filename Alignment

| Field | Value |
|-------|-------|
| Actor | CI/CD system, developer (via `npm test`) |
| Preconditions | `.claude/agents/` directory contains `.md` files |
| Trigger | `npm test` runs; `tests/frontmatter/agents.test.js` executes |
| Priority | Must |

**Main flow:**
1. Scan all `.claude/agents/*.md` files
2. For each agent file, extract the `name` field from frontmatter
3. Compare `name` value with the file's basename (without `.md` extension)
4. If they match, test passes for that file
5. If they do not match, test fails with clear message identifying the file and mismatch

**Postconditions:**
- All agents have `name` == filename (without extension)
- CI rejects commits with misaligned agent names

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Manifest is the sole source of truth for determining which files were installed by this toolkit | UC-02, UC-06 |
| BR-02 | Only files listed in the old manifest are candidates for removal; third-party files are never touched | UC-02, UC-06 |
| BR-03 | Settings files (`settings.json`, `settings.local.json`) must never appear in the manifest | UC-05 |
| BR-04 | All file paths in the manifest use forward slashes, regardless of OS | UC-05, UC-04 |
| BR-05 | Orphan files are moved to trash, never permanently deleted | UC-02, UC-07 |
| BR-06 | The trash folder (`.ai-toolkit-trash/`) and its contents never appear in the manifest | UC-05 |
| BR-07 | Corrupt or unreadable manifests are treated as empty (zero orphans) without blocking the install | UC-04, UC-02 |
| BR-08 | Agent `name` field must match the file basename to ensure installer can correctly reference agents | UC-08 |

## 4. Data Requirements

### 4.1 Entities

**Manifest (`.claude/.ai-toolkit-manifest.json`)**

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `version` | String | Semver (e.g. "0.7.0") | Must match `package.json` version at install time |
| `installedAt` | String | ISO 8601 timestamp | Example: `"2026-07-29T10:00:00.000Z"` |
| `files` | Array of strings | Each string is a forward-slash relative path | Paths are relative to `<destRoot>` (e.g. `.claude/agents/developer-backend.md`) |

**Example manifest:**
```json
{
  "version": "0.7.0",
  "installedAt": "2026-07-29T10:00:00.000Z",
  "files": [
    ".claude/agents/developer-backend.md",
    ".claude/skills/implement-feature/SKILL.md",
    "docs/procedures/generate-requirements.md",
    "CLAUDE.md"
  ]
}
```

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `version` | Must be parseable as semver; must match `package.json` at write time |
| `installedAt` | Must be valid ISO 8601 format; must be generated at manifest write time |
| `files` | Must be array; each entry must use forward slashes only; must not include `.ai-toolkit-trash/` paths; must not include settings files |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Safety | No hard deletion; all removed files must be recoverable from trash |
| NFR-02 | Compatibility | Manifest mechanism must work on Windows (backslash paths must be normalized to forward slashes) |
| NFR-03 | Compatibility | Works on shared installs where `.claude/` is populated by multiple sources |
| NFR-04 | Robustness | Corrupt manifests do not block installation; graceful degradation to empty manifest |
| NFR-05 | Performance | Manifest I/O and orphan computation must not significantly impact install time |
| NFR-06 | Usability | Interactive orphan prompts follow the same pattern as existing MODIFIED file prompts |
| NFR-07 | Observability | REMOVED plan section is displayed alongside NEW/MODIFIED/SAME to show user what will be cleaned up |

## 6. UI Requirements

### 6.1 Display and Prompts

**Installation Plan Display**

When prune phase completes, the existing plan display is extended to include a REMOVED section. Example output:

```
Installation plan:
  NEW:
    - .claude/agents/new-agent.md
  MODIFIED:
    - .claude/skills/updated-skill/SKILL.md
  SAME:
    - docs/reference.md
  REMOVED:
    - .claude/agents/old-agent.md
    - .claude/skills/deleted-skill/SKILL.md

Proceed? [y/n]
```

**Interactive Orphan Confirmation Prompt**

For each orphan in interactive mode (no `--force`), prompt the user:

```
Move to trash? .claude/agents/old-agent.md [y/n]
```

Pattern matches existing MODIFIED confirmation prompts.

**Prune Summary**

After pruning completes, display a summary line indicating files moved:

```
Moved to trash: 2 file(s)
```

### 6.2 Navigation Flow

Installer flow remains linear; prune phase is inserted before file copy:

```
checkVersion()
  ↓
readManifest()  [NEW]
  ↓
computeOrphans()  [NEW]
  ↓
displayPlan(plan + REMOVED section)
  ↓
confirmInteractive() or --force  [EXTENDED]
  ↓
moveToTrash(confirmed orphans)  [NEW]
  ↓
runInstall()
  ↓
writeManifest()  [NEW]
  ↓
writeInstalledVersion()
  ↓
Done
```

## 7. Acceptance Criteria

### Manifest Write

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given no previous manifest at destRoot, when `runInstall` completes on a fresh destination, then `<destRoot>/.claude/.ai-toolkit-manifest.json` exists, is valid JSON, has `version` matching `package.json`, has `installedAt` as ISO 8601 string, has `files` array containing all destination-relative paths that were copied (forward slashes) | UC-01 |
| AC-02 | Given an install has already written a manifest, when a second install (same or different version) completes, then the manifest is overwritten with the new file set; `version` and `installedAt` are updated | UC-02 |

### Prune Logic — Core

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-03 | Given old manifest lists `X`, new shipped set does not include `X`, `X` exists at dest, when user confirms removal (interactive), then file is moved to `<destRoot>/.claude/.ai-toolkit-trash/X` (mirroring the relative path); original location no longer exists | UC-02 |
| AC-04 | Given old manifest lists `X`, new shipped set does not include `X`, `X` has already been manually deleted, when prune phase runs, then no error, no prompt for `X`; it is silently skipped | UC-02 |
| AC-05 | Given old manifest lists `X`, `X` is still present in the new shipped set, when prune phase runs, then `X` is NOT moved to trash; it is not shown in the REMOVED plan | UC-02 |
| AC-06 | Given old manifest is absent (first install), when prune phase runs, then zero orphans computed; no REMOVED items shown; no prompts displayed | UC-01 |
| AC-07 | Given old manifest is corrupt JSON, when prune phase runs, then warning printed; treated as zero orphans; install continues normally; new manifest is written | UC-02 |

### Prune Logic — Confirmation UX

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-08 | Given 3 orphans exist in interactive mode (no `--force`), when prune phase runs, then each orphan triggers a per-file "Move to trash?" prompt (matching the MODIFIED "Overwrite?" pattern); files are only moved for orphans where user answers "y" | UC-02 |
| AC-09 | Given 3 orphans exist and `--force` flag provided, when prune phase runs, then all 3 orphans are moved to trash automatically; no prompts shown | UC-03 |
| AC-10 | Given user declines all orphan prompts, when prune phase completes, then no files moved; new manifest written regardless; summary shows "0 moved, N kept" | UC-02 |

### Trash Folder

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-11 | Given orphan at `.claude/skills/old-skill/SKILL.md` is confirmed, when file is moved, then it lands at `<destRoot>/.claude/.ai-toolkit-trash/.claude/skills/old-skill/SKILL.md`; intermediate directories created as needed | UC-07 |
| AC-12 | Given trash folder path is `.claude/.ai-toolkit-trash/`, when manifest is written, then trash folder contents are never listed in `files`; trash folder itself is never a prune candidate | UC-05 |

### NEVER_COPY / Settings Safety

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-13 | Given `expandMappings` encounters `settings.json` or `settings.local.json`, when manifest is assembled, then those paths never appear in `files`; they are never prune candidates | UC-05 |

### New Pure Functions — Unit Tests

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-14 | Given `readManifest` is called on a destRoot with no manifest, when test runs, then returns `{ files: [] }` | UC-04 |
| AC-15 | Given `readManifest` is called on a destRoot with a valid manifest, when test runs, then returns the parsed object with correct `files` array | UC-04 |
| AC-16 | Given `readManifest` is called on a destRoot whose manifest is corrupt JSON, when test runs, then returns `{ files: [] }` | UC-04 |
| AC-17 | Given `writeManifest` is called with a file list, when test runs, then file is written as valid JSON with correct `version`, `installedAt`, and `files` in forward-slash form | UC-05 |
| AC-18 | Given `computeOrphans(['a','b','c'], ['b','c'])`, when test runs, then returns `['a']` | UC-06 |
| AC-19 | Given `computeOrphans(['a','b'], ['a','b'])`, when test runs, then returns `[]` | UC-06 |
| AC-20 | Given `computeOrphans([], ['a','b'])`, when test runs, then returns `[]` | UC-06 |
| AC-21 | Given all new functions are exported via the `require.main` guard, when `npm test` runs, then tests can import them from `../../bin/cli` | UC-04, UC-05, UC-06, UC-07 |

### CI Safety Nets — Frontmatter Name/File Alignment

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-22 | Given all `.claude/agents/*.md` files exist, when `npm test` runs, then each agent's `name` frontmatter field equals the file's basename without extension (e.g. file `developer-backend.md` → `name: developer-backend`); any mismatch fails the test with a message identifying the file | UC-08 |
| AC-23 | Given all `.claude/skills/**/SKILL.md` files exist, when `npm test` runs, then each skill's `name` frontmatter field (if present) equals the skill's containing folder name (e.g. `skills/implement-feature/SKILL.md` → `name: implement-feature`); any mismatch fails with a clear message | UC-08 |

### CI Safety Nets — No Orphan References

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-24 | Given `docs/reference.md`, `CLAUDE.md`, `CLAUDE.global.md`, and `.claude/workflows/*.js` are checked, when `npm test` runs, then any reference to a skill or agent name that does not correspond to an existing `.claude/skills/{name}/` folder or `.claude/agents/{name}.md` file fails the test with the referencing file and the missing name | – |

### Build Integrity

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-25 | Given all changes are applied, when `npm test` runs, then all existing tests (FTR-010 suite) continue to pass | – |

## 8. Dependencies & Assumptions

### External Dependencies
- **Node.js 20+ standard library:**
  - `fs` module for file operations
  - `path` module for path manipulation and cross-platform normalization
  - `crypto` module (already in use)
  - `readline` module for interactive prompts (already in use)
- **Cross-device move fallback:** `fs.renameSync` may fail with `EXDEV` on some systems; fallback uses `fs.cpSync` + `fs.unlinkSync`

### Technical Assumptions
- Manifest file location: `<destRoot>/.claude/.ai-toolkit-manifest.json`
  - For local installs: `<project-root>/.claude/.ai-toolkit-manifest.json`
  - For global installs: `~/.claude/.ai-toolkit-manifest.json` (manifest is one level inside `.claude/`)
- All new pure functions (`readManifest`, `writeManifest`, `computeOrphans`, `moveToTrash`) are exported via the `if (require.main === module)` guard in `bin/cli.js` (per AGENTS.md hard constraint)
- `NEVER_COPY` entries already filter settings files; `expandMappings` prevents them from being written to the manifest
- Trash folder path is always `<destRoot>/.claude/.ai-toolkit-trash/`; it is excluded from manifest via path prefix check in `writeManifest`
- Windows path normalization: `path.relative()` returns backslashes on Windows; all paths must be normalized with `.replace(/\\/g, '/')` before storage and after reading
- Agent `name` field is a required frontmatter field in all agent metadata files

### Feature Relationships
- Builds on **FTR-010** (installer base functionality); extends `bin/cli.js` and test infrastructure
- Precedes **FTR-012+** (future toolkit releases); establishes foundation for safe upgrades with manifest tracking

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should files the user declined to remove be re-shown on every subsequent install? Current design: yes — they remain as orphan candidates because they are still in old-manifest but not in new-file-set. This is intentional for consistency but could be noisy for persistent user declines. | Low | A future "ignore list" feature could suppress them, or users can manually delete from `.ai-toolkit-trash/` to confirm permanent removal. Accept current design; revisit in next iteration. |
| 2 | AC-23 (skill `name` == folder name check) is marked "Should". Skill SKILL.md files do not currently require `name` in frontmatter (per FTR-010). If `name` is absent, should the check pass (no mismatch)? If present, must it match? | Low | Confirm: check passes if `name` is absent; check passes if present and matches folder name; check fails if present and does NOT match. If unclear, defer AC-23 to next iteration (already in "Deferred" section of feature doc). |
| 3 | AC-24 (no-orphan-references cross-file check) is deferred. When scoped in a future iteration, decide whether to check prose inside `docs/procedures/` Markdown as well, or limit scanning to `docs/reference.md`, `CLAUDE.md`, `CLAUDE.global.md`, `.claude/workflows/*.js`. | Low | Limit initial scope to the four files named in the acceptance criterion to avoid false positives in free-form prose. Expand to `docs/procedures/` only if needed after initial release. |
