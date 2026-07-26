# Functional Requirements — Rewrite Orchestrators as Workflow Scripts

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-009 — Rewrite Orchestrators as Workflow Scripts |
| Version | 1.0 |
| Date | 2026-07-26 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Purpose

This document defines the functional requirements for replacing the `project-manager.md` and `assessment-manager.md` subagent-style orchestrators with Claude Code Workflow scripts (`.js` files in `.claude/workflows/`), and for updating the `implement-feature` and `assess-codebase` skills to invoke those workflow phases sequentially with gates handled in the main loop.

### 1.2 Scope

**In scope:**
- Five new Claude Code Workflow scripts covering the full feature delivery and assessment pipelines.
- Rewrites of `implement-feature.md` and `assess-codebase.md` skills.
- Update to `install-toolkit.md` and `bin/cli.js` to include `.claude/workflows/` in the install copy list.
- Deletion of `.claude/agents/project-manager.md` and `.claude/agents/assessment-manager.md`.

**Out of scope:**
- Rewriting any worker agent `.md` file (`generate-requirements`, `developer-backend`, `developer-frontend`, `developer-testing`, `review-solution`, `generate-work-breakdown`, `validate-feature-docs`, `generate-tech-spec`, `generic-software-assessment`, `layered-architecture-assessment`, `concurrency-safety-assessment`, `intervention-documentation-standard`, and all remediation agents).
- CI/CD pipeline changes.
- Changing gate approval semantics, feature.md schema, or downstream document formats.
- Introducing new worker agents or pipeline phases.
- Phase-resume flag (`--phase=N`) for recovering interrupted runs.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Toolkit user | Developer or tech lead who invokes `/implement-feature` or `/assess-codebase`; expects deterministic pipelines and accurate per-agent cost reporting |
| Claude Code harness | Executes Workflow scripts; provides real subagent boundaries and native `usage` data per `agentType:` call |
| Toolkit maintainer | Authors and maintains workflow scripts and updated skills |

---

## 2. Use Cases

### UC-01: Run the Feature Delivery Pipeline via `/implement-feature`

| Field | Value |
|-------|-------|
| Actor | Toolkit user |
| Preconditions | `feature.md` exists at the specified path; Claude Code harness supports `.js` workflows in `.claude/workflows/`; FTR-007 per-agent model frontmatter is in place |
| Trigger | User invokes `/implement-feature docs/features/FTR-XXX-slug/feature.md` |
| Priority | Must |

**Main flow:**
1. Skill reads the feature path.
2. Skill invokes `pm-phase1` workflow synchronously.
3. `pm-phase1` performs discovery, generates Requirements, Tech-Spec, validates docs, and writes Effort-Estimate. Each worker agent is called via `agentType:`, producing real `usage` data.
4. `pm-phase1` returns outputs and accumulated token usage to the skill.
5. Skill presents Gate 1 (document approval) directly to the user in the main loop. Waits for explicit text approval before proceeding.
6. Skill invokes `pm-phase2` workflow synchronously.
7. `pm-phase2` generates the Work Breakdown.
8. `pm-phase2` returns outputs and token usage to the skill.
9. Skill presents Gate 2 (work breakdown approval) directly to the user in the main loop. Waits for explicit text approval before proceeding.
10. Skill invokes `pm-phase3` workflow synchronously.
11. `pm-phase3` dispatches developer agents per the work breakdown, runs review-solution, opens a PR. Accumulates token usage and writes the final Token-Estimate file with real per-agent actuals.
12. Skill reports the PR URL and final token summary to the user.

**Alternative flows:**
- User rejects at Gate 1 → skill exits. No subsequent workflow phases are invoked.
- User rejects at Gate 2 → skill exits. No `pm-phase3` is invoked.

**Error flows:**
- A worker agent called via `agentType:` fails mid-phase → the workflow surfaces the error to the skill, which reports it to the user. No silent continuation.
- A phase workflow is interrupted (context limit) → the skill reports the interruption. No partial state is silently lost.

**Postconditions:**
- Requirements, Tech-Spec, Validation-Report, Approvals, Work-Breakdown, Effort-Estimate, Token-Estimate, and a PR exist on disk or were reported.
- Token-Estimate contains non-N/A per-agent token rows for every worker agent invoked (AC-03).
- Each worker agent was dispatched on its declared `model:` (AC-05).

---

### UC-02: Run the Assessment Pipeline via `/assess-codebase`

