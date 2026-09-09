# Functional Requirements — Deterministic Agent Resolution and Orchestrator Guard

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-017: Deterministic Agent Resolution and Orchestrator Guard |
| Version | 1.0 |
| Date | 2026-09-04 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This requirements document specifies the implementation of a deterministic agent resolution and verification system that eliminates implicit trust in platform agent name resolution. The feature introduces a JavaScript-based registry layer, manifest integrity verification, a three-tier provenance guard, and CLI diagnostics to ensure that only verified toolkit agents are dispatched during the feature delivery pipeline.

### 1.2 Scope

**In Scope:**
- Canonical agent registry (`lib/agent-registry.js`) with resolved identity verification
- Provenance guard with manifest hash verification (SHA-256)
- CLI facade with diagnostic and operational modes (`agents resolve`, `agents preflight`, `agents list`, `doctor agents`, `agents cleanup`)
- Manifest extension with `fileHashes` field (backward-compatible)
- Execution Ledger integration with whitelisted metadata extension
- Three-tier dispatch guard: Tier 1 (skill-level before workflow dispatch), Tier 2 (workflow-level before worker agent dispatch), Tier 3 (workflow self-registration)
- Preflight phase with ledger tracking and fail-closed contract
- Phase A: Registry, guard, CLI, integration, manifest hashes, legacy fixes, and agent-type inventory
- Phase B: Atomic per-agent renaming tasks with full consumer updates and installer integration
- Static tests enforcing registry isolation and `--require-verified` usage
- Legacy `agent_type` mapping with deprecation warnings
- `developer-database` deprecation and mapping to `gaia.agent.developer.backend`
- Collision detection for observable scopes (project and global filesystem)
- Contractual interfaces for Codex and Copilot adapters

**Out of Scope:**
- Full runtime implementation of Codex and Copilot adapters (contractual interfaces only)
- Full provenance guard adoption in assessment pipeline (`am-phase1.js`, `am-phase2.js`)
- Task Checkpoints and Resume; per-task execution; per-task commit
- Parallel worktrees and `maxConcurrency > 1`
- Automatic deletion of user-owned agents
- Modification of personal configuration files without explicit operator command
- Fuzzy matching of agent roles; automatic fallbacks to semantically similar agents
- Functional redesign of developer agents
- Replacement of the Execution Ledger (FTR-016)
- Full v2 multiplatform migration
- Bulk non-atomic agent renaming
- Technical enforcement preventing toolkit-external invocations of legacy orchestrators
- CLI API for enumerating plugin-scope or session-scope agents
- Actual deletion or trash-move of stale installer artifacts (dry-run listing only in FTR-017)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Developer / User | End user executing the feature delivery pipeline via `/implement-feature` entry point |
| Skill: `/implement-feature` | Toolkit-supported entry point orchestrating Phase 1, 2, and 3 workflows with preflight and dispatch guards |
| Workflow Scripts | `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` — invoke resolution before dispatching worker agents (Tier 2) |
| CLI Facade | `ai-toolkit` command invoked by skill, workflows, and scripts for agent resolution and diagnostics |
| Registry Module | `lib/agent-registry.js` — pure JavaScript resolution engine used exclusively via CLI facade |
| Toolkit Installer | `bin/cli.js` / `writeManifest()` — extended to compute and record file hashes |
| Execution Ledger | `lib/execution-ledger.js` — extended with whitelisted metadata for dispatch tracking |

## 2. Use Cases

### UC-01: Resolve Toolkit Agent Identity (Diagnostic Mode)

| Field | Value |
|-------|-------|
| Actor | Developer, CLI tools, diagnostic scripts |
| Preconditions | Toolkit is installed; manifest may or may not have `fileHashes` |
| Trigger | Developer runs `ai-toolkit agents resolve --project <dir> --id <canonical-id>` |
| Priority | Must |

**Main flow:**
1. CLI invokes registry module with canonical agent ID
2. Registry loads canonical catalog (IDs, roles, types, native names, install paths, authorized phases)
3. Registry FIRST determines the single effective installation via the FTR-015 resolver (local vs global): if both a local and a global installation are present the resolver reports an ambiguity and resolution fails non-zero; otherwise the effective mode is whichever installation exists
4. Registry reads the manifest for the effective installation ONLY — local `<projectDir>/.claude/.ai-toolkit-manifest.json` when the effective mode is `local`, or global `<homeDir>/.claude/.ai-toolkit-manifest.json` when the effective mode is `global`. The local manifest is never read when the effective mode is global
5. Provenance guard verifies: agent ID exists in catalog; agent file present in observable scope; manifest declares file in `files`; no higher-precedence conflicts
6. If `fileHashes` present, the current SHA-256 recomputed from the on-disk file is matched against the recorded digest
7. Registry returns structured JSON with resolution record including status
8. Command exits with code 0 for a resolvable, known agent (verified, or the benign diagnostic status `hash-unverifiable`)

**Alternative flows (diagnostic mode, `agents resolve` without `--require-verified`):**
- Known agent with a legacy manifest lacking `fileHashes` (v0.12.0) → Returns `status: "hash-unverifiable"`; exits 0
- Known agent with a present digest that does not match the on-disk file → MAY return `status: "hash-mismatch"`; exits 0 (diagnostic only). Under `--require-verified` this same case MUST fail non-zero

**Error flows (non-zero exit EVEN in diagnostic mode):**
- Agent ID not in catalog (unknown ID) → Structured error record with `status: "not-found"`; exits non-zero
- Collision / ambiguity between two observable-scope files with the same effective native name → Structured error with `status: "conflict"`; exits non-zero
- Agent file not found in any observable scope → Structured error with `status: "not-installed"`; exits non-zero
- Manifest missing → Structured error with `status: "manifest-missing"`; exits non-zero
- Manifest corrupt or unreadable → Structured error on stderr; exits non-zero
- Unresolvable installation (no installation found, or ambiguous local+global installations per the FTR-015 resolver) → Structured error on stderr; exits non-zero

**Postconditions:**
- JSON response printed to stdout containing: `agentId`, `platform`, `nativeName`, `scope`, `path`, `toolkitVersion`, `manifestPath`, `sha256`, `status`
- Exit code 0 only for a resolvable, known agent (`verified`, or diagnostic-only `hash-unverifiable`/`hash-mismatch`); unknown ID, collision/ambiguity, corrupt manifest, and unresolvable installation exit non-zero even in diagnostic mode
- Operational mode (`--require-verified`) exits 0 ONLY when `status: "verified"`

### UC-02: Resolve Toolkit Agent Identity (Operational Mode with Verification)

| Field | Value |
|-------|-------|
| Actor | Skill scripts, workflow scripts, deployment pipelines |
| Preconditions | Toolkit is installed; manifest with `fileHashes` present (v0.13.0+) |
| Trigger | Workflow or skill runs `ai-toolkit agents resolve --project <dir> --id <canonical-id> --require-verified` |
| Priority | Must |

**Main flow:**
1. CLI invokes registry module with canonical agent ID and `--require-verified` flag
2. Registry performs same verification as UC-01
3. If `status` is `"verified"`: response includes all identity fields (`agentId`, `nativeName`, `scope`, `path`, `sha256`, etc.)
4. Command exits with code 0
5. Caller reads JSON from stdout and uses **only the returned `nativeName`** for subsequent dispatch

**Alternative flows:**
- None (this is the fail-closed operational form)

**Error flows:**
- Any status other than `"verified"` (including `hash-unverifiable`, `hash-mismatch`, `not-installed`, `not-found`) → Structured error message to stderr; exits non-zero; no agent data returned
- Manifest missing or corrupt → Structured error to stderr; exits non-zero
- Hash mismatch detected → Structured error to stderr; exits non-zero

**Postconditions:**
- On exit code 0: JSON with `status: "verified"` printed to stdout; workflow proceeds with dispatch
- On exit code ≠ 0: error message to stderr; caller does not dispatch; pipeline halts

### UC-03: Verify Agent Preflight Before Pipeline Start

