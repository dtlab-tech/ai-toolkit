# Functional Requirements — Assessment Intervention Commands

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-005 — Assessment Intervention Commands |
| Version | 1.0 |
| Date | 2026-07-21 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Purpose

This document defines the functional requirements for two read-only commands — `/next-intervention` and `/check-interventions` — that bridge the gap between the assessment pipeline output and the feature delivery pipeline. The requirements are derived exclusively from the FTR-005 feature description.

### 1.2 Scope

**In scope:**

- `/next-intervention [prefix]` command: surfaces the next un-actioned flagged intervention from a completed assessment and suggests the exact `/define-feature` invocation.
- `/check-interventions [prefix]` command: produces a full reconciliation view of all interventions, their document file presence, Approvals/Index consistency, and feature-actioning status.
- Handling of all specified edge cases (missing prefix, missing files, old format, zero flagged, all actioned).
- Support for the FTR-003 Approvals file format only.

**Out of scope:**

- Any writes to any file — both commands are strictly read-only.
- Automatically spawning `/define-feature`.
- Cross-prefix queries.
- Checking whether a linked feature has been fully implemented.
- Modifying or repairing the Approvals file or the Interventions Index.
- Support for assessment prefixes using the pre-FTR-003 Approvals file format.
- A `--all` flag, `--format=json` output mode, or cross-prefix queries (deferred).

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Tech Lead / Project Manager | Invokes `/next-intervention` to discover the next actionable intervention; invokes `/check-interventions` for a full reconciliation overview. |

---

## 2. Use Cases

### UC-01: Find Next Un-Actioned Flagged Intervention

| Field | Value |
|-------|-------|
| Actor | Tech Lead / Project Manager |
| Preconditions | An assessment has been completed; `docs/assessments/{PREFIX}/{PREFIX}-Approvals.md` exists and uses the FTR-003 format (contains `## Interventions Flagged for Feature Delivery` section). |
| Trigger | User invokes `/next-intervention [prefix]`. |
| Priority | Must |

**Main flow:**

1. User invokes `/next-intervention ASSESS-001` (or with a short form such as `001`; the command normalises the prefix).
2. Command reads `docs/assessments/{PREFIX}/{PREFIX}-Approvals.md` and extracts all rows from the `## Interventions Flagged for Feature Delivery` section where `Flagged = "Yes"` (exact value, case-sensitive).
3. For each flagged intervention (in document order, top-to-bottom), the command checks whether a corresponding feature folder exists in `internal_docs/features/` or `docs/features/`:
   - **Slug match (primary):** folder slug contains the INT-NNN slug (e.g., `FTR-005-sql-injection-hardening` matches `INT-001 — sql-injection-hardening`).
   - **Body match (fallback):** folder contains a `feature.md` whose body contains the INT-NNN identifier string (e.g., `INT-001`).
   - If neither matches, the intervention is considered un-actioned.
4. The first un-actioned flagged intervention is selected as the "next" item.
5. Command outputs:
   - The INT-NNN identifier and title.
   - The exact document path (e.g., `docs/assessments/ASSESS-001/ASSESS-001-INT-001-sql-injection-hardening.md`).
   - The exact suggested invocation: `/define-feature docs/assessments/ASSESS-001/ASSESS-001-INT-001-sql-injection-hardening.md`.
6. No files are written; the command terminates.

**Alternative flows:**

- All flagged interventions are actioned → command outputs "All flagged interventions have been actioned." with a list of linked feature folders.
- Zero interventions are flagged → command outputs "No interventions were flagged for feature delivery in this assessment."

**Error flows:**

- No prefix provided → command scans `docs/assessments/` for all `ASSESS-*` folders, lists them, and prompts the user to specify one.
- Assessment directory does not exist → command reports the missing directory and suggests running `/assess-codebase`.
- `{PREFIX}-Approvals.md` is missing → command reports the missing file and notes that the assessment pipeline's Findings Gate must complete first.
- `{PREFIX}-Approvals.md` exists but uses the old format (no `## Interventions Flagged for Feature Delivery` section) → command reports the format incompatibility and notes that this assessment predates FTR-003.

**Postconditions:**

- No file system state has changed.
- The user knows which intervention to act on next, or knows that all are actioned or none are flagged.

---

### UC-02: Get Full Interventions Reconciliation View

