# Functional Requirements — Installer Bash Allowlist

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-012 — Installer Bash Allowlist |
| Version | 1.0 |
| Date | 2026-07-30 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This requirements document specifies the design and implementation of a Bash command permission allowlist feature for the `install-toolkit` agent. The feature eliminates pipeline stalls caused by permission prompts for safe, read-only Bash commands dispatched by pm-phase3 worker agents during long-running workflow executions.

### 1.2 Scope

**In Scope:**
- Design and implementation of a `mergeAllowlist(destDir)` pure function in `bin/cli.js`
- CLI entry point for `node bin/cli.js merge-allowlist <dest>`
- Canonical allow list (read-only + build/test commands for .NET and npm)
- Canonical ask list (dangerous outward-facing commands: push, PR, rm, reset, clean)
- Merge semantics with deduplication, union operations, and ask-beats-allow priority
- Idempotent `.gitignore` handling
- Malformed JSON recovery
- Unit tests in `tests/cli/mergeAllowlist.test.js`
- New opt-in Step 6 in `install-toolkit` procedure
- Documentation in `docs/reference.md`

**Out of Scope:**
- Global `~/.claude/settings.local.json` handling (project-local settings only)
- Stack-specific command detection from `AGENTS.md`
- Runtime hook filtering optimization (OPT-12)
- Auto-upgrade of allowlist without user confirmation on reinstall
- Modifications to committed `settings.json` (only personal `settings.local.json`)
- Granular `npm run` sub-command handling
- Trash/recovery mechanisms for previous settings

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Developer / Installer User | Person running the `install-toolkit` agent; makes the opt-in decision |
| pm-phase3 Worker Agent | Automated agent (developer-backend, developer-testing, review-solution) dispatching safe Bash commands without human supervision |
| install-toolkit Agent | Installs toolkit files into destination project and orchestrates allowlist creation |

## 2. Use Cases

### UC-01: Fresh Installation with Allowlist Opt-In

| Field | Value |
|-------|-------|
| Actor | Developer / Installer User |
| Preconditions | Destination project exists; no `.claude/settings.local.json` present |
| Trigger | User runs `install-toolkit` and confirms the allowlist opt-in prompt |
| Priority | Must |

**Main flow:**
1. Installer completes file copy and version stamp (Steps 1–4)
2. Installer completes Compact Instructions opt-in (existing Step 5)
3. Installer displays opt-in prompt for allowlist
4. User selects "Yes — write allowlist"
5. Installer invokes `node bin/cli.js merge-allowlist <dest>` from toolkit root
6. `mergeAllowlist` creates `{dest}/.claude/settings.local.json` with canonical allow and ask arrays
7. Installer checks `.gitignore` and appends `.claude/settings.local.json` if not present
8. Installer records status "written" in Step 7 report
9. Installer prints summary with allowlist status

**Alternative flows:**
- User selects "No — skip": Step skipped silently; Step 7 reports "skipped (user said No)"

**Error flows:**
- `mergeAllowlist` exits non-zero: Installer reports failure in Step 7; pipeline continues (allowlist is advisory)

**Postconditions:**
- `.claude/settings.local.json` contains the canonical allow and ask arrays
- `.gitignore` contains `.claude/settings.local.json` with no duplicates
- Step 7 report includes allowlist status

### UC-02: Merge Allowlist into Existing Settings

| Field | Value |
|-------|-------|
| Actor | Developer / Installer User |
| Preconditions | Destination project has existing `.claude/settings.local.json` with user-defined permission rules |
| Trigger | User runs `install-toolkit` and confirms the allowlist opt-in prompt |
| Priority | Must |

**Main flow:**
1. Installer completes Steps 1–5 as in UC-01
2. User selects "Yes — write allowlist"
3. `mergeAllowlist` reads existing `{dest}/.claude/settings.local.json`
4. `mergeAllowlist` fuses canonical allow and ask arrays with existing entries
5. Merge preserves all user-defined rules; deduplicates; applies ask-beats-allow priority
6. `mergeAllowlist` writes merged result back to file
7. Installer checks and updates `.gitignore` (idempotent)
8. Installer records status "merged (N existing rules preserved)" in Step 7 report
9. Installer prints summary with allowlist status

