---
name: install-toolkit
description: "Installs the ai-toolkit into a destination project by copying agents, skills, commands, and procedures. Input: [path-to-destination] [--force] — defaults to current working directory"
model: sonnet
---

# Install Toolkit

Installs the ai-toolkit into a destination project so it can use `/implement-feature`, `/init-agents`, all developer agents, and all slash commands without needing the toolkit repo locally.

---

## Input

The user provides:
1. **Path to the destination project root** (optional) — defaults to the current working directory if not specified
2. **`--force`** flag (optional) — overwrite files that already exist in the destination
3. **`--global`** flag (optional) — install into the global Claude Code config directory (`~/.claude/`) instead of a project

---

## Step 1 — Validate inputs

1. Determine destination:
   - If `--global` was passed: destination is `~/.claude/` (user-global config dir)
   - Otherwise: destination is the path provided, or the current working directory if omitted
2. Verify the destination path exists — if not, abort: "Error: destination path not found: {path}"
3. Check if destination is a git repository (look for `.git/`) — warn if not, but continue.

---

## Step 2 — Run installer

Invoke the ai-toolkit CLI installer. The CLI handles source resolution (no CWD assumption), version checking, asset catalog enumeration, and file copy:

```bash
ai-toolkit install --project "{dest}"   # for a project install
# or
ai-toolkit install --global             # for a global install
```

If `--force` was passed:
```bash
ai-toolkit install --project "{dest}" --force
```

The installer will:
- Compare installed version vs available version and ask for confirmation if already installed at the same version
- Enumerate all installable assets from the asset catalog (`src/claude/`)
- Copy NEW files automatically; prompt for MODIFIED files (or overwrite silently if `--force`)
- Skip SAME files silently
- Never copy `install-toolkit` skill or `settings.json` / `settings.local.json`
- Never clobber `docs/procedures/` overrides that exist in the destination
- Stamp the installed version in `{dest}/.claude/.ai-toolkit-version`

Show the installer's output to the user without modification.

---

## Step 3 — Verify result

After the installer exits:
1. Confirm exit code was 0 — if non-zero, report the error and stop
2. Verify `.claude/.ai-toolkit-version` was written in the destination

---

## Step 4 — Verify subagent spawn depth (verify & advise ONLY — never write)

The orchestrated pipelines (`/implement-feature`, `/assess-codebase`) require the
environment variable `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to be set to `2` or higher.
Without it (Claude Code default is `1`), an orchestrator running as a subagent cannot
spawn its worker subagents, so it executes every task inline on its own model —
per-agent model assignment, context isolation, and per-agent token telemetry are all lost.

**This is a check, not a change. Do NOT create or edit any settings file** — merging user
configuration is out of scope and risks clobbering the user's existing settings.

1. Look for the variable in the destination's settings, checking in order:
   - `{dest}/.claude/settings.local.json`
   - `{dest}/.claude/settings.json`
   - `~/.claude/settings.json` (user-global)
   Read each with a tolerant JSON parse; a value of `2` or higher in `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` satisfies the requirement.
2. **If satisfied** → report a one-line confirmation and continue.
3. **If missing / below 2** → print a warning and the exact snippet the user must add themselves:
   ```
   ⚠️  CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH is not set to 2+.
       Without it, orchestrated pipelines run every worker inline on the
       orchestrator model (per-agent models, context isolation, and token
       telemetry are lost).

       Add this to .claude/settings.json (this project) or ~/.claude/settings.json
       (all projects) — the installer does NOT edit it for you:

         {
           "env": {
             "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2"
           }
         }

       Then restart Claude Code so the variable is loaded.
   ```

---

## Step 5 — Compact Instructions opt-in

The toolkit includes a `# Compact instructions` section for `~/.claude/CLAUDE.md` that guides Claude's auto-compaction (what to keep, what to drop) and enables proactive topic-change suggestions.

1. **Offer the opt-in** — inform the user and ask:

   > "Would you like to add a `# Compact instructions` section to your global `~/.claude/CLAUDE.md`?
   > It guides auto-compaction to preserve decision-critical information and suggests running `/compact` when you switch topics."
   >
   > Options: "Yes — add it" / "No — skip"

2. If the user selects **No**: skip silently; set `compact_instructions_status = "skipped (user said No)"`.

