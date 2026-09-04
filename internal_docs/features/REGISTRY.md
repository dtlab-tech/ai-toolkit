# Feature Registry

This file is maintained automatically by the Project Manager.
Each entry summarises a feature for cross-reference by future features.

---

## FTR-001 — Assessment Pipeline Token Estimation
**Keywords:** token-estimation, cost-tracking, assessment-manager, assess-codebase, Token-Estimate.md, blended-cost, usage-block
**Status:** completed
**Summary:** Extends `assessment-manager` to write `{PREFIX}-Token-Estimate.md` at end of Phase 3, progressively populating it with per-agent estimated and actual token/cost rows through Phases 4 and 6. The `assess-codebase` skill appends the orchestrator row, Actuals vs Estimate section, estimation accuracy by model table, and final grand total at pipeline end. Aligns trend thresholds (5%, arrow symbols) and column headers across `token-estimation.md` and the skill. Missing `<usage>` blocks and missing `docs/pricing.md` are handled gracefully (N/A rows, pipeline continues).
→ [Detail](FTR-001-assessment-token-estimation/feature.md)

---

## FTR-002 — Assessment Pipeline Effort Estimation
**Keywords:** effort-estimation, wall-clock, duration, assessment-manager, Effort-Estimate.md, process-log, remediation-rates, severity-counts
**Status:** completed
**Summary:** Extends `assessment-manager` to write `{PREFIX}-Effort-Estimate.md` at end of Phase 3 (assessment agent durations from process log timestamps, batch wall-clock) and finalise it at end of Phase 4 (intervention-documentation-standard row + remediation effort section derived from Interventions Index using fixed rates CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h). Remediation effort summary displayed at the Findings Gate. File is frozen after Phase 5. No skill-level append step (contrast with FTR-001).
→ [Detail](FTR-002-assessment-effort-estimation/feature.md)

---

## FTR-003 — Assessment Pipeline Scope Reduction
**Keywords:** read-only, findings-gate, acknowledgement, flagging, assessment-manager, assessment-findings-gate.md, Approvals.md, remediation-removal
**Status:** completed
**Summary:** Makes the assessment pipeline fully read-only. Removes Phase 6 (remediation implementation) and Phase 7 (PR creation) from `assessment-manager`. Replaces the Remediation Gate with a two-step Findings Gate: mandatory acknowledgement (Step 5a) + optional INT-NNN flagging for feature delivery (Step 5b). Renames `assessment-approval-gate.md` → `assessment-findings-gate.md`. New `{PREFIX}-Approvals.md` format: every intervention gets a Flagged: Yes/No row. Removes remediation placeholder from Token Estimate (replaced with static note). Updates `assess-codebase` skill description.
→ [Detail](FTR-003-assessment-scope-reduction/feature.md)

---

## FTR-004 — Assessment Registry
**Keywords:** registry, assessment-history, assessment-manager, registry.md, severity-counts, flagged-count, Interventions-Index, Approvals
**Status:** completed
**Summary:** Extends `assessment-manager` Phase 6 to append one row to `docs/assessments/registry.md` after each completed assessment (Findings Gate acknowledged, `{PREFIX}-Approvals.md` written). Severity counts are sourced from `{PREFIX}-Interventions-Index.md`; flagged count from `{PREFIX}-Approvals.md`. File is created on first run with a Markdown table header; subsequent runs append without validating existing rows. Two data contracts (Interventions Index and Approvals file formats) are documented in Phase 6. Registry write is conditional on `{PREFIX}-Approvals.md` existing; all error paths are non-fatal to the pipeline.
→ [Detail](FTR-004-assessment-registry/feature.md)

---

## FTR-005 — Assessment Intervention Commands
**Keywords:** next-intervention, check-interventions, commands, Approvals.md, Interventions-Index, feature-delivery-handoff, reconciliation, flagged-interventions
**Status:** defined
**Summary:** Adds two read-only commands — `/next-intervention [prefix]` and `/check-interventions [prefix]` — that bridge the assessment pipeline output to the feature delivery pipeline. `/next-intervention` reads `{PREFIX}-Approvals.md`, finds the first flagged INT-NNN without a corresponding feature folder in `internal_docs/features/` or `docs/features/`, and outputs the exact `/define-feature` invocation. `/check-interventions` produces a full reconciliation table: every intervention cross-referenced against the Interventions Index, the INT-NNN document files on disk, and existing feature folders. Both commands are strictly read-only (allowed tools: Read, Glob, Grep). Depend on the FTR-003 Approvals file format.
→ [Detail](FTR-005-assessment-intervention-commands/feature.md)

