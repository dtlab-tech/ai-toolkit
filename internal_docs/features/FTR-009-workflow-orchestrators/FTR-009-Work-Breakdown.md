# Work Breakdown — Rewrite Orchestrators as Workflow Scripts

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-009 — Rewrite Orchestrators as Workflow Scripts |
| Version | 1.0 |
| Date | 2026-07-26 |
| Status | Draft |
| Source: Requirements | FTR-009-Requirements.md |
| Source: Tech-Spec | FTR-009-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 4 |
| Total Tasks | 15 |
| Domain distribution | DB: 0, BE: 11, FE: 0, INFRA: 4, TEST: 0 |
| Complexity | S: 6, M: 7, L: 2 |
| Estimated total (Human) | ~34h |
| Estimated total (Agent) | ~135min |
| Implementation phases | 5 |

> Note: This is a pure-tooling feature. "BE" domain covers JavaScript workflow scripts and Markdown skill/agent file rewrites. No DB, FE, or TEST domain tasks — verification is manual/integration-level per the Tech-Spec AC mappings.

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Create `.claude/workflows/` directory | INFRA | All workflow scripts | S | 15min | 2min | Create the `.claude/workflows/` directory in the repository root. This directory will hold all five workflow `.js` files. |
| INFRA-T02 | Delete `project-manager.md` | INFRA | US-04 | S | 5min | 1min | Delete `.claude/agents/project-manager.md`. Verify no other file references it after the skills are updated. |
| INFRA-T03 | Delete `assessment-manager.md` | INFRA | US-04 | S | 5min | 1min | Delete `.claude/agents/assessment-manager.md`. Verify no other file references it after the skills are updated. |

---

## 3. User Stories

### US-01: Feature Delivery Workflow Scripts

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | Toolkit user, Claude Code harness |
| Priority | Must |
| Acceptance Criteria | AC-02, AC-03, AC-05 |

**Description:**
As a toolkit user, I want the feature delivery pipeline to run through typed Workflow scripts so that worker agents are dispatched with real subagent boundaries, producing accurate per-agent token data and honouring per-agent model assignments.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Implement `pm-phase1.js` | BE | INFRA-T01 | L | 8h | 45min | Write the documentation phase workflow: read feature.md, invoke `generate-requirements`, `generate-tech-spec`, `validate-feature-docs` via `agentType:`, handle revision loop (max 3 cycles), write Effort-Estimate stub, accumulate token ledger, return gate1_payload. Follow Tech-Spec §4.1. |
| US-01-T02 | Implement `pm-phase2.js` | BE | INFRA-T01 | M | 3h | 20min | Write the work breakdown phase workflow: verify Gate 1 approval in Approvals.md, invoke `generate-work-breakdown` via `agentType:`, parse WB for estimates, update Effort-Estimate, accumulate token ledger, return gate2_payload. Follow Tech-Spec §4.2. |
| US-01-T03 | Implement `pm-phase3.js` | BE | INFRA-T01, US-01-T01, US-01-T02 | L | 12h | 60min | Write the implementation phase workflow: verify both gates, parse Work Breakdown, implementation loop (developer agents via agentType:, review-solution, git commit per US, rework max 2 cycles, Issues Register), remediation loop, PR creation, Feature Registry update, write Token-Estimate and Effort-Estimate actuals, return result. Follow Tech-Spec §4.3. |

---

### US-02: Assessment Workflow Scripts

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Toolkit user, Claude Code harness |
| Priority | Must |
| Acceptance Criteria | AC-02, AC-04, AC-05 |

**Description:**
As a toolkit user, I want the assessment pipeline to run through typed Workflow scripts so that assessment agents are dispatched with real subagent boundaries and per-agent token data is accurately captured.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Implement `am-phase1.js` | BE | INFRA-T01 | M | 4h | 30min | Write the assessment phase workflow: discover assessment agents, apply scope filter, invoke all qualifying agents in parallel via `agentType:`, invoke `intervention-documentation-standard`, write Token-Estimate and Effort-Estimate, return findings_gate_payload. Follow Tech-Spec §4.4. |
| US-02-T02 | Implement `am-phase2.js` | BE | INFRA-T01 | M | 2h | 15min | Write the post-gate workflow: write Approvals file with flagged/unflagged rows, append to assessment registry, write Assessment Summary, append to process log, return result. Follow Tech-Spec §4.5. |

---

### US-03: Updated Skills and Install Files

| Field | Value |
|-------|-------|
| Derived from | UC-01, UC-02, UC-03 |
| Actor | Toolkit user, Toolkit maintainer |
| Priority | Must |
| Acceptance Criteria | AC-06, AC-07, AC-08, AC-09 |

