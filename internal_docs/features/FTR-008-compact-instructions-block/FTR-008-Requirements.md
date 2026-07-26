# Functional Requirements — Compact Instructions Block

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-008 — Compact Instructions Block |
| Version | 1.0 |
| Date | 2026-07-26 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Purpose

This document defines the functional requirements for the Compact Instructions Block feature (FTR-008), which adds a `# Compact instructions` section to the user's global `~/.claude/CLAUDE.md` file. The section shapes Claude Code's auto-compaction behaviour and enables proactive topic-change notifications that prompt the user to compact context before switching subjects.

### 1.2 Scope

**In scope:**
- One-time logic to append (or create) the `# Compact instructions` section in `~/.claude/CLAUDE.md`, with an idempotency check and explicit user confirmation gate.
- Runtime behaviour: detecting topic-change trigger phrases and sending the standard compact notification before addressing the new topic.
- Integration with the `install-toolkit` agent to offer the opt-in during toolkit installation.
- The exact section content as specified, including the "What to preserve" list, the "What to discard" list, and the trigger phrase list with notification wording.

**Out of scope:**
- Modifying any project-level `CLAUDE.md` file.
- Adding a `PreCompact` hook or any entry to `settings.json`.
- Adaptive or semantic trigger phrase detection.
- Suppression logic when context was recently compacted.
- Handling clients where `/compact` is unavailable.
- Modifying any section of `CLAUDE.md` other than appending the new section.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| User | Initiates topic changes; approves or declines the compact suggestion at runtime; approves the one-time write to `~/.claude/CLAUDE.md`. |
| Claude (main loop) | Detects topic-change trigger phrases; sends the compact notification; executes `/compact` only after explicit user approval. |
| `install-toolkit` agent | Offers the opt-in prompt during toolkit installation; writes the section only if the user explicitly confirms. |

---

## 2. Use Cases

### UC-01: Add Compact Instructions Section (One-Time Setup)

