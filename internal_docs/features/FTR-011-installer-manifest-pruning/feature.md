# Installer Manifest and Orphan Pruning

## Feature ID
FTR-011

## Summary
Extends the AI Toolkit installer (`bin/cli.js`) with a manifest mechanism and a prune step.
On every install or update the installer writes `.claude/.ai-toolkit-manifest.json` — a
JSON record of every file it deposited at the destination. On the next install it reads
the previous manifest, computes which files are no longer shipped, and moves those orphans
into a recoverable backup folder (`.claude/.ai-toolkit-trash/`) rather than deleting them
permanently. This eliminates the silent accumulation of stale skill, agent, command, and
workflow artifacts caused by renames and deletions in the toolkit source, while remaining
safe in shared destinations (e.g. `~/.claude/`) where third-party files coexist. The
feature also extends `tests/frontmatter/` with two CI safety nets that catch half-done
renames at commit time before they ever reach a destination.

## Problem Statement
The installer copies files to a destination but never removes anything. A renamed skill
(e.g. `old-name` → `new-name`) leaves both copies at the destination. A deleted
skill/agent/command/workflow leaves the orphaned copy forever. The current version check
reads `.ai-toolkit-version` but records nothing about what was previously installed, so
there is no basis for detecting orphans. For global installs (`~/.claude/`) a blind wipe
is not safe because the folder is shared with skills and agents from other sources
(dataviz, tdd, research, user-authored). Any prune must touch only what this toolkit
placed — nothing else.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)

### First install (no previous manifest)
1. User runs `ai-toolkit` (local) or `ai-toolkit --global`.
2. `checkVersion` runs as today.
3. `runInstall` computes the file plan and copies NEW/MODIFIED files as today (SAME files
   are skipped).
4. After file copy, `writeManifest(destRoot, fileList)` writes
   `<destRoot>/.claude/.ai-toolkit-manifest.json` containing `version`, `installedAt`
   (ISO 8601), and `files` (array of forward-slash destination-relative paths).
   Path shape differs by install mode:
   - Local install example: `.claude/skills/foo/SKILL.md` (`.claude/` prefix present)
   - Global install example: `skills/foo/SKILL.md` (no `.claude/` prefix — global mappings
     map toolkit subdirectories directly into `~/.claude/{agents,skills,...}`, so paths
     relative to `destRoot = ~/.claude` have no `.claude/` segment)
5. `writeInstalledVersion` runs as today.
6. Install complete — no prune step (no old manifest to read).

### Reinstall / update (previous manifest exists)
1. User runs `ai-toolkit` or `ai-toolkit --global`.
2. `checkVersion` runs as today.
3. **Prune phase** — before copying files:
   a. `readManifest(destRoot)` reads the previous manifest; if absent returns empty file
      list (graceful first-run).
   b. `computeNewFileSet(mappings)` expands mappings to the current set of shipped
      destination-relative paths.
   c. `computeOrphans(oldFiles, newFiles)` = paths in `oldFiles` absent from `newFiles`.
   d. For each orphan path whose physical file exists at the destination, prepare a
      REMOVED entry. If the file was already manually deleted, skip silently.
   e. Display a REMOVED plan alongside the existing NEW/MODIFIED/SAME plan.
   f. Interactive mode: prompt per orphan ("Move to trash?") — same pattern as the
      existing per-file MODIFIED prompt. `--force`: move all orphans automatically
      without prompting.
   g. For each confirmed orphan: move the file into
      `<destRoot>/.claude/.ai-toolkit-trash/<same-relative-path>`, creating intermediate
      directories as needed. Never hard-delete.
      Note: `relativePath` is relative to `destRoot`, so the trash path mirrors the
      same shape as the manifest entry (no `.claude/` prefix for global installs).
4. `runInstall` copies NEW/MODIFIED files as today.
5. `writeManifest` writes the new manifest reflecting the current shipped file set
   (only files that were actually present in the source — same filter as `expandMappings`).
6. `writeInstalledVersion` runs as today.

### Edge cases
- Orphan file already manually deleted by user: skip silently (no prompt, no error).
- Orphan file is in `NEVER_COPY` (settings files): cannot happen — settings files are
  never written to the manifest in the first place.