| Field | Value |
|-------|-------|
| Actor | Tech Lead / Project Manager |
| Preconditions | An assessment has been completed; `docs/assessments/{PREFIX}/{PREFIX}-Approvals.md` exists and uses the FTR-003 format. |
| Trigger | User invokes `/check-interventions [prefix]`. |
| Priority | Must |

**Main flow:**

1. User invokes `/check-interventions ASSESS-001`.
2. Command reads `docs/assessments/{PREFIX}/{PREFIX}-Approvals.md` and extracts the flagged interventions table.
3. Command reads `docs/assessments/{PREFIX}/{PREFIX}-Interventions-Index.md` and extracts the full intervention list (ID, Title, Criticality).
4. For each intervention entry across both sources, the command checks:
   a. Whether the `{PREFIX}-INT-NNN-*.md` document file exists on disk.
   b. Whether the row in the Approvals file matches (same INT-NNN identifier, Flagged value present).
5. For each flagged intervention (Flagged: Yes), the command additionally checks whether a corresponding feature folder exists in `internal_docs/features/` or `docs/features/` using the slug match / body match heuristic.
6. Command outputs a structured reconciliation table with one row per intervention showing:
   - INT-NNN identifier
   - Title
   - Criticality
   - Flagged status (Yes / No)
   - Document file status (present / missing)
   - Feature actioned status (actioned / pending / n/a for non-flagged)
7. If any cross-file inconsistencies are found, command outputs a dedicated inconsistency section at the bottom with:
   - INT-NNN present in Approvals but absent from Interventions Index.
   - INT-NNN present in Interventions Index but absent from Approvals.
8. No files are written; the command terminates.

**Alternative flows:**

- `{PREFIX}-Interventions-Index.md` is missing → command reports the missing index, notes which checks it cannot perform, and continues with the Approvals file data only (partial output).
- One or more `{PREFIX}-INT-NNN-*.md` document files are missing → those interventions are reported with a "missing" status; the rest of the table is still rendered.

**Error flows:**

- No prefix provided → same as UC-01 error flow.
- Assessment directory does not exist → same as UC-01 error flow.
- `{PREFIX}-Approvals.md` is missing → same as UC-01 error flow.
- `{PREFIX}-Approvals.md` uses the old format → same as UC-01 error flow.

**Postconditions:**

- No file system state has changed.
- The user has a complete reconciliation view of all interventions and their actioning status.

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Both commands are strictly read-only — they must not write, modify, or delete any file under any circumstances. | UC-01, UC-02 |
| BR-02 | The `Flagged` column value must be exactly `Yes` or `No` (case-sensitive). Any other value is treated as malformed and reported as a warning. | UC-01, UC-02 |
| BR-03 | The INT-NNN identifier format must match `INT-[0-9]+` (padded or unpadded); leading zeros are normalised for matching purposes. | UC-01, UC-02 |
| BR-04 | Feature folder matching uses slug match as the primary heuristic and body match as the fallback. If neither matches, the intervention is treated as not yet actioned. | UC-01, UC-02 |
| BR-05 | `/next-intervention` traverses flagged interventions in document order (top-to-bottom in the Approvals file), not in criticality order. | UC-01 |
| BR-06 | Only the FTR-003 Approvals file format is supported (the file must contain a `## Interventions Flagged for Feature Delivery` section). Pre-FTR-003 files are explicitly rejected with an explanatory message. | UC-01, UC-02 |
| BR-07 | Both `internal_docs/features/` and `docs/features/` must be searched for feature folder matching. | UC-01, UC-02 |
| BR-08 | `docs/assessments/` is the canonical location for all assessment output. No configurable override is in scope. | UC-01, UC-02 |
| BR-09 | When the prefix is not provided, the command must list all available `ASSESS-*` folders under `docs/assessments/` and prompt the user to specify one — it must not attempt to infer a default. | UC-01, UC-02 |

---

## 4. Data Requirements

### 4.1 Entities Consumed (read-only)

**`{PREFIX}-Approvals.md`** (produced by assessment-manager Phase 5, FTR-003 format)

| Field | Format | Notes |
|-------|--------|-------|
| Intervention | `INT-NNN — {slug}` | E.g., `INT-001 — sql-injection-hardening` |
| Flagged | `Yes` or `No` | Case-sensitive; other values treated as malformed |

