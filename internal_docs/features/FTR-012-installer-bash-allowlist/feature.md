# Installer Bash Allowlist

## Feature ID
FTR-012

## Summary
This feature extends the `install-toolkit` agent with a new opt-in step that creates or
merges a Bash permission allowlist into `.claude/settings.local.json` in the destination
project. The allowlist pre-approves safe read-only and git inspection commands so that
pm-phase3 worker agents (developer-backend, developer-testing, review-solution) can
orient themselves in the repo without stalling the pipeline on a confirmation prompt.
Dangerous outward-facing commands (push, PR creation, rm, reset, clean) remain on the
`ask` list and always surface a human prompt. The merge logic lives in a new pure function
`mergeAllowlist` in `bin/cli.js`, unit-tested in `tests/cli/mergeAllowlist.test.js`,
consistent with the FTR-010/FTR-011 pattern for deterministic installer operations.

## Problem Statement
During pm-phase3 workflow runs, worker agents dispatch trivial Bash commands to orient
themselves — `ls`, `git status`, `git log` — that are not in the session's pre-approved
permission rules. The Claude Code harness suspends the agent and surfaces a confirmation
prompt in the main loop, stalling the entire pipeline. A real incident: an FTR-007
pm-phase3 run stalled on a plain `ls c:\ws` from a developer agent. A full pm-phase3
run can last 30–60+ minutes; the user cannot babysit the screen. Every prompt on a
harmless command halts the pipeline for no real reason.

## Actors

N/A — internal/technical feature

## Core Flow (Happy Path)

The new allowlist step is inserted between the existing Compact Instructions step (Step 5)
and the final Report step in `install-toolkit`. It runs after the core file installation is
complete.

1. Installer completes file copy and version stamp (Steps 1–4).
2. Installer completes Compact Instructions opt-in (existing Step 5).
3. **New Step 6 — Allowlist opt-in:** installer informs the user and asks:
   > "Would you like to create or update `.claude/settings.local.json` in this project
   > with a pre-approved Bash command allowlist? This lets pm-phase3 worker agents run
   > read-only commands (ls, git status, git log, npm test, dotnet build, etc.) without
   > prompting you. Dangerous commands (git push, gh pr create, rm, git reset, git clean)
   > will always require confirmation."
   > Options: "Yes — write allowlist" / "No — skip"
4. If the user selects **No**: skip silently; record status "skipped (user said No)" for
   the Step 7 report.
5. If the user selects **Yes**:
   a. The installer calls `node bin/cli.js merge-allowlist <dest>` from the toolkit root.
   b. `mergeAllowlist` reads the existing `{dest}/.claude/settings.local.json` (if present),
      fuses the toolkit's canonical allow and ask arrays with any existing entries,
      deduplicates, enforces ask-beats-allow priority for commands present in both, and
      writes the result back.
   c. The installer checks whether `{dest}/.gitignore` contains `.claude/settings.local.json`.
      If it does not, the line is appended.
   d. Installer records status "written" or "merged (N existing rules preserved)" for the
      Step 7 report.
6. Installer prints the Step 7 summary with the allowlist status line.

## Out of Scope

- Global `~/.claude/settings.local.json` — this feature only touches the destination
  project's local settings.
- Stack detection: no `AGENTS.md` parsing to select stack-specific entries. A fixed
  combined list (read-only base + `.NET` + `npm`) is shipped; unused entries are harmless.
- Runtime hook filtering (OPT-12) — separate optimization item.
- Auto-upgrading the allowlist on reinstall without user confirmation — the opt-in prompt
  is shown on every install run where the allowlist step is reached; merge is idempotent.
- Modifying `settings.json` (committed, shared) — only `settings.local.json` (personal,
  gitignored) is written.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| `settings.local.json` does not exist | `mergeAllowlist` creates it from the canonical list |
| `settings.local.json` exists with user-defined allow rules | `mergeAllowlist` fuses: dedup union of allow arrays; user rules preserved |
| A command appears in both the existing allow and the toolkit ask list | ask wins (ask-beats-allow priority); command moves to ask only |
| A command appears in the toolkit allow and the existing ask list | ask wins; command stays in ask, not duplicated in allow |
| `settings.local.json` is not valid JSON | `mergeAllowlist` logs a warning and writes the canonical list from scratch (does not corrupt); installer reports "reset (file was malformed)" |
| `.gitignore` already contains `settings.local.json` | No duplicate line appended; idempotent check |
| `.gitignore` does not exist | File is created with the single line `.claude/settings.local.json` |
| `mergeAllowlist` exits non-zero | Installer reports failure in Step 7; pipeline continues (allowlist is advisory, not blocking) |
| User selects No at opt-in | Step skipped silently; Step 7 shows "skipped (user said No)" |
| Reinstall with same toolkit version | Opt-in prompt shown again; merge is idempotent — duplicate entries are deduped |

## Data Model

N/A — internal/technical feature

## Roles and Permissions

