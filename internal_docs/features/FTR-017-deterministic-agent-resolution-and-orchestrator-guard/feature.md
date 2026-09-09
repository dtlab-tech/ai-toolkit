# Deterministic Agent Resolution and Orchestrator Guard

## Feature ID
FTR-017

## Summary
This feature introduces a deterministic boundary between the toolkit's orchestration layer and
the underlying platform. Today, every pipeline dispatch implicitly trusts that the platform will
resolve the correct agent by name — an assumption that silently breaks when an agent with the
same or similar name exists in a different scope (global user config, a previous project, a
plugin). FTR-017 eliminates this trust with a JavaScript-only, LLM-free resolution layer: a
canonical agent registry (`lib/agent-registry.js`), a provenance guard that verifies agent
identity against the installed manifest and a new `fileHashes` parallel field added to the
manifest by the installer (the existing `files: string[]` field is left unchanged), a mandatory
preflight executed by `/implement-feature` (the toolkit-supported entry point for the complete
delivery pipeline), and a set of CLI diagnostics. The CLI `agents resolve` command introduces a
`--require-verified` flag: without it the command is diagnostic and may return `hash-unverifiable`;
with it the command hard-stops on any status that is not `"verified"`. All workflow and skill
dispatch paths use `--require-verified`; diagnostic tooling uses the flag-free form. A manifest
from v0.12.0 (no `fileHashes`) causes `doctor agents` to report `hash-unverifiable`; operational
preflight and any dispatch path that uses `--require-verified` hard-stop until the toolkit is
reinstalled to generate hashes. Workflows cannot import `lib/agent-registry.js` directly; they
invoke the CLI facade with `--require-verified` and use the returned `nativeName` for dispatch.
The `installationMode` field in the manifest uses the existing `"local" | "global"` enum
(unchanged from FTR-015); the registry's `resolutionScope` field uses `"project" | "global"` as
a semantic parallel — these are explicitly distinguished. The installer transition is split across
phases: Phase A registers legacy native names as transitional; each Phase B rename task updates
the installer mapping in the same atomic commit; at Phase B completion no legacy distribution
mapping remains. `agents cleanup` in FTR-017 is dry-run-only; any mutating flag is rejected as
unsupported. The Execution Ledger integration uses the real `open/close/fail` contract with a
backward-compatible, whitelisted metadata extension whose safety invariants are specified in
detail. The feature also resolves the `developer-database` gap (explicit registry mapping to
`gaia.agent.developer.backend`; removed from the generator's new-value list), removes all legacy
orchestrator references from runtime assets, and enforces `set(files) == set(keys(fileHashes))`
as an invariant on every produced manifest.

## Problem Statement
During the implementation of a feature in a consumer project, a global `project-manager` agent
belonging to an old solution present in the user's workspace was invoked instead of the toolkit's
`pm-phase3.js` workflow. The result was formally plausible but operationally incorrect: the INFRA
phase was implemented and committed, developer agents were started, the Execution Ledger was not
updated for the executed tasks, and the process did not follow the authorised path
(`/implement-feature → pm-phase3`). The cause was not the absence of `pm-phase3.js` — the
workflow was installed. It was bypassed by a homonymous agent discovered in another scope.

The toolkit currently relies on three unverified implicit assumptions:

1. An agent name uniquely identifies its implementation.
2. The correct initial command is always used.
3. If an expected agent is unavailable, the platform will not select a similar one.

These assumptions must be replaced by deterministic checks. Claude Code can simultaneously expose
agents from the current project configuration, the user's global configuration, plugins,
session-provided definitions, and residues from previous installations. FTR-015 established which
toolkit installation supplies runtime assets; it does not establish which agent definition the
platform will select for a generic name, nor does it prevent an obsolete prompt from entering the
pipeline at the wrong point. FTR-017 covers that second plane.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)

This feature has two sequential implementation phases. Phase A (registry, guard, CLI, ledger
integration, manifest hashes, legacy fixes, agent-type inventory) must be fully implemented and
tested before Phase B (atomic per-agent renames) begins.

### Phase A — Registry, Guard, and Integration

#### `agents resolve` — diagnostic vs operational contract
The CLI `agents resolve` command has two modes determined by a flag:

- **Diagnostic (no flag):**
  ```
  ai-toolkit agents resolve --project <dir> --id <canonical-id>
  ```
  Exits 0 and returns a structured JSON result for all resolvable outcomes, including
  `hash-unverifiable`. Intended for `doctor agents`, scripts, and humans inspecting the state
  without blocking.

- **Operational (`--require-verified`):**
  ```
  ai-toolkit agents resolve --project <dir> --id <canonical-id> --require-verified
  ```
  Exits non-zero if the returned `status` is anything other than `"verified"`. This is the form
  used by all workflow scripts (Tier 2), the `/implement-feature` skill (Tier 1), and
  `agents preflight` internally. The CLI cannot infer the caller; the `--require-verified` flag
  makes the operational contract explicit and testable via static analysis.

#### Pre-dispatch registry resolution (runtime path)
1. A workflow invokes the operational form of the facade before dispatching a worker agent:
   ```
   ai-toolkit agents resolve --project <dir> --id gaia.agent.developer.backend --require-verified
   ```
   The facade delegates to `lib/agent-registry.js` in the same `ai-toolkit` process. Workflows
   cannot import `lib/agent-registry.js` directly — the Claude workflow runtime lacks `require`,
   `path`, and `__dirname`. All candidate-selection and verification logic lives in deterministic
   JavaScript inside the module; the agent running the command makes no decisions of its own.
   Static tests forbid any `require('../lib/agent-registry')` or equivalent import statement
   inside workflow `.js` files, and additionally verify that all `agents resolve` calls in
   workflow files include `--require-verified`.

2. The registry loads the canonical catalog (IDs, roles, types, supported platforms, native names,
   relative install paths, authorised pipeline phases and entry points, minimum contract version,
   legacy/deprecated status).

