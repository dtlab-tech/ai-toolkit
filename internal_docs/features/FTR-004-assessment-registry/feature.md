# Assessment Registry

## Feature ID
FTR-004

## Summary
Add a persistent `docs/assessments/registry.md` file to each assessed project that accumulates one row per completed assessment run. The assessment-manager appends a row automatically after the Findings Gate is acknowledged, giving teams a lightweight chronological record of every completed assessment: when it ran, how many findings it produced by severity, and how many interventions were flagged for feature delivery. No new agent is required — the write is a final step inside the existing assessment-manager pipeline.

## Problem Statement
Currently, each assessment run produces a self-contained folder (`docs/assessments/{PREFIX}/`) with no cross-run index. Teams cannot tell at a glance how many assessments have been run on a project, whether severity counts are trending up or down, or which interventions have been repeatedly flagged. The only way to reconstruct history is to open each run folder individually and read the Interventions Index. This makes it impossible to answer basic questions like "has this codebase improved since our last assessment six months ago?" without manual effort.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Tech Lead / Project Manager | Reviews `registry.md` to understand assessment history and severity trends across runs | After each assessment run; ad hoc when preparing reports |
| assessment-manager (orchestrator agent) | Appends one row to `registry.md` at the end of every completed assessment pipeline run | Every completed pipeline run |

## Core Flow (Happy Path)

1. User invokes `/assess-codebase [path]`. The pipeline runs as defined by FTR-003: assessment agents execute in parallel, intervention documents are generated, and the Findings Gate is presented.
2. User completes the Findings Gate: acknowledges findings and optionally flags INT-NNN identifiers. `{PREFIX}-Approvals.md` is written.
3. assessment-manager checks whether `docs/assessments/registry.md` exists in the assessed project.
   - If the file does not exist: assessment-manager creates it with a header and the first data row.
   - If the file exists: assessment-manager appends one new row at the bottom of the table.
4. The new row contains: date (YYYY-MM-DD), prefix (linked to run folder), total findings count, CRITICAL count, HIGH count, MEDIUM count, LOW count, and interventions-flagged count.
5. The Phase 6 summary display (per FTR-003) is shown. The summary includes a line confirming that `registry.md` was updated and shows its path.

## Out of Scope

- Diff or comparison view between two assessment runs.
- Any change to the `/assessment-status` command — it remains single-run focused.
- Trend charts or visualisations of any kind.
- A global registry across multiple projects.
- Automated alerts or thresholds based on registry data (e.g., "severity increased since last run").
- Validation or repair of manually edited registry rows — the file is trusted as-is.
- Retroactive population of the registry from existing run folders that predate this feature.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Pipeline is aborted before the Findings Gate completes (`{PREFIX}-Approvals.md` not written) | `registry.md` is NOT written or appended. Incomplete runs do not appear in the registry. |
| `docs/assessments/registry.md` does not yet exist | assessment-manager creates the file with a Markdown table header and the first data row. |
| `docs/assessments/registry.md` exists but has been manually edited or has malformed rows | assessment-manager appends the new row without reading or validating the existing content. The file is trusted as-is. |
| The same prefix is run twice with `--force` | A second row with the same prefix is appended. The registry reflects both runs; deduplication is not performed. |
| Assessment produces zero findings | The Findings Gate still runs and the user still acknowledges. `registry.md` is appended with a row showing all severity counts as 0 and interventions flagged as 0. |
| The assessed project has no `docs/assessments/` directory | This cannot happen in practice — the directory is created by the assessment-manager in Phase 1b before any output is written. |

## Data Model

### Entities

**Registry file** (`docs/assessments/registry.md`) — one file per assessed project, lives alongside the run folders.

```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-04-20 | [ASSESS-002](ASSESS-002/) | 9  | 1 | 3 | 4 | 1 | 2 |
| 2026-07-14 | [ASSESS-003](ASSESS-003/) | 7  | 0 | 2 | 4 | 1 | 1 |
```

**Column definitions:**

| Column | Source | Format |
|--------|--------|--------|
| Date | System date at time of Findings Gate completion | YYYY-MM-DD |
| Prefix | Assessment prefix determined in Phase 1b | Markdown link: `[{PREFIX}]({PREFIX}/)` pointing to the run subfolder |
| Total | Sum of all finding severities from `{PREFIX}-Interventions-Index.md` | Integer |
| CRITICAL | Count of CRITICAL-severity findings | Integer |
| HIGH | Count of HIGH-severity findings | Integer |
| MEDIUM | Count of MEDIUM-severity findings | Integer |
| LOW | Count of LOW-severity findings | Integer |
| Flagged | Count of interventions where "Flagged: Yes" in `{PREFIX}-Approvals.md` | Integer |

### Data sources for row values

The assessment-manager reads the following files to populate the new row:

