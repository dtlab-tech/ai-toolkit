# Technical Specification — Claude Source Layout and Runtime Resolution

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-015: Claude Source Layout and Runtime Resolution |
| Version | 1.0 |
| Date | 2026-08-12 |
| Status | Draft |

---

## 1. Overview

This feature eliminates structural ambiguity in the toolkit by migrating all versioned assets from `.claude/` (a protected, auto-discovered directory) to `src/claude/` (an unprotected source directory), moving test files to `tests/`, and introducing explicit runtime resolution. The result is cleaner development workflow (no permission fatigue), deterministic installation (via `lib/asset-catalog.js`), and coherent asset resolution (`resolveClaudeRuntimeAsset()` function with diagnostics command). This is a prerequisite for FTR-016, FTR-017, and FTR-018.

**Affected systems:**
- Directory structure: `.claude/` → `src/claude/` migration; test reorganization
- Installation process: local installer and global installer (`bin/cli.js`) updated to read from `src/claude/`
- Asset resolution: new `resolveClaudeRuntimeAsset()` function for runtime path lookup
- Diagnostics: new `doctor resolution` CLI command for provenance visibility
- Build/packaging: `package.json` `files[]` updated
- Development workflow: `npm run toolkit:dev-install-global` as explicit install point

---

## 2. Architecture

### 2.1 System Context

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Toolkit Repository (Development)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Versioned Source Tree                                    │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ src/claude/                   ← NEW: single source        │   │
│  │   ├── agents/                                            │   │
│  │   ├── commands/                                          │   │
│  │   ├── skills/                                            │   │
│  │   ├── workflows/                                         │   │
│  │   └── scripts/                                           │   │
│  │ lib/asset-catalog.js          ← NEW: authoritative list │   │
│  │ package.json (files: src/claude) ← UPDATED              │   │
│  │ bin/cli.js                    ← ENHANCED: installer     │   │
│  │   + resolveClaudeRuntimeAsset()  ← NEW function         │   │
│  │   + doctor resolution           ← NEW command           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Test Files (moved from .claude/scripts/tests)            │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ tests/                        ← NEW location             │   │
│  │   ├── cli/                                               │   │
│  │   └── frontmatter/                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ .claude/ (after migration — no versioned source here)    │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ .claude/settings.json      ← git rm --cached; not moved  │   │
│  │ .claude/.ai-toolkit-version← git rm --cached; gitignored │   │
│  │ .claude/settings.local.json← personal config; gitignored │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
       │                                    │
       │ npm pack (reads src/claude)       │
       │                                    │
       ↓                                    ↓
   ┌──────────────┐              ┌──────────────────┐
   │ npm Registry │              │ Local Install    │
   │              │              │ (/path/to/proj)  │
   │ @dtlabs/     │              │                  │
   │ ai-toolkit   │              │ .claude/ (via    │
   │ tarball      │              │  installer)      │
   │ (src/claude) │              │                  │
   └──────────────┘              └──────────────────┘
                                         │
                                         │ or global install
                                         ↓
                                  ~/.claude/ (home)
```

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolkit Source (Versioned)                                      │
├─────────────────────────────────────────────────────────────────┤
│ src/claude/agents/                                              │
│ src/claude/commands/                                            │
│ src/claude/skills/                                              │
│ src/claude/workflows/                                           │
│ src/claude/scripts/                                             │
│ lib/asset-catalog.js (categories, paths)                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ↓                 ↓
   ┌─────────────┐   ┌──────────────────────┐
   │   Local     │   │     Global           │
   │ Installer   │   │   Installer          │
   │             │   │                      │
   │ (bin/cli)   │   │   (bin/cli --global) │
   └──────┬──────┘   └──────────┬───────────┘
          │                     │
    Reads catalog         Reads catalog
    Copies to:           Copies to:
    <target>/.claude/    ~/.claude/
          │                     │
          ↓                     ↓
   ┌─────────────┐   ┌──────────────────────┐
   │  Local      │   │  Global              │
   │  Runtime    │   │  Runtime             │
   │  (.claude)  │   │  (~/.claude)         │
   │             │   │                      │
   │ Manifest    │   │ Manifest             │
   │ (metadata)  │   │ (metadata)           │
   └──────┬──────┘   └──────────┬───────────┘
          │                     │
          └────────────┬────────┘
                       │
                       ↓
        resolveClaudeRuntimeAsset()
        (detect mode, return path)
                       │
                       ↓
        Pipeline workflows / commands
        (access runtime assets)
```

### 2.3 Migration Sequence Diagram

```
Phase 1 (Inventory)
  ├─ List all .claude/ files
  ├─ Classify: runtime | test-only | personal-config | ambiguous
  └─ Hard stop on ambiguous → manual review

Phase 2 (Test migration)
  ├─ git mv .claude/scripts/tests/ → tests/
  ├─ Update import paths in test files
  ├─ Update jest.config.js
  └─ Run npm test (verify all tests pass)

Phase 3 (Runtime asset migration)
  ├─ git mv .claude/agents/ → src/claude/agents/
  ├─ git mv .claude/commands/ → src/claude/commands/
  ├─ git mv .claude/skills/ → src/claude/skills/
  ├─ git mv .claude/workflows/ → src/claude/workflows/
  ├─ git mv .claude/scripts/*.js → src/claude/scripts/
  └─ Verify all files present, none remain

Phase 4 (npm packaging)
  ├─ Update package.json: files: [src/claude, ...]
  ├─ npm pack --dry-run
  ├─ Verify tarball contents
  └─ Add regression test

Phase 5 (Installers & catalog)
  ├─ Create lib/asset-catalog.js
  ├─ Update bin/cli.js expandMappings() → read from catalog
  ├─ Replace isDistributable() checks
  ├─ Handle upgrade: move orphaned test files to trash
  └─ Update both local and global installer paths

Phase 6 (Runtime resolution)
  ├─ Add resolveClaudeRuntimeAsset({ projectDir, relativePath })
  ├─ Detect effective mode: local-only | global-only | both | none
  ├─ Return absolute path or raise explicit error
  └─ Add validation: completeness check via manifest

Phase 7 (Diagnostics command)
  ├─ Add bin/cli.js doctor resolution command
  ├─ Report: mode, paths, duplicates, inconsistencies, residuals
  ├─ No modifications (read-only)
  └─ Add unit tests

Phase 8 (Docs & dev workflow)
  ├─ Add npm run toolkit:dev-install-global script
  ├─ git rm --cached .claude/.ai-toolkit-version
  ├─ Add .ai-toolkit-version to .gitignore
  ├─ Update AGENTS.md, docs/reference.md, docs/installation.md
  └─ Run npm test (full regression)
```

---

## 3. Backend

### 3.1 Data Model

#### Asset Catalog (`lib/asset-catalog.js`)

**Module purpose:** Single source of truth for what asset categories exist, where their source files are, and where they are installed.

**Structure (CommonJS export):**
```javascript
// lib/asset-catalog.js
'use strict';

const ASSET_CATEGORIES = [
  {
    name: 'agents',
    sourceDir: 'src/claude/agents',
    runtimeDir: '.claude/agents',
    description: 'Agent definition files (.md with YAML frontmatter)',
  },
  {
    name: 'commands',
    sourceDir: 'src/claude/commands',
    runtimeDir: '.claude/commands',
    description: 'Slash command definition files',
  },
  {
    name: 'skills',
    sourceDir: 'src/claude/skills',
    runtimeDir: '.claude/skills',
    description: 'User-invocable skill directories with SKILL.md',
  },
  {
    name: 'workflows',
    sourceDir: 'src/claude/workflows',
    runtimeDir: '.claude/workflows',
    description: 'Claude Code Workflow orchestrator scripts (.js)',
  },
  {
    name: 'scripts',
    sourceDir: 'src/claude/scripts',
    runtimeDir: '.claude/scripts',
    description: 'Utility and helper scripts',
  },
];

function getAssetCategories() {
  return ASSET_CATEGORIES;
}

function getCategoryByName(name) {
  return ASSET_CATEGORIES.find(cat => cat.name === name) || null;
}

if (require.main === module) {
  // CLI: list categories
  console.log(JSON.stringify(ASSET_CATEGORIES, null, 2));
} else {
  module.exports = {
    getAssetCategories,
    getCategoryByName,
    ASSET_CATEGORIES,
  };
}
```

**Properties:**
- `name` (string): category identifier (agents, commands, skills, workflows, scripts)
- `sourceDir` (string): path relative to repository root where source files live
- `runtimeDir` (string): path relative to installation root where files are copied
- `description` (string): human-readable explanation

**Constraints:**
- Each category must have exactly one source directory and one runtime destination
- All paths use forward slashes (normalized on Windows)
- No trailing slashes
- Source directories must exist and contain files (validated by tests)
- Runtime directories are created by the installer; not pre-existing

#### Installation Manifest (`<target>/.claude/.ai-toolkit-manifest.json`)

**Purpose:** Record which files were installed, for upgrade/orphan detection.

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
- `version` (string): toolkit/installer version at install time
- `installedAt` (ISO 8601 string): installation timestamp
- `installationMode` (enum): "local" or "global"
- `files` (array of strings): destination-relative paths (forward-slash normalized)

**Notes:**
- Manifest is written after successful installation
- Used by upgrade path to detect orphaned files (files in old manifest but not in new install plan)
- Never includes test files, personal configuration, or documentation
- Files moved to trash are removed from the manifest (filtered during write)

#### Upgrade Trash (`<target>/.claude/.ai-toolkit-trash/`)

**Purpose:** Recoverable staging area for files that are no longer shipped.

**Behavior:**
- On upgrade, if a file appears in the old manifest but not in the new install plan, it is moved here (not deleted)
- User can manually recover files if needed
- Trash directory itself is git-ignored and not tracked
- Files older than N days (deferred feature) could be auto-cleaned, but for now they accumulate