N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A destination project with no `.claude/settings.local.json` | User runs install-toolkit and confirms the allowlist opt-in | `{dest}/.claude/settings.local.json` is created containing the full canonical allow and ask arrays | Must |
| AC-02 | A destination with an existing `settings.local.json` containing user-defined allow entries | User confirms the allowlist opt-in | The resulting file contains all user rules plus all toolkit rules; no user rule is dropped | Must |
| AC-03 | A command appears in the existing allow list AND in the toolkit ask list | `mergeAllowlist` runs | The command appears only in ask, not in allow | Must |
| AC-04 | A command appears in the existing ask list AND in the toolkit allow list | `mergeAllowlist` runs | The command appears only in ask, not in allow | Must |
| AC-05 | `settings.local.json` contains invalid JSON | `mergeAllowlist` runs | The file is reset to the canonical list; installer reports "reset (file was malformed)"; no crash | Must |
| AC-06 | `.gitignore` does not contain `.claude/settings.local.json` | Install completes with allowlist written | `.claude/settings.local.json` is appended to `.gitignore` | Must |
| AC-07 | `.gitignore` already contains `.claude/settings.local.json` | Install completes with allowlist written | No duplicate line is added | Must |
| AC-08 | User selects No at the opt-in prompt | Install runs | No file is written or modified; Step 7 reports "skipped (user said No)" | Must |
| AC-09 | `mergeAllowlist` is called with a known input fixture | `node bin/cli.js merge-allowlist <tmp-dir>` runs | Output JSON matches expected merged result deterministically (unit test) | Must |
| AC-10 | `npm test` is run after implementing this feature | Jest runs | All tests in `tests/cli/mergeAllowlist.test.js` pass; no existing tests broken | Must |
| AC-11 | The canonical allow list is inspected | — | Contains exactly: `ls`, `dir`, `cat`, `head`, `tail`, `find`, `grep`, `rg`, `wc`, `echo`, `pwd`, `which`, `date`, `git status`, `git diff`, `git log`, `git show`, `git branch`, `git rev-parse`, `git add`, `git commit`, `dotnet build`, `dotnet test`, `dotnet restore`, `npm test`, `npm run build` — formatted as `Bash(<cmd>:*)` (or `Bash(pwd)` for no-argument commands) | Must |
| AC-12 | The canonical ask list is inspected | — | Contains exactly: `git push`, `gh pr create`, `rm`, `del`, `git checkout`, `git reset`, `git clean` — formatted as `Bash(<cmd>:*)` | Must |
| AC-13 | `docs/reference.md` is read | — | A new section explains what commands are pre-approved, why push/PR/rm/reset/clean stay on ask, and that `git checkout` runs only in the main loop (implement-feature Step 5), not in pm-phase3 worker agents | Must |
| AC-14 | install-toolkit Step 7 report is read | — | Includes an "Allowlist" status line showing one of: "written", "merged (N rules preserved)", "skipped (user said No)", "skipped (already up to date)", or "failed — see above" | Must |

## MVP vs Deferred

### MVP (must ship)

- `bin/cli.js`: new pure function `mergeAllowlist(destDir)` exported via the `require.main` guard
- `bin/cli.js`: CLI entry point `node bin/cli.js merge-allowlist <dest>` that calls `mergeAllowlist`
- Canonical allow list (fixed, combined .NET + npm + base read-only)
- Canonical ask list (fixed: git push, gh pr create, rm, del, git checkout, git reset, git clean)
- Merge semantics: dedup union of allow, dedup union of ask, ask-beats-allow priority
- Malformed JSON fallback: reset to canonical list, report warning
- `.gitignore` idempotent append
- `tests/cli/mergeAllowlist.test.js` covering: fresh install, merge with existing user rules,
  ask-beats-allow, allow-beats-ask, malformed JSON reset, gitignore idempotency
- `install-toolkit.md`: new Step 6 (opt-in prompt + call to CLI + gitignore check);
  Step 7 updated with allowlist status line; Step numbering shifted (old Step 6 → Step 7)
- `docs/reference.md`: new "Bash Permission Allowlist" section

### Deferred (next iteration)

- Stack detection from `AGENTS.md` for stack-specific command additions
- Auto-upgrade of the allowlist on reinstall (currently re-offers opt-in; merge is idempotent)
- `npm run` sub-command granularity (currently `npm run build` only; `npm run test:coverage` etc. deferred)
- Trash/recovery for the previous `settings.local.json` content (consistent with FTR-011
  manifest approach)

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should `git checkout` be added to the allow list in a future iteration? It runs only in the main loop today (implement-feature Step 5), not in pm-phase3 worker agents — so keeping it on ask is safe now. If pm-phase3 ever gains branch-management steps, this decision should be revisited. | Low for MVP; document in reference.md |

## Dependencies and Assumptions

- `git checkout` is confirmed to run only in the `implement-feature` skill's main loop
  (Step 5), not inside any pm-phase3 workflow agent. Verified by reading pm-phase3.js
  (git add + git commit + git push only) and implement-feature SKILL.md (Step 5 is in the
  main loop). Keeping `git checkout` on ask is therefore safe and does not stall pm-phase3.
- `settings.local.json` is already listed in the `NEVER_COPY` constant in `bin/cli.js`
  (FTR-011 established this). The new `mergeAllowlist` function writes — not copies — to
  this file, which is consistent: the installer merges a specific section rather than
  overwriting the whole file blindly.
- The `Bash(<cmd>:*)` permission string format is confirmed working in real Claude Code
  sessions (cited in the backlog from a real incident).
- `mergeAllowlist` must be exported via the `if (require.main === module)` guard, consistent
  with all other pure functions in `bin/cli.js` (FTR-010 constraint).
- The CLI entry point pattern (`node bin/cli.js merge-allowlist <dest>`) must be added to
  the `if (require.main === module)` main block alongside existing install commands.
- `npm test` is the verification command; no coverage threshold is enforced.
