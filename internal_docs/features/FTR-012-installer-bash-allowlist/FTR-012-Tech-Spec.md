# Technical Specification — Installer Bash Allowlist

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-012 — Installer Bash Allowlist |
| Version | 1.0 |
| Date | 2026-07-30 |
| Status | Draft |

---

## 1. Overview

FTR-012 extends the `install-toolkit` agent with a new opt-in Step 6 that creates or merges a Bash permission allowlist into `.claude/settings.local.json` in the destination project. The allowlist pre-approves safe read-only and git inspection commands (`ls`, `git status`, `git log`, `npm test`, `dotnet build`, etc.) so that pm-phase3 worker agents can orient themselves in the repo without stalling the pipeline on confirmation prompts. Dangerous commands (git push, PR creation, rm, reset, clean) remain on the `ask` list and always surface a human prompt.

The core logic is implemented as a pure function `mergeAllowlist(destDir)` in `bin/cli.js`, exported via the `require.main` guard and invoked by the installer via a new CLI entry point `node bin/cli.js merge-allowlist <dest>`. The function is unit-tested in `tests/cli/mergeAllowlist.test.js` following the FTR-010/FTR-011 pattern for deterministic installer operations.

The feature is opt-in: the user is offered a confirmation prompt at Step 6 of the installer. If the user declines, no file is written and installation continues. If accepted, the installer invokes the CLI, checks `.gitignore`, and reports the result in the final Step 7 summary.

---

## 2. Architecture

### 2.1 System Context

The feature operates within the AI Toolkit installer workflow:

1. **Triggering point:** `install-toolkit` agent (Step 6, new)
2. **Core operation:** Pure function `mergeAllowlist(destDir)` in `bin/cli.js`
3. **CLI entry point:** `node bin/cli.js merge-allowlist <dest>` (new)
4. **Destination files written:**
   - `.claude/settings.local.json` (created or merged)
   - `.gitignore` (line appended if needed)

The feature integrates with existing installer infrastructure:
- `bin/cli.js` (FTR-010, FTR-011): pure functions, `require.main` guard, unit tests
- `install-toolkit.md` agent: orchestrates the steps
- `.gitignore` management: idempotent append logic

### 2.2 Component Diagram

```
[install-toolkit agent]
    ↓
[Step 6 opt-in prompt]
    ↓
[User confirms Yes/No]
    ├─ No → skip silently, continue to Step 7
    └─ Yes → invoke CLI
        ↓
    [node bin/cli.js merge-allowlist <dest>]
        ↓
    [mergeAllowlist(destDir) pure function]
        ├─ Read existing settings.local.json (or create new)
        ├─ Fuse canonical allow/ask with existing entries
        ├─ Enforce ask-beats-allow priority
        └─ Write merged result back
        ↓
    [CLI exit code check]
        ├─ Success (0) → continue to .gitignore check
        └─ Failure → report in Step 7
        ↓
    [Check/append .gitignore]
        └─ Add `.claude/settings.local.json` if missing
        ↓
    [Return to Step 7 report]
```

### 2.3 Sequence Diagrams

#### Happy Path: New Project (No Existing Settings)

```
install-toolkit agent
    ↓ (Step 6)
Offer allowlist opt-in prompt
    ↓ (User selects Yes)
Call: node bin/cli.js merge-allowlist /path/to/dest
    ↓
mergeAllowlist(/path/to/dest)
    ├─ Check: .claude/settings.local.json exists? → NO
    ├─ Load canonical allow/ask lists
    ├─ Create new settings.local.json with canonical content
    ├─ Write file
    └─ Return: { status: 'written' }
    ↓
CLI exit code: 0
    ↓
Check .gitignore
    ├─ Read .gitignore (or create if missing)
    ├─ Search for `.claude/settings.local.json`
    ├─ Line not found → append it
    ├─ Write .gitignore
    └─ Return: { status: 'written' }
    ↓
Report in Step 7: "Allowlist: written"
```

#### Path: Existing Project with User Rules