**Example:** If an old version shipped `.claude/scripts/tests/example.test.js` and the new version doesn't, the file is moved to `.claude/.ai-toolkit-trash/scripts/tests/example.test.js` with a timestamp suffix (if collision).

### 3.2 Catalog-Driven Installer Logic

**Updated `bin/cli.js` flow:**

Current state (FTR-014):
- `expandMappings()` reads from hardcoded mappings
- `isDistributable()` filters test and non-distributable files

New state (FTR-015):
- `expandMappings()` reads asset categories from `lib/asset-catalog.js`
- Constructs mappings programmatically: `{ src: catalog.sourceDir, dest: catalog.runtimeDir }`
- `isDistributable()` is **REPLACED by catalog membership and REMOVED**; the catalog positive list is the sole authority for what is distributed — no exclusion lists
- Both local and global installers use the same catalog and the same destination formula: `path.join(installRoot, category.runtimeDir)`, where `installRoot` is the project root (local) or the user home directory (global)
- **`src/claude/` purity guard (fail-fast):** because the catalog is directory-level, a future file added to `src/claude/scripts/tests/foo.test.js` would be recursively copied into the `scripts` category payload. The installer (and `npm pack`) MUST run a purity check before any copy or packaging:
  - Reject any file under `src/claude/` matching: `*.test.js`, or located in a `tests/`, `fixtures/`, `mocks/`, or `helpers/` directory
  - On violation: RAISE ERROR listing the offending files; abort the install/pack
  - This guard runs before any file copy and is not replaceable by regression tests alone
  - **Single implementation:** The guard logic lives in a single `validatePurityGuard(sourceDir)` function in `bin/cli.js`, exported via the `require.main` guard. It is called from two places: (1) directly by the installer as a Node.js function call before the first file copy, and (2) by the `validate-purity` CLI command invoked via the `prepack` lifecycle hook. No duplicate implementation is allowed.
  - **Linking to `npm pack` via `prepack` lifecycle hook:** Add to `package.json`:
    ```json
    "toolkit:validate-purity": "node bin/cli.js validate-purity",
    "prepack": "npm run toolkit:validate-purity"
    ```
    The `prepack` hook runs automatically before `npm pack` and `npm publish`. If it exits non-zero, the pack is aborted before any tarball is created. This is the primary mechanism ensuring test files cannot appear in the distributed package.
  - **Guard behavior:** `validatePurityGuard(sourceDir)` scans `sourceDir` recursively and does NOT modify or delete any file on violation. It returns a list of offending paths (Node API) or exits non-zero (CLI).

**Pseudocode:**
```javascript
// bin/cli.js — installer mapping update
const { getAssetCategories } = require('../lib/asset-catalog'); // lib/ is a sibling of bin/

function getInstallerMappings(installMode, targetDir) {
  const categories = getAssetCategories();
  const packageRoot = path.join(__dirname, '..');

  // Single formula for both modes:
  //   local:  installRoot = targetDir     → dest = <target>/.claude/agents  (runtimeDir = '.claude/agents')
  //   global: installRoot = homedir       → dest = <homedir>/.claude/agents
  const installRoot = installMode === 'local'
    ? targetDir
    : require('os').homedir();

  return categories.map(cat => ({
    src: path.join(packageRoot, cat.sourceDir),
    dest: path.join(installRoot, cat.runtimeDir), // destination defined exactly once, in the catalog
  }));
}
```

### 3.3 Runtime Asset Resolution

#### Function: `resolveClaudeRuntimeAsset()`

**Purpose:** Given a project directory and a relative asset path, return the absolute path to the asset, ensuring the effective runtime installation (local or global) is complete and unambiguous.

**Signature:**
```javascript
function resolveClaudeRuntimeAsset({ projectDir, relativePath }) {
  // Returns: absolute path string
  // Throws: explicit error with diagnostics on ambiguity or incompleteness
}
```

**Parameters:**
- `projectDir` (string): path to the target project directory
- `relativePath` (string): path to the asset relative to `.claude/`, e.g., `agents/agent-name.md` or `scripts/wb-validate.js`

**Returns:**
- On success: absolute path to the asset (string)
- On error: throws `Error` with detailed message including:
  - Detected mode (local-only, global-only, both, or none)
  - Paths to both installations if both exist
  - Missing files or manifest inconsistencies if detected

**Algorithm (six phases: input validation, detection, mode, metadata validation, completeness, return):**

The algorithm separates detection (is something installed?) from validity (is the metadata sound?)
from completeness (is the payload full?). This prevents a corrupt manifest from masking a real
installation — presence is established by evidence, not by metadata quality.

```
Define:
  localRuntimeRoot  = path.join(projectDir, '.claude')    // e.g. /proj/.claude
  globalRuntimeRoot = path.join(os.homedir(), '.claude')  // e.g. /home/user/.claude

  catRelDir(cat) = cat.runtimeDir.replace(/^\.claude\//, '')
    // strips the '.claude/' prefix because runtimeRoot already ends at '.claude'
    // e.g. '.claude/agents' → 'agents'

──── PHASE 0: Validate inputs (before any filesystem access) ───────────────────

0a. Reject if relativePath is null, undefined, or empty string
    → RAISE ERROR "relativePath must be a non-empty string"
0b. Reject if relativePath contains null bytes (\0)
    → RAISE ERROR "relativePath must not contain null bytes"
0c. Normalize path separators: relativePath = relativePath.replace(/\\/g, '/')
0d. Reject if relativePath is an absolute path:
    - Starts with '/' → RAISE ERROR "relativePath must be relative (got Unix absolute path)"
    - Matches /^[A-Za-z]:[/\\]/ → RAISE ERROR "relativePath must be relative (got Windows absolute path)"
0e. Reject if any segment equals '..': split('/').includes('..')
    → RAISE ERROR "relativePath must not contain path traversal (..)"
(Steps 0a-0e execute before effectiveRoot is known; no filesystem access in Phase 0.)

──── PHASE A: Detect presence (independent of metadata validity) ───────────────

A toolkit installation is PRESENT at a runtimeRoot if ANY of the following hold:
  (a) .ai-toolkit-manifest.json EXISTS at path.join(runtimeRoot, '.ai-toolkit-manifest.json')
      File existence is the criterion — the content may be corrupt; presence is still established
  (b) .ai-toolkit-version EXISTS at path.join(runtimeRoot, '.ai-toolkit-version')
  (c) Catalog payload check: at least one category in getAssetCategories() has a directory
      at path.join(runtimeRoot, catRelDir(cat)) that contains one or more files

settings.json alone → does NOT satisfy (a), (b), or (c) → NOT present
settings.local.json alone → does NOT satisfy (a), (b), or (c) → NOT present
Empty .claude/ directory → does NOT satisfy (a), (b), or (c) → NOT present

1. localPresent  = condA(localRuntimeRoot) || condB(localRuntimeRoot) || condC(localRuntimeRoot)
2. globalPresent = condA(globalRuntimeRoot) || condB(globalRuntimeRoot) || condC(globalRuntimeRoot)

──── PHASE B: Decide effective mode ───────────────────────────────────────────

3. !localPresent && !globalPresent → RAISE ERROR "No toolkit installation found."
4. localPresent && globalPresent → RAISE ERROR
   "Ambiguous: toolkit installations detected at both <localRuntimeRoot> and
    <globalRuntimeRoot>. The error is raised even if one installation has corrupt
    metadata — presence is established regardless of metadata validity."
5. effectiveRoot = localPresent ? localRuntimeRoot : globalRuntimeRoot
   effectiveMode = localPresent ? 'local' : 'global'

Canonical examples:
  .claude/ has only settings.local.json; global toolkit installed
    → condA/B/C all false for local → localPresent=false → global-only ✓
  .claude/ has corrupt manifest + full agent payload; global valid
    → condA true (manifest file exists), condC true (agents present) for local
    → localPresent=true; globalPresent=true → RAISE ERROR (mixed) ✓

──── PHASE C: Validate metadata ──────────────────────────────────────────────

Metadata validation produces warnings, not errors. Errors only arise from completeness
failures (Phase D) or the requested asset being absent (Phase E).

6. manifestPath = path.join(effectiveRoot, '.ai-toolkit-manifest.json')
   a. Absent: WARN "No manifest found; installation may be manual or manifest was lost"
   b. Present, not valid JSON: WARN "Manifest is corrupt (invalid JSON) at <manifestPath>"
   c. Present, parseable, missing required fields (version | installedAt | installationMode | files):
      WARN "Manifest schema invalid: missing fields <list>"
   d. Present, schema valid, installationMode ≠ effectiveMode:
      WARN "Manifest installationMode='<value>' mismatches effective mode '<effectiveMode>'"
   e. Extra entries (files in manifest.files mapped to catalog but not in expectedPayload):
      WARN "Manifest has <N> stale entries not in current catalog: <list>"

7. versionStampPath = path.join(effectiveRoot, '.ai-toolkit-version')
   a. Absent: WARN "No version stamp at <path>"
   b. Present: compare stampVersion with resolverVersion (from package.json of running toolkit)
      - Match: OK
      - Mismatch: WARN "Version mismatch: installed=<stamp>, resolver=<pkg>;
                  run toolkit:dev-install-global to update"

──── PHASE D: Validate completeness ──────────────────────────────────────────

8. Derive expectedPayload:
   For each category in getAssetCategories():
     Enumerate all files under path.join(packageRoot, category.sourceDir)
     For each file: runtimePath = path.join(effectiveRoot, catRelDir(cat), relativeFileName)
   expectedPayload = Set of all runtimePath values

8a. Verify requested asset is a catalog member:
    absoluteRequested = path.resolve(path.join(effectiveRoot, relativePath))
    If absoluteRequested ∉ expectedPayload → RAISE ERROR
    "Requested asset '<relativePath>' is not a registered catalog asset (mode: <effectiveMode>).
     Only toolkit-installed catalog assets may be resolved; arbitrary files under .claude/ are
     not resolvable via this function."
    This check prevents resolution of files that exist on disk but were not installed by the
    toolkit (e.g., user-created files, leftover test files).

9. If manifest has valid schema: compare expectedPayload with manifest.files (absolutized):
   - f in expectedPayload but not in manifest.files: WARN "Expected asset missing from manifest: <f>"
   (This is a manifest-staleness warning, not an error; the disk check in step 10 is authoritative)

10. missing = [ f ∈ expectedPayload | !fs.existsSync(f) ]
    If missing.length > 0: RAISE ERROR
    "Installation incomplete (<effectiveMode>). Missing files:\n  <list>\nRun the installer."
    A stale manifest cannot suppress this error — disk truth is the only authority.

──── PHASE E: Return path ─────────────────────────────────────────────────────

11. absolutePath = path.resolve(path.join(effectiveRoot, relativePath))
    // effectiveRoot = runtimeRoot = '<project>/.claude' or '<homedir>/.claude'
    // relativePath is relative to .claude/, e.g., 'scripts/wb-validate.js'
    // → no '.claude' duplication in the result

11a. Verify confinement (belt-and-suspenders check after normalization):
    resolvedRoot = path.resolve(effectiveRoot)
    If !absolutePath.startsWith(resolvedRoot + path.sep) AND absolutePath !== resolvedRoot
      → RAISE ERROR "Resolved path escapes installation root (confinement violation)"
    (Phase 0 prevents traversal, but this check catches edge cases introduced by OS-level
    path normalization on Windows or symlink resolution.)

12. !fs.existsSync(absolutePath) → RAISE ERROR
    "Asset not found at <absolutePath> (mode: <effectiveMode>)"
13. Return absolutePath (string)
```

