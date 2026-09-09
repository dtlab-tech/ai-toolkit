# Technical Specification — Deterministic Agent Resolution and Orchestrator Guard

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-017: Deterministic Agent Resolution and Orchestrator Guard |
| Version | 1.0 |
| Date | 2026-09-04 |
| Status | Draft |

## 1. Overview

FTR-017 introduces a deterministic, JavaScript-only agent resolution layer that replaces implicit platform-based agent discovery with explicit provenance verification. When a feature is implemented via `/implement-feature`, all workflow and worker agent dispatches are guarded by three tiers of registry checks:

1. **Tier 1** — `/implement-feature` skill (before workflow dispatch) validates agent identity and records it in the Execution Ledger
2. **Tier 2** — Each workflow (`pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`) invokes the CLI facade `agents resolve --require-verified` before dispatching worker agents
3. **Tier 3** — Each workflow self-registers at startup via `ledger open` with fail-closed semantics

The foundation is a canonical catalog (`lib/agent-registry.js`) that:
- Defines a unique namespaced ID for every toolkit agent
- Maintains an explicit mapping from legacy agent type values to canonical IDs
- Verifies manifest integrity by comparing SHA-256 digests with on-disk files
- Resolves agent scope (`project` or `global` filesystem) with deterministic precedence
- Rejects manifests from v0.12.0 (lacking `fileHashes`) when `--require-verified` is used
- Issues warnings for non-observable scopes (plugins, session agents) where enumeration is impossible

The feature is implemented in two phases:
- **Phase A:** Registry, guard, CLI, ledger integration, manifest hashes, legacy reference removal, comprehensive tests
- **Phase B:** Atomic per-agent renaming to `gaia-*` namespace (one task per agent, all consumers updated in a single commit)

## 2. Architecture

### 2.1 System Context

The agent resolution system sits at the orchestration boundary between high-level skills (`implement-feature`, `assess-codebase`) and the Claude Code platform's agent dispatch mechanism. It provides:

- **Registry Module** (`lib/agent-registry.js`) — Pure JavaScript, no Claude API dependencies; deterministic resolution logic
- **CLI Facade** (`bin/cli.js`) — Entry point for all resolution queries from workflows; uses the registry module
- **Manifest Evolution** — Extended `writeManifest()` to include SHA-256 digests of all installed files
- **Ledger Integration** — Extended Execution Ledger with whitelisted metadata fields for recording agent identity at dispatch time
- **Static Enforcement** — CI tests verify no workflow imports the registry directly and all `agents resolve` calls include `--require-verified`

All toolkit-managed dispatch paths (skill → workflow → worker agent) use the guard. Residual limit: User-triggered invocations outside the toolkit (e.g., directly typing `subagent_type: project-manager`) bypass the guard.

### 2.2 Component Diagram

```
┌─ Skill Layer (implement-feature/SKILL.md) ──┐
│                                             │
│  1. ledger open (preflight)                 │
│  2. agents preflight (uses verified semantics internally) │
│  3. [Gate 1 approval]                       │
│  4. ledger open (Tier 1: pm-phase1 dispatch)│
│  5. → pm-phase1 workflow                    │
│  6. ledger close/fail                       │
│  ... repeat for pm-phase2, pm-phase3 ...   │
│                                             │
└─────────────────────────────────────────────┘
         │
         └─→ [Execution Ledger]
              (FTR-016)
         │
         └─→ ┌─ Workflow Layer (pm-phase3.js) ───┐
              │                                   │
              │  1. phase('Implementation')       │
              │  2. agents resolve --require-verified
              │  3. check exit code → dispatch    │
              │  4. nativeName from result        │
              │  5. → developer-backend agent    │
              │                                   │
              └─────────────────────────────────┘
                     │
                     └─→ [Registry Module]
                          (lib/agent-registry.js)
                     │
                     └─→ [Manifest]
                          (.ai-toolkit-manifest.json)
                          {
                            files: [...],
                            fileHashes: { ... }
                          }
```

### 2.3 Sequence Diagrams

#### Happy Path — Implementation Pipeline

```
User                 Skill              CLI           Registry      Workflow
 │                   │                   │              │              │
 │ /implement-feature│                   │              │              │
 ├────────────────>  │                   │              │              │
 │                   │ ledger open       │              │              │
 │                   │ (preflight)       │              │              │
 │                   ├─────────────────> │              │              │
 │                   │                   │              │              │
 │                   │ agents preflight  │              │              │
 │                   ├──────────────────────────────>  │              │
 │                   │                   │   verify all │              │
 │                   │                   │   agents    │              │
 │                   │<──────────────────────────────── │              │
 │                   │   exit 0, status: verified      │              │
 │                   │                   │              │              │
 │                   │ [Gate 1 approval in main loop]   │              │
 │                   │                   │              │              │
 │                   │ ledger open       │              │              │
 │                   │ (Tier 1: OPEN     │              │              │
 │                   │  pm-phase1:dispatch)             │              │
 │                   ├─────────────────> │              │              │
 │                   │  + metadata       │              │              │
 │                   │                   │              │              │
 │                   │ dispatch pm-phase1 with nativeName from resolution result
 │                   ├─────────────────────────────────────────────>  │
 │                   │                   │              │ Tier 3: OPEN  │
 │                   │                   │              │ pm-phase1:self│
 │                   │                   │              │    <──────┐   │
 │                   │                   │              │           │   │
 │                   │                   │ agents resolve --require-verified
 │                   │                   │              │    (dispatch worker)
 │                   │<──────────────────────────────────────────┤   │
 │                   │                   │              │           │   │
 │                   │ check exit code,  │              │           │   │
 │                   │ dispatch developer-backend       │           │   │
 │                   │<──────────────────────────────────────────────┤   │
 │                   │                   │              │           │
 │                   │                   │ (worker implementation...)
 │                   │                   │              │           │
 │                   │                   │ Tier 3: CLOSE pm-phase1:self (done)
 │                   │                   │ by the SAME workflow     │
 │                   │<──────────────────────────────────────────────┤   │
 │                   │                   │              │              │
 │ [return from pm-phase1]               │              │              │
 │                   │ Tier 1: CLOSE/FAIL pm-phase1:dispatch          │
 │                   │ (skill owns dispatch; NOT :self)               │
 │                   ├─────────────────> │              │              │
 │ <──────────────────────────────────────────────────────────────────┤
 │                   │                   │              │              │
 │ ... repeat for pm-phase2, pm-phase3 ...              │              │
 │                   │                   │              │              │

```