3. The registry reads the installed manifest (`{project}/.claude/.ai-toolkit-manifest.json`).
   Manifests from FTR-017 onward carry a `fileHashes` field (see Manifest Hash Evolution). The
   `files` field remains a `string[]` and is unchanged; all existing code that reads it continues
   to work without modification.

4. The provenance guard verifies: the ID exists in the catalog; the requested platform is
   supported; the agent file is present in an observable scope (project or global filesystem);
   the manifest declares the file in `files`; when `fileHashes` is present the SHA-256 on disk
   matches the recorded digest; the agent version is compatible with the orchestrator version;
   no file in any observable scope with equal or higher precedence conflicts with the required
   agent; the caller is authorised to invoke that role in the current phase; the `agent_type`
   from the Work Breakdown maps to exactly one canonical ID.

5. If all verifiable checks pass and `fileHashes` is present with a matching digest,
   `resolveAgent` returns `status: "verified"` and the full resolution record:
   ```json
   {
     "agentId":         "gaia.agent.developer.backend",
     "platform":        "claude",
     "nativeName":      "gaia-developer-backend",
     "scope":           "project",
     "path":            "C:/repo/.claude/agents/gaia-developer-backend.md",
     "toolkitVersion":  "0.13.0",
     "manifestPath":    "C:/repo/.claude/.ai-toolkit-manifest.json",
     "sha256":          "sha256:<hex>",
     "status":          "verified"
   }
   ```
   Note: `scope` uses `"project"` (local install) or `"global"` (global install); this is a
   semantic parallel to `manifest.installationMode` (`"local"` | `"global"`) but the two fields
   use different vocabularies and must not be conflated (see Data Model).
   The workflow uses **only the returned `nativeName`** for the `agentType` dispatch argument.

6. If `--require-verified` is passed and `status` is not `"verified"`, or if any check fails
   regardless of mode, the CLI exits non-zero with a structured error. No fallback or heuristic
   selection is attempted.

#### Scope observability and non-observable scopes
Observable scopes (deterministic, testable from the Node CLI via the filesystem):
- **Project-scope (`resolutionScope: "project"`):** `{projectDir}/.claude/agents/`
- **Global-scope (`resolutionScope: "global"`):** `{homeDir}/.claude/agents/`

Non-observable scopes (no authoritative inventory reachable from the Node CLI):
- **Plugin-scope:** Claude Code loads plugin agents at session startup; no enumeration API exists.
- **Session-scope:** Agents provided via session flags; no enumeration API exists.

Registry behavior for observable scopes: full verification (manifest, hash, version, precedence).
A conflict between two observable-scope files with the same effective native name is a HARD STOP.

Registry behavior for non-observable scopes: these constitute a **documented residual limit** of
FTR-017. The mandatory mitigation is `gaia-*` namespacing — a uniquely prefixed native name is
extremely unlikely to collide with a plugin or session agent. The registry emits an `unobservable`
WARNING in `doctor agents` for any agent whose coverage across non-observable scopes cannot be
confirmed. This warning is **not** an operational block. A hard stop on non-observable scope
grounds occurs only when there is **concrete evidence** of a collision — for example, when an
explicit session inventory (if Claude ever exposes one) lists a conflicting entry. Theoretical
possibility alone does not block dispatch.

#### Manifest Hash Evolution
From FTR-017 onward, the installer (`bin/cli.js` / `writeManifest()`) is extended to compute a
SHA-256 digest for each file it copies and store the digests in a **new parallel field**
`fileHashes`. The existing `files: string[]` field is **not changed** — its structure, content,
and all existing code that reads it remain identical.

Every FTR-017 installer production path **must** compute and pass `fileHashes`; the optional
parameter exists for API compatibility and test isolation only. A fresh install must not produce
a manifest without `fileHashes` or the just-created installation would immediately fail
operational preflight.

Manifest invariant: `set(files) == set(keys(fileHashes))` after every write. No entry in `files`
may be absent from `fileHashes`, and no key in `fileHashes` may be absent from `files`.

Example (v0.13.0+):
```json
{
  "version":          "0.13.0",
  "installedAt":      "...",
  "installationMode": "local",
  "files": [
    ".claude/agents/gaia-developer-backend.md",
    ".claude/workflows/pm-phase3.js"
  ],
  "fileHashes": {
    ".claude/agents/gaia-developer-backend.md": "sha256:abc123...",
    ".claude/workflows/pm-phase3.js":           "sha256:def456..."
  }
}
```

Note: `installationMode` uses the existing `"local" | "global"` enum from FTR-015 (see line 1626
and 1661 of `bin/cli.js`). Examples showing `"project"` as an `installationMode` value are
incorrect; the correct value for a project-level install is `"local"`.

Old readers that parse only `files` continue to work without any change. New readers check for
the presence of `fileHashes`; if absent, they treat the manifest as hash-unverifiable.

**Legacy manifest handling (v0.12.0 and earlier — no `fileHashes`):**
A manifest without `fileHashes` cannot prove provenance. This status is handled differently
depending on the operation:

