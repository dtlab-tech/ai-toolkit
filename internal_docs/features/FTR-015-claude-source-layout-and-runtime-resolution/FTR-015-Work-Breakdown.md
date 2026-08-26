# Work Breakdown — FTR-015

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-015 |
| Schema | v2 |
| Generated | 2026-08-13T10:54:30.323Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 48 |
| Total phases | 10 |
| Within target (≤15 min) | 46 |
| Above target (16–20 min) | 2 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 18, FE: 0, DB: 0, DevOps: 0, INFRA: 11, TEST: 19 |

## Infrastructure Phase (INFRA)

### Commit
feat(FTR-015): shared infrastructure setup

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| INFRA-TASK-BE-01 | Create lib/asset-catalog.js module with asset categories | lib/asset-catalog.js exports ASSET_CATEGORIES array, getAssetCategories(), and getCategoryByName() functions defining all installable asset categories | BE | 10 | — | test -f lib/asset-catalog.js; node -e "require('./lib/asset-catalog').getAssetCategories()" |
| INFRA-TASK-TEST-01 | Add asset-catalog.test.js unit tests | tests/cli/asset-catalog.test.js exists with tests verifying catalog structure, category names, source/runtime paths, and exports | TEST | 10 | INFRA-TASK-BE-01 | test -f tests/cli/asset-catalog.test.js; npm test -- --testPathPattern=asset-catalog |
| INFRA-TASK-BE-02 | Add resolveClaudeRuntimeAsset() function with Phase 0 input validation | bin/cli.js exports resolveClaudeRuntimeAsset() implementing six-phase algorithm with Phase 0 validation for empty/absolute/traversal/null-byte checks | BE | 18 | INFRA-TASK-BE-01 | node --check bin/cli.js; node -e "require('./bin/cli').resolveClaudeRuntimeAsset" |
| INFRA-TASK-TEST-02 | Add resolver.test.js comprehensive unit tests for resolveClaudeRuntimeAsset() | tests/cli/resolver.test.js exists with tests covering all six phases: A (detection), B (mode decision), C (metadata warnings), D (completeness), E (return), Phase 0 (input validation) | TEST | 18 | INFRA-TASK-BE-02 | test -f tests/cli/resolver.test.js; npm test -- --testPathPattern=resolver.test |

## User Story Phases

### US-01: Classify all files under .claude/ so that migration is planned accurately

### Commit
feat(FTR-015): implement US-01 classify files

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-INFRA-01 | Create file classification inventory document | FTR-015-Classification.md documents all tracked .claude/ files with classification (runtime asset, test-only, personal config, ambiguous) and rationale | INFRA | 12 | — | test -f internal_docs/features/FTR-015-claude-source-layout-and-runtime-resolution/FTR-015-Classification.md |

### US-02: Migrate test files from .claude/scripts/tests/ to tests/ so tests are organized separately

### Commit
feat(FTR-015): implement US-02 migrate test files

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Execute git mv to migrate test files to tests/ | All test files, fixtures, helpers moved from .claude/scripts/tests/ to tests/ via git mv; no git history lost; .claude/scripts/tests/ empty | BE | 8 | US-01-TASK-INFRA-01 | test -d tests/; test -z "$(find .claude/scripts/tests -type f 2>/dev/null)" |
| US-02-TASK-BE-02 | Update import paths in migrated test files | All imports in tests/ reference correct relative paths; no broken imports; npm test can discover and run all tests | BE | 12 | US-02-TASK-BE-01 | node --check bin/cli.js; npm test -- --bail |
| US-02-TASK-INFRA-01 | Update jest.config.js for tests/ location | jest.config.js testMatch/testPathIgnore patterns reference tests/ instead of .claude/scripts/tests/ | INFRA | 4 | US-02-TASK-BE-01 | grep -q tests/ jest.config.js |
| US-02-TASK-INFRA-02 | Update package.json test scripts | package.json test scripts reference new tests/ location; npm test executes all tests | INFRA | 3 | US-02-TASK-BE-01 | npm test -- --listTests |
| US-02-TASK-TEST-01 | Verify all tests pass after migration | npm test executes all tests from tests/ and exits with code 0; no failures | TEST | 10 | US-02-TASK-BE-02, US-02-TASK-INFRA-01, US-02-TASK-INFRA-02 | npm test |