| Field | Value |
|-------|-------|
| Actor | Toolkit user |
| Preconditions | Target codebase path exists; Claude Code harness supports `.js` workflows |
| Trigger | User invokes `/assess-codebase [path] [--scope=...]` |
| Priority | Must |

**Main flow:**
1. Skill invokes `am-phase1` workflow synchronously.
2. `am-phase1` performs discovery, runs parallel assessment agents (each via `agentType:`), runs `intervention-documentation-standard`, writes Effort-Estimate and Token-Estimate with per-agent actuals.
3. `am-phase1` returns the intervention index and token summary to the skill.
4. Skill presents the Findings Gate directly to the user in the main loop. Waits for acknowledgement and flagged intervention selections.
5. Skill invokes `am-phase2` workflow synchronously.
6. `am-phase2` writes the Approvals file, updates the Assessment Registry, writes the Assessment Summary.
7. Skill confirms completion to the user.

**Alternative flows:**
- User rejects/does not acknowledge at the Findings Gate → skill exits. `am-phase2` is not invoked.

**Error flows:**
- An assessment agent fails → workflow logs the failure and continues. Partial assessments are preferred over a full abort.
- `usage` data is missing from an agent call response → that agent's token row is written as N/A in the Token-Estimate rather than crashing the accumulation loop.

**Postconditions:**
- Assessment output files, Interventions-Index, Approvals, Effort-Estimate, and Token-Estimate exist on disk.
- Token-Estimate contains non-N/A per-agent token rows for every assessment agent invoked (AC-04).

---

### UC-03: Install Toolkit Including Workflow Scripts

| Field | Value |
|-------|-------|
| Actor | Toolkit maintainer / Toolkit user |
| Preconditions | `install-toolkit` agent or `bin/cli.js` is run against a destination project |
| Trigger | User runs `install-toolkit` agent or `npx @dtlabs/ai-toolkit --local <dest>` |
| Priority | Must |

**Main flow:**
1. Install process enumerates `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/workflows/`, and `docs/procedures/`.
2. All five workflow scripts (`pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, `am-phase1.js`, `am-phase2.js`) are included in the copy list.
3. Files are copied to the destination following the existing NEW / SAME / MODIFIED logic.
4. Destination project's skills can invoke workflows correctly after install.

**Postconditions:**
- `.claude/workflows/` directory and all five workflow scripts are present in the destination (AC-09).

---

### UC-04: Retire the Old Orchestrator Agent Files

| Field | Value |
|-------|-------|
| Actor | Toolkit maintainer |
| Preconditions | Repository contains `.claude/agents/project-manager.md` and `.claude/agents/assessment-manager.md` |
| Trigger | This feature is applied |
| Priority | Must |

**Main flow:**
1. `project-manager.md` is deleted from `.claude/agents/`.
2. `assessment-manager.md` is deleted from `.claude/agents/`.

**Postconditions:**
- Neither file exists in `.claude/agents/` (AC-01).
- No worker agent file was modified (AC-10).

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Gate presentation (Gate 1, Gate 2, Findings Gate) must occur in the skill's main loop, not inside a subagent. The skill must block until the user approves before invoking the next workflow phase. | UC-01, UC-02, AC-06, AC-07, AC-08 |
| BR-02 | Worker agents listed in `.claude/agents/` must not be modified — byte-for-byte identical to pre-change state. | UC-01, UC-02, AC-10 |
| BR-03 | `project-manager.md` and `assessment-manager.md` must be deleted. The old files are not kept alongside the new workflows. | UC-04, AC-01 |
| BR-04 | Per-agent token rows in the Token-Estimate file use proportional distribution of the phase total (since only phase-level `subagent_tokens` are available from workflow invocations). Each such row is marked `*(proportional)*`. Phase totals and grand total are exact measurements. | UC-01, UC-02 |
| BR-05 | All five workflow scripts (`pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, `am-phase1.js`, `am-phase2.js`) must be valid JavaScript and reside in `.claude/workflows/`. | UC-01, UC-02, AC-02 |
| BR-06 | Worker agents within workflow scripts must be called via `agentType:`, not inline execution, to preserve real subagent boundaries and per-agent model assignment. | UC-01, UC-02, AC-05 |
| BR-07 | Token-Estimate file format is unchanged from the existing FTR-001/FTR-002 format; only the data sourcing method changes. | UC-01, UC-02 |
| BR-08 | `install-toolkit.md` and `bin/cli.js` must include `.claude/workflows/` as an additional source directory to copy. | UC-03, AC-09 |