3. If the user selects **Yes**:

   a. **Resolve path**: `CLAUDE_MD="$HOME/.claude/CLAUDE.md"` (Windows bash: `$USERPROFILE/.claude/CLAUDE.md` if `$HOME` is not set).

   b. **Idempotency check**: search the file for the exact heading `# Compact instructions`:
      ```bash
      grep -q "^# Compact instructions" "$CLAUDE_MD" 2>/dev/null && echo "exists" || echo "absent"
      ```
      - If **exists**: display skip notice and set `compact_instructions_status = "skipped (already present)"`. Do **not** modify the file.
      - If **absent** (or file does not exist): continue to step (c).

   c. **Request confirmation** — display exactly:
      > "I am about to append a `# Compact instructions` section to your global `~/.claude/CLAUDE.md`. Confirm to proceed."

      - If the user **declines**: skip silently; set `compact_instructions_status = "skipped (declined)"`.
      - If the user **confirms**: continue to step (d).

   d. **Write the section** — append verbatim to `~/.claude/CLAUDE.md` (create the file if it does not exist):

      ```bash
      mkdir -p "$(dirname "$CLAUDE_MD")"
      cat >> "$CLAUDE_MD" << 'COMPACT_SECTION'

# Compact instructions

## What to preserve
When compacting, always keep:
- Current objective and active task
- Confirmed decisions and user approvals
- User answers to questions asked during the session
- Paths of files created or modified
- Open errors and unresolved blockers
- Finding IDs, artifact IDs, FTR/ASSESS/INT reference numbers

## What to discard
When compacting, drop:
- Raw grep and search results
- Successful tool outputs (file reads, bash commands that completed without error)
- Repeated or superseded explanations
- Superseded plans and intermediate reasoning steps

## Topic-change notification
When the user sends a message containing any of the following phrases (case-insensitive):
"passiamo a", "ora facciamo", "prossimo punto", "prossimo argomento", "cambiamo argomento",
"nuovo argomento", "let's move on to", "next topic", "switching to", "now let's do",
"moving on to", "next up" —

— pause before answering and send exactly this message:

> **Context compaction suggested**
>
> You are about to switch to a new topic. Compacting the context now will keep the next session clean and focused.
>
> Reply **Approve - Compact context** to run `/compact` now, or continue to proceed without compacting.

If the user replies "Approve - Compact context", run `/compact`. Otherwise proceed normally.
COMPACT_SECTION
      ```

      Report success: "✅ `# Compact instructions` section added to `~/.claude/CLAUDE.md`."
      Set `compact_instructions_status = "✅ added to ~/.claude/CLAUDE.md"`.

**Skip notice** (displayed when section already exists):
> "A `# Compact instructions` section already exists in `~/.claude/CLAUDE.md`. No changes were made. Review and update it manually if needed."

---

## Step 6 — Bash Permission Allowlist opt-in

After the Compact Instructions step, offer an opt-in to create or update `.claude/settings.local.json` in the destination project with a pre-approved Bash command allowlist.

1. **Offer the opt-in** — inform the user and ask:

   > "Would you like to create or update `.claude/settings.local.json` in this project with a pre-approved Bash command allowlist? This lets pm-phase3 worker agents run read-only commands (ls, git status, git log, npm test, dotnet build, etc.) without prompting you. Dangerous commands (git push, gh pr create, rm, git reset, git clean) will always require confirmation."
   >
   > Options: "Yes — write allowlist" / "No — skip"

2. If the user selects **No**: skip silently; set `allowlist_status = "skipped (user said No)"`.

3. If the user selects **Yes**:

   a. **Invoke the merge CLI** from the toolkit root directory:
      ```bash
      node bin/cli.js merge-allowlist "{dest}"
      ```
      Capture stdout and the exit code.
      - If exit code is non-zero: set `allowlist_status = "failed — see above"` and continue to Step 7 (allowlist is advisory, not blocking).
      - If exit code is 0: the stdout line will be one of:
        - `Allowlist: written` → set `allowlist_status = "written"`
        - `Allowlist: merged (N rules preserved)` → set `allowlist_status = "merged (N rules preserved)"`
        - `Allowlist: reset` → set `allowlist_status = "reset (file was malformed)"`

   b. **Check and update `.gitignore`**:
      ```bash
      node bin/cli.js update-gitignore "{dest}"
      ```
      This ensures `.claude/settings.local.json` is gitignored in the destination project. The CLI is idempotent — it appends the line only if it is not already present.

---

## Step 7 — Report

```
✅ Toolkit installed at {destination}
──────────────────────────────────────────────────
New files copied:    N
Modified/overwritten: N
Modified/kept:        N  (user chose to keep existing version)
Unchanged (same):    N  (skipped silently)
Spawn depth: ✅ CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2+ present / ⚠️ MISSING — see action above
Compact instructions: {compact_instructions_status}
Allowlist: {allowlist_status}
──────────────────────────────────────────────────
Next steps:
  1. Run /init-agents to generate AGENTS.md for this project
  2. Create a feature doc at docs/features/FTR-001-*/feature.md
  3. Run /implement-feature docs/features/FTR-001-*/feature.md
```

If any modified files were kept by the user (not overwritten), list them so they know those files are on an older toolkit version.

---

## Guidelines

- **Never overwrite `docs/procedures/` files** regardless of `--force` — project overrides take priority
- **Never copy `install-toolkit.md`** — it's a toolkit-internal utility
- **Never copy or edit `settings.json` / `settings.local.json`** — user-owned config; only verify and advise (Step 4b)
- **Create directories as needed** — destination may not have `.claude/` yet
- **Abort cleanly** if destination path is invalid — do not create partial installs