- **`doctor agents` (diagnostic/read-only):** reports `status: "hash-unverifiable"` for each
  affected agent with a clear remediation message ("reinstall or upgrade the toolkit runtime to
  generate integrity hashes").
- **`agents resolve` without `--require-verified` (diagnostic):** may return the
  `hash-unverifiable` status in its output with exit 0.
- **`agents resolve --require-verified`, `agents preflight`, and any workflow dispatch:**
  **HARD STOP**. The pipeline does not start. The error message instructs the user to reinstall
  the toolkit runtime so a manifest with `fileHashes` is generated. After reinstall, preflight
  can pass.

#### Preflight (pipeline entry point)
7. `/implement-feature` is the **toolkit-supported entry point for the complete delivery
   pipeline**. This is a guarantee about toolkit-managed dispatch: the SKILL.md enforces the
   registry guard and ledger contract before each workflow dispatch. It does not technically
   prevent a user from invoking a legacy orchestrator outside the toolkit path — such external
   invocations are a residual limit documented below.

8. Before starting pm-phase1, `/implement-feature` records the preflight in the Execution Ledger:
   ```
   ai-toolkit ledger open  --dir <featureDir> --prefix <PREFIX>
                           --agent agent-preflight:implement-feature
                           --phase preflight --model sonnet --attempt 1
   ```
   Then runs:
   ```
   ai-toolkit agents preflight --project <dir> --pipeline implement-feature
   ```
   Preflight internally uses `--require-verified` semantics for every agent it resolves.
   A hash-unverifiable manifest causes preflight to hard-stop immediately.

9. On preflight pass:
   ```
   ai-toolkit ledger close --dir <featureDir> --prefix <PREFIX>
                           --agent agent-preflight:implement-feature --attempt 1
   ```
   On preflight failure (including hash-unverifiable):
   ```
   ai-toolkit ledger fail  --dir <featureDir> --prefix <PREFIX>
                           --agent agent-preflight:implement-feature --attempt 1
                           --error "<structured diagnostics>"
   ```
10. **Fail-closed gate:** if `ledger open` for the preflight activity returns non-zero, preflight
    does not run and the pipeline does not start. If `ledger close`/`fail` fails, the pipeline
    hard-stops.

#### Per-dispatch guard (three-tier model)

**Tier 1 — `/implement-feature` skill (before each workflow dispatch):**
11. Before dispatching each of pm-phase1, pm-phase2, pm-phase3, the skill opens a dedicated
    ledger entry for that workflow dispatch, recording the resolved identity as whitelisted
    metadata fields (see Data Model — Ledger Entry Extension and Safety Invariants):
    ```
    ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX>
                           --agent pm-phase3:dispatch --phase implementation --model sonnet
                           --attempt 1
                           --agent-id gaia.orchestrator.feature.phase3
                           --native-name pm-phase3 --toolkit-version 0.13.0
                           --scope project --hash sha256:<hex>
    ```
12. If `ledger open` fails, the workflow is not dispatched (fail-closed).
13. After the workflow returns, the skill calls `ledger close` (or `ledger fail` on error). If
    `ledger close`/`fail` fails, the pipeline hard-stops.

**Tier 2 — workflow scripts (before dispatching each worker agent):**
14. Each workflow (pm-phase1.js, pm-phase2.js, pm-phase3.js) invokes the CLI facade with
    `--require-verified` before dispatching a worker agent:
    ```
    ai-toolkit agents resolve --project <dir> --id <canonical-id> --require-verified
    ```
    The workflow checks the exit code and the structured JSON on stdout. If the exit code is
    non-zero (status is not `"verified"` or any other error), the workflow does not dispatch
    and returns an error. If the exit code is zero, the workflow uses only the returned
    `nativeName` for the `agentType` field — it never derives or guesses the native name from
    the canonical ID independently.
    Static tests verify that:
    - No workflow `.js` file contains `require('../lib/agent-registry')` or any direct import
      of the registry module or internal CLI paths.
    - Every `agents resolve` invocation in workflow files includes `--require-verified`.

**Tier 3 — workflow self-registration:**
15. When the platform provides no hook that truly precedes a workflow's own execution, the
    workflow opens a ledger entry for itself at startup:
    ```
    ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX>
                           --agent pm-phase3:self --phase implementation --model sonnet
                           --attempt 1
    ```
    If this ledger open fails, the workflow aborts immediately (fail-closed).

**Residual limit:**
The three tiers above guarantee that no toolkit-managed dispatch path invokes an unverified agent
or proceeds without a verified manifest. They do not prevent a user from typing
`subagent_type: project-manager` or any other invocation that bypasses the skill or workflows
entirely. This residual limit is documented rather than claimed to be solved.

#### Installer transition (split across Phase A and Phase B)
**Phase A:** The catalog-driven installer is updated to derive its copy plan exclusively from
`lib/asset-catalog.js`. In Phase A the source files still carry legacy names (e.g.
`developer-backend.md`). The installer registers these as **transitional** entries: they are
catalogued, manifest-tracked, and hash-recorded, but their native names are not yet namespaced.
This keeps the Phase A test suite green while Phase B renames proceed.

**Phase B (per-rename):** Each atomic rename task updates the registry's native-name mapping,
the source file, and the installer's catalog entry (if the catalog references the agent by name)
in the same commit. After each rename the installer no longer distributes the old name.

**Phase B completion:** When all agents have been renamed, no legacy distribution mapping
remains. The installer then accepts and distributes only `gaia-*` native names. AC-27 is the
final gate for this state.

#### Collision hard stop (observable scopes)
16. When two or more observable-scope files (project or global filesystem) match the effective
    native name of a required agent at equal or higher precedence, the guard outputs a structured
    hard stop. No agent is dispatched. Example:
    ```
    HARD STOP — AGENT IDENTITY COLLISION

    Requested:        gaia.agent.developer.backend
    Expected path:    C:\repo\.claude\agents\gaia-developer-backend.md
    Conflicting:      C:\Users\user\.claude\agents\gaia-developer-backend.md

    No agent was dispatched.
    ```
    Note: an old `project-manager.md` in the global scope does NOT trigger this hard stop after
    Phase B, because its name does not match any `gaia-*` agent's native name.

### Phase B — Atomic Per-Agent Renaming

Phase B begins only after Phase A is complete, all tests pass, and the registry+mapping layer is
proven stable.

17. For each toolkit agent currently carrying a legacy non-namespaced name, a dedicated atomic
    task is created in the Work Breakdown.
18. Each atomic task performs all of the following in a single commit:
    - Rename the source `.md` file in `src/claude/agents/` (e.g. `developer-backend.md` →
      `gaia-developer-backend.md`) and update its `name:` frontmatter field to match.
    - Update all consumers of the old name: workflow scripts (`pm-phase1.js`, `pm-phase2.js`,
      `pm-phase3.js`, `am-phase1.js`, `am-phase2.js`), skill files (`implement-feature/SKILL.md`,
      `assess-codebase/SKILL.md`, `hi-gaia/SKILL.md`), other agent files that reference the name,
      hardcoded entries in `SCOPE_AGENT_MAP` (am-phase1.js), and all test files.
    - Update the registry's native-name mapping entry and the installer's catalog entry for the
      renamed agent so the old name is no longer distributed.
    - Run `npm test` to verify nothing breaks.
    The entire rename and all its consequences are committed atomically.

19. The legacy `agent_type` values in Work Breakdowns (`developer-backend`, `developer-frontend`,
    `developer-testing`) continue to resolve correctly throughout and after renaming via the
    explicit registry mapping — they are never passed directly to the platform.

20. At Phase B completion: all globally-distributed toolkit agents carry `gaia-*` names;
    the installer no longer contains any legacy distribution mapping; AC-27 is satisfied.

#### Assessment pipeline during Phase B
21. Each atomic rename task includes updating `am-phase1.js` (including `SCOPE_AGENT_MAP` for
    renamed assessment agents) and `am-phase2.js` so the assessment pipeline continues to work
    correctly after every individual rename. Only the full adoption of the provenance guard in
    the assessment pipeline is deferred to a later feature — not the post-rename compatibility
    updates.

### CLI standalone flows
- `ai-toolkit agents list --project <dir> --format json` — enumerates registered toolkit
  identities and availability; never includes foreign or user-owned agents.
- `ai-toolkit agents resolve --project <dir> --id <canonical-id>` — diagnostic; exits 0, may
  return `hash-unverifiable`.
- `ai-toolkit agents resolve --project <dir> --id <canonical-id> --require-verified` —
  operational; exits non-zero if status is not `"verified"`.
- `ai-toolkit agents preflight --project <dir> --pipeline implement-feature` — operational;
  uses `--require-verified` semantics internally; hard-stops on any unverified or missing agent.
- `ai-toolkit doctor agents --project <dir>` — read-only diagnostic; reports each agent with one
  status from: `verified` / `conflict` / `hash-unverifiable` / `unobservable` / `not-installed` /
  `not-applicable`; never blocks or modifies files.
- `ai-toolkit agents cleanup --project <dir> [--dry-run]` — **read-only only in FTR-017**; lists
  stale toolkit assets attributable with certainty to old installations that appear in the
  manifest; any mutating flag (e.g. `--delete`, `--force`) is rejected as unsupported; actual
  removal is entirely deferred; files not in the manifest are never even proposed as candidates.

## Out of Scope
- Full runtime implementation of Codex and GitHub Copilot adapters (contractual interfaces and
  fixtures are in scope; working adapters are not).
- Full adoption of the provenance guard in the assessment pipeline (`am-phase1.js`, `am-phase2.js`).
- Task Checkpoints and Resume; task-by-task execution; per-task commit.
- Parallel worktrees and `maxConcurrency > 1`.
- Automatic deletion of user-owned agents.
- Modification of personal configuration files without an explicit operator command.
- Fuzzy matching of agent roles; automatic fallbacks to semantically similar agents.
- Functional redesign of developer agents.
- Replacement of the Execution Ledger (FTR-016).
- Full v2 multiplatform migration.
- Bulk non-atomic renaming of agent files.
- Technical enforcement preventing toolkit-external invocations of legacy orchestrators.
- A CLI API for enumerating plugin-scope or session-scope agents.
- Actual deletion or trash-move of stale installer artifacts (dry-run listing only in FTR-017).

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Agent ID not found in the registry | Hard stop; structured error; no fallback |
| Requested platform not supported | Hard stop; supported platforms listed |
| Two observable-scope files share the same effective native name at equal/higher precedence | Collision HARD STOP; both paths reported; no dispatch until resolved |
| Old global `project-manager.md` is present; its name does not match any required toolkit agent | Reported by `doctor agents` as foreign; does NOT block dispatch |
| Agent exists only in a non-observable scope | `unobservable` WARNING; no operational block; `gaia-*` namespacing is the mitigation |
| Concrete evidence of a plugin/session collision | HARD STOP; structured error; dispatch blocked |
| Manifest missing | Preflight HARD STOP; pipeline does not start |
| Manifest v0.12.0 format (no `fileHashes`) | `doctor agents`: `hash-unverifiable` status; `agents resolve` (no flag): exits 0 with status; `agents resolve --require-verified`, `agents preflight`, workflow dispatch: HARD STOP with remediation "reinstall or upgrade" |
| Manifest present with `fileHashes`; hash mismatch on disk | `resolveAgent` returns error; `--require-verified` exits non-zero; dispatch blocked |
| Manifest corrupt | Preflight HARD STOP; pipeline does not start |
| Agent version incompatible with orchestrator version | Hard stop before dispatch |
| Work Breakdown contains unknown `agent_type` | Rejected with error; not passed to the platform |
| Work Breakdown contains `developer-database` | Resolved via explicit mapping to `gaia.agent.developer.backend`; deprecation warning emitted |
| Work Breakdown contains legacy `agent_type` values | Resolved to canonical ID; deprecation warning emitted |
| `pm-phase3` absent from installed runtime | Hard stop; remediation described; no alternative orchestrator |
| `ledger open` for preflight activity fails | Preflight does not run; pipeline does not start |
| `ledger close`/`fail` for preflight fails | Pipeline hard-stops |
| `ledger open` for Tier 1 dispatch fails | Workflow not dispatched |
| `ledger close`/`fail` for Tier 1 dispatch fails | Pipeline hard-stops |
| Workflow Tier 3 `ledger open` fails | Workflow aborts immediately |
| `ledger open` with whitelisted metadata, first open | Metadata stored; reserved fields unchanged |
| Idempotent `ledger open`, SAME metadata | No-op; all fields preserved |
| Idempotent `ledger open`, DIFFERENT metadata | HARD STOP; no write; error reports conflict |
| `ledger open` with unknown metadata key | Rejected before any write; non-zero exit |
| `ledger close` or `ledger fail` on entry with metadata | Metadata preserved verbatim; only status/timestamps/error updated |
| Workflow invokes `agents resolve` without `--require-verified` | Static test fails; commit blocked |
| Workflow file imports `lib/agent-registry` | Static test fails; commit blocked |
| `agents resolve` without `--require-verified` on v0.12.0 manifest | Exits 0; returns `hash-unverifiable` status |
| `agents resolve --require-verified` on v0.12.0 manifest | Non-zero exit; HARD STOP; structured error |
| Fresh install using FTR-017 installer | Manifest contains both `files` and `fileHashes`; `set(files) == set(keys(fileHashes))` |
| `agents cleanup` invoked with a mutating flag (e.g. `--delete`) | Command rejected with error; no file modified |
| `agents cleanup` encounters a file not in the toolkit manifest | File is never proposed as a candidate; only manifest-listed toolkit files are listed |
| Per-agent rename task breaks a consumer | `npm test` fails; commit not made until everything is consistent |
| Path contains spaces (Windows) | All CLI invocations quote correctly; no path splitting |
| Upgrade from v0.12.0 (no `fileHashes`) to v0.13.0 (with `fileHashes`) | Old renamed/orphaned files handled by existing orphan/trash mechanism; new manifest contains `files` with current payload only and `fileHashes` with exactly one key per `files` entry; `set(files) == set(keys(fileHashes))`; `doctor agents` transitions from `hash-unverifiable` to `verified` |
| am-phase1.js `SCOPE_AGENT_MAP` stale after Phase B rename | The atomic rename task has already updated `SCOPE_AGENT_MAP`; this state cannot occur after a valid Phase B commit |

## Data Model
N/A — internal/technical feature

Two schema extensions are introduced:

### Manifest Extension (backward-compatible)

The `files: string[]` field is **unchanged**. A new sibling field `fileHashes` is added.

**Vocabulary distinction:**
- `manifest.installationMode`: `"local"` (project-level install) | `"global"` (global install).
  This is the existing FTR-015 enum, confirmed in `bin/cli.js` lines 1626 and 1661.
- Registry `resolutionScope`: `"project"` (agent found in `{projectDir}/.claude/agents/`) |
  `"global"` (agent found in `{homeDir}/.claude/agents/`).
  These are semantically equivalent to `installationMode` `"local"` and `"global"` respectively,
  but use different vocabulary to distinguish the manifest field from the resolution record field.
  Callers must not assume they are interchangeable.

Before (v0.12.0):
```json
{
  "version": "0.12.0",
  "installedAt": "...",
  "installationMode": "local",
  "files": [".claude/agents/developer-backend.md"]
}
```

After (v0.13.0+):
```json
{
  "version": "0.13.0",
  "installedAt": "...",
  "installationMode": "local",
  "files": [".claude/agents/gaia-developer-backend.md"],
  "fileHashes": {
    ".claude/agents/gaia-developer-backend.md": "sha256:abc123..."
  }
}
```

Invariant: `set(files) == set(keys(fileHashes))` on every write.

`writeManifest()` is extended with a fourth `fileHashes` parameter. Every FTR-017 production
install path must pass this argument; omitting it is permitted only in test fixtures that
deliberately simulate legacy manifests.

### Ledger Entry Extension (backward-compatible) and Safety Invariants

The FTR-016 `open()` function is extended with an optional `metadata` object (seventh argument).
The CLI `ledger open` command gains optional identity flags:
`--agent-id <id>`, `--native-name <name>`, `--toolkit-version <ver>`, `--scope <scope>`,
`--hash <sha256>`

**Whitelisted metadata keys** (the only keys accepted — any other key causes rejection before any
write):

| Metadata key | Type | Purpose |
|---|---|---|
| `agentId` | string | Canonical namespaced ID |
| `nativeAgentName` | string | Platform file/asset name |
| `platform` | string | e.g. `claude` |
| `toolkitVersion` | string | Resolved toolkit version |
| `resolutionScope` | string | `project` or `global` |
| `definitionHash` | string | `sha256:<hex>` |

**Reserved fields** (never overwritten by metadata):
`operation_id`, `agent`, `phase`, `model`, `status`, `started_at`, `completed_at`,
`phase_delta_tokens`. Any metadata input targeting a reserved field is rejected before any write
with a non-zero exit code.

**Safety invariants for `open()`:**
- On first open: whitelisted metadata fields stored alongside standard fields.
- Idempotent re-open, **same** metadata: no-op; all fields preserved.
- Idempotent re-open, **different** metadata values for any previously-stored key: **HARD STOP**;
  non-zero exit; structured error identifying the conflicting key and values; no write.
- `close()` and `fail()` update only `status`, `completed_at`, and optionally `error` or
  `phase_delta_tokens`; all other fields — including metadata — are preserved verbatim.

Old callers that do not pass the metadata argument receive unchanged behavior. Old entries without
metadata fields survive all updates without data loss. No dual-write or parallel ledger introduced.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | The feature ships | The canonical catalog is inspected | Every toolkit agent has a unique, namespaced canonical ID (e.g. `gaia.agent.developer.backend`) | Must |
| AC-02 | Any orchestrator or Work Breakdown file | It references an agent | It uses a canonical ID or a declared legacy mapping; no bare platform name is used as a contract | Must |
| AC-03 | `lib/agent-registry.js` | Static analysis | Resolution logic is implemented entirely in JavaScript; no LLM is involved in selecting a candidate | Must |
| AC-04 | `resolveAgent()` with `--require-verified` for a valid agent with a v0.13.0+ manifest and matching hash | The call runs | Exit code is 0; the returned record has `status: "verified"` and all required identity fields | Must |
| AC-05 | `resolveAgent()` is called for an ambiguous or missing agent | The call runs | It returns a non-zero exit code with a structured error; no fuzzy match or fallback | Must |
| AC-06 | A developer uses the toolkit | They start the feature delivery pipeline through the toolkit | `/implement-feature` is the toolkit-supported entry point; the SKILL.md enforces the registry guard and ledger contract before each workflow dispatch | Must |
| AC-07 | Gate 2 is approved | The skill proceeds to implementation | Only the `pm-phase3` workflow that returns `status: "verified"` from `agents resolve --require-verified` is dispatched; its `nativeName` is used for `agentType` | Must |
| AC-08 | `pm-phase3` is absent from the installed runtime | The skill attempts to proceed after Gate 2 | Hard stop; remediation described; no alternative dispatch | Must |
| AC-09 | Old global agents (e.g. `project-manager.md`) are present | Preflight and `doctor agents` run | Only agents whose effective native name matches a required toolkit agent name at equal or higher precedence in an observable scope trigger a HARD STOP; a foreign file with a different name does NOT block dispatch; it is reported by `doctor agents` as foreign | Must |
| AC-10 | Two observable installations provide agents with the same effective native name | Preflight runs | Collision reported with both paths; pipeline does not start until resolved | Must |
| AC-11 | An installed agent file is inspected after a v0.13.0+ install | After a successful preflight | The manifest carries `fileHashes` with a SHA-256 for each installed file; `set(files) == set(keys(fileHashes))`; the recorded hash matches the file on disk | Must |
| AC-12 | An installed agent file is modified after installation (hash mismatch) | `resolveAgent` or preflight runs | File reported as unverified; `--require-verified` exits non-zero; dispatch blocked | Must |
| AC-13 | `ai-toolkit doctor agents --project <dir>` is invoked | The command runs | Output includes: registered toolkit agents, scope and provenance path, version and integrity, collisions, foreign observable agents, legacy references, remediation. Each agent reported with exactly one status from: `verified` / `conflict` / `hash-unverifiable` / `unobservable` / `not-installed` / `not-applicable` | Must |
| AC-14 | `doctor agents` runs | Any conditions | No file is modified, created, or deleted | Must |
| AC-15 | `ai-toolkit agents cleanup --project <dir>` is invoked | The command runs | Dry-run output is produced listing stale manifest-attributed toolkit assets only; no file is modified or deleted; any mutating flag is rejected as unsupported with a non-zero exit | Must |
| AC-16 | `agents cleanup` processes the candidate list | Any mode | Files not present in the toolkit manifest are never proposed as deletable candidates; only manifest-listed toolkit files that appear stale are listed | Must |
| AC-17 | The runtime assets are installed and inspected | Static analysis of all installed toolkit files | No file references `/agent-project-manager`; `hi-gaia/SKILL.md` does not list `project-manager` or `assessment-manager` as spawnable; `implement-feature/SKILL.md` does not use the label `project-manager/pm-phase3`; all entry-point references use canonical names | Must |
| AC-18 | A future change introduces `/agent-project-manager`, `subagent_type: project-manager`, `agentType: project-manager`, or `assessment-manager` as a legacy orchestrator reference | CI runs | A static test fails and blocks the merge | Must |
| AC-19 | Preflight runs before pm-phase1 | `/implement-feature` executes | A ledger entry `agent: "agent-preflight:implement-feature"` is opened before the check; on pass it is closed; on failure (including hash-unverifiable) it is failed with error; if `ledger open` returns non-zero, preflight does not run | Must |
| AC-20 | A workflow is about to be dispatched | Tier 1 guard runs | A ledger entry for the dispatch is opened with whitelisted identity metadata before the `subagent_type` call; if `ledger open` returns non-zero, dispatch does not proceed | Must |
| AC-21 | A ledger entry is opened by the Tier 1 guard with identity metadata | Entry inspected on disk | Contains standard FTR-016 fields plus whitelisted metadata keys; reserved fields unchanged; old entries survive any update without data loss | Must |
| AC-22 | `ledger close` or `ledger fail` for a dispatch entry fails | Workflow has returned | Pipeline hard-stops; error not swallowed | Must |
| AC-23 | Complete agent-type inventory is produced | Phase A is complete | Every agent type the toolkit declares or accepts is documented with its canonical ID mapping; covers at minimum: `developer-backend`, `developer-frontend`, `developer-testing`, `developer-database`, `review-solution` | Must |
| AC-24 | `developer-database` is processed | Any pipeline run | Resolved via explicit registry mapping to `gaia.agent.developer.backend` with deprecation warning; `generate-work-breakdown.md` no longer lists `developer-database` as a valid new value to produce; no `developer-database.md` agent file is created; the value is never passed to the platform unresolved | Must |
| AC-25 | Work Breakdown contains unknown `agent_type` | Registry processes | Each unknown value rejected with structured error; pipeline does not start | Must |
| AC-26 | Work Breakdown contains legacy `agent_type` values | Registry processes | Each resolves to exactly one canonical ID via explicit mapping; deprecation warnings emitted; never passed directly to the platform | Must |
| AC-27 | Phase B is complete and the global installer runs | `~/.claude/agents/` inspected | Contains only registered, namespaced (`gaia-*`) agent files; no legacy-named file present; no legacy distribution mapping remains | Must |
| AC-28 | The test suite runs | Any test | No test reads from or writes to the real user home directory; temporary home used for all scope and collision tests | Must |
| AC-29 | Temporary home contains `project-manager.md` from an old tool | E2E suite runs | `doctor agents` reports it as foreign; registry does not associate it with any toolkit ID; after Phase B no name collision exists with `gaia-*` agents; pipeline does not stop for this file | Must |
| AC-30 | `lib/agent-registry.js` and the provenance guard | Inspected for imports | Do not import Claude API or Claude-Code-specific modules; core is platform-agnostic | Must |
| AC-31 | Workflow invokes `agents resolve --require-verified` for an agent with a v0.13.0+ manifest and matching hash | Command runs | Exit code 0; `status: "verified"`; workflow uses only returned `nativeName` for dispatch | Must |
| AC-32 | Codex and Copilot adapter interfaces | Inspected | Documented interface contracts exist; contract tests verify input/output shape without a working runtime | Must |
| AC-33 | Non-observable scope (plugin or session) exists; no concrete inventory available | Preflight or `agents preflight` runs | `unobservable` WARNING in output; dispatch NOT blocked; `gaia-*` naming documented as mandatory mitigation | Must |
| AC-34 | Phase B begins | Phase A test suite is green | Each toolkit agent with a legacy non-namespaced name has a scheduled atomic rename task | Must |
| AC-35 | An atomic Phase B rename task runs | A single agent is renamed | Single commit updates: source file name and frontmatter `name:`; all consumers (`am-phase1.js`, `am-phase2.js`, `SCOPE_AGENT_MAP`, `implement-feature/SKILL.md`, `assess-codebase/SKILL.md`, `hi-gaia/SKILL.md`, other agent files, test files); registry native-name mapping; installer catalog entry; `npm test` passes | Must |
| AC-36 | Phase B is complete | `ls src/claude/agents/` runs | No toolkit agent file carries a legacy non-namespaced name; feature not marked complete until this is met | Must |
| AC-37 | Phase B is complete | Existing WBs with legacy `agent_type` values processed | Continue to resolve correctly via explicit registry mapping; no WB update required | Must |
| AC-38 | Installer runs for a v0.13.0+ install | Manifest is written | Manifest contains `files: string[]` (unchanged structure) AND `fileHashes: { [path]: "sha256:<hex>" }`; `set(files) == set(keys(fileHashes))`; hash for each path matches the installed file; every production install path passes `fileHashes` — no accidental hash-free manifests | Must |
| AC-39 | A v0.12.0 manifest (no `fileHashes`) is present | `agents resolve --require-verified`, `agents preflight`, or any workflow dispatch runs | HARD STOP; no agent dispatched; error instructs user to reinstall; `agents resolve` without `--require-verified` and `doctor agents` may still run and report `hash-unverifiable` without blocking | Must |
| AC-40 | Upgrade test from v0.12.0 (no `fileHashes`) to v0.13.0 | After upgrade install | `files` contains the CURRENT payload after normal orphan cleanup (old renamed/orphaned files removed via existing trash mechanism); `fileHashes` contains exactly one key per `files` entry; `set(files) == set(keys(fileHashes))`; no stale entries remain in either field; `doctor agents` transitions from `hash-unverifiable` to `verified` | Must |
| AC-41 | `ledger open` invoked with whitelisted metadata flags | CLI test exercises all safety invariants | (a) First open: metadata stored, reserved fields unchanged; (b) idempotent re-open same metadata: no-op; (c) idempotent re-open different metadata: non-zero exit, no write; (d) unknown metadata key: rejected before any write, non-zero exit; (e) `close`/`fail`: metadata preserved, only status/timestamps/error updated | Must |
| AC-42 | Workflow `.js` files are inspected | Static tests run | (a) No file contains `require('../lib/agent-registry')` or any direct import of the registry module; (b) every `agents resolve` invocation in workflow files includes `--require-verified` | Must |

## MVP vs Deferred

### MVP — Phase A: Registry, Guard, CLI, Ledger Integration, Manifest Hashes, Legacy Fixes (must ship first)
- `lib/agent-registry.js`: canonical catalog; `resolveAgent()` (returns `"verified"` only from
  v0.13.0+ manifests with matching hashes); `validateAgentSet()`; `listRegisteredAgents()`;
  provenance guard; platform-agnostic core; Claude adapter.
- Canonical IDs and namespace for all current toolkit agents.
- Full agent-type inventory; `developer-database` mapped to `gaia.agent.developer.backend` with
  deprecation warning; removed from generator's new-value list; no new agent file created.
- Explicit, versioned, tested legacy `agent_type` mapping (no fuzzy matching).
- Manifest hash evolution: `writeManifest()` extended with fourth `fileHashes` parameter; every
  production install path passes hashes; `set(files) == set(keys(fileHashes))` enforced on write;
  `computeFileSha256()` added to `bin/cli.js`; `fileHash()` (MD5) retained; all existing
  `manifest.files` readers unchanged.
- Operational hard stop on v0.12.0 manifest (no `fileHashes`) via `--require-verified`.
- `ai-toolkit agents list`, `agents resolve` (diagnostic and `--require-verified` forms),
  `agents preflight`, `doctor agents` (read-only, full status vocabulary),
  `agents cleanup` (dry-run-only; mutating flags rejected).
- Preflight integration in `/implement-feature` (SKILL.md): ledger activity
  `agent-preflight:implement-feature` opened/closed/failed; fail-closed.
- Tier 1 guard in `/implement-feature`: ledger entry with whitelisted metadata opened before each
  pm-phase1/2/3 dispatch; fail-closed.
- Tier 2 guard in `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`: invoke
  `ai-toolkit agents resolve --require-verified`; check exit code; use returned `nativeName`.
  No direct import of `lib/agent-registry.js`.
- Tier 3 self-registration in each workflow: `ledger open` for self at startup; fail-closed.
- Backward-compatible `open()` extension: whitelist; reserved-field protection; idempotent
  re-open with conflicting metadata → HARD STOP; `close`/`fail` preserve metadata.
- Catalog-driven installer: Phase A registers legacy native names as **transitional** (not
  `gaia-*` only); `gaia-*`-only enforcement is completed at Phase B end.
- Removal of all legacy orchestrator references from ALL runtime assets.
- Static tests: no `require('../lib/agent-registry')` in workflow files; all `agents resolve`
  calls in workflow files use `--require-verified`; no legacy orchestrator references.
- Contractual interfaces and fixtures for Codex and Copilot adapters.
- Unit tests, integration tests, E2E tests (foreign `project-manager` regression; upgrade from
  v0.12.0 manifest).
- Collision detection and hard-stop output (observable scopes).
- `unobservable` WARNING for non-observable scopes; no hard stop on theoretical possibility.

### MVP — Phase B: Atomic Per-Agent Renaming (must ship; begins only after Phase A is green)
- One atomic task per toolkit agent: rename source file and frontmatter, update all consumers
  (`am-phase1.js`, `am-phase2.js`, `SCOPE_AGENT_MAP`, `hi-gaia/SKILL.md`,
  `implement-feature/SKILL.md`, `assess-codebase/SKILL.md`, tests), update registry mapping
  and installer catalog entry, verify `npm test` passes — all in one commit.
- Sequence: one agent at a time; no bulk rename.
- At Phase B completion: installer distributes only `gaia-*` names; no legacy distribution
  mapping remains; AC-27 satisfied; feature not marked complete until this point.
- Legacy `agent_type` mapping remains active throughout Phase B and beyond.
- Assessment pipeline remains working after every individual rename; full provenance guard
  adoption in the assessment pipeline is deferred.

### Deferred (explicitly later features)
- Full runtime implementations of Codex and Copilot adapters.
- Full adoption of the provenance guard in `am-phase1.js` and `am-phase2.js`.
- Task Checkpoints and Resume; per-task execution; commit per task; parallel worktrees.
- `maxConcurrency > 1`.
- Actual file removal / trash-move in `agents cleanup`.
- Automated repair of consumer projects using old agent names.
- CLI API for enumerating plugin-scope or session-scope agents.

## Open Questions
None. All gaps identified during definition and all blocking points raised across three review
rounds have been resolved before this version was written.

Key decisions:
- Physical agent renaming: in scope as Phase B (one task per agent; all consumers and installer
  mapping in same atomic commit; assessment pipeline consumers included; AC-27 is final gate).
- FTR-016 available: merged to develop (commit df54a91, PR #68).
- Ledger: real `open/close/fail` contract; backward-compatible whitelisted metadata extension
  with explicit safety invariants.
- Manifest: `files: string[]` unchanged; `fileHashes` parallel field; `set(files)==set(keys(fileHashes))`
  invariant; every production install path passes hashes; v0.12.0 → HARD STOP on `--require-verified`.
- `agents resolve` modes: diagnostic (no flag, may return `hash-unverifiable`, exit 0) vs
  operational (`--require-verified`, hard-stop on non-verified); workflows always use operational.
- `installationMode`: existing enum `"local" | "global"` (unchanged); `resolutionScope` in
  registry uses `"project" | "global"` — explicitly documented as a distinct vocabulary.
- `agents cleanup`: dry-run-only in FTR-017; mutating flags rejected; non-manifest files not
  proposed; actual removal deferred.
- Installer transition: Phase A registers legacy names as transitional; each Phase B rename
  removes one legacy mapping; Phase B completion = `gaia-*` only.
- Enforcement boundary: toolkit-managed paths only; toolkit-external invocations are a
  documented residual limit.
- Non-observable scopes: `unobservable` WARNING only; hard stop only on concrete evidence.
- Static tests enforce `--require-verified` in workflow files and ban direct registry imports.
- Full legacy reference inventory covers all five affected files.
- `developer-database`: explicit mapping → `gaia.agent.developer.backend` with deprecation
  warning; removed from generator's new-value list; no new agent created.
- Old foreign `project-manager.md`: flagged by `doctor agents`; blocks only if its native name
  collides with a required toolkit agent in an observable scope.

## Dependencies and Assumptions

- **FTR-015 (available):** `lib/asset-catalog.js`, `resolveClaudeRuntimeAsset()`, the manifest
  written by `writeManifest()`, and `doctor resolution` are all present. The `manifest.installationMode`
  field uses `"local" | "global"` (confirmed in `bin/cli.js` lines 1626 and 1661). FTR-017
  extends `writeManifest()` to accept an optional fourth `fileHashes` parameter; all existing
  callers that omit it receive unchanged behavior; the `files: string[]` structure is never
  modified.
- **FTR-016 (available, commit df54a91):** `lib/execution-ledger.js` and the `ai-toolkit ledger
  open|close|fail|skip` CLI facade are stable. FTR-017 extends `open()` with an optional seventh
  `metadata` argument and the CLI with optional identity flags; safety invariants enforced before
  any write; old callers unchanged; old ledger entries survive all updates.
- **Module location:** `lib/agent-registry.js` is a capability of the `ai-toolkit` npm CLI,
  not a Claude runtime asset. Workflow scripts access it exclusively via
  `ai-toolkit agents resolve --require-verified`.
- **Vocabulary distinction:** `manifest.installationMode` (`"local" | "global"`) vs registry
  `resolutionScope` (`"project" | "global"`). These are semantically equivalent pairs but use
  different vocabularies; callers must not conflate them.
- **No LLM in the resolution path:** all registry and guard logic is pure JavaScript.
- **Non-observable scopes:** `unobservable` WARNING; `gaia-*` namespacing is the mandatory
  mitigation; hard stop only on concrete collision evidence.
- **Backward compatibility:** existing Work Breakdowns with legacy `agent_type` values continue
  via explicit mapping throughout and beyond Phase B.
- **Phase B ordering:** atomic rename tasks start only after Phase A is green; each commit covers
  file, frontmatter, all consumers, installer catalog entry, and tests.
- **Every production `writeManifest` call passes `fileHashes`:** no fresh install may produce a
  hash-free manifest; omitting the parameter is permitted only in test fixtures simulating legacy.
- **`npm test` is the verification command** after any change.
- **Tests use a temporary home directory** for all scenarios involving global-scope agent files.
- **`computeFileSha256()`** (SHA-256) added to `bin/cli.js` and exported via the `require.main`
  guard; `fileHash()` (MD5) retained.
- **Must precede:** Task Checkpoints and Resume; Isolated Parallel Task Execution.
