# Work Breakdown — Compact Instructions Block

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-008 — Compact Instructions Block |
| Version | 1.0 |
| Date | 2026-07-26 |
| Status | Draft |
| Source: Requirements | FTR-008-Requirements.md |
| Source: Tech-Spec | FTR-008-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 3 |
| Total Tasks | 5 |
| Domain distribution | DB: 0, BE: 0, FE: 0, INFRA: 4, TEST: 1 |
| Complexity | S: 2, M: 3, L: 0 |
| Estimated total (Human) | ~6.5h |
| Estimated total (Agent) | ~35min |
| Implementation phases | 3 (Phase 1: INFRA setup; Phase 2: US-01+US-03; Phase 3: US-02) |

---

## 2. Shared Infrastructure Tasks

No shared infrastructure tasks are required. This feature consists entirely of Markdown/text file modifications to:
- `.claude/agents/install-toolkit.md` (toolkit file)
- `~/.claude/CLAUDE.md` (user runtime artifact, written at execution time by the installer)

There are no shared DB schemas, middleware registrations, or build artifacts.

---

## 3. User Stories

### US-01: Add Compact Instructions Section (One-Time Setup)

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | User / install-toolkit agent |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02, AC-03, AC-04, AC-09 |

**Description:**
As a user, I want to append the `# Compact instructions` section to my global `~/.claude/CLAUDE.md` file, so that Claude's auto-compaction preserves decision-critical information and discards noise.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Write idempotent section-append logic | INFRA | none | M | 2h | 15min | Implement the full setup flow: resolve `~/.claude/CLAUDE.md` path (cross-platform), idempotency check (grep for `^# Compact instructions`), create-or-append the verbatim section from spec Section 8, display confirmation prompt before writing and skip notice on idempotency hit. |

---

### US-02: Topic-Change Notification (Runtime Behaviour)

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Claude (main loop) |
| Priority | Must |
| Acceptance Criteria | AC-05, AC-06, AC-07 |

**Description:**
As Claude, I want to detect topic-change trigger phrases in the user's messages and send a standard compact notification, so that the user can choose to compact context before switching subjects.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Embed trigger phrase list and notification wording in section content | INFRA | US-01-T01 | S | 30min | 5min | Verify that the `# Topic-change notification` subsection within the written `# Compact instructions` block contains the verbatim trigger phrase list (12 phrases, Italian and English) and the exact notification message. This task is satisfied by US-01-T01 writing the correct verbatim content — it exists as a separate task for traceability of AC-05..AC-07. |

---

### US-03: Opt-In During Toolkit Installation

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | install-toolkit agent |
| Priority | Should |
| Acceptance Criteria | AC-08 |

**Description:**
As the install-toolkit agent, I want to offer users an opt-in to add the Compact Instructions section during toolkit installation, so that new users get the feature configured automatically.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Add Step 6 opt-in block to install-toolkit.md | INFRA | none | M | 2h | 10min | Insert a new "Step 6 — Compact Instructions opt-in" section between the current Step 5 (Matt Pocock Skills) and Step 6 (Report) in `.claude/agents/install-toolkit.md`. Renumber Report to Step 7. The new step must: (1) offer the opt-in, (2) execute the idempotency-aware write from US-01-T01 logic on user confirmation, (3) display outcomes in the Report. |
| US-03-T02 | Update Report step in install-toolkit.md | INFRA | US-03-T01 | S | 30min | 5min | Update the Report section (now Step 7) in `install-toolkit.md` to add a "Compact instructions" summary line showing the outcome (added / skipped-present / skipped-declined / skipped-user-said-no). |
| US-03-T03 | Write manual verification tests | TEST | US-01-T01, US-03-T01, US-03-T02 | M | 2h | 10min | Produce a manual verification checklist document (`FTR-008-Test-Checklist.md`) covering AC-01..AC-09. Each test lists: scenario, preconditions, steps, and expected result. |

---

## 4. Dependency Graph

### Implementation Phases

#### Phase 1 — US-01: Add Section Setup Logic (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Write idempotent section-append logic | INFRA |

#### Phase 2 — US-02 + US-03: Runtime Wording + Installer Integration (depends on Phase 1)

These two tasks are independent of each other and can run in parallel:

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Embed trigger phrase list and notification wording in section content | INFRA |
| US-03-T01 | Add Step 6 opt-in block to install-toolkit.md | INFRA |

#### Phase 3 — US-03 Completion: Report Update + Tests (depends on Phase 2)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T02 | Update Report step in install-toolkit.md | INFRA |
| US-03-T03 | Write manual verification tests | TEST |

### Critical Path

```
US-01-T01 → US-02-T01 → (done)
US-01-T01 → US-03-T01 → US-03-T02 → US-03-T03
```

The critical path runs: US-01-T01 → US-03-T01 → US-03-T02 → US-03-T03 (longest chain).

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| DB | 0 | 0 | 0 | 0 | 0h | 0min |
| BE | 0 | 0 | 0 | 0 | 0h | 0min |
| FE | 0 | 0 | 0 | 0 | 0h | 0min |
| INFRA | 4 | 2 | 2 | 0 | 5h | 35min |
| TEST | 1 | 0 | 1 | 0 | 2h | 10min |
| **Total** | **5** | **2** | **3** | **0** | **~6.5h** | **~35min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01 | AC-01, AC-02, AC-03, AC-04, AC-09 |
| UC-02 | US-02 | US-02-T01 | AC-05, AC-06, AC-07 |
| UC-03 | US-03 | US-03-T01, US-03-T02, US-03-T03 | AC-08 |

---

## 7. Open Points and Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | US-02-T01 is logically satisfied by US-01-T01 (the verbatim content already includes the trigger phrase section). | Task exists for traceability only. If reviewer considers it redundant, it can be merged into US-01-T01 scope. | Keep as a separate checklist item; mark PASS in review once US-01-T01 content is verified verbatim. |
| 2 | No AGENTS.md is present in this toolkit repo. Domain classification defaults to INFRA for all configuration/text-file tasks. | All tasks assigned INFRA domain → routed to `developer-backend` agent. | Confirm correct agent assignment: INFRA tasks → `developer-backend`. |