### US-03: Migrate runtime assets to src/claude/ so source is in unprotected directory

### Commit
feat(FTR-015): implement US-03 migrate runtime assets

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Execute git mv of runtime assets to src/claude/ | agents, commands, skills, workflows, scripts directories moved to src/claude/ via git mv; no git history lost; .claude/ versions empty | BE | 8 | US-02-TASK-TEST-01 | test -d src/claude/agents; test -d src/claude/workflows; test -z "$(find .claude/agents .claude/workflows -type f 2>/dev/null)" |
| US-03-TASK-BE-02 | Verify migration completeness | All runtime assets present under src/claude/; no versioned assets remain in .claude/ runtime directories | BE | 5 | US-03-TASK-BE-01 | test "$(find src/claude -type f   wc -l)" -gt 20; test -z "$(find .claude/agents .claude/commands .claude/skills .claude/workflows .claude/scripts -type f 2>/dev/null)" |

### US-04: Update npm packaging to distribute src/claude/ so published packages contain only runtime

### Commit
feat(FTR-015): implement US-04 update npm packaging

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-INFRA-01 | Update package.json files[] array | package.json files[] includes src/claude; does not include .claude; npm pack produces tarball with correct contents | INFRA | 4 | US-03-TASK-BE-02 | grep -q '\"src/claude\"' package.json; ! grep '\"\./\.claude\"' package.json |
| US-04-TASK-TEST-01 | Add comprehensive npm pack tarball content regression test | tests/regression/npm-pack-contents.test.js verifies tarball includes src/claude/ and bin/; excludes .claude/ runtime dirs, tests/, internal_docs/, *.test.js files; asserts src/claude/ non-empty and contains expected categories | TEST | 14 | US-04-TASK-INFRA-01 | test -f tests/regression/npm-pack-contents.test.js; npm test -- --testPathPattern=npm-pack-contents |

### US-05: Create asset catalog and update installers to use catalog-driven copy plans

### Commit
feat(FTR-015): implement US-05 catalog and installers

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Update expandMappings() to read from asset catalog | bin/cli.js expandMappings() reads from getAssetCategories() and derives mappings programmatically for both local and global installers | BE | 12 | INFRA-TASK-BE-01, US-04-TASK-TEST-01 | node --check bin/cli.js; npm test -- --testPathPattern=installer |
| US-05-TASK-BE-02 | Remove isDistributable() and use catalog membership | isDistributable() removed; installer validates against catalog positive-list only; no exclusion filters remain | BE | 8 | US-05-TASK-BE-01 | ! grep -q isDistributable bin/cli.js; npm test -- --testPathPattern=installer |
| US-05-TASK-BE-03 | Add validatePurityGuard() function | bin/cli.js exports validatePurityGuard(sourceDir) rejecting *.test.js, tests/, fixtures/, mocks/, helpers/ under src/claude/; exports validate-purity CLI command | BE | 12 | INFRA-TASK-BE-01 | node --check bin/cli.js; npm test -- --testPathPattern=purity |
| US-05-TASK-INFRA-01 | Add toolkit:validate-purity script and prepack hook | package.json includes toolkit:validate-purity script and prepack lifecycle hook; npm pack fails if test files under src/claude/ | INFRA | 5 | US-05-TASK-BE-03 | grep -q toolkit:validate-purity package.json; grep -q prepack package.json |
| US-05-TASK-BE-04 | Add --dry-run flag to install commands | bin/cli.js install accepts --dry-run; when set, outputs plan but copies no files, writes no manifest, writes no version stamp | BE | 10 | US-05-TASK-BE-01 | node --check bin/cli.js; npm test -- --testPathPattern=dry-run |
| US-05-TASK-BE-05 | Implement upgrade path for orphaned files | Installer detects orphaned files from old manifest; moves to .claude/.ai-toolkit-trash/ with timestamp; updates manifest | BE | 12 | US-05-TASK-BE-01 | npm test -- --testPathPattern=upgrade |
| US-05-TASK-TEST-01 | Add installer-dry-run.test.js | tests/cli/installer-dry-run.test.js verifies --dry-run leaves destination byte-identical; no copies, manifests, version stamps | TEST | 12 | US-05-TASK-BE-04 | test -f tests/cli/installer-dry-run.test.js; npm test -- --testPathPattern=dry-run |
| US-05-TASK-TEST-02 | Add purity-guard.test.js | tests/cli/purity-guard.test.js verifies guard blocks test files and dirs; allows normal files; runs before copy | TEST | 11 | US-05-TASK-BE-03 | test -f tests/cli/purity-guard.test.js; npm test -- --testPathPattern=purity |

