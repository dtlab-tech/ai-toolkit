# Technical Specification — Installer Manifest and Orphan Pruning

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-011: Installer Manifest and Orphan Pruning |
| Version | 1.0 |
| Date | 2026-07-29 |
| Status | Draft |

---

## 1. Overview

FTR-011 extends the AI Toolkit installer (`bin/cli.js`) with persistent manifest tracking and orphan file recovery. On every install or update, the installer will:

1. Write `.claude/.ai-toolkit-manifest.json` — a JSON record of all files deposited at the destination
2. On subsequent installs, read the previous manifest and compute orphaned files (those no longer shipped)
3. Move orphans into a recoverable backup folder (`.claude/.ai-toolkit-trash/`) rather than leaving them accumulate silently
4. Introduce CI safety nets in `tests/frontmatter/` to catch half-done renames at commit time

This addresses the silent accumulation of stale skill, agent, command, and workflow artifacts caused by renames and deletions in the toolkit source. The approach is safe for shared destinations (e.g., `~/.claude/`) where third-party files coexist — only toolkit-placed files (those listed in the previous manifest) are ever touched.

---

## 2. Architecture

### 2.1 System Context

The installer is a Node.js CLI (`bin/cli.js`) that runs in two modes:
- **Local install**: copies toolkit files into a project's `.claude/`, `docs/`, and root directories
- **Global install**: copies toolkit files into `~/.claude/` for availability across all projects

Currently, the installer:
- Reads `TOOLKIT_VERSION` from `package.json`
- Checks the destination's `.claude/.ai-toolkit-version` to determine if an update is available
- Computes file deltas (NEW, MODIFIED, SAME) and prompts the user per MODIFIED file (unless `--force`)
- Writes the new version stamp after completion

The manifest feature extends this pipeline:
- **Before file copy**: read previous manifest, compute orphans, prompt per orphan, move to trash
- **After file copy**: write new manifest reflecting the current shipped file set

### 2.2 Component Diagram

```
CLI Entry (main / installLocal / installGlobal)
    ↓
checkVersion(destRoot) — reads .ai-toolkit-version, checks for update
    ↓
runInstall(label, mappings, force, destRoot) — signature extended; destRoot
    passed by caller (installLocal passes targetDir; installGlobal passes target)
    ├─ expandMappings() — computes source→dest file list
    ├─ categorize() — classifies files as NEW/MODIFIED/SAME
    ├─ [NEW] readManifest(destRoot) — reads previous manifest; returns { files: [] } if absent
    ├─ [NEW] computeOrphans() — set-difference: old \ new
    ├─ [NEW] moveToTrash(destRoot, rel) — moves orphan to <destRoot>/.claude/.ai-toolkit-trash/<rel>
    ├─ Copy NEW and MODIFIED files (existing logic)
    └─ [NEW] writeManifest(destRoot, fileList) — writes new manifest; filters trash entries by absolute path
    ↓
writeInstalledVersion(destRoot) — writes new version stamp
    ↓
checkSpawnDepth() — advisory check (unchanged)
```

### 2.3 Sequence Diagrams

**Happy path: reinstall with orphaned files (local install example)**

Note: path shape differs by install mode. Local entries have a `.claude/` prefix;
global entries do not (see section 3.1 Data Model for examples of both).

