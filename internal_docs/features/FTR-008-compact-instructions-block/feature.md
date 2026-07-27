# Compact Instructions Block

## Feature ID
FTR-008

## Summary
This feature adds a `# Compact instructions` section to the user's global `~/.claude/CLAUDE.md` file. The section serves two purposes: it guides the Claude Code auto-compaction mechanism to preserve decision-critical information and discard noise, and it instructs Claude to proactively suggest running `/compact` when the user signals a topic change, so that sessions never start a new subject carrying stale context from a previous one.

## Problem Statement
When Claude Code auto-compacts a long context mid-session, there is no guidance on what to preserve and what to drop. Critical information — current objectives, confirmed decisions, user answers, modified file paths, open errors, finding and artifact IDs — can be silently lost. The next prompt then operates with an incomplete picture, causing repeated questions, lost traceability, or re-done work.

Additionally, there is currently no mechanism to prompt the user to voluntarily compact before switching to a new topic. A proactive suggestion at the right moment would prevent stale, high-noise context from carrying over into unrelated work.

The fix is preventive: a structured instruction block that shapes both auto-compaction behaviour and Claude's own topic-change awareness, applied globally so it benefits every project.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| User | Initiates topic changes; approves or declines the compact suggestion; approves the one-time write to `~/.claude/CLAUDE.md` | Per session, per topic change |
| Claude (main loop) | Detects topic-change trigger phrases; sends the compact notification; executes `/compact` if approved | Per topic-change trigger |
| `install-toolkit` agent | During toolkit installation, offers the user an opt-in to add the section to their global CLAUDE.md | Once per toolkit installation |

## Core Flow (Happy Path)

### Flow A — Adding the section (one-time setup)

1. The user (or the `install-toolkit` agent on their behalf) is about to write the `# Compact instructions` section to `~/.claude/CLAUDE.md`.
2. Before writing, Claude checks whether a `# Compact instructions` section already exists in the file.
3. If it does not exist: Claude requests explicit user confirmation ("I am about to append a `# Compact instructions` section to your global `~/.claude/CLAUDE.md`. Confirm to proceed.").
4. User confirms.
5. Claude appends the section. If the file does not exist, Claude creates it with only the section.
6. Claude reports success.

### Flow B — Topic-change suggestion (runtime, every session)

1. The user sends a message that contains one of the trigger phrases (see Edge Cases for full list).
2. Claude recognises the phrase as a topic-change signal.
3. Claude pauses and sends the following notification before addressing the new topic:

   > **Context compaction suggested**
   >
   > You are about to switch to a new topic. Compacting the context now will keep the next session clean and focused.
   >
   > Reply **Approve - Compact context** to run `/compact` now, or continue to proceed without compacting.

4. User replies "Approve - Compact context".
5. Claude runs `/compact`.
6. After compaction, Claude proceeds with the new topic in the now-compacted context.

## Out of Scope

- Modifying the project-level `CLAUDE.md` (e.g., `c:\ws\<project>\CLAUDE.md`) — the target is exclusively `~/.claude/CLAUDE.md`.
- Adding a `PreCompact` hook or any other entry to `settings.json`.
- Handling the case where `/compact` is unavailable (non-Claude Code client) — no special degradation is defined; Claude proceeds normally.
- Suppressing the compact suggestion if the context was recently compacted — not implemented.
- Detecting ambiguous or implicit topic changes — the trigger must be unambiguous.
- Modifying OPT-04's catalog tables or any other section of CLAUDE.md beyond appending the new section.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| `~/.claude/CLAUDE.md` does not exist | Create the file from scratch containing only the `# Compact instructions` section; inform the user. |
| `# Compact instructions` section already present in the file | Skip the write; inform the user: "A `# Compact instructions` section already exists in `~/.claude/CLAUDE.md`. No changes were made. Review and update it manually if needed." |
| User declines the one-time write confirmation | Abort silently; do not modify the file. |
| User replies anything other than "Approve - Compact context" to the topic-change notification | Treat as decline; proceed to the new topic without compacting. |
| Topic-change phrase is part of a clearly non-switching context (e.g., "now let me fix this bug in the same file") | Do not trigger. Prefer false negatives over false positives. Only trigger on unambiguous standalone topic-change signals. |

