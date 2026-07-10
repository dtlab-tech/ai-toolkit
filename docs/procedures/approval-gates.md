# Procedure: Approval Gates

Two mandatory approval gates block the pipeline. **No phase after a gate may start without a
verified, written approval record.** This is a hard stop — not a suggestion.

---

## Gate 1 — Docs Approval (after validation passes)

### Step 1 — Present documents

Show the user a summary of the generated documents:
- `{PREFIX}-Requirements.md` — N use cases, N business rules, N acceptance criteria
- `{PREFIX}-Tech-Spec.md` — N endpoints, N entities, N new files
- `{PREFIX}-Validation-Report.md` — N gaps found / 0 gaps

### Step 2 — Request explicit sign-off

Use `AskUserQuestion` with this exact phrasing:

> **"Please review the documents above and choose one of the options below.
> The pipeline CANNOT continue until you make a selection."**

Options:
- **"Approve — proceed to Work Breakdown"**
- **"Request changes"** — describe what to change; the pipeline re-runs affected agents, re-validates, and returns here (max 2 revision cycles)
- **"Approve with notes"** — accepted with comments recorded in the approval file

### Step 3 — Write approval record BEFORE continuing

Immediately after the user approves, write `{PREFIX}-Approvals.md`:

```markdown
# Approval Record — {PREFIX}

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Requirements.md | ✅ Approved | {date} | {notes or —} |
| {PREFIX}-Tech-Spec.md | ✅ Approved | {date} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {date} | {notes or —} |

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | {action} | {date} | {details} |
```

### Step 4 — Verify the file was written

Read back `{PREFIX}-Approvals.md` and confirm it contains the Gate 1 section with ✅ status.
If the file is missing or incomplete, **do not proceed** — write it again.

---

## Gate 2 — Work Breakdown Approval (after WB generation)

### Step 1 — Pre-condition check (MANDATORY)

**Before doing anything in this gate**, read `{PREFIX}-Approvals.md` and verify it contains
"Gate 1 — Document Approvals" with ✅ status on all three documents.

If Gate 1 approval is missing:
```
⛔ HARD STOP — Gate 1 approval not found in {PREFIX}-Approvals.md.
   Work Breakdown Approval cannot proceed without prior document approval.
   Returning to Gate 1.
```
Go back and execute Gate 1 before continuing.

### Step 2 — Present Work Breakdown

Show key metrics:
- User Stories: N (US-01 ÷ US-NN)
- Total tasks: N (DB:N, BE:N, FE:N, INFRA:N, TEST:N)
- Implementation phases: N
- Human estimate: ~Nh | Agent estimate: ~Nh Nmin
- Reference: `{PREFIX}-Effort-Estimate.md` for full detail

### Step 3 — Request explicit sign-off

Use `AskUserQuestion`:

> **"Please review the Work Breakdown above and choose one of the options below.
> Implementation CANNOT start until you approve."**

Options:
- **"Approve — start implementation"**
- **"Request changes"** — re-run `generate-work-breakdown` with feedback (max 2 cycles)
- **"Approve with notes"** — accepted with comments recorded

### Step 4 — Update approval record BEFORE starting implementation

Append to `{PREFIX}-Approvals.md`:

```markdown
## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Work-Breakdown.md | ✅ Approved | {date} | {N} tasks, {N} phases |
```

### Step 5 — Verify before proceeding

Read back `{PREFIX}-Approvals.md` and confirm Gate 2 section is present with ✅ status.
If missing, **do not start implementation** — write it again.

---

## Pre-condition check for implementation (Phase 6)

**At the very start of Phase 6 (before creating the branch or writing any code)**,
read `{PREFIX}-Approvals.md` and verify BOTH gates are present and approved:

```
✅ Gate 1 — Document Approvals: Requirements ✅ | Tech-Spec ✅ | Validation ✅
✅ Gate 2 — Work Breakdown Approval: Work-Breakdown ✅
```

If either gate is missing or shows a non-✅ status:
```
⛔ HARD STOP — Required approval missing in {PREFIX}-Approvals.md.
   Gate {N} approval is required before implementation can start.
   Returning to Gate {N}.
```

This check is the last line of defence. Even if the PM believes it ran the gates, it must
verify the file on disk before touching the codebase.

---

## Rules

- **Gates are hard stops, not suggestions** — the PM must use `AskUserQuestion` and wait for a response; it cannot auto-approve or assume approval
- **Write the approval file before continuing** — the file is the contract; if it doesn't exist, the gate did not happen
- **Verify the file after writing** — read it back to confirm
- **Pre-condition check at Phase 6** — always verify both gates on disk before any code change
- **Max 2 revision cycles** per gate — if still not approved after 2 cycles, stop and escalate to user
- **Log every gate event** in the process log (gate opened, user response, file written, pre-condition check result)