---

## FTR-007 — Explicit Per-Agent Model Assignment
**Keywords:** model-frontmatter, per-agent-model, sonnet, opus, haiku, cost-efficiency, agent-config, OPT-01, token-optimization
**Status:** completed
**Summary:** Adds an explicit `model:` YAML frontmatter key to the 15 agents in `.claude/agents/` that lacked one, so every agent declares its cost-appropriate tier instead of inheriting the session model (often Opus). Mapping: `sonnet` for the 14 coordination/implementation agents (incl. `project-manager`, `assessment-manager`, all developers, all refactoring/security agents, `define-feature`, `init-agents-md`, `install-toolkit`, `intervention-documentation-standard`); `opus` for `review-solution` only; the 7 pre-set `haiku` agents left untouched. Pure config change — no prompt-body, behavior, or pipeline logic altered. Bare aliases (OQ-1); orchestrators kept on `sonnet` since the model does not cascade to subagents (OQ-2). Verified by AC-01..AC-06 (grep coverage empty, values ⊆ {haiku,sonnet,opus}, one added line per file).
→ [Detail](FTR-007-explicit-per-agent-model-assignment/feature.md)

---

## FTR-008 — Compact Instructions Block
**Keywords:** compact-instructions, CLAUDE.md, auto-compaction, topic-change, trigger-phrases, install-toolkit, context-management
**Status:** completed
**Summary:** Adds a `# Compact instructions` section to `~/.claude/CLAUDE.md` (global Claude Code config) via a new Step 6 opt-in in the `install-toolkit` agent. The section guides auto-compaction to preserve 6 decision-critical item categories and discard 4 noise categories, and instructs Claude to send a verbatim compact notification when any of 12 topic-change trigger phrases (Italian + English) are detected. Write is idempotent (skips if heading already present) and requires explicit user confirmation. Runtime behaviour is instruction-only — no code, no API, no database.
→ [Detail](FTR-008-compact-instructions-block/feature.md)

---

## FTR-009 — Rewrite Orchestrators as Workflow Scripts
**Keywords:** workflow-scripts, pm-phase, am-phase, agentType, implement-feature, assess-codebase, subagent-depth, token-tracking, orchestrators, determinism, per-agent-model
**Status:** completed
**Summary:** Replaces `project-manager.md` and `assessment-manager.md` subagent orchestrators with five Claude Code Workflow scripts (`pm-phase1/2/3.js`, `am-phase1/2.js`) in `.claude/workflows/`. Updates `implement-feature` and `assess-codebase` skills to invoke workflows sequentially with gates in the main loop. Deletes old orchestrator agent files. Updates `install-toolkit` and `bin/cli.js` to copy `.claude/workflows/` to destination projects. Resolves non-deterministic inline execution at spawn depth 2, enabling effective per-agent model assignment (FTR-007) and accurate token tracking.
→ [Detail](FTR-009-workflow-orchestrators/feature.md)

---

## FTR-010 — Unit Test Suite — CLI Logic and Frontmatter Validation
**Keywords:** unit-tests, jest, frontmatter, cli, bin/cli.js, gray-matter, coverage, ci, github-actions, devDependencies, walkDir, fileHash, expandMappings, categorize
**Status:** completed
**Summary:** Introduces a Jest-based unit test suite covering pure functions in `bin/cli.js` (`fileHash`, `walkDir`, `expandMappings`, `categorize`, `readInstalledVersion`, `isMattPocockInstalled`) and structural frontmatter validation for all agent `.md` and skill `SKILL.md` files. Adds `devDependencies` (`jest`, `gray-matter`), `npm test` (`jest --bail`) and `npm run test:coverage` scripts, test files under `tests/cli/` and `tests/frontmatter/`, and a new `.github/workflows/ci.yml` that triggers on PRs to `main`, runs `npm ci` + `npm test` + coverage upload. Functions are exported via conditional `if (require.main !== module)` block so the CLI continues to work normally when invoked directly.
→ [Detail](FTR-010-unit-tests/feature.md)

---

