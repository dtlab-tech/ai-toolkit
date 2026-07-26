# Manual Verification Checklist — FTR-008 — Compact Instructions Block

## Purpose

This checklist is the manual test plan for FTR-008. Each test maps to one or more Acceptance Criteria (AC) from `FTR-008-Requirements.md`. Execute each test in a Claude Code session with the toolkit installed.

---

## Test environment setup

Before running tests, ensure:
- The toolkit is installed in a test destination project
- `install-toolkit` agent is accessible (via `.claude/agents/install-toolkit.md`)
- A scratch copy of `~/.claude/CLAUDE.md` exists (or is absent) as required per test

---

## AC-01 — File exists, section absent → section appended verbatim

| Field | Detail |
|-------|--------|
| AC | AC-01 |
| Preconditions | `~/.claude/CLAUDE.md` exists and does NOT contain `# Compact instructions` |

**Steps:**
1. Run `/install-toolkit` (or invoke the `install-toolkit` agent)
2. When Step 6 is reached, select "Yes — add it"
3. Confirm the write prompt

**Expected result:**
- `~/.claude/CLAUDE.md` is unchanged except for the appended section at the end
- Section begins with exactly `# Compact instructions`
- Success message displayed: "✅ `# Compact instructions` section added to `~/.claude/CLAUDE.md`."
- Report line: `Compact instructions: ✅ added to ~/.claude/CLAUDE.md`

**Verification:**
```bash
grep -c "^# Compact instructions" "$HOME/.claude/CLAUDE.md"
# Expected: 1
```

---

## AC-02 — File does not exist → file created with section only

| Field | Detail |
|-------|--------|
| AC | AC-02 |
| Preconditions | `~/.claude/CLAUDE.md` does NOT exist |

**Steps:**
1. Back up and remove `~/.claude/CLAUDE.md` if it exists
2. Run the installer; reach Step 6; select "Yes — add it"; confirm

**Expected result:**
- `~/.claude/CLAUDE.md` is created
- File contains only the `# Compact instructions` section (possibly with a leading blank line from the heredoc)
- Success message displayed

**Verification:**
```bash
[ -f "$HOME/.claude/CLAUDE.md" ] && echo "exists" || echo "missing"
grep "^# Compact instructions" "$HOME/.claude/CLAUDE.md"
```

---

## AC-03 — Section already exists → file unchanged, skip notice shown

| Field | Detail |
|-------|--------|
| AC | AC-03 |
| Preconditions | `~/.claude/CLAUDE.md` already contains `# Compact instructions` |

**Steps:**
1. Ensure `~/.claude/CLAUDE.md` contains the section heading
2. Run the installer; reach Step 6; select "Yes — add it"

**Expected result:**
- File is NOT modified (no duplicate section, no new content appended)
- Skip notice displayed: "A `# Compact instructions` section already exists in `~/.claude/CLAUDE.md`. No changes were made. Review and update it manually if needed."
- Report line: `Compact instructions: skipped (already present)`

**Verification:**
```bash
grep -c "^# Compact instructions" "$HOME/.claude/CLAUDE.md"
# Expected: 1 (not 2)
```

---

## AC-04 — User declines confirmation → file unchanged, no error

| Field | Detail |
|-------|--------|
| AC | AC-04 |
| Preconditions | `~/.claude/CLAUDE.md` exists and does NOT contain `# Compact instructions` |

**Steps:**
1. Run the installer; reach Step 6; select "Yes — add it"
2. At the confirmation prompt, decline (reply anything other than "Confirm")

**Expected result:**
- `~/.claude/CLAUDE.md` is NOT modified
- No error message displayed
- Report line: `Compact instructions: skipped (declined)`

---

## AC-05 — Trigger phrase detection → exact notification sent before new topic

| Field | Detail |
|-------|--------|
| AC | AC-05 |
| Preconditions | `~/.claude/CLAUDE.md` contains the `# Compact instructions` section (from AC-01 or AC-02) |

**Steps — test each of the 12 trigger phrases:**

| # | Phrase | Example message |
|---|--------|-----------------|
| 1 | "passiamo a" | "Bene, passiamo a un altro argomento" |
| 2 | "ora facciamo" | "Ora facciamo qualcosa di diverso" |
| 3 | "prossimo punto" | "Passiamo al prossimo punto" |
| 4 | "prossimo argomento" | "Vediamo il prossimo argomento" |
| 5 | "cambiamo argomento" | "Cambiamo argomento" |
| 6 | "nuovo argomento" | "Nuovo argomento: la sicurezza" |
| 7 | "let's move on to" | "Let's move on to the next feature" |
| 8 | "next topic" | "Next topic: testing" |
| 9 | "switching to" | "Switching to a new task now" |
| 10 | "now let's do" | "Now let's do the deployment step" |
| 11 | "moving on to" | "Moving on to the backend work" |
| 12 | "next up" | "Next up: refactoring" |

