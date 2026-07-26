# Technical Specification — Compact Instructions Block

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-008 — Compact Instructions Block |
| Version | 1.0 |
| Date | 2026-07-26 |
| Status | Draft |

---

## 1. Overview

This feature adds a `# Compact instructions` section to the user's global `~/.claude/CLAUDE.md` configuration file. The change is purely additive and configuration-only: it modifies two text files — `~/.claude/CLAUDE.md` (the user's global Claude Code config) and `.claude/agents/install-toolkit.md` (the toolkit's installer agent body).

No new software components, services, APIs, or databases are introduced. The entire implementation consists of:

1. A new logical step in the `install-toolkit` agent that offers users an opt-in to append the section to `~/.claude/CLAUDE.md`.
2. Documented runtime behaviour for Claude's main loop: trigger phrase detection and the compact notification message.

---

## 2. Architecture

### 2.1 System Context

```
User's OS filesystem
  └── ~/.claude/CLAUDE.md          ← target file (global Claude Code config)

Toolkit repo
  └── .claude/agents/
        └── install-toolkit.md     ← modified: new opt-in step added
```

There is no application server, database, or API. The artifact is a configuration text block appended to a Markdown file.

### 2.2 Component Diagram

```
[install-toolkit agent]
  ---(reads)---> [~/.claude/CLAUDE.md]
  ---(writes, with user confirmation)---> [~/.claude/CLAUDE.md]

[Claude main loop (runtime behaviour, described in CLAUDE.md)]
  ---(reads trigger phrases from)---> [~/.claude/CLAUDE.md # Compact instructions]
  ---(sends notification to)---> [User]
  ---(runs /compact on approval)---> [Claude Code runtime]
```

### 2.3 Sequence Diagrams

**Flow A — One-time setup (via install-toolkit)**

```
install-toolkit          User                  ~/.claude/CLAUDE.md
      |                    |                           |
      |-- Reach Step 6 --> |                           |
      |-- Offer opt-in --> |                           |
      |                    |-- "Yes, add it" -------> |
      |-- Check section exists? ------------------>   |
      |                    |         <-- absent ----  |
      |-- Request confirmation --> |                  |
      |                    |-- "Confirm" ---------->  |
      |-- Append section ---------------------------------> |
      |-- Report success -> |                         |
```

**Flow A (section already exists)**

```
install-toolkit          User                  ~/.claude/CLAUDE.md
      |                    |                           |
      |-- Offer opt-in --> |                           |
      |                    |-- "Yes, add it" -------> |
      |-- Check section exists? ------------------>   |
      |                    |    <-- present --------  |
      |-- Send skip notice -> |                       |
      (file unchanged)
```

**Flow B — Runtime topic-change notification**

```
User              Claude (main loop)         Claude Code runtime
  |                     |                          |
  |-- message with      |                          |
  |   trigger phrase -> |                          |
  |                     |-- Match detected ------> |
  |                     |<-- (pauses) ------------ |
  |<-- Compact notification (verbatim) ----------- |
  |                     |                          |
  |-- "Approve - Compact context" -------------->  |
  |                     |-- run /compact --------> |
  |                     |<-- compaction done ------ |
  |                     |-- proceed with new topic  |
```

---

## 3. Backend

Not applicable — this feature has no backend service, database, or API.

---

## 4. Frontend

Not applicable — this feature has no UI component or frontend route.

---

## 5. External Integrations

Not applicable — no external services are called.

---

## 6. Security Considerations

**User confirmation gate (BR-06):** Modifying `~/.claude/CLAUDE.md` requires explicit written user confirmation. The install-toolkit agent must never write to this file without it.

**Path scoping (BR-05):** The target path is exclusively the user's global `~/.claude/CLAUDE.md`. No project-level `CLAUDE.md` must ever be modified by this feature.

**Cross-platform path resolution:** The path `~/.claude/CLAUDE.md` must be resolved to the correct OS path:

| OS | Resolved path |
|----|---------------|
| Windows | `C:\Users\<username>\.claude\CLAUDE.md` |
| Unix / macOS | `~/.claude/CLAUDE.md` (standard tilde expansion) |

The install-toolkit agent already uses Bash commands for file operations, so tilde expansion is handled by the shell.

**Idempotency (BR-04):** The write must be skipped if the section heading `# Compact instructions` is already present, preventing duplicate sections.

---

## 7. Database Changes

Not applicable.

---

## 8. Configuration

### Target file: `~/.claude/CLAUDE.md`

The following block is appended verbatim at the end of the file (or becomes the entire file if the file does not exist):

```markdown
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
```

### New environment variables

None.

### Feature flags

None.

---

## 9. File Inventory

### New files

None.

### Modified files

| Path | Change description |
|------|-------------------|
| `.claude/agents/install-toolkit.md` | Add Step 6 opt-in prompt for `# Compact instructions` section. The new step is inserted after the current Step 5 (Matt Pocock Skills) and before Step 6 (Report), renumbering Report to Step 7. |

Note: `~/.claude/CLAUDE.md` is a user-owned runtime artifact, not a repository file. It is written at runtime by the installer agent (or manually by the user), not committed to the toolkit repository.

---

## 10. Implementation Details

### 10.1 Idempotency check

Before writing, the agent must search the file for the exact heading `# Compact instructions` (level-1 ATX heading, exact string match, case-sensitive). If found at any position in the file, the write is aborted and the skip notice is displayed.

Bash check (example):

```bash
grep -q "^# Compact instructions" "$CLAUDE_MD_PATH" && echo "exists" || echo "absent"
```

Where `CLAUDE_MD_PATH` resolves to `~/.claude/CLAUDE.md`.

### 10.2 File creation vs append

```bash
# Resolve path
CLAUDE_MD_PATH="$HOME/.claude/CLAUDE.md"

# Case 1: file does not exist
if [ ! -f "$CLAUDE_MD_PATH" ]; then
  mkdir -p "$(dirname "$CLAUDE_MD_PATH")"
  cat > "$CLAUDE_MD_PATH" <<'SECTION'
# Compact instructions
...
SECTION

# Case 2: file exists, section absent
else
  cat >> "$CLAUDE_MD_PATH" <<'SECTION'

# Compact instructions
...
SECTION
fi
```

The double-newline before `# Compact instructions` on append ensures the section is visually separated from existing content.

### 10.3 Confirmation prompt wording (exact)

Setup confirmation:

> "I am about to append a `# Compact instructions` section to your global `~/.claude/CLAUDE.md`. Confirm to proceed."

Skip notice:

> "A `# Compact instructions` section already exists in `~/.claude/CLAUDE.md`. No changes were made. Review and update it manually if needed."

### 10.4 Injection point in install-toolkit.md

The current `install-toolkit.md` has these steps:
- Step 1 — Validate inputs and check version
- Step 2 — Plan what to copy
- Step 3 — Execute
- Step 4 — Verify and stamp version
- Step 4b — Verify subagent spawn depth
- Step 5 — Matt Pocock Skills
- Step 6 — Report

The new step is inserted between Step 5 and Step 6 (Report):

**New Step 6 — Compact Instructions opt-in**

After Matt Pocock Skills, before the Report:

1. Inform the user: "The toolkit includes a `# Compact instructions` section that guides Claude's auto-compaction and enables proactive topic-change suggestions."
2. Offer opt-in: "Would you like to add it to your global `~/.claude/CLAUDE.md`?"
3. If Yes:
   a. Resolve path: `~/.claude/CLAUDE.md` (Windows: `C:\Users\<username>\.claude\CLAUDE.md`)
   b. Check if section already exists (idempotency check, Section 10.1)
   c. If exists: display skip notice; continue to Report
   d. If absent: request confirmation (Section 10.3 prompt)
   e. If confirmed: append/create section (Section 10.2); report success
   f. If declined: skip silently; continue to Report
4. If No: skip; continue to Report

The Report step becomes **Step 7** with the addition of a Compact Instructions line:

```
Compact instructions: ✅ added to ~/.claude/CLAUDE.md / ⏭ skipped (already present) / ⏭ skipped (declined) / ⏭ skipped (user said No)
```

### 10.5 Runtime behaviour (described in CLAUDE.md, not code)

The `# Compact instructions` section written to `~/.claude/CLAUDE.md` contains the complete instruction set for Claude's main loop. No code change is needed — Claude reads the global CLAUDE.md at session start and follows the instructions therein.

The trigger phrase detection rule embedded in the section:
- Case-insensitive
- Partial/substring match (phrase anywhere in the message)
- False-negative bias: trigger only on unambiguous standalone topic-change signals

---

## 11. Implementation Order

1. Modify `.claude/agents/install-toolkit.md` — add Step 6 opt-in block and renumber Report to Step 7. Depends on: nothing.
2. Write integration test / manual verification checklist (AC-01 through AC-09). Depends on: 1.

No DB migration, no frontend build, no backend compilation. Implementation is complete after Step 1.

---

## 12. Testing Strategy

### Manual verification checklist

| AC | Test scenario | Steps | Expected result |
|----|---------------|-------|----------------|
| AC-01 | File exists, section absent | Run installer opt-in on a CLAUDE.md without the section | Section appended verbatim, success reported |
| AC-02 | File does not exist | Run installer opt-in with no CLAUDE.md present | File created with section only |
| AC-03 | Section already exists | Run installer opt-in on a CLAUDE.md already containing `# Compact instructions` | File unchanged, skip notice displayed |
| AC-04 | User declines confirmation | Run installer opt-in, decline the confirmation prompt | File unchanged, no error |
| AC-05 | Trigger phrase detection | In a live session, send "let's move on to the next feature" | Exact notification message appears before response |
| AC-06 | Compact approved | Reply "Approve - Compact context" after notification | `/compact` runs |
| AC-07 | Compact declined | Reply anything else after notification | Claude proceeds without compacting |
| AC-08 | Installer opt-in | Run install-toolkit, confirm the opt-in | Section written; line appears in Report |
| AC-09 | Content fidelity | Read the written CLAUDE.md section | Verbatim match against spec: 6 preserve items, 4 discard items, exact trigger list |

### Build verification

No compilation step required. The only verifiable artifact is the modified `install-toolkit.md`. Verify it:
- Contains the new Step 6 heading
- Contains the exact trigger phrase list
- Contains the exact notification wording
- Report step is renumbered to Step 7

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| User's `~/.claude/CLAUDE.md` contains non-standard encoding or line endings | Section appended with wrong line endings; file may not parse correctly | Use `cat >>` with heredoc — shell handles line endings per OS. Verify section was written by reading back after write. |
| Duplicate section created by a future re-run | Two `# Compact instructions` blocks cause confusing or contradictory instructions | Idempotency check (grep for heading) prevents duplicate append; implemented before any write. |
| `install-toolkit` step numbering mismatch | If a future feature adds steps, the Report step reference may shift | Steps are self-contained sections with headers — renumbering is local to the file and does not affect runtime. |
| User expects the section to affect the project-level CLAUDE.md | Confusion about scope | Confirmation prompt and skip notice both explicitly say "your global `~/.claude/CLAUDE.md`". |
| Open Question 1: Does install-toolkit already have a CLAUDE.md step? | If yes, injection point must be merged; if no, new step added at Step 6 position. | Read `install-toolkit.md` body at implementation start to determine injection point. Current reading shows no CLAUDE.md step — new Step 6 is additive. |

---

## 14. Registry Cross-References

**FTR-007** (Per-Agent Model Assignment): modified `.claude/agents/install-toolkit.md` YAML frontmatter (added `model: sonnet`). This feature modifies the agent body (new Step 6). Changes are in separate sections of the file and do not conflict.