```
install-toolkit agent
    ↓ (Step 6)
User selects Yes
    ↓
mergeAllowlist(/path/to/dest)
    ├─ Check: .claude/settings.local.json exists? → YES
    ├─ Parse existing file: { permissions: { Bash: { allow: [...user rules...], ask: [...] } } }
    ├─ Load canonical lists
    ├─ Merge logic:
    │   ├─ allow = dedup_union(existing.allow, canonical.allow)
    │   ├─ ask = dedup_union(existing.ask, canonical.ask)
    │   └─ ask-beats-allow: for each cmd in both allow and ask → remove from allow
    ├─ Preserve all other sections of settings.local.json
    ├─ Write merged result
    └─ Return: { status: 'merged', preserved: N }
    ↓
Report: "Allowlist: merged (N rules preserved)"
```

#### Path: Malformed JSON

```
mergeAllowlist(/path/to/dest)
    ├─ Try JSON.parse() on existing file
    ├─ Catch: JSON.SyntaxError
    ├─ Log: "Warning: settings.local.json is not valid JSON; resetting to default"
    ├─ Write canonical lists to fresh settings.local.json
    ├─ Return: { status: 'reset', reason: 'malformed' }
    ↓
Installer reports: "Allowlist: reset (file was malformed)"
```

---

## 3. Backend

### 3.1 Data Model

**Canonical Bash Permission Lists**

Stored in `bin/cli.js`, these are fixed arrays used as the baseline for all destinations:

```javascript
const CANONICAL_ALLOW = [
  'ls', 'dir', 'cat', 'head', 'tail', 'find', 'grep', 'rg', 'wc', 'echo',
  'pwd', 'which', 'date',
  'git status', 'git diff', 'git log', 'git show', 'git branch', 'git rev-parse',
  'git add', 'git commit',
  'dotnet build', 'dotnet test', 'dotnet restore',
  'npm test', 'npm run build',
];

const CANONICAL_ASK = [
  'git push', 'gh pr create', 'rm', 'del',
  'git checkout', 'git reset', 'git clean',
];
```

**Settings Local JSON Structure**

The `.claude/settings.local.json` file uses the Claude Code permissions schema:

```json
{
  "permissions": {
    "Bash": {
      "allow": ["Bash(ls:*)", "Bash(git status:*)", ...],
      "ask": ["Bash(git push:*)", "Bash(gh pr create:*)", ...]
    }
  }
}
```

Each permission is formatted as `Bash(<cmd>:*)` for commands with arguments, or `Bash(pwd)` for commands with no arguments.

**Return Type of `mergeAllowlist()`**

```javascript
// Success cases:
{ status: 'written' }
{ status: 'merged', preserved: N }
{ status: 'skipped', reason: 'already-up-to-date' }
{ status: 'reset', reason: 'malformed' }

// Error cases:
{ status: 'error', message: 'permission denied' }
{ status: 'error', message: 'cannot write to destination' }
```

### 3.2 DTOs / Response Models

N/A — the function returns a simple status object (see 3.1).

### 3.3 Validation

**Input Validation in `mergeAllowlist(destDir)`:**
- `destDir` must be a string representing an existing directory
- File operations catch and report I/O errors gracefully (see error handling below)

**JSON Validation:**
- Existing `settings.local.json` is parsed with try/catch
- If malformed, a warning is logged and the file is reset to canonical

**Deduplication:**
- Arrays are converted to Sets, then back to Arrays
- Order is not preserved (both `allow` and `ask` are normalized)

### 3.4 API Endpoints

N/A — the feature is CLI-driven, not HTTP-based.

However, the CLI entry point signature:

| Field | Value |
|-------|-------|
| Command | `node bin/cli.js merge-allowlist <dest>` |
| Arguments | `<dest>`: absolute or relative path to destination project root |
| Exit code | `0` on success, `1` on fatal error |
| Stdout | Progress messages (copied from existing patterns in `bin/cli.js`) |
| Stderr | Error messages on failure |

### 3.5 Services

**`mergeAllowlist(destDir)` — pure function in `bin/cli.js`**

Signature:
```javascript
function mergeAllowlist(destDir) {
  // 1. Resolve and validate destDir
  // 2. Read existing settings.local.json (if present)
  // 3. Dedup and fuse allow/ask arrays
  // 4. Write merged result
  // 5. Return status object
}
```