**Alternative flows:**
- `settings.local.json` contains invalid JSON: `mergeAllowlist` resets to canonical list, reports "reset (file was malformed)"

**Error flows:**
- Merge operation fails: Installer reports failure in Step 7; pipeline continues

**Postconditions:**
- All user-defined rules are preserved in the result
- Canonical rules are added without dropping existing entries
- Ask-beats-allow priority is enforced
- `.gitignore` is idempotently updated

### UC-03: Ask-Beats-Allow Conflict Resolution

| Field | Value |
|-------|-------|
| Actor | mergeAllowlist function |
| Preconditions | A command appears in both the existing allow list AND the toolkit ask list |
| Trigger | `mergeAllowlist` executes merge logic |
| Priority | Must |

**Main flow:**
1. `mergeAllowlist` reads existing allow and ask arrays
2. `mergeAllowlist` reads canonical allow and ask arrays
3. `mergeAllowlist` identifies overlapping commands (exist in both allow and ask)
4. For each overlap, the command is removed from allow and placed in ask only
5. Result is written back

**Postconditions:**
- Command appears only in ask, not in allow
- No duplicates in either array

### UC-04: Reinstall with Idempotent Merge

| Field | Value |
|-------|-------|
| Actor | Developer / Installer User |
| Preconditions | Destination project was previously installed with FTR-012 allowlist |
| Trigger | User runs `install-toolkit` again with same toolkit version |
| Priority | Must |

**Main flow:**
1. Installer displays opt-in prompt
2. User selects "Yes — write allowlist"
3. `mergeAllowlist` reads existing settings (which already contain canonical rules)
4. Merge deduplicates and applies priorities
5. Result is identical to previous run (no duplicate entries)
6. Installer records status "merged (N existing rules preserved)" or "skipped (already up to date)" in Step 7

**Postconditions:**
- No duplicate entries in allow or ask arrays
- Idempotent behavior confirmed

### UC-05: `.gitignore` Creation and Idempotent Update

| Field | Value |
|-------|-------|
| Actor | install-toolkit Agent |
| Preconditions | Allowlist file is written; `.gitignore` may or may not exist |
| Trigger | Installer checks and updates `.gitignore` |
| Priority | Must |

**Main flow:**
1. After `mergeAllowlist` completes, installer checks if `.gitignore` exists
2. If not present, installer creates `.gitignore` with single line: `.claude/settings.local.json`
3. If present, installer checks for existing entry `.claude/settings.local.json`
4. If not found, installer appends the line
5. If found, installer skips (no duplicate)

**Postconditions:**
- `.gitignore` contains exactly one `.claude/settings.local.json` entry
- File exists after this step

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Ask-beats-allow: if a command appears in both allow and ask lists, it must be removed from allow and appear in ask only | UC-02, UC-03 |
| BR-02 | Deduplication: no command shall appear more than once in the allow list or ask list | UC-02, UC-03, UC-04 |
| BR-03 | User-defined rules must never be dropped during merge | UC-02 |
| BR-04 | Invalid JSON in `settings.local.json` triggers a reset to canonical list, not a crash or corruption | UC-02, UC-05 |
| BR-05 | `.gitignore` updates are idempotent: no duplicate `.claude/settings.local.json` lines | UC-02, UC-05 |
| BR-06 | Opt-in prompt is shown on every install run reaching Step 6, even if allowlist already exists | UC-04 |
| BR-07 | Allowlist failure is advisory, not blocking: if `mergeAllowlist` fails, the pipeline continues | UC-01, UC-02 |
| BR-08 | Commands in the canonical allow list must be read-only or build/test only | UC-01 |
| BR-09 | Commands in the canonical ask list are dangerous and must always surface a human prompt | UC-01 |

## 4. Data Requirements

### 4.1 Entities