#### Agent Resolution with Hash Verification

```
Workflow/CLI          Registry Module      Manifest     Filesystem
  │                        │                │              │
  │ agents resolve          │                │              │
  │ --project <dir>         │                │              │
  │ --id gaia.agent.developer.backend
  │ --require-verified      │                │              │
  ├──────────────────>      │                │              │
  │                    1. Load catalog       │              │
  │                    2. Resolve scope      │              │
  │                    (find agent file)     │              │
  │                         ├────────────────────────────>  │
  │                         │ stat .claude/agents/          │
  │                         │ gaia-developer-backend.md     │
  │                         │<──────────────────────────────┤
  │                         │                │              │
  │                    3. Read manifest      │              │
  │                         ├───────────────>│              │
  │                         │   (JSON)       │              │
  │                         │<───────────────┤              │
  │                         │                │              │
  │                    4. Verify integrity:  │              │
  │                       - ID in catalog    │              │
  │                       - file in manifest │              │
  │                       - hash in fileHashes
  │                       - compute SHA-256  │              │
  │                         ├────────────────────────────>  │
  │                         │ read file      │              │
  │                         │<──────────────────────────────┤
  │                         │                │              │
  │                    5. Compare hashes     │              │
  │                    6. Return result      │              │
  │<───────────────────────────────────────── │              │
  │ {                       │                │              │
  │   agentId: "...",       │                │              │
  │   platform: "claude",   │                │              │
  │   nativeName: "...",    │                │              │
  │   scope: "project",     │                │              │
  │   status: "verified",   │                │              │
  │   sha256: "sha256:..."  │                │              │
  │ }                       │                │              │
  │                         │                │              │
```

#### Error Case — Hash Mismatch

```
Workflow/CLI          Registry Module      Manifest     Filesystem
  │                        │                │              │
  │ agents resolve          │                │              │
  │ --require-verified      │                │              │
  ├──────────────────>      │                │              │
  │                    1. Load catalog       │              │
  │                    2. Resolve scope      │              │
  │                    3. Read manifest      │              │
  │                    4. Recompute current  │              │
  │                       SHA-256 from disk   │              │
  │                         ├────────────────────────────>  │
  │                         │ read file,     │              │
  │                         │ SHA-256        │              │
  │                         │<──────────────────────────────┤
  │                         │                │              │
  │                    5. Compare recomputed  │              │
  │                       digest vs manifest: │              │
  │                       hash-mismatch      │              │
  │                         │                │              │
  │                    6. Return error       │              │
  │                       status: "hash-mismatch"
  │<──────────────────[HARD STOP]───────────────────────────┤
  │ exitCode: 1             │                │              │
  │ error: "SHA-256 on disk │                │              │
  │   does not match        │                │              │
  │   manifest record"      │                │              │
  │                         │                │              │
```

## 3. Backend

### 3.1 Data Model

#### Agent Registry Catalog Entry

```javascript
{
  // Canonical identity
  id:               "gaia.agent.developer.backend",
  
  // Platform-specific native name (post-Phase-B: all gaia-* prefixed)
  nativeNames: {
    "claude": "gaia-developer-backend"      // Phase B: renamed
    // "claude": "developer-backend"        // Phase A: transitional legacy mapping
  },
  
  // Source and installation path
  sourceFile:       "src/claude/agents/gaia-developer-backend.md",  // Phase B
  // sourceFile:    "src/claude/agents/developer-backend.md",       // Phase A
  runtimePath:      ".claude/agents/gaia-developer-backend.md",     // Phase B
  
  // Role and authorization
  role:             "developer",
  phase:            "implementation",
  allowedPipelines: ["implement-feature"],
  
  // Version compatibility
  minToolkitVersion: "0.13.0",
  
  // Deprecation flag
  deprecated:       false,
  
  // Supported platforms
  platforms:        ["claude"],
  
  // Entry point / Tier reference
  tiers:            ["tier2", "tier3"]     // Tier 1 is skill-level
}
```

#### Canonical ID Mapping (Legacy Support)

```javascript
// Map legacy agent_type values (from Work Breakdown) to canonical IDs
// Maintained through Phase B; entries archived after full namespace adoption
const LEGACY_AGENT_TYPE_MAPPING = {
  "developer-backend":       "gaia.agent.developer.backend",
  "developer-frontend":      "gaia.agent.developer.frontend",
  "developer-testing":       "gaia.agent.developer.testing",
  "developer-database":      "gaia.agent.developer.backend",  // Explicit mapping, deprecation warning
  "review-solution":         "gaia.agent.review.solution",
  // ... other legacy types ...
}
```

#### Manifest Extension (Backward-Compatible)

```json
{
  "version":          "0.13.0",
  "installedAt":      "2026-09-04T14:32:00Z",
  "installationMode": "local",
  "files": [
    ".claude/agents/gaia-developer-backend.md",
    ".claude/workflows/pm-phase3.js"
  ],
  "fileHashes": {
    ".claude/agents/gaia-developer-backend.md": "sha256:abc123def456...",
    ".claude/workflows/pm-phase3.js":           "sha256:789abc012def..."
  }
}
```

**Invariant:** `set(files) == set(keys(fileHashes))` after every write.

#### Resolution Record (Return from `resolveAgent()`)