Dependencies: **none** (pure function, no injected services).

External I/O:
- Reads from: `{destDir}/.claude/settings.local.json` (if exists)
- Writes to: `{destDir}/.claude/settings.local.json`
- Logs to: `console.log()` / `console.error()` for warnings and diagnostics

### 3.6 Mapping / Transformations

**Canonical List → Permission String Transformation**

Each command in `CANONICAL_ALLOW` and `CANONICAL_ASK` is mapped to a permission string:

```javascript
function commandToPermission(cmd) {
  // 'ls' → 'Bash(ls:*)'
  // 'git status' → 'Bash(git status:*)'
  // No-argument commands like 'pwd' can be formatted as either 'Bash(pwd:*)' or 'Bash(pwd)'
  // (Normalize to 'Bash(<cmd>:*)' for consistency)
  return `Bash(${cmd}:*)`;
}
```

**Existing Settings → Canonical Format Normalization**

When merging, normalize the shape of the merged result to ensure consistency:

```javascript
function normalizeSettings(obj) {
  if (!obj.permissions) obj.permissions = {};
  if (!obj.permissions.Bash) obj.permissions.Bash = {};
  if (!Array.isArray(obj.permissions.Bash.allow)) obj.permissions.Bash.allow = [];
  if (!Array.isArray(obj.permissions.Bash.ask)) obj.permissions.Bash.ask = [];
  return obj;
}
```

**Deduplication and Priority Logic**

```javascript
function mergeArrays(existing, canonical, priority = 'ask') {
  const result = [...new Set([...existing, ...canonical])];
  if (priority === 'ask') {
    // Remove from allow if also in ask
    return result;
  }
  return result;
}

function applyAskBeatsAllow(allow, ask) {
  const askSet = new Set(ask);
  return allow.filter(cmd => !askSet.has(cmd));
}
```

### 3.7 Dependency Registration

N/A — this is not a service-based architecture. The function is a pure function exported from `bin/cli.js` via the `require.main` guard:

```javascript
// In bin/cli.js, at the bottom:
if (require.main === module) {
  main(); // CLI entry point
} else {
  module.exports = {
    // ... existing exports ...
    mergeAllowlist,  // Add this
  };
}
```

The CLI entry point is added to the main `if (require.main === module)` block:

```javascript
async function main() {
  const argv = process.argv.slice(2);
  // ... existing commands ...
  
  if (argv[0] === 'merge-allowlist') {
    const destDir = argv[1];
    if (!destDir) {
      console.error('Error: merge-allowlist requires a destination directory');
      process.exit(1);
    }
    try {
      const result = mergeAllowlist(destDir);
      if (result.status === 'error') {
        console.error(`Error: ${result.message}`);
        process.exit(1);
      }
      console.log(`✔ Allowlist merged: ${result.status}`);
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
}
```

---

## 4. Frontend

N/A — this feature is backend-only.

---

## 5. External Integrations

N/A — the feature does not call external APIs.

---

## 6. Security Considerations

**Sensitive Data:**
- `settings.local.json` contains user-specific permission rules and is gitignored (never committed)
- The file must never be copied during regular toolkit installs (already in `NEVER_COPY` list from FTR-011)
- Write operations use standard Node.js `fs` APIs; file permissions are inherited from the directory

**Input Validation:**
- `destDir` argument is validated as an existing directory
- JSON parsing is wrapped in try/catch to prevent crashes on malformed input
- All file I/O is wrapped in error handlers

**Permission Boundaries:**
- The allowlist is purely advisory — it pre-approves certain commands and pre-asks others
- The feature does NOT execute commands; it only writes configuration
- Dangerous commands remain on the `ask` list and are never auto-approved

**Merge Safety:**
- The merge operation is **idempotent**: re-running `mergeAllowlist` with the same inputs produces the same output
- User-defined rules are preserved and never dropped
- Ask-beats-allow priority ensures no dangerous command can be auto-approved

---

## 7. Database Changes

N/A — there is no database. The feature writes a single configuration file.

---

## 8. Configuration