- **Severity counts**: `{PREFIX}-Interventions-Index.md` — the consolidated index already contains criticality per intervention.
- **Flagged count**: `{PREFIX}-Approvals.md` — count of rows where the Flagged column is "Yes".
- **Date**: system date at the moment the row is written (after the gate completes).
- **Prefix and folder link**: already known from Phase 1b.

### Validation Rules

| Field | Rule |
|-------|------|
| Date | Written as YYYY-MM-DD at time of registry append; never edited retroactively |
| Prefix link | Must point to the subfolder name as it exists on disk (e.g., `ASSESS-001/`) |
| Severity counts | Must sum to Total; sourced from Interventions Index, not recalculated independently |
| Registry write | Only performed after `{PREFIX}-Approvals.md` has been successfully written |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| assessment-manager (agent) | Read `{PREFIX}-Interventions-Index.md` and `{PREFIX}-Approvals.md` to extract row values; create or append `docs/assessments/registry.md` |
| Human user / Tech Lead | Read `registry.md` at any time; may manually edit without breaking the pipeline |
| assess-codebase skill | No change — entry point only, no file writes |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A completed assessment run (Findings Gate acknowledged, `{PREFIX}-Approvals.md` written) | The pipeline reaches Phase 6 | `docs/assessments/registry.md` contains exactly one new row for this run with the correct date, prefix link, severity counts (summing to Total), and flagged count | Must |
| AC-02 | `docs/assessments/registry.md` does not exist | The first completed assessment run finishes | The file is created with the correct Markdown table header followed by one data row | Must |
| AC-03 | `docs/assessments/registry.md` already exists with N rows | A second completed assessment run finishes | The file now has N+1 rows; existing rows are unchanged; the new row is appended at the bottom | Must |
| AC-04 | The user aborts the pipeline before completing the Findings Gate | Pipeline exits without writing `{PREFIX}-Approvals.md` | `registry.md` is not modified (no new row is appended, no file is created) | Must |
| AC-05 | A run produces zero findings | The Findings Gate completes (user acknowledges zero findings) | The registry row is appended with Total=0, all severity counts=0, Flagged=0 | Must |
| AC-06 | The same prefix is run twice with `--force` | Both runs complete the Findings Gate | `registry.md` contains two rows with the same prefix (no deduplication); both rows reflect their respective run's findings | Must |
| AC-07 | A completed assessment run finishes | The Phase 6 summary is displayed | The summary includes a confirmation line that `docs/assessments/registry.md` was updated (or created) and shows its path | Must |
| AC-08 | The Prefix column value is read in any tool | Any time | The prefix is rendered as a Markdown relative link pointing to `{PREFIX}/` (the subfolder within `docs/assessments/`) | Must |

## MVP vs Deferred

### MVP (must ship)

- assessment-manager reads severity counts from `{PREFIX}-Interventions-Index.md` and flagged count from `{PREFIX}-Approvals.md` after the Findings Gate completes.
- assessment-manager creates `docs/assessments/registry.md` if it does not exist (with table header) or appends one row to the existing file.
- The Phase 6 summary display includes a line confirming the registry was updated.
- The write is conditional: only performed when `{PREFIX}-Approvals.md` has been successfully written.

### Deferred (next iteration)

- A `/assessment-history` command (or enhancement to `/assessment-status`) that reads `registry.md` and presents the table with trend indicators (e.g., severity delta since previous run).
- Diff view between two specific runs.
- Retroactive backfill: a utility that scans existing `ASSESS-*` folders and populates `registry.md` from their artifacts.
- Machine-readable output (JSON) for integration with external dashboards.

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | FTR-003 is not yet implemented. The registry write depends on the FTR-003 gate flow (`{PREFIX}-Approvals.md` format and the Phase 6 summary). FTR-004 must be implemented after FTR-003, or both implemented in the same pass. Should the work breakdown sequence them explicitly? | Implementation ordering |
| 2 | The Interventions Index format is defined by the `intervention-documentation-standard` agent, not by any FTR document. If the severity labelling in that file changes, the registry row extraction logic must change too. Is there a canonical field or heading name that should be treated as a contract? | Fragility of row extraction |

## Dependencies and Assumptions

- FTR-003 (Assessment Scope Reduction) must be implemented first or concurrently. The registry write is gated on `{PREFIX}-Approvals.md` existing, which is the FTR-003 output format. Attempting to implement FTR-004 against the pre-FTR-003 pipeline would require re-work.
- The `{PREFIX}-Interventions-Index.md` produced by `intervention-documentation-standard` contains per-intervention criticality in a consistent, machine-readable format. FTR-004 assumes that severity counts can be extracted from this file without parsing free-form prose.
- `docs/assessments/` always exists by the time the registry is written (created in Phase 1b of the assessment-manager).
- The registry file is plain Markdown. No schema validation, no database, no external tooling dependency.
- The `/assessment-status` command is not modified by this feature. It continues to operate on individual run folders only.
- Assessment agents and the `intervention-documentation-standard` agent are not changed by this feature.