```javascript
{
  agentId:         "gaia.agent.developer.backend",
  platform:        "claude",
  nativeName:      "gaia-developer-backend",
  scope:           "project",                    // or "global"
  path:            "C:/repo/.claude/agents/gaia-developer-backend.md",
  toolkitVersion:  "0.13.0",
  manifestPath:    "C:/repo/.claude/.ai-toolkit-manifest.json",
  sha256:          "sha256:abc123def456...",
  status:          "verified"                    // or error status
}
```

### 3.2 CLI Module Exports

**Ownership of domain logic.** All resolution/validation domain functions
(`resolveAgent()`, `validateAgentSet()`, `listRegisteredAgents()`, catalog and
provenance-guard logic) live in `lib/agent-registry.js`. `bin/cli.js` **imports**
them from `lib/agent-registry.js` (e.g. `const { resolveAgent, validateAgentSet,
listRegisteredAgents } = require('../lib/agent-registry')`) and exposes them only
through the CLI facade. `bin/cli.js` MUST NOT re-implement or duplicate this logic;
it is not a second registry. Only the manifest/hash helpers that already belong to
the installer (`readManifest`, `writeManifest`, `computeFileSha256`) remain defined
in `bin/cli.js`.

#### Core Resolution Function (defined in `lib/agent-registry.js`, imported by `bin/cli.js`)

```javascript
/**
 * Resolve an agent by canonical ID with optional verification.
 * @param {object} opts
 * @param {string} opts.projectDir - project root directory
 * @param {string} opts.agentId - canonical ID (e.g. "gaia.agent.developer.backend")
 * @param {string} opts.platform - target platform (default: "claude")
 * @param {boolean} opts.requireVerified - if true, exit non-zero on unverified status
 * @returns {Promise<object>} resolution record with status and identity fields
 */
async function resolveAgent(opts)
```

#### Manifest Functions

```javascript
/**
 * Compute SHA-256 digest for a file (different from fileHash MD5).
 * @param {string} filePath
 * @returns {string} "sha256:<hex>"
 */
function computeFileSha256(filePath)

// IMPORTANT: These extend the EXISTING FTR-015 signatures in bin/cli.js.
// The real functions are readManifest(destRoot) and
// writeManifest(destRoot, fileList, installationMode). FTR-017 only APPENDS an
// optional trailing fileHashes parameter to writeManifest — it does NOT change
// the existing parameters, and it does NOT redefine them to take a manifestPath.
// The manifest path is derived internally as
// path.join(destRoot, '.claude', '.ai-toolkit-manifest.json').

/**
 * Read manifest with backward-compatible handling. UNCHANGED from FTR-015.
 * @param {string} destRoot - installation root (projectDir for local, homeDir for global)
 * @returns {object} parsed manifest (at least { files: [] } when absent/corrupt)
 */
function readManifest(destRoot)

/**
 * Write manifest. Existing three parameters are UNCHANGED; the optional fourth
 * fileHashes parameter is the ONLY FTR-017 addition (backward-compatible).
 * @param {string} destRoot - installation root (projectDir for local, homeDir for global)
 * @param {string[]} fileList - installed file list (existing behavior; files: string[] unchanged)
 * @param {string} installationMode - "local" | "global" (existing FTR-015 enum)
 * @param {object} [fileHashes] - optional { path: "sha256:..." } map; every FTR-017
 *        production install path passes it; omitting it is permitted only in legacy
 *        test fixtures and yields exactly the pre-FTR-017 behavior
 */
function writeManifest(destRoot, fileList, installationMode, fileHashes)
```

#### Validation Functions

```javascript
/**
 * Validate entire agent set against catalog and manifest.
 * @param {string} projectDir
 * @returns {Promise<array>} array of validation errors (empty = valid)
 */
async function validateAgentSet(projectDir)

/**
 * List all registered toolkit agents with availability.
 * @param {string} projectDir
 * @returns {array} agent records with status
 */
function listRegisteredAgents(projectDir)
```

### 3.3 Ledger Entry Extension (FTR-016 Integration)

#### Open with Metadata

```javascript
// CLI invocation (from Tier 1 guard in skill)
ai-toolkit ledger open \
  --dir <featureDir> \
  --prefix <PREFIX> \
  --agent pm-phase3:dispatch \
  --phase implementation \
  --model sonnet \
  --attempt 1 \
  --agent-id gaia.orchestrator.feature.phase3 \
  --native-name pm-phase3 \
  --toolkit-version 0.13.0 \
  --scope project \
  --hash sha256:abc123...

// Results in ledger entry:
{
  "operation_id": "FTR-017|pm-phase3:dispatch|1",
  "agent": "pm-phase3:dispatch",
  "phase": "implementation",
  "model": "sonnet",
  "status": "running",
  "started_at": "2026-09-04T...",
  "agentId": "gaia.orchestrator.feature.phase3",
  "nativeAgentName": "pm-phase3",
  "platform": "claude",
  "toolkitVersion": "0.13.0",
  "resolutionScope": "project",
  "definitionHash": "sha256:abc123..."
}
```

**Whitelisted Metadata Keys** (FTR-016 extension):
- `agentId` (string) — Canonical namespaced ID
- `nativeAgentName` (string) — Platform file/asset name
- `platform` (string) — e.g. `"claude"`
- `toolkitVersion` (string) — e.g. `"0.13.0"`
- `resolutionScope` (string) — `"project"` or `"global"`
- `definitionHash` (string) — `"sha256:<hex>"`

**Reserved Fields** (never overwritten):
- `operation_id`, `agent`, `phase`, `model`, `status`, `started_at`, `completed_at`, `phase_delta_tokens`, `error`

**Safety Invariants:**
1. First open: metadata stored alongside standard fields
2. Idempotent re-open with SAME metadata: no-op, all fields preserved
3. Idempotent re-open with DIFFERENT metadata: **HARD STOP**, non-zero exit, no write
4. Unknown metadata key: rejected before write, non-zero exit
5. `close`/`fail`: metadata preserved verbatim, only status/timestamps/error updated

### 3.4 API Endpoints (CLI Commands)