#### `.claude/settings.local.json` (Project-local settings file)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `permissions.allowlist` | Array of strings | Optional | Bash commands pre-approved for automation |
| `permissions.ask` | Array of strings | Optional | Bash commands requiring human confirmation |

**Command Format:** Bash commands are formatted as `Bash(<cmd>:*)` for commands with arguments, or `Bash(pwd)` for no-argument commands. Examples:
- `Bash(ls:*)`
- `Bash(git status:*)`
- `Bash(pwd)`

**Canonical Allow List (Fixed):**
```
ls, dir, cat, head, tail, find, grep, rg, wc, echo, pwd, which, date,
git status, git diff, git log, git show, git branch, git rev-parse, git add, git commit,
dotnet build, dotnet test, dotnet restore,
npm test, npm run build
```

**Canonical Ask List (Fixed):**
```
git push, gh pr create, rm, del, git checkout, git reset, git clean
```

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `settings.local.json` | Must be valid JSON; invalid files are reset to canonical list |
| Allow list entries | Must be non-empty strings; duplicates removed |
| Ask list entries | Must be non-empty strings; duplicates removed |
| Merge result | All user-defined rules preserved; all canonical rules added (with ask priority) |
| `.gitignore` entry | Must be exactly `.claude/settings.local.json` |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Determinism | `mergeAllowlist` must produce identical output for identical inputs (unit-testable) |
| NFR-02 | Idempotency | Calling `mergeAllowlist` multiple times with same input yields same result |
| NFR-03 | Performance | Merge operation completes in <1 second for typical file sizes (<50KB) |
| NFR-04 | Safety | Invalid JSON recovery must not corrupt data; reset to canonical list instead |
| NFR-05 | Code Quality | `mergeAllowlist` implemented as pure function; CLI entry point wraps it via `require.main === module` guard |
| NFR-06 | Testability | All edge cases covered by unit tests in `tests/cli/mergeAllowlist.test.js` |
| NFR-07 | Consistency | Function signature and CLI pattern consistent with FTR-010 / FTR-011 patterns |

## 6. UI Requirements

### 6.1 User Prompts

#### Allowlist Opt-In Prompt (Step 6 of install-toolkit)

**Text:**
```
Would you like to create or update `.claude/settings.local.json` in this project
with a pre-approved Bash command allowlist? This lets pm-phase3 worker agents run
read-only commands (ls, git status, git log, npm test, dotnet build, etc.) without
prompting you. Dangerous commands (git push, gh pr create, rm, git reset, git clean)
will always require confirmation.
```

**Options:**
- "Yes — write allowlist"
- "No — skip"

### 6.2 Installer Status Reporting (Step 7)