---

## 4. Data Requirements

### 4.1 Entities

**Workflow Script Files** — five new JavaScript files:

| File | Location | Purpose |
|------|----------|---------|
| `pm-phase1.js` | `.claude/workflows/` | Discovery + Requirements + Tech-Spec + Validation + Effort Estimate |
| `pm-phase2.js` | `.claude/workflows/` | Work Breakdown + task-level estimates |
| `pm-phase3.js` | `.claude/workflows/` | Implementation dispatch + Review + PR + Token-Estimate write |
| `am-phase1.js` | `.claude/workflows/` | Discovery + parallel assessments + Intervention docs + Effort/Token Estimates |
| `am-phase2.js` | `.claude/workflows/` | Approvals + Registry update + Assessment Summary |

**Modified Files:**

| File | Change |
|------|--------|
| `.claude/skills/implement-feature.md` | Replace PM subagent spawn with sequential pm-phase1/2/3 workflow invocations; handle gate presentation in the main loop |
| `.claude/skills/assess-codebase.md` | Replace AM subagent spawn with sequential am-phase1/2 workflow invocations; handle Findings Gate in the main loop |
| `.claude/agents/install-toolkit.md` | Add `.claude/workflows/` to directories copied to destination projects |
| `bin/cli.js` | Add `.claude/workflows/` to the install copy list |

**Deleted Files:**

| File | Reason |
|------|--------|
| `.claude/agents/project-manager.md` | Replaced by workflow scripts + updated skill |
| `.claude/agents/assessment-manager.md` | Replaced by workflow scripts + updated skill |

**Token-Estimate output format** — unchanged from FTR-001/FTR-002. Data sourcing:
- Phase totals (exact): each workflow's `subagent_tokens` from the task notification.
- Per-agent rows (proportional): distributed from the phase total using estimated weights, marked `*(proportional)*` with a disclaimer in the file.
- Grand total (exact): sum of all phase totals.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| Workflow script | Must be syntactically valid JavaScript |
| Workflow output (Token-Estimate proportional rows) | Must include the disclaimer: "Per-agent values are proportional distributions of the phase total. Phase totals and grand total are exact measurements." |
| Gate approval | Must be a text reply from the user before the next workflow phase is invoked |
| `usage` data missing | Token row written as N/A; pipeline does not crash |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Determinism | Pipeline execution must be deterministic regardless of subagent spawn depth — Workflow scripts do not rely on inline fallback behaviour |
| NFR-02 | Accuracy | Per-agent token tracking must produce non-N/A values for every agent invoked via `agentType:` in a Workflow; the current N/A-for-all issue is fully resolved |
| NFR-03 | Backward compatibility | Projects that have already installed the toolkit continue to operate with the old PM/AM agent files until they re-run `install-toolkit`; old files are inert once the skills no longer reference them |
| NFR-04 | Maintainability | Worker agent `.md` files remain unchanged, preserving byte-level compatibility |
| NFR-05 | Cost efficiency | FTR-007 per-agent model assignment becomes effective because `agentType:` calls honour the `model:` frontmatter |

---

## 6. UI Requirements

### 6.1 Pages / Screens

This feature is entirely CLI/agent-based. No browser UI is involved.

**Gate 1 (Feature Delivery — Document Approval):**
- Content presented in the skill's main loop.
- Same text as the current Gate 1 in `docs/procedures/approval-gates.md`.
- User must reply with explicit approval text before `pm-phase2` is invoked.

**Gate 2 (Feature Delivery — Work Breakdown Approval):**
- Content presented in the skill's main loop.
- Same text as the current Gate 2 in `docs/procedures/approval-gates.md`.
- User must reply with explicit approval text before `pm-phase3` is invoked.

**Findings Gate (Assessment Pipeline):**
- Content presented in the skill's main loop.
- Same text as the current Findings Gate in `docs/procedures/assessment-findings-gate.md`.
- User must acknowledge and provide flagged intervention selections before `am-phase2` is invoked.

### 6.2 Navigation Flow