- Backup folder (`.ai-toolkit-trash/`) is never tracked in the manifest and is never
  itself pruned.
- Corrupt / unparseable old manifest: treat as absent (empty file list), proceed with
  install, overwrite with new manifest.

## Out of Scope
- Hard deletion of orphaned files (`fs.unlinkSync`) — backup-to-trash only.
- Pruning `.ai-toolkit-trash/` itself (no auto-cleanup of the trash folder).
- Any changes to `settings.json` / `settings.local.json` — NEVER_COPY rule applies
  identically to prune; these files never appear in a manifest.
- The `install-toolkit/` skill directory — already excluded by the installer's
  NEVER_COPY / exclusion rules; no change.
- Pruning files not listed in the old manifest (only toolkit-placed files are ever
  touched).
- End-to-end / subprocess tests for the CLI entry points.
- Tracking which files were moved to trash in the new manifest (trash contents are
  invisible to the manifest).

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| No previous manifest (first install) | `readManifest` returns `{ files: [] }`; prune phase computes zero orphans; install proceeds normally |
| Previous manifest is corrupt JSON | Catch parse error; treat as `{ files: [] }`; log a dim warning; continue |
| Orphan file already manually deleted | Skip silently — no prompt, no error, not moved to trash |
| All orphans confirmed for trash (`--force` or all "y") | Files moved; REMOVED summary printed; new manifest written with current file set |
| User declines all orphan removals | Files left in place; new manifest still written (they will re-appear as orphans next time) |
| User partially declines (some "y", some "n") | Only confirmed orphans moved; declined orphans remain at destination |
| Trash directory does not yet exist | Created recursively on first use |
| Two consecutive installs, same version, no source changes | computeOrphans returns []; REMOVED plan shows 0 entries; no prompts shown |
| Global install — destination is `~/.claude/` shared with third-party files | Only files listed in old manifest are candidate orphans; third-party files are never candidates |
| Manifest `files` entry uses backslash paths (Windows legacy) | Normalize to forward slashes on read before comparison |

## Data Model
N/A — internal/technical feature

The manifest file is a configuration artefact, not a domain data store. Its schema:

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

All paths in `files` are relative to the destination root, using forward slashes.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

### Manifest write

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | No previous manifest at destRoot | `runInstall` completes on a fresh destination | `<destRoot>/.claude/.ai-toolkit-manifest.json` exists, is valid JSON, has `version` matching `package.json`, has `installedAt` as ISO 8601 string, has `files` array containing all destination-relative paths that were copied (forward slashes) | Must |
| AC-02 | An install has already written a manifest | A second install (same or different version) completes | The manifest is overwritten with the new file set; `version` and `installedAt` are updated | Must |

### Prune logic — core

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-03 | Old manifest lists `X`; new shipped set does not include `X`; `X` exists at dest | User confirms removal (interactive) | File is moved to `<destRoot>/.claude/.ai-toolkit-trash/X` (mirroring the relative path); original location no longer exists | Must |
| AC-04 | Old manifest lists `X`; new shipped set does not include `X`; `X` has already been manually deleted | Prune phase runs | No error, no prompt for `X`; it is silently skipped | Must |
| AC-05 | Old manifest lists `X`; `X` is still present in the new shipped set | Prune phase runs | `X` is NOT moved to trash; it is not shown in the REMOVED plan | Must |
| AC-06 | Old manifest is absent (first install) | Prune phase runs | Zero orphans computed; no REMOVED items shown; no prompts displayed | Must |
| AC-07 | Old manifest is corrupt JSON | Prune phase runs | Warning printed; treated as zero orphans; install continues normally; new manifest is written | Must |

### Prune logic — confirmation UX

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-08 | 3 orphans exist; interactive mode (no `--force`) | Prune phase runs | Each orphan triggers a per-file "Move to trash?" prompt (matching the MODIFIED "Overwrite?" pattern); files are only moved for orphans where user answers "y" | Must |
| AC-09 | 3 orphans exist; `--force` flag provided | Prune phase runs | All 3 orphans are moved to trash automatically; no prompts shown | Must |
| AC-10 | User declines all orphan prompts | Prune phase completes | No files moved; new manifest written regardless; summary shows "0 moved, N kept" | Must |

