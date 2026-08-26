# Claude Source Layout and Runtime Resolution

## Feature ID
FTR-015

## Summary
This feature eliminates the structural ambiguity created by using `.claude/` simultaneously
as the toolkit source tree, the locally installed runtime, the npm-packaged payload, and the
Claude Code configuration directory for the development repository. It migrates all versioned
toolkit assets from `.claude/` to `src/claude/` as the single authoritative source, moves all
test files to the top-level `tests/` hierarchy, introduces a new `lib/asset-catalog.js` module
as the single source of truth for installable asset categories, updates both local and global
installers to read from `src/claude/`, adds a `resolveClaudeRuntimeAsset()` function for
coherent runtime script resolution, and adds a read-only `doctor resolution` CLI command for
provenance diagnostics. The result is that ordinary development edits land in `src/claude/`
— a non-protected path — while runtime installations remain deterministic, explicit, and
verifiable. This feature is a prerequisite for all subsequent resilient-execution initiatives
(Deterministic Estimate Generation, Execution Ledger, Task Checkpoints, Isolated Parallel
Task Execution).

## Problem Statement
The `.claude/` directory currently serves four incompatible roles at once:

1. **Versioned source**: agents, skills, commands, workflows, and scripts are authored and
   committed here.
2. **Auto-discovered runtime**: Claude Code automatically loads agents, skills, commands,
   and workflows from `<project>/.claude/`, meaning the source tree is simultaneously active
   as configuration.
3. **npm-packaged payload**: `package.json` `files[]` includes `.claude/`, so the same
   directory ships in the published package and is then copied by the installer to consumer
   projects.
4. **Personal configuration**: `settings.json` and `settings.local.json` live here alongside
   the source assets.

This overlap creates two structural problems.

**Permission fatigue.** Claude Code treats `.claude/` as a protected path. Every normal
source edit — adding a step to an agent, adjusting a workflow — requires a write-permission
prompt even when `acceptEdits` is active. Because toolkit development continuously modifies
these files, permission fatigue becomes the default working mode.

**Runtime ambiguity.** When the toolkit is installed globally (`~/.claude/`) and the
development repository also has a local `.claude/` with identically named agents and
workflows, Claude Code resolves from both sources. It becomes impossible to determine which
version of an agent is actually loaded, whether a recent edit is in effect, whether a bug
is in the source or is a resolution artifact, or whether a pipeline is running coherent
asset versions. This ambiguity affects every development cycle and blocks reliable
self-hosted testing.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)

### Migration (one-time, executed during implementation in 8 sequential phases)

1. **Inventory and classification.** Every file currently tracked under `.claude/` is
   classified as: runtime asset (→ `src/claude/`), test-only (→ `tests/`), personal
   configuration (leave in place, gitignored), or ambiguous (hard stop, explicit decision
   required before proceeding). No file is moved automatically without a known destination.

2. **Test migration.** All files under `.claude/scripts/tests/**` — tests, fixtures, helpers,
   and verification scripts — are moved to `tests/**` using history-preserving git moves.
   Import paths, fixture references, `jest.config.js`, and `package.json` test scripts are
   updated. All existing tests must pass after this phase.

3. **Runtime asset migration.** All files under `.claude/agents/`, `.claude/commands/`,
   `.claude/skills/`, `.claude/workflows/`, and `.claude/scripts/*.js` are moved to the
   corresponding paths under `src/claude/` using history-preserving git moves. No functional
   content is altered during the move.

4. **npm packaging update.** `package.json` `files[]` is updated to replace `.claude` with
   `src/claude`. `npm pack --dry-run` verifies the tarball: correct runtime assets present,
   no test files, no `.claude` root copy, no personal config files.

5. **Installer and cleanup update.** `lib/asset-catalog.js` is created as the single
   deterministic catalog of installable asset categories and their runtime destinations. Both
   the local installer (`src/claude → <target>/.claude`) and the global installer
   (`src/claude/agents → ~/.claude/agents`, etc.) are updated to derive their copy plan and
   manifest content exclusively from `lib/asset-catalog.js`. The temporary `isDistributable()`
   filter introduced in FTR-014 is replaced by catalog membership checks and removed. The
   upgrade path handles any test assets previously distributed by older versions: they are
   detected via the manifest and moved to the recoverable trash (`.claude/.ai-toolkit-trash/`)
   without deleting unregistered user files.