**Error scenarios:**

| Scenario | Error Message (content) |
|----------|------------------------|
| Both local and global installed | "Ambiguous runtime installation: both local (.../proj/.claude) and global (~/.claude) detected. Please choose one mode or uninstall the unused one." Includes list of agents/scripts if different versions detected. Includes detected mode. |
| Neither local nor global installed | "No runtime installation found. Run 'npm run toolkit:dev-install-global' to install globally, or the installer in your project." |
| Requested asset missing from effective mode | "Asset not found: {mode} installation detected but {relativePath} is missing from {full-path}. Check manifest or run the installer again." |
| Manifest corrupt or incomplete | "Installation incomplete: manifest detected but integrity check failed. Missing: {list}. Run the installer to repair." |
| Invalid relativePath (empty, absolute, traversal, null bytes) | "Invalid relativePath: {specific reason}" — raised in Phase 0 before any filesystem access |
| Non-catalog asset requested | "Requested asset '{relativePath}' is not a registered catalog asset (mode: {mode}). Only toolkit-installed catalog assets may be resolved." |
| Confinement violation | "Resolved path escapes installation root (confinement violation)" — raised as belt-and-suspenders check in Phase E |

**Integration status (deferred):**

`resolveClaudeRuntimeAsset()` is implemented and exported as a Node.js API in `bin/cli.js`
via the standard `require.main` guard. Integration into pipeline workflow scripts
(pm-phase1.js, pm-phase2.js, pm-phase3.js, etc.) is **deferred to subsequent features
(FTR-016/017/018)**. Workflow scripts execute in a sandboxed context where `require` is
not available. No usage example is provided here; the function is added now as a stable
API surface so that future integration does not need to change `bin/cli.js`.

### 3.4 Diagnostics Command

#### Command: `node bin/cli.js doctor resolution --project <dir>`

**Purpose:** Provide human-readable diagnostics of runtime installation mode, asset resolution, and potential conflicts without modifying anything.

**Invocation:**
```bash
node bin/cli.js doctor resolution --project .
# or in a script:
node <toolkit-root>/bin/cli.js doctor resolution --project <project-dir>
```

**Output structure:**
```
╔════════════════════════════════════════════════════════════════════╗
║          Claude Runtime Resolution Diagnostics                    ║
╚════════════════════════════════════════════════════════════════════╝

Toolkit Source
──────────────
  Repository root: /absolute/path/to/toolkit/repo
  Source directory: /absolute/path/to/toolkit/repo/src/claude

Installation Detection
──────────────────────
  Local runtime present:  ✔ <project-dir>/.claude/
  Global runtime present: ✔ ~/.claude/ (or ~/.claude version X)

Effective Runtime Mode
──────────────────────
  Mode: local-only | global-only | both | none
  Status: VALID | AMBIGUOUS | INCOMPLETE | NOT INSTALLED

Runtime Inventory (if present)
──────────────────────────────
  Agents:    [count] files
  Commands:  [count] files
  Skills:    [count] files
  Workflows: [count] files
  Scripts:   [count] files

Version Stamps
──────────────
  Toolkit source version: 0.10.1 (from package.json)
  Local installed version: 0.10.1 (from .claude/.ai-toolkit-version)
  Global installed version: 0.10.1 (from ~/.claude/.ai-toolkit-version)
  Match: ✔ | ✖ (version mismatch)

Duplicate Agents (if local and global both present)
────────────────────────────────────────────────────
  [Agent name]: local version 0.10.1 ≠ global version 0.10.0
  [Agent name]: versions match ✔

Manifest Consistency
────────────────────
  Local manifest:
    File: <project-dir>/.claude/.ai-toolkit-manifest.json
    Status: present | missing | corrupt
    File count: N
    Integrity: ✔ | ✖ (details)
  
  Global manifest:
    File: ~/.claude/.ai-toolkit-manifest.json
    Status: present | missing | corrupt
    File count: N
    Integrity: ✔ | ✖ (details)

Residual Versioned Assets in .claude/
──────────────────────────────────────
  Found: (no residuals) | [list of files]
  Status: CLEAN | WARNING (assets that should be under src/claude/)

Action Items
────────────
  • (if ambiguous) Choose one: delete local or global installation
  • (if incomplete) Run 'npm run toolkit:dev-install-global' or installer
  • (if residuals) These should have been migrated to src/claude/
  • (if clean) ✔ runtime ready for pipelines

Summary
───────
Status: READY | PROBLEMATIC
Recommendation: (specific next step)

═══════════════════════════════════════════════════════════════════════
```

**Implementation notes:**
- Read-only: no file modifications
- Handles missing files gracefully (reports "not found" instead of throwing)
- Compares agent/script content hashes if versions are different
- Reports both local and global paths for clarity
- Suggests actionable remediation

---

### 3.5 CLI Facade — `ai-toolkit` npm Bin Commands

**npm bin registration:** `package.json` registers the `ai-toolkit` executable:
```json
"bin": {
  "ai-toolkit": "bin/cli.js"
}
```

#### Availability model — Rule A (definitive contract)

The `ai-toolkit` global binary on PATH is a **mandatory prerequisite** for the workflow runtime,
regardless of whether the asset installation is local or global.

- A local asset installation (assets in `<project>/.claude/`) still requires the global
  `ai-toolkit` binary; workflows invoke `ai-toolkit run-asset`, `ai-toolkit list-assets`, etc.
- Consumer projects must run `npm install -g @dtlabs/ai-toolkit` once per machine.
- `npx ai-toolkit` is **explicitly prohibited** during workflow execution because npx may
  trigger a network download if the version is not cached. Workflows must use the on-PATH binary.

| Environment | Invocation | Notes |
|-------------|-----------|-------|
| Workflow runtime | `ai-toolkit ...` | Binary on PATH; mandatory prerequisite |
| One-time machine setup | `npm install -g @dtlabs/ai-toolkit` | Not repeated per project |
| Toolkit repository (development) | `node bin/cli.js ...` | Uses local source directly |
| Tests (E2E) | `node <cliPath> ...` via `execFileSync` | Uses `process.execPath` as Node binary |

**Error if binary not found:** Any workflow invocation must fail immediately with:
"ai-toolkit binary not found; run 'npm install -g @dtlabs/ai-toolkit' to install."

#### stdout/stderr/exit-code semantics — three-tier model (all commands)

The same model applies to `resolve-asset`, `list-assets`, and `run-asset` resolution output:

| Tier | Condition | stdout | stderr | Exit |
|------|-----------|--------|--------|------|
| 1. Coherent | Installation valid, no warnings | Path (or JSON list) only | Empty | 0 |
| 2. Usable-with-warnings | Metadata warnings (Phase C) | Path (or JSON list) | Warning text | 0 |
| 3. Error | Resolution failed | Empty (`""`) | Error diagnostics | 1 |

`run-asset` keeps child stdout/stderr separate: resolution diagnostics (if any) appear on
stderr before the child process runs; the child's own stdout/stderr are then streamed normally.

#### `resolve-asset` command

Resolves a runtime asset path using the six-phase algorithm (§3.3).

**Command:**
```bash
ai-toolkit resolve-asset --project <project-dir> <relative-path> [--home <home-dir>]
```

**Parameters:**
- `--project <project-dir>`: target project directory (required)
- `<relative-path>`: path relative to `.claude/`, e.g., `scripts/wb-validate.js` (required; validated per Phase 0)
- `--home <home-dir>`: override `os.homedir()` for global lookup (optional; used in tests to isolate from real `~/.claude/`)

**I/O contract (three-tier model above):**
- Tier 1: exit 0, stdout = single absolute path line, stderr = ""
- Tier 2: exit 0, stdout = single absolute path line, stderr = warning text
- Tier 3: exit 1, stdout = "", stderr = error message

#### `run-asset` command

Resolves and executes a runtime asset in a single invocation. Preferred for workflow scripts
because it avoids shell command substitution syntax.

**Command:**
```bash
ai-toolkit run-asset --project <project-dir> <relative-path> [--home <home-dir>] -- [args...]
```