### Trash folder

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-11 | Orphan with relative path `R` is confirmed | File is moved | It lands at `<destRoot>/.claude/.ai-toolkit-trash/R`; intermediate directories created as needed. For local installs `R` = `.claude/skills/old-skill/SKILL.md`; for global installs `R` = `skills/old-skill/SKILL.md` (no `.claude/` prefix) | Must |
| AC-12 | Trash folder at `<destRoot>/.claude/.ai-toolkit-trash/` | Manifest is written | Trash folder contents are never listed in `files`; filter uses absolute path comparison (`path.join(destRoot, rel)` starts with trash dir), not a string-prefix on the relative path, because global-mode entries lack the `.claude/` prefix | Must |

### NEVER_COPY / settings safety

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-13 | `expandMappings` encounters `settings.json` or `settings.local.json` | Manifest is assembled | Those paths never appear in `files`; they are never prune candidates | Must |

### New pure functions — unit tests

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-14 | `readManifest` is called on a destRoot with no manifest | Test runs | Returns `{ files: [] }` | Must |
| AC-15 | `readManifest` is called on a destRoot with a valid manifest | Test runs | Returns the parsed object with correct `files` array | Must |
| AC-16 | `readManifest` is called on a destRoot whose manifest is corrupt JSON | Test runs | Returns `{ files: [] }` | Must |
| AC-17 | `writeManifest` is called with a file list | Test runs | File is written as valid JSON with correct `version`, `installedAt`, and `files` in forward-slash form | Must |
| AC-18 | `computeOrphans(['a','b','c'], ['b','c'])` | Test runs | Returns `['a']` | Must |
| AC-19 | `computeOrphans(['a','b'], ['a','b'])` | Test runs | Returns `[]` | Must |
| AC-20 | `computeOrphans([], ['a','b'])` | Test runs | Returns `[]` | Must |
| AC-21 | All new functions are exported via the `require.main` guard | `npm test` runs | Tests can import them from `../../bin/cli` | Must |

### CI safety nets — frontmatter name/file alignment

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-22 | All `.claude/agents/*.md` files exist | `npm test` runs | Each agent's `name` frontmatter field equals the file's basename without extension (e.g. file `developer-backend.md` → `name: developer-backend`); any mismatch fails the test with a message identifying the file | Must |
| AC-23 | All `.claude/skills/**/SKILL.md` files exist | `npm test` runs | Each skill's `name` frontmatter field (if present) equals the skill's containing folder name (e.g. `skills/implement-feature/SKILL.md` → `name: implement-feature`); any mismatch fails with a clear message | Should |

### CI safety nets — no orphan references

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-24 | `docs/reference.md`, `CLAUDE.md`, `CLAUDE.global.md`, and `.claude/workflows/*.js` are checked | `npm test` runs | Any reference to a skill or agent name that does not correspond to an existing `.claude/skills/{name}/` folder or `.claude/agents/{name}.md` file fails the test with the referencing file and the missing name | Should |

### Build integrity

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-25 | All changes are applied | `npm test` runs | All existing tests (FTR-010 suite) continue to pass | Must |

## MVP vs Deferred

### MVP (must ship)
- `readManifest(destRoot)` — reads and parses `.claude/.ai-toolkit-manifest.json`; returns `{ files: [] }` on absence or parse error
- `writeManifest(destRoot, fileList)` — writes manifest JSON with `version`, `installedAt`, `files` (forward-slash relative paths)
- `computeOrphans(oldFiles, newFiles)` — set difference; returns paths in old but not in new
- `moveToTrash(destRoot, relativePath)` — moves a file to `.claude/.ai-toolkit-trash/` mirroring relative path
- Prune step wired into `runInstall` before file copy: read old manifest, compute orphans, display REMOVED plan, confirm (interactive) or auto-move (`--force`), move confirmed orphans, write new manifest after copy
- Unit tests for all new pure functions in `tests/cli/`
- AC-22: agent `name` == filename check in `tests/frontmatter/agents.test.js`
- AC-25: all existing tests pass

