---
name: install-toolkit
description: "Installs the swf-ai-toolkit into a destination project by copying agents, skills, commands, and procedures. Input: [path-to-destination] [--force] — defaults to current working directory"
---

# Install Toolkit

Copies the toolkit's agents, skills, commands, and procedures into a destination project so it can use `/implement-feature`, `/init-agents`, all developer agents, and all slash commands without needing the toolkit repo locally.

---

## Input

The user provides:
1. **Path to the destination project root** (optional) — defaults to the current working directory if not specified
2. **`--force`** flag (optional) — overwrite files that already exist in the destination

---

## Step 1 — Validate inputs and check version

1. Determine the **toolkit root**: the current working directory (this agent runs from the toolkit repo).
2. Verify the toolkit root contains `.claude/agents/` — if not, abort: "Error: must be run from the swf-ai-toolkit directory."
3. Verify the destination path exists — if not, abort: "Error: destination path not found: {path}"
4. Check if destination is a git repository (look for `.git/`) — warn if not, but continue.
5. **Version check**:
   - Read `package.json` from the toolkit root to get the current version (e.g. `0.2.0`)
   - Check if `.claude/.swf-toolkit-version` exists in the destination:
     - **File missing** → first install, no prompt needed, continue
     - **Same version** → inform the user and ask: "Toolkit v{x} is already installed. Re-install anyway?"
       - If No: abort cleanly
     - **Different version** → show both versions and ask:
       ```
       Version check:
         Installed : v{installed}
         Available : v{current}

       Proceed and update from v{installed} to v{current}?
       ```
       - If No: abort cleanly with "Your current installation was not changed."

---

## Step 2 — Plan what to copy

Four source directories to install:

| Source (toolkit) | Destination | Purpose |
|------------------|-------------|---------|
| `.claude/agents/` | `{dest}/.claude/agents/` | All spawnable subagents |
| `.claude/skills/` | `{dest}/.claude/skills/` | All user-invocable skills (except `install-toolkit/`) |
| `.claude/commands/` | `{dest}/.claude/commands/` | All slash commands |
| `docs/procedures/` | `{dest}/docs/procedures/` | Generic procedures (only if destination has no override) |

For each file, compare source content against destination using an MD5/hash check and determine status:
- **NEW** — file does not exist in destination → copy automatically, no prompt
- **SAME** — file exists and content is identical → skip silently, no prompt
- **MODIFIED** — file exists but content differs → show to user, ask per-file

Build and display the plan before executing:

```
📦 Install Plan  →  {destination}
──────────────────────────────────────────────────
.claude/agents/
  ✅ NEW       project-manager.md
  ✅ NEW       generate-requirements.md
  ⚠️  MODIFIED  developer-backend.md    ← content differs
  ⏭  SAME      review-solution.md

.claude/skills/
  ✅ NEW       implement-feature/SKILL.md
  ⏭  SAME      init-agents/SKILL.md

docs/procedures/
  ✅ NEW       code-generation.md
  ⏭  SAME      testing.md
──────────────────────────────────────────────────
New: N  |  Modified: N  |  Unchanged: N
```

---

## Step 3 — Execute

**Phase A — New files** (no prompt needed): copy all NEW files, creating directories as needed.

**Phase B — Modified files** (per-file prompt):

For each MODIFIED file, show:
```
  ⚠️  MODIFIED: .claude/agents/developer-backend.md
  The toolkit version differs from the one already in your project.
  Overwrite? (y/N):
```

Wait for the user's response before moving to the next file. If `--force` was passed, overwrite all modified files without prompting.

**Phase C — Same files**: skip silently (no output for these).

Use shell commands appropriate for the OS. On Windows with bash:
```bash
mkdir -p "{dest_dir}"
cp "{source_file}" "{dest_file}"
```

**Never copy the `install-toolkit/` skill directory** — this skill is toolkit-internal and has no use in a destination project.

**For `docs/procedures/`**: copy only files that don't already exist in the destination (regardless of `--force`) — project-specific procedure overrides must never be clobbered.

---

## Step 4 — Verify and stamp version

After copying:
1. Verify all expected files are present in the destination
2. Verify no files are zero bytes
3. Write the installed version to `.claude/.swf-toolkit-version` in the destination:
   ```bash
   echo "{current_version}" > "{dest}/.claude/.swf-toolkit-version"
   ```
   This file is read on future installs to show the version comparison prompt.

---

## Step 5 — Matt Pocock Skills (version check + optional install/update)

After copying the toolkit files, check the state of Matt Pocock's skills:

1. **Detect installed version**: check if `~/.claude/skills/mattpocock/.version` exists and read it. If not found, try `npm list -g mattpocock --json` to get the cached version. If neither works, assume not installed.

2. **Detect latest available version**: run `npm view mattpocock version` to get the current version on npm. If offline or unavailable, skip the version comparison.

3. **Present the appropriate prompt** using `AskUserQuestion`:

   **Not installed:**
   ```
   question: "Matt Pocock's skills are not installed. Install them now?"
   description: "Includes define-feature, grilling, TDD, prototype, handoff, and more.
                 Installs globally via: npx skills@latest add mattpocock/skills"
   options:
     - "Yes — install now"
     - "No — skip (install manually later)"
   ```

   **Installed, update available (installed=vX, latest=vY):**
   ```
   question: "Matt Pocock skills v{installed} is installed. Update to v{latest}?"
   options:
     - "Yes — update now"
     - "No — keep current version"
   ```

   **Already up to date:**
   ```
   question: "Matt Pocock skills v{installed} is already up to date. Re-install?"
   options:
     - "Yes — re-install"
     - "No — skip"
   ```

4. If the user selects **Yes** (install or update), run:
   ```bash
   npx skills@latest add mattpocock/skills
   ```
   Report the outcome. If it fails, show the manual install command.

---

## Step 6 — Report

```
✅ Toolkit installed at {destination}
──────────────────────────────────────────────────
New files copied:    N
Modified/overwritten: N
Modified/kept:        N  (user chose to keep existing version)
Unchanged (same):    N  (skipped silently)
Matt Pocock skills: ✅ installed v{X} / ⬆️ updated v{old}→v{new} / ⏭ skipped / ✅ already up to date v{X}
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
- **Create directories as needed** — destination may not have `.claude/` yet
- **Abort cleanly** if destination path is invalid — do not create partial installs
