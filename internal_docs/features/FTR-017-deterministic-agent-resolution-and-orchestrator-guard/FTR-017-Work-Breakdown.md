# Work Breakdown — FTR-017

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-017 |
| Schema | v2 |
| Generated | 2026-09-07T22:03:43.698Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 58 |
| Total phases | 14 |
| Within target (≤15 min) | 49 |
| Above target (16–20 min) | 8 |
| Warning (21–30 min) | 1 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 45, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 13 |

## Infrastructure Phase (INFRA)

### Commit
feat(FTR-017): add SHA-256 hashing and ledger metadata plumbing shared across resolution features

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| INFRA-TASK-BE-01 | Add computeFileSha256() helper to bin/cli.js | bin/cli.js exports computeFileSha256(filePath) returning sha256:<hex>; pure helper reused by installer hashing and on-disk integrity checks; exported via require.main guard | BE | 10 | — | 2 cmd — [details](#task-INFRA-TASK-BE-01) |
| INFRA-TASK-BE-02 | Extend writeManifest() with optional fileHashes parameter | bin/cli.js writeManifest(destRoot, fileList, installationMode, fileHashes?) accepts an optional fourth fileHashes parameter; existing three-arg calls remain backward-compatible; no behaviour change when fileHashes omitted | BE | 12 | INFRA-TASK-BE-01 | 2 cmd — [details](#task-INFRA-TASK-BE-02) |
| INFRA-TASK-BE-03 | Extend lib/execution-ledger.js open() with whitelisted metadata parameter | lib/execution-ledger.js open() accepts an optional trailing metadata parameter; metadata validated against a key whitelist before any write; reserved FTR-016 fields protected; idempotent-open safety invariants enforced (same metadata = no-op, different metadata = non-zero, no write) | BE | 15 | — | 2 cmd — [details](#task-INFRA-TASK-BE-03) |

## User Story Phases

### US-01: Resolve Toolkit Agent Identity (Diagnostic Mode)

### Commit
feat(FTR-017): implement canonical agent registry and diagnostic resolution

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Create lib/agent-registry.js canonical catalog and resolution core | lib/agent-registry.js exists with the canonical catalog (unique namespaced IDs e.g. gaia.agent.developer.backend), resolveAgent(), validateAgentSet(), listRegisteredAgents(), and the provenance guard; resolution is pure JavaScript with no LLM and no Claude API / Claude-Code imports | BE | 22 | — | 2 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-02 | Add agents list and agents resolve (diagnostic) CLI commands | ai-toolkit agents list --project <dir> --format json enumerates registered toolkit agents (canonical ID, native name, scope, install status), never foreign/plugin agents; ai-toolkit agents resolve --project <dir> --id <id> (diagnostic, no --require-verified) returns a JSON resolution record with a status field, exits 0 for known/resolvable agents (incl. hash-unverifiable) and non-zero for unknown ID / collision / corrupt manifest | BE | 15 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-BE-03 | Define Codex/Copilot adapter interface contracts with contract tests | lib/agent-registry adapter interface contracts for Codex and Copilot are documented and expressed as typed stubs; tests/cli/adapter-contracts.test.js verifies the documented input/output shape without requiring a working runtime | BE | 12 | US-01-TASK-BE-01 | 3 cmd — [details](#task-US-01-TASK-BE-03) |
| US-01-TASK-TEST-01 | Add registry unit tests for JS-only resolution and platform-agnostic imports | tests/cli/agent-registry.test.js asserts canonical-ID uniqueness, deterministic resolution with no fuzzy/fallback selection, and a static import scan proving lib/agent-registry.js imports no Claude API / Claude-Code-specific modules | TEST | 14 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-01-TASK-TEST-01) |

### US-02: Resolve Toolkit Agent Identity (Operational Mode with Verification)

### Commit
feat(FTR-017): implement operational resolution with --require-verified

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Add --require-verified operational mode to agents resolve | ai-toolkit agents resolve --project <dir> --id <id> --require-verified exits 0 only when status is verified (v0.13.0+ manifest with matching hash) and returns all required identity fields; exits non-zero with a structured error for any unverified status and for ambiguous/missing agents with no fuzzy match or fallback; a v0.12.0 manifest (no fileHashes) is a HARD STOP under --require-verified | BE | 16 | US-01-TASK-BE-01, US-01-TASK-BE-02 | 2 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Add tests for operational resolution exit codes | tests/cli/agents-cli-commands.test.js verifies operational resolve: verified agent exits 0 with identity record; ambiguous/missing agent exits non-zero with structured error and no fallback; v0.12.0 manifest under --require-verified hard-stops | TEST | 13 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: Verify Agent Preflight Before Pipeline Start

### Commit
feat(FTR-017): implement agent preflight with ledger tracking

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Add agents preflight command and wire it into implement-feature with ledger tracking | ai-toolkit agents preflight --project <dir> --pipeline implement-feature verifies every required agent using --require-verified semantics and hard-stops on any unverified agent or v0.12.0 manifest; implement-feature/SKILL.md opens a ledger entry agent-preflight:implement-feature (running) before the check, closes it to done on pass and marks it failed on failure, and if ledger open returns non-zero preflight does not run (fail-closed) | BE | 16 | US-02-TASK-BE-01, INFRA-TASK-BE-03 | 4 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-TEST-01 | Add preflight flow tests | tests/cli/agents-cli-commands.test.js covers preflight: v0.13.0 manifest with matching hashes passes and closes the ledger to done; v0.12.0 manifest hard-stops and marks failed; missing manifest hard-stops; a failed ledger open prevents the check from running | TEST | 13 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

### US-04: Dispatch Workflow with Tier 1 Guard (Skill-Level Identity Tracking)

### Commit
feat(FTR-017): implement Tier 1 skill-level dispatch guard

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Add Tier 1 dispatch guard to implement-feature SKILL.md | implement-feature/SKILL.md is the toolkit-supported entry point: before each workflow dispatch it opens a pm-phaseN:dispatch ledger entry with whitelisted identity metadata (agentId, nativeAgentName, platform, toolkitVersion, resolutionScope, definitionHash); after Gate 2 only the pm-phase3 workflow returning status verified is dispatched and only its returned nativeName is used; if ledger open returns non-zero the dispatch does not proceed (fail-closed) | BE | 15 | INFRA-TASK-BE-03, US-02-TASK-BE-01 | 2 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Enforce hard stops for missing workflow and post-return ledger failure | implement-feature/SKILL.md hard-stops with remediation and no alternative dispatch when pm-phase3 is absent from the installed runtime; if ledger close or fail for a pm-phaseN:dispatch entry fails after the workflow returns, the pipeline hard-stops and the error is not swallowed | BE | 12 | US-04-TASK-BE-01 | 2 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-TEST-01 | Add Tier 1 dispatch guard tests | tests/integration/agent-resolution-e2e.test.js asserts Tier 1 behaviour contractually: ledger open with identity metadata before dispatch; fail-closed when open returns non-zero; hard stop when pm-phase3 is absent; hard stop (error not swallowed) when close/fail fails after return; no real LLM pipeline invoked | TEST | 18 | US-04-TASK-BE-02 | 2 cmd — [details](#task-US-04-TASK-TEST-01) |

### US-05: Dispatch Worker Agent with Tier 2 Guard (Workflow-Level Resolution)

### Commit
feat(FTR-017): implement Tier 2 workflow-level resolution guard

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Add Tier 2 resolution guard to pm-phase1/2/3 workflows | src/claude/workflows/pm-phase1.js, pm-phase2.js, and pm-phase3.js invoke ai-toolkit agents resolve --require-verified before dispatching each worker agent, check the exit code, and dispatch using only the returned nativeName; none of them import lib/agent-registry directly or derive a native name independently | BE | 15 | US-02-TASK-BE-01 | 3 cmd — [details](#task-US-05-TASK-BE-01) |
| US-05-TASK-BE-02 | Enforce registry validation of Work Breakdown agent_type values | the registry validates agent_type values coming from Work Breakdowns: unknown values are rejected with a structured error and the pipeline does not start; declared legacy values resolve via explicit mapping (never passed to the platform unresolved) | BE | 12 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-05-TASK-BE-02) |
| US-05-TASK-TEST-01 | Add static guard and Tier 2 resolution tests | tests/regression/static-guards.test.js asserts (a) no workflow .js file contains require('../lib/agent-registry') and (b) every agents resolve invocation in workflow files includes --require-verified; the suite also asserts Tier 2 uses the returned nativeName only and that unknown WB agent_type values are rejected | TEST | 14 | US-05-TASK-BE-01, US-05-TASK-BE-02 | 2 cmd — [details](#task-US-05-TASK-TEST-01) |

### US-06: Workflow Self-Registration in Execution Ledger (Tier 3)

### Commit
feat(FTR-017): implement Tier 3 workflow self-registration in the execution ledger

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-06-TASK-BE-01 | Add pm-phaseN:self ledger self-registration to pm-phase workflows | src/claude/workflows/pm-phase1.js, pm-phase2.js, and pm-phase3.js each open a pm-phaseN:self ledger entry (running) BEFORE any main workflow logic runs; if that ledger open returns non-zero the workflow HARD-STOPS and aborts before doing any work (fail-closed); on successful completion the SAME workflow closes its own pm-phaseN:self entry to done; in its error path the SAME workflow marks its own pm-phaseN:self entry failed; a genuine host/process interruption may legitimately leave the entry running; the :self entry is owned solely by the workflow and is never touched by the Tier 1 :dispatch guard | BE | 15 | US-05-TASK-BE-01 | 4 cmd — [details](#task-US-06-TASK-BE-01) |
| US-06-TASK-TEST-01 | Add Tier 3 self-registration lifecycle tests | tests/integration/self-registration.test.js asserts UC-06 contractually: the workflow opens pm-phaseN:self before main logic; a failed ledger open hard-stops the workflow before any work (fail-closed); successful completion closes the SAME pm-phaseN:self entry to done; an internal error marks the SAME entry failed; a simulated interruption legitimately leaves it running; the :self entry is never closed by the Tier 1 :dispatch guard; no real LLM pipeline is invoked | TEST | 14 | US-06-TASK-BE-01 | 2 cmd — [details](#task-US-06-TASK-TEST-01) |

### US-08: Diagnostic Agent Status Report (doctor agents)

### Commit
feat(FTR-017): implement doctor agents diagnostic command

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-08-TASK-BE-01 | Create doctor agents command with full diagnostics | ai-toolkit doctor agents --project <dir> enumerates registered toolkit agents with scope, provenance path, version and integrity, reporting each with exactly one status (verified / conflict / hash-unverifiable / unobservable / not-installed / not-applicable, digest mismatch reported as conflict + hash-mismatch detail); it detects collisions, flags foreign observable agents, lists legacy references and remediation, emits an unobservable WARNING for non-observable scopes without blocking, and modifies/creates/deletes no file | BE | 18 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-08-TASK-BE-01) |
| US-08-TASK-TEST-01 | Add doctor agents tests | tests/cli/agents-cli-commands.test.js verifies doctor agents: each agent gets exactly one of the six status values, digest mismatch reported as conflict + hash-mismatch, non-observable scope emits an unobservable WARNING without blocking, foreign observable agents flagged, and no file is modified/created/deleted | TEST | 14 | US-08-TASK-BE-01 | 1 cmd — [details](#task-US-08-TASK-TEST-01) |

### US-09: Cleanup Stale Toolkit Assets (Dry-Run Only)

### Commit
feat(FTR-017): implement agents cleanup dry-run command

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-09-TASK-BE-01 | Create agents cleanup --dry-run command (read-only) | ai-toolkit agents cleanup --project <dir> [--dry-run] lists cleanup candidates only (old-manifest files no longer in the current payload and still on disk); a manifest entry whose file is absent from disk is reported as missing and never a candidate; a file on disk absent from the manifest is treated as user-owned and never proposed; any mutating flag (--delete/--force) is rejected as unsupported with a non-zero exit; no file is modified or deleted | BE | 13 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-09-TASK-BE-01) |
| US-09-TASK-TEST-01 | Add cleanup command tests | tests/cli/agents-cli-commands.test.js verifies cleanup: dry-run lists only genuine candidates, missing files are reported as missing (never candidates), user-owned files are never proposed, mutating flags are rejected with non-zero exit, and no file is touched | TEST | 11 | US-09-TASK-BE-01 | 1 cmd — [details](#task-US-09-TASK-TEST-01) |

### US-10: Handle Agent Name Collision (Observable Scopes)

### Commit
feat(FTR-017): implement observable-scope collision detection

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-10-TASK-BE-01 | Detect observable-scope collisions during resolution and preflight | when two observable installations provide agents with the same effective native name at equal or higher precedence, resolution/preflight report the collision with both paths and do not start the pipeline until resolved; an ambiguous or missing agent yields a non-zero exit with a structured error and no fallback | BE | 14 | US-02-TASK-BE-01, US-08-TASK-BE-01 | 2 cmd — [details](#task-US-10-TASK-BE-01) |
| US-10-TASK-TEST-01 | Add collision and temporary-home isolation tests | tests/cli/collision-detection.test.js covers observable-scope collisions (hard stop with both paths), a foreign project-manager.md from an old tool reported as foreign and not blocking, and uses a temporary home directory for every scope/collision scenario so no test reads or writes the real user home | TEST | 16 | US-10-TASK-BE-01, US-08-TASK-BE-01 | 2 cmd — [details](#task-US-10-TASK-TEST-01) |

### US-11: Transition Agent Names (Phase A: Legacy Registration)

### Commit
feat(FTR-017): implement Phase A legacy registration and manifest hashing

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-11-TASK-BE-01 | Make the installer compute and record file hashes | the bin/cli.js installer calls computeFileSha256() for every copied file and passes a fileHashes object to writeManifest() so a v0.13.0+ install produces a manifest with files and fileHashes, each path hashed to sha256:<hex>, with the invariant set(files) == set(keys(fileHashes)) enforced on write and no production install path emitting a hash-free manifest | BE | 14 | INFRA-TASK-BE-01, INFRA-TASK-BE-02 | 2 cmd — [details](#task-US-11-TASK-BE-01) |
| US-11-TASK-BE-02 | Register legacy agent types transitionally and document the inventory | the registry registers every legacy non-namespaced agent name as a transitional catalog entry (catalogued, manifest-tracked, hash-recorded) and documents the full agent-type inventory with canonical-ID mappings covering at least developer-backend, developer-frontend, developer-testing, developer-database, review-solution | BE | 12 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-11-TASK-BE-02) |
| US-11-TASK-TEST-01 | Add manifest hash and v0.12.0 to v0.13.0 upgrade tests | tests/cli/manifest-hashes.test.js covers SHA-256 format, backward-compatible reads of manifests that have files but no fileHashes, the set(files) == set(keys(fileHashes)) invariant, and a v0.12.0 to v0.13.0 upgrade where files hold the current payload after orphan cleanup, fileHashes has exactly one key per files entry, and doctor agents transitions from hash-unverifiable to verified | TEST | 18 | US-11-TASK-BE-01 | 2 cmd — [details](#task-US-11-TASK-TEST-01) |

### US-12: Transition Agent Names (Phase B: Atomic Per-Agent Rename)

### Commit
feat(FTR-017): rename all toolkit agents to gaia-* namespace atomically

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-12-TASK-BE-01 | Remove legacy orchestrator references from runtime assets | all installed toolkit files are audited so no file references /agent-project-manager, hi-gaia/SKILL.md no longer lists project-manager or assessment-manager as spawnable, implement-feature/SKILL.md no longer uses the label project-manager/pm-phase3, and every entry-point reference uses a canonical name | BE | 16 | US-01-TASK-BE-01 | 3 cmd — [details](#task-US-12-TASK-BE-01) |
| US-12-TASK-BE-02 | Add explicit legacy agent_type mapping with deprecation | the registry maps each legacy agent_type to exactly one canonical ID via explicit mapping with deprecation warnings (developer-database maps to gaia.agent.developer.backend, no developer-database.md is created), generate-work-breakdown.md no longer lists developer-database as a valid new value, and existing Work Breakdowns with legacy agent_type values continue to resolve with no WB update required | BE | 14 | US-01-TASK-BE-01, US-11-TASK-BE-02 | 2 cmd — [details](#task-US-12-TASK-BE-02) |
| US-12-TASK-BE-25 | Phase A completion gate before Phase B atomic renames | a verifiable checkpoint that proves Phase A is complete and green before any Phase B atomic rename begins (BR-13): every Phase A guard, hash, ledger-metadata, registry, legacy-fix, and agent-type-inventory task is implemented with its tests present, the full npm test suite is green, and the Phase A static-guard regression suite (tests/regression/static-guards.test.js) passes; no Phase B per-agent rename (US-12-TASK-BE-03..BE-23) may start until this gate is satisfied | BE | 12 | US-01-TASK-BE-03, US-01-TASK-TEST-01, US-02-TASK-TEST-01, US-03-TASK-TEST-01, US-04-TASK-TEST-01, US-05-TASK-TEST-01, US-06-TASK-TEST-01, US-08-TASK-TEST-01, US-09-TASK-TEST-01, US-10-TASK-TEST-01, US-11-TASK-TEST-01, US-13-TASK-TEST-01, US-14-TASK-TEST-01, US-12-TASK-TEST-01, US-12-TASK-BE-01, US-12-TASK-BE-02 | 4 cmd — [details](#task-US-12-TASK-BE-25) |
| US-12-TASK-BE-03 | Rename agent define-feature to gaia-define-feature | src/claude/agents/define-feature.md is renamed to gaia-define-feature.md with its name: frontmatter updated to gaia-define-feature; all consumers (define-feature command and SKILL.md, implement-feature/SKILL.md, hi-gaia/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-03) |
| US-12-TASK-BE-04 | Rename agent generate-requirements to gaia-generate-requirements | src/claude/agents/generate-requirements.md is renamed to gaia-generate-requirements.md with its name: frontmatter updated to gaia-generate-requirements; all consumers (pm-phase1.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-04) |
| US-12-TASK-BE-05 | Rename agent generate-tech-spec to gaia-generate-tech-spec | src/claude/agents/generate-tech-spec.md is renamed to gaia-generate-tech-spec.md with its name: frontmatter updated to gaia-generate-tech-spec; all consumers (pm-phase1.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-05) |
| US-12-TASK-BE-06 | Rename agent validate-feature-docs to gaia-validate-feature-docs | src/claude/agents/validate-feature-docs.md is renamed to gaia-validate-feature-docs.md with its name: frontmatter updated to gaia-validate-feature-docs; all consumers (pm-phase1.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-06) |
| US-12-TASK-BE-07 | Rename agent generate-work-breakdown to gaia-generate-work-breakdown | src/claude/agents/generate-work-breakdown.md is renamed to gaia-generate-work-breakdown.md with its name: frontmatter updated to gaia-generate-work-breakdown; all consumers (pm-phase2.js, generate-work-breakdown agent-type references, and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-07) |
| US-12-TASK-BE-08 | Rename agent validate-work-breakdown-semantic to gaia-validate-work-breakdown-semantic | src/claude/agents/validate-work-breakdown-semantic.md is renamed to gaia-validate-work-breakdown-semantic.md with its name: frontmatter updated to gaia-validate-work-breakdown-semantic; all consumers (pm-phase2.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-08) |
| US-12-TASK-BE-09 | Rename agent developer-backend to gaia-developer-backend | src/claude/agents/developer-backend.md is renamed to gaia-developer-backend.md with its name: frontmatter updated to gaia-developer-backend; all consumers (pm-phase3.js, generate-work-breakdown.md agentType references, and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-09) |
| US-12-TASK-BE-10 | Rename agent developer-frontend to gaia-developer-frontend | src/claude/agents/developer-frontend.md is renamed to gaia-developer-frontend.md with its name: frontmatter updated to gaia-developer-frontend; all consumers (pm-phase3.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-10) |
| US-12-TASK-BE-11 | Rename agent developer-testing to gaia-developer-testing | src/claude/agents/developer-testing.md is renamed to gaia-developer-testing.md with its name: frontmatter updated to gaia-developer-testing; all consumers (pm-phase3.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-11) |
| US-12-TASK-BE-12 | Rename agent review-solution to gaia-review-solution | src/claude/agents/review-solution.md is renamed to gaia-review-solution.md with its name: frontmatter updated to gaia-review-solution; all consumers (pm-phase3.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-12) |
| US-12-TASK-BE-13 | Rename agent generic-software-assessment to gaia-generic-software-assessment | src/claude/agents/generic-software-assessment.md is renamed to gaia-generic-software-assessment.md with its name: frontmatter updated to gaia-generic-software-assessment; all consumers (am-phase1.js SCOPE_AGENT_MAP[quality], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-13) |
| US-12-TASK-BE-14 | Rename agent layered-architecture-assessment to gaia-layered-architecture-assessment | src/claude/agents/layered-architecture-assessment.md is renamed to gaia-layered-architecture-assessment.md with its name: frontmatter updated to gaia-layered-architecture-assessment; all consumers (am-phase1.js SCOPE_AGENT_MAP[architecture], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-14) |
| US-12-TASK-BE-15 | Rename agent concurrency-safety-assessment to gaia-concurrency-safety-assessment | src/claude/agents/concurrency-safety-assessment.md is renamed to gaia-concurrency-safety-assessment.md with its name: frontmatter updated to gaia-concurrency-safety-assessment; all consumers (am-phase1.js SCOPE_AGENT_MAP[concurrency], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-15) |
| US-12-TASK-BE-16 | Rename agent security-hardening to gaia-security-hardening | src/claude/agents/security-hardening.md is renamed to gaia-security-hardening.md with its name: frontmatter updated to gaia-security-hardening; all consumers (am-phase1.js SCOPE_AGENT_MAP[security], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-16) |
| US-12-TASK-BE-17 | Rename agent dependency-supply-chain-security to gaia-dependency-supply-chain-security | src/claude/agents/dependency-supply-chain-security.md is renamed to gaia-dependency-supply-chain-security.md with its name: frontmatter updated to gaia-dependency-supply-chain-security; all consumers (am-phase1.js SCOPE_AGENT_MAP[dependencies], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-17) |
| US-12-TASK-BE-18 | Rename agent domain-model-refactoring to gaia-domain-model-refactoring | src/claude/agents/domain-model-refactoring.md is renamed to gaia-domain-model-refactoring.md with its name: frontmatter updated to gaia-domain-model-refactoring; all consumers (am-phase1.js SCOPE_AGENT_MAP[domain-model], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-18) |
| US-12-TASK-BE-19 | Rename agent dependency-injection-refactoring to gaia-dependency-injection-refactoring | src/claude/agents/dependency-injection-refactoring.md is renamed to gaia-dependency-injection-refactoring.md with its name: frontmatter updated to gaia-dependency-injection-refactoring; all consumers (am-phase1.js, am-phase2.js, assess-codebase/SKILL.md, and intervention-documentation-standard references) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-19) |
| US-12-TASK-BE-20 | Rename agent god-class-decomposition to gaia-god-class-decomposition | src/claude/agents/god-class-decomposition.md is renamed to gaia-god-class-decomposition.md with its name: frontmatter updated to gaia-god-class-decomposition; all consumers (am-phase1.js, am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-20) |
| US-12-TASK-BE-21 | Rename agent intervention-documentation-standard to gaia-intervention-documentation-standard | src/claude/agents/intervention-documentation-standard.md is renamed to gaia-intervention-documentation-standard.md with its name: frontmatter updated to gaia-intervention-documentation-standard; all consumers (am-phase1.js, am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-21) |
| US-12-TASK-BE-22 | Rename agent init-agents-md to gaia-init-agents-md | src/claude/agents/init-agents-md.md is renamed to gaia-init-agents-md.md with its name: frontmatter updated to gaia-init-agents-md; all consumers (hi-gaia/SKILL.md and the install-toolkit flow) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-22) |
| US-12-TASK-BE-23 | Rename agent install-toolkit to gaia-install-toolkit | src/claude/agents/install-toolkit.md is renamed to gaia-install-toolkit.md with its name: frontmatter updated to gaia-install-toolkit; all consumers (hi-gaia/SKILL.md and the install command flow) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit | BE | 12 | US-12-TASK-BE-02, US-12-TASK-BE-25 | 3 cmd — [details](#task-US-12-TASK-BE-23) |
| US-12-TASK-BE-24 | Enforce Phase B completion gate | a scheduled atomic rename task exists for every toolkit agent that carried a legacy non-namespaced name; after all renames ~/.claude/agents/ contains only registered gaia-* files with no legacy-named file and no legacy distribution mapping remaining, the installer accepts and distributes only gaia-* native names, and the feature is not marked complete until this holds | BE | 12 | US-12-TASK-BE-03, US-12-TASK-BE-04, US-12-TASK-BE-05, US-12-TASK-BE-06, US-12-TASK-BE-07, US-12-TASK-BE-08, US-12-TASK-BE-09, US-12-TASK-BE-10, US-12-TASK-BE-11, US-12-TASK-BE-12, US-12-TASK-BE-13, US-12-TASK-BE-14, US-12-TASK-BE-15, US-12-TASK-BE-16, US-12-TASK-BE-17, US-12-TASK-BE-18, US-12-TASK-BE-19, US-12-TASK-BE-20, US-12-TASK-BE-21, US-12-TASK-BE-22, US-12-TASK-BE-23, US-12-TASK-BE-01 | 2 cmd — [details](#task-US-12-TASK-BE-24) |
| US-12-TASK-TEST-01 | Add regression tests blocking legacy orchestrator references | tests/regression/static-guards.test.js fails the build if any file introduces /agent-project-manager, subagent_type: project-manager, agentType: project-manager, or assessment-manager as a legacy orchestrator reference, and asserts that every orchestrator/Work Breakdown agent reference uses a canonical ID or a declared legacy mapping with no bare platform name used as a contract | TEST | 14 | US-12-TASK-BE-01 | 2 cmd — [details](#task-US-12-TASK-TEST-01) |

### US-13: Handle Hash Mismatch on Installed File

### Commit
feat(FTR-017): implement hash mismatch detection on installed files

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-13-TASK-BE-01 | Detect hash mismatch during resolution | resolveAgent() recomputes the current SHA-256 from the on-disk file and compares it against the manifest fileHashes record; a mismatch is reported as unverified so agents resolve --require-verified exits non-zero and dispatch is blocked, while diagnostic mode reports hash-mismatch; preflight hard-stops on mismatch | BE | 12 | US-01-TASK-BE-01, US-11-TASK-BE-01 | 2 cmd — [details](#task-US-13-TASK-BE-01) |
| US-13-TASK-TEST-01 | Add hash mismatch tests | tests/cli/manifest-hashes.test.js verifies that a modified installed file (hash mismatch) is reported unverified, --require-verified exits non-zero with dispatch blocked, diagnostic mode reports hash-mismatch, and preflight hard-stops | TEST | 11 | US-13-TASK-BE-01 | 1 cmd — [details](#task-US-13-TASK-TEST-01) |

### US-14: Manage Ledger Metadata Through Dispatch Lifecycle

### Commit
feat(FTR-017): implement ledger metadata CLI facade and safety invariants

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-14-TASK-BE-01 | Add ledger CLI facade with whitelisted metadata flags | bin/cli.js ledger open/close/fail/skip accept optional identity flags (--agent-id, --native-name, --toolkit-version, --scope, --hash) passed through to lib/execution-ledger.js as a metadata object; first open stores metadata with reserved FTR-016 fields unchanged, an unknown metadata key is rejected before any write, and old entries survive updates without data loss | BE | 13 | INFRA-TASK-BE-03 | 3 cmd — [details](#task-US-14-TASK-BE-01) |
| US-14-TASK-TEST-01 | Add ledger metadata safety invariant tests | tests/cli/ledger-metadata.test.js verifies all safety invariants: first open stores metadata with reserved fields unchanged; idempotent re-open with same metadata is a no-op; idempotent re-open with different metadata exits non-zero with no write; an unknown metadata key is rejected before any write; close/fail preserve metadata and update only status/timestamps/error | TEST | 16 | US-14-TASK-BE-01 | 2 cmd — [details](#task-US-14-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Add computeFileSha256() helper to bin/cli.js
- **Outcome:** bin/cli.js exports computeFileSha256(filePath) returning sha256:<hex>; pure helper reused by installer hashing and on-disk integrity checks; exported via require.main guard
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** A single hashing primitive is the sole trust anchor reused by the installer (US-11) and mismatch detection (US-13); it must land as one indivisible helper so both consumers hash bytes identically.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add computeFileSha256() helper for manifest integrity

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=manifest-hashes
```

<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Extend writeManifest() with optional fileHashes parameter
- **Outcome:** bin/cli.js writeManifest(destRoot, fileList, installationMode, fileHashes?) accepts an optional fourth fileHashes parameter; existing three-arg calls remain backward-compatible; no behaviour change when fileHashes omitted
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** The signature change and its backward-compatible default must ship together, otherwise a partially-updated writeManifest breaks every existing installer call site in the same edit window.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** extend writeManifest() with optional fileHashes parameter

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=manifest-hashes
```

<a id="task-INFRA-TASK-BE-03"></a>
### INFRA-TASK-BE-03

- **Task ID:** INFRA-TASK-BE-03
- **Title:** Extend lib/execution-ledger.js open() with whitelisted metadata parameter
- **Outcome:** lib/execution-ledger.js open() accepts an optional trailing metadata parameter; metadata validated against a key whitelist before any write; reserved FTR-016 fields protected; idempotent-open safety invariants enforced (same metadata = no-op, different metadata = non-zero, no write)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Whitelist validation, reserved-field protection, and the idempotent-open invariant are one safety contract: shipping the parameter without all three guards would allow unvalidated writes, so they form a single unit consumed by both the Tier 1 guard (US-04) and the ledger CLI facade (US-14).
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** extend ledger open() with whitelisted metadata and safety invariants

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
npm test -- --testPathPattern=ledger-metadata
```

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Create lib/agent-registry.js canonical catalog and resolution core
- **Outcome:** lib/agent-registry.js exists with the canonical catalog (unique namespaced IDs e.g. gaia.agent.developer.backend), resolveAgent(), validateAgentSet(), listRegisteredAgents(), and the provenance guard; resolution is pure JavaScript with no LLM and no Claude API / Claude-Code imports
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-03, AC-30
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 60000
- **Output count:** 1
- **Grouping rationale:** The catalog, the deterministic resolution algorithm, and the platform-agnostic provenance guard are mutually dependent — resolveAgent() cannot exist without the catalog and cannot claim to be LLM-free unless its imports are constrained in the same module, so they ship as one atomic core.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add canonical agent registry module with deterministic resolution

**Verification commands:**

```
node --check lib/agent-registry.js
```

```
npm test -- --testPathPattern=agent-registry
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Add agents list and agents resolve (diagnostic) CLI commands
- **Outcome:** ai-toolkit agents list --project <dir> --format json enumerates registered toolkit agents (canonical ID, native name, scope, install status), never foreign/plugin agents; ai-toolkit agents resolve --project <dir> --id <id> (diagnostic, no --require-verified) returns a JSON resolution record with a status field, exits 0 for known/resolvable agents (incl. hash-unverifiable) and non-zero for unknown ID / collision / corrupt manifest
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** list and diagnostic resolve are the two read-only façades over the same catalog/resolution record; they share the JSON record shape and exit-code contract and must be introduced together so the record format is defined once. The `ai-toolkit agents list` capability in this task realizes UC-07 (List Registered Toolkit Agents): it enumerates only toolkit-owned registered agents (canonical ID, native name, scope, install status) and never foreign or plugin agents, so UC-07 is delivered here with no separate phase required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add agents list and diagnostic resolve CLI commands

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Define Codex/Copilot adapter interface contracts with contract tests
- **Outcome:** lib/agent-registry adapter interface contracts for Codex and Copilot are documented and expressed as typed stubs; tests/cli/adapter-contracts.test.js verifies the documented input/output shape without requiring a working runtime
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-32
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** An interface contract is meaningless without a test that pins its shape; the contract declaration and its shape-verification test are a single deliverable so the contract cannot silently drift from what is tested.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add Codex/Copilot adapter interface contracts and contract tests

**Verification commands:**

```
node --check tests/cli/adapter-contracts.test.js
```

```
npm test -- --testPathPattern=adapter-contracts
```

```
test -f tests/cli/adapter-contracts.test.js
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Add registry unit tests for JS-only resolution and platform-agnostic imports
- **Outcome:** tests/cli/agent-registry.test.js asserts canonical-ID uniqueness, deterministic resolution with no fuzzy/fallback selection, and a static import scan proving lib/agent-registry.js imports no Claude API / Claude-Code-specific modules
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-03, AC-30
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** AC-03 (LLM-free resolution) and AC-30 (no Claude imports) are both proven by static analysis of the same module, so one test file that inspects agent-registry.js source covers both without duplicating fixtures.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add registry unit tests for deterministic resolution and platform-agnostic imports

**Verification commands:**

```
npm test -- --testPathPattern=agent-registry
```

```
test -f tests/cli/agent-registry.test.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add --require-verified operational mode to agents resolve
- **Outcome:** ai-toolkit agents resolve --project <dir> --id <id> --require-verified exits 0 only when status is verified (v0.13.0+ manifest with matching hash) and returns all required identity fields; exits non-zero with a structured error for any unverified status and for ambiguous/missing agents with no fuzzy match or fallback; a v0.12.0 manifest (no fileHashes) is a HARD STOP under --require-verified
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02
- **Acceptance criteria:** AC-04, AC-05, AC-39
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The verified-only exit-0 path, the non-zero-with-structured-error path, and the v0.12.0 hard stop are the three mutually exclusive branches of one operational contract; splitting them would let a partial implementation return exit 0 for an unverified agent.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add --require-verified operational mode to agents resolve

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Add tests for operational resolution exit codes
- **Outcome:** tests/cli/agents-cli-commands.test.js verifies operational resolve: verified agent exits 0 with identity record; ambiguous/missing agent exits non-zero with structured error and no fallback; v0.12.0 manifest under --require-verified hard-stops
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05, AC-39
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** Each branch of the operational contract (verified pass, unverified/ambiguous fail, legacy-manifest hard stop) is only trustworthy when all exit-code branches are asserted together in one suite that shares the manifest fixtures.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add operational resolution exit-code tests

**Verification commands:**

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add agents preflight command and wire it into implement-feature with ledger tracking
- **Outcome:** ai-toolkit agents preflight --project <dir> --pipeline implement-feature verifies every required agent using --require-verified semantics and hard-stops on any unverified agent or v0.12.0 manifest; implement-feature/SKILL.md opens a ledger entry agent-preflight:implement-feature (running) before the check, closes it to done on pass and marks it failed on failure, and if ledger open returns non-zero preflight does not run (fail-closed)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, INFRA-TASK-BE-03
- **Acceptance criteria:** AC-19, AC-39
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The preflight command and its ledger lifecycle in the skill are one fail-closed contract: the ledger entry must bracket the check so a failed open blocks preflight, and shipping the command without the ledger wiring would leave the entry point unguarded.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add agents preflight command with fail-closed ledger tracking

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=agents-cli-commands
```

```
grep -q "agents preflight" src/claude/skills/implement-feature/SKILL.md
```

```
grep -q "agent-preflight:implement-feature" src/claude/skills/implement-feature/SKILL.md
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Add preflight flow tests
- **Outcome:** tests/cli/agents-cli-commands.test.js covers preflight: v0.13.0 manifest with matching hashes passes and closes the ledger to done; v0.12.0 manifest hard-stops and marks failed; missing manifest hard-stops; a failed ledger open prevents the check from running
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-19
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** The pass, hard-stop, and fail-closed paths of preflight share one ledger-plus-manifest fixture; asserting them in a single suite guarantees the ledger transitions and the block-on-open-failure invariant are exercised as a whole.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add preflight flow and ledger-lifecycle tests

**Verification commands:**

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Add Tier 1 dispatch guard to implement-feature SKILL.md
- **Outcome:** implement-feature/SKILL.md is the toolkit-supported entry point: before each workflow dispatch it opens a pm-phaseN:dispatch ledger entry with whitelisted identity metadata (agentId, nativeAgentName, platform, toolkitVersion, resolutionScope, definitionHash); after Gate 2 only the pm-phase3 workflow returning status verified is dispatched and only its returned nativeName is used; if ledger open returns non-zero the dispatch does not proceed (fail-closed)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03, US-02-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07, AC-20
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Entry-point enforcement, the pre-dispatch ledger open with identity metadata, and the verified-only dispatch are a single guarded dispatch step; if any one were emitted separately the skill could dispatch before the ledger entry exists.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Tier 1 dispatch guard to implement-feature skill

**Verification commands:**

```
grep -q "pm-phase.*:dispatch" src/claude/skills/implement-feature/SKILL.md
```

```
grep -q "require-verified" src/claude/skills/implement-feature/SKILL.md
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Enforce hard stops for missing workflow and post-return ledger failure
- **Outcome:** implement-feature/SKILL.md hard-stops with remediation and no alternative dispatch when pm-phase3 is absent from the installed runtime; if ledger close or fail for a pm-phaseN:dispatch entry fails after the workflow returns, the pipeline hard-stops and the error is not swallowed
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01
- **Acceptance criteria:** AC-08, AC-22
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Both failure modes (workflow missing before dispatch, ledger close/fail failing after dispatch) are the two ends of the same dispatch lifecycle and must fail closed identically, so they are specified in one task to keep the no-swallowed-error rule uniform.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** hard-stop on missing pm-phase3 and post-return ledger failure

**Verification commands:**

```
grep -q "HARD STOP" src/claude/skills/implement-feature/SKILL.md
```

```
grep -q "pm-phase3" src/claude/skills/implement-feature/SKILL.md
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Add Tier 1 dispatch guard tests
- **Outcome:** tests/integration/agent-resolution-e2e.test.js asserts Tier 1 behaviour contractually: ledger open with identity metadata before dispatch; fail-closed when open returns non-zero; hard stop when pm-phase3 is absent; hard stop (error not swallowed) when close/fail fails after return; no real LLM pipeline invoked
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-02
- **Acceptance criteria:** AC-06, AC-20, AC-22
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 40000
- **Output count:** 1
- **Grouping rationale:** The Tier 1 open/close/fail lifecycle is one flow; verifying the metadata write, the fail-closed open, and the non-swallowed close/fail failure in a single deterministic simulation avoids fixture drift between the branches.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add Tier 1 dispatch guard integration tests

**Verification commands:**

```
npm test -- --testPathPattern=agent-resolution-e2e
```

```
test -f tests/integration/agent-resolution-e2e.test.js
```

<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Add Tier 2 resolution guard to pm-phase1/2/3 workflows
- **Outcome:** src/claude/workflows/pm-phase1.js, pm-phase2.js, and pm-phase3.js invoke ai-toolkit agents resolve --require-verified before dispatching each worker agent, check the exit code, and dispatch using only the returned nativeName; none of them import lib/agent-registry directly or derive a native name independently
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-31
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** All three workflows share the identical resolve-then-dispatch contract; changing them in one task keeps the --require-verified call site and the nativeName-only rule uniform, preventing one workflow from diverging into direct resolution.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Tier 2 resolution guard to pm-phase workflows

**Verification commands:**

```
grep -q "agents resolve.*--require-verified" src/claude/workflows/pm-phase1.js
```

```
grep -q "agents resolve.*--require-verified" src/claude/workflows/pm-phase3.js
```

```
npm test
```

<a id="task-US-05-TASK-BE-02"></a>
### US-05-TASK-BE-02

- **Task ID:** US-05-TASK-BE-02
- **Title:** Enforce registry validation of Work Breakdown agent_type values
- **Outcome:** the registry validates agent_type values coming from Work Breakdowns: unknown values are rejected with a structured error and the pipeline does not start; declared legacy values resolve via explicit mapping (never passed to the platform unresolved)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-25
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Accepting known/legacy values and rejecting unknown ones are the two halves of one validateAgentSet contract; separating them risks an unknown value slipping through while legacy mapping is added.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** reject unknown Work Breakdown agent_type values in the registry

**Verification commands:**

```
node --check lib/agent-registry.js
```

```
npm test -- --testPathPattern=agent-registry
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Add static guard and Tier 2 resolution tests
- **Outcome:** tests/regression/static-guards.test.js asserts (a) no workflow .js file contains require('../lib/agent-registry') and (b) every agents resolve invocation in workflow files includes --require-verified; the suite also asserts Tier 2 uses the returned nativeName only and that unknown WB agent_type values are rejected
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01, US-05-TASK-BE-02
- **Acceptance criteria:** AC-42, AC-31, AC-25
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** The static import ban and the --require-verified requirement are two facets of the same anti-bypass guarantee proven by one source-scanning test; bundling the Tier 2 runtime assertions keeps every enforcement of workflow-level resolution in a single regression file.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add static guard tests for workflow resolution boundaries

**Verification commands:**

```
npm test -- --testPathPattern=static-guards
```

```
test -f tests/regression/static-guards.test.js
```

<a id="task-US-06-TASK-BE-01"></a>
### US-06-TASK-BE-01

- **Task ID:** US-06-TASK-BE-01
- **Title:** Add pm-phaseN:self ledger self-registration to pm-phase workflows
- **Outcome:** src/claude/workflows/pm-phase1.js, pm-phase2.js, and pm-phase3.js each open a pm-phaseN:self ledger entry (running) BEFORE any main workflow logic runs; if that ledger open returns non-zero the workflow HARD-STOPS and aborts before doing any work (fail-closed); on successful completion the SAME workflow closes its own pm-phaseN:self entry to done; in its error path the SAME workflow marks its own pm-phaseN:self entry failed; a genuine host/process interruption may legitimately leave the entry running; the :self entry is owned solely by the workflow and is never touched by the Tier 1 :dispatch guard
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** UC-06 (Tier 3) is a single fail-closed lifecycle owned by each workflow: opening pm-phaseN:self before any logic, aborting if that open fails, and closing it done / marking it failed from the SAME workflow are one contract that must ship together, otherwise a half-wired workflow could run its logic without a self entry or leave the entry running forever. This task is UC-06's implementation coverage; the Requirements AC table associates no AC directly with UC-06, so acceptanceCriteria is empty, mirroring the INFRA phase.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add pm-phaseN:self ledger self-registration with fail-closed lifecycle

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

```
node --check src/claude/workflows/pm-phase3.js
```

```
grep -q "pm-phase.*:self" src/claude/workflows/pm-phase3.js
```

```
npm test -- --testPathPattern=self-registration
```

<a id="task-US-06-TASK-TEST-01"></a>
### US-06-TASK-TEST-01

- **Task ID:** US-06-TASK-TEST-01
- **Title:** Add Tier 3 self-registration lifecycle tests
- **Outcome:** tests/integration/self-registration.test.js asserts UC-06 contractually: the workflow opens pm-phaseN:self before main logic; a failed ledger open hard-stops the workflow before any work (fail-closed); successful completion closes the SAME pm-phaseN:self entry to done; an internal error marks the SAME entry failed; a simulated interruption legitimately leaves it running; the :self entry is never closed by the Tier 1 :dispatch guard; no real LLM pipeline is invoked
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-06-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** The open-before-logic, fail-closed-open, done-close, failed-on-error, and interrupted-stays-running branches of UC-06 share one workflow-plus-ledger simulation fixture, so asserting them in a single suite proves the self entry is owned and terminated by the same workflow across its whole lifecycle. UC-06 has no directly-associated AC in the Requirements AC table, so acceptanceCriteria is empty.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add Tier 3 workflow self-registration lifecycle tests

**Verification commands:**

```
npm test -- --testPathPattern=self-registration
```

```
test -f tests/integration/self-registration.test.js
```

<a id="task-US-08-TASK-BE-01"></a>
### US-08-TASK-BE-01

- **Task ID:** US-08-TASK-BE-01
- **Title:** Create doctor agents command with full diagnostics
- **Outcome:** ai-toolkit doctor agents --project <dir> enumerates registered toolkit agents with scope, provenance path, version and integrity, reporting each with exactly one status (verified / conflict / hash-unverifiable / unobservable / not-installed / not-applicable, digest mismatch reported as conflict + hash-mismatch detail); it detects collisions, flags foreign observable agents, lists legacy references and remediation, emits an unobservable WARNING for non-observable scopes without blocking, and modifies/creates/deletes no file
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-13, AC-14, AC-09, AC-33
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 40000
- **Output count:** 1
- **Grouping rationale:** The six-value status assignment, collision/foreign detection, unobservable warning, and read-only guarantee are one coherent diagnostic pass over the same scope inventory; splitting them would let one code path report a status the others do not recognise.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add doctor agents command with comprehensive diagnostics

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-08-TASK-TEST-01"></a>
### US-08-TASK-TEST-01

- **Task ID:** US-08-TASK-TEST-01
- **Title:** Add doctor agents tests
- **Outcome:** tests/cli/agents-cli-commands.test.js verifies doctor agents: each agent gets exactly one of the six status values, digest mismatch reported as conflict + hash-mismatch, non-observable scope emits an unobservable WARNING without blocking, foreign observable agents flagged, and no file is modified/created/deleted
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-08-TASK-BE-01
- **Acceptance criteria:** AC-13, AC-14, AC-33
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** The status-value matrix, the unobservable warning, and the read-only invariant are only meaningful when asserted against one shared multi-scope fixture, so they belong in a single doctor test suite.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add doctor agents diagnostic tests

**Verification commands:**

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-09-TASK-BE-01"></a>
### US-09-TASK-BE-01

- **Task ID:** US-09-TASK-BE-01
- **Title:** Create agents cleanup --dry-run command (read-only)
- **Outcome:** ai-toolkit agents cleanup --project <dir> [--dry-run] lists cleanup candidates only (old-manifest files no longer in the current payload and still on disk); a manifest entry whose file is absent from disk is reported as missing and never a candidate; a file on disk absent from the manifest is treated as user-owned and never proposed; any mutating flag (--delete/--force) is rejected as unsupported with a non-zero exit; no file is modified or deleted
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-15, AC-16
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** The candidate classification (candidate vs missing vs user-owned) and the mutating-flag rejection are one read-only safety contract; a partial implementation could either delete a user-owned file or accept a mutating flag, so both rules ship together.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add agents cleanup dry-run command

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-09-TASK-TEST-01"></a>
### US-09-TASK-TEST-01

- **Task ID:** US-09-TASK-TEST-01
- **Title:** Add cleanup command tests
- **Outcome:** tests/cli/agents-cli-commands.test.js verifies cleanup: dry-run lists only genuine candidates, missing files are reported as missing (never candidates), user-owned files are never proposed, mutating flags are rejected with non-zero exit, and no file is touched
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-09-TASK-BE-01
- **Acceptance criteria:** AC-15, AC-16
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** Every classification branch and the mutating-flag rejection must be asserted against one manifest-plus-disk fixture so the read-only guarantee is proven for all file categories at once.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add agents cleanup classification tests

**Verification commands:**

```
npm test -- --testPathPattern=agents-cli-commands
```

<a id="task-US-10-TASK-BE-01"></a>
### US-10-TASK-BE-01

- **Task ID:** US-10-TASK-BE-01
- **Title:** Detect observable-scope collisions during resolution and preflight
- **Outcome:** when two observable installations provide agents with the same effective native name at equal or higher precedence, resolution/preflight report the collision with both paths and do not start the pipeline until resolved; an ambiguous or missing agent yields a non-zero exit with a structured error and no fallback
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-08-TASK-BE-01
- **Acceptance criteria:** AC-10, AC-05
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Collision detection and the ambiguous-agent non-zero path are the same precedence-resolution logic viewed from two angles; implementing them together ensures a collision is never silently resolved to one candidate.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** detect observable-scope agent name collisions

**Verification commands:**

```
node --check lib/agent-registry.js
```

```
npm test -- --testPathPattern=collision-detection
```

<a id="task-US-10-TASK-TEST-01"></a>
### US-10-TASK-TEST-01

- **Task ID:** US-10-TASK-TEST-01
- **Title:** Add collision and temporary-home isolation tests
- **Outcome:** tests/cli/collision-detection.test.js covers observable-scope collisions (hard stop with both paths), a foreign project-manager.md from an old tool reported as foreign and not blocking, and uses a temporary home directory for every scope/collision scenario so no test reads or writes the real user home
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-10-TASK-BE-01, US-08-TASK-BE-01
- **Acceptance criteria:** AC-10, AC-28, AC-29, AC-09
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** Collision reporting, foreign-agent classification, and the no-real-home rule all require the same synthesised temporary-home layout, so they are one suite; splitting them would duplicate fragile home-directory fixtures and risk one test touching the real home.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add collision detection and temp-home isolation tests

**Verification commands:**

```
npm test -- --testPathPattern=collision-detection
```

```
test -f tests/cli/collision-detection.test.js
```

<a id="task-US-11-TASK-BE-01"></a>
### US-11-TASK-BE-01

- **Task ID:** US-11-TASK-BE-01
- **Title:** Make the installer compute and record file hashes
- **Outcome:** the bin/cli.js installer calls computeFileSha256() for every copied file and passes a fileHashes object to writeManifest() so a v0.13.0+ install produces a manifest with files and fileHashes, each path hashed to sha256:<hex>, with the invariant set(files) == set(keys(fileHashes)) enforced on write and no production install path emitting a hash-free manifest
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, INFRA-TASK-BE-02
- **Acceptance criteria:** AC-38, AC-11
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Computing hashes, passing them to writeManifest, and enforcing the files/fileHashes set-equality invariant are one write path; a partial change would produce a manifest whose hashes and file list disagree, which the invariant exists to prevent.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** record per-file SHA-256 hashes in the installer manifest

**Verification commands:**

```
node --check bin/cli.js
```

```
npm test -- --testPathPattern=manifest-hashes
```

<a id="task-US-11-TASK-BE-02"></a>
### US-11-TASK-BE-02

- **Task ID:** US-11-TASK-BE-02
- **Title:** Register legacy agent types transitionally and document the inventory
- **Outcome:** the registry registers every legacy non-namespaced agent name as a transitional catalog entry (catalogued, manifest-tracked, hash-recorded) and documents the full agent-type inventory with canonical-ID mappings covering at least developer-backend, developer-frontend, developer-testing, developer-database, review-solution
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-23
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** The transitional registration and the inventory documentation describe the same catalog snapshot; producing them together guarantees every declared agent type has both a mapping and a catalog entry before Phase B renames begin.
- **Commit type:** docs
- **Commit scope:** —
- **Commit subject:** register legacy agent types transitionally with documented inventory

**Verification commands:**

```
node --check lib/agent-registry.js
```

```
npm test -- --testPathPattern=agent-registry
```

<a id="task-US-11-TASK-TEST-01"></a>
### US-11-TASK-TEST-01

- **Task ID:** US-11-TASK-TEST-01
- **Title:** Add manifest hash and v0.12.0 to v0.13.0 upgrade tests
- **Outcome:** tests/cli/manifest-hashes.test.js covers SHA-256 format, backward-compatible reads of manifests that have files but no fileHashes, the set(files) == set(keys(fileHashes)) invariant, and a v0.12.0 to v0.13.0 upgrade where files hold the current payload after orphan cleanup, fileHashes has exactly one key per files entry, and doctor agents transitions from hash-unverifiable to verified
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-11-TASK-BE-01
- **Acceptance criteria:** AC-38, AC-40, AC-11
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 38000
- **Output count:** 1
- **Grouping rationale:** The upgrade path is only verifiable end to end when hash format, backward-compat reads, the invariant, and the hash-unverifiable-to-verified transition are exercised against one evolving manifest fixture in a single suite.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add manifest hash and upgrade-path tests

**Verification commands:**

```
npm test -- --testPathPattern=manifest-hashes
```

```
test -f tests/cli/manifest-hashes.test.js
```

<a id="task-US-12-TASK-BE-01"></a>
### US-12-TASK-BE-01

- **Task ID:** US-12-TASK-BE-01
- **Title:** Remove legacy orchestrator references from runtime assets
- **Outcome:** all installed toolkit files are audited so no file references /agent-project-manager, hi-gaia/SKILL.md no longer lists project-manager or assessment-manager as spawnable, implement-feature/SKILL.md no longer uses the label project-manager/pm-phase3, and every entry-point reference uses a canonical name
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-17
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Legacy references live across skills, workflows, and agent files but express one orchestrator contract; removing them in a single sweep prevents a half-cleaned state where one asset still names the retired orchestrator.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** remove legacy orchestrator references from runtime assets

**Verification commands:**

```
! grep -rn "/agent-project-manager" src/claude/
```

```
! grep -rn "assessment-manager" src/claude/skills/
```

```
npm test
```

<a id="task-US-12-TASK-BE-02"></a>
### US-12-TASK-BE-02

- **Task ID:** US-12-TASK-BE-02
- **Title:** Add explicit legacy agent_type mapping with deprecation
- **Outcome:** the registry maps each legacy agent_type to exactly one canonical ID via explicit mapping with deprecation warnings (developer-database maps to gaia.agent.developer.backend, no developer-database.md is created), generate-work-breakdown.md no longer lists developer-database as a valid new value, and existing Work Breakdowns with legacy agent_type values continue to resolve with no WB update required
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-11-TASK-BE-02
- **Acceptance criteria:** AC-24, AC-26, AC-37
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Deprecation mapping, the generator no longer offering developer-database, and continued resolution of existing WBs are one backward-compatibility contract; separating them could drop a legacy value while the generator still emits it.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add explicit legacy agent_type mapping with deprecation warnings

**Verification commands:**

```
node --check lib/agent-registry.js
```

```
npm test -- --testPathPattern=agent-registry
```

<a id="task-US-12-TASK-BE-25"></a>
### US-12-TASK-BE-25

- **Task ID:** US-12-TASK-BE-25
- **Title:** Phase A completion gate before Phase B atomic renames
- **Outcome:** a verifiable checkpoint that proves Phase A is complete and green before any Phase B atomic rename begins (BR-13): every Phase A guard, hash, ledger-metadata, registry, legacy-fix, and agent-type-inventory task is implemented with its tests present, the full npm test suite is green, and the Phase A static-guard regression suite (tests/regression/static-guards.test.js) passes; no Phase B per-agent rename (US-12-TASK-BE-03..BE-23) may start until this gate is satisfied
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-03, US-01-TASK-TEST-01, US-02-TASK-TEST-01, US-03-TASK-TEST-01, US-04-TASK-TEST-01, US-05-TASK-TEST-01, US-06-TASK-TEST-01, US-08-TASK-TEST-01, US-09-TASK-TEST-01, US-10-TASK-TEST-01, US-11-TASK-TEST-01, US-13-TASK-TEST-01, US-14-TASK-TEST-01, US-12-TASK-TEST-01, US-12-TASK-BE-01, US-12-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** BR-13 requires Phase A to complete and pass all tests before Phase B atomic renaming begins; this single gate task turns that ordering into a real edge in the dependency graph by depending on the terminal implementation+test task of every Phase A user story (INFRA/US-01..US-05, US-06, US-08..US-11, US-13, US-14) plus the two Phase-A tasks inside US-12 (BE-01 legacy-reference removal and BE-02 legacy agent_type mapping), which transitively covers every Phase A task; its verification runs the full green npm test suite plus the static-guard, manifest-hash, and ledger-metadata regressions, so no per-agent rename can be scheduled until Phase A is proven done and green.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** gate Phase B atomic renames on a green Phase A (BR-13)

**Verification commands:**

```
npm test
```

```
npm test -- --testPathPattern=static-guards
```

```
npm test -- --testPathPattern=manifest-hashes
```

```
npm test -- --testPathPattern=ledger-metadata
```

<a id="task-US-12-TASK-BE-03"></a>
### US-12-TASK-BE-03

- **Task ID:** US-12-TASK-BE-03
- **Title:** Rename agent define-feature to gaia-define-feature
- **Outcome:** src/claude/agents/define-feature.md is renamed to gaia-define-feature.md with its name: frontmatter updated to gaia-define-feature; all consumers (define-feature command and SKILL.md, implement-feature/SKILL.md, hi-gaia/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (define-feature command and SKILL.md, implement-feature/SKILL.md, hi-gaia/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for define-feature form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename define-feature agent to gaia-define-feature with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-define-feature.md
```

```
test ! -f src/claude/agents/define-feature.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-04"></a>
### US-12-TASK-BE-04

- **Task ID:** US-12-TASK-BE-04
- **Title:** Rename agent generate-requirements to gaia-generate-requirements
- **Outcome:** src/claude/agents/generate-requirements.md is renamed to gaia-generate-requirements.md with its name: frontmatter updated to gaia-generate-requirements; all consumers (pm-phase1.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase1.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for generate-requirements form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename generate-requirements agent to gaia-generate-requirements with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-generate-requirements.md
```

```
test ! -f src/claude/agents/generate-requirements.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-05"></a>
### US-12-TASK-BE-05

- **Task ID:** US-12-TASK-BE-05
- **Title:** Rename agent generate-tech-spec to gaia-generate-tech-spec
- **Outcome:** src/claude/agents/generate-tech-spec.md is renamed to gaia-generate-tech-spec.md with its name: frontmatter updated to gaia-generate-tech-spec; all consumers (pm-phase1.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase1.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for generate-tech-spec form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename generate-tech-spec agent to gaia-generate-tech-spec with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-generate-tech-spec.md
```

```
test ! -f src/claude/agents/generate-tech-spec.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-06"></a>
### US-12-TASK-BE-06

- **Task ID:** US-12-TASK-BE-06
- **Title:** Rename agent validate-feature-docs to gaia-validate-feature-docs
- **Outcome:** src/claude/agents/validate-feature-docs.md is renamed to gaia-validate-feature-docs.md with its name: frontmatter updated to gaia-validate-feature-docs; all consumers (pm-phase1.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase1.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for validate-feature-docs form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename validate-feature-docs agent to gaia-validate-feature-docs with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-validate-feature-docs.md
```

```
test ! -f src/claude/agents/validate-feature-docs.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-07"></a>
### US-12-TASK-BE-07

- **Task ID:** US-12-TASK-BE-07
- **Title:** Rename agent generate-work-breakdown to gaia-generate-work-breakdown
- **Outcome:** src/claude/agents/generate-work-breakdown.md is renamed to gaia-generate-work-breakdown.md with its name: frontmatter updated to gaia-generate-work-breakdown; all consumers (pm-phase2.js, generate-work-breakdown agent-type references, and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase2.js, generate-work-breakdown agent-type references, and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for generate-work-breakdown form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename generate-work-breakdown agent to gaia-generate-work-breakdown with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-generate-work-breakdown.md
```

```
test ! -f src/claude/agents/generate-work-breakdown.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-08"></a>
### US-12-TASK-BE-08

- **Task ID:** US-12-TASK-BE-08
- **Title:** Rename agent validate-work-breakdown-semantic to gaia-validate-work-breakdown-semantic
- **Outcome:** src/claude/agents/validate-work-breakdown-semantic.md is renamed to gaia-validate-work-breakdown-semantic.md with its name: frontmatter updated to gaia-validate-work-breakdown-semantic; all consumers (pm-phase2.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase2.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for validate-work-breakdown-semantic form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename validate-work-breakdown-semantic agent to gaia-validate-work-breakdown-semantic with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-validate-work-breakdown-semantic.md
```

```
test ! -f src/claude/agents/validate-work-breakdown-semantic.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-09"></a>
### US-12-TASK-BE-09

- **Task ID:** US-12-TASK-BE-09
- **Title:** Rename agent developer-backend to gaia-developer-backend
- **Outcome:** src/claude/agents/developer-backend.md is renamed to gaia-developer-backend.md with its name: frontmatter updated to gaia-developer-backend; all consumers (pm-phase3.js, generate-work-breakdown.md agentType references, and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase3.js, generate-work-breakdown.md agentType references, and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for developer-backend form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename developer-backend agent to gaia-developer-backend with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-developer-backend.md
```

```
test ! -f src/claude/agents/developer-backend.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-10"></a>
### US-12-TASK-BE-10

- **Task ID:** US-12-TASK-BE-10
- **Title:** Rename agent developer-frontend to gaia-developer-frontend
- **Outcome:** src/claude/agents/developer-frontend.md is renamed to gaia-developer-frontend.md with its name: frontmatter updated to gaia-developer-frontend; all consumers (pm-phase3.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase3.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for developer-frontend form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename developer-frontend agent to gaia-developer-frontend with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-developer-frontend.md
```

```
test ! -f src/claude/agents/developer-frontend.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-11"></a>
### US-12-TASK-BE-11

- **Task ID:** US-12-TASK-BE-11
- **Title:** Rename agent developer-testing to gaia-developer-testing
- **Outcome:** src/claude/agents/developer-testing.md is renamed to gaia-developer-testing.md with its name: frontmatter updated to gaia-developer-testing; all consumers (pm-phase3.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase3.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for developer-testing form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename developer-testing agent to gaia-developer-testing with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-developer-testing.md
```

```
test ! -f src/claude/agents/developer-testing.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-12"></a>
### US-12-TASK-BE-12

- **Task ID:** US-12-TASK-BE-12
- **Title:** Rename agent review-solution to gaia-review-solution
- **Outcome:** src/claude/agents/review-solution.md is renamed to gaia-review-solution.md with its name: frontmatter updated to gaia-review-solution; all consumers (pm-phase3.js and implement-feature/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (pm-phase3.js and implement-feature/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for review-solution form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename review-solution agent to gaia-review-solution with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-review-solution.md
```

```
test ! -f src/claude/agents/review-solution.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-13"></a>
### US-12-TASK-BE-13

- **Task ID:** US-12-TASK-BE-13
- **Title:** Rename agent generic-software-assessment to gaia-generic-software-assessment
- **Outcome:** src/claude/agents/generic-software-assessment.md is renamed to gaia-generic-software-assessment.md with its name: frontmatter updated to gaia-generic-software-assessment; all consumers (am-phase1.js SCOPE_AGENT_MAP[quality], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js SCOPE_AGENT_MAP[quality], am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for generic-software-assessment form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename generic-software-assessment agent to gaia-generic-software-assessment with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-generic-software-assessment.md
```

```
test ! -f src/claude/agents/generic-software-assessment.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-14"></a>
### US-12-TASK-BE-14

- **Task ID:** US-12-TASK-BE-14
- **Title:** Rename agent layered-architecture-assessment to gaia-layered-architecture-assessment
- **Outcome:** src/claude/agents/layered-architecture-assessment.md is renamed to gaia-layered-architecture-assessment.md with its name: frontmatter updated to gaia-layered-architecture-assessment; all consumers (am-phase1.js SCOPE_AGENT_MAP[architecture], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js SCOPE_AGENT_MAP[architecture], am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for layered-architecture-assessment form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename layered-architecture-assessment agent to gaia-layered-architecture-assessment with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-layered-architecture-assessment.md
```

```
test ! -f src/claude/agents/layered-architecture-assessment.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-15"></a>
### US-12-TASK-BE-15

- **Task ID:** US-12-TASK-BE-15
- **Title:** Rename agent concurrency-safety-assessment to gaia-concurrency-safety-assessment
- **Outcome:** src/claude/agents/concurrency-safety-assessment.md is renamed to gaia-concurrency-safety-assessment.md with its name: frontmatter updated to gaia-concurrency-safety-assessment; all consumers (am-phase1.js SCOPE_AGENT_MAP[concurrency], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js SCOPE_AGENT_MAP[concurrency], am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for concurrency-safety-assessment form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename concurrency-safety-assessment agent to gaia-concurrency-safety-assessment with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-concurrency-safety-assessment.md
```

```
test ! -f src/claude/agents/concurrency-safety-assessment.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-16"></a>
### US-12-TASK-BE-16

- **Task ID:** US-12-TASK-BE-16
- **Title:** Rename agent security-hardening to gaia-security-hardening
- **Outcome:** src/claude/agents/security-hardening.md is renamed to gaia-security-hardening.md with its name: frontmatter updated to gaia-security-hardening; all consumers (am-phase1.js SCOPE_AGENT_MAP[security], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js SCOPE_AGENT_MAP[security], am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for security-hardening form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename security-hardening agent to gaia-security-hardening with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-security-hardening.md
```

```
test ! -f src/claude/agents/security-hardening.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-17"></a>
### US-12-TASK-BE-17

- **Task ID:** US-12-TASK-BE-17
- **Title:** Rename agent dependency-supply-chain-security to gaia-dependency-supply-chain-security
- **Outcome:** src/claude/agents/dependency-supply-chain-security.md is renamed to gaia-dependency-supply-chain-security.md with its name: frontmatter updated to gaia-dependency-supply-chain-security; all consumers (am-phase1.js SCOPE_AGENT_MAP[dependencies], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js SCOPE_AGENT_MAP[dependencies], am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for dependency-supply-chain-security form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename dependency-supply-chain-security agent to gaia-dependency-supply-chain-security with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-dependency-supply-chain-security.md
```

```
test ! -f src/claude/agents/dependency-supply-chain-security.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-18"></a>
### US-12-TASK-BE-18

- **Task ID:** US-12-TASK-BE-18
- **Title:** Rename agent domain-model-refactoring to gaia-domain-model-refactoring
- **Outcome:** src/claude/agents/domain-model-refactoring.md is renamed to gaia-domain-model-refactoring.md with its name: frontmatter updated to gaia-domain-model-refactoring; all consumers (am-phase1.js SCOPE_AGENT_MAP[domain-model], am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js SCOPE_AGENT_MAP[domain-model], am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for domain-model-refactoring form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename domain-model-refactoring agent to gaia-domain-model-refactoring with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-domain-model-refactoring.md
```

```
test ! -f src/claude/agents/domain-model-refactoring.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-19"></a>
### US-12-TASK-BE-19

- **Task ID:** US-12-TASK-BE-19
- **Title:** Rename agent dependency-injection-refactoring to gaia-dependency-injection-refactoring
- **Outcome:** src/claude/agents/dependency-injection-refactoring.md is renamed to gaia-dependency-injection-refactoring.md with its name: frontmatter updated to gaia-dependency-injection-refactoring; all consumers (am-phase1.js, am-phase2.js, assess-codebase/SKILL.md, and intervention-documentation-standard references) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js, am-phase2.js, assess-codebase/SKILL.md, and intervention-documentation-standard references), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for dependency-injection-refactoring form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename dependency-injection-refactoring agent to gaia-dependency-injection-refactoring with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-dependency-injection-refactoring.md
```

```
test ! -f src/claude/agents/dependency-injection-refactoring.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-20"></a>
### US-12-TASK-BE-20

- **Task ID:** US-12-TASK-BE-20
- **Title:** Rename agent god-class-decomposition to gaia-god-class-decomposition
- **Outcome:** src/claude/agents/god-class-decomposition.md is renamed to gaia-god-class-decomposition.md with its name: frontmatter updated to gaia-god-class-decomposition; all consumers (am-phase1.js, am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js, am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for god-class-decomposition form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename god-class-decomposition agent to gaia-god-class-decomposition with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-god-class-decomposition.md
```

```
test ! -f src/claude/agents/god-class-decomposition.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-21"></a>
### US-12-TASK-BE-21

- **Task ID:** US-12-TASK-BE-21
- **Title:** Rename agent intervention-documentation-standard to gaia-intervention-documentation-standard
- **Outcome:** src/claude/agents/intervention-documentation-standard.md is renamed to gaia-intervention-documentation-standard.md with its name: frontmatter updated to gaia-intervention-documentation-standard; all consumers (am-phase1.js, am-phase2.js, and assess-codebase/SKILL.md) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (am-phase1.js, am-phase2.js, and assess-codebase/SKILL.md), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for intervention-documentation-standard form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename intervention-documentation-standard agent to gaia-intervention-documentation-standard with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-intervention-documentation-standard.md
```

```
test ! -f src/claude/agents/intervention-documentation-standard.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-22"></a>
### US-12-TASK-BE-22

- **Task ID:** US-12-TASK-BE-22
- **Title:** Rename agent init-agents-md to gaia-init-agents-md
- **Outcome:** src/claude/agents/init-agents-md.md is renamed to gaia-init-agents-md.md with its name: frontmatter updated to gaia-init-agents-md; all consumers (hi-gaia/SKILL.md and the install-toolkit flow) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (hi-gaia/SKILL.md and the install-toolkit flow), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for init-agents-md form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename init-agents-md agent to gaia-init-agents-md with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-init-agents-md.md
```

```
test ! -f src/claude/agents/init-agents-md.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-23"></a>
### US-12-TASK-BE-23

- **Task ID:** US-12-TASK-BE-23
- **Title:** Rename agent install-toolkit to gaia-install-toolkit
- **Outcome:** src/claude/agents/install-toolkit.md is renamed to gaia-install-toolkit.md with its name: frontmatter updated to gaia-install-toolkit; all consumers (hi-gaia/SKILL.md and the install command flow) are updated to the new name; the registry native-name mapping and the bin/cli.js installer catalog entry are updated so the legacy name is no longer distributed; all referencing test files are updated; npm test passes; the entire rename ships in one atomic commit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-02, US-12-TASK-BE-25
- **Acceptance criteria:** AC-35
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** A rename is only correct when the file, its frontmatter, every consumer (hi-gaia/SKILL.md and the install command flow), the registry native-name mapping, the installer catalog entry, and the tests change together; any partial rename leaves a dangling reference and breaks dispatch, so all edits for install-toolkit form one atomic commit.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** rename install-toolkit agent to gaia-install-toolkit with all consumers

**Verification commands:**

```
test -f src/claude/agents/gaia-install-toolkit.md
```

```
test ! -f src/claude/agents/install-toolkit.md
```

```
npm test
```

<a id="task-US-12-TASK-BE-24"></a>
### US-12-TASK-BE-24

- **Task ID:** US-12-TASK-BE-24
- **Title:** Enforce Phase B completion gate
- **Outcome:** a scheduled atomic rename task exists for every toolkit agent that carried a legacy non-namespaced name; after all renames ~/.claude/agents/ contains only registered gaia-* files with no legacy-named file and no legacy distribution mapping remaining, the installer accepts and distributes only gaia-* native names, and the feature is not marked complete until this holds
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-12-TASK-BE-03, US-12-TASK-BE-04, US-12-TASK-BE-05, US-12-TASK-BE-06, US-12-TASK-BE-07, US-12-TASK-BE-08, US-12-TASK-BE-09, US-12-TASK-BE-10, US-12-TASK-BE-11, US-12-TASK-BE-12, US-12-TASK-BE-13, US-12-TASK-BE-14, US-12-TASK-BE-15, US-12-TASK-BE-16, US-12-TASK-BE-17, US-12-TASK-BE-18, US-12-TASK-BE-19, US-12-TASK-BE-20, US-12-TASK-BE-21, US-12-TASK-BE-22, US-12-TASK-BE-23, US-12-TASK-BE-01
- **Acceptance criteria:** AC-27, AC-34, AC-36
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** AC-27, AC-34, and AC-36 are one completion invariant over the whole agents directory and installer mapping; they can only be asserted after every individual rename lands, so a single gate task verifies the aggregate end-state.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** enforce Phase B completion gate for gaia-* naming

**Verification commands:**

```
! ls src/claude/agents/ | grep -vE "^gaia-"
```

```
npm test
```

<a id="task-US-12-TASK-TEST-01"></a>
### US-12-TASK-TEST-01

- **Task ID:** US-12-TASK-TEST-01
- **Title:** Add regression tests blocking legacy orchestrator references
- **Outcome:** tests/regression/static-guards.test.js fails the build if any file introduces /agent-project-manager, subagent_type: project-manager, agentType: project-manager, or assessment-manager as a legacy orchestrator reference, and asserts that every orchestrator/Work Breakdown agent reference uses a canonical ID or a declared legacy mapping with no bare platform name used as a contract
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-12-TASK-BE-01
- **Acceptance criteria:** AC-18, AC-02
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** The CI regression that blocks reintroduced legacy references and the assertion that references stay canonical guard the same naming contract from opposite directions, so one versioned test file owns both to keep the merge gate coherent.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add regression tests blocking legacy orchestrator references

**Verification commands:**

```
npm test -- --testPathPattern=static-guards
```

```
test -f tests/regression/static-guards.test.js
```

<a id="task-US-13-TASK-BE-01"></a>
### US-13-TASK-BE-01

- **Task ID:** US-13-TASK-BE-01
- **Title:** Detect hash mismatch during resolution
- **Outcome:** resolveAgent() recomputes the current SHA-256 from the on-disk file and compares it against the manifest fileHashes record; a mismatch is reported as unverified so agents resolve --require-verified exits non-zero and dispatch is blocked, while diagnostic mode reports hash-mismatch; preflight hard-stops on mismatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-11-TASK-BE-01
- **Acceptance criteria:** AC-12
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Recomputing the on-disk hash, comparing it to the manifest, and downgrading the status to blocked are one integrity check; splitting them could report a mismatch yet still allow dispatch.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** detect installed-file hash mismatch during resolution

**Verification commands:**

```
node --check lib/agent-registry.js
```

```
npm test -- --testPathPattern=agent-registry
```

<a id="task-US-13-TASK-TEST-01"></a>
### US-13-TASK-TEST-01

- **Task ID:** US-13-TASK-TEST-01
- **Title:** Add hash mismatch tests
- **Outcome:** tests/cli/manifest-hashes.test.js verifies that a modified installed file (hash mismatch) is reported unverified, --require-verified exits non-zero with dispatch blocked, diagnostic mode reports hash-mismatch, and preflight hard-stops
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-13-TASK-BE-01
- **Acceptance criteria:** AC-12
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** The diagnostic-vs-operational behaviour on the same tampered file must be asserted together so the mismatch never yields exit 0 in either mode.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add installed-file hash mismatch tests

**Verification commands:**

```
npm test -- --testPathPattern=manifest-hashes
```

<a id="task-US-14-TASK-BE-01"></a>
### US-14-TASK-BE-01

- **Task ID:** US-14-TASK-BE-01
- **Title:** Add ledger CLI facade with whitelisted metadata flags
- **Outcome:** bin/cli.js ledger open/close/fail/skip accept optional identity flags (--agent-id, --native-name, --toolkit-version, --scope, --hash) passed through to lib/execution-ledger.js as a metadata object; first open stores metadata with reserved FTR-016 fields unchanged, an unknown metadata key is rejected before any write, and old entries survive updates without data loss
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-21, AC-41
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** The flag surface and the whitelist/reserved-field/no-data-loss guarantees are one metadata contract; exposing the flags without the guards would let a CLI caller corrupt reserved ledger fields.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger CLI facade with whitelisted metadata flags

**Verification commands:**

```
node --check bin/cli.js
```

```
grep -q "agent-id" bin/cli.js
```

```
npm test -- --testPathPattern=ledger-metadata
```

<a id="task-US-14-TASK-TEST-01"></a>
### US-14-TASK-TEST-01

- **Task ID:** US-14-TASK-TEST-01
- **Title:** Add ledger metadata safety invariant tests
- **Outcome:** tests/cli/ledger-metadata.test.js verifies all safety invariants: first open stores metadata with reserved fields unchanged; idempotent re-open with same metadata is a no-op; idempotent re-open with different metadata exits non-zero with no write; an unknown metadata key is rejected before any write; close/fail preserve metadata and update only status/timestamps/error
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-14-TASK-BE-01
- **Acceptance criteria:** AC-21, AC-41
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The five idempotency and reservation invariants act on the same ledger entry across its lifecycle, so they must be asserted as one ordered sequence against a shared entry to prove no branch performs an illegal write.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add ledger metadata safety invariant tests

**Verification commands:**

```
npm test -- --testPathPattern=ledger-metadata
```

```
test -f tests/cli/ledger-metadata.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 45 | 40 | 4 | 1 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 13 | 9 | 4 | 0 | 0 |
| **Total** | **58** | **49** | **8** | **1** | **0** |