## Trigger Phrases

The following phrases (case-insensitive, partial match sufficient) trigger the topic-change notification. Claude must not add new phrases based on judgment — only these:

**Italian:**
- "passiamo a"
- "ora facciamo"
- "prossimo punto"
- "prossimo argomento"
- "cambiamo argomento"
- "nuovo argomento"

**English:**
- "let's move on to"
- "next topic"
- "switching to"
- "now let's do"
- "moving on to"
- "next up"

## Section Content Specification

The exact text to be appended to `~/.claude/CLAUDE.md` is:

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

## Data Model

This feature has no database entities. The only artifact is a text section appended to an existing Markdown configuration file.

| File | Action | Condition |
|------|--------|-----------|
| `~/.claude/CLAUDE.md` | Append `# Compact instructions` section | File exists and section is absent |
| `~/.claude/CLAUDE.md` | Create file with `# Compact instructions` section | File does not exist |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| User | Must give explicit written confirmation before the file is modified; can approve or decline the topic-change compact suggestion at any time |
| `install-toolkit` agent | May offer the opt-in during installation; must not write without user confirmation |
| Claude (main loop) | Reads trigger phrases; sends notification; executes `/compact` only after explicit approval |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | `~/.claude/CLAUDE.md` exists and has no `# Compact instructions` section | The implementation runs | The section is appended verbatim and the user is informed of success | Must |
| AC-02 | `~/.claude/CLAUDE.md` does not exist | The implementation runs | The file is created containing only the `# Compact instructions` section | Must |
| AC-03 | `~/.claude/CLAUDE.md` already contains a `# Compact instructions` section | The implementation runs | The file is not modified; the user receives the skip notice | Must |
| AC-04 | The user declines the write confirmation | The implementation runs | The file is not modified; no error is reported | Must |
| AC-05 | The `# Compact instructions` section is present in `~/.claude/CLAUDE.md` | The user sends a message containing one of the listed trigger phrases | Claude sends the exact notification message before addressing the new topic | Must |
| AC-06 | Claude has sent the topic-change notification | The user replies "Approve - Compact context" | Claude runs `/compact` | Must |
| AC-07 | Claude has sent the topic-change notification | The user replies anything other than "Approve - Compact context" | Claude proceeds to the new topic without compacting | Must |
| AC-08 | The `install-toolkit` agent is running an installation | It reaches the CLAUDE.md configuration step | It offers an opt-in prompt; writes the section only if the user explicitly confirms | Should |
| AC-09 | The section content is written | Any scenario | The "What to preserve" list contains all six items defined in this spec; the "What to discard" list contains all four items; the trigger phrase list matches exactly | Must |

## MVP vs Deferred

### MVP (must ship)
- Append/create logic for `~/.claude/CLAUDE.md` with idempotency check and user confirmation gate.
- Exact section text as specified above, including preserve list, discard list, and trigger phrase list with notification wording.
- `install-toolkit` opt-in integration.

### Deferred (next iteration)
- `PreCompact` hook in `settings.json` for reinforcing preservation rules at the OS level (OPT-12 territory).
- Adaptive trigger phrase detection using semantic similarity rather than fixed strings.
- Suppression logic when context was recently compacted.

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Does the `install-toolkit` agent currently have a step where it configures `~/.claude/CLAUDE.md`, or does the opt-in need to be added as a new installation step? | Determines whether AC-08 requires a new phase in the installer or an addition to an existing one. Low risk — does not block MVP. |

## Dependencies and Assumptions

- `~/.claude/CLAUDE.md` is the standard global Claude Code configuration file location on all supported platforms (Windows path: `C:\Users\<username>\.claude\CLAUDE.md`; Unix: `~/.claude/CLAUDE.md`).
- The `/compact` slash command is available in Claude Code CLI; no fallback is defined for other clients.
- OPT-04 (catalog table relocation) will be applied after this feature, to a separate edit of the same file; no coordination is required between the two.
- The section is appended at the end of the file; no reordering of existing sections is performed.
- This feature applies globally and is not scoped to any single project.