**Description:**
As a toolkit user, I want the `implement-feature` and `assess-codebase` skills to invoke workflow phases sequentially and present gates in the main loop, and I want `install-toolkit` to copy workflow scripts to destination projects.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Rewrite `implement-feature.md` skill | BE | US-01-T01, US-01-T02, US-01-T03 | M | 2h | 15min | Replace the single `project-manager` subagent spawn with sequential pm-phase1/2/3 workflow invocations. Move Gate 1 and Gate 2 hard-stop presentation into the skill's main loop. Write/verify Approvals.md between phases. Append orchestrator row + grand total to Token-Estimate at the end. Follow Tech-Spec §5.1. |
| US-03-T02 | Rewrite `assess-codebase.md` skill | BE | US-02-T01, US-02-T02 | M | 2h | 15min | Replace the single `assessment-manager` subagent spawn with sequential am-phase1/2 workflow invocations. Move the Findings Gate hard-stop presentation (acknowledgement + flagging) into the skill's main loop. Append orchestrator row + grand total to Token-Estimate at the end. Follow Tech-Spec §5.2. |
| US-03-T03 | Update `install-toolkit.md` | BE | INFRA-T01 | S | 1h | 8min | Add `.claude/workflows/` to the Step 2 source directories table. Add workflow scripts to the plan display example. No other step changes. Follow Tech-Spec §6.1. |
| US-03-T04 | Update `bin/cli.js` installGlobal | BE | INFRA-T01 | S | 1h | 8min | Add `.claude/workflows/` mapping to the `installGlobal` function's mappings array. Verify that `installLocal` already includes workflows via the whole-`.claude/`-subtree walk (no change needed there). Follow Tech-Spec §6.2. |

---

### US-04: Delete Orchestrator Agent Files

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | Toolkit maintainer |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-10 |

**Description:**
As a toolkit maintainer, I want the old orchestrator agent files removed from `.claude/agents/` so that the directory contains only worker agents and the new workflow scripts replace orchestration duties entirely.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Delete `project-manager.md` | INFRA | US-03-T01 | S | 5min | 1min | Delete `.claude/agents/project-manager.md`. The updated `implement-feature.md` skill must not reference it. Verify `git rm`. |
| US-04-T02 | Delete `assessment-manager.md` | INFRA | US-03-T02 | S | 5min | 1min | Delete `.claude/agents/assessment-manager.md`. The updated `assess-codebase.md` skill must not reference it. Verify `git rm`. |

---

## 4. Dependency Graph

### Implementation Phases

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Create `.claude/workflows/` directory | INFRA |

#### Phase 2 — US-01 + US-02: Workflow Scripts (depends on Phase 1)

All five workflow scripts are independent of each other and can be implemented in parallel.

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Implement `pm-phase1.js` | BE |
| US-01-T02 | Implement `pm-phase2.js` | BE |
| US-02-T01 | Implement `am-phase1.js` | BE |
| US-02-T02 | Implement `am-phase2.js` | BE |

> Note: US-01-T03 (`pm-phase3.js`) depends on US-01-T01 and US-01-T02 being logically consistent but not on their file output — it is deferred to Phase 3.

#### Phase 3 — pm-phase3.js (depends on US-01-T01, US-01-T02)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T03 | Implement `pm-phase3.js` | BE |

#### Phase 4 — US-03: Updated Skills and Install Files (depends on Phases 2 and 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Rewrite `implement-feature.md` skill | BE |
| US-03-T02 | Rewrite `assess-codebase.md` skill | BE |
| US-03-T03 | Update `install-toolkit.md` | BE |
| US-03-T04 | Update `bin/cli.js` installGlobal | BE |

#### Phase 5 — US-04: Delete Orchestrator Files (depends on Phase 4)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Delete `project-manager.md` | INFRA |
| US-04-T02 | Delete `assessment-manager.md` | INFRA |

### Critical Path

```
INFRA-T01 → US-01-T01 → US-01-T03 → US-03-T01 → US-04-T01
```

Minimum calendar time (agent estimates): 2 + 45 + 60 + 15 + 1 = 123 min ≈ 2h 3min

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| DB | 0 | 0 | 0 | 0 | — | — |
| BE | 11 | 4 | 5 | 2 | ~31h | ~121min |
| FE | 0 | 0 | 0 | 0 | — | — |
| INFRA | 4 | 4 | 0 | 0 | ~25min | ~5min |
| TEST | 0 | 0 | 0 | 0 | — | — |
| **Total** | **15** | **8** | **5** | **2** | **~34h** | **~126min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03 | AC-02, AC-03, AC-05 |
| UC-02 | US-02 | US-02-T01, US-02-T02 | AC-02, AC-04, AC-05 |
| UC-01, UC-02, UC-03 | US-03 | US-03-T01, US-03-T02, US-03-T03, US-03-T04 | AC-06, AC-07, AC-08, AC-09 |
| UC-04 | US-04 | US-04-T01, US-04-T02 (+ INFRA-T02, INFRA-T03) | AC-01, AC-10 |

> Note: AC-10 (worker agents byte-for-byte identical) is verified by the absence of any worker agent modification task in this work breakdown — no worker agent task exists.

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | OQ-2: Workflow SDK API — does `workflow.agent()` return per-agent `usage` inside the workflow or only phase-level `subagent_tokens` at the workflow boundary? | Affects how token data is accumulated in pm-phase1/2/3 and am-phase1/2 (US-01-T01..T03, US-02-T01..T02) | Verify SDK API before starting Phase 2 tasks; if per-agent `usage` unavailable, implement proportional distribution with disclaimer as specified in Tech-Spec §8 |
| 2 | `bin/cli.js` global install may already include workflows/ if the existing mapping covers all of `.claude/` | Could make US-03-T04 a no-op | Verify the `installGlobal` mappings array; if workflows/ is already included, mark the task as verified (not modified) |