| Field | Value |
|-------|-------|
| Actor | `/implement-feature` skill |
| Preconditions | Feature work directory ready; Execution Ledger operational |
| Trigger | `/implement-feature` skill invoked; before pm-phase1 dispatch |
| Priority | Must |

**Main flow:**
1. Skill opens preflight activity in Execution Ledger: `ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX> --agent agent-preflight:implement-feature --phase preflight --model sonnet --attempt 1`
2. If ledger open returns non-zero → fail-closed, do not proceed
3. Skill runs: `ai-toolkit agents preflight --project <dir> --pipeline implement-feature`
4. Preflight internally uses `--require-verified` semantics to verify each required agent
5. For each toolkit agent required by the pipeline:
   - Registry resolves agent with `--require-verified`
   - If any returns non-verified → preflight fails immediately
6. On preflight success: Skill closes ledger entry: `ai-toolkit ledger close --dir <featureDir> --prefix <PREFIX> --agent agent-preflight:implement-feature --attempt 1`
7. Skill proceeds to pm-phase1 dispatch

**Alternative flows:**
- v0.12.0 manifest (no `fileHashes`) → Preflight HARD STOP with message "reinstall or upgrade the toolkit runtime to generate integrity hashes"
- Missing manifest → Preflight HARD STOP; pipeline does not start
- Agent collision detected (two observable-scope files with same effective native name) → HARD STOP; both paths reported

**Error flows:**
- Any agent fails verification → Preflight fails; ledger entry marked failed with error details
- `ledger open` returns non-zero → Preflight does not run; pipeline does not start
- `ledger close` fails → Pipeline HARD STOPS with error

**Postconditions:**
- All required toolkit agents verified as `status: "verified"`
- Ledger contains `agent-preflight:implement-feature` entry with `status: done` (on close) or `failed` (FTR-016 vocabulary: `open` → `running`, `close` → `done`, `fail` → `failed`)
- Pipeline proceeds only if preflight closed successfully (`done`); otherwise halted

### UC-04: Dispatch Workflow with Tier 1 Guard (Skill-Level Identity Tracking)

| Field | Value |
|-------|-------|
| Actor | `/implement-feature` skill |
| Preconditions | Preflight passed; skill about to dispatch pm-phase1/phase2/phase3 workflow |
| Trigger | Before workflow dispatch, skill must guard dispatch with identity verification and ledger tracking |
| Priority | Must |

**Main flow:**
1. Skill resolves workflow identity: `ai-toolkit agents resolve --project <dir> --id <canonical-workflow-id> --require-verified`
2. Registry returns verified record with `nativeName` (e.g., `pm-phase3`)
3. Skill opens ledger entry with whitelisted metadata:
   ```
   ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX>
                          --agent pm-phase3:dispatch --phase implementation --model sonnet
                          --attempt 1
                          --agent-id gaia.orchestrator.feature.phase3
                          --native-name pm-phase3
                          --toolkit-version 0.13.0
                          --scope project
                          --hash sha256:<hex>
   ```
4. If ledger open returns non-zero → fail-closed; workflow not dispatched
5. Skill dispatches workflow using returned `nativeName` in `subagent_type` field (e.g., `subagent_type: pm-phase3`)
6. Workflow executes; returns success or error
7. Skill calls ledger close or fail with same `--prefix` and `--agent` identifier
8. If ledger operation fails → pipeline HARD STOPS

**Alternative flows:**
- Resolved agent status is not `"verified"` → Workflow not dispatched; fail-closed; error returned
- v0.12.0 manifest → Resolution returns non-zero; workflow not dispatched

**Error flows:**
- `ledger open` fails → Error logged; workflow not dispatched; pipeline halts
- Workflow fails → Skill calls `ledger fail` with error details
- `ledger close`/`fail` fails → Pipeline HARD STOPS with error (not swallowed)

**Postconditions:**
- Ledger entry created with metadata fields: `agentId`, `nativeAgentName`, `platform`, `toolkitVersion`, `resolutionScope`, `definitionHash`
- Metadata fields immutable; any re-open with different values → HARD STOP
- Workflow dispatched only if ledger open succeeded
- Entry closed/failed only after workflow returns

### UC-05: Dispatch Worker Agent with Tier 2 Guard (Workflow-Level Resolution)

| Field | Value |
|-------|-------|
| Actor | `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` workflows |
| Preconditions | Workflow executing; about to dispatch developer agent, review agent, or other worker agent |
| Trigger | Workflow invokes `ai-toolkit agents resolve --project <dir> --id <worker-agent-id> --require-verified` |
| Priority | Must |

**Main flow:**
1. Workflow executes CLI command: `ai-toolkit agents resolve --project <dir> --id gaia.agent.developer.backend --require-verified`
2. CLI returns exit code 0 with JSON containing `status: "verified"` and `nativeName: "gaia-developer-backend"`
3. Workflow parses JSON and extracts `nativeName` value only
4. Workflow dispatches agent using returned native name: `subagent_type: gaia-developer-backend`
5. Agent executes; workflow handles result
6. Workflow never derives or guesses the native name independently

**Alternative flows:**
- Multiple agents dispatched → Resolution and verification performed before each dispatch

**Error flows:**
- CLI returns non-zero exit code → Workflow does not dispatch; returns error to skill
- Exit code 0 but `status` is not `"verified"` → Workflow checks exit code, does not dispatch
- Workflow misuses native name (derives own instead of using returned value) → Static tests catch before merge

**Postconditions:**
- Worker agent dispatched using verified native name from registry
- Exit code checked before dispatch; non-zero → no dispatch
- Workflow does not import `lib/agent-registry.js` directly

### UC-06: Workflow Self-Registration in Execution Ledger (Tier 3)

| Field | Value |
|-------|-------|
| Actor | Workflow script (e.g., `pm-phase3.js`) at startup |
| Preconditions | Workflow running; platform provides no hook that precedes workflow execution |
| Trigger | Workflow startup; before main workflow logic executes |
| Priority | Must |

**Main flow:**
1. Workflow opens a ledger entry for itself: `ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX> --agent pm-phase3:self --phase implementation --model sonnet --attempt 1`
2. If exit code is non-zero → ledger open failed; workflow aborts immediately; fail-closed
3. Workflow proceeds with main logic
4. On successful completion, the SAME workflow closes ITS OWN `pm-phaseN:self` entry: `ai-toolkit ledger close --dir <featureDir> --prefix <PREFIX> --agent pm-phase3:self --attempt 1` (status → `done`)

**Important — `:self` and `:dispatch` are two DIFFERENT operations.** Tier 1 (the skill) opens AND closes/fails `pm-phaseN:dispatch`; it never touches `pm-phaseN:self`. The `pm-phaseN:self` entry is owned entirely by the workflow: the workflow that opens it is the workflow that closes it (`done`) or marks it `failed` in its own error path. Tier 1 closing `pm-phaseN:dispatch` does NOT close `pm-phaseN:self`; conflating the two would leave the self entry `running` forever.

**Alternative flows:**
- None; this is a mandatory guard that must succeed or the workflow aborts

**Error flows:**
- `ledger open` returns non-zero → Workflow aborts immediately; error reported
- Workflow hits an internal error after opening `:self` → the workflow marks its own `pm-phaseN:self` entry `failed` (`ai-toolkit ledger fail ... --agent pm-phase3:self ...`) on the way out; this terminal operation is fail-closed
- Workflow is genuinely interrupted (host/process killed) before it can close or fail → `pm-phaseN:self` may legitimately remain `running`, consistent with FTR-016 resume semantics; a later run resolves it

**Postconditions:**
- Ledger contains a `pm-phaseN:self` entry owned by the workflow, terminated by the SAME workflow as `done` (success) or `failed` (handled error), or left `running` only on a genuine interruption
- The `pm-phaseN:self` entry is never closed by Tier 1; Tier 1 owns only `pm-phaseN:dispatch`
- Workflow does not proceed if self-registration fails

### UC-07: List Registered Toolkit Agents