```
User runs `ai-toolkit` (local install, destRoot = <project>)
    ↓
checkVersion()
    ↓
runInstall(label, mappings, force, destRoot) → readManifest(destRoot)
    [old manifest: { files: ['.claude/skills/old-skill/SKILL.md', ...] }]
    ↓
expandMappings() → newFileSet = files.map(f => path.relative(destRoot, f.dest))
    [new set: ['.claude/skills/new-skill/SKILL.md', ...]]
    ↓
computeOrphans(oldFiles, newFiles)
    [orphans: ['.claude/skills/old-skill/SKILL.md']]
    ↓
Display REMOVED plan with 1 orphan
    ↓
Interactive or --force?
    ├─ Interactive: askConfirm("Move to trash?") per orphan
    │   [User answers 'y']
    │   ↓
    │   moveToTrash(destRoot, '.claude/skills/old-skill/SKILL.md')
    │   [file moved to <destRoot>/.claude/.ai-toolkit-trash/.claude/skills/old-skill/SKILL.md]
    │
    └─ --force: move all confirmed orphans without prompting
    ↓
Copy NEW and MODIFIED files
    ↓
writeManifest(destRoot, currentFileSet)
    [new manifest: { version, installedAt, files: [...] }]
    ↓
writeInstalledVersion()
    ↓
checkSpawnDepth()
    ↓
Install complete
```

---

## 3. Backend (Node.js CLI Module)

### 3.1 Data Model — Manifest Schema

Manifest file: `<destRoot>/.claude/.ai-toolkit-manifest.json`

Both install modes use this formula (`path.join(destRoot, '.claude', '.ai-toolkit-manifest.json')`), which mirrors the existing `readInstalledVersion`/`writeInstalledVersion` pattern. For global installs `destRoot = ~/.claude`, so the manifest lands at `~/.claude/.claude/.ai-toolkit-manifest.json`. This is consistent with the existing version stamp location (`~/.claude/.claude/.ai-toolkit-version`).

**Local install** — `files` entries include the `.claude/` prefix because local mappings
copy sources into `<project>/.claude/`:

```json
{
  "version": "0.7.0",
  "installedAt": "2026-07-29T10:00:00.000Z",
  "files": [
    ".claude/agents/developer-backend.md",
    ".claude/agents/developer-frontend.md",
    ".claude/skills/implement-feature/SKILL.md",
    ".claude/workflows/pm-phase1.js",
    "docs/procedures/generate-requirements.md",
    "CLAUDE.md"
  ]
}
```

**Global install** — `destRoot = ~/.claude`; mappings copy toolkit subdirectories directly into `~/.claude/agents`, `~/.claude/skills`, etc. Paths relative to `destRoot` therefore have no `.claude/` prefix:

```json
{
  "version": "0.7.0",
  "installedAt": "2026-07-29T10:00:00.000Z",
  "files": [
    "agents/developer-backend.md",
    "agents/developer-frontend.md",
    "skills/implement-feature/SKILL.md",
    "workflows/pm-phase1.js",
    "docs/procedures/generate-requirements.md",
    "CLAUDE.md"
  ]
}
```

**Fields:**
- `version` (string): TOOLKIT_VERSION from `package.json` at install time
- `installedAt` (string): ISO 8601 timestamp (e.g., `2026-07-29T10:00:00.000Z`)
- `files` (array of strings): destination-relative paths using forward slashes; never includes `.claude/.ai-toolkit-trash/` or `NEVER_COPY` entries

**Constraints:**
- All paths use forward slashes (even on Windows) for cross-platform consistency
- Paths are relative to the destination root
- The manifest itself (`.ai-toolkit-manifest.json`) is never listed in `files`

### 3.2 Pure Functions (New)

#### `readManifest(destRoot)`

Reads the previous manifest from `<destRoot>/.claude/.ai-toolkit-manifest.json`.

**Signature:**
```javascript
function readManifest(destRoot) {
  // Returns: { files: [] } | { version, installedAt, files: [...] }
}
```

**Behavior:**
- If manifest file does not exist: return `{ files: [] }`
- If manifest file exists but is invalid JSON: log dim warning, return `{ files: [] }`
- If manifest file exists and is valid JSON: return parsed object

**Error handling:**
- Gracefully handles missing or corrupt manifest (no throw; returns empty list)
- Logs a dim warning on parse error: "Previous manifest is corrupt; treating as empty"

#### `computeOrphans(oldFiles, newFiles)`

Computes set difference: files in `oldFiles` but not in `newFiles`.