6. **Atomic local/global resolver.** `resolveClaudeRuntimeAsset({ projectDir, relativePath })`
   is added to `bin/cli.js`. It determines the effective runtime installation (local-only,
   global-only, or error on mixed/missing) using `lib/asset-catalog.js` and returns the
   absolute path to the requested asset. It never mixes individual assets from local and global
   installations. An explicit error with diagnostics is raised when the required mode's
   installation is incomplete.

7. **`doctor resolution` command.** `node bin/cli.js doctor resolution --project .` is added
   as a read-only diagnostic command. It detects: local-only, global-only, or both
   installations present; homonymous agents with differing content or version stamps; missing
   scripts; manifest inconsistencies; and residual versioned assets in the repository
   `.claude/`. It does not modify or delete any file.

8. **Self-hosting, dev workflow, and documentation.** `npm run toolkit:dev-install-global` is
   added to `package.json` as a real npm script that executes the explicit global install
   sequence: dry-run summary → install → version verification. It must never be called
   automatically by tests, build steps, pre-commit hooks, or npm install. `.claude/.ai-toolkit-version`
   is removed from git tracking (`git rm --cached`) and added to `.gitignore`. All remaining
   versioned content under `.claude/` is removed from git. `AGENTS.md`, `docs/reference.md`,
   and `docs/installation.md` are updated to describe the new source layout and development
   workflow.

### Post-migration runtime behavior (ongoing)

- **Authoring:** edits go to `src/claude/**` — no protected-path write prompt.
- **Local install:** `bin/cli.js` reads `src/claude/**` via `lib/asset-catalog.js`, copies
  to `<target>/.claude/**`, writes manifest.
- **Global install:** same catalog, copies each category to `~/.claude/<category>/`.
- **Script resolution:** `resolveClaudeRuntimeAsset()` checks the effective installation mode
  and returns an absolute path; raises an explicit error on incomplete or mixed installations.
- **Diagnostics:** `node bin/cli.js doctor resolution` reports provenance, duplicates, and
  version mismatches without modifying anything.
- **Dev cycle:** `npm run toolkit:dev-install-global` → new Claude session → end-to-end test.

## Out of Scope
- Modification of the functional content of any agent, skill, command, or workflow
- Redesign of `pm-phase1`, `pm-phase2`, or `pm-phase3` logic
- Execution Ledger (FTR-016)
- Task Checkpoints and Resume (FTR-017)
- Isolated Parallel Task Execution (FTR-018)
- Automatic global install triggered by tests, build, pre-commit, or `npm install`
- Automatic modification or deletion of the user's personal configuration
- Replacing the installer with a Claude Code plugin
- Retroactive rewriting of historical FTR feature delivery artifacts to update path references

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| File under `.claude/` is ambiguous (cannot be classified as runtime or test-only) | Hard stop; explicit human decision required; file is not moved automatically |
| `.claude/settings.local.json` exists during migration | Left in place; not moved, not git-committed, not touched |
| `.claude/.ai-toolkit-version` exists and is git-tracked | Removed from tracking via `git rm --cached`; added to `.gitignore`; file content preserved |
| `resolveClaudeRuntimeAsset()` called when both local and global installations are present | Returns an explicit error with diagnostics; does not mix assets from the two installations |
| `resolveClaudeRuntimeAsset()` called when the effective installation is incomplete (required script missing) | Raises explicit error with the missing path and detected mode; does not fall back silently |
| Upgrade from a version that distributed test files via the manifest | Manifest diff detects the orphaned test assets; they are moved to `.ai-toolkit-trash/` (recoverable); user-owned files not in the manifest are not touched |
| `npm pack --dry-run` finds a `.claude/` entry in the tarball | Treated as a packaging defect; a new regression test must prevent it |
| `npm pack --dry-run` finds any `tests/**` file in the tarball | Treated as a packaging defect; a new regression test must prevent it |
| `doctor resolution` detects homonymous agents with different content in local and global installs | Reports each pair with file paths and version stamps; does not modify files |
| `npm run toolkit:dev-install-global` is called inside a test or pre-commit hook | Must not be wired into any automated step; documentation explicitly warns against it |
| A pipeline workflow references a script that exists only in the source tree but not in any runtime | `resolveClaudeRuntimeAsset()` raises an explicit error; the workflow does not silently use the source path |