**`{PREFIX}-Interventions-Index.md`** (produced by `intervention-documentation-standard` Phase 4)

| Field | Format | Notes |
|-------|--------|-------|
| ID | `INT-NNN` | Padded numeric identifier |
| Title | string | Human-readable intervention title |
| Criticality | `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` | Used for display in reconciliation table |
| Area | string | System area / component |
| Depends on | string | Dependency references |
| Suggested Agent | string | Recommended implementation agent |

**`{PREFIX}-INT-NNN-{slug}.md`** — individual intervention documents. Commands check for file existence only; they do not parse content.

**Feature folders** — either `internal_docs/features/FTR-NNN-*/` or `docs/features/FTR-NNN-*/`. A folder is a match for an intervention if the folder slug contains the INT-NNN slug OR the folder's `feature.md` body contains the INT-NNN identifier string.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| Assessment prefix | Must match `ASSESS-[0-9]+` pattern after normalisation; if only digits are provided (e.g. `001`), prefix is synthesised as `ASSESS-001` |
| `Flagged` column value | Must be exactly `Yes` or `No` (case-sensitive); any other value is reported as malformed |
| INT-NNN identifier | Must match `INT-[0-9]+`; leading zeros normalised for matching |
| Feature folder match — slug | Slug of folder name contains the INT-NNN slug (substring, case-insensitive) |
| Feature folder match — body | `feature.md` body contains the INT-NNN identifier string (case-insensitive) |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Correctness | Both commands must return identical output on repeated invocations with no changes to the file system between runs. |
| NFR-02 | Safety | Neither command may write, append, or delete any file. This constraint must be enforced by limiting allowed tools to `Read, Glob, Grep`. |
| NFR-03 | Usability | Output must include clear status symbols (e.g., checkmarks, cross marks, question marks) to allow rapid visual scanning of the reconciliation table. |
| NFR-04 | Robustness | Missing files (Interventions Index, individual INT-NNN documents) must not halt execution — partial output with explanatory notes is required. |
| NFR-05 | Compatibility | Only FTR-003 Approvals file format is supported. Pre-FTR-003 format triggers an explicit rejection message, not a silent failure. |

---

## 6. UI Requirements

### 6.1 Command Output Formats

**`/next-intervention` — main output (single un-actioned intervention found):**

```
Next un-actioned intervention: INT-NNN — {slug}
Document path: docs/assessments/{PREFIX}/{PREFIX}-INT-NNN-{slug}.md
Suggested command: /define-feature docs/assessments/{PREFIX}/{PREFIX}-INT-NNN-{slug}.md

Previously actioned ({K} of {N} flagged):
  - INT-NNN — {slug} → FTR-NNN-{slug}/
```

**`/next-intervention` — all actioned:**

```
All flagged interventions have been actioned. ({N} of {N})
  - INT-NNN — {slug} → FTR-NNN-{slug}/
```

**`/next-intervention` — zero flagged:**

```
No interventions were flagged for feature delivery in this assessment.
```

**`/check-interventions` — reconciliation table:**

```
Interventions Reconciliation — {PREFIX}
─────────────────────────────────────────────────────────────────────
| INT-NNN | Title               | Crit.  | Flagged | Doc file | Actioned |
|---------|---------------------|--------|---------|----------|----------|
| INT-001 | {title}             | HIGH   | Yes     | present  | pending  |
| INT-002 | {title}             | MEDIUM | No      | present  | n/a      |
| INT-003 | {title}             | CRITICAL| Yes    | missing  | actioned |

Inconsistencies:
  - INT-004: present in Approvals but not in Interventions Index
  - INT-005: present in Interventions Index but missing from Approvals
```

### 6.2 Navigation Flow

Both commands are invoked directly from the Claude Code command prompt. No inter-command navigation is required. Each command is self-contained and terminates after producing its output.