**Signature:**
```javascript
function computeOrphans(oldFiles, newFiles) {
  // oldFiles: string[]  (paths from previous manifest)
  // newFiles: string[]  (expanded destination-relative paths from current mappings)
  // Returns: string[]   (paths in oldFiles absent from newFiles)
}
```

**Logic:**
- Convert both arrays to Sets
- Return array of entries in `oldFiles` not present in `newFiles`
- Case-sensitive; normalize forward slashes if input contains backslashes

**Examples:**
- `computeOrphans(['a', 'b', 'c'], ['b', 'c', 'd'])` → `['a']`
- `computeOrphans(['a', 'b'], ['a', 'b'])` → `[]`
- `computeOrphans([], ['a', 'b'])` → `[]`

#### `moveToTrash(destRoot, relativePath)`

Moves a file from its destination location to the trash folder, preserving relative path structure.

**Signature:**
```javascript
function moveToTrash(destRoot, relativePath) {
  // destRoot: string (destination root, e.g., '/home/user/project')
  // relativePath: string (e.g., '.claude/skills/old-skill/SKILL.md')
  // Side effect: moves file to .claude/.ai-toolkit-trash/ with same relative path
  // Throws: no exception (handles file-not-found gracefully)
}
```

**Behavior:**
- Source: `<destRoot>/<relativePath>`
- Destination: `<destRoot>/.claude/.ai-toolkit-trash/<relativePath>`
- Create intermediate directories as needed
- If source file does not exist: silently skip (no error, no log)
- If move operation succeeds: no log output (operation is silent on success)
- Use `fs.renameSync()` for same-device moves; on cross-device error (EXDEV), fall back to copy + delete:
  ```javascript
  try {
    fs.renameSync(source, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(source, dest);
      fs.unlinkSync(source);
    } else throw err;
  }
  ```

#### `writeManifest(destRoot, fileList)`

Writes the new manifest to `<destRoot>/.claude/.ai-toolkit-manifest.json`.

**Signature:**
```javascript
function writeManifest(destRoot, fileList) {
  // destRoot: string (destination root)
  // fileList: string[] (destination-relative paths, forward slashes)
  // Side effect: writes manifest.json with version, installedAt, files
}
```

**Behavior:**
- Create `.claude/` directory under `destRoot` if it does not exist
- Filter `fileList` to exclude any entry whose resolved absolute path falls under the
  trash directory. Use absolute path comparison, not a string prefix on the relative path:
  ```javascript
  const trashDir = path.join(destRoot, '.claude', '.ai-toolkit-trash');
  const filtered = fileList.filter(rel => {
    const abs = path.join(destRoot, rel);
    return !abs.startsWith(trashDir + path.sep) && abs !== trashDir;
  });
  ```
  A string-prefix check on `rel` alone (e.g., `rel.startsWith('.claude/.ai-toolkit-trash/')`)
  is incorrect for global installs where manifest entries lack the `.claude/` prefix.
- Build manifest object:
  ```javascript
  {
    version: TOOLKIT_VERSION,
    installedAt: new Date().toISOString(),
    files: filtered  // forward-slashed relative paths, trash excluded
  }
  ```
- Write as indented JSON (2-space) to `path.join(destRoot, '.claude', '.ai-toolkit-manifest.json')`
- Never throw; log error and continue if write fails

### 3.3 Integration into `runInstall()`

`runInstall` must receive an explicit `destRoot` parameter so that manifest paths, the
trash directory, and relative-path computation can all resolve correctly in both install
modes. The signature changes from `runInstall(label, mappings, force)` to
`runInstall(label, mappings, force, destRoot)`. Both callers (`installLocal` and
`installGlobal`) must be updated to pass their respective `destRoot` (local: `targetDir`;
global: `target` which equals `~/.claude`).

The expanded `runInstall(label, mappings, force, destRoot)` flow:

```javascript
async function runInstall(label, mappings, force, destRoot) {
  const files    = expandMappings(mappings);
  const entries  = categorize(files);
  
  const newFiles = entries.filter(e => e.status === 'new');
  const modified = entries.filter(e => e.status === 'modified');
  const same     = entries.filter(e => e.status === 'same');

  // ────────────────────────────────────────────────────────────────
  // NEW: Prune phase (before file copy)
  // ────────────────────────────────────────────────────────────────
  
  const oldManifest = readManifest(destRoot);  // { files: [] } or previous
  
  // Compute new file set from current mappings
  const newFileSet = files.map(f => path.relative(destRoot, f.dest)
    .replace(/\\/g, '/')
  );
  
  const orphans = computeOrphans(oldManifest.files, newFileSet);
  
  // Display REMOVED plan
  if (orphans.length > 0) {
    console.log(divider());
    console.log(`${bold('📦 Orphan cleanup')}`);
    for (const orphan of orphans) {
      const fullPath = path.join(destRoot, orphan);
      if (fs.existsSync(fullPath)) {
        console.log(`  ${clr('red', '∅')} ${clr('red', 'REMOVED')}  ${orphan}`);
      }
    }
    console.log(divider());
  }
  
  // Confirm orphans
  let removedCount = 0;
  for (const orphan of orphans) {
    const fullPath = path.join(destRoot, orphan);
    if (!fs.existsSync(fullPath)) continue;  // File already manually deleted
    
    let shouldMove = force;
    if (!force) {
      const rel = path.relative(process.cwd(), fullPath);
      shouldMove = await askConfirm(`  Move to trash  ${clr('red', rel)}?`);
    }
    
    if (shouldMove) {
      moveToTrash(destRoot, orphan);
      removedCount++;
      if (force) {
        console.log(`     ${clr('red', '∅')} ${dim(orphan)}`);
      } else {
        console.log(`     ${clr('green', '✔')} Moved to trash\n`);
      }
    }
  }
  
  if (orphans.length > 0) {
    console.log(divider());
    console.log(`  ${clr('red', `∅ Moved: ${removedCount}`)}  ${clr('gray', `↪ .claude/.ai-toolkit-trash/`)}\n`);
  }
  
  // ────────────────────────────────────────────────────────────────
  // Existing file copy phase (unchanged)
  // ────────────────────────────────────────────────────────────────
  
  console.log(`${bold('📦 Install plan')}  ${clr('gray', '→')}  ${clr('cyan', label)}`);
  console.log(divider());
  for (const e of newFiles)  console.log(`  ${clr('green',  '✚')} ${clr('green',  'NEW     ')}  ${dim(path.relative(process.cwd(), e.dest))}`);
  for (const e of modified)  console.log(`  ${clr('yellow', '~')} ${clr('yellow', 'MODIFIED')}  ${path.relative(process.cwd(), e.dest)}`);
  for (const e of same)      console.log(`  ${clr('gray',   '=')} ${clr('gray',   'SAME    ')}  ${dim(path.relative(process.cwd(), e.dest))}`);
  console.log(divider());
  console.log(
    `  ${clr('green', `✚ New: ${newFiles.length}`)}` +
    `  ${clr('yellow', `~ Modified: ${modified.length}`)}` +
    `  ${clr('gray', `= Unchanged: ${same.length}`)}`
  );
  console.log();

  for (const e of newFiles) {
    ensureDir(e.dest);
    fs.copyFileSync(e.src, e.dest);
  }

  // [existing MODIFIED conflict resolution logic — unchanged]
  
  // ────────────────────────────────────────────────────────────────
  // NEW: Write new manifest (after file copy)
  // ────────────────────────────────────────────────────────────────
  
  writeManifest(destRoot, newFileSet);
}
```

### 3.4 Module Exports

Update the export guard in `bin/cli.js` to include the new functions:

```javascript
if (require.main === module) {
  main();
} else {
  module.exports = {
    fileHash,
    walkDir,
    expandMappings,
    categorize,
    readInstalledVersion,
    NEVER_COPY,
    // New exports:
    readManifest,
    computeOrphans,
    moveToTrash,
    writeManifest,
  };
}
```

---

## 4. Testing Strategy

### 4.1 Unit Tests for Pure Functions

Create `tests/cli/readManifest.test.js`:
- Test: returns `{ files: [] }` when manifest file does not exist
- Test: returns parsed object when manifest exists and is valid JSON
- Test: returns `{ files: [] }` when manifest is corrupt JSON (with dim warning logged)
- Test: normalizes backslash paths to forward slashes (Windows compatibility)

Create `tests/cli/computeOrphans.test.js`:
- Test: `computeOrphans(['a','b','c'], ['b','c'])` → `['a']`
- Test: `computeOrphans(['a','b'], ['a','b'])` → `[]`
- Test: `computeOrphans([], ['a','b'])` → `[]`

Create `tests/cli/moveToTrash.test.js`:
- Test: file is moved from source to trash with relative path structure preserved
- Test: intermediate directories are created as needed
- Test: silently skips if source file does not exist
- Test: cross-device fallback (copy + delete) works on EXDEV error

Create `tests/cli/writeManifest.test.js`:
- Test: creates manifest file with correct JSON structure
- Test: includes `version`, `installedAt`, and `files` fields
- Test: normalizes paths to forward slashes
- Test: filters out paths starting with `.claude/.ai-toolkit-trash/`
- Test: creates `.claude/` directory if it does not exist

### 4.2 Frontmatter Validation Tests

**AC-22: Agent name ↔ filename check**

Add test to `tests/frontmatter/agents.test.js`:
```javascript
test('agent "name" field matches filename without extension', () => {
  const expectedName = file.replace(/\.md$/, '');
  expect(parsed.data.name).toBe(expectedName);
});
```

This runs against all agent `.md` files via `describe.each`.

### 4.3 Existing Test Compliance

All existing tests in `tests/cli/` and `tests/frontmatter/` must continue to pass. Run `npm test` after implementing all changes.

---

## 5. External Integrations

N/A — this feature is internal to the toolkit installer with no external API calls or service integrations.

---

## 6. Security Considerations

- **Input validation**: manifest JSON is read with error-safe parsing; corrupt manifests are treated as empty
- **Path traversal**: all destination paths are computed from mappings or existing file system; no user input is used to construct paths to move/delete
- **Permission safety**: on shared destinations (`~/.claude/`), only files listed in the previous manifest are ever candidates for trash; untracked third-party files are never touched
- **Atomic operations**: file moves use `fs.renameSync()` (atomic on same device) with fallback to copy + delete for cross-device moves
- **Silent failures**: if a file cannot be moved (permission error, filesystem error), the operation is logged as a warning but does not block the install

---

## 7. Database Changes

N/A — no database schema changes. The manifest is a configuration artifact stored as a JSON file.

---

## 8. Configuration

**Environment variables**: None required.

**Settings files**: 
- New manifest file location: `<destRoot>/.claude/.ai-toolkit-manifest.json`
- New trash folder: `<destRoot>/.claude/.ai-toolkit-trash/`
- Both locations are hardcoded and fixed

**Feature flags**: None.

---

## 9. File Inventory

### New files
| Path | Purpose |
|------|---------|
| `tests/cli/readManifest.test.js` | Unit tests for `readManifest()` |
| `tests/cli/computeOrphans.test.js` | Unit tests for `computeOrphans()` |
| `tests/cli/moveToTrash.test.js` | Unit tests for `moveToTrash()` |
| `tests/cli/writeManifest.test.js` | Unit tests for `writeManifest()` |

### Modified files
| Path | Change description |
|------|-------------------|
| `bin/cli.js` | Add `readManifest()`, `computeOrphans()`, `moveToTrash()`, `writeManifest()` functions; integrate prune phase into `runInstall()`; export new functions via guard |
| `tests/frontmatter/agents.test.js` | Add test assertion: agent `name` field must match filename (without `.md` extension) — AC-22 |