**New File Created:**
- `.claude/settings.local.json` (gitignored)

**New Entry in `.gitignore`:**
- Line: `.claude/settings.local.json` (appended if missing, idempotent)

**Environment Variables:**
- None

**Feature Flags:**
- None; the feature is always available at install time as an opt-in step

---

## 9. File Inventory

### New files
| Path | Purpose |
|------|---------|
| `tests/cli/mergeAllowlist.test.js` | Unit tests for `mergeAllowlist()` function (Jest) |

### Modified files
| Path | Change description |
|------|-------------------|
| `bin/cli.js` | Add `mergeAllowlist()` pure function; add CLI entry point `merge-allowlist <dest>` to main(); export `mergeAllowlist` via require.main guard |
| `.claude/agents/install-toolkit.md` | Add Step 6 (new) for allowlist opt-in prompt and call to CLI; renumber existing Step 6 → Step 7; update Step 7 (formerly Step 6) to include allowlist status line in the report |
| `.gitignore` (in destination projects) | Append `.claude/settings.local.json` line during install (idempotent) |
| `docs/reference.md` | Add new section "Bash Permission Allowlist" explaining what commands are pre-approved, why dangerous commands stay on ask, and that git checkout is on ask (not auto-approved) |

---

## 10. Testing Strategy

### Unit Tests: `tests/cli/mergeAllowlist.test.js`

**Test Categories:**

1. **Fresh Install (no existing settings.local.json)**
   - Test: creates file from canonical lists
   - Verify: file contains exactly the canonical allow and ask arrays
   - Verify: all commands are formatted as `Bash(<cmd>:*)`

2. **Merge with Existing User Rules**
   - Test: existing allow/ask + canonical lists
   - Verify: result is union (no user rules dropped)
   - Verify: no duplicate commands

3. **Ask-Beats-Allow Priority**
   - Test: command in both existing allow and canonical ask
   - Verify: command appears only in ask, not in allow
   - Verify: no duplicates

4. **Allow-Beats-Ask for Existing Rules**
   - Test: command in both existing ask and canonical allow
   - Verify: command appears only in ask (ask preserved), not in allow

5. **Malformed JSON Reset**
   - Test: existing settings.local.json with invalid JSON
   - Verify: file is reset to canonical lists
   - Verify: function logs warning and returns `{ status: 'reset', reason: 'malformed' }`
   - Verify: no crash

6. **Idempotency**
   - Test: run mergeAllowlist twice with same input
   - Verify: second run produces identical output to first
   - Verify: returns `{ status: 'skipped', reason: 'already-up-to-date' }` on second run (optional optimization)

7. **Preserve Other Settings.local.json Content**
   - Test: existing file with `permissions.Bash` + other sections (e.g., `env`, custom rules)
   - Verify: non-Bash sections are preserved untouched
   - Verify: Bash allow/ask are merged; other fields are left alone

8. **Canonical Lists Validation**
   - Test: verify the canonical allow and ask lists match AC-11 and AC-12 exactly
   - Verify: exact command set (no missing or extra commands)

### Integration Tests (Manual, in install-toolkit agent)

The installer itself is integration-tested via the full `install-toolkit` run:

1. Verify opt-in prompt is shown (Step 6)
2. Verify Step 7 report includes "Allowlist: written" or "merged (N rules preserved)"
3. Verify `.gitignore` contains `.claude/settings.local.json` after install
4. Verify `.claude/settings.local.json` is created and contains expected commands
5. Verify reinstall with same version is idempotent (merge is dedup'ed correctly)

### Coverage Target

All paths in `mergeAllowlist()` must be unit-tested. No specific coverage threshold is enforced (per AGENTS.md, "no coverage threshold is enforced"), but aim for 100% coverage of the happy path and error scenarios.

---

## 11. Implementation Order

1. **Add `mergeAllowlist()` function to `bin/cli.js`**
   - Depends on: nothing
   - Implementation:
     - Define `CANONICAL_ALLOW` and `CANONICAL_ASK` arrays
     - Implement `mergeAllowlist(destDir)` with full merge and validation logic
     - Add CLI entry point `merge-allowlist <dest>` to main()
     - Export via require.main guard

2. **Create unit test file `tests/cli/mergeAllowlist.test.js`**
   - Depends on: 1
   - Implementation:
     - Write test cases covering fresh install, merge, ask-beats-allow, malformed JSON, idempotency
     - Run `npm test` to verify all tests pass

3. **Update `install-toolkit.md` agent**
   - Depends on: 2 (verify CLI works before integrating into agent)
   - Implementation:
     - Add Step 6 (opt-in prompt + CLI invocation + .gitignore check)
     - Renumber existing Step 6 → Step 7
     - Update Step 7 report to include allowlist status line

4. **Update `docs/reference.md`**
   - Depends on: 3
   - Implementation:
     - Add "Bash Permission Allowlist" section
     - Explain what commands are pre-approved
     - Explain why dangerous commands stay on ask
     - Explain git checkout placement and why

5. **Manual testing in a destination project**
   - Depends on: 4
   - Steps:
     - Run `/install-toolkit` in a test project
     - Confirm Step 6 opt-in prompt appears
     - Select Yes and verify `.claude/settings.local.json` is created
     - Verify `.gitignore` is appended
     - Verify Step 7 report shows "Allowlist: written"
     - Reinstall and verify merge is idempotent
     - Verify pm-phase3 worker agents can run `ls`, `git status` without prompts

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| CLI entry point `merge-allowlist` not invoked correctly by installer | Step 6 fails silently; allowlist is never created, defeating the feature purpose | Test the CLI independently; add exit code check in install-toolkit; if non-zero, report "failed — see above" in Step 7 |
| Existing user rules are dropped during merge | Loss of custom configuration; user frustration | Implement strict dedup union logic; add unit tests verifying no user rules are lost; test with realistic fixture data (AC-02) |
| Ask-beats-allow priority is applied incorrectly | Dangerous command ends up in allow list and is auto-executed; security risk | Test ask-beats-allow with explicit test cases (AC-03, AC-04); verify command appears in ask only, not allow |
| Malformed JSON is not handled gracefully | Installer crashes or corrupts existing settings.local.json | Wrap JSON.parse in try/catch; reset to canonical on error; log clear warning; test this scenario explicitly (AC-05) |
| .gitignore already has the line but installer appends it anyway | Duplicate line in .gitignore; minor annoyance | Implement idempotent append (check for existence before appending); test both fresh and existing .gitignore (AC-06, AC-07) |
| User's other settings.local.json sections (e.g., env vars) are lost | Loss of custom configuration; user must reconfigure | Preserve all non-Bash sections when merging; load full file, modify only permissions.Bash, write full file back |
| Settings.local.json is not gitignored after install | File is committed by mistake; exposes local config to the repo | Always append `.claude/settings.local.json` to .gitignore as part of Step 6; if .gitignore doesn't exist, create it |
| Canonical lists become stale or incomplete in future | Workers still stall on commands not in the allowlist; feature stops being useful | Document canonical lists in AC-11 and AC-12; treat them as stable (changes only via feature request); provide clear notes in code |
| Git checkout is on ask but should move to allow in future | Potential incompatibility with future pm-phase3 enhancements | Document in reference.md and feature.md that git checkout is only in main loop, not pm-phase3; mark as open question for future iteration |
| `mergeAllowlist` is called with invalid destination path | Function crashes or writes to wrong location | Validate destDir as existing directory at start of function; return error status if invalid; test with non-existent and invalid paths |

---

## Appendix A — Canonical Command Lists (from AC-11 & AC-12)

**Canonical Allow List (exactly):**
- `ls`
- `dir`
- `cat`
- `head`
- `tail`
- `find`
- `grep`
- `rg`
- `wc`
- `echo`
- `pwd`
- `which`
- `date`
- `git status`
- `git diff`
- `git log`
- `git show`
- `git branch`
- `git rev-parse`
- `git add`
- `git commit`
- `dotnet build`
- `dotnet test`
- `dotnet restore`
- `npm test`
- `npm run build`

**Canonical Ask List (exactly):**
- `git push`
- `gh pr create`
- `rm`
- `del`
- `git checkout`
- `git reset`
- `git clean`

---
