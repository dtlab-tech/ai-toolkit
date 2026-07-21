# Work Breakdown — Assessment Intervention Commands

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-005 — Assessment Intervention Commands |
| Version | 1.0 |
| Date | 2026-07-21 |
| Status | Draft |
| Source: Requirements | FTR-005-Requirements.md |
| Source: Tech-Spec | FTR-005-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 2 |
| Total Tasks | 2 |
| Domain distribution | DB: 0, BE: 0, FE: 0, INFRA: 2, TEST: 0 |
| Complexity | S: 0, M: 2, L: 0 |
| Estimated total (Human) | 4h |
| Estimated total (Agent) | 30min |
| Implementation phases | 1 |

---

## 2. Shared Infrastructure Tasks

None. Both User Stories are fully independent — they produce separate, non-overlapping command files with no shared setup required. No INFRA-TXX tasks.

---

## 3. User Stories

### US-01: Find Next Un-Actioned Flagged Intervention

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | Tech Lead / Project Manager |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02, AC-03, AC-04, AC-09, AC-10, AC-11, AC-12, AC-13 |

**Description:**
As a Tech Lead, I want to invoke `/next-intervention [prefix]` and immediately know which flagged intervention I should act on next and how to start it, so that I can transition from assessment output to feature delivery without manual cross-referencing.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Write `/next-intervention` command file | INFRA | none | M | 2h | 15min | Create `.claude/commands/next-intervention.md` with frontmatter (`description`, `argument-hint`, `allowed-tools: Read, Glob, Grep`) and full instruction logic covering: prefix normalisation, assessment directory check, Approvals file check (existence + FTR-003 format detection), flagged intervention extraction in document order, feature folder matching (slug match then body match against `internal_docs/features/` and `docs/features/`), first-un-actioned output with exact doc path and `/define-feature` invocation, and all edge case outputs (zero flagged, all actioned, missing prefix listing, missing dir, missing Approvals, old format). |

---

### US-02: Get Full Interventions Reconciliation View

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Tech Lead / Project Manager |
| Priority | Must |
| Acceptance Criteria | AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-13 |

**Description:**
As a Tech Lead, I want to invoke `/check-interventions [prefix]` and see a complete, structured reconciliation of all interventions — their document file presence, Approvals/Index consistency, and feature-actioning status — so that I can quickly identify gaps before a planning session or when onboarding another engineer.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Write `/check-interventions` command file | INFRA | none | M | 2h | 15min | Create `.claude/commands/check-interventions.md` with frontmatter (`description`, `argument-hint`, `allowed-tools: Read, Glob, Grep`) and full instruction logic covering: same prefix/directory/Approvals checks as US-01-T01; Interventions Index read (graceful degradation if missing); unified INT-NNN list from both sources; per-intervention checks (doc file existence via glob, in-approvals status, flagged value, in-index status, title/criticality from index, actioned status via slug+body match for flagged items); reconciliation table rendering with clear symbols; inconsistency section (INT-NNN in Approvals but not Index, in Index but not Approvals, malformed Flagged values). |

---

## 4. Dependency Graph

### Implementation Phases

Both User Stories have no inter-dependencies and no shared infrastructure. They can be dispatched in parallel within a single phase.

#### Phase 1 — Command Implementation (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Write `/next-intervention` command file | INFRA |
| US-02-T01 | Write `/check-interventions` command file | INFRA |

Both tasks run in parallel. After both complete, the US-01 and US-02 reviews are triggered.

### Critical Path

```
US-01-T01 (15min)
              └── review US-01 (~5min)
US-02-T01 (15min)  [parallel]
              └── review US-02 (~5min)
```

Minimum calendar time (agent): ~20min (parallel dispatch)

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| DB | 0 | 0 | 0 | 0 | 0h | 0min |
| BE | 0 | 0 | 0 | 0 | 0h | 0min |
| FE | 0 | 0 | 0 | 0 | 0h | 0min |
| INFRA | 2 | 0 | 2 | 0 | 4h | 30min |
| TEST | 0 | 0 | 0 | 0 | 0h | 0min |
| **Total** | **2** | **0** | **2** | **0** | **4h** | **30min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|-------|-------------|
| UC-01 | US-01 | US-01-T01 | AC-01, AC-02, AC-03, AC-04, AC-09, AC-10, AC-11, AC-12, AC-13 |
| UC-02 | US-02 | US-02-T01 | AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-13 |

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Slug/body match heuristic may produce false positives across assessment prefixes | US-01-T01 and US-02-T01 implement the heuristic as specified; a false positive would cause `/next-intervention` to skip an intervention incorrectly | Accept as-is per feature.md decision; document as known limitation in command file comment |
| 2 | The Approvals file table format may vary slightly between assessment runs (extra columns, different ordering) | Both command file tasks must use robust column-name-based parsing rather than positional parsing | Specify in task instructions to match on `Flagged` column header by name |