| Field | Value |
|-------|-------|
| Actor | Developer, diagnostic tools |
| Preconditions | Toolkit installed |
| Trigger | Developer runs `ai-toolkit agents list --project <dir> --format json` |
| Priority | Must |

**Main flow:**
1. CLI loads canonical catalog
2. For each registered toolkit agent, reads manifest to check installation status
3. Returns JSON array with agent metadata: canonical ID, native name, role, type, supported platforms, version, installation status
4. Never includes foreign agents or user-owned agents
5. Command exits with code 0

**Alternative flows:**
- Toolkit has no agents registered → Returns empty array

**Error flows:**
- Manifest missing or unreadable → Reports agents as `not-installed` status

**Postconditions:**
- JSON printed to stdout with complete list of toolkit agents
- Only toolkit-owned agents listed; no foreign or plugin agents included

### UC-08: Diagnostic Agent Status Report

| Field | Value |
|-------|-------|
| Actor | Developer, diagnostic tools, `doctor` command |
| Preconditions | Toolkit installed; agent files may be missing, modified, or conflicting |
| Trigger | Developer runs `ai-toolkit doctor agents --project <dir>` |
| Priority | Must |

**Main flow:**
1. CLI enumerates all registered toolkit agents from catalog
2. For each agent:
   - Check if file exists in project scope (`{projectDir}/.claude/agents/`)
   - Check if file exists in global scope (`{homeDir}/.claude/agents/`)
   - Check if manifest declares the file in `files` list
   - Check if `fileHashes` present and on-disk hash matches recorded digest
   - Check for collisions (two files with same effective native name in equal/higher precedence)
   - Determine agent version and compatibility
3. Assign status for each agent from the approved vocabulary: `verified` | `conflict` | `hash-unverifiable` | `unobservable` | `not-installed` | `not-applicable`. The vocabulary does NOT contain `hash-mismatch`: a digest that does not match the on-disk file is reported as `conflict` with a reason/integrity detail of `hash-mismatch` (a legacy manifest that simply lacks hashes remains `hash-unverifiable`)
4. Report each agent with: scope, path, toolkit version, installation mode, integrity status, any conflicts, remediation steps
5. For non-observable scopes (plugin, session) emits `unobservable` WARNING but does not block
6. For foreign files in observable scopes (e.g., old `project-manager.md` with name not matching any toolkit agent) reports as foreign; does not block
7. Command exits with code 0; never modifies any files

**Alternative flows:**
- Digest mismatch detected (manifest has a hash but it does not match the on-disk file) → Status `conflict` with integrity detail `hash-mismatch`; includes remediation
- Legacy manifest lacking `fileHashes` entirely → Status `hash-unverifiable`; includes remediation
- Collision detected → Status `conflict`; reports both conflicting paths
- File absent → Status `not-installed`; suggests reinstall

**Error flows:**
- Manifest corrupt → Status error; readable error message

**Postconditions:**
- Full diagnostic report printed to stdout
- No files created, modified, or deleted
- Remediation guidance provided for each non-verified agent
- Developer can identify root cause of agent availability issues

### UC-09: Cleanup Stale Toolkit Assets (Dry-Run Only)

| Field | Value |
|-------|-------|
| Actor | Developer performing toolkit maintenance |
| Preconditions | Previous toolkit versions may have left stale files; current manifest tracks legitimate files |
| Trigger | Developer runs `ai-toolkit agents cleanup --project <dir>` or `... --dry-run` |
| Priority | Must |

**Definitions (cleanup taxonomy):**
- **Cleanup candidate** = a file that is present in the OLD manifest, is no longer part of the current payload/catalog, AND is still present on disk. Only these are proposed.
- **`missing`** = a manifest entry whose file is ABSENT from disk. This is a diagnostic-only classification, NOT a cleanup candidate (there is nothing on disk to remove).
- **User-owned / foreign** = a file present on disk but absent from the manifest. Never proposed under any circumstances.

**Main flow:**
1. CLI reads the manifest `files` list (the OLD/previous manifest)
2. Determines the current payload/catalog for the installation
3. For each manifest file, classifies it: still in current payload → not a candidate; no longer in current payload AND still present on disk → **cleanup candidate**; declared in manifest but ABSENT from disk → **`missing`** (diagnostic only, never a candidate)
4. Files present on disk but not in the manifest are user-owned/foreign → never proposed
5. If dry-run (default and only supported mode in FTR-017) → lists cleanup candidates; exits with code 0; modifies nothing
6. Any mutating flag (e.g., `--delete`, `--force`, `--remove`) → command rejects flag as unsupported; exits non-zero; lists no candidates

**Alternative flows:**
- Manifest entry present but file absent from disk → reported as `missing`; NOT a cleanup candidate
- File on disk but not in manifest → user-owned/foreign; never proposed; silent skip
- Manifest file present in both project and global installations → reports scope; user must resolve

**Error flows:**
- Mutating flag detected → Error message; exits non-zero; nothing deleted
- Manifest unreadable → Error message; no cleanup performed

**Postconditions:**
- Diagnostic output listing only true cleanup candidates (old-manifest files no longer in the current payload and still on disk)
- `missing` entries and user-owned/foreign files are never proposed for cleanup
- FTR-017 stays fully read-only: no files modified, created, or deleted
- Mutating operations unsupported with a clear message and non-zero exit

### UC-10: Handle Agent Name Collision (Observable Scopes)

| Field | Value |
|-------|-------|
| Actor | Registry guard, preflight system |
| Preconditions | Two toolkit installations or cached agents with same effective native name in observable scopes |
| Trigger | Preflight or dispatch attempt when collision exists |
| Priority | Must |

**Main flow:**
1. Preflight or resolution checks both observable scopes: project (`{projectDir}/.claude/agents/`) and global (`{homeDir}/.claude/agents/`)
2. For requested agent ID, determines effective native name (e.g., `gaia-developer-backend`)
3. Searches both scopes for files matching this native name
4. If two or more files found at equal or higher precedence → HARD STOP
5. Outputs structured error message with:
   - Requested agent ID
   - Expected path
   - All conflicting paths
   - Message "No agent was dispatched"
6. Exits non-zero; pipeline halts

**Alternative flows:**
- Old `project-manager.md` in global scope with name NOT matching any required toolkit agent → Not a collision; reported by `doctor agents` as foreign; does NOT block dispatch

**Error flows:**
- User must manually remove or rename conflicting files

**Postconditions:**
- Collision documented with clear paths for resolution
- Pipeline cannot proceed until conflict resolved
- User can identify which installation is stale and clean up accordingly

### UC-11: Transition Agent Names (Phase A: Legacy Registration)

| Field | Value |
|-------|-------|
| Actor | Installer, catalog-driven distribution system |
| Preconditions | Phase A in progress; source files still carry legacy names (e.g., `developer-backend.md`) |
| Trigger | Toolkit installer runs to install Phase A assets |
| Priority | Must |

**Main flow:**
1. Installer reads canonical catalog from `lib/asset-catalog.js` (catalog-driven approach)
2. For each agent with legacy non-namespaced name (e.g., `developer-backend`):
   - Agent catalogued with legacy name
   - Native name registered as **transitional** (not yet `gaia-*`-only)
   - File copied with legacy name to installation directory
   - SHA-256 hash computed and stored in manifest `fileHashes`
3. Manifest written with: `files: [<legacy-named-files>]` and `fileHashes: { <same-keys>: "sha256:..." }`
4. Invariant verified: `set(files) == set(keys(fileHashes))`
5. Installation complete; Phase A test suite green with legacy names

**Alternative flows:**
- None; Phase A maintains status quo of legacy names

**Error flows:**
- Hash computation fails → Installation fails; error message with remediation

**Postconditions:**
- Manifest contains both `files` and `fileHashes` with matching keys
- Legacy names still distributed and functional
- Preflight and resolution work with both legacy and future `gaia-*` names during Phase A
- Registry mapping supports legacy names as transitional

### UC-12: Transition Agent Names (Phase B: Atomic Rename)