**Parameters:**
- `--project <project-dir>`: target project directory (required)
- `<relative-path>`: path relative to `.claude/`, e.g., `scripts/wb-validate.js` (required; validated per Phase 0)
- `--home <home-dir>`: override `os.homedir()` (optional; used in tests)
- `-- [args...]`: arguments forwarded as separate array elements to the executed script

**Security constraints (execution policy):**
- **Execution scope:** `run-asset` can ONLY execute assets from the `scripts` catalog category
  (runtimeDir = `.claude/scripts`). Any resolved path outside the `scripts` category is rejected
  before execution — including agent definitions (`.md` files), commands, skills, and workflows.
- **Allowed extensions:** The resolved file must have an explicitly allowed extension. Defined
  list: `.js`. All other extensions (`.md`, binaries, etc.) are rejected.
- **Process execution:**
  ```javascript
  spawnSync(process.execPath, [resolvedPath, ...forwardedArgs], {
    stdio: 'inherit',
    shell: false,   // MANDATORY — must be false; no shell string expansion
  });
  ```
  `shell: false` is mandatory. No command concatenation. No shell interpolation. Arguments
  are passed as separate array elements, not as a shell string.
- **Argument forwarding:** Arguments after `--` are parsed into an array and forwarded as
  individual `argv` elements. A path or argument containing spaces is passed correctly on
  both Windows and Unix because no shell concatenation occurs.
- **Exit code:** Propagated from the child process (`spawnSync.status`). If the child is killed
  by a signal (`status === null`), exit with code 1 and write the signal name to stderr.
- **Spawn errors:** If `spawnSync` fails (ENOENT, EACCES, etc.), exit 1 and write the
  system error message to stderr.

**I/O contract:**
- Resolution diagnostics (Phase C warnings, if any) appear on stderr before child execution
- Child's own stdout is streamed to the caller's stdout
- Child's own stderr is streamed to the caller's stderr
- Exit code: propagated from child; exit 1 on resolution failure or spawn error

#### `list-assets` command

Returns all installed runtime assets for a catalog category as a machine-readable list.
This is the definitive command used by `am-phase1.js` to enumerate available agents.

**Command:**
```bash
ai-toolkit list-assets --project <project-dir> --category <category-name> [--home <home-dir>] [--format json|plain]
```

**Parameters:**
- `--project <project-dir>`: target project directory (required)
- `--category <category-name>`: catalog category name (e.g., `agents`) (required)
- `--home <home-dir>`: override `os.homedir()` (optional; used in tests)
- `--format json|plain`: output format (default: `json`)

**I/O contract (three-tier model above):**
- Tier 1/2 exit 0: JSON array of absolute paths sorted lexicographically, followed by newline.
  On empty category: `[]`. Example: `["/home/user/.claude/agents/bar.md","/home/user/.claude/agents/foo.md"]`
- Tier 1: stderr empty; Tier 2: warnings on stderr
- Tier 3: exit 1, stdout = "", stderr = error message
- `--format plain`: one absolute path per line, sorted; empty output for empty category
- Unknown `--category` value: exit 1, stderr = "Unknown category: <name>"
- Empty category (category in catalog but no files installed): exit 0, stdout = `[]`

**Deterministic ordering:** Paths sorted by `Array.prototype.sort()` (lexicographic order) before
output. Ordering is stable and reproducible across platforms.

**Use in `am-phase1.js` (via `agent()`):**

am-phase1.js uses `agent()` for its Discovery phase — the workflow runtime does not expose
`spawnSync`, `require`, `child_process`, or `__dirname`. am-phase1.js does NOT spawn
`list-assets` directly. Instead, the Discovery agent's prompt instructs the agent to:

1. Run `ai-toolkit list-assets --project <projectDir> --category agents --format json`
2. Parse the returned JSON array as the definitive list of installed agent asset paths
3. Read exclusively the frontmatter of each listed path
4. Return the structured DISCOVERY_SCHEMA result

No free scan of `.claude/agents/` takes place. No command substitution (`$(...)`) is used.
The workflow receives the structured agent result and proceeds. `spawnSync`, `require`,
`child_process`, `path`, and `__dirname` are absent from am-phase1.js.

#### Cross-platform notes

- All resolved paths are absolute and use the OS-native path separator
- Because `run-asset` uses `spawnSync` with `shell: false`, paths and arguments containing
  spaces are passed correctly on both Windows and Unix without additional quoting

#### Unit tests

**`tests/cli/resolve-asset-cli.test.js`:**

| Test | Scenario | Expected |
|------|----------|---------|
| Tier 1: exits 0, stdout = path, stderr empty | Coherent single installation | stdout = path; stderr = ""; exit 0 |
| Tier 2: exits 0, stdout = path, warnings on stderr | Version mismatch | stdout = path; stderr = warning; exit 0 |
| Tier 3: exits 1, stdout empty | No installation | stderr = error; stdout = ""; exit 1 |
| Tier 3: exits 1, stdout empty | Both installations present | stderr = ambiguous error; exit 1 |
| Rejects non-catalog asset | File exists but not in catalog | exit 1; stderr contains "not a registered catalog asset" |
| Rejects path traversal | `relativePath = ../outside.js` | exit 1; stderr contains "must not contain path traversal" |
| Rejects absolute Unix path | `relativePath = /etc/passwd` | exit 1; stderr contains "must be relative" |
| --home override | `--home <tmpdir>` | Global lookup uses tmpdir; real os.homedir() not consulted |

**`tests/cli/run-asset-cli.test.js`:**

| Test | Scenario | Expected |
|------|----------|---------|
| Executes .js in scripts category | `scripts/wb-validate.js` | Exit code propagated; no shell |
| Rejects non-scripts category | `agents/some-agent.md` | exit 1; stderr contains "only scripts category" |
| Rejects .md extension | `scripts/something.md` | exit 1; stderr contains "not an allowed extension" |
| Rejects non-catalog path | `scripts/injected.js` not in catalog | exit 1; stderr contains "not a registered catalog asset" |
| Command injection impossible | Argument containing `; rm -rf /` | Argument forwarded as literal string; no shell interpretation |
| Paths with spaces: resolved path | Installation in `tmp path with spaces/` | Executes correctly; `shell: false` used |
| Paths with spaces: forwarded arg | `-- "arg with spaces"` | Script receives one argument containing spaces |
| Exit code propagation | Script exits with code 42 | run-asset exits with 42 |
| Signal propagation | Script killed by SIGTERM | run-asset exits 1; stderr reports "SIGTERM" |

**`tests/cli/list-assets-cli.test.js`:**

| Test | Scenario | Expected |
|------|----------|---------|
| JSON output, local-only | Local install; agents present | stdout = sorted JSON array of absolute paths; exit 0 |
| JSON output, global-only | Global install via `--home <tmpHome>` | stdout = sorted JSON array under tmpHome; exit 0 |
| Empty category | Agents installed but category contains 0 files | stdout = `[]`; exit 0 |
| Unknown category | `--category nonexistent` | exit 1; stderr = "Unknown category: nonexistent" |
| No installation | No install anywhere (empty tmpHome) | exit 1; stderr = error |
| Ordering is deterministic | Multiple agents; run twice | stdout identical both times (sorted) |
| Plain format | `--format plain` | One path per line; sorted; exit 0 |
| --home override | `--home <tmpdir>` | Global lookup uses tmpdir; real os.homedir() not consulted |

---

### 3.6 Workflow and Agent Path Migration

**Context:** Workflow scripts (`.js` files in `src/claude/workflows/`) are installed at
`<runtimeRoot>/workflows/`. After migration, the current working directory is no longer
guaranteed to have `.claude/scripts/` or `.claude/agents/` — in global-only mode these
directories do not exist under the project root.

**Critical constraint:** The Claude Code workflow runtime does NOT expose `require`, `path`,
`__dirname`, or any Node.js module-system globals. Therefore `__dirname`-relative path
construction is NOT available inside workflow scripts. All runtime asset references must use
the `ai-toolkit` CLI binary (§3.5), which is on PATH after a global npm install.

**Migration rule:**

```
BEFORE (broken in global-only mode):
  node .claude/scripts/wb-validate.js ...   // relative to CWD — fails in global-only

WRONG alternative (not valid in workflow runtime):
  path.join(__dirname, '..', 'scripts', 'wb-validate.js')
  // __dirname and path are unavailable — workflow runtime does not expose require

CORRECT (works in both modes; uses npm bin):
  ai-toolkit run-asset --project <projectDir> scripts/wb-validate.js -- [args]
  // resolves from the effective installation; no __dirname; no require; no path.join
```

**Files requiring migration (inventory of all current hardcoded references):**

| File | Current reference | Replacement | Availability |
|------|------------------|-------------|-------------|
| `pm-phase2.js` | `node .claude/scripts/wb-validate.js` | `ai-toolkit run-asset --project <projectDir> scripts/wb-validate.js -- [args]` | `ai-toolkit` on PATH (global install) |
| `pm-phase2.js` | `node .claude/scripts/wb-render.js` | `ai-toolkit run-asset --project <projectDir> scripts/wb-render.js -- [args]` | `ai-toolkit` on PATH (global install) |
| `am-phase1.js` | Glob scan of `.claude/agents/` | `ai-toolkit list-assets --project <projectDir> --category agents --format json` — stdout is sorted JSON array of absolute agent paths; no command substitution | `ai-toolkit` on PATH (global install) |
| `install-toolkit.md` | Agent prompt copies from `src/claude/**` in CWD | Prompt delegates to `ai-toolkit install --project <target>` (or `--global`); `bin/cli.js` uses `__dirname` to locate its own package root (`__dirname` is valid in bin/cli.js — a normal Node module) | `ai-toolkit` on PATH or via `npx` |

**`pm-phase2.js` migration detail:**

