# Assessment Intervention Commands

## Feature ID
FTR-005

## Summary
Add two read-only commands — `/next-intervention` and `/check-interventions` — that bridge the gap between the assessment pipeline output and the feature delivery pipeline. `/next-intervention` surfaces the next actionable flagged intervention that has not yet been converted into a feature, and suggests the exact `/define-feature` invocation to start on it. `/check-interventions` gives a full reconciliation view: which flagged interventions are done, which are pending, and which INT-NNN files are structurally inconsistent with their index. Both commands operate exclusively against files already produced by the assessment pipeline; they make no writes.

## Problem Statement
After the assessment pipeline ends, the user has a `{PREFIX}-Approvals.md` file listing which interventions were flagged for feature delivery. Currently there is no tooling to answer the question: "which flagged interventions have I not yet turned into features?" The user must manually cross-reference the Approvals file, the Interventions Index, and the `internal_docs/features/` folder to find out. This cross-referencing is error-prone and grows linearly with the number of flagged interventions. Additionally, there is no way to verify that the INT-NNN documents are complete and consistent with their Interventions Index entry without opening each file individually. The two new commands eliminate both friction points.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Tech Lead / Project Manager | Runs `/next-intervention` to get the next actionable INT-NNN and know how to start on it | After each assessment run; during the feature delivery phase as they work through flagged items |
| Tech Lead / Project Manager | Runs `/check-interventions` to get a full status overview of all flagged interventions | Before starting a planning session; when onboarding another engineer; when resuming work after a break |

## Core Flow (Happy Path)

### /next-intervention [prefix]

1. User invokes `/next-intervention ASSESS-001` (or just `001`; the command normalises the prefix).
2. Command reads `docs/assessments/{PREFIX}/{PREFIX}-Approvals.md` and extracts all rows where `Flagged = "Yes"`.
3. For each flagged intervention, command checks whether a corresponding feature folder exists in `internal_docs/features/` or `docs/features/`. A folder is considered "actioned" if it contains a `feature.md` whose content references the INT-NNN identifier (e.g., the document is mentioned anywhere in the feature.md body, or the folder slug contains the INT-NNN slug).
4. The first flagged intervention with no matching feature folder is selected as the "next" item.
5. Command outputs the INT-NNN document path and the exact suggested invocation for `/define-feature`.
6. If all flagged interventions have corresponding features, the command outputs a completion message.

### /check-interventions [prefix]

1. User invokes `/check-interventions ASSESS-001`.
2. Command reads `{PREFIX}-Interventions-Index.md` and `{PREFIX}-Approvals.md`.
3. For each entry in the Interventions Index, command checks:
   a. Whether the `{PREFIX}-INT-NNN-*.md` document file exists on disk.
   b. Whether the row in the Approvals file matches (same INT-NNN identifier, Flagged value present).
4. For each flagged intervention (Flagged: Yes), command additionally checks whether a corresponding feature exists in `internal_docs/features/` or `docs/features/`.
5. Command outputs a structured reconciliation table: status per intervention, with symbols indicating actioned / pending / missing.

## Out of Scope

- Any writes to any file — both commands are strictly read-only.
- Automatically spawning `/define-feature` — the command suggests the invocation; the user decides when to run it.
- Cross-prefix queries — each invocation targets a single assessment prefix.
- Checking whether a linked feature has been fully implemented (feature.md existence is the only signal; implementation completeness is the concern of `/feature-status`).
- Modifying or repairing the Approvals file or the Interventions Index.
- Support for assessment prefixes that used the pre-FTR-003 pipeline format (old Approvals file format with "approved/deferred" instead of "Flagged: Yes/No").

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Prefix not provided | Command scans `docs/assessments/` for all `ASSESS-*` folders and lists them, then prompts the user to specify one. |
| Assessment directory does not exist | Command reports the missing directory and suggests running `/assess-codebase`. |
| `{PREFIX}-Approvals.md` is missing | Command reports the missing file and notes that the assessment pipeline's Findings Gate must complete before the command can run. |
| `{PREFIX}-Approvals.md` exists but uses the old format (no "Interventions Flagged for Feature Delivery" section) | Command reports the format incompatibility and notes that this assessment predates FTR-003. |
| `{PREFIX}-Interventions-Index.md` is missing (check-interventions only) | Command reports the missing index and notes which checks it cannot perform as a result; continues with the Approvals file data only. |
| A specific `{PREFIX}-INT-NNN-*.md` document file is missing | check-interventions reports it as "missing" with a distinct symbol; next-intervention skips file-level checks (it only checks for a corresponding feature folder). |
| Zero interventions are flagged | next-intervention reports "No interventions were flagged for feature delivery in this assessment." check-interventions shows the full table with all rows marked as not flagged. |
| All flagged interventions already have corresponding features | next-intervention reports "All flagged interventions have been actioned." with a list of the linked feature folders. |
| The feature folder slug does not literally contain the INT-NNN identifier | The matching heuristic falls back to checking whether the INT-NNN identifier string appears anywhere in the feature.md body. If neither the slug nor the body contains the identifier, the intervention is treated as not yet actioned. |
| INT-NNN row is in Approvals but absent from Interventions Index | check-interventions flags this as an inconsistency: "INT-NNN present in Approvals but not in Interventions Index." |
| INT-NNN row is in Interventions Index but absent from Approvals | check-interventions flags this as an inconsistency: "INT-NNN present in Interventions Index but missing from Approvals." |

