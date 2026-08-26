# FTR-015 — File Classification Inventory

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-015: Claude Source Layout and Runtime Resolution |
| Phase | US-01-TASK-INFRA-01 |
| Date | 2026-08-13 |
| Source command | `git ls-files .claude/` |
| Total files classified | 73 |

---

## Summary Table

| File Path | Classification | Rationale |
|-----------|---------------|-----------|
| `.claude/.ai-toolkit-version` | personal-config | Version stamp written by the installer after a successful install; records the installed toolkit version at runtime, not in version control. Resolved in Tech-Spec §9 to be removed via `git rm --cached` and added to `.gitignore`. |
| `.claude/agents/concurrency-safety-assessment.md` | runtime-asset | Agent definition file invoked by the assess-codebase pipeline at runtime; must be present in the installed `.claude/agents/` directory for Claude Code to discover and execute it. |
| `.claude/agents/define-feature.md` | runtime-asset | Agent definition file used during feature discovery; discovered and executed by Claude Code from the installed agents directory at runtime. |
| `.claude/agents/dependency-injection-refactoring.md` | runtime-asset | Agent definition file used during refactoring remediation workflows; required in the installed agents directory for pipeline execution. |
| `.claude/agents/dependency-supply-chain-security.md` | runtime-asset | Agent definition file used during security assessment workflows; required in the installed agents directory for pipeline execution. |
| `.claude/agents/developer-backend.md` | runtime-asset | Core developer agent dispatched by pm-phase2 workflow for backend implementation tasks; required in the installed agents directory at runtime. |
| `.claude/agents/developer-frontend.md` | runtime-asset | Core developer agent dispatched by pm-phase2 workflow for frontend implementation tasks; required in the installed agents directory at runtime. |
| `.claude/agents/developer-testing.md` | runtime-asset | Core developer agent dispatched by pm-phase2 workflow for testing tasks; required in the installed agents directory at runtime. |
| `.claude/agents/domain-model-refactoring.md` | runtime-asset | Agent definition file used during domain model refactoring remediation workflows; required in the installed agents directory for pipeline execution. |
| `.claude/agents/generate-requirements.md` | runtime-asset | Agent definition file invoked by pm-phase1 to produce the requirements document; required in the installed agents directory at runtime. |
| `.claude/agents/generate-tech-spec.md` | runtime-asset | Agent definition file invoked by pm-phase1 to produce the tech-spec document; required in the installed agents directory at runtime. |
| `.claude/agents/generate-work-breakdown.md` | runtime-asset | Agent definition file invoked by pm-phase2 to produce the work-breakdown document; required in the installed agents directory at runtime. |
| `.claude/agents/generic-software-assessment.md` | runtime-asset | Agent definition file invoked by am-phase1 during codebase assessments; required in the installed agents directory at runtime. |
| `.claude/agents/god-class-decomposition.md` | runtime-asset | Agent definition file used during refactoring remediation workflows; required in the installed agents directory for pipeline execution. |
| `.claude/agents/init-agents-md.md` | runtime-asset | Agent definition file used by the init skill to scaffold `AGENTS.md` in consumer projects; required in the installed agents directory at runtime. |
| `.claude/agents/install-toolkit.md` | runtime-asset | Agent definition file used by the install-toolkit skill to copy assets into consumer projects; required in the installed agents directory at runtime. |
| `.claude/agents/intervention-documentation-standard.md` | runtime-asset | Agent definition file invoked by am-phase1 to produce intervention documents; required in the installed agents directory at runtime. |
| `.claude/agents/layered-architecture-assessment.md` | runtime-asset | Agent definition file invoked by am-phase1 during architecture assessments; required in the installed agents directory at runtime. |
| `.claude/agents/review-solution.md` | runtime-asset | Agent definition file invoked by pm-phase3 for solution review; required in the installed agents directory at runtime. |
| `.claude/agents/security-hardening.md` | runtime-asset | Agent definition file used during security hardening remediation workflows; required in the installed agents directory for pipeline execution. |
| `.claude/agents/validate-feature-docs.md` | runtime-asset | Agent definition file invoked by pm-phase1 to validate requirements and tech-spec quality; required in the installed agents directory at runtime. |
| `.claude/agents/validate-work-breakdown-semantic.md` | runtime-asset | Agent definition file invoked by pm-phase2 to validate the work breakdown semantics; required in the installed agents directory at runtime. |
| `.claude/commands/assessment-status.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/assessment-status` command. |
| `.claude/commands/check-docs.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/check-docs` command. |
| `.claude/commands/check-interventions.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/check-interventions` command. |
| `.claude/commands/feature-status.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/feature-status` command. |
| `.claude/commands/next-intervention.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/next-intervention` command. |
| `.claude/commands/next-task.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/next-task` command. |
| `.claude/commands/pr-description.md` | runtime-asset | Slash command definition discovered and executed by Claude Code at runtime; must be installed in `.claude/commands/` to be available as a `/pr-description` command. |
| `.claude/scripts/.gitkeep` | ambiguous | Empty placeholder file; its sole purpose is to preserve the `.claude/scripts/` directory in git when no other tracked files exist there. Not consumed by agents or workflows at runtime, and not a test file. See notes below. |
| `.claude/scripts/tests/fixtures/ac-table-format.md` | test-only | Fixture file used by wb-validate tests to provide a sample acceptance-criteria table format; only referenced during test execution, never at pipeline runtime. |
| `.claude/scripts/tests/fixtures/test-feature/TEST-001-Work-Breakdown.json` | test-only | Fixture work-breakdown JSON used by wb-validate and pm-phase2 test suites; only referenced during test execution. |
| `.claude/scripts/tests/fixtures/test-feature/TEST-001-semantic-output.json` | test-only | Fixture containing expected semantic validation output; only referenced during test execution. |
| `.claude/scripts/tests/fixtures/test-feature/feature.md` | test-only | Fixture feature document used by test suites to simulate a real feature input; only referenced during test execution. |
| `.claude/scripts/tests/fixtures/wb-invalid-bad-domain.json` | test-only | Fixture work-breakdown JSON with an invalid domain value; used by wb-validate tests to verify domain validation. |
| `.claude/scripts/tests/fixtures/wb-invalid-cycle.json` | test-only | Fixture work-breakdown JSON containing a dependency cycle; used by wb-validate tests to verify cycle detection. |
| `.claude/scripts/tests/fixtures/wb-invalid-duplicate-id.json` | test-only | Fixture work-breakdown JSON with duplicate task IDs; used by wb-validate tests to verify ID uniqueness checks. |
| `.claude/scripts/tests/fixtures/wb-invalid-missing-field.json` | test-only | Fixture work-breakdown JSON with a missing required field; used by wb-validate tests to verify schema validation. |
| `.claude/scripts/tests/fixtures/wb-valid.json` | test-only | Fixture work-breakdown JSON representing a fully valid input; used by multiple wb-validate and wb-render tests. |
| `.claude/scripts/tests/helpers/buildWaves.js` | test-only | Test helper providing a shared `buildWaves()` utility for constructing wave structures in test setups; imported only by test files. |
| `.claude/scripts/tests/helpers/pm-phase2-flow.js` | test-only | Test helper providing pm-phase2 orchestration flow utilities for test setup; imported only by pm-phase2 test files. |
| `.claude/scripts/tests/helpers/pm-phase2-gate2.js` | test-only | Test helper providing gate-2 payload construction utilities for pm-phase2 tests; imported only by test files. |
| `.claude/scripts/tests/helpers/pm-phase2-ledger.js` | test-only | Test helper providing ledger construction utilities for pm-phase2 tests; imported only by test files. |
| `.claude/scripts/tests/installer.scripts-distribution.test.js` | test-only | Jest test file verifying which scripts the installer distributes; part of the regression test suite for FTR-014. |
| `.claude/scripts/tests/pm-phase2.gate2-payload.test.js` | test-only | Jest test file verifying the gate-2 payload structure produced by pm-phase2; runs only during `npm test`. |
| `.claude/scripts/tests/pm-phase2.ledger-transitions.test.js` | test-only | Jest test file verifying token ledger state transitions during pm-phase2 execution; runs only during `npm test`. |
| `.claude/scripts/tests/pm-phase2.orchestration-flow.test.js` | test-only | Jest test file verifying the pm-phase2 orchestration flow and agent dispatch sequence; runs only during `npm test`. |
| `.claude/scripts/tests/verify-us-01-t03.js` | test-only | One-off verification script for a specific user-story task acceptance check; located under tests/ and not part of the distributed runtime. |
| `.claude/scripts/tests/verify-us-03-t04.js` | test-only | One-off verification script for a specific user-story task acceptance check; located under tests/ and not part of the distributed runtime. |
| `.claude/scripts/tests/wb-render.checks-md-csv-deps.test.js` | test-only | Jest test file verifying wb-render markdown/CSV output and dependency handling; runs only during `npm test`. |
| `.claude/scripts/tests/wb-render.checks-sanitize-commit-paths.test.js` | test-only | Jest test file verifying wb-render commit path sanitization logic; runs only during `npm test`. |
| `.claude/scripts/tests/wb-render.regression-pm-phase3-csv.test.js` | test-only | Jest regression test file verifying wb-render CSV output format compatibility with pm-phase3; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-1-7.test.js` | test-only | Jest test file covering wb-validate validation checks 1–7; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-11.test.js` | test-only | Jest test file covering wb-validate validation check 11; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-12-14.test.js` | test-only | Jest test file covering wb-validate validation checks 12–14; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-15-18.test.js` | test-only | Jest test file covering wb-validate validation checks 15–18; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-19-21.test.js` | test-only | Jest test file covering wb-validate validation checks 19–21; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-22-23-report.test.js` | test-only | Jest test file covering wb-validate validation checks 22–23 and report output; runs only during `npm test`. |
| `.claude/scripts/tests/wb-validate.checks-8-10.test.js` | test-only | Jest test file covering wb-validate validation checks 8–10; runs only during `npm test`. |
| `.claude/scripts/wb-render.js` | runtime-asset | Utility script invoked by pm-phase2.js at pipeline runtime to render the work-breakdown markdown and CSV outputs; currently called as `node .claude/scripts/wb-render.js` in the workflow (to be replaced with `ai-toolkit run-asset` per FTR-015). |
| `.claude/scripts/wb-validate.js` | runtime-asset | Utility script invoked by pm-phase2.js at pipeline runtime to validate a work-breakdown JSON against schema and semantic rules; currently called as `node .claude/scripts/wb-validate.js` in the workflow (to be replaced with `ai-toolkit run-asset` per FTR-015). |
| `.claude/settings.json` | personal-config | Claude Code session configuration that sets `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`; user-specific and already removed from the local working tree. Resolved in Tech-Spec §8.1 to be removed from git tracking via `git rm --cached` and added to `.gitignore`; never moved, never generated or distributed by the installer. |
| `.claude/skills/assess-codebase/SKILL.md` | runtime-asset | Skill definition file that Claude Code discovers at runtime to expose the `/assess-codebase` slash skill; must be installed in `.claude/skills/` for the skill to be available. |
| `.claude/skills/define-feature/SKILL.md` | runtime-asset | Skill definition file that Claude Code discovers at runtime to expose the define-feature skill; must be installed in `.claude/skills/` for the skill to be available. |
| `.claude/skills/hi-gaia/SKILL.md` | runtime-asset | Skill definition file that Claude Code discovers at runtime to expose the `/hi-gaia` slash skill; must be installed in `.claude/skills/` for the skill to be available. |
| `.claude/skills/implement-feature/SKILL.md` | runtime-asset | Skill definition file that Claude Code discovers at runtime to expose the `/implement-feature` slash skill; must be installed in `.claude/skills/` for the skill to be available. |
| `.claude/skills/init-agents/SKILL.md` | runtime-asset | Skill definition file that Claude Code discovers at runtime to expose the init-agents skill; must be installed in `.claude/skills/` for the skill to be available. |
| `.claude/skills/install-toolkit/SKILL.md` | runtime-asset | Skill definition file that Claude Code discovers at runtime to expose the install-toolkit skill; must be installed in `.claude/skills/` for the skill to be available. |
| `.claude/workflows/am-phase1.js` | runtime-asset | Claude Code Workflow orchestrator script for assessment phase 1; executed by the assess-codebase skill via the workflow runtime and must be present in the installed `.claude/workflows/` directory. |
| `.claude/workflows/am-phase2.js` | runtime-asset | Claude Code Workflow orchestrator script for assessment phase 2; executed by the assess-codebase skill via the workflow runtime and must be present in the installed `.claude/workflows/` directory. |
| `.claude/workflows/pm-phase1.js` | runtime-asset | Claude Code Workflow orchestrator script for feature delivery phase 1; executed by the implement-feature skill and must be present in the installed `.claude/workflows/` directory. |
| `.claude/workflows/pm-phase2.js` | runtime-asset | Claude Code Workflow orchestrator script for feature delivery phase 2; executed by the implement-feature skill and must be present in the installed `.claude/workflows/` directory. |
| `.claude/workflows/pm-phase3.js` | runtime-asset | Claude Code Workflow orchestrator script for feature delivery phase 3; executed by the implement-feature skill and must be present in the installed `.claude/workflows/` directory. |