**Allowlist Status Line** (one of the following):
- "Allowlist: written" — fresh installation created file
- "Allowlist: merged (N existing rules preserved)" — merge with existing settings
- "Allowlist: skipped (user said No)" — user opted out
- "Allowlist: skipped (already up to date)" — no changes needed (future consideration)
- "Allowlist: failed — see above" — merge exited with error

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a destination project with no `.claude/settings.local.json`, when user confirms the allowlist opt-in, then `{dest}/.claude/settings.local.json` is created containing the full canonical allow and ask arrays | UC-01 |
| AC-02 | Given an existing `settings.local.json` with user-defined allow entries, when user confirms opt-in, then the result contains all user rules plus all toolkit rules; no user rule is dropped | UC-02 |
| AC-03 | Given a command in both the existing allow list AND toolkit ask list, when `mergeAllowlist` runs, then the command appears only in ask, not in allow | UC-03 |
| AC-04 | Given a command in the existing ask list AND toolkit allow list, when `mergeAllowlist` runs, then the command appears only in ask, not in allow | UC-03 |
| AC-05 | Given `settings.local.json` with invalid JSON, when `mergeAllowlist` runs, then the file is reset to canonical list; installer reports "reset (file was malformed)"; no crash | UC-02 |
| AC-06 | Given `.gitignore` does not contain `.claude/settings.local.json`, when install completes with allowlist written, then the line is appended to `.gitignore` | UC-05 |
| AC-07 | Given `.gitignore` already contains `.claude/settings.local.json`, when install completes, then no duplicate line is added | UC-05 |
| AC-08 | Given user selects No at opt-in prompt, when install runs, then no file is written or modified; Step 7 reports "skipped (user said No)" | UC-01 |
| AC-09 | Given `mergeAllowlist` is called with a known input fixture, when `node bin/cli.js merge-allowlist <tmp-dir>` runs, then output JSON matches expected merged result deterministically (verified by unit test) | UC-02 |
| AC-10 | Given the project after implementation, when `npm test` runs, then all tests in `tests/cli/mergeAllowlist.test.js` pass; no existing tests broken | UC-01, UC-02 |
| AC-11 | Given the canonical allow list, when inspected, then it contains exactly: `ls`, `dir`, `cat`, `head`, `tail`, `find`, `grep`, `rg`, `wc`, `echo`, `pwd`, `which`, `date`, `git status`, `git diff`, `git log`, `git show`, `git branch`, `git rev-parse`, `git add`, `git commit`, `dotnet build`, `dotnet test`, `dotnet restore`, `npm test`, `npm run build` — formatted as `Bash(<cmd>:*)` or `Bash(pwd)` for no-arg | UC-01 |
| AC-12 | Given the canonical ask list, when inspected, then it contains exactly: `git push`, `gh pr create`, `rm`, `del`, `git checkout`, `git reset`, `git clean` — formatted as `Bash(<cmd>:*)` | UC-01 |
| AC-13 | Given `docs/reference.md`, when read, then it contains a section explaining pre-approved commands, why push/PR/rm/reset/clean stay on ask, and that `git checkout` runs only in main loop (implement-feature Step 5), not in pm-phase3 worker agents | UC-01 |
| AC-14 | Given install-toolkit Step 7 report, when read, then it includes an "Allowlist" status line showing one of: "written", "merged (N rules preserved)", "skipped (user said No)", "skipped (already up to date)", or "failed — see above" | UC-01, UC-02 |

## 8. Dependencies & Assumptions

### Dependencies
- `settings.local.json` is already listed in the `NEVER_COPY` constant in `bin/cli.js` (established by FTR-011)
- The `Bash(<cmd>:*)` permission string format is confirmed working in real Claude Code sessions
- `install-toolkit.md` procedure exists and can be modified to add Step 6
- `docs/reference.md` exists and can be extended with permission allowlist documentation
- Node.js / npm test infrastructure is available for unit testing

### Assumptions
- `mergeAllowlist` is exported via the `if (require.main === module)` guard, consistent with all other pure functions in `bin/cli.js` (FTR-010 pattern)
- The CLI entry point pattern (`node bin/cli.js merge-allowlist <dest>`) is added to the main block alongside existing install commands
- `git checkout` runs only in the `implement-feature` skill's main loop (Step 5), not inside any pm-phase3 worker agent; therefore keeping it on ask is safe and does not stall pm-phase3
- `npm test` is the verification command; no coverage threshold is enforced
- Destination projects are assumed to have a writable filesystem for `.gitignore` and `settings.local.json`
- Opt-in prompt is shown on every install run reaching Step 6, enabling reinstalls with updated allowlists

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should `git checkout` be added to the allow list in a future iteration? | Low for MVP | `git checkout` currently runs only in the main loop (implement-feature Step 5), not in pm-phase3 worker agents. Keeping it on ask is safe now. If pm-phase3 gains branch-management steps, revisit this decision and document in reference.md |
| 2 | Should `settings.local.json` be reset to canonical list on every reinstall, or should merge always preserve existing user rules? | Medium | Current design preserves user rules via merge. This is the safer default and respects user customization. Document this behavior clearly. |
| 3 | What error handling verbosity is desired when `mergeAllowlist` encounters file system issues (missing permissions, disk full)? | Low | Use consistent error logging from existing `bin/cli.js` patterns; report non-zero exit code; let installer handle reporting. |