| Command | Purpose | Exit Code | Output |
|---------|---------|-----------|--------|
| `ai-toolkit agents list --project <dir> --format json` | Enumerate registered toolkit agents | 0 | JSON array of agent records |
| `ai-toolkit agents resolve --project <dir> --id <id>` | Diagnostic resolution (may return `hash-unverifiable`/`hash-mismatch`) | 0 for a resolvable known agent; non-zero for unknown ID, collision/ambiguity, corrupt manifest, or unresolvable installation | JSON resolution record |
| `ai-toolkit agents resolve --project <dir> --id <id> --require-verified` | Operational resolution (hard-stop on non-verified) | 0 or non-zero | JSON or error on stderr |
| `ai-toolkit agents preflight --project <dir> --pipeline implement-feature` | Validate all agents for a pipeline entry point | 0 or non-zero | Validation report or error |
| `ai-toolkit doctor agents --project <dir>` | Diagnostic report (read-only) | 0 (always) | Markdown or JSON report |
| `ai-toolkit agents cleanup --project <dir>` | List cleanup candidates (dry-run only in FTR-017) | 0 on a successful dry-run; non-zero if a mutating flag is used or on I/O error | List of candidate files |

#### Resolution Output Format

```json
{
  "agentId": "gaia.agent.developer.backend",
  "platform": "claude",
  "nativeName": "gaia-developer-backend",
  "scope": "project",
  "path": "C:/Users/Tomada D/workspace/repo/.claude/agents/gaia-developer-backend.md",
  "toolkitVersion": "0.13.0",
  "manifestPath": "C:/Users/Tomada D/workspace/repo/.claude/.ai-toolkit-manifest.json",
  "sha256": "sha256:abc123...",
  "status": "verified"
}
```

#### Doctor Agents Output (Markdown)

```markdown
# Agent Resolution Report — {date}

## Installed Agents

| Agent ID | Native Name | Scope | Status | Path |
|----------|-------------|-------|--------|------|
| gaia.agent.developer.backend | gaia-developer-backend | project | verified | ... |
| gaia.agent.developer.frontend | gaia-developer-frontend | project | verified | ... |
| gaia.agent.review.solution | gaia-review-solution | global | hash-unverifiable | ... |

## Collisions

None.

## Foreign Agents

| Name | Path | Status |
|------|------|--------|
| project-manager | ~/.claude/agents/project-manager.md | foreign |

## Non-Observable Scopes

Plugins and session-provided agents cannot be verified via the filesystem.
Ensure all required agents use the `gaia-*` naming convention to minimize collision risk.

## Remediation

- `hash-unverifiable`: Reinstall or upgrade the toolkit runtime to generate integrity hashes
- Collision: Remove or rename the conflicting file, then reinstall toolkit
```

### 3.5 Validation Rules

#### Manifest Validation

- Manifest file must exist and be valid JSON
- `version` field present and parseable
- `files` field is a `string[]`
- `fileHashes` present (FTR-017+) with entries for every file in `files`
- `set(files) == set(keys(fileHashes))`
- For each entry in `fileHashes`, the file must exist on disk
- Each file's SHA-256 digest must match the recorded hash

#### Agent Registration Validation

- Agent ID is in the canonical catalog
- Requested platform is supported (currently: `"claude"` only)
- Agent file exists in an observable scope (project or global `.claude/agents/`)
- Manifest declares the file in `files`
- Version compatibility: toolkit version >= `minToolkitVersion` in catalog
- Role authorization: caller's phase matches allowed pipeline (hardcoded for now)

#### Scope Collision Detection

- If two or more observable-scope files share the same effective native name at equal or higher precedence, emit HARD STOP
- Example: both `C:\repo\.claude\agents\gaia-developer-backend.md` and `C:\Users\user\.claude\agents\gaia-developer-backend.md` exist → error lists both paths

#### Non-Observable Scope Handling

- If agent is not found in observable scopes, emit `unobservable` **WARNING**
- No hard stop unless there is concrete evidence of a collision (e.g., explicit session inventory)
- `gaia-*` namespacing documented as mandatory mitigation

### 3.6 Error Handling

| Scenario | Exit Code | Output | Behavior |
|----------|-----------|--------|----------|
| Agent ID not in catalog | 1 | Structured JSON error | No dispatch |
| File not found in observable scope | 1 (with `--require-verified`), 0 with status | JSON with status | Workflow checks exit code |
| Manifest not found or corrupt | 1 | HARD STOP message | Pipeline does not start |
| v0.12.0 manifest (no `fileHashes`) | 1 (with `--require-verified`), 0 with status | JSON or error | Workflows use operational mode (`--require-verified`), so fails |
| Hash mismatch on disk | 1 (with `--require-verified`), 0 with status | JSON or error | File marked as unverified, dispatch blocked with `--require-verified` |
| Collision in observable scope | 1 | Collision HARD STOP message | Pipeline hard-stops immediately |
| Idempotent ledger open with different metadata | 1 | Metadata conflict error | No write, pipeline hard-stops |

## 4. Frontend

Not applicable — this is a backend/CLI feature.

## 5. External Integrations

**Execution Ledger (FTR-016):** The feature extends `lib/execution-ledger.js` with an optional metadata parameter to `open()` and optional CLI flags for identity fields. The CLI facade `ai-toolkit ledger open|close|fail` is invoked from:

1. `/implement-feature` SKILL.md (Tier 1 guard: OPENS and CLOSES/FAILS the `pm-phaseN:dispatch` entry — this is a DIFFERENT operation from `pm-phaseN:self`; the preflight activity is opened/closed here too)
2. `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` (Tier 3 self-registration: each workflow OPENS `pm-phaseN:self` at startup and, being the owner, CLOSES it to `done` on success or marks it `failed` in its own error path; a genuine interruption may legitimately leave `:self` `running`). Tier 1 never closes `:self`.
3. Workflows dispatching worker agents (Tier 2 resolution via CLI, no ledger call needed)