pm-phase2 receives `projectDir` as an input parameter. The replacement invocation:
```bash
# Exit code semantics unchanged: wb-validate.js exits 0 on success, non-zero on failure.
# run-asset propagates the exit code.

# BEFORE
node .claude/scripts/wb-validate.js ${workBreakdownPath}

# AFTER
ai-toolkit run-asset --project ${projectDir} scripts/wb-validate.js -- ${workBreakdownPath}
```

**`am-phase1.js` migration detail:**

am-phase1 currently scans `.claude/agents/` to discover available agents. The workflow runtime
does not expose `spawnSync`, `require`, `child_process`, or `__dirname`, so am-phase1.js cannot
directly spawn a process or capture its stdout. am-phase1.js continues to use `agent()` for its
Discovery phase, as it does today.

The change is in the Discovery agent's prompt: it must instruct the agent to run

```
ai-toolkit list-assets --project <projectDir> --category agents --format json
```

and use the returned JSON array as the definitive list of installed agent asset paths, reading
exclusively the frontmatter of each listed path. No free scan of `.claude/agents/` takes place.
No command substitution (`$(...)`) is used. `spawnSync`, `require`, `child_process`, `path`, and
`__dirname` are absent from am-phase1.js.

**`install-toolkit.md` migration detail:**

The current agent prompt instructs the implementing agent to copy `src/claude/**` from the
caller's CWD. This fails when invoked from a consumer project where `src/claude/` does not exist.

Corrected approach: the prompt instructs Claude to run:
```bash
ai-toolkit install --project <target>    # local install
ai-toolkit install --global              # global install
```

`bin/cli.js` uses `__dirname` (valid in that Node module context) to locate
`path.join(__dirname, '..', 'src', 'claude')`. The caller's CWD is irrelevant.

Tests for install-toolkit.md invocation contexts:

| Context | Expected |
|---------|---------|
| Toolkit repo (dev): `node bin/cli.js install --project <target>` | Reads `<repo>/src/claude/`, installs to `<target>/.claude/` |
| Consumer (global install): `ai-toolkit install --project <target>` | Binary on PATH; reads from package root |
| Consumer (local install): `npx ai-toolkit install --project <target>` | npx resolves local package; reads from package root |
| Global install: `ai-toolkit install --global` | Installs to `os.homedir()/.claude/` |

**No fallback:** If the `ai-toolkit` binary is not found, the workflow fails immediately with an
explicit error. No silent fallback to hardcoded `.claude/` paths is permitted.

---

## 4. Frontend

Not applicable — FTR-015 is a backend/infrastructure feature with no UI components or pages. The only user-facing interface is the CLI diagnostic command.

---

## 5. External Integrations

None. FTR-015 is internal toolkit infrastructure.

---

## 6. Security Considerations

- **File permissions:** Ensure copied files inherit appropriate permissions (readable by Claude Code, not world-writable)
- **Trash directory:** `.ai-toolkit-trash/` should not contain sensitive data; orphaned files are moved, not deleted, for recovery
- **Settings files:** Both `settings.json` and `settings.local.json` are protected from overwriting by the installer via `NEVER_COPY` constant
- **Manifest integrity:** If manifest is corrupted, installers reset it rather than silently failing
- **Version mismatch detection:** `doctor resolution` reports when local and global versions differ, preventing silent asset mixes

---

## 7. Database Changes

Not applicable. This is a file system reorganization, not a database feature.

---

## 8. Configuration

### 8.1 `.claude/settings.json` — Resolution of Open Question 1

**Decision:** `.claude/settings.json` is **removed from git tracking** (`git rm --cached`).