## FTR-011 — Installer Manifest and Orphan Pruning
**Keywords:** installer, manifest, prune, orphans, trash, bin/cli.js, readManifest, writeManifest, computeOrphans, moveToTrash, ai-toolkit-manifest.json, ai-toolkit-trash, frontmatter-ci, NEVER_COPY, global-install
**Status:** completed
**Summary:** Extends the AI Toolkit installer (`bin/cli.js`) with a manifest mechanism and a prune step. On every install/update the installer writes `.claude/.ai-toolkit-manifest.json` recording every file it deposited (version, installedAt ISO 8601, forward-slash destination-relative `files`). On reinstall it reads the previous manifest, computes orphans (files no longer shipped) via set difference, and moves them into a recoverable `.claude/.ai-toolkit-trash/` backup folder rather than hard-deleting — safe in shared destinations like `~/.claude/` since only toolkit-placed files are candidates. Adds pure functions `readManifest`, `writeManifest`, `computeOrphans`, `moveToTrash` (exported via the `require.main` guard) with unit tests in `tests/cli/`, plus a CI safety net asserting each agent's `name` frontmatter matches its filename (AC-22). Path shape differs by install mode (local paths keep the `.claude/` prefix, global paths do not); trash filtering uses absolute-path comparison. Deferred: skill name==folder check (AC-23), no-orphan-references check (AC-24), trash auto-cleanup.
→ [Detail](FTR-011-installer-manifest-pruning/feature.md)

---

## FTR-012 — Installer Bash Allowlist
**Keywords:** bash-allowlist, settings.local.json, mergeAllowlist, pm-phase3, permissions, install-toolkit, ask-beats-allow, gitignore, canonical-allow, canonical-ask
**Status:** completed
**Summary:** Extends the `install-toolkit` agent with an opt-in Step 6 that creates or merges a Bash permission allowlist into `.claude/settings.local.json` in the destination project. The new pure function `mergeAllowlist` in `bin/cli.js` reads an existing `settings.local.json` (if present), fuses the canonical allow and ask arrays with existing entries, deduplicates, and enforces ask-beats-allow priority. A fixed canonical allow list covers read-only base + .NET + npm commands (`ls`, `dir`, `cat`, `git status`, `git log`, `dotnet build`, `npm test`, etc.); a fixed ask list keeps dangerous commands (`git push`, `gh pr create`, `rm`, `git reset`, `git clean`, `git checkout`) requiring human confirmation. Malformed JSON is reset to the canonical list. `.gitignore` is updated idempotently. Unit-tested in `tests/cli/mergeAllowlist.test.js`. `docs/reference.md` gains a new "Bash Permission Allowlist" section. Deferred: stack detection from `AGENTS.md`, auto-upgrade on reinstall, `npm run` sub-command granularity.
→ [Detail](FTR-012-installer-bash-allowlist/feature.md)

---

## FTR-013 — Ledger as Full Pipeline Activity Tracker
**Keywords:** token-ledger, pipeline-tracker, ledger-activity, define-feature, pm-phase1, pm-phase2, pm-phase3, appendLedgerEntry, updateLedgerEntry, resume-safety, liveness, status-running, status-done, timestamps, token-attribution
**Status:** completed
**Summary:** Evolves `{PREFIX}-token-ledger.json` from a passive phase-3-only token counter into a full pipeline activity tracker covering every agent from `define-feature` through `pm-phase3`. Each entry records agent identity, phase, model, status (`running | done | failed | skipped`), token delta, and start/end timestamps. Adds `appendLedgerEntry` and `updateLedgerEntry` helper functions in `bin/cli.js` (with unit tests); inline agent()-based equivalents in `pm-phase1.js` and `pm-phase2.js`; and wraps every `agent()` call in `pm-phase3.js` with append-before/update-after pattern. `define-feature.md` writes an initial `status: "running"` entry immediately after directory creation and finalizes it on completion. Enables liveness inspection, deterministic resume detection, and full cost attribution across all pipeline phases. Both repo (`.claude/`) and global (`C:/Users/Tomada D/.claude/`) copies of all four modified files are kept byte-identical.
→ [Detail](FTR-013-ledger-pipeline-activity-tracker/feature.md)

---

## FTR-014 — Atomic Work Breakdown

**Keywords:** work-breakdown, wb-validate, wb-render, pm-phase2, generate-work-breakdown, validate-work-breakdown-semantic, JSON-schema, ac-table, groupingRationale, wave-scheduling, isDistributable, expandMappings, NEVER_DIST_SEGMENTS, installer-exclusion

**Status:** completed