## Data Model

### Entities consumed (read-only)

**`{PREFIX}-Approvals.md`** — produced by assessment-manager Phase 5 (FTR-003 format). The command reads the `## Interventions Flagged for Feature Delivery` section and its Markdown table.

Relevant columns:
- `Intervention` — value format: `INT-NNN — {slug}` (e.g., `INT-001 — sql-injection-hardening`)
- `Flagged` — exact values: `Yes` or `No` (case-sensitive, per FTR-003 data contract)

**`{PREFIX}-Interventions-Index.md`** — produced by `intervention-documentation-standard` Phase 4.

Relevant columns:
- `ID` — value format: `INT-NNN`
- `Title` — human-readable intervention title
- `Criticality` — `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

**`{PREFIX}-INT-NNN-{slug}.md`** — individual intervention documents, one per finding. Commands check for file existence only; they do not parse content.

**Feature folders** — either `internal_docs/features/FTR-NNN-*/` or `docs/features/FTR-NNN-*/`. A folder is a match for an intervention if:
1. The folder slug contains the INT-NNN slug (e.g., folder `FTR-005-sql-injection-hardening` matches `INT-001 — sql-injection-hardening`), OR
2. The folder contains a `feature.md` file whose body contains the INT-NNN identifier string (e.g., `INT-001`).

### Validation Rules

| Field | Rule |
|-------|------|
| `Flagged` column value | Must be exactly `Yes` or `No` (case-sensitive); any other value is treated as malformed and reported as a warning |
| INT-NNN identifier format | Must match `INT-[0-9]+` (padded or unpadded); leading zeros are normalised for matching |
| Feature folder matching | Slug match is attempted first; body match is the fallback; no match = not actioned |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| Human user / Tech Lead | Invoke both commands; read their output |
| `/next-intervention` command | Read `{PREFIX}-Approvals.md`; read feature folder names under `internal_docs/features/` and `docs/features/`; read `feature.md` body for fallback matching |
| `/check-interventions` command | Read `{PREFIX}-Approvals.md`; read `{PREFIX}-Interventions-Index.md`; check existence of `{PREFIX}-INT-NNN-*.md` files; read feature folder names and `feature.md` bodies for matching |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A valid prefix with a completed `{PREFIX}-Approvals.md` containing N flagged interventions, none of which have a corresponding feature folder | `/next-intervention {PREFIX}` is invoked | The command outputs INT-001 (the first flagged item, in Approvals file order) with its document path and the exact `/define-feature` invocation to use | Must |
| AC-02 | A valid prefix with M flagged interventions, of which K already have corresponding feature folders | `/next-intervention {PREFIX}` is invoked | The command skips the K actioned interventions and outputs the first un-actioned one; if all are actioned it reports "All flagged interventions have been actioned." | Must |
| AC-03 | A valid prefix with N flagged interventions, all of which have corresponding feature folders | `/next-intervention {PREFIX}` is invoked | The command reports "All flagged interventions have been actioned." with a list of the linked feature folders | Must |
| AC-04 | Zero interventions are flagged in `{PREFIX}-Approvals.md` | `/next-intervention {PREFIX}` is invoked | The command reports "No interventions were flagged for feature delivery in this assessment." | Must |
| AC-05 | A valid prefix with a completed `{PREFIX}-Approvals.md` and `{PREFIX}-Interventions-Index.md`, and all INT-NNN document files present | `/check-interventions {PREFIX}` is invoked | The command outputs a table with one row per intervention showing: INT-NNN identifier, title, criticality, flagged status, document file status (present/missing), and feature actioned status (actioned/pending/n/a) | Must |
| AC-06 | One or more `{PREFIX}-INT-NNN-*.md` document files are missing from disk | `/check-interventions {PREFIX}` is invoked | Those interventions are reported with a "missing" status on the document file column; the rest of the table is still rendered | Must |
| AC-07 | An INT-NNN appears in Approvals but not in the Interventions Index | `/check-interventions {PREFIX}` is invoked | The command flags this as an inconsistency in a dedicated section at the bottom of the output | Must |
| AC-08 | An INT-NNN appears in the Interventions Index but not in Approvals | `/check-interventions {PREFIX}` is invoked | The command flags this as an inconsistency in a dedicated section at the bottom of the output | Must |
| AC-09 | `{PREFIX}-Approvals.md` does not exist | Either command is invoked | The command reports the missing file and explains that the assessment pipeline Findings Gate must complete first | Must |
| AC-10 | No prefix is provided | Either command is invoked | The command lists all available `ASSESS-*` folders under `docs/assessments/` and prompts the user to specify one | Must |
| AC-11 | Either command completes under any condition | Any invocation | Neither command writes to any file; file system state is identical before and after | Must |
| AC-12 | `/next-intervention` outputs a suggestion | The suggestion is rendered | The output includes the exact path to the INT-NNN document (e.g., `docs/assessments/ASSESS-001/ASSESS-001-INT-001-sql-injection-hardening.md`) and the exact suggested invocation string `/define-feature docs/assessments/ASSESS-001/ASSESS-001-INT-001-sql-injection-hardening.md` | Must |

## MVP vs Deferred

### MVP (must ship)

- `/next-intervention [prefix]` command file at `.claude/commands/next-intervention.md`
  - Reads `{PREFIX}-Approvals.md`, extracts flagged interventions in order
  - Checks `internal_docs/features/` and `docs/features/` for matching feature folders (slug match, then body match)
  - Outputs the first un-actioned flagged intervention with document path and suggested `/define-feature` invocation
  - Handles: missing prefix, missing assessment directory, missing Approvals file, zero flagged, all actioned
- `/check-interventions [prefix]` command file at `.claude/commands/check-interventions.md`
  - Reads `{PREFIX}-Approvals.md` and `{PREFIX}-Interventions-Index.md`
  - Checks existence of each `{PREFIX}-INT-NNN-*.md` file
  - Checks feature folder matching for flagged interventions
  - Outputs: reconciliation table + inconsistency list
  - Handles: missing Interventions Index (partial output), missing individual INT-NNN files, cross-file inconsistencies

### Deferred (next iteration)

- A `--all` flag for `/next-intervention` that lists all pending (un-actioned) flagged interventions rather than just the first one.
- Integration with `/assessment-status` to incorporate intervention actioning progress into the existing status report.
- A `--format=json` output mode for piping output into other tools.
- Cross-prefix queries (e.g., "show all pending flagged interventions across all ASSESS-* runs").

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | The matching heuristic (slug match, then body match) may produce false positives if two different INT-NNN documents from two different assessments happen to match the same feature folder. Is a more precise linkage (e.g., a `source-intervention:` frontmatter field in feature.md) worth adding, or is the heuristic good enough for the current toolkit scale? | If false positives occur, /next-intervention would skip interventions that are not truly actioned. |
| 2 | Should `/next-intervention` traverse the Approvals file in document order (top-to-bottom, which reflects user selection order) or in criticality order (CRITICAL first)? The current spec uses document order. Criticality order would require joining with the Interventions Index. | Changes the definition of "next" and may require a join with the Interventions Index. |

## Dependencies and Assumptions

- FTR-003 (Assessment Scope Reduction) must be implemented and in use. Both commands depend on the FTR-003 Approvals file format (`## Interventions Flagged for Feature Delivery` section, `Flagged: Yes/No` column). Pre-FTR-003 Approvals files are explicitly out of scope.
- The Interventions Index format produced by `intervention-documentation-standard` is the data contract defined in the assessment-manager Phase 6 documentation (FTR-004): table with `ID`, `Title`, `Area`, `Criticality`, `Depends on`, `Suggested Agent` columns.
- Feature docs for this toolkit's own features live in `internal_docs/features/` (development workspace, excluded from npm). Target project feature docs live in `docs/features/`. Both paths must be searched.
- Both commands are implemented as `.claude/commands/*.md` markdown skill files, following the same pattern as existing commands (`assessment-status.md`, `next-task.md`). They read files using allowed tools and output text; they do not spawn subagents.
- The command files may restrict their allowed tools to `Read, Glob, Grep` (read-only tools) to make the no-write contract enforceable by the harness.
- `docs/assessments/` is the canonical location for assessment output. Both commands assume this path; no configurable override is in scope.