## Data Model
N/A — internal/technical feature

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | The migration is complete | `grep -r "" .claude/agents .claude/commands .claude/skills .claude/workflows .claude/scripts 2>/dev/null` runs | The command returns no results (no versioned runtime assets remain under `.claude/`) | Must |
| AC-02 | The migration is complete | `ls src/claude/` runs | All agent, command, skill, workflow, and script assets that were under `.claude/` are now present under `src/claude/` | Must |
| AC-03 | The migration is complete | `ls src/.claude 2>/dev/null` runs | The directory does not exist | Must |
| AC-04 | The migration is complete | A Claude Code session is started in the toolkit repository | Claude Code does not auto-discover `src/claude/` as a configuration directory | Must |
| AC-05 | A local installation is performed on a target project | The installer runs | `<target>/.claude/` is populated from `src/claude/` via `lib/asset-catalog.js`; all expected asset categories are present | Must |
| AC-06 | A global installation is performed | The installer runs | `~/.claude/agents`, `~/.claude/skills`, `~/.claude/commands`, `~/.claude/workflows`, `~/.claude/scripts` are each populated from the corresponding `src/claude/<category>/` | Must |
| AC-07 | Local and global installers both run | `lib/asset-catalog.js` is the sole source of the copy plan | Both installers produce a copy plan and manifest derived exclusively from the same catalog; no category or destination is defined in more than one place | Must |
| AC-08 | An installation runs | `settings.json` or `settings.local.json` would be candidates | Neither file is ever copied or overwritten by the installer | Must |
| AC-09 | `npm pack --dry-run` runs | The tarball contents are inspected | `src/claude/` is present; no root `.claude/` copy is present; no `tests/**` file is present; no `internal_docs/` file is present | Must |
| AC-10 | The migration is complete | `find src/claude -name "*.test.js" -o -name "fixtures" -o -name "helpers" 2>/dev/null` runs | No test files, fixtures, mocks, or test-only helpers exist under `src/claude/` | Must |
| AC-11 | The migration is complete | `ls tests/` runs | All test files previously under `.claude/scripts/tests/` now reside under the top-level `tests/` hierarchy | Must |
| AC-12 | `npm pack --dry-run` runs | The tarball is inspected | No file matching `tests/**`, `*.test.js`, fixture, mock, or test helper is present | Must |
| AC-13 | A local or global installation is performed | The installed destination is inspected | No test file, fixture, mock, or test helper is present in the installed runtime | Must |
| AC-14 | Upgrading from a version that distributed test files in the manifest | The installer runs | Orphaned test files are detected via manifest diff and moved to `.ai-toolkit-trash/` (recoverable); user files not in the manifest are not touched | Must |
| AC-15 | The migration is complete | All structural tests (frontmatter validation, presence checks, naming checks) run | They read from `src/claude/` and pass | Must |
| AC-16 | A pipeline workflow invokes `resolveClaudeRuntimeAsset()` | The effective runtime is local-only or global-only and the asset exists | The function returns the correct absolute path without mixing assets from both installations | Must |
| AC-17 | `resolveClaudeRuntimeAsset()` is called | Both local and global installations are present, or the required asset is absent from the effective installation | The function raises an explicit error with diagnostics; it does not silently fall back or return a partial result | Must |
| AC-18 | `node bin/cli.js doctor resolution --project .` runs | The toolkit repository is the working directory | Output reports: effective runtime mode, toolkit source path, local/global runtime paths, duplicate agents if any, mixed-version status, residual `.claude/` assets if any | Must |
| AC-19 | `doctor resolution` runs on the toolkit repository after migration | The repository has a global installation and no local `.claude/` runtime assets | Output reports a single runtime source (global); no duplicates or mixed versions | Must |
| AC-20 | Normal source edits are made to `src/claude/` | Claude Code's `acceptEdits` permission is active | No write-permission prompt is raised for edits under `src/claude/` | Must |
| AC-21 | `npm run toolkit:dev-install-global` is invoked | The script runs | It executes dry-run → install → version verification in sequence; it is not wired to any automated step; output confirms the installed version | Must |
| AC-22 | `npm test` and `npm pack --dry-run` are run after all changes | All phases of implementation are complete | Both commands complete successfully; no test failures, no unexpected tarball contents | Must |
| AC-23 | A developer reads `AGENTS.md`, `docs/reference.md`, or `docs/installation.md` | After migration | The documents describe the new source layout (`src/claude/`), the development workflow (edit → test → dev-install-global → new session → end-to-end test), and the installer mapping; no references to the old `.claude/` source layout remain in current documentation | Must |