**Summary:** Adds structural validation and rendering to the Work Breakdown phase. Introduces `wb-validate.js` (23 deterministic checks: JSON schema, domain values, task-id uniqueness, dependency cycles, wave scheduling, AC table format, estimate bounds, groupingRationale, phase completeness) and `wb-render.js` (generates `{PREFIX}-Work-Breakdown.md` and `.csv` from validated JSON). Adds `validate-work-breakdown-semantic` agent for semantic coherence and scope-alignment review. Updates `pm-phase2.js` to run the full validation pipeline (wb-validate → semantic → wb-render) using the append-before/update-after ledger pattern from FTR-013. Updates `generate-work-breakdown` agent with the new JSON schema (`groupingRationale`, `acTable`, `waveScheduling` fields). Distributes `wb-validate.js` and `wb-render.js` via the installer (local and global). **Post-implementation CRITICAL fix:** installer was distributing `.claude/scripts/tests/**` to destination projects; fixed by adding `isDistributable()` to `expandMappings()` as the single source of truth (covers local install, global install, plan, manifest, and orphan detection), and narrowing `package.json` `files[]` to exclude the tests subtree from npm publish; 25 regression tests added to `installer.scripts-distribution.test.js` (Groups 5–9). Full structural migration of tests to `tests/**` deferred to FTR-015.

→ [Detail](FTR-014-atomic-work-breakdown/feature.md)

---

## FTR-015 — Claude Source Layout and Runtime Resolution

**Keywords:** src-claude, source-layout, runtime-resolution, asset-catalog, lib/asset-catalog.js, resolveClaudeRuntimeAsset, doctor-resolution, installer, tests-migration, permission-fatigue, protected-path, npm-files, single-source-of-truth, dual-copy-obsolete

**Status:** completed

**Summary:** Eliminates the four-way overlap of `.claude/` (versioned source, auto-discovered runtime, npm payload, personal config) by migrating all versioned toolkit assets from `.claude/` to `src/claude/` as the single authoritative source and moving all tests to a top-level `tests/` hierarchy. Introduces `lib/asset-catalog.js` as the single source of truth for installable asset categories, updates local and global installers to read from `src/claude/`, adds `resolveClaudeRuntimeAsset()` for coherent runtime script resolution, and a read-only `doctor resolution` CLI command for provenance diagnostics. Ordinary development edits now land in the non-protected `src/claude/` path while runtime installs stay deterministic and verifiable. Executed as an 8-phase one-time migration. **Supersedes the FTR-013 "dual-copy" convention:** installed copies (`.claude/`, global home) are generated exclusively by the catalog-driven installer, never hand-synced. Prerequisite for subsequent resilient-execution initiatives (Deterministic Estimate Generation, Execution Ledger, Task Checkpoints, Isolated Parallel Task Execution).

→ [Detail](FTR-015-claude-source-layout-and-runtime-resolution/feature.md)

---

## FTR-016 — Deterministic Execution Ledger Foundation

**Keywords:** execution-ledger, lib/execution-ledger.js, ai-toolkit-ledger, cli-facade, operation_id, atomic-write, temp-rename, fsync, cross-process-lock, stale-lock, fail-closed, null-tokens, resume-safety, features-root-resolution, define-feature, pm-phase1, pm-phase2, pm-phase3, catalog-driven-install

**Status:** defined

**Summary:** Replaces the four-plus divergent, LLM-delegated ledger writers (dead `bin/cli.js` helpers + inline haiku JSON prompts in `pm-phase1/2/3.js` + `define-feature` prose) with a single canonical deterministic module `lib/execution-ledger.js`, exposed via a small CLI facade `ai-toolkit ledger open|close|fail|skip` invoked directly (never `run-asset`) and verified by structured JSON + exit code. Guarantees crash-atomic (temp+fsync+rename), concurrency-safe (cross-process lock with timeout/retry/stale-lock recovery), and fail-closed persistence; unknown token consumption recorded solely as `null` (readers tolerate legacy `0` / `"not_available"` as "unavailable", never a real zero); stable per-execution identity `operation_id` derived from prefix+agent+attempt with an unambiguous `agent` fallback for legacy entries; malformed ledgers backed up and hard-stopped (no silent `[]`); features-root resolved by deterministic precedence (explicit → project convention → `internal_docs/features` → `docs/features` → hard-stop on ambiguity). Migrates only currently-tracked writes plus minimal reader `null`-compatibility in `pm-phase3.js` and `implement-feature/SKILL.md`. Documented v1 residual: command dispatch stays agent-mediated (workflow runtime lacks direct fs/exec). Explicitly defers reader consolidation, untracked-activity coverage, per-task/per-finding granularity, and resume orchestration to future features (*Execution Ledger Coverage Completeness*, *Task Checkpoints and Resume*).

→ [Detail](FTR-016-deterministic-execution-ledger-foundation/feature.md)

---
