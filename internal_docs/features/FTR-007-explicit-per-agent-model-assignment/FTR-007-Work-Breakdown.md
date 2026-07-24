# Work Breakdown — Explicit Per-Agent Model Assignment

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-007 — Explicit Per-Agent Model Assignment |
| Version | 1.0 |
| Date | 2026-07-24 |
| Status | Draft |
| Source: Requirements | FTR-007-Requirements.md |
| Source: Tech-Spec | FTR-007-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 2 (US-01 ÷ US-02) |
| Total Tasks | 3 |
| Domain distribution | DB: 0, BE: 0, FE: 0, INFRA: 2, TEST: 1 |
| Complexity | S: 2, M: 1, L: 0 |
| Estimated total (Human) | ~3h |
| Estimated total (Agent) | ~15min |
| Implementation phases | 2 |

> Domain note: agent-definition files are toolkit configuration. The two edit tasks are classified **INFRA** (configuration/manifest changes) per the domain table; the verification task is **TEST** (build/acceptance verification). There is no application DB/BE/FE surface.

---

## 2. Shared Infrastructure Tasks

None. This feature has no cross-US shared-infrastructure prerequisite — the two edit tasks are the work itself and are captured under US-01. (No `INFRA-TXX` virtual story.)

---

## 3. User Stories

### US-01: Apply explicit model assignment to the 15 agents

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | Toolkit maintainer |
| Priority | Must |
| Acceptance Criteria | AC-03, AC-04, AC-05, AC-06 |

**Description:**
As a toolkit maintainer, I want each of the 15 agents currently lacking a `model:` field to declare the correct model, so that every agent runs on the cost-appropriate tier instead of inheriting the session model.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Add `model: sonnet` to the 14 coordination/implementation agents | INFRA | — | M | 1.5h | 8min | Insert `model: sonnet` after the `description:` line in the frontmatter of `assessment-manager`, `project-manager`, `developer-backend`, `developer-frontend`, `developer-testing`, `god-class-decomposition`, `domain-model-refactoring`, `dependency-injection-refactoring`, `security-hardening`, `dependency-supply-chain-security`, `define-feature`, `init-agents-md`, `install-toolkit`, `intervention-documentation-standard`. Change nothing else. |
| US-01-T02 | Add `model: opus` to `review-solution` | INFRA | — | S | 15min | 2min | Insert `model: opus` into the frontmatter of `.claude/agents/review-solution.md`. Change nothing else. |

---

### US-02: Verify coverage and validity of model assignment

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Toolkit maintainer |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02, AC-05, AC-06 |

**Description:**
As a toolkit maintainer, I want to verify that all 22 agents declare a valid model and that only `model:` lines changed, so that the acceptance criteria are provably met with no unintended edits.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Run acceptance verification commands | TEST | US-01-T01, US-01-T02 | S | 30min | 5min | Run: (1) `grep -L "^model:" .claude/agents/*.md` → empty (AC-01); (2) enumerate all `model:` values ⊆ {haiku,sonnet,opus} (AC-02); (3) confirm 14 sonnet + 1 opus (AC-03/AC-04); (4) `git diff` shows exactly one added `model:` line per edited file and no change to the 7 haiku files (AC-05/AC-06). |

---

## 4. Dependency Graph

### Implementation Phases

#### Phase 1 — US-01: Apply model assignment (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Add `model: sonnet` to 14 agents | INFRA |
| US-01-T02 | Add `model: opus` to review-solution | INFRA |

#### Phase 2 — US-02: Verify (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Run acceptance verification commands | TEST |

### Critical Path

```
US-01-T01 (∥ US-01-T02) → US-02-T01
```

US-01-T01 and US-01-T02 are independent and run in parallel within Phase 1. US-02-T01 gates on both.

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| DB | 0 | 0 | 0 | 0 | 0h | 0min |
| BE | 0 | 0 | 0 | 0 | 0h | 0min |
| FE | 0 | 0 | 0 | 0 | 0h | 0min |
| INFRA | 2 | 1 | 1 | 0 | 1.75h | 10min |
| TEST | 1 | 1 | 0 | 0 | 0.5h | 5min |
| **Total** | **3** | **2** | **1** | **0** | **~3h** | **~15min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02 | AC-03, AC-04, AC-05, AC-06 |
| UC-02 | US-02 | US-02-T01 | AC-01, AC-02, AC-05, AC-06 |
| UC-03 | (runtime, harness behaviour — no implementation task) | — | — |

> UC-03 (harness dispatches on declared model) is verified implicitly at runtime; it requires no code and therefore no task. AC-01..AC-06 are all covered by US-01/US-02.

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Frontmatter placement of the `model:` line | Cosmetic only; AC-06 requires just that only a `model:` line is added | Place after `description:`, matching the 7 existing haiku agents. |
| 2 | Risk of touching a non-`model:` line | Would fail AC-06 | Use precise single-line insertion; verify with `git diff` in US-02-T01. |
| 3 | `sonnet` tier for orchestrators may regress on very large features (OQ-2) | None on this WB; reversible post-merge | Monitor; revert to `opus` in one line per orchestrator if needed. |