```
/implement-feature feature.md
  → pm-phase1 workflow (blocking)
  → GATE 1 (skill presents, user approves)
  → pm-phase2 workflow (blocking)
  → GATE 2 (skill presents, user approves)
  → pm-phase3 workflow (blocking)
  → Skill reports PR URL + token summary

/assess-codebase [path]
  → am-phase1 workflow (blocking)
  → FINDINGS GATE (skill presents, user acknowledges + flags)
  → am-phase2 workflow (blocking)
  → Skill confirms completion
```

---

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given `.claude/agents/` after this feature is applied, then `project-manager.md` and `assessment-manager.md` do not exist | UC-04 |
| AC-02 | Given `.claude/workflows/` after the change is applied, then files `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, `am-phase1.js`, `am-phase2.js` exist and are valid JavaScript | UC-01, UC-02 |
| AC-03 | Given a full `/implement-feature` run on a real feature that completes end-to-end, then the Token-Estimate contains non-N/A per-agent token rows for every worker agent invoked | UC-01 |
| AC-04 | Given a full `/assess-codebase` run on a real target that completes end-to-end, then the Token-Estimate contains non-N/A per-agent token rows for every assessment agent invoked | UC-02 |
| AC-05 | Given the worker agents listed in the FTR-007 mapping, when a pipeline run completes, then each worker agent is dispatched on its declared `model:` (sonnet/haiku/opus as per FTR-007), verifiable via logged usage model fields | UC-01, UC-02 |
| AC-06 | Given the `implement-feature` skill, when a pipeline run reaches Gate 1, then Gate 1 content is presented in the main loop (not inside a subagent) and the skill blocks until the user approves | UC-01 |
| AC-07 | Given the `implement-feature` skill, when a pipeline run reaches Gate 2, then Gate 2 content is presented in the main loop and the skill blocks until the user approves | UC-01 |
| AC-08 | Given the `assess-codebase` skill, when a pipeline run reaches the Findings Gate, then the Findings Gate content is presented in the main loop and the skill blocks until the user approves | UC-02 |
| AC-09 | Given `install-toolkit` run against a destination project, when the install completes, then `.claude/workflows/` directory and all five workflow scripts are present in the destination | UC-03 |
| AC-10 | Given all existing worker agent `.md` files, when the change is applied, then no worker agent file is modified — byte-for-byte identical to pre-change state | UC-01, UC-02 |

---

## 8. Dependencies & Assumptions

**Dependencies:**
- **FTR-007 (Per-Agent Model Assignment):** All worker agents must carry correct `model:` frontmatter. FTR-007 is `completed` in the registry — this dependency is satisfied.
- **Claude Code Workflow SDK:** Assumes `.js` workflows in `.claude/workflows/` are executed by the Claude Code harness with `agentType:` calls that return `usage` data at the workflow invocation boundary (phase granularity). Per-agent `usage` data within a single workflow invocation is not available individually.
- **Document formats:** Requirements, Tech-Spec, Work Breakdown, Token-Estimate, and Effort-Estimate file formats are unchanged.
- **Convention note:** This is a toolkit-internal feature. Docs live in `internal_docs/features/FTR-009-workflow-orchestrators/`.

**Assumptions:**
- The Claude Code harness exposes `subagent_tokens` at phase granularity (per workflow invocation) via the task notification, not per `agentType:` call inside the workflow.
- Backward compatibility is acceptable — old projects re-run `install-toolkit` to receive workflow scripts; old PM/AM files are inert once skills no longer invoke them.
- Token-Estimate proportional distribution with a clear disclaimer satisfies per-agent cost reporting requirements for FTR-007 model-effectiveness verification.

**Cross-feature relationships:**
- DEPENDENCY on FTR-007 (satisfied).
- OVERLAP with FTR-001 (Assessment Token Estimation): data sourcing changes but format unchanged — no conflict.
- OVERLAP with FTR-002 (Assessment Effort Estimation): AM pipeline restructured but effort format unchanged — no conflict.
- OVERLAP with FTR-008 (Compact Instructions): both modify `install-toolkit.md`; changes are additive and must be combined without clobbering FTR-008's Step 6.

---

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| OQ-1 | If `pm-phase3` is interrupted mid-implementation, should the skill support a `--phase=3 --resume` flag to re-enter from the last completed task? | Medium — affects recoverability on large features | Deferred to a follow-up feature |
| OQ-2 | Do Workflow scripts in `.claude/workflows/` support `agentType:` calls that return `usage` data at the invocation boundary? | High — underpins AC-03 and AC-04 | Must be verified in the tech spec; if not supported, the implementation approach needs revision |