### US-06: Implement runtime asset resolution with CLI commands so workflows can locate and execute assets

### Commit
feat(FTR-015): implement US-06 asset resolution

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-06-TASK-BE-01 | Add resolve-asset CLI command | bin/cli.js resolve-asset command outputs absolute path or error; three-tier stdout/stderr/exit model; accepts --project, relativePath, --home | BE | 12 | INFRA-TASK-BE-02 | node --check bin/cli.js; npm test -- --testPathPattern=resolve-asset-cli |
| US-06-TASK-BE-02 | Add run-asset CLI command with security constraints | bin/cli.js run-asset: scripts category only, .js extension, spawnSync shell:false, argv array forwarding, exit code propagation | BE | 13 | INFRA-TASK-BE-02 | node --check bin/cli.js; npm test -- --testPathPattern=run-asset-cli |
| US-06-TASK-BE-03 | Add list-assets CLI command | bin/cli.js list-assets returns sorted lexicographic paths for category; JSON/plain output; exit 0 empty, exit 1 unknown category | BE | 11 | INFRA-TASK-BE-02 | node --check bin/cli.js; npm test -- --testPathPattern=list-assets-cli |
| US-06-TASK-TEST-01 | Add resolve-asset-cli.test.js | tests/cli/resolve-asset-cli.test.js tests Tier 1/2/3 outputs, path traversal, non-catalog rejection, --home isolation | TEST | 12 | US-06-TASK-BE-01 | test -f tests/cli/resolve-asset-cli.test.js; npm test -- --testPathPattern=resolve-asset-cli |
| US-06-TASK-TEST-02 | Add run-asset-cli.test.js | tests/cli/run-asset-cli.test.js tests execution, category/extension rejection, arg forwarding, exit propagation, injection prevention | TEST | 12 | US-06-TASK-BE-02 | test -f tests/cli/run-asset-cli.test.js; npm test -- --testPathPattern=run-asset-cli |
| US-06-TASK-TEST-03 | Add list-assets-cli.test.js | tests/cli/list-assets-cli.test.js tests JSON/plain output, empty category, unknown category, deterministic ordering, --home | TEST | 11 | US-06-TASK-BE-03 | test -f tests/cli/list-assets-cli.test.js; npm test -- --testPathPattern=list-assets-cli |
| US-06-TASK-BE-04 | Update pm-phase2.js to use ai-toolkit run-asset | src/claude/workflows/pm-phase2.js invokes wb-validate.js, wb-render.js via ai-toolkit run-asset; no node .claude/scripts paths; no __dirname | BE | 9 | US-06-TASK-BE-02, US-03-TASK-BE-02 | grep -q 'ai-toolkit run-asset' src/claude/workflows/pm-phase2.js; ! grep 'node .claude/scripts' src/claude/workflows/pm-phase2.js |
| US-06-TASK-TEST-04 | Add E2E resolution tests in tests/e2e/resolution.test.js | tests/e2e/resolution.test.js: automated tests using execFileSync/argv array, --home on all cases, temp dirs with spaces, process.execPath; covers local-only, global-only, both, none modes | TEST | 15 | US-06-TASK-BE-01, US-06-TASK-BE-03 | test -f tests/e2e/resolution.test.js; npm test -- --testPathPattern=e2e/resolution |
| US-06-TASK-TEST-05 | Add E2E workflow facade tests in tests/e2e/workflow-facade.test.js | tests/e2e/workflow-facade.test.js: automated E2E tests for run-asset execution, arg forwarding, exit code propagation; uses argv array, --home isolation | TEST | 11 | US-06-TASK-BE-02 | test -f tests/e2e/workflow-facade.test.js; npm test -- --testPathPattern=e2e/workflow-facade |