## MVP vs Deferred

### MVP (must ship)
- Deterministic inventory and classification of all files under `.claude/`
- History-preserving migration of test files to `tests/**`
- History-preserving migration of runtime assets to `src/claude/**`
- `lib/asset-catalog.js` as the single source of truth for installable asset categories
  and runtime destinations
- Local installer updated: `src/claude → <target>/.claude` via catalog
- Global installer updated: per-category copy to `~/.claude/<category>` via catalog
- Replacement of FTR-014 `isDistributable()` filter with catalog membership checks
- Upgrade path: manifest-based detection and trash of previously distributed test assets
- `package.json` `files[]` updated to `src/claude`; `.claude` removed
- `resolveClaudeRuntimeAsset({ projectDir, relativePath })` in `bin/cli.js`:
  atomic local/global resolution, explicit error on mixed or incomplete installations
- `node bin/cli.js doctor resolution --project .`: read-only provenance diagnostics
- `npm run toolkit:dev-install-global` npm script (non-automated, explicit)
- `.claude/.ai-toolkit-version` removed from git tracking; added to `.gitignore`
- All remaining versioned content removed from `.claude/`
- All structural tests updated to read from `src/claude/`
- New regression tests:
  - Absence of versioned assets in root `.claude/`
  - Absence of test files under `src/claude/`
  - Catalog-driven equivalence between source and installed destination
  - `resolveClaudeRuntimeAsset()` behavior (local-only, global-only, both, missing)
  - Upgrade cleanup of previously installed test assets via manifest and trash
  - `npm pack --dry-run` content verification
- Documentation updated: `AGENTS.md`, `docs/reference.md`, `docs/installation.md`

### Deferred (next iteration)
- Configurable asset catalog (currently hard-coded in `lib/asset-catalog.js`)
- Automated migration tooling for consumer projects using the old layout
- `doctor resolution` auto-fix mode (currently read-only only)
- Per-category version stamps in the manifest
- Integration of `resolveClaudeRuntimeAsset()` into workflow scripts (follow-on, after
  resolver is stable)

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should `.claude/settings.json` (currently tracked and committing `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`) be removed from tracking and generated by the installer, or remain as a versioned toolkit-internal file? | If it stays tracked, AC-01 needs a precise definition of "runtime asset" that explicitly excludes it. If it moves to being installer-generated, the installer must create it on first install. | 
| 2 | Does `resolveClaudeRuntimeAsset()` validate completeness by checking manifest presence, by checking all catalog-listed assets, or just by checking whether the requested file exists? | Affects correctness of the "valid and complete" check and the test surface. |

## Dependencies and Assumptions
- FTR-014 (Atomic Work Breakdown) is deployed and its contract (`{PREFIX}-Work-Breakdown.json`,
  `wb-validate.js`, `wb-render.js`, `isDistributable()`) is stable. This feature replaces
  `isDistributable()` with the catalog but does not change any Work Breakdown behavior.
- The Deterministic Estimate Generation, Execution Ledger (FTR-016), Task Checkpoints and
  Resume (FTR-017), and Isolated Parallel Task Execution (FTR-018) features must not be
  started before FTR-015 ships; they all add or modify scripts and workflows whose source
  paths this feature redefines.
- `lib/asset-catalog.js` is a new module — the `lib/` directory does not currently exist in
  the repository and must be created.
- `npm test` is the only verification command; no separate compile/build step exists.
- History-preserving git moves are performed using `git mv` (or equivalent) so that `git log
  --follow` can trace asset lineage across the migration.
- Any file classified as ambiguous produces a hard stop and an explicit human decision; no
  automatic fallback is permitted.
- Open Question 1 (`.claude/settings.json` tracking) must be resolved during Tech-Spec
  generation. If unresolved, Gate 1 must not be approved.