| Field | Value |
|-------|-------|
| Actor | Developer, CI/CD, git repository |
| Preconditions | Phase A complete and green; Phase B begins; one legacy agent due for renaming |
| Trigger | Atomic rename task for a specific agent (e.g., `developer-backend` → `gaia-developer-backend`) |
| Priority | Must |

**Main flow:**
1. Single atomic commit performs ALL of the following:
   - Rename source file: `src/claude/agents/developer-backend.md` → `src/claude/agents/gaia-developer-backend.md`
   - Update frontmatter `name:` field in renamed file to match new name
   - Update all consumers:
     - `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` — workflow dispatches
     - `am-phase1.js`, `am-phase2.js` — assessment workflows
     - `SCOPE_AGENT_MAP` in `am-phase1.js` (if agent appears)
     - `implement-feature/SKILL.md` — any hardcoded references
     - `assess-codebase/SKILL.md` — any hardcoded references
     - `hi-gaia/SKILL.md` — any hardcoded references
     - Other agent files that reference the old name
     - All test files (`*.test.js`, `*.spec.js`)
   - Update registry's native-name mapping entry to remove legacy name distribution
   - Update installer catalog entry so old name no longer in distribution list
   - Run `npm test` to verify nothing breaks
2. If any step fails or test fails → no commit; developer fixes issues and retries
3. On success → single atomic commit with all changes
4. Old Work Breakdowns with legacy `agent_type` values continue to resolve via explicit registry mapping; no WB update required

**Alternative flows:**
- If agent renamed but old name still referenced → `npm test` catches; commit blocked until all consumers updated

**Error flows:**
- Test failure → Commit blocked; developer must fix all broken references and tests before retry
- Registry mapping update incomplete → Static tests or CI catches; commit blocked

**Postconditions:**
- Agent source file carries new `gaia-*` name
- All consumers updated in same commit
- Registry no longer distributes legacy name
- `npm test` passes completely
- Legacy `agent_type` mapping remains active for existing WBs throughout and after Phase B

### UC-13: Handle Hash Mismatch on Installed File

| Field | Value |
|-------|-------|
| Actor | Registry guard, workflow dispatch, preflight |
| Preconditions | Agent file modified after installation; hash on disk no longer matches manifest |
| Trigger | Resolution or preflight verification runs; file integrity check performed |
| Priority | Must |

**Main flow:**
1. Registry loads manifest and reads recorded SHA-256 from `fileHashes` for target agent
2. Computes SHA-256 of agent file on disk
3. Compares: computed ≠ recorded
4. Hash mismatch detected
5. **Diagnostic mode** (`agents resolve` without `--require-verified`): returns `status: "hash-mismatch"` with exit code 0
6. **Operational mode** (`--require-verified`): returns error; exits non-zero; no dispatch
7. **Preflight mode**: HARD STOP with error message; pipeline does not start

**Alternative flows:**
- File has been deliberately edited (expected scenario) → user must understand integrity guarantee changed; dispatch blocked until file restored or reinstalled

**Error flows:**
- File unreadable → Error message with remediation

**Postconditions:**
- Agent not dispatched
- User cannot proceed until file integrity restored (restore from backup or reinstall toolkit)
- Explicit warning that manual edits broke verification contract

### UC-14: Manage Ledger Metadata Through Dispatch Lifecycle

| Field | Value |
|-------|-------|
| Actor | Tier 1 guard (`/implement-feature` skill) opening dispatch entry; workflow or skill closing/failing entry |
| Preconditions | Dispatch guard about to open ledger entry with identity metadata |
| Trigger | `ai-toolkit ledger open` invoked with whitelisted metadata flags (`--agent-id`, `--native-name`, `--toolkit-version`, `--scope`, `--hash`) |
| Priority | Must |

**Main flow - First open:**
1. Skill invokes: `ai-toolkit ledger open ... --agent-id gaia.orchestrator.feature.phase3 --native-name pm-phase3 --toolkit-version 0.13.0 --scope project --hash sha256:<hex>`
2. Ledger validates: each key in whitelist; none are reserved fields
3. Ledger creates entry with standard fields (`operation_id`, `agent`, `phase`, `model`, `status`, `started_at`, etc.) **plus** metadata fields
4. Metadata fields stored exactly as provided
5. Entry marked with `status: running` (FTR-016 `open()` sets `running`; `close()` → `done`, `fail()` → `failed`)
6. Command exits with code 0

**Main flow - Idempotent re-open, same metadata:**
1. If same entry is opened again with **identical** metadata values → no-op
2. All fields preserved (standard + metadata)
3. Command exits with code 0

**Main flow - Close or Fail:**
1. Skill invokes: `ai-toolkit ledger close ...` or `ai-toolkit ledger fail ... --error "..."`
2. Ledger updates: `status`, `completed_at`, and optionally `error` or `phase_delta_tokens`
3. All other fields — including metadata — preserved verbatim
4. Metadata never modified by close/fail
5. Command exits with code 0

**Alternative flows - Idempotent re-open, different metadata:**
1. Same entry opened again with **different** metadata values for a previously-stored key → HARD STOP
2. Error message identifies conflicting key and both values
3. No write performed
4. Command exits non-zero

**Error flows:**
- Unknown metadata key → Rejected before any write; non-zero exit; error message lists valid keys
- Attempt to write to reserved field → Rejected before any write; non-zero exit
- Ledger I/O error → Error message; non-zero exit

**Postconditions:**
- Dispatch entry contains standard FTR-016 fields plus whitelisted metadata
- Metadata immutable for life of entry (idempotent re-open with same values is OK; different values is HARD STOP)
- Old entries without metadata unaffected and continue to work
- No dual-write or parallel ledger; backward compatibility maintained

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | An agent name (native name) must be globally unique at a given precedence level within observable scopes | All resolution and collision-detection logic |
| BR-02 | The `nativeName` returned from resolution must be the ONLY value used for dispatch; never derive the native name independently | UC-02, UC-05, all workflows |
| BR-03 | The `--require-verified` flag makes resolution operational and fail-closed; without it, resolution is diagnostic and may return `hash-unverifiable` | UC-01, UC-02, CLI contract |
| BR-04 | File hash mismatch constitutes a provenance failure; the agent must not be dispatched regardless of mode | UC-13, all resolution paths |
| BR-05 | A v0.12.0 manifest (lacking `fileHashes`) is hash-unverifiable and must trigger HARD STOP on operational (`--require-verified`) paths | UC-02, UC-03, preflight, all dispatch |
| BR-06 | Ledger metadata is write-once; idempotent re-open with identical values is safe; re-open with different values is HARD STOP | UC-14, metadata safety invariants |
| BR-07 | Preflight must complete successfully (all agents verified) before any workflow dispatch; failure halts the pipeline | UC-03, UC-04 |
| BR-08 | Three tiers of guards (preflight, Tier 1 skill-level, Tier 2 workflow-level, Tier 3 self-registration) together form defense-in-depth; each tier must verify before proceeding | UC-03, UC-04, UC-05, UC-06 |
| BR-09 | Collision detection must compare effective native names across all observable scopes at equal or higher precedence; collision → HARD STOP | UC-10, preflight |
| BR-10 | The `files` field in manifest remains unchanged; `fileHashes` is a parallel, new field; `set(files) == set(keys(fileHashes))` is a strict invariant | Data Model, manifest writing |
| BR-11 | Legacy `agent_type` mapping is explicit, versioned, and testable; no fuzzy matching; unknown types are rejected with error | UC-12, legacy resolution |
| BR-12 | `developer-database` is a deprecated legacy type; must map to `gaia.agent.developer.backend` via explicit registry mapping with deprecation warning; never create a `developer-database.md` agent file | AC-24, legacy handling |
| BR-13 | Phase A must complete and pass all tests before Phase B (atomic renaming) begins | UC-11, UC-12, phase ordering |
| BR-14 | Each Phase B atomic rename task must update: source file and frontmatter, all consumers, registry mapping, installer catalog, run `npm test` — all in one commit | UC-12, phase B contract |
| BR-15 | `agents cleanup` is read-only in FTR-017; any mutating flag is rejected as unsupported; no file deletion | UC-09 |
| BR-16 | Non-observable scopes (plugin, session) generate `unobservable` WARNING but do NOT block operational dispatch; hard stop only on concrete collision evidence | UC-08, UC-10, documented residual limit |
| BR-17 | Workflows must not import `lib/agent-registry.js` directly; all resolution must go through the CLI facade with `--require-verified` | Static tests, UC-05 |
| BR-18 | `doctor agents` is read-only diagnostic; modifies no files; every agent reported with exactly one status from enumerated set | UC-08 |
| BR-19 | Toolkit-managed dispatch paths (skill, workflows) guarantee verified agents; toolkit-external invocations are a documented residual limit not technically prevented | Scope boundary, documented residual |