**Expected result for each:**
Claude pauses and sends exactly:

> **Context compaction suggested**
>
> You are about to switch to a new topic. Compacting the context now will keep the next session clean and focused.
>
> Reply **Approve - Compact context** to run `/compact` now, or continue to proceed without compacting.

Claude does NOT address the new topic until the user replies.

**Negative test — false positive avoidance:**
Send: "now let me fix this bug in the same file" — this contains "now" but NOT "now let's do". Expected: no notification triggered.

---

## AC-06 — User approves compact → /compact runs

| Field | Detail |
|-------|--------|
| AC | AC-06 |
| Preconditions | AC-05 notification has been sent |

**Steps:**
1. Trigger the notification (e.g., send "next topic: deployment")
2. Reply exactly: `Approve - Compact context`

**Expected result:**
- Claude runs `/compact`
- Context is compacted
- Claude then proceeds to address the new topic in the compacted context

---

## AC-07 — User declines compact → Claude proceeds without compacting

| Field | Detail |
|-------|--------|
| AC | AC-07 |
| Preconditions | AC-05 notification has been sent |

**Steps:**
1. Trigger the notification (e.g., send "moving on to performance")
2. Reply anything other than "Approve - Compact context" (e.g., "no thanks", "continue", "skip")

**Expected result:**
- Claude does NOT run `/compact`
- Claude proceeds directly to address the new topic

---

## AC-08 — install-toolkit opt-in during installation

| Field | Detail |
|-------|--------|
| AC | AC-08 |
| Preconditions | Fresh toolkit installation on a destination project |

**Steps:**
1. Run `/install-toolkit <destination>`
2. Proceed through all steps
3. At Step 6, verify the opt-in prompt is shown
4. Select "Yes — add it" and confirm

**Expected result:**
- Step 6 opt-in prompt appears between Step 5 (Matt Pocock) and Step 7 (Report)
- Section is written to `~/.claude/CLAUDE.md` (AC-01 or AC-02 conditions apply)
- Step 7 Report includes `Compact instructions: ✅ added to ~/.claude/CLAUDE.md`

---

## AC-09 — Section content fidelity

| Field | Detail |
|-------|--------|
| AC | AC-09 |
| Preconditions | Section has been written (AC-01 or AC-02 confirmed) |

**Verification steps:**

1. Open `~/.claude/CLAUDE.md` and locate `# Compact instructions`

2. Verify "What to preserve" contains exactly 6 items:
   - [ ] Current objective and active task
   - [ ] Confirmed decisions and user approvals
   - [ ] User answers to questions asked during the session
   - [ ] Paths of files created or modified
   - [ ] Open errors and unresolved blockers
   - [ ] Finding IDs, artifact IDs, FTR/ASSESS/INT reference numbers

3. Verify "What to discard" contains exactly 4 items:
   - [ ] Raw grep and search results
   - [ ] Successful tool outputs (file reads, bash commands that completed without error)
   - [ ] Repeated or superseded explanations
   - [ ] Superseded plans and intermediate reasoning steps

4. Verify trigger phrase list contains exactly 12 phrases:
   - Italian (6): "passiamo a", "ora facciamo", "prossimo punto", "prossimo argomento", "cambiamo argomento", "nuovo argomento"
   - English (6): "let's move on to", "next topic", "switching to", "now let's do", "moving on to", "next up"

5. Verify notification wording is verbatim:
   - [ ] Heading: **Context compaction suggested**
   - [ ] Body sentence 1: "You are about to switch to a new topic..."
   - [ ] Body sentence 2: "Compacting the context now will keep the next session clean and focused."
   - [ ] Reply instruction: "Reply **Approve - Compact context** to run `/compact` now, or continue to proceed without compacting."
   - [ ] Condition line: "If the user replies "Approve - Compact context", run `/compact`. Otherwise proceed normally."

---

## Test results log

| AC | Test | Date | Pass/Fail | Notes |
|----|------|------|-----------|-------|
| AC-01 | File exists, section absent | — | — | — |
| AC-02 | File does not exist | — | — | — |
| AC-03 | Section already exists | — | — | — |
| AC-04 | User declines confirmation | — | — | — |
| AC-05 | Trigger phrase detection (×12) | — | — | — |
| AC-06 | User approves compact | — | — | — |
| AC-07 | User declines compact | — | — | — |
| AC-08 | Installer opt-in | — | — | — |
| AC-09 | Section content fidelity | — | — | — |