### Deferred (next iteration)
- AC-23: skill `name` == folder name check (lower priority — skill SKILL.md files currently do not require a `name` field)
- AC-24: no-orphan-references cross-file check (higher engineering cost, risk of false positives on free-text prose)
- Trash auto-cleanup / eviction policy
- Manifest migration from installations older than this feature (pre-FTR-011 installs have no manifest; graceful handling already covered by AC-06)

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should files the user declined to remove be re-shown on every subsequent install (since they will always be in old-manifest but not in new-file-set)? Current design: yes — they stay as orphan candidates every time. This is intentional (consistent behavior) but could be noisy for persistent declines. A future "ignore list" could suppress them. | Low |
| 2 | AC-23 (skill `name` == folder) is marked Should. Skill SKILL.md files do not currently require `name` in frontmatter (see FTR-010 data model). If `name` is absent the check should pass (no mismatch). If `name` is present it must match. Confirm this interpretation is correct before implementing. | Low |
| 3 | AC-24 (no-orphan references) is deferred. When scoped, decide whether to check prose inside `docs/procedures/` Markdown files as well, or limit to the four files named above. | Low |

## Dependencies and Assumptions
- Node.js 20 stdlib only — `fs`, `path`, `crypto`, `readline` already in use; `fs.renameSync` or `fs.cpSync` + `fs.unlinkSync` for move-to-trash (cross-device fallback: copy then delete if `renameSync` throws `EXDEV`).
- Manifest file location: `<destRoot>/.claude/.ai-toolkit-manifest.json`. Both install
  modes use the same formula because `readInstalledVersion`/`writeInstalledVersion` already
  do `path.join(destRoot, '.claude', ...)`. For local installs `destRoot` is the project
  root (manifest at `<project>/.claude/.ai-toolkit-manifest.json`). For global installs
  `destRoot` is `~/.claude` (manifest at `~/.claude/.claude/.ai-toolkit-manifest.json`).
  This is consistent with how `.ai-toolkit-version` is stored — the version stamp for
  global installs is also at `~/.claude/.claude/.ai-toolkit-version`.
- **Path shape of manifest `files` entries differs between install modes:**
  - Local: paths are relative to `destRoot` (the project root) and include the `.claude/`
    prefix because local mappings copy into `<project>/.claude/`. Example:
    `.claude/agents/developer-backend.md`.
  - Global: `destRoot` is `~/.claude`; mappings copy toolkit subdirectories directly into
    `~/.claude/agents`, `~/.claude/skills`, etc. — not into `~/.claude/.claude/`. Paths
    relative to `destRoot` therefore have no `.claude/` prefix. Example:
    `agents/developer-backend.md`, `skills/implement-feature/SKILL.md`.
  - `runInstall` receives an explicit `destRoot` parameter (added by this feature) so
    `path.relative(destRoot, f.dest)` can be computed correctly in both modes.
- All new pure functions must be exported via the `if (require.main === module)` guard in `bin/cli.js` (AGENTS.md hard constraint).
- `NEVER_COPY` entries (`settings.json`, `settings.local.json`) never enter the manifest because `expandMappings` already filters them; no additional manifest-level filter is needed.
- The trash folder (`<destRoot>/.claude/.ai-toolkit-trash/`) must never appear in the
  manifest `files` array. `writeManifest` filters it by checking whether the full absolute
  path `path.join(destRoot, relativePath)` starts with the trash directory
  `path.join(destRoot, '.claude', '.ai-toolkit-trash')`. A string-prefix check on the
  `relativePath` alone is insufficient because global-mode entries lack the `.claude/`
  prefix and would never match `.claude/.ai-toolkit-trash/`.
- Cross-platform path handling: all paths stored in the manifest use forward slashes. On Windows, `path.relative()` returns backslashes; these must be normalized with `.replace(/\\/g, '/')` before storage and after read.
- AC-22 adds a new assertion inside the existing `describe.each` block in `tests/frontmatter/agents.test.js` — no new test file needed.