---

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a valid prefix with a completed Approvals file containing N flagged interventions (none actioned), when `/next-intervention {PREFIX}` is invoked, then the command outputs INT-001 (first flagged in document order) with its exact document path and suggested `/define-feature` invocation. | UC-01 |
| AC-02 | Given a valid prefix with M flagged interventions of which K already have corresponding feature folders, when `/next-intervention {PREFIX}` is invoked, then the command skips the K actioned interventions and outputs the first un-actioned one. | UC-01 |
| AC-03 | Given a valid prefix with N flagged interventions all of which have corresponding feature folders, when `/next-intervention {PREFIX}` is invoked, then the command reports "All flagged interventions have been actioned." with a list of the linked feature folders. | UC-01 |
| AC-04 | Given zero flagged interventions in the Approvals file, when `/next-intervention {PREFIX}` is invoked, then the command reports "No interventions were flagged for feature delivery in this assessment." | UC-01 |
| AC-05 | Given a valid prefix with a completed Approvals file, Interventions Index, and all INT-NNN document files present, when `/check-interventions {PREFIX}` is invoked, then the command outputs a table with one row per intervention showing INT-NNN, title, criticality, flagged status, document file status, and feature-actioned status. | UC-02 |
| AC-06 | Given one or more missing `{PREFIX}-INT-NNN-*.md` document files, when `/check-interventions {PREFIX}` is invoked, then the missing files are reported with a "missing" status on the document file column; the rest of the table is still rendered. | UC-02 |
| AC-07 | Given an INT-NNN present in Approvals but absent from the Interventions Index, when `/check-interventions {PREFIX}` is invoked, then this inconsistency is flagged in a dedicated section at the bottom of the output. | UC-02 |
| AC-08 | Given an INT-NNN present in the Interventions Index but absent from Approvals, when `/check-interventions {PREFIX}` is invoked, then this inconsistency is flagged in a dedicated section at the bottom of the output. | UC-02 |
| AC-09 | Given that `{PREFIX}-Approvals.md` does not exist, when either command is invoked, then the command reports the missing file and explains that the assessment pipeline Findings Gate must complete first. | UC-01, UC-02 |
| AC-10 | Given no prefix is provided, when either command is invoked, then the command lists all available `ASSESS-*` folders under `docs/assessments/` and prompts the user to specify one. | UC-01, UC-02 |
| AC-11 | Given any invocation of either command under any condition, then neither command writes to any file; the file system state is identical before and after execution. | UC-01, UC-02 |
| AC-12 | Given that `/next-intervention` outputs a suggestion, then the output includes the exact path to the INT-NNN document and the exact suggested invocation string `/define-feature docs/assessments/{PREFIX}/{PREFIX}-INT-NNN-{slug}.md`. | UC-01 |
| AC-13 | Given an Approvals file that uses the old format (no `## Interventions Flagged for Feature Delivery` section), when either command is invoked, then the command reports the format incompatibility and notes that the assessment predates FTR-003. | UC-01, UC-02 |

---

## 8. Dependencies & Assumptions

- **FTR-003 (Assessment Scope Reduction)** must be implemented and in use. Both commands depend on the FTR-003 Approvals file format (`## Interventions Flagged for Feature Delivery` section, `Flagged: Yes/No` column). Pre-FTR-003 Approvals files are explicitly out of scope.
- **Interventions Index format** produced by `intervention-documentation-standard` is the data contract defined in the assessment-manager Phase 6 documentation (FTR-004): table with `ID`, `Title`, `Area`, `Criticality`, `Depends on`, `Suggested Agent` columns.
- **Feature document locations:** toolkit development features live in `internal_docs/features/`; target project features live in `docs/features/`. Both must be searched.
- **Command file pattern:** both commands are implemented as `.claude/commands/*.md` markdown files following the same pattern as existing commands (`assessment-status.md`, `next-task.md`). They do not spawn subagents.
- **Tool restriction:** command files may restrict allowed tools to `Read, Glob, Grep` to enforce the no-write contract at the harness level.
- **`docs/assessments/`** is the canonical location for assessment output. No configurable override is in scope.
- The matching heuristic (slug match → body match) may produce false positives in rare cases where two different INT-NNN documents from different assessments match the same feature folder. This is an accepted limitation at the current toolkit scale.

---

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should a more precise linkage mechanism (e.g., a `source-intervention:` frontmatter field in `feature.md`) replace the current slug/body match heuristic to prevent false positives? | False positives would cause `/next-intervention` to skip interventions that are not truly actioned. | Accepted as-is for current scale; revisit if false positives are observed in practice. |
| 2 | Should `/next-intervention` support a `--all` flag to list all pending (un-actioned) flagged interventions at once rather than only the first? | Improves workflow visibility when many interventions are pending. | Deferred to next iteration per MVP decision. |