Ledger behavior is fail-closed: every terminal operation (`close`, `fail`) is fail-closed, and if one fails the pipeline hard-stops. FTR-016 status vocabulary applies throughout: `open` → `running`, `close` → `done`, `fail` → `failed`, `skip` → `skipped`.

## 6. Security Considerations

- **Agent Identity Verification:** On every `resolve --require-verified` and every preflight, the current SHA-256 is recomputed from the on-disk file and compared to the digest recorded in the manifest. This DETECTS divergence between the file and its manifest record; a mismatch is a hard stop. It does NOT provide cryptographic authenticity or prevent tampering: the manifest itself is unsigned, so an attacker who can rewrite the file can also rewrite the recorded hash. The guarantee is integrity-against-accidental-drift and detection-of-post-install-modification, not anti-tamper.
- **Manifest Integrity:** The manifest is NOT read-only — the installer rewrites it on every install and upgrade. Within a single resolve/preflight operation the recorded digests are compared against freshly recomputed on-disk digests; a divergence is reported. There is no cryptographic protection of the manifest file itself.
- **Scope Precedence:** Project-scope agents have precedence over global-scope. Session scope may have a different precedence and is non-observable; plugin scope is likewise non-observable. Non-observable scopes are a documented residual limit mitigated by `gaia-*` namespacing — the spec does not claim global scope dominates non-observable scopes.
- **Input Validation:** All CLI arguments are validated before any file I/O or ledger operations
- **Ledger Metadata:** Whitelisted metadata keys prevent accidental corruption of reserved ledger fields
- **No Dynamic Code Loading:** Registry logic is pure JavaScript with no `eval()`, `require()` of user content, or LLM-based decisions
- **CORS:** Not applicable (CLI-based, no HTTP)

## 7. Database Changes

No database changes. All persistent state is in:
- `<installRoot>/.claude/.ai-toolkit-manifest.json` (installed agents and file hashes; `<installRoot>` = projectDir for local, homeDir for global)
- `{featureDir}/{PREFIX}-token-ledger.json` (the FTR-016 persistent Execution Ledger, per feature directory; Execution Ledger entries with optional metadata — NOT `.claude/.ai-toolkit-ledger.json`)
- `src/claude/agents/*.md` (source of truth for agent files; Phase B updates names)

## 8. Configuration

### Environment Variables