---

## Classification Counts

| Classification | Count |
|---------------|-------|
| runtime-asset | 41 |
| test-only | 29 |
| personal-config | 2 |
| ambiguous | 1 |
| **Total** | **73** |

### runtime-asset breakdown

| Subcategory | Count |
|-------------|-------|
| `.claude/agents/*.md` | 21 |
| `.claude/commands/*.md` | 7 |
| `.claude/skills/*/SKILL.md` | 6 |
| `.claude/workflows/*.js` | 5 |
| `.claude/scripts/*.js` | 2 |
| **Total runtime-asset** | **41** |

### test-only breakdown

| Subcategory | Count |
|-------------|-------|
| `tests/fixtures/**` | 9 |
| `tests/helpers/**` | 4 |
| `tests/*.test.js` | 14 |
| `tests/verify-*.js` | 2 |
| **Total test-only** | **29** |

---

## Notes on Ambiguous Cases

### `.claude/scripts/.gitkeep`

**Classification: ambiguous**

This is an empty git placeholder file whose sole purpose is to keep the `.claude/scripts/` directory tracked in git when no non-test files are committed there directly (the actual scripts `wb-validate.js` and `wb-render.js` are tracked separately). The file is:
- Not referenced by any agent, workflow, or skill at runtime
- Not a test file, fixture, or helper
- Not a configuration file — it carries no configuration data
- Structurally invisible to the installer and to Claude Code