---

## 10. Implementation Order

1. **Implement pure functions in `bin/cli.js`** — depends on: nothing
   - Add `readManifest(destRoot)` with error-safe JSON parsing
   - Add `computeOrphans(oldFiles, newFiles)` with set-difference logic
   - Add `moveToTrash(destRoot, relativePath)` with cross-device fallback
   - Add `writeManifest(destRoot, fileList)` with filtering and formatting
   - Update module exports to include all four new functions

2. **Write unit tests for new functions** — depends on: 1
   - `tests/cli/readManifest.test.js` (test absence, valid JSON, corrupt JSON, backslash normalization)
   - `tests/cli/computeOrphans.test.js` (test set difference cases)
   - `tests/cli/moveToTrash.test.js` (test file move, directory creation, file-not-found, cross-device fallback)
   - `tests/cli/writeManifest.test.js` (test file write, JSON structure, path filtering, directory creation)

3. **Integrate prune phase into `runInstall()`** — depends on: 1
   - Extend signature to `runInstall(label, mappings, force, destRoot)`
   - Update `installLocal` caller: pass `targetDir` as `destRoot`
   - Update `installGlobal` caller: pass `target` (which equals `~/.claude`) as `destRoot`
   - Call `readManifest(destRoot)` before file copy
   - Compute `newFileSet` via `files.map(f => path.relative(destRoot, f.dest).replace(/\\/g, '/'))`
   - Call `computeOrphans()` to identify candidates
   - Display REMOVED plan (similar to NEW/MODIFIED/SAME format)
   - Prompt per orphan or auto-move with `--force`
   - Call `moveToTrash(destRoot, orphan)` for confirmed orphans
   - Call `writeManifest(destRoot, newFileSet)` after file copy

4. **Add agent name-check test** — depends on: nothing
   - Add test to `tests/frontmatter/agents.test.js`: agent `name` field must equal filename (without `.md`)
   - Ensure assertion message is clear for CI failure reporting

5. **Run full test suite and verify** — depends on: 2, 3, 4
   - Execute `npm test` to verify all tests pass
   - Verify no regressions in existing tests

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Corrupt manifest causes empty orphan list; stale files accumulate on next install | Medium | Gracefully treat corrupt manifest as `{ files: [] }`. Log dim warning. User can manually clean up or delete `.ai-toolkit-manifest.json` before reinstalling to reset. |
| Cross-device move (EXDEV) fails; user has no recovery path | Medium | Implement fallback: copy + delete. Log warning if fallback is used. Document fallback behavior in comments. |
| User manually deletes a file before prune phase runs; orphan check skips it silently | Low | Intended behavior (AC-04). File-not-found is silently skipped; no prompt, no error. Keeps UX clean. |
| Trash folder accumulates over time with no auto-cleanup | Low | Out of scope (deferred). Document in CLAUDE.md that users can manually delete `.claude/.ai-toolkit-trash/` when needed. Future policy can be added later. |
| Settings files (`settings.json`, `settings.local.json`) appear in manifest and are pruned | High | Impossible — `expandMappings()` already filters NEVER_COPY entries before they are added to manifest. No additional filter needed. Documented in Dependencies & Assumptions. |
| Agent rename results in both old and new files in destination until next install | Medium | AC-22 adds CI check: agent `name` field must match filename. Catches renames at commit time before they reach destinations. |
| Skill or agent reference in documentation points to non-existent file (orphan reference) | Low | AC-24 deferred. Cross-file validation is higher engineering cost with risk of false positives. Can be added in future iteration. For now, document that manual review of PRs is required. |
| Windows path backslashes in manifest prevent correct orphan detection | Medium | All paths stored with forward slashes. On read, backslashes are normalized. On write, paths from `path.relative()` are normalized with `.replace(/\\/g, '/')`. Documented in code. |
| Global-mode manifest entries have no `.claude/` prefix; trash filter using string-prefix on relative path silently passes trash entries into manifest | High | `writeManifest` uses absolute path comparison (`path.join(destRoot, rel).startsWith(trashDir)`) rather than a string prefix on the relative path. Covered by unit test in `writeManifest.test.js`. |
| Third-party files in global `~/.claude/` are accidentally touched | Critical | Only files listed in old manifest are orphan candidates. Third-party files are never in manifest, so never touched. Verified by design: `computeOrphans()` takes two explicit lists; global install manifest only includes toolkit-shipped files (paths relative to `~/.claude`, no `.claude/` prefix). |