## 4. Data Requirements

### 4.1 Entities

#### Manifest (Extended from FTR-015)
| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `version` | string | Semantic version (e.g., `"0.13.0"`) | Current toolkit version |
| `installedAt` | ISO 8601 timestamp | Always present | Installation time |
| `installationMode` | enum: `"local"` \| `"global"` | Required | Unchanged from FTR-015; `"local"` = project-level install; `"global"` = user global install |
| `files` | `string[]` | Non-empty array | Unchanged from FTR-015; paths relative to project root or home; must match keys in `fileHashes` |
| `fileHashes` | object: `{ [path: string]: "sha256:<hex>" }` | New field for v0.13.0+ | **New in FTR-017**; every production install must pass this; omitting allowed only in test fixtures simulating legacy; invariant: `set(files) == set(keys(fileHashes))` |

**Example (v0.13.0+):**
```json
{
  "version": "0.13.0",
  "installedAt": "2026-09-04T10:30:00Z",
  "installationMode": "local",
  "files": [
    ".claude/agents/gaia-developer-backend.md",
    ".claude/agents/gaia-developer-frontend.md",
    ".claude/workflows/pm-phase3.js"
  ],
  "fileHashes": {
    ".claude/agents/gaia-developer-backend.md": "sha256:abc123def456...",
    ".claude/agents/gaia-developer-frontend.md": "sha256:fed789cba012...",
    ".claude/workflows/pm-phase3.js": "sha256:xyz789uvw012..."
  }
}
```

#### Agent Catalog (Registry Data)
| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `agentId` | string | Canonical namespaced ID (e.g., `gaia.agent.developer.backend`) | Unique across all toolkit agents; used in all contracts |
| `platform` | string | e.g., `"claude"` | Which platform(s) support this agent |
| `nativeName` | string | e.g., `gaia-developer-backend` (Phase B), `developer-backend` (Phase A transitional) | Platform-specific asset name; what gets passed to platform in `subagent_type` |
| `relativeInstallPath` | string | e.g., `.claude/agents/gaia-developer-backend.md` | Where file is installed relative to project root |
| `role` | enum | e.g., `"developer"`, `"reviewer"`, `"planner"` | Semantic role of the agent |
| `type` | enum | e.g., `"backend"`, `"frontend"`, `"testing"` | Subcategory within role |
| `authorisedPhases` | `string[]` | e.g., `["implementation", "review"]` | Which pipeline phases can dispatch this agent |
| `minimumToolkitVersion` | string | Semantic version (e.g., `"0.13.0"`) | Oldest toolkit version that can use this agent |
| `deprecated` | boolean | Optional; defaults to `false` | Whether this agent type is deprecated (legacy mapping) |
| `deprecationTarget` | string | Optional; canonical ID of replacement | Where deprecated types map to (e.g., `developer-database` → `gaia.agent.developer.backend`) |

#### Resolution Record (Returned from Registry)
| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| `agentId` | string | Canonical namespaced ID | From catalog |
| `platform` | string | e.g., `"claude"` | Requested platform |
| `nativeName` | string | Platform name | What workflows use for dispatch |
| `scope` | enum: `"project"` \| `"global"` | Observable scope where found | Semantic parallel to `manifest.installationMode`; `"project"` = project-local, `"global"` = user global |
| `path` | string | Absolute filesystem path | Where agent file was found |
| `toolkitVersion` | string | From manifest | Version of toolkit that installed this agent |
| `manifestPath` | string | Absolute path to manifest file | Where the manifest was loaded |
| `sha256` | string | `"sha256:<hex>"` | SHA-256 hash from `fileHashes` or computed |
| `status` | enum: `"verified"` \| `"hash-unverifiable"` \| `"hash-mismatch"` \| `"not-found"` \| `"not-installed"` \| `"manifest-missing"` \| `"conflict"` | Verification outcome | See resolution flow |

#### Execution Ledger Entry (Extended from FTR-016)
| Field | Type | Constraints | Notes |
|-------|------|-----------|-------|
| *[FTR-016 standard fields]* | | | `operation_id`, `agent`, `phase`, `model`, `status`, `started_at`, `completed_at`, `phase_delta_tokens`, `error` |
| `agentId` | string | Canonical namespaced ID | **Whitelisted metadata**; agent ID resolved for this dispatch |
| `nativeAgentName` | string | Platform name | **Whitelisted metadata**; native name used for dispatch |
| `platform` | string | e.g., `"claude"` | **Whitelisted metadata**; platform selected |
| `toolkitVersion` | string | From manifest | **Whitelisted metadata**; toolkit version at dispatch |
| `resolutionScope` | enum: `"project"` \| `"global"` | Observable scope | **Whitelisted metadata**; where agent was resolved |
| `definitionHash` | string | `"sha256:<hex>"` | **Whitelisted metadata**; file hash at time of dispatch |

**Whitelisted metadata keys** (only these accepted; any other key rejected before any write):
- `agentId`
- `nativeAgentName`
- `platform`
- `toolkitVersion`
- `resolutionScope`
- `definitionHash`