**Disposition decision required before migration:**

Because this file exists only to preserve the directory in git, it will become unnecessary once `wb-validate.js` and `wb-render.js` are the only tracked files in `.claude/scripts/`. After those two scripts are moved to `src/claude/scripts/` (Phase 3 of migration), the `.gitkeep` should be deleted, and a new `.gitkeep` (or the real scripts) should be added under `src/claude/scripts/` if necessary to preserve that directory before any scripts are moved there.

**No action required before Phase 3.** The file is not moved and not distributed; it is simply deleted when the `git mv` of `wb-render.js` and `wb-validate.js` makes it redundant.

---

## Decisions Encoded Here

| Decision | Basis |
|----------|-------|
| `.claude/settings.json` → personal-config, not runtime-asset | Tech-Spec §8.1 and Open Question 1 resolution: file removed from git tracking via `git rm --cached`; not moved, not generated, not distributed. NEVER_COPY protection already applied in installer. |
| `.claude/.ai-toolkit-version` → personal-config, not runtime-asset | Tech-Spec §9 (Removed from git tracking): written by installer after install; version stamp is runtime state, not versioned source. Added to `.gitignore`. |
| `wb-validate.js` and `wb-render.js` → runtime-asset, not test-only | Both scripts are invoked by pm-phase2.js at pipeline runtime (as `node .claude/scripts/wb-*.js`); they are production utilities, not test helpers. Their tests live under `.claude/scripts/tests/`, not alongside the scripts themselves. |
| `verify-us-01-t03.js` and `verify-us-03-t04.js` → test-only | Located under `.claude/scripts/tests/`; named as verification scripts for specific task acceptance criteria; not invoked by any workflow or agent at pipeline runtime. |
| All `.claude/skills/install-toolkit/SKILL.md` → runtime-asset | The install-toolkit skill is a runtime asset (it is used as a skill entry point by Claude Code); whether it is distributed to consumer projects is a separate installer concern (AGENTS.md notes it is excluded from consumer installs, but it remains a runtime asset in the toolkit's own installation). |

---

## BR-01 Compliance

Per Business Rule BR-01 (Requirements §3): no file is moved automatically without a documented known destination. This classification document serves as the migration pre-condition required by BR-01 and UC-01 postconditions. No file moves may begin until this inventory is reviewed and all ambiguous cases are resolved.

**Blocking items before Phase 2 (test migration) can begin:**
- None. The single ambiguous file (`.claude/scripts/.gitkeep`) has a clear disposition (delete during Phase 3; no move required) and does not block test file migration.

**Blocking items before Phase 3 (runtime asset migration) can begin:**
- `.claude/scripts/.gitkeep` disposition must be confirmed: delete this file as part of or immediately before the `git mv` of `wb-validate.js` and `wb-render.js` to `src/claude/scripts/`.