**Correct contract:**
- `.claude/settings.json` is removed from git via `git rm --cached` — the file is no longer version-controlled after FTR-015
- The file is **NOT** moved to `src/claude/` — it is not a runtime asset
- The file is **NOT** generated, copied, or overwritten by the installer — the existing `NEVER_COPY` protection already prevented distribution; this remains in force
- `.claude/settings.local.json` may remain on disk as gitignored personal configuration
- User global configuration (the user's own `~/.claude/settings.json`) stays external to this package and is not touched by this feature

**Rationale:**
The real situation: `.claude/settings.json` has already been removed locally. Any self-hosted configuration needed during development is covered by the user's global Claude Code settings. The `NEVER_COPY` protection in the installer already ensured this file was never distributed to consumer projects, so removing it from git tracking eliminates residual tracked content from `.claude/` with no behavioral impact.

**Previous justification removed:**
The earlier reasoning ("keep it tracked to enforce CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2") was incorrect: the installer already marked the file NEVER_COPY and never distributed it to consumer projects, so consumers never received it from the toolkit. Removing it from tracking does not break any consumer.

**Impact on AC-01:**
AC-01 (`grep -r "" .claude/agents .claude/commands .claude/skills .claude/workflows .claude/scripts`) does not reference `.claude/settings.json` — it was never part of the runtime asset scope. No change to AC-01 required.

### 8.2 Environment Variables

No new environment variables. The spawn-depth setting is configured via `.claude/settings.json` structure (not an env var):

```json
{
  "env": {
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2"
  }
}
```

### 8.3 Non-mutating Dry-run Mode

`npm run toolkit:dev-install-global` executes three sequential steps: **dry-run → install → verify**.
The dry-run step is a concrete, non-mutating execution of the installer with a `--dry-run` flag.

**Non-mutating guarantees (mandatory):**
- No files are copied from `src/claude/` to `~/.claude/`
- No orphan detection or trash operations run
- No `.ai-toolkit-manifest.json` is written or updated
- No `.ai-toolkit-version` stamp is written
- No modifications of any kind are made to `~/.claude/` or any `<target>/.claude/`
- The filesystem state before and after a dry-run is byte-identical

**Dry-run output:** A human-readable summary of what *would* happen:
```
Dry-run summary (no changes written):
  Source:      <repo>/src/claude/
  Mode:        global
  Destination: ~/.claude/
  Categories:
    agents:     N files → ~/.claude/agents/
    commands:   N files → ~/.claude/commands/
    skills:     N files → ~/.claude/skills/
    workflows:  N files → ~/.claude/workflows/
    scripts:    N files → ~/.claude/scripts/
  Orphans (files in previous manifest, not in new plan): N files
    (would be moved to ~/.claude/.ai-toolkit-trash/)
  Total files to install: N
  Estimated version: <version from package.json>
```

**Implementation:** `bin/cli.js` accepts a `--dry-run` flag on any install invocation. When set, all
copy, trash, manifest-write, and version-write operations are skipped; only the planning and output
steps run.

**Test:** `tests/cli/installer-dry-run.test.js` — verifies that invoking install with `--dry-run` on
a real or mock filesystem leaves the destination directory byte-identical before and after. The test
must check: no new files, no deleted files, no modified files in the destination directory.

### 8.4 Feature Flags

None planned. The migration is all-or-nothing; no feature-flag gating needed.

---

## 9. File Inventory

### New files

| Path | Purpose |
|------|---------|
| `lib/asset-catalog.js` | Single source of truth for asset categories and installation paths |
| `src/claude/agents/` | Migrated agent definitions (git mv from `.claude/agents/`) |
| `src/claude/commands/` | Migrated command definitions |
| `src/claude/skills/` | Migrated skill directories |
| `src/claude/workflows/` | Migrated workflow scripts |
| `src/claude/scripts/` | Migrated utility scripts (wb-validate.js, wb-render.js, etc.) |
| `tests/cli/` | Unit tests for pure functions in `bin/cli.js` (already present; will add resolver tests) |
| `tests/frontmatter/` | Structural validation tests (already present; will update to read from `src/claude/`) |

### Modified files

| Path | Change description |
|------|-------------------|
| `bin/cli.js` | Add `resolveClaudeRuntimeAsset()` function (six-phase algorithm including Phase 0 input validation and catalog membership check); add `resolve-asset`, `run-asset` (security-constrained: scripts category + .js only + spawnSync shell:false), `list-assets` (JSON/plain output, sorted), and `validate-purity` CLI commands; add `--dry-run` flag to install commands; update `expandMappings()` to read from `lib/asset-catalog.js`; add `validatePurityGuard()` function; add `doctor resolution` CLI command; export all new functions via require.main guard |
| `package.json` | Update `files[]` array: replace `.claude` with `src/claude`; add `npm run toolkit:dev-install-global`, `toolkit:validate-purity` scripts; add `prepack` lifecycle hook; confirm `bin.ai-toolkit` entry points to `bin/cli.js` |
| `.gitignore` | Add `.claude/.ai-toolkit-version`, `.claude/settings.json`, and `.claude/settings.local.json` entries |
| `src/claude/workflows/pm-phase2.js` | Replace hardcoded `node .claude/scripts/wb-validate.js` and `node .claude/scripts/wb-render.js` with `ai-toolkit run-asset --project <projectDir> scripts/wb-validate.js -- [args]` (and equivalent for wb-render.js) |
| `src/claude/workflows/am-phase1.js` | Replace hardcoded `.claude/agents/` directory scan with `ai-toolkit list-assets --project <projectDir> --category agents --format json`; parse stdout as JSON array; no command substitution; no `__dirname` |
| `src/claude/agents/install-toolkit.md` | Update agent prompt to delegate to `ai-toolkit install --project <target>` (or `--global`); remove assumption that `src/claude/` exists in caller's CWD |
| `AGENTS.md` | Update directory structure section; document `src/claude/` as source location; remove references to `.claude/` as versioned source |
| `docs/reference.md` | Add documentation for `resolveClaudeRuntimeAsset()` function; add `resolve-asset` CLI facade; add `doctor resolution` command reference; update file paths to reference `src/claude/` |
| `docs/installation.md` | Document asset catalog concept; update installer mapping; explain upgrade path and trash mechanism; document `npm run toolkit:dev-install-global` and its three phases (dry-run → install → verify) |
| `tests/cli/resolver.test.js` | NEW: unit tests for `resolveClaudeRuntimeAsset()` — all detection/mode/completeness scenarios |
| `tests/cli/resolve-asset-cli.test.js` | NEW: unit tests for `resolve-asset` CLI facade (three-tier stdout/stderr model, path traversal rejection, non-catalog rejection, --home isolation) |
| `tests/cli/list-assets-cli.test.js` | NEW: unit tests for `list-assets` CLI command (JSON/plain output, empty category, unknown category, ordering, --home isolation) |
| `tests/cli/asset-catalog.test.js` | NEW: unit tests for catalog structure and `getAssetCategories()` |
| `tests/cli/doctor-resolution.test.js` | NEW: unit tests for doctor command output parsing |
| `tests/e2e/` | NEW: E2E test directory (resolution.test.js, workflow-facade.test.js) — uses execFileSync + argv array + tmpdir with spaces; no real `~/.claude/` reads |
| `tests/cli/installer-dry-run.test.js` | NEW: verifies dry-run leaves destination filesystem byte-identical |
| `tests/cli/purity-guard.test.js` | NEW: verifies purity guard blocks *.test.js and tests/ under src/claude/ |
| `jest.config.js` | Ensure tests can find fixtures in new `tests/` location (may need testPathIgnorePatterns update) |
| `package-lock.json` | Updated by `npm install` if dependencies change |

### Removed files

These files are migrated, not deleted (git mv preserves history):

| Path | Destination |
|------|-------------|
| `.claude/agents/` | `src/claude/agents/` (via git mv) |
| `.claude/commands/` | `src/claude/commands/` (via git mv) |
| `.claude/skills/` | `src/claude/skills/` (via git mv) |
| `.claude/workflows/` | `src/claude/workflows/` (via git mv) |
| `.claude/scripts/wb-validate.js` | `src/claude/scripts/wb-validate.js` (via git mv) |
| `.claude/scripts/wb-render.js` | `src/claude/scripts/wb-render.js` (via git mv) |
| `.claude/scripts/tests/` | `tests/` (via git mv) |

### Removed from git tracking

These files are removed from git tracking but may remain on the local filesystem:

| Path | Action |
|------|--------|
| `.claude/settings.json` | `git rm --cached` + added to `.gitignore`; NOT moved; NOT installer-generated; NOT distributed; may remain on local filesystem |
| `.claude/.ai-toolkit-version` | `git rm --cached` + added to `.gitignore`; content preserved; generated by the installer only in the runtime destination |

**`.gitignore` additions (all three entries):**
```
.claude/settings.json
.claude/settings.local.json
.claude/.ai-toolkit-version
```
The first two prevent personal/local config from showing as untracked. The third prevents the version stamp from appearing after a dev install.

### Unchanged files

These remain in place and are not touched by migration or installer:

| Path | Reason |
|------|--------|
| `.claude/settings.local.json` | Personal configuration, gitignored — left exactly as-is |

---

## 10. Testing Strategy

### Unit Tests (for new functions)

#### `resolveClaudeRuntimeAsset()` — `tests/cli/resolver.test.js`

| Test | Scenario | Expected behavior |
|------|----------|-------------------|
| returns local path | Local `.claude/` has valid manifest + catalog assets; no global installation | Returns absolute path under localRuntimeRoot |
| returns global path | Global `~/.claude/` has valid manifest + catalog assets; no local installation | Returns absolute path under globalRuntimeRoot |
| global-only when local .claude has only settings | Local `.claude/` contains only settings.local.json; global toolkit installed | localInstalled=false → mode=global-only; returns global path |
| global-only when local .claude is empty dir | Empty local `.claude/` directory; global toolkit installed with valid manifest | localInstalled=false → mode=global-only; returns global path |
| returns local path | Local runtimeRoot has valid manifest + all catalog assets on disk; no global presence | Returns absolute path under localRuntimeRoot |
| returns global path | Global runtimeRoot has valid manifest + all catalog assets; no local presence | Returns absolute path under globalRuntimeRoot |
| global-only — settings.local.json only locally | Local `.claude/` has only settings.local.json; global toolkit installed | condA/B/C false locally → global-only ✓ |
| global-only — empty .claude/ | Empty local `.claude/`; global toolkit installed | condA/B/C false → global-only ✓ |
| mixed error — both real installations present | Local and global both have valid manifest+assets | Raises Error with both runtimeRoot paths |
| mixed error — local corrupt manifest + full payload + global valid | Local: manifest file exists (condA=true) + catalog payload (condC=true); global valid | localPresent=true, globalPresent=true → Raises Error (mixed) ✓ |
| no installation error | No manifest, no version stamp, no catalog payload in either location | Raises Error suggesting installer run |
| missing requested asset | Single effective installation; requested asset absent from disk | Raises Error with missing absolutePath and effective mode |
| completeness failure — expected catalog asset missing from disk | Installation detected; new catalog asset absent from disk; manifest stale | Raises Error listing all missing assets; stale manifest does not suppress error |
| rejects empty relativePath | `relativePath = ""` | Raises Error "must be a non-empty string" (Phase 0) |
| rejects absolute Unix path | `relativePath = "/etc/passwd"` | Raises Error "must be relative (got Unix absolute)" (Phase 0) |
| rejects absolute Windows path | `relativePath = "C:\\\\Windows\\\\system32\\\\foo.js"` | Raises Error "must be relative (got Windows absolute)" (Phase 0) |
| rejects path traversal — simple | `relativePath = "../outside.js"` | Raises Error "must not contain path traversal" (Phase 0) |
| rejects path traversal — nested | `relativePath = "scripts/../../outside.js"` | Raises Error "must not contain path traversal" (Phase 0) |
| rejects null bytes | `relativePath = "scripts/valid\x00.js"` | Raises Error "must not contain null bytes" (Phase 0) |
| rejects non-catalog asset | File exists under .claude/ but is not a catalog entry | Raises Error "not a registered catalog asset" (Phase D 8a) |
| normalizes Windows separators | `relativePath = "scripts\\\\wb-validate.js"` | Normalized to `scripts/wb-validate.js`; resolves correctly |
| metadata warning — corrupt manifest, payload present | Single installation with corrupt manifest but full payload | Warns "manifest corrupt"; does NOT abort (Phase C = warnings only); proceeds to completeness check |
| metadata warning — parseable manifest, missing fields | Manifest parses but lacks `installationMode` | Warns "schema invalid: missing fields"; proceeds |
| metadata warning — installationMode mismatch | Manifest says 'local', effective mode is 'global' | Warns "installationMode mismatch"; proceeds |
| metadata warning — version stamp mismatch | Installed stamp = 0.9.0, resolver version = 0.10.1 | Warns "version mismatch"; proceeds; does not abort |
| metadata warning — stale manifest entries | Manifest declares files not in current catalog | Warns "N stale entries"; proceeds |
| completeness: manifest vs expected payload | Valid manifest missing one new catalog asset, but file present on disk | Warns "missing from manifest"; disk check passes; returns path |
| handles corrupt-manifest-only with no payload | Manifest file exists but is corrupt; no catalog payload; no version stamp | condA=true (manifest file exists) → localPresent=true; if no global → Raises incompleteness Error |

#### Asset Catalog — `tests/cli/asset-catalog.test.js`

| Test | Checks |
|------|--------|
| exports getAssetCategories | Function exists and returns array |
| category structure | Each category has name, sourceDir, runtimeDir, description |
| no duplicate names | All category names are unique |
| source dirs exist | All source directories present in src/claude/ |
| runtime dirs normalized | All paths use forward slashes, no trailing slashes |

#### Doctor Resolution Command — `tests/cli/doctor-resolution.test.js`

| Test | Scenario |
|------|----------|
| local-only output | Correct format when only local installed |
| global-only output | Correct format when only global installed |
| both installed output | Reports both with warning |
| missing manifest | Gracefully reports manifest as missing |
| corrupt manifest | Gracefully reports manifest as corrupt |

### Structural Tests (migrated from `.claude/scripts/tests/`)

All existing tests under `.claude/scripts/tests/` are moved to `tests/` with updated import paths:

| Original | New location |
|----------|-------------|
| `.claude/scripts/tests/wb-validate.checks-*.test.js` | `tests/wb-validate/*.test.js` |
| `.claude/scripts/tests/wb-render.*.test.js` | `tests/wb-render/*.test.js` |
| `.claude/scripts/tests/pm-phase2.*.test.js` | `tests/pm-phase2/*.test.js` |
| `.claude/scripts/tests/installer.scripts-distribution.test.js` | `tests/installer.scripts-distribution.test.js` |

All import statements updated to reflect new relative paths.

### Frontmatter Validation Tests (updated paths)

`tests/frontmatter/agents.test.js` and `tests/frontmatter/skills.test.js` are updated to read from `src/claude/` instead of `.claude/`:

```javascript
const AGENTS_DIR   = path.join(__dirname, '..', '..', 'src', 'claude', 'agents');
const SKILLS_DIR   = path.join(__dirname, '..', '..', 'src', 'claude', 'skills');
```

### Regression Tests (new)

#### Absence of versioned assets in root `.claude/`

```javascript
// tests/regression/no-versioned-assets-in-dot-claude.test.js
test('no agents under .claude/agents', () => {
  const agentsInClaude = fs.readdirSync('.claude/agents', { noThrow: true }) || [];
  expect(agentsInClaude.length).toBe(0);
});
// Similar tests for commands/, skills/, workflows/, scripts/*.js
```

#### Absence of test files under `src/claude/`

```javascript
test('no test files under src/claude/', () => {
  const testFiles = walkDir('src/claude')
    .filter(f => f.endsWith('.test.js') || f.includes('/tests/'));
  expect(testFiles.length).toBe(0);
});
```

#### am-phase1.js static analysis (workflow runtime constraint)

```javascript
// tests/regression/am-phase1-static.test.js
const src = fs.readFileSync('src/claude/workflows/am-phase1.js', 'utf8');

test('am-phase1.js does not contain spawnSync or execSync', () => {
  expect(src).not.toMatch(/spawnSync|execSync|exec\(/);
});
test('am-phase1.js does not contain require or child_process', () => {
  expect(src).not.toMatch(/require\s*\(|child_process/);
});
test('am-phase1.js does not contain hardcoded .claude/agents scan', () => {
  expect(src).not.toMatch(/\.claude[/\\]agents/);
});
test('am-phase1.js Discovery agent prompt contains list-assets command', () => {
  expect(src).toMatch(/list-assets.*--category\s+agents.*--format\s+json/s);
});
```

#### Catalog-driven equivalence

```javascript
test('all catalog assets present at source location', () => {
  const categories = getAssetCategories();
  for (const cat of categories) {
    const dir = path.join(repoRoot, cat.sourceDir);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir).length).toBeGreaterThan(0);
  }
});
```

#### `npm pack --dry-run` content verification

```javascript
// tests/regression/npm-pack-contents.test.js
test('tarball contains src/claude but not root .claude', () => {
  execSync('npm pack --dry-run', { encoding: 'utf8' });
  const contents = /* extract tarball file list */;
  expect(contents.some(f => f.includes('src/claude'))).toBe(true);
  expect(contents.some(f => f.startsWith('package/.claude/'))).toBe(false);
  expect(contents.some(f => f.startsWith('package/tests/'))).toBe(false);
});
```

#### Installer manifest integrity after upgrade

```javascript
// tests/regression/upgrade-orphan-cleanup.test.js
test('orphaned test files moved to trash on upgrade', () => {
  // Simulate old manifest with test file
  const oldManifest = {
    files: ['.claude/scripts/tests/old.test.js']
  };
  // Run new installer
  // Verify file moved to .claude/.ai-toolkit-trash/
});
```

#### `resolve-asset` CLI Facade — `tests/cli/resolve-asset-cli.test.js`

| Test | Scenario | Expected |
|------|----------|----------|
| exits 0, stdout = path | Single installation, asset present | stdout = absolute path, exit 0 |
| exits 1, stdout empty | No installation | stderr = error message, stdout = "", exit 1 |
| exits 1, stdout empty | Both installations present | stderr = ambiguous error, stdout = "", exit 1 |
| stdout = clean path | Verify no trailing whitespace or extra lines | Single newline-terminated path |
| diagnostics to stderr | Warnings (manifest issues) | Warnings appear only on stderr, not stdout |

#### `src/claude/` Purity Guard — `tests/cli/purity-guard.test.js`

| Test | Scenario | Expected |
|------|----------|----------|
| blocks *.test.js under src/claude/ | `src/claude/scripts/tests/foo.test.js` present | Install aborts with error listing the file |
| blocks tests/ directory | `src/claude/scripts/tests/` directory present | Install aborts |
| blocks fixtures/ directory | `src/claude/agents/fixtures/` present | Install aborts |
| allows normal files | No test files under src/claude/ | Install proceeds |
| purity guard runs before first file copy | First copy attempt is not made | Filesystem unchanged when guard triggers |

#### Installer Dry-run — `tests/cli/installer-dry-run.test.js`

| Test | Scenario | Expected |
|------|----------|----------|
| no files copied | Run install --dry-run on mock target | Destination directory byte-identical before and after |
| no manifest written | Run install --dry-run | .ai-toolkit-manifest.json not created or modified |
| no version stamp written | Run install --dry-run | .ai-toolkit-version not created or modified |
| no orphan moves | Run upgrade --dry-run with orphaned files | Orphan files remain in place; trash dir not created or modified |
| dry-run output is non-empty | Valid source and destination | stdout contains file count summary |

### Manual Verification Steps

1. **Permission fatigue eliminated:** Edit `src/claude/agents/example.md` with Claude Code; no write-permission prompt
2. **Runtime mode detection:** Run `node bin/cli.js doctor resolution --project .` in toolkit repo after global install; reports "global-only"
3. **Mixing prevention:** Run installer to install both local and global; run `doctor resolution`; reports explicit error
4. **Dev workflow dry-run:** `npm run toolkit:dev-install-global` — dry-run phase completes with no `~/.claude/` changes; verify `~/.claude/.ai-toolkit-manifest.json` timestamp unchanged
5. **Self-hosted global-only E2E:** With global install and no local runtime assets, run a full pm-phase pipeline; verify `wb-validate.js` and `wb-render.js` resolve to `~/.claude/scripts/`; pipeline completes without path errors
6. **Local-only consumer E2E:** In a consumer project with local install, run a full pm-phase pipeline; verify scripts resolve to `<project>/.claude/scripts/`
7. **Facade CLI:** `node bin/cli.js resolve-asset --project . scripts/wb-validate.js` outputs only the absolute path to stdout

### E2E Integration Tests — `tests/e2e/` (OI-1 resolved)

All E2E tests are fully automated. They use an injectable home directory (`--home <tmpdir>`) and
temporary project directories. Tests must not read OR write the real `~/.claude/`. Tests run as
part of `npm test`.

**Requirements:** All CLI commands accept `--home <dir>` to override `os.homedir()`. When
`--home` is provided, `os.homedir()` must not be consulted at all. Tests are in `tests/e2e/`.

**Test implementation pattern (`tests/e2e/resolution.test.js`):**

```javascript
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const cliPath = path.join(__dirname, '..', '..', 'bin', 'cli.js');

// Use execFileSync with an explicit argv array — no string interpolation, no shell
function cli(argv) {
  // argv is an array, e.g. ['resolve-asset', '--project', tmpProject, '--home', tmpHome, 'scripts/wb-validate.js']
  const result = spawnSync(process.execPath, [cliPath, ...argv], { encoding: 'utf8' });
  return result;
}

// Create temp dir — WITH A SPACE in the name to verify quoting
function mktmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ftr015 home-'));   // space intentional
}
function mktmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ftr015 proj-'));   // space intentional
}
```

**Every test case receives explicit `--home <tmpHome>` — including local-only, none, and arg-forwarding cases. No test is allowed to omit `--home`.**

**Test cases:**

| Test | Setup | Command argv | Verification |
|------|-------|-------------|-------------|
| global-only resolve | Install to `<tmpHome>` | `['resolve-asset', '--project', tmpProject, '--home', tmpHome, 'scripts/wb-validate.js']` | stdout = `<tmpHome>/.claude/scripts/wb-validate.js`; exit 0; stderr = "" |
| local-only resolve | Install to `<tmpProject>/.claude/` | `['resolve-asset', '--project', tmpProject, '--home', emptyTmpHome, 'scripts/wb-validate.js']` | stdout = `<tmpProject>/.claude/scripts/wb-validate.js`; exit 0 |
| both → error | Install to `<tmpProject>` and `<tmpHome>` | `['resolve-asset', '--project', tmpProject, '--home', tmpHome, 'scripts/wb-validate.js']` | exit 1; stderr contains "ambiguous" |
| none → error | Empty tmpHome + empty tmpProject | `['resolve-asset', '--project', tmpProject, '--home', emptyTmpHome, 'scripts/wb-validate.js']` | exit 1; stderr contains "no installation" |
| run-asset executes script | Global install via `--home <tmpHome>` | `['run-asset', '--project', tmpProject, '--home', tmpHome, 'scripts/wb-validate.js', '--', '--version']` | exit code = script's exit code |
| args forwarded with spaces | Global install; arg contains spaces | `['run-asset', ..., '--', 'arg with spaces', 'another arg']` | Script receives two args literally; no shell splitting |
| paths with spaces work | tmpHome path contains space | `['resolve-asset', '--project', tmpProject, '--home', tmpHomeWithSpace, ...]` | stdout = correct path containing space; exit 0 |
| --home isolation: real home NOT consulted | Empty tmpHome; real `~/.claude/` may have install | `['resolve-asset', '--project', tmpProject, '--home', emptyTmpHome, ...]` | exit 1 (no install in tmpHome); demonstrates real home not read |
| list-assets global-only | Global install; agents present | `['list-assets', '--project', tmpProject, '--home', tmpHome, '--category', 'agents', '--format', 'json']` | stdout = sorted JSON array; exit 0 |
| list-assets local-only | Local install; agents present | `['list-assets', '--project', tmpProject, '--home', emptyTmpHome, '--category', 'agents', '--format', 'json']` | stdout = sorted JSON array from tmpProject; exit 0 |
| list-assets empty category | Install with no agents | Same as above but no agents in install | stdout = `[]`; exit 0 |

**`--home` isolation verification:** The test "real home NOT consulted" deliberately uses an empty
`tmpHome` (no toolkit installed there). If `os.homedir()` were consulted instead of `tmpHome`,
the test would see "installation found" on a developer's machine that has a global install — the
wrong result. The test expects exit 1, proving real home is not read.

**Workflow facade test (no LLM invocation):** `tests/e2e/workflow-facade.test.js` — verifies
`run-asset` executes a real script with forwarded arguments and propagates exit codes, without
invoking Claude Code or any LLM. This test is part of `npm test`.

**Cleanup:** All temporary directories are removed after each test:
`fs.rmSync(dir, { recursive: true, force: true })`.

Existing pm-phase1/2/3 workflow tests remain in `tests/pm-phase2/` and must pass post-migration.

---

## 11. Implementation Order

1. **Inventory and classification** — Catalog all files under `.claude/`
   - Dependencies: None
   - Output: Classification document (internal decision record)

2. **Create lib/asset-catalog.js** — Define asset categories
   - Dependencies: None (but step 1 must be complete)
   - Output: Module with `getAssetCategories()` export

3. **Migrate test files** (git mv `.claude/scripts/tests/` → `tests/`)
   - Dependencies: Step 1
   - Updates: Import paths in test files, jest.config.js, package.json test scripts
   - Output: All tests pass in new location

4. **Migrate runtime assets** (git mv .claude/agents,commands,skills,workflows,scripts → src/claude/)
   - Dependencies: Steps 1–3
   - No functional changes; pure file reorganization
   - Output: Verify via AC-01, AC-02, AC-03 checks

5. **Update npm packaging** (package.json files[], add regression test)
   - Dependencies: Step 4
   - Verify: `npm pack --dry-run`, tarball contents regression test
   - Output: Correct tarball, regression test added

6. **Update installer logic** (bin/cli.js → read from lib/asset-catalog.js)
   - Dependencies: Steps 2–5
   - Changes: `expandMappings()` now reads catalog; `isDistributable()` is **REMOVED** and replaced by catalog membership (catalog is the positive allow-list; anything not in the catalog is not distributed)
   - Replace: Hardcoded mappings and exclusion filter with catalog-derived mappings
   - Output: Local and global installers both use catalog; regression tests that assert test files are not distributed remain and are satisfied by catalog membership alone

7. **Handle upgrade path** (manifest diff, orphan trash)
   - Dependencies: Step 6
   - No code changes; existing manifest pruning logic (FTR-011) applies
   - Verify: Regression test for old test files → trash

8. **Add `src/claude/` purity guard** (fail-fast validation before any install or pack)
   - Dependencies: Step 2
   - Single `validatePurityGuard(sourceDir)` function, exported via require.main guard
   - Add `toolkit:validate-purity` npm script and `prepack` lifecycle hook to `package.json`
   - Block: `*.test.js`, `tests/`, `fixtures/`, `mocks/`, `helpers/` directories under `src/claude/`
   - Tests: purity-guard.test.js (includes test that `npm pack` via `prepack` hook aborts on violation before any tarball is created)
   - Output: Installer and `npm pack` both abort on purity violation; single shared implementation

9. **Add resolveClaudeRuntimeAsset()** function (four-phase algorithm)
   - Dependencies: Steps 2, 6
   - Export: New function via require.main guard
   - Tests: resolver.test.js (all phase A/B/C/D/E scenarios including corrupt-manifest, mixed, version mismatch)
   - Output: Function ready for workflow integration (deferred to FTR-016/017/018)

10. **Add `resolve-asset` CLI facade** (machine-readable wrapper)
    - Dependencies: Step 9
    - stdout/stderr/exit-code contract per §3.5
    - Tests: resolve-asset-cli.test.js
    - Output: Facade available from external scripts and shell

11. **Add doctor resolution command** (CLI entry point)
    - Dependencies: Step 9
    - Output: Human-readable diagnostics, no modifications
    - Tests: doctor-resolution.test.js

12. **Add --dry-run flag to install commands** (non-mutating mode)
    - Dependencies: Step 6
    - Guarantees: no copies, no manifest writes, no version stamp writes, no trash operations
    - Tests: installer-dry-run.test.js (filesystem byte-identical before and after)
    - Output: `--dry-run` flag on bin/cli.js install command; used by toolkit:dev-install-global

13. **Migrate workflow/agent hardcoded paths** (Section 3.6)
    - Dependencies: Steps 4, 10 (`ai-toolkit` binary must be available for new invocations)
    - Changes: pm-phase2.js → `ai-toolkit run-asset` for wb-validate.js and wb-render.js; am-phase1.js → `ai-toolkit list-assets --category agents --format json` (definitive command, no command substitution); install-toolkit.md → delegate to `ai-toolkit install`
    - No `__dirname`, `path.join()`, or `require()` constructs permitted in workflow scripts
    - Tests: E2E tests in `tests/e2e/` — automated; all cases use `--home <tmpdir>`; `execFileSync`/`spawnSync` with argv array; tmp dirs contain spaces; real `~/.claude/` never read
    - Output: All pipeline references use `ai-toolkit` CLI facade; no hardcoded `.claude/scripts`; no `__dirname`

14. **Update frontmatter validation tests** (read from src/claude/)
    - Dependencies: Step 4
    - Changes: Test discovery paths updated to src/claude/agents, src/claude/skills
    - Output: All frontmatter tests pass

15. **Add regression tests** (absence of versioned assets, catalog equivalence, npm pack)
    - Dependencies: Steps 4–14
    - Output: All regression tests passing; no test files under src/claude/

16. **Add npm run toolkit:dev-install-global script**
    - Dependencies: Steps 6, 12
    - Output: Script in package.json; three phases: --dry-run → install → verify version stamp

17. **Git ignore .claude/.ai-toolkit-version, .claude/settings.json, .claude/settings.local.json**
    - Dependencies: Step 1
    - Also: git rm --cached for both settings.json and .ai-toolkit-version
    - Verify: Files no longer tracked; `.gitignore` contains all three entries

18. **Update documentation** (AGENTS.md, docs/reference.md, docs/installation.md)
    - Dependencies: Steps 4–17 (all changes visible)
    - Output: Documentation reflects new source layout, resolver, facade, workflow, and dev workflow

19. **Full regression** (npm test, verify all tests pass)
    - Dependencies: Steps 1–18 (all changes complete)
    - Output: `npm test` passes; no regressions

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Files classified as ambiguous (neither clearly runtime nor test-only) | Hard stop; cannot proceed without manual decision | Phase 1 inventory is thorough and explicit; ambiguous files are documented and require human judgment before moving forward |
| Import path updates missed in test files | Tests fail or reference wrong locations | Comprehensive search-and-replace review; run full test suite immediately after migration (step 3) |
| Installer mappings break when catalog is read but directories missing | Installation fails silently or partially | Catalog validates that source directories exist; installer includes explicit error reporting if source missing |
| Local and global installations coexist undetected, workflows mix assets | Silent failures in pipelines | `resolveClaudeRuntimeAsset()` explicitly detects both and raises error; `doctor resolution` is easy to run as diagnostic |
| Upgrade path moves user files to trash if they collide with manifest names | User loses unsaved work | Manifest only includes toolkit-installed files; user-added files are untouched (different paths or not in manifest) |
| Concurrent installs race on manifest write | Manifest corruption | Atomic write via `fs.writeFileSync()` in single phase; manifest is best-effort metadata (loss is non-fatal, regenerated on next install) |
| Global install paths differ on Windows vs Unix | Cross-platform differences in path resolution | All paths normalized to forward-slashes; path.join() used consistently; tests run on CI (GitHub Actions ubuntu) so Windows issues may slip through (accept risk, note in docs) |
| `resolveClaudeRuntimeAsset()` used before function is exported | Workflows can't find function | Function is added to module.exports in bin/cli.js step 8; workflows won't call it until FTR-016/017/018 (deferred features) |
| Manifest corruption undetected | Installation state lost | Installer catches JSON parse errors and logs warning; `doctor resolution` detects corruption and reports; missing files detected at usage time by `resolveClaudeRuntimeAsset()` |
| Test discovery fails if jest.config.js not updated | Tests not found, missing coverage | jest.config.js updated in step 3; regression test ensures test files aren't copied to destinations |
| npm pack still includes .claude/ directory | Published package is wrong | Regression test (step 5) explicitly checks tarball contents; CI blocks publish if test fails |
| FTR-016, FTR-017, FTR-018 depend on paths before FTR-015 ships | Blocked by incomplete migration | FTR-015 is a prerequisite and must complete before those features start; project manager enforces dependency ordering |

---

## Appendix: Resolution of Open Questions

### Open Question 1 — `.claude/settings.json` git tracking

**Question:** Should `.claude/settings.json` be removed from tracking or remain as a versioned toolkit-internal file?

**Answer:** **Removed from git tracking** (`git rm --cached`).

**Contract:**
- `git rm --cached .claude/settings.json` removes it from version control
- File is NOT moved to `src/claude/`
- File is NOT generated or distributed by the installer (`NEVER_COPY` protection already applied)
- `.claude/settings.local.json` remains gitignored personal config
- User's global `~/.claude/settings.json` is never touched by this feature

**Rationale:** The file has already been removed locally; any self-hosted configuration needed during development is covered by global user settings. The installer's `NEVER_COPY` guard already prevented it from being distributed to consumers. Removing it from git tracking is the correct alignment with AC-01 (which tests agents/commands/skills/workflows/scripts, not settings files).

### Open Question 2 — `resolveClaudeRuntimeAsset()` completeness check

**Question:** Does the resolver validate completeness by checking manifest presence, by checking all catalog-listed assets, or just by checking whether the requested file exists?

**Answer:** **Full expected payload comparison against the catalog and package source.**

A "complete installation" means every asset enumerated by `getAssetCategories()` over the package source (`src/claude/**`) is present on disk at the effective runtime root. This comparison is performed against the catalog (ground truth), the manifest (metadata), and the actual filesystem. A stale manifest that is missing a new asset does not mask the absence of that asset from disk. The check is not limited to the single requested file — it validates the entire installation before returning any path.

---

## Document Approval Checklist

- [x] Open Question 1 resolved with technical justification
- [x] Architecture section describes system context and component interactions
- [x] Backend section specifies data models (catalog, manifest, trash) and function contracts
- [x] File inventory is exhaustive (new, modified, removed files)
- [x] Implementation order respects dependencies
- [x] Testing strategy includes unit, structural, regression, and manual verification
- [x] Risks identified with mitigations
- [x] Ready for Gate 1 approval

---

## Sign-Off

**Status:** Ready for Gate 1 — Documentation Approval

**Open Question Resolution:** Both open questions resolved. OQ-1: `.claude/settings.json` is removed from git tracking (`git rm --cached`); not moved; not installer-generated. OQ-2: completeness check compares full expected catalog payload against manifest + disk; stale manifests do not mask missing assets.

**Next Steps:** Await Gate 1 approval before proceeding to Work Breakdown generation and implementation.