| Field | Value |
|-------|-------|
| Actor | User (or `install-toolkit` agent on the user's behalf) |
| Preconditions | The user or agent intends to configure the Compact Instructions Block in `~/.claude/CLAUDE.md`. |
| Trigger | User requests the setup, or `install-toolkit` reaches the CLAUDE.md configuration step during installation. |
| Priority | Must |

**Main flow:**
1. The actor signals intent to add the `# Compact instructions` section.
2. The system checks whether `~/.claude/CLAUDE.md` exists.
3. The system checks whether a `# Compact instructions` section already exists in the file.
4. If the section is absent, the system requests explicit user confirmation: "I am about to append a `# Compact instructions` section to your global `~/.claude/CLAUDE.md`. Confirm to proceed."
5. The user confirms.
6. If the file exists: the section is appended at the end of the file.
7. If the file does not exist: the file is created containing only the `# Compact instructions` section.
8. The system reports success to the user.

**Alternative flows:**
- [Section already exists] → Skip the write. Inform the user: "A `# Compact instructions` section already exists in `~/.claude/CLAUDE.md`. No changes were made. Review and update it manually if needed."

**Error flows:**
- [User declines the confirmation] → Abort silently; do not modify the file; do not report an error.

**Postconditions:**
- `~/.claude/CLAUDE.md` contains the `# Compact instructions` section with the exact content specified in BR-01.
- The user has been informed of the outcome (success, skip, or silent abort).

---

### UC-02: Topic-Change Notification (Runtime, Every Session)

| Field | Value |
|-------|-------|
| Actor | Claude (main loop) |
| Preconditions | The `# Compact instructions` section is present in `~/.claude/CLAUDE.md`. The user is in an active Claude Code session. |
| Trigger | The user sends a message containing one of the listed trigger phrases (case-insensitive, partial match sufficient). |
| Priority | Must |

**Main flow:**
1. The user sends a message containing one of the trigger phrases listed in BR-02.
2. Claude recognises the phrase as an unambiguous topic-change signal.
3. Before addressing the new topic, Claude sends exactly the following notification:

   > **Context compaction suggested**
   >
   > You are about to switch to a new topic. Compacting the context now will keep the next session clean and focused.
   >
   > Reply **Approve - Compact context** to run `/compact` now, or continue to proceed without compacting.

4. The user replies "Approve - Compact context".
5. Claude runs `/compact`.
6. After compaction, Claude proceeds with the new topic in the compacted context.

**Alternative flows:**
- [User replies anything other than "Approve - Compact context"] → Treat as decline; proceed to the new topic without compacting.
- [Trigger phrase appears in a clearly non-switching context (e.g., "now let me fix this bug in the same file")] → Do not trigger. Prefer false negatives over false positives; only trigger on unambiguous standalone topic-change signals.

**Error flows:**
- (None — `/compact` unavailability has no defined degradation; Claude proceeds normally.)

**Postconditions:**
- If approved: context has been compacted and Claude continues with the new topic.
- If declined: Claude continues with the new topic without compacting.

---

### UC-03: Opt-In During Toolkit Installation

| Field | Value |
|-------|-------|
| Actor | `install-toolkit` agent |
| Preconditions | The `install-toolkit` agent is executing a toolkit installation run. |
| Trigger | The agent reaches the CLAUDE.md configuration step. |
| Priority | Should |

**Main flow:**
1. The `install-toolkit` agent offers the opt-in prompt to the user.
2. The user explicitly confirms.
3. The agent executes UC-01 (Add Compact Instructions Section) on the user's behalf.

**Alternative flows:**
- [User does not confirm] → Agent skips the section write; continues installation.

**Postconditions:**
- If confirmed: `~/.claude/CLAUDE.md` contains the section (same postconditions as UC-01).
- If skipped: no change to `~/.claude/CLAUDE.md`.

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | The `# Compact instructions` section content must be written verbatim as defined in the feature specification. It must include: the "What to preserve" list (6 items), the "What to discard" list (4 items), and the trigger phrase list with notification wording. No additions, deletions, or reformatting are permitted. | UC-01, UC-03 |
| BR-02 | Trigger phrases are fixed and exhaustive. Claude must not add phrases based on judgment. Accepted phrases (case-insensitive, partial match): Italian: "passiamo a", "ora facciamo", "prossimo punto", "prossimo argomento", "cambiamo argomento", "nuovo argomento"; English: "let's move on to", "next topic", "switching to", "now let's do", "moving on to", "next up". | UC-02 |
| BR-03 | The section is appended at the end of `~/.claude/CLAUDE.md`. No existing sections are reordered or modified. | UC-01, UC-03 |
| BR-04 | The write is idempotent: if a `# Compact instructions` section already exists in the file, the write is skipped unconditionally, regardless of whether the existing content matches the specification. | UC-01, UC-03 |
| BR-05 | The section applies globally; it must not be written to any project-level `CLAUDE.md`. The target path is exclusively `~/.claude/CLAUDE.md` (Windows: `C:\Users\<username>\.claude\CLAUDE.md`). | UC-01, UC-03 |
| BR-06 | User confirmation is mandatory before modifying `~/.claude/CLAUDE.md`. No implicit or assumed approval is permitted. | UC-01, UC-03 |
| BR-07 | The compact notification message must be sent verbatim as defined in the feature specification. Claude must not paraphrase, shorten, or expand it. | UC-02 |
| BR-08 | `/compact` is executed only when the user replies with the exact phrase "Approve - Compact context". Any other reply is treated as a decline. | UC-02 |
| BR-09 | Trigger detection must prefer false negatives over false positives. Phrases embedded in clearly non-switching contexts must not trigger the notification. | UC-02 |

---

## 4. Data Requirements

### 4.1 Entities

**Global CLAUDE.md file**

| Attribute | Type | Constraints |
|-----------|------|-------------|
| Path | File path | Fixed: `~/.claude/CLAUDE.md` (cross-platform). Must not be a project-level path. |
| Section header | String | Exact: `# Compact instructions` |
| Section content | Markdown text | Verbatim as specified (BR-01). Append-only; no reordering. |
| Pre-existence check | Boolean | Presence of `# Compact instructions` heading in file before write. |

**`install-toolkit` agent**

| Attribute | Detail |
|-----------|--------|
| Modified file | `.claude/agents/install-toolkit.md` |
| Change | New opt-in step in the installation flow that invokes UC-01 on user confirmation. |

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| Section existence | Before writing, search the file for the exact heading `# Compact instructions`. If found, abort (BR-04). |
| Section content | Content written must match the specification verbatim (BR-01). |
| Target path | Must resolve to `~/.claude/CLAUDE.md`. No project-scoped paths allowed (BR-05). |
| Trigger phrase match | Case-insensitive substring search against the exact list in BR-02 only. |
| Approval string | Must equal exactly "Approve - Compact context" (case-sensitive) to trigger `/compact` (BR-08). |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Safety | `~/.claude/CLAUDE.md` must never be modified without explicit written user confirmation obtained in the same interaction. |
| NFR-02 | Idempotency | Repeated runs of the setup flow must produce exactly one `# Compact instructions` section in the file, never duplicates. |
| NFR-03 | Precision | Trigger phrase detection must have a very low false-positive rate; unambiguous context alone permits triggering. |
| NFR-04 | Verbatim fidelity | The written section content and the notification message must exactly match the specification; no paraphrase. |
| NFR-05 | Cross-platform | The global CLAUDE.md path must be resolved correctly on both Windows (`C:\Users\<username>\.claude\CLAUDE.md`) and Unix (`~/.claude/CLAUDE.md`). |

---

## 6. UI Requirements

### 6.1 Interactions

**One-time setup confirmation prompt**

Displayed before any write to `~/.claude/CLAUDE.md`:

> "I am about to append a `# Compact instructions` section to your global `~/.claude/CLAUDE.md`. Confirm to proceed."

**Skip notice (section already exists)**

> "A `# Compact instructions` section already exists in `~/.claude/CLAUDE.md`. No changes were made. Review and update it manually if needed."

**Topic-change notification (runtime)**

Exact text (verbatim, markdown formatted):

> **Context compaction suggested**
>
> You are about to switch to a new topic. Compacting the context now will keep the next session clean and focused.
>
> Reply **Approve - Compact context** to run `/compact` now, or continue to proceed without compacting.

### 6.2 Interaction Flow

```
User / agent signals setup intent
  → Idempotency check
      → Section exists   → Display skip notice → Done
      → Section absent   → Display confirmation prompt
          → User confirms   → Append section → Report success
          → User declines   → Silent abort → Done

Active session — user sends a message
  → Trigger phrase scan
      → No match               → Process normally
      → Match (unambiguous)    → Display topic-change notification
          → User replies "Approve - Compact context"  → Run /compact → Proceed to new topic
          → User replies anything else                → Proceed to new topic without compacting
```

---

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given `~/.claude/CLAUDE.md` exists and has no `# Compact instructions` section, when the implementation runs, then the section is appended verbatim and the user is informed of success. | UC-01 |
| AC-02 | Given `~/.claude/CLAUDE.md` does not exist, when the implementation runs, then the file is created containing only the `# Compact instructions` section. | UC-01 |
| AC-03 | Given `~/.claude/CLAUDE.md` already contains a `# Compact instructions` section, when the implementation runs, then the file is not modified and the user receives the skip notice. | UC-01 |
| AC-04 | Given the user declines the write confirmation, when the implementation runs, then the file is not modified and no error is reported. | UC-01 |
| AC-05 | Given the `# Compact instructions` section is present in `~/.claude/CLAUDE.md`, when the user sends a message containing one of the listed trigger phrases, then Claude sends the exact notification message before addressing the new topic. | UC-02 |
| AC-06 | Given Claude has sent the topic-change notification, when the user replies "Approve - Compact context", then Claude runs `/compact`. | UC-02 |
| AC-07 | Given Claude has sent the topic-change notification, when the user replies anything other than "Approve - Compact context", then Claude proceeds to the new topic without compacting. | UC-02 |
| AC-08 | Given the `install-toolkit` agent is running an installation, when it reaches the CLAUDE.md configuration step, then it offers an opt-in prompt and writes the section only if the user explicitly confirms. | UC-03 |
| AC-09 | Given the section content is written, in any scenario, then the "What to preserve" list contains all 6 items defined in the spec, the "What to discard" list contains all 4 items, and the trigger phrase list matches exactly. | UC-01, UC-03 |

---

## 8. Dependencies and Assumptions

- `~/.claude/CLAUDE.md` is the standard global Claude Code configuration file location. Windows path: `C:\Users\<username>\.claude\CLAUDE.md`; Unix: `~/.claude/CLAUDE.md`.
- The `/compact` slash command is available in Claude Code CLI. No fallback is defined for other clients.
- The `install-toolkit` agent (`.claude/agents/install-toolkit.md`) currently exists and will receive a new opt-in step during this feature's implementation. FTR-007 modified the agent's model frontmatter only; the body is available for extension.
- The section is appended at the end of the file; no reordering of existing sections is performed.
- OPT-04 (catalog table relocation) will be applied after this feature to a separate edit of the same file; no coordination is required between the two.
- This feature applies globally and is not scoped to any single project.

**Registry cross-reference:**
- FTR-007 (Per-Agent Model Assignment): modifies the `install-toolkit` agent's YAML frontmatter. FTR-008 modifies the body of the same agent (new opt-in step). Changes are additive and non-conflicting.

---

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Does the `install-toolkit` agent currently have a step where it configures `~/.claude/CLAUDE.md`, or does the opt-in need to be added as a new installation step? | Determines whether AC-08 requires a new phase in the installer or an addition to an existing one. Low risk — does not block MVP. | Read the current `install-toolkit.md` body before implementation to determine the injection point. |