### US-07: Implement doctor resolution diagnostics command for installation verification

### Commit
feat(FTR-015): implement US-07 doctor resolution

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-07-TASK-BE-01 | Add doctor resolution CLI command | bin/cli.js doctor resolution: outputs human-readable diagnostics (mode, paths, duplicates, manifest, residuals); read-only; no modifications | BE | 13 | INFRA-TASK-BE-02 | node --check bin/cli.js; npm test -- --testPathPattern=doctor-resolution |
| US-07-TASK-TEST-01 | Add doctor-resolution.test.js | tests/cli/doctor-resolution.test.js tests local-only, global-only, both, none; missing/corrupt manifest; residual assets | TEST | 11 | US-07-TASK-BE-01 | test -f tests/cli/doctor-resolution.test.js; npm test -- --testPathPattern=doctor-resolution |

### US-08: Update development workflow and documentation for new source layout

### Commit
feat(FTR-015): implement US-08 dev workflow

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-08-TASK-BE-01 | Update am-phase1.js Discovery agent prompt for list-assets | src/claude/workflows/am-phase1.js Discovery agent prompt instructs agent to run ai-toolkit list-assets --category agents --format json; uses agent() to invoke; no spawnSync/require/child_process/__dirname in am-phase1.js | BE | 8 | US-06-TASK-BE-03, US-03-TASK-BE-02 | grep -q 'list-assets.*agents.*json' src/claude/workflows/am-phase1.js; ! grep -q 'spawnSync' src/claude/workflows/am-phase1.js; ! grep -q 'child_process' src/claude/workflows/am-phase1.js |
| US-08-TASK-BE-02 | Update install-toolkit.md agent prompt | src/claude/agents/install-toolkit.md prompt delegates to ai-toolkit install --project <target> (or --global); no CWD assumption | BE | 6 | US-06-TASK-BE-01 | grep -q 'ai-toolkit install' src/claude/agents/install-toolkit.md |
| US-08-TASK-TEST-01 | Add am-phase1-static.test.js regression test | tests/regression/am-phase1-static.test.js: four assertions: no spawnSync, no child_process, no hardcoded .claude/agents, includes list-assets in prompt | TEST | 9 | US-08-TASK-BE-01 | test -f tests/regression/am-phase1-static.test.js; npm test -- --testPathPattern=am-phase1-static |
| US-08-TASK-INFRA-01 | Add npm run toolkit:dev-install-global script | package.json includes toolkit:dev-install-global: dry-run → install → verify; not wired to automated steps | INFRA | 7 | US-05-TASK-BE-04 | grep -q toolkit:dev-install-global package.json |
| US-08-TASK-INFRA-02 | Execute git rm --cached for version and settings files | Files .claude/.ai-toolkit-version and .claude/settings.json removed from git tracking; files may remain on filesystem | INFRA | 3 | US-03-TASK-BE-02 | test -z "$(git ls-files --cached .claude/.ai-toolkit-version .claude/settings.json)" |
| US-08-TASK-INFRA-03 | Add .claude entries to .gitignore | .gitignore includes .claude/.ai-toolkit-version, .claude/settings.json, .claude/settings.local.json | INFRA | 3 | US-08-TASK-INFRA-02 | grep -q '.ai-toolkit-version' .gitignore; grep -q 'settings' .gitignore |
| US-08-TASK-INFRA-04 | Update AGENTS.md documentation | AGENTS.md describes src/claude/ as source location; no references to .claude/ as versioned source; documents permission elimination | INFRA | 10 | US-03-TASK-BE-02 | grep -q 'src/claude' AGENTS.md; ! grep -q 'versioned source.*\.claude' AGENTS.md |
| US-08-TASK-INFRA-05 | Update docs/reference.md documentation | docs/reference.md documents resolveClaudeRuntimeAsset(), resolve-asset, run-asset, list-assets, doctor resolution; references src/claude/ | INFRA | 12 | INFRA-TASK-BE-02, US-06-TASK-BE-01, US-07-TASK-BE-01 | grep -q 'resolveClaudeRuntimeAsset' docs/reference.md; grep -q 'resolve-asset' docs/reference.md; grep -q 'run-asset' docs/reference.md; grep -q 'list-assets' docs/reference.md; grep -q 'doctor resolution' docs/reference.md; grep -q 'src/claude' docs/reference.md |
| US-08-TASK-INFRA-06 | Update docs/installation.md documentation | docs/installation.md describes asset catalog, installer mapping, upgrade path, trash, and dev workflow (toolkit:dev-install-global) | INFRA | 12 | INFRA-TASK-BE-01, US-05-TASK-BE-01 | grep -q 'asset.catalog' docs/installation.md; grep -q 'upgrade' docs/installation.md |