---

## 12. Open Questions

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Should orphan files re-appear as removal candidates on every subsequent install if the user declines removal? | **Design decision: Yes**. Consistent behavior — orphans are re-shown every time until either (a) the user confirms removal, or (b) the file is recreated in the toolkit source. This is intentional (prevents silent accumulation) but can be noisy for persistent declines. Future: "ignore list" feature could suppress specific files. |
| 2 | AC-23 (skill `name` == folder) is marked Should, deferred. When implemented, should the check require `name` or treat its absence as a pass? | **Deferred to next iteration**. Skill SKILL.md files currently do not require `name` in frontmatter (FTR-010). Decision: if `name` is absent, the check passes (no mismatch). If `name` is present, it must match the folder name. Confirm with tech spec review before implementing. |
| 3 | AC-24 (no-orphan-references cross-file check) is deferred. When scoped, should the check include prose in `docs/procedures/` or only the four files named (reference.md, CLAUDE.md, CLAUDE.global.md, workflows)? | **Deferred to next iteration**. Likely limit to named files to avoid false positives on free-text prose. Clarify scope when feature is ready for implementation. |

---

## Acceptance Criteria Alignment

| AC ID | Requirement | Coverage |
|-------|-------------|----------|
| AC-01 | Manifest exists after first install | Unit test: `readManifest().test.js` (absence) + `writeManifest.test.js` (write structure) |
| AC-02 | Manifest is overwritten on subsequent install | Unit test: `writeManifest.test.js` (overwrite) |
| AC-03 | Orphan file is moved to trash | Unit test: `moveToTrash.test.js` (file move) |
| AC-04 | Manually deleted orphan is skipped | Unit test: `moveToTrash.test.js` (file-not-found silent skip) |
| AC-05 | File in new set is not moved | Integration: prune phase filters out files in `newFileSet` |
| AC-06 | No previous manifest → zero orphans | Unit test: `readManifest.test.js` (absence) |
| AC-07 | Corrupt manifest is gracefully handled | Unit test: `readManifest.test.js` (corrupt JSON) |
| AC-08 | Interactive: one prompt per orphan | Integration: `runInstall()` calls `askConfirm()` per orphan |
| AC-09 | --force: all orphans moved without prompts | Integration: `runInstall()` skips `askConfirm()` when `force=true` |
| AC-10 | User declines all prompts → no files moved, manifest written | Integration: `runInstall()` writes manifest regardless of confirmations |
| AC-11 | Orphan path structure mirrored in trash | Unit test: `moveToTrash.test.js` (directory structure) |
| AC-12 | Trash folder not in manifest | Unit test: `writeManifest.test.js` (filter `.ai-toolkit-trash/`) |
| AC-13 | NEVER_COPY files not in manifest | Unit test: integration into `expandMappings()` (already filtered) |
| AC-14–21 | Pure functions exported and unit-testable | Module exports guard updated; tests in `tests/cli/` |
| AC-22 | Agent name == filename check in CI | New test added to `tests/frontmatter/agents.test.js` |
| AC-23 | Skill name == folder check (deferred) | Not included in MVP |
| AC-24 | No-orphan-references check (deferred) | Not included in MVP |
| AC-25 | All existing tests pass | Run `npm test` after implementation |