**Reserved fields** (never overwritten by metadata; any attempt rejected):
- `operation_id`, `agent`, `phase`, `model`, `status`, `started_at`, `completed_at`, `phase_delta_tokens`

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `manifest.version` | Must be valid semantic version; v0.13.0+ must include `fileHashes` |
| `manifest.installedAt` | Must be valid ISO 8601 timestamp; must not be in future |
| `manifest.installationMode` | Must be exactly `"local"` or `"global"`; never `"project"` (that's `resolutionScope`) |
| `manifest.files` | Must be non-empty array; must match keys in `fileHashes` |
| `manifest.fileHashes` | Each key must exist in `files`; each value must be `sha256:<hex>` format; invariant `set(files) == set(keys(fileHashes))` |
| Agent catalog ID | Must start with `gaia.` (after Phase B complete); must be globally unique |
| Native name | In Phase A may be legacy (e.g., `developer-backend`); in Phase B all are `gaia-*` |
| Ledger metadata key | Must be in whitelisted set; unknown keys rejected before write |
| Ledger metadata value | Must not be written to reserved fields; idempotent re-open with same values allowed; different values → HARD STOP |
| Work Breakdown `agent_type` | Must map to exactly one canonical ID; unknown types rejected; legacy types accepted with warning |
| File hash (SHA-256) | Must be valid hex string; computed and recorded at installation; on-disk file must match recorded hash |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Security | Agent dispatch must verify file integrity via SHA-256 before execution; modified files prevent dispatch |
| NFR-02 | Security | Manifest integrity must be checked; corrupt manifest → operational HARD STOP |
| NFR-03 | Security | Collision detection prevents silent agent shadowing by foreign or legacy installations |
| NFR-04 | Reliability | Preflight verification must complete before any workflow dispatch; failure halts pipeline fail-closed |
| NFR-05 | Reliability | Three tiers of guards (preflight, Tier 1 skill-level, Tier 2 workflow-level, Tier 3 self-registration) provide defense-in-depth |
| NFR-06 | Reliability | Ledger operations must be atomic; if close/fail fails, pipeline HARD STOPS; errors not swallowed |
| NFR-07 | Reliability | Resolution with `--require-verified` must block on any unverified status; no fallback or heuristic selection |
| NFR-08 | Reliability | All agent dispatch paths (skill, workflows) must use verified resolution before dispatch |
| NFR-09 | Usability | Error messages must include remediation guidance (e.g., "reinstall the toolkit to generate hashes") |
| NFR-10 | Usability | Collision messages must report both conflicting paths so user can identify and resolve |
| NFR-11 | Usability | Deprecated agent types must emit deprecation warnings with target mapping |
| NFR-12 | Usability | `doctor agents` provides complete diagnostic without modifying files; multiple status values help user identify root cause |
| NFR-13 | Performance | Registry resolution must complete in <500ms for typical projects (single agent lookup) |
| NFR-14 | Performance | Preflight must verify all required agents efficiently; no redundant file I/O |
| NFR-15 | Backwards Compatibility | Manifest `files` field unchanged; existing code reading `files` continues to work |
| NFR-16 | Backwards Compatibility | Old Work Breakdowns with legacy `agent_type` values continue to resolve correctly via registry mapping |
| NFR-17 | Backwards Compatibility | Old ledger entries without metadata survive all updates without data loss |
| NFR-18 | Backwards Compatibility | `writeManifest()` without `fileHashes` parameter receives unchanged behavior (test fixtures only) |
| NFR-19 | Testability | All agent-type mappings documented and tested; no fuzzy matching |
| NFR-20 | Testability | Static tests enforce no direct registry imports in workflow files |
| NFR-21 | Testability | Static tests enforce `--require-verified` on all CLI resolution calls in workflow files |
| NFR-22 | Testability | Test suite uses temporary home directory for all global-scope scenarios; never touches real user home |
| NFR-23 | Platform Independence | Registry core (`lib/agent-registry.js`) is pure JavaScript; no Claude API or Claude-Code-specific imports |
| NFR-24 | Documentation | Vocabulary distinction documented: `manifest.installationMode` (`"local"` | `"global"`) vs registry `resolutionScope` (`"project"` | `"global"`) |
| NFR-25 | Documentation | Non-observable scope limitation documented; `gaia-*` namespacing documented as mandatory mitigation |
| NFR-26 | Documentation | Complete agent-type inventory maintained and updated as agents are renamed |

## 6. UI Requirements

### 6.1 CLI Commands

#### `ai-toolkit agents list --project <dir> --format json`
| Aspect | Specification |
|--------|---------------|
| Purpose | Enumerate registered toolkit agents with installation status |
| Arguments | `--project <dir>`: project directory path; `--format json`: output as JSON |
| Output | JSON array of toolkit agents with fields: `agentId`, `nativeName`, `role`, `type`, `installed`, `scope` |
| Exit Code | 0 on success; non-zero on error |
| Behavior | Never includes foreign agents; read-only |

#### `ai-toolkit agents resolve --project <dir> --id <canonical-id> [--require-verified]`
| Aspect | Specification |
|--------|---------------|
| Purpose | Resolve agent identity; optionally verify integrity |
| Arguments | `--project <dir>`: project directory; `--id <canonical-id>`: canonical agent ID; `--require-verified`: operational mode (fail-closed) |
| Output (diagnostic) | JSON with resolution record and `status` field for resolvable known agents; exits 0 for `verified`, `hash-unverifiable`, and (diagnostic-only) `hash-mismatch` |
| Output (operational) | JSON with resolution record and `status: "verified"`; exits 0 if verified, non-zero with error on stderr if not |
| Exit Code | Diagnostic: 0 for a resolvable known agent (`verified`/`hash-unverifiable`/`hash-mismatch`), but non-zero for unknown ID, collision/ambiguity, corrupt manifest, or unresolvable installation; Operational: 0 only if `status: "verified"`, non-zero otherwise |
| Behavior (diagnostic) | May return `hash-unverifiable` or `hash-mismatch` (exit 0); unknown ID / collision / corrupt manifest / unresolvable installation still exit non-zero |
| Behavior (operational) | HARD STOP on any non-verified status; mandatory for all workflow dispatch |

#### `ai-toolkit agents preflight --project <dir> --pipeline <pipeline-name>`
| Aspect | Specification |
|--------|---------------|
| Purpose | Verify all agents required by a pipeline before dispatch |
| Arguments | `--project <dir>`: project directory; `--pipeline <pipeline-name>`: e.g., `implement-feature` |
| Output | Success: exit 0; Failure: error message to stderr with remediation |
| Exit Code | 0 if all agents verified; non-zero if any fail or manifest missing/corrupt |
| Behavior | Internally uses `--require-verified` semantics; HARD STOP on first failure or hash-unverifiable manifest |

#### `ai-toolkit doctor agents --project <dir>`
| Aspect | Specification |
|--------|---------------|
| Purpose | Comprehensive diagnostic of agent installation state and integrity |
| Arguments | `--project <dir>`: project directory |
| Output | Human-readable report with each agent's status, scope, path, version, hash status, conflicts, foreign agents, remediation guidance |
| Exit Code | Always 0 (diagnostic, never blocks) |
| Behavior | Enumerates all toolkit agents; reports status for each; identifies collisions; reports foreign files in observable scopes; detects `unobservable` plugins/sessions; modifies no files |

#### `ai-toolkit agents cleanup --project <dir> [--dry-run]`
| Aspect | Specification |
|--------|---------------|
| Purpose | List cleanup candidates (dry-run only in FTR-017) |
| Arguments | `--project <dir>`: project directory; `--dry-run`: explicit flag (default behavior) |
| Output | List of cleanup candidates only — files present in the old manifest, no longer part of the current payload, and still present on disk; a manifest entry whose file is absent from disk is reported as `missing` (not a candidate); exits 0 on a successful dry-run |
| Exit Code | 0 on a successful dry-run; non-zero if a mutating flag is used or on I/O error |
| Behavior | FTR-017: read-only only; any `--delete`, `--force`, `--remove` flag rejected as unsupported; files absent from the manifest are never proposed (user-owned/foreign); `missing` entries are never proposed; no files deleted |

### 6.2 Integration Points (Not User-Facing CLI)

#### Skill: `/implement-feature`
| Point | Specification |
|--------|---------------|
| Preflight | Opens/closes ledger entry `agent-preflight:implement-feature`; runs `agents preflight`; fail-closed if preflight fails |
| Per-dispatch guard (Tier 1) | Before each workflow dispatch: `agents resolve --require-verified` for workflow ID; opens ledger with metadata; dispatches only if verified; closes/fails ledger after workflow returns |

#### Workflow: `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`
| Point | Specification |
|--------|---------------|
| Tier 2 guard | Before dispatching developer/review/other worker agent: `agents resolve --require-verified` for agent ID; checks exit code; uses returned `nativeName` only |
| Tier 3 self-registration | At startup: `ledger open` for self; aborts if fails |
| No direct imports | Static tests forbid `require('../lib/agent-registry.js')` |

## 7. Acceptance Criteria

> **Table format note (deterministic validator):** This table uses the exact column
> contract required by `src/claude/scripts/wb-validate.js` — `ID | Criterion | Related UC | Priority`.
> The `Related UC` field contains only one or more `UC-NN` tokens (comma-separated) or the
> literal `All UCs`; it never carries BR/NFR references or ranges. Literal pipe characters
> inside a cell are escaped as `\|`.

| ID | Criterion | Related UC | Priority |
|----|-----------|-----------|----------|
| AC-01 | Given the feature ships, when the canonical catalog is inspected, every toolkit agent has a unique, namespaced canonical ID (e.g. `gaia.agent.developer.backend`). | UC-01 | Must |
| AC-02 | Given any orchestrator or Work Breakdown file that references an agent, when it is inspected, it uses a canonical ID or a declared legacy mapping and no bare platform name is used as a contract. | UC-05, UC-12 | Must |
| AC-03 | Given `lib/agent-registry.js` exists, when static analysis is performed, resolution logic is implemented entirely in JavaScript with no LLM involved in selecting a candidate. | UC-01 | Must |
| AC-04 | Given `resolveAgent()` is called with `--require-verified` for a valid agent with a v0.13.0+ manifest and matching hash, when the call runs, exit code is 0 and the returned record has `status: "verified"` with all required identity fields. | UC-02 | Must |
| AC-05 | Given `resolveAgent()` is called for an ambiguous or missing agent, when the call runs, it returns a non-zero exit code with a structured error and no fuzzy match or fallback (non-zero even in diagnostic mode). | UC-02, UC-10 | Must |
| AC-06 | Given a developer uses the toolkit, when they start the feature delivery pipeline through the toolkit, `/implement-feature` is the toolkit-supported entry point and SKILL.md enforces the registry guard and ledger contract before each workflow dispatch. | UC-04 | Must |
| AC-07 | Given Gate 2 is approved, when the skill proceeds to implementation, only the `pm-phase3` workflow that returns `status: "verified"` from `agents resolve --require-verified` is dispatched and its `nativeName` is used for the dispatch native name. | UC-04 | Must |
| AC-08 | Given `pm-phase3` is absent from the installed runtime, when the skill attempts to proceed after Gate 2, there is a hard stop with remediation described and no alternative dispatch. | UC-04 | Must |
| AC-09 | Given old global agents (e.g. `project-manager.md`) are present, when preflight and `doctor agents` run, only agents whose effective native name matches a required toolkit agent name at equal or higher precedence in an observable scope trigger a HARD STOP; a foreign file with a different name does NOT block and is reported by `doctor agents` as foreign. | UC-08, UC-10 | Must |
| AC-10 | Given two observable installations provide agents with the same effective native name, when preflight runs, the collision is reported with both paths and the pipeline does not start until resolved. | UC-10 | Must |
| AC-11 | Given an installed agent file is inspected after a v0.13.0+ install, when preflight has succeeded, the manifest carries `fileHashes` with a SHA-256 for each installed file, `set(files) == set(keys(fileHashes))`, and the recorded hash matches the file on disk. | UC-11 | Must |
| AC-12 | Given an installed agent file is modified after installation (hash mismatch), when `resolveAgent` or preflight runs, the file is reported as unverified, `--require-verified` exits non-zero, and dispatch is blocked. | UC-13 | Must |
| AC-13 | Given `ai-toolkit doctor agents --project <dir>` is invoked, when the command runs, output includes registered toolkit agents, scope and provenance path, version and integrity, collisions, foreign observable agents, legacy references, and remediation, and each agent is reported with exactly one status from `verified` / `conflict` / `hash-unverifiable` / `unobservable` / `not-installed` / `not-applicable` (a digest mismatch is reported as `conflict` with an integrity detail of `hash-mismatch`). | UC-08 | Must |
| AC-14 | Given `doctor agents` runs under any conditions, when it completes, no file is modified, created, or deleted. | UC-08 | Must |
| AC-15 | Given `ai-toolkit agents cleanup --project <dir>` is invoked, when the command runs, dry-run output lists cleanup candidates only (files present in the old manifest, no longer part of the current payload, and still present on disk); no file is modified or deleted; any mutating flag is rejected as unsupported with a non-zero exit. | UC-09 | Must |
| AC-16 | Given `agents cleanup` computes its candidate list in any mode, when a file is classified, a manifest entry whose file is absent from disk is reported as `missing` (never a cleanup candidate), a file present on disk but absent from the manifest is treated as user-owned and never proposed, and only old-manifest files no longer in the current payload and still on disk are listed. | UC-09 | Must |
| AC-17 | Given the runtime assets are installed and inspected, when static analysis of all installed toolkit files runs, no file references `/agent-project-manager`, `hi-gaia/SKILL.md` does not list `project-manager` or `assessment-manager` as spawnable, `implement-feature/SKILL.md` does not use the label `project-manager/pm-phase3`, and all entry-point references use canonical names. | UC-12 | Must |
| AC-18 | Given a future change introduces `/agent-project-manager`, `subagent_type: project-manager`, `agentType: project-manager`, or `assessment-manager` as a legacy orchestrator reference, when CI runs the existing `npm test` suite, a versioned Jest test under `tests/regression` or `tests/cli` fails and blocks the merge. | UC-12 | Must |
| AC-19 | Given preflight runs before pm-phase1, when `/implement-feature` executes, a ledger entry `agent: "agent-preflight:implement-feature"` is opened (`running`) before the check, closed to `done` on pass, marked `failed` on failure (including hash-unverifiable), and if `ledger open` returns non-zero preflight does not run. | UC-03 | Must |
| AC-20 | Given a workflow is about to be dispatched, when the Tier 1 guard runs, a ledger entry for the `pm-phaseN:dispatch` operation is opened with whitelisted identity metadata before the dispatch call, and if `ledger open` returns non-zero the dispatch does not proceed. | UC-04, UC-14 | Must |
| AC-21 | Given a ledger entry is opened by the Tier 1 guard with identity metadata, when the entry is inspected on disk, it contains standard FTR-016 fields plus whitelisted metadata keys, reserved fields are unchanged, and old entries survive any update without data loss. | UC-14 | Must |
| AC-22 | Given `ledger close` or `ledger fail` for a `pm-phaseN:dispatch` entry fails after the workflow has returned, when the failure is detected, the pipeline hard-stops and the error is not swallowed. | UC-04, UC-14 | Must |
| AC-23 | Given a complete agent-type inventory is produced, when Phase A is complete, every agent type the toolkit declares or accepts is documented with its canonical ID mapping, covering at minimum `developer-backend`, `developer-frontend`, `developer-testing`, `developer-database`, `review-solution`. | UC-11 | Must |
| AC-24 | Given `developer-database` is processed in any pipeline run, when the registry resolves it, it maps via explicit registry mapping to `gaia.agent.developer.backend` with a deprecation warning, `generate-work-breakdown.md` no longer lists `developer-database` as a valid new value, no `developer-database.md` agent file is created, and the value is never passed to the platform unresolved. | UC-12 | Must |
| AC-25 | Given a Work Breakdown contains an unknown `agent_type`, when the registry processes it, each unknown value is rejected with a structured error and the pipeline does not start. | UC-05, UC-12 | Must |
| AC-26 | Given a Work Breakdown contains legacy `agent_type` values, when the registry processes them, each resolves to exactly one canonical ID via explicit mapping with deprecation warnings emitted, never passed directly to the platform. | UC-12 | Must |
| AC-27 | Given Phase B is complete and the global installer runs, when `~/.claude/agents/` is inspected, it contains only registered, namespaced (`gaia-*`) agent files with no legacy-named file present and no legacy distribution mapping remaining. | UC-12 | Must |
| AC-28 | Given the test suite runs, when any test executes, no test reads from or writes to the real user home directory and a temporary home is used for all scope and collision tests. | UC-08, UC-10 | Must |
| AC-29 | Given a temporary home contains `project-manager.md` from an old tool, when the E2E suite runs, `doctor agents` reports it as foreign, the registry does not associate it with any toolkit ID, after Phase B no name collision exists with `gaia-*` agents, and the pipeline does not stop for this file. | UC-08, UC-10 | Must |
| AC-30 | Given `lib/agent-registry.js` and the provenance guard are inspected for imports, when static analysis runs, they do not import Claude API or Claude-Code-specific modules and the core is platform-agnostic. | UC-01 | Must |
| AC-31 | Given a workflow invokes `agents resolve --require-verified` for an agent with a v0.13.0+ manifest and matching hash, when the command runs, exit code is 0, `status: "verified"`, and the workflow uses only the returned `nativeName` for dispatch. | UC-05 | Must |
| AC-32 | Given Codex and Copilot adapter interfaces are inspected, when contract tests run, documented interface contracts exist and contract tests verify input/output shape without a working runtime. | UC-01 | Must |
| AC-33 | Given a non-observable scope (plugin or session) exists with no concrete inventory available, when preflight or `agents preflight` runs, an `unobservable` WARNING appears in output, dispatch is NOT blocked, and `gaia-*` naming is documented as the mandatory mitigation. | UC-08 | Must |
| AC-34 | Given Phase B begins, when the Phase A test suite is green, each toolkit agent with a legacy non-namespaced name has a scheduled atomic rename task. | UC-12 | Must |
| AC-35 | Given an atomic Phase B rename task runs, when a single agent is renamed, a single commit updates the source file name and frontmatter `name:`, all consumers (`am-phase1.js`, `am-phase2.js`, `SCOPE_AGENT_MAP`, `implement-feature/SKILL.md`, `assess-codebase/SKILL.md`, `hi-gaia/SKILL.md`, other agent files, test files), the registry native-name mapping, and the installer catalog entry, and `npm test` passes. | UC-12 | Must |
| AC-36 | Given Phase B is complete, when `ls src/claude/agents/` runs, no toolkit agent file carries a legacy non-namespaced name and the feature is not marked complete until this is met. | UC-12 | Must |
| AC-37 | Given Phase B is complete, when existing WBs with legacy `agent_type` values are processed, they continue to resolve correctly via explicit registry mapping with no WB update required. | UC-12 | Must |
| AC-38 | Given the installer runs for a v0.13.0+ install, when the manifest is written, it contains `files: string[]` (unchanged structure) and `fileHashes` mapping each path to `sha256:<hex>`, `set(files) == set(keys(fileHashes))`, each path's hash matches the installed file, and every production install path passes `fileHashes` with no accidental hash-free manifests. | UC-11 | Must |
| AC-39 | Given a v0.12.0 manifest (no `fileHashes`) is present, when `agents resolve --require-verified`, `agents preflight`, or any workflow dispatch runs, there is a HARD STOP with no agent dispatched and an error instructing the user to reinstall, while `agents resolve` without `--require-verified` and `doctor agents` may still run and report `hash-unverifiable` without blocking. | UC-02, UC-03 | Must |
| AC-40 | Given an upgrade test from v0.12.0 (no `fileHashes`) to v0.13.0, when the upgrade install completes, `files` contains the current payload after normal orphan cleanup, `fileHashes` contains exactly one key per `files` entry, `set(files) == set(keys(fileHashes))`, no stale entries remain, and `doctor agents` transitions from `hash-unverifiable` to `verified`. | UC-11 | Must |
| AC-41 | Given `ledger open` is invoked with whitelisted metadata flags, when a CLI test exercises all safety invariants, (a) first open stores metadata with reserved fields unchanged, (b) idempotent re-open with same metadata is a no-op, (c) idempotent re-open with different metadata exits non-zero with no write, (d) an unknown metadata key is rejected before any write with a non-zero exit, and (e) `close`/`fail` preserve metadata and update only status/timestamps/error. | UC-14 | Must |
| AC-42 | Given workflow `.js` files are inspected, when versioned static Jest tests run under `npm test`, (a) no file contains `require('../lib/agent-registry')` or any direct import of the registry module and (b) every `agents resolve` invocation in workflow files includes `--require-verified`. | UC-05 | Must |

## 8. Dependencies & Assumptions

### External Dependencies
- **FTR-015 (available):** `lib/asset-catalog.js`, `resolveClaudeRuntimeAsset()`, manifest written by `writeManifest()`, `doctor resolution` command present. Manifest `installationMode` field uses `"local"` | `"global"` (confirmed in `bin/cli.js`). The manifest file is `.ai-toolkit-manifest.json` under `.claude`. The registry resolves the manifest through the FTR-015 resolver's effective-installation logic: it first determines the SINGLE effective installation (both local and global present → the resolver reports ambiguity and resolution fails non-zero), then reads local `<projectDir>/.claude/.ai-toolkit-manifest.json` when the effective mode is `local`, or global `<homeDir>/.claude/.ai-toolkit-manifest.json` when the effective mode is `global`; the local manifest is never read when the effective mode is global. The real installer functions are `readManifest(destRoot)` and `writeManifest(destRoot, fileList, installationMode)`; FTR-017 extends `writeManifest()` with an optional fourth `fileHashes` parameter, i.e. `writeManifest(destRoot, fileList, installationMode, fileHashes?)`; existing callers omitting it receive unchanged behavior and the `files: string[]` structure is never modified. Test scenarios cover local-only, global-only, and mixed (local+global → ambiguity) installations.
- **FTR-016 (available, commit df54a91):** `lib/execution-ledger.js` and `ai-toolkit ledger open|close|fail|skip` CLI facade stable. FTR-017 extends `open()` with optional seventh `metadata` argument and CLI with optional identity flags; safety invariants enforced before any write; old callers unchanged; old entries survive all updates.

### Technical Assumptions
- Module location: `lib/agent-registry.js` is a capability of `ai-toolkit` npm CLI, not a Claude runtime asset. Workflows access exclusively via `ai-toolkit agents resolve --require-verified`.
- Vocabulary distinction: `manifest.installationMode` (`"local"` | `"global"`) vs registry `resolutionScope` (`"project"` | `"global"`). These are semantically equivalent but use different vocabularies; callers must not conflate.
- No LLM in resolution path: all registry and guard logic is pure JavaScript.
- Non-observable scopes: `unobservable` WARNING; `gaia-*` namespacing is mandatory mitigation; hard stop only on concrete collision evidence.
- Backward compatibility: existing Work Breakdowns with legacy `agent_type` values continue via explicit mapping throughout Phase B and beyond.
- Phase B ordering: atomic rename tasks start only after Phase A is green; each commit covers file, frontmatter, all consumers, installer catalog entry, and tests.
- Production `writeManifest` calls: every production install path passes `fileHashes`; no fresh install may produce hash-free manifest. Omitting parameter permitted only in test fixtures simulating legacy.
- Verification command: `npm test` is the command used to verify after any change.
- Test environment: all scenarios involving global-scope agent files use temporary home directory; never touch real user home.
- Hash function: `computeFileSha256()` (SHA-256) added to `bin/cli.js` and exported via `require.main` guard; existing `fileHash()` (MD5) retained.

## 9. Open Questions

No open questions. All gaps identified during definition and all blocking points raised across three review rounds have been resolved before this version was written.

### Key Decisions Documented
- **Physical agent renaming:** in scope as Phase B (one task per agent; all consumers and installer mapping in same atomic commit; assessment pipeline consumers included; AC-27 is final gate)
- **FTR-016 available:** merged to develop (commit df54a91, PR #68)
- **Ledger contract:** real `open/close/fail` contract; backward-compatible whitelisted metadata extension with explicit safety invariants
- **Manifest design:** `files: string[]` unchanged; `fileHashes` parallel field; `set(files)==set(keys(fileHashes))` invariant; every production install path passes hashes; v0.12.0 → HARD STOP on `--require-verified`
- **`agents resolve` modes:** diagnostic (no flag, may return `hash-unverifiable`, exit 0) vs operational (`--require-verified`, hard-stop on non-verified); workflows always use operational
- **Installation/resolution terminology:** `installationMode`: existing enum `"local"` | `"global"` (unchanged); `resolutionScope` in registry uses `"project"` | `"global"` — explicitly documented as distinct vocabulary
- **`agents cleanup`:** dry-run-only in FTR-017; mutating flags rejected; non-manifest files not proposed; actual removal deferred
- **Installer transition:** Phase A registers legacy names as transitional; each Phase B rename removes one legacy mapping; Phase B completion = `gaia-*` only
- **Enforcement boundary:** toolkit-managed paths only; toolkit-external invocations are documented residual limit
- **Non-observable scopes:** `unobservable` WARNING only; hard stop only on concrete evidence
- **Static tests:** enforce `--require-verified` in workflow files and ban direct registry imports
- **Legacy reference inventory:** covers all five affected files
- **`developer-database`:** explicit mapping → `gaia.agent.developer.backend` with deprecation warning; removed from generator's new-value list; no new agent created
- **Old foreign `project-manager.md`:** flagged by `doctor agents`; blocks only if its native name collides with required toolkit agent in observable scope

---

**Document prepared for:** Stakeholder review and development handoff  
**Next steps:** Gate 1 approval for Phase A requirements; design review for ledger extension; Phase B task sequencing
