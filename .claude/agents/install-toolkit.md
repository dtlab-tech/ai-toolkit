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

## Step 1 — Validate inputs

1. Determine the **toolkit root**: the current working directory (this agent runs from the toolkit repo).
2. Verify the toolkit root contains `.claude/agents/` — if not, abort: "Error: must be run from the swf-ai-toolkit directory."
3. Verify the destination path exists — if not, abort: "Error: destination path not found: {path}"
4. Check if destination is a git repository (look for `.git/`) — warn if not, but continue.

---

## Step 2 — Plan what to copy

Four source directories to install:

| Source (toolkit) | Destination | Purpose |
|------------------|-------------|---------|
| `.claude/agents/` | `{dest}/.claude/agents/` | All spawnable subagents |
| `.claude/skills/` | `{dest}/.claude/skills/` | All user-invocable skills (except `install-toolkit.md`) |
| `.claude/commands/` | `{dest}/.claude/commands/` | All slash commands |
| `docs/procedures/` | `{dest}/docs/procedures/` | Generic procedures (only if destination has no override) |

For each file, determine:
- **COPY** — file does not exist in destination
- **SKIP** — file already exists in destination (and `--force` was NOT passed)
- **OVERWRITE** — file already exists in destination AND `--force` was passed

Build and display the plan before executing:

```
📦 Install Plan  →  {destination}
──────────────────────────────────────────────────
.claude/agents/
  ✅ COPY     project-manager.md
  ✅ COPY     generate-requirements.md
  ✅ COPY     generate-tech-spec.md
  ✅ COPY     validate-feature-docs.md
  ✅ COPY     generate-work-breakdown.md
  ✅ COPY     developer-backend.md
  ✅ COPY     developer-frontend.md
  ✅ COPY     developer-testing.md
  ✅ COPY     review-solution.md
  ✅ COPY     init-agents-md.md

.claude/skills/
  ✅ COPY     implement-feature.md
  ✅ COPY     init-agents.md
  ⏭  SKIP     my-existing-skill.md  ← already exists

docs/procedures/
  ✅ COPY     code-generation.md
  ⏭  SKIP     code-review.md        ← project override exists
──────────────────────────────────────────────────
Files to copy: N  |  Skipped: N  |  Overwrite: N
```

---

## Step 3 — Execute

For each file marked COPY or OVERWRITE:

1. Create the destination directory if it doesn't exist
2. Copy the file

Use shell commands appropriate for the OS. On Windows with bash:
```bash
mkdir -p "{dest_dir}"
cp "{source_file}" "{dest_file}"
```

**Never copy `install-toolkit.md`** from `.claude/skills/` — this skill is toolkit-internal and has no use in a destination project.

**For `docs/procedures/`**: copy only files that don't already exist in the destination (regardless of `--force`) — project-specific procedure overrides must never be clobbered.

---

## Step 4 — Verify

After copying, verify:
- All expected files are present in the destination
- No files are zero bytes

---

## Step 5 — Report

```
✅ Toolkit installed at {destination}
──────────────────────────────────────────────────
Copied:    N files
Skipped:   N files (already existed — use --force to overwrite)
──────────────────────────────────────────────────
Next steps:
  1. Run /init-agents to generate AGENTS.md for this project
  2. Create a feature doc at docs/features/FTR-001-*/feature.md
  3. Run /implement-feature docs/features/FTR-001-*/feature.md
```

If any files were skipped, list them explicitly so the user can decide whether to re-run with `--force`.

---

## Guidelines

- **Never overwrite `docs/procedures/` files** regardless of `--force` — project overrides take priority
- **Never copy `install-toolkit.md`** — it's a toolkit-internal utility
- **Create directories as needed** — destination may not have `.claude/` yet
- **Abort cleanly** if destination path is invalid — do not create partial installs