None new. Uses existing:
- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` (set by `.claude/settings.json`, unchanged)

### Manifest Inventory

Each toolkit installation produces/maintains a manifest at `{projectDir}/.claude/.ai-toolkit-manifest.json` recording:
- Version of toolkit installed
- Installation mode (`"local"` or `"global"`)
- List of files installed
- SHA-256 digest for each file (FTR-017+)

### Feature Flags

None new. The feature is always enabled once installed; v0.12.0 manifests (lacking hashes) are detected at runtime and trigger appropriate hard-stops.

## 9. File Inventory

### Phase A — New Files

| Path | Purpose |
|------|---------|
| `lib/agent-registry.js` | Canonical registry, resolution logic, provenance guard, platform-agnostic core |
| `tests/cli/agent-registry.test.js` | Unit tests: catalog, resolution, validation, scope handling |
| `tests/cli/manifest-hashes.test.js` | Unit tests: manifest evolution, hash computation, backward compatibility |
| `tests/cli/ledger-metadata.test.js` | Unit tests: metadata safety invariants, whitelisting, conflict detection |
| `tests/cli/agents-cli-commands.test.js` | Integration tests: CLI facade, exit codes, JSON output, error cases |
| `tests/cli/collision-detection.test.js` | Integration tests: observable scope collisions, foreign agents, non-observable warnings |
| `tests/integration/agent-resolution-e2e.test.js` | Deterministic E2E (simulated CLI/manifest/temp-home; NO real LLM pipeline): dispatch guard flow verified statically/contractually, manifest v0.12.0 → v0.13.0 upgrade, preflight |
| `tests/regression/static-guards.test.js` | Versioned Jest static tests (run by the existing `npm test`): no `require('../lib/agent-registry')` in workflow files; every `agents resolve` in workflow files includes `--require-verified`; no legacy orchestrator references in runtime assets. These rules are asserted in versioned Jest, NOT as bare greps in `ci.yml` |

### Phase A — Modified Files

| Path | Change |
|------|--------|
| `bin/cli.js` | Add `computeFileSha256()` (SHA-256); extend the EXISTING `writeManifest(destRoot, fileList, installationMode)` with an optional trailing `fileHashes` parameter (signatures otherwise unchanged); IMPORT `resolveAgent()`, `validateAgentSet()`, `listRegisteredAgents()` from `lib/agent-registry.js` and expose them via the CLI facade (do NOT re-implement/duplicate them here); update installer to call `computeFileSha256()` for every copied file and pass `fileHashes` to `writeManifest()` |
| `lib/execution-ledger.js` | Extend `open()` function signature with optional seventh `metadata` parameter; add metadata whitelisting and safety invariant checks before any write |
| `src/claude/workflows/pm-phase1.js` | Add Tier 3 self-registration: `ledger open` at startup, fail-closed; add Tier 2 guard: invoke `agents resolve --require-verified` before dispatching worker agents; use returned `nativeName` only; static test compliance |
| `src/claude/workflows/pm-phase2.js` | Same as pm-phase1 |
| `src/claude/workflows/pm-phase3.js` | Same as pm-phase1; already has ledger integration from FTR-016 |
| `src/claude/skills/implement-feature/SKILL.md` | Add preflight integration: `ledger open` for `agent-preflight:implement-feature`, run `agents preflight` (which applies `--require-verified` semantics internally; the external `agents preflight` command does NOT expose a `--require-verified` flag), `ledger close/fail`; add Tier 1 guard before each workflow: `ledger open` for `pm-phaseN:dispatch` with identity metadata, fail-closed, closed/failed by the same Tier 1; update dispatch to use returned `nativeName` from registry |
| `src/claude/skills/assess-codebase/SKILL.md` | Provenance-guard integration is DEFERRED to a later feature — NOT part of FTR-017. FTR-017 permits only the reference updates needed during Phase B renames (e.g. `SCOPE_AGENT_MAP` / dispatch name updates). No guard-integration task is scheduled for `assess-codebase` in FTR-017. |
| `src/claude/agents/*.md` | Remove all legacy orchestrator references (`/agent-project-manager`, bare `project-manager`, `assessment-manager` as legacy names); update agent names for Phase B renaming task readiness |
| `.github/workflows/ci.yml` | No new inline static-grep steps. CI runs the existing `npm test` suite only; the static-guard rules (no direct registry import in workflows, `--require-verified` on every workflow `agents resolve`, no legacy orchestrator references) are enforced by the versioned Jest tests in `tests/regression`/`tests/cli`, which `npm test` already executes |
| `package.json` | No changes (jest already present from FTR-010) |
| `docs/procedures/` | Add or update `agent-resolution.md`, `manifest-hash-evolution.md` if project override exists; else toolkit defaults apply |

### Phase A — Deletion

| Path | Reason |
|------|--------|
| (none) | All legacy files retained through Phase B for backward compatibility; renamed in atomic commits |

### Phase B — Per-Agent Rename Task

Each atomic commit renames one agent and updates all consumers:

| Category | Files Updated |
|----------|---|
| Source file | `src/claude/agents/{oldname}.md` → `src/claude/agents/gaia-{newname}.md` (update frontmatter `name:` field) |
| Consumers (workflows) | `src/claude/workflows/pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, `am-phase1.js`, `am-phase2.js` (update `agentType` references in dispatch calls) |
| Consumers (skills) | `src/claude/skills/implement-feature/SKILL.md`, `assess-codebase/SKILL.md`, `hi-gaia/SKILL.md` (update references in dispatch documentation) |
| Consumers (other agents) | Any agent file that names another agent in dispatch context (e.g., task assignment) |
| Registry mapping | `lib/agent-registry.js`: update native-name mapping entry (remove legacy mapping or update installer catalog) |
| Work Breakdown generator | `src/claude/agents/generate-work-breakdown.md`: update any hardcoded agent-type references (none today, but checked) |
| Tests | `tests/**/*.test.js`: update all references to old agent file name or native name |
| Process log rendering | `src/claude/scripts/render-process-log.js`: update agent name references in output formatting |

## 10. Testing Strategy

### Unit Tests (Pure Functions)

| Module | Coverage |
|--------|----------|
| `lib/agent-registry.js` | Catalog loading, resolution logic, validation, scope precedence |
| `bin/cli.js` | `computeFileSha256()`, manifest I/O, backward compatibility, file processing |
| `lib/execution-ledger.js` | Metadata whitelisting, safety invariants, conflict detection |

### Integration Tests (CLI Facade)

| Scenario | Test File |
|----------|-----------|
| `agents resolve` diagnostic mode (may return `hash-unverifiable`) | `tests/cli/agents-cli-commands.test.js` |
| `agents resolve --require-verified` operational mode (hard-stop on non-verified) | `tests/cli/agents-cli-commands.test.js` |
| `agents preflight` with manifest v0.12.0 (no hashes) — hard-stop | `tests/cli/agents-cli-commands.test.js` |
| `agents preflight` with manifest v0.13.0 (with hashes, matching) — pass | `tests/cli/agents-cli-commands.test.js` |
| Hash mismatch detection | `tests/cli/agents-cli-commands.test.js` |
| Observable scope collision — hard-stop with both paths | `tests/cli/collision-detection.test.js` |
| Non-observable scope (plugin/session) — warning, no hard stop | `tests/cli/collision-detection.test.js` |
| Ledger `open` with metadata: first open | `tests/cli/ledger-metadata.test.js` |
| Ledger `open` idempotent, same metadata | `tests/cli/ledger-metadata.test.js` |
| Ledger `open` idempotent, different metadata — hard stop | `tests/cli/ledger-metadata.test.js` |
| Unknown metadata key — rejected before write | `tests/cli/ledger-metadata.test.js` |
| `close`/`fail` preserves metadata | `tests/cli/ledger-metadata.test.js` |
| `doctor agents` output format and statuses | `tests/cli/agents-cli-commands.test.js` |
| `agents cleanup` dry-run-only, rejects mutating flags | `tests/cli/agents-cli-commands.test.js` |
| Manifest invariant: `set(files) == set(keys(fileHashes))` enforced | `tests/cli/manifest-hashes.test.js` |

### E2E Tests

E2E tests are **fully deterministic** and must **NOT start a real LLM pipeline**. They
simulate the CLI, the manifest, and a temporary home directory, and verify workflow
dispatch statically/contractually (assert on the commands/native names the guard would
produce and the ledger entries it would write — no subagent is actually spawned).

| Scenario | Test File |
|----------|-----------|
| Dispatch guard flow (Tier 1/2/3) verified contractually — simulated CLI + manifest + temp home, no real LLM | `tests/integration/agent-resolution-e2e.test.js` |
| Local-only installation resolves against `<projectDir>/.claude` manifest | `tests/integration/agent-resolution-e2e.test.js` |
| Global-only installation resolves against `<homeDir>/.claude` manifest (temp home) | `tests/integration/agent-resolution-e2e.test.js` |
| Mixed installation (local + global present) → FTR-015 resolver ambiguity, non-zero | `tests/integration/agent-resolution-e2e.test.js` |
| Upgrade from v0.12.0 manifest (no hashes) to v0.13.0 | `tests/integration/agent-resolution-e2e.test.js` |
| Old `project-manager.md` in global scope (temp home): flagged foreign, not a hard stop | `tests/integration/agent-resolution-e2e.test.js` |
| Preflight hard-stops on v0.12.0 manifest | `tests/integration/agent-resolution-e2e.test.js` |

### Static Tests (versioned Jest — run by the existing `npm test`)

Static-guard rules are implemented as **versioned Jest tests** under `tests/regression`
(or `tests/cli`) and executed by the existing `npm test`. They are NOT bare greps in
`ci.yml`; CI simply runs the existing suite.

| Check | File | Condition |
|-------|------|-----------|
| No registry imports in workflows | `tests/regression/static-guards.test.js` | Asserts no `require('../lib/agent-registry')` (or equivalent direct import) in `src/claude/workflows/*.js` |
| All workflow `agents resolve` use `--require-verified` | `tests/regression/static-guards.test.js` | Asserts every `agents resolve` invocation in `src/claude/workflows/*.js` includes `--require-verified` |
| No legacy orchestrator references in runtime assets | `tests/regression/static-guards.test.js` | Asserts no `/agent-project-manager`, no bare `project-manager` (except frontmatter `name:` of legacy agents during Phase A), no `assessment-manager` references in skills |

### Manual Verification Steps

1. Run `npm test` → all tests green
2. Run `ai-toolkit agents list --project <dir> --format json` → canonical catalog dumps; verify agent IDs
3. Run `ai-toolkit agents resolve --project <dir> --id gaia.agent.developer.backend` → returns `verified` status
4. Run `ai-toolkit agents resolve --project <dir> --id gaia.agent.developer.backend --require-verified` → exit 0, same output
5. Modify an agent file on disk (manifest still has its original `fileHashes`) → run `ai-toolkit agents resolve --require-verified` → the current digest is recomputed from disk, diverges from the manifest record, and the command returns `hash-mismatch` status with exit 1 (NOT `hash-unverifiable`; `hash-unverifiable` is reserved for a manifest that has no hashes at all). For the same modified file, `ai-toolkit doctor agents` reports the agent as `conflict` with an integrity detail of `hash-mismatch`
6. Run `ai-toolkit doctor agents --project <dir>` → readable report, all agents listed, statuses accurate
7. Start feature delivery via `/implement-feature` → observe ledger entries with metadata stored; no pipeline-blocking errors if all manifests are v0.13.0+
8. After Phase B renaming: verify no legacy agent names remain in `src/claude/agents/`; all agent IDs in manifest carry `gaia-*` native names

## 11. Implementation Order

1. **Create canonical registry module** — `lib/agent-registry.js` with catalog, resolution logic, provenance guard; unit tests
   - Depends on: nothing (pure JS, no external deps beyond Node built-ins)

2. **Extend bin/cli.js** — add `computeFileSha256()`; keep `readManifest(destRoot)` and extend `writeManifest(destRoot, fileList, installationMode)` with an optional trailing `fileHashes` parameter (existing params unchanged); IMPORT `resolveAgent()`/`validateAgentSet()`/`listRegisteredAgents()` from `lib/agent-registry.js` and expose them via the CLI facade (no duplication); unit tests
   - Depends on: 1 (registry logic)

3. **Extend execution-ledger.js** — add metadata parameter, whitelisting, safety invariant checks; unit tests
   - Depends on: FTR-016 (already merged)

4. **Update installer in bin/cli.js** — call `computeFileSha256()` for every copied file, pass `fileHashes` to `writeManifest()`; ensure fresh installs produce v0.13.0 manifests with hashes
   - Depends on: 2

5. **Add CLI facade commands** — `agents list`, `agents resolve` (diagnostic and `--require-verified`), `agents preflight`, `doctor agents`, `agents cleanup`; integration tests
   - Depends on: 1, 2, 3

6. **Update pm-phase1.js, pm-phase2.js, pm-phase3.js workflows** — Tier 2 guard (invoke `agents resolve --require-verified` before worker dispatch) + Tier 3 self-registration (ledger open at startup); workflow tests
   - Depends on: 5 (CLI facade stable)

7. **Update implement-feature/SKILL.md** — Tier 1 guard (ledger open with metadata before workflow dispatch) + preflight integration; skill tests
   - Depends on: 5, 6, 3

8. **Remove legacy orchestrator references** — audit all runtime assets (agents, skills, workflows, commands) for `/agent-project-manager`, bare `project-manager`, `assessment-manager` references; remove or replace with canonical IDs. (NOTE: provenance-guard integration into `assess-codebase` is DEFERRED and is NOT an FTR-017 task; only Phase B rename reference updates touch `assess-codebase`.)
   - Depends on: 1

9. **Add comprehensive test suite** — deterministic E2E (simulated CLI/manifest/temp-home, no real LLM) covering the dispatch guard flow, local-only/global-only/mixed installation resolution, manifest upgrade, foreign agent detection, collision, and preflight hard-stops
    - Depends on: 2, 3, 5, 6, 7, 8

10. **Add versioned static Jest tests** — under `tests/regression`/`tests/cli`, run by the existing `npm test` (NOT bare greps in `ci.yml`): no registry imports in workflows, every workflow `agents resolve` includes `--require-verified`, no legacy references
    - Depends on: 6, 8

11. **Prepare Phase B rename tasks** — create one task per legacy-named agent; document Phase B sequence
    - Depends on: 1–10 (Phase A complete, all tests green)

12. **Phase B Task 1: Rename developer-backend** — atomic: file rename, all consumers updated, registry entry updated, `npm test` passes, one commit
    - Depends on: 11 (Phase A stable)

13. **Phase B Task N: Rename remaining agents** — repeat per task; at end, installer distributes only `gaia-*` names, no legacy mapping remains
    - Depends on: 12 (prior task complete)

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| v0.12.0 manifests (no hashes) cause immediate hard-stops on any `--require-verified` call, blocking adoption | High | Error message instructs reinstall; backward-compatible diagnostic mode (`agents resolve` without flag) still works for troubleshooting; upgrade path tested in E2E suite |
| Non-observable scopes (plugins, session agents) may still collide with required toolkit agents but cannot be detected by registry | Medium | `gaia-*` namespacing mandatory; `doctor agents` emits `unobservable` WARNING documenting the residual limit; hard stop only on concrete evidence (e.g., explicit session inventory) |
| Static tests fail to catch illegal workflow code (direct registry imports or missing `--require-verified`) in edge cases | Medium | Comprehensive assertions in the versioned Jest static-guard tests (run by `npm test`); manual audit of workflow files before Phase B approval; test coverage of all dispatch patterns in pm-phase1/2/3.js |
| Manifest file corruption during `writeManifest()` leaves installation in inconsistent state | Low | `writeManifest()` retains its existing FTR-015 write behavior; hardened atomic-write (temp + fsync + rename) for the manifest is NOT in FTR-017 scope and is not claimed or tested here. Corrupt/partial manifests are handled at read time (`readManifest()` returns an empty payload; resolution/preflight report the appropriate diagnostic status) |
| Hash computation expensive for large files or many files during install | Low | Digests are computed at install time and recorded in the manifest; at verification time the current digest is recomputed from the on-disk file on every `resolve --require-verified` and every preflight (a re-read is required to detect post-install modification), then compared to the recorded value; performance test confirms < 1s for a typical toolkit install (~20 files) |
| Idempotent ledger open with conflicting metadata blocks resume / retry scenarios | Low | Safety invariant documented; idempotent form must use SAME metadata (exact match required); if metadata differs, pipeline hard-stops with clear error identifying conflicting key; operator must resolve and retry |
| Phase B rename task misses a consumer (e.g., process-log renderer), breaks pipeline after rename | Medium | Atomic commit includes ALL consumers; `npm test` must pass (catches any hardcoded references in test fixtures); thorough search for agent name references before each rename task; AC-35 verification step |
| Legacy `agent_type` values in Work Breakdown become ambiguous or map incorrectly after Phase B | Low | Explicit registry mapping maintained through Phase B and beyond; legacy values continue to resolve correctly; no WB update required; mapping is one-way (legacy → canonical), never the reverse |
| Tier 1, 2, 3 guard chains insufficient; orchestrator outside toolkit scope still reaches unverified agents | Medium | Residual limit documented; enforcement boundary is toolkit-managed paths only; user-triggered invocations outside toolkit are a known gap; recommend organizational process / CI policy to enforce `/implement-feature` entry point |
| Manifest with missing or extra keys in `fileHashes` causes runtime failures | Low | Invariant `set(files) == set(keys(fileHashes))` enforced on every `writeManifest()` call; validation test covers this; CI detects any manifest that violates invariant |
| Performance degradation from repeated hash computation on large codebases | Low | The expected digest is an O(1) manifest lookup, but the current digest is recomputed from the on-disk file on every `resolve --require-verified` and every preflight (necessary to detect post-install modification — using only the stored value could never detect it). Any caching is permitted ONLY within a single operation; results are never reused across operations without reliable invalidation |

## 13. Appendix: Phase B Rename Sequence

Phase B begins only after Phase A is complete, all tests pass, and the registry+guard layer is proven stable in production.

### Rename Task Template

Each task follows this structure:

```
Rename {AgentName} to gaia-{AgentName}

1. Rename source file
   git mv src/claude/agents/{agent-name}.md src/claude/agents/gaia-{agent-name}.md

2. Update frontmatter
   Edit file: name: gaia-{agent-name}

3. Update all consumers
   - pm-phase1.js:   agentType dispatch references
   - pm-phase2.js:   agentType dispatch references
   - pm-phase3.js:   agentType dispatch references
   - am-phase1.js:   agentType dispatch references + SCOPE_AGENT_MAP entry
   - am-phase2.js:   agentType dispatch references
   - implement-feature/SKILL.md:    documentation references
   - assess-codebase/SKILL.md:      documentation references
   - hi-gaia/SKILL.md:              documentation references
   - Other agent files:             any dispatch or reference
   - Test files:                    all references to old agent file name

4. Update registry mapping
   lib/agent-registry.js:  nativeNames entry for new agent

5. Update installer catalog
   bin/cli.js (if needed):  any hardcoded catalog reference

6. Verify
   npm test (must pass; commit not made until green)

7. Commit atomically
   git commit -m "refactor: rename {agent-name} to gaia-{agent-name}"
```

### Candidate Agents for Phase B Rename

(Non-exhaustive list; full inventory to be generated in Phase A)

1. `developer-backend.md` → `gaia-developer-backend.md`
2. `developer-frontend.md` → `gaia-developer-frontend.md`
3. `developer-testing.md` → `gaia-developer-testing.md`
4. `review-solution.md` → `gaia-review-solution.md`
5. `generate-requirements.md` → `gaia-generate-requirements.md`
6. `generate-tech-spec.md` → `gaia-generate-tech-spec.md`
7. `generate-work-breakdown.md` → `gaia-generate-work-breakdown.md`
8. `validate-feature-docs.md` → `gaia-validate-feature-docs.md`
9. `validate-work-breakdown-semantic.md` → `gaia-validate-work-breakdown-semantic.md`
10. `define-feature.md` → `gaia-define-feature.md`
11. `init-agents-md.md` → `gaia-init-agents-md.md`
12. `install-toolkit.md` → `gaia-install-toolkit.md`
13. `intervention-documentation-standard.md` → `gaia-intervention-documentation-standard.md`
14. (Assessment agents: `generic-software-assessment.md`, `layered-architecture-assessment.md`, `concurrency-safety-assessment.md`, etc.)
15. (Refactoring agents: `dependency-injection-refactoring.md`, `domain-model-refactoring.md`, etc.)

### Completion Criteria (AC-27)

After all Phase B tasks complete:
- `ls src/claude/agents/` shows only `gaia-*` named agent files
- Installer no longer carries any legacy agent-type → legacy-filename mapping
- `doctor agents` reports all agents with `verified` status (or `hash-unverifiable` if v0.12.0 manifest exists, but that's a hard-stop on dispatch)
- Feature marked complete

---

**Document Version:** 1.0  
**Last Updated:** 2026-09-04  
**Status:** Draft — awaiting Phase A implementation and testing