### US-09: Verify migration completeness and prevent regressions through comprehensive testing

### Commit
feat(FTR-015): implement US-09 migration verification

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-09-TASK-TEST-01 | Update frontmatter validation tests to read from src/claude/ | tests/frontmatter/agents.test.js, skills.test.js discover from src/claude/ instead of .claude/; all frontmatter tests pass | TEST | 8 | US-03-TASK-BE-02 | grep -q 'src.*claude' tests/frontmatter/agents.test.js; npm test -- --testPathPattern=frontmatter |
| US-09-TASK-TEST-02 | Add regression test for no versioned assets in .claude/ | tests/regression/no-versioned-assets-in-dot-claude.test.js verifies no agents, commands, skills, workflows, scripts under .claude/ root dirs | TEST | 8 | US-03-TASK-BE-02 | test -f tests/regression/no-versioned-assets-in-dot-claude.test.js; npm test -- --testPathPattern=no-versioned |
| US-09-TASK-TEST-03 | Add regression test for no test files under src/claude/ | tests/regression/no-test-files-in-src-claude.test.js verifies no *.test.js, tests/, fixtures/, mocks/, helpers/ under src/claude/ | TEST | 8 | US-03-TASK-BE-02 | test -f tests/regression/no-test-files-in-src-claude.test.js; npm test -- --testPathPattern=no-test-files |
| US-09-TASK-TEST-04 | Add catalog equivalence regression test | tests/regression/catalog-equivalence.test.js verifies source dirs exist, runtime destinations created, files accounted for | TEST | 10 | INFRA-TASK-BE-01, US-05-TASK-BE-01 | test -f tests/regression/catalog-equivalence.test.js; npm test -- --testPathPattern=equivalence |
| US-09-TASK-TEST-06 | Add upgrade orphan cleanup regression test | tests/regression/upgrade-orphan-cleanup.test.js verifies orphaned files moved to .ai-toolkit-trash/ on upgrade | TEST | 11 | US-05-TASK-BE-05 | test -f tests/regression/upgrade-orphan-cleanup.test.js; npm test -- --testPathPattern=upgrade-orphan |
| US-09-TASK-TEST-07 | Run full test suite and verify all tests pass | npm test executes all unit, structural, regression, E2E tests and exits 0; no failures; migration verified complete | TEST | 12 | US-09-TASK-TEST-01, US-09-TASK-TEST-02, US-09-TASK-TEST-03, US-09-TASK-TEST-04, US-09-TASK-TEST-06 | npm test |

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 18 | 17 | 1 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 11 | 11 | 0 | 0 | 0 |
| TEST | 19 | 18 | 1 | 0 | 0 |
| **Total** | **48** | **46** | **2** | **0** | **0** |
