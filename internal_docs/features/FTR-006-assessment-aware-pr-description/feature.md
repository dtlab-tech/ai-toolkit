# Assessment-Aware PR Description

## Feature ID
FTR-006

## Summary
Extend the `/pr-description` command to recognise branches that originate from the assessment pipeline. When a branch name contains `ASSESS-NNN` or `INT-NNN` patterns, or when no matching `FTR-XXX` feature folder exists but a relevant INT-NNN intervention document can be located, the command reads that document for context and generates a PR description that references the intervention — its ID, area, criticality, and summary — instead of falling back to commits-only output. This closes a gap where assessment-originated work produces weaker, context-free PR descriptions.

## Problem Statement
The current `/pr-description` command is designed exclusively for the feature delivery pipeline. It extracts a `FTR-XXX` identifier from the branch name, locates the matching `feature.md`, and uses it to generate a rich PR description. When no matching feature folder is found, it falls back to commits-only output with a disclaimer.

This fallback is suboptimal for assessment-originated branches. When a user actions a flagged intervention — either by running `/define-feature` with the INT-NNN document (which creates a `FTR-XXX` and a `feature/FTR-XXX-...` branch) or by creating a branch that directly references the assessment (e.g. `fix/ASSESS-001-INT-002-god-class`) — the command has no mechanism to find the INT-NNN document and populate the PR description with intervention-specific context: severity, area, the original finding, and what the intervention intends to fix.

The result is PRs that lack traceability back to the assessment run that motivated them, making it harder to close the loop between findings and remediation.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Developer / Tech Lead | Runs `/pr-description` on a branch that implements a flagged intervention; expects a description rich enough to copy-paste into the PR | Once per intervention branch, at PR creation time |
| `/pr-description` command | Detects branch pattern, locates the correct context document, and generates the PR description | Every invocation |

## Core Flow (Happy Path)

### Path A — Direct assessment branch (ASSESS-NNN or INT-NNN in branch name)

1. Developer creates a branch named after the assessment pattern, e.g. `fix/ASSESS-001-INT-002-god-class` or `fix/INT-002-god-class`.
2. Developer runs `/pr-description`.
3. The command reads the current branch name via `git rev-parse --abbrev-ref HEAD`.
4. The command detects an `ASSESS-NNN` and/or `INT-NNN` token in the branch name.
5. The command locates the INT-NNN document: searches `docs/assessments/{ASSESS-PREFIX}/` for a file matching `*-INT-NNN-*.md`. If `ASSESS-NNN` is present in the branch name it scopes the search to that prefix directory; if only `INT-NNN` is present it searches all assessment subfolders and selects the unique match (or asks the user if ambiguous).
6. The command reads the INT-NNN document, extracting: Summary (section 1), Intervention Area (section 2), Criticality (section 3), Objective (section 7), and Acceptance Criteria (section 11).
7. The command collects commits via `git log`.
8. The command generates a PR description using the assessment template (see Data Model).

### Path B — Feature branch that originated from a flagged intervention (FTR-XXX with INT-NNN linkage)

1. Developer ran `/define-feature` referencing an INT-NNN document, creating e.g. `FTR-010` and branch `feature/FTR-010-fix-sql-injection`.
2. Developer runs `/pr-description`.
3. The command detects `FTR-010` in the branch name and finds `docs/features/FTR-010-.../feature.md` — standard flow applies.
4. Additionally, the command checks whether `feature.md` mentions an INT-NNN reference in its Dependencies/Assumptions section.
5. If an INT-NNN reference is found, the command also reads that document and appends an "Intervention Reference" section to the PR description.
6. If no INT-NNN reference exists in `feature.md`, the command produces the standard FTR-based description (existing behaviour, unchanged).

### Path C — No FTR found, no assessment pattern in branch name

1. Standard fallback: commits-only output with a note (existing behaviour, unchanged).

## Out of Scope

- Modifying how `/pr-description` handles standard `FTR-XXX` branches that have no INT-NNN linkage — that path is unchanged.
- Automatically creating or updating PRs (the command only generates text; it does not call `gh`).
- Reading full assessment report files (e.g. `*-Generic-Assessment.md`) — only the targeted INT-NNN document is read.
- Linking multiple INT-NNN documents in a single PR description when a branch touches several interventions simultaneously — one INT-NNN per branch is the expected pattern; ambiguity prompts the user.
- Modifying any assessment pipeline agent or producing any new output files during the assessment run.
- Retroactive backfill or validation of existing PRs.
- A `--no-intervention` flag or other command arguments — the detection is automatic.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Branch name contains `INT-002` but no `ASSESS-NNN` token; two assessment runs both have an `INT-002` document | The command lists both candidates and asks the user to select one before proceeding. |
| Branch name contains `ASSESS-001` and `INT-002` but `docs/assessments/ASSESS-001/` does not exist or contains no matching file | The command falls back to commits-only output and notes that the INT-NNN document could not be located at the expected path. |
| The INT-NNN document exists but is missing one or more mandatory sections (e.g. no Criticality heading) | The command generates the description with the sections it could extract; missing sections are noted as "not found in document" in the output. |
| Branch contains both `FTR-XXX` and `INT-NNN` tokens (Path B with explicit INT in branch name) | The command follows Path B: reads `feature.md` as primary context, reads the INT-NNN document as supplementary context, and produces a combined description. |
| `feature.md` mentions multiple INT-NNN identifiers in Dependencies/Assumptions | The command reads all referenced INT-NNN documents and lists each in the "Intervention Reference" section. |
| The assessed project's `docs/assessments/` directory exists but the specific INT file has been deleted or renamed | Falls back to commits-only output with a note identifying the missing file path. |
| `/pr-description` is run on a branch with `ASSESS-001` in the name but no `INT-NNN` token | The command cannot determine which intervention is being addressed; it falls back to commits-only output and notes that no INT-NNN identifier was found in the branch name. |

## Data Model

### Entities

No new files are written. The command is read-only.

**Inputs read by the command (in addition to existing inputs):**

| Input | Path pattern | Key fields extracted |
|-------|-------------|----------------------|
| INT-NNN intervention document | `docs/assessments/{ASSESS-PREFIX}/{ASSESS-PREFIX}-INT-NNN-{slug}.md` | Summary (§1), Intervention Area (§2), Criticality (§3), Objective (§7), Acceptance Criteria (§11) |
| feature.md (existing) | `docs/features/{FTR-FOLDER}/feature.md` | Dependencies and Assumptions section — scanned for INT-NNN references |

**PR description template — assessment branch (Path A):**

```markdown
## Summary
<2–4 bullet points: what changed and why, framed from the INT-NNN Objective>

## Intervention
- **ID:** {ASSESS-PREFIX}-INT-NNN
- **Area:** {Intervention Area}
- **Criticality:** {Criticality}
- **Finding:** <one-sentence summary from §1 of the INT-NNN document>

## Changes
<bullet list grouped by area: Backend / Frontend / DB / Tests / Docs — only include groups with actual changes>

## Test plan
- [ ] <concrete test step derived from INT-NNN Acceptance Criteria>
- [ ] <concrete test step 2>
- [ ] <concrete test step 3>

## Linked intervention
`docs/assessments/{ASSESS-PREFIX}/{ASSESS-PREFIX}-INT-NNN-{slug}.md`
```

**PR description template — feature branch with INT-NNN linkage (Path B, appended section):**

The standard FTR-based template is used (existing behaviour). The following section is appended after "Linked feature":

```markdown
## Intervention Reference
This change implements a flagged intervention from the assessment pipeline.
- **ID:** {ASSESS-PREFIX}-INT-NNN
- **Area:** {Intervention Area}
- **Criticality:** {Criticality}
- **Document:** `docs/assessments/{ASSESS-PREFIX}/{ASSESS-PREFIX}-INT-NNN-{slug}.md`
```

### Validation Rules

| Field | Rule |
|-------|------|
| ASSESS-NNN token | Matched by pattern `ASSESS-\d+` in branch name (case-insensitive) |
| INT-NNN token | Matched by pattern `INT-\d+` in branch name (case-insensitive) |
| INT-NNN document lookup | Search path is `docs/assessments/` — scoped to `{ASSESS-PREFIX}/` if available, otherwise all subdirectories |
| Ambiguous INT-NNN match | More than one file matches → prompt user to select; never auto-select |
| Missing sections in INT-NNN document | Extracted as "not found in document"; do not abort |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| `/pr-description` command | Read branch name, git log, `docs/features/` tree, `docs/assessments/` tree, INT-NNN documents; no writes |
| Developer / Tech Lead | Invokes the command; selects among candidates if prompted |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | Current branch is `fix/ASSESS-001-INT-002-god-class` and `docs/assessments/ASSESS-001/ASSESS-001-INT-002-god-class-decomposition.md` exists | `/pr-description` is run | The output uses the assessment PR template, includes the Intervention section with correct ID, Area, Criticality, and finding summary, and links to the INT-NNN document | Must |
| AC-02 | Current branch is `fix/INT-003-di-refactoring` and exactly one `*-INT-003-*.md` file exists across all assessment subdirectories | `/pr-description` is run | The command locates the unique INT-NNN file without prompting and generates the assessment PR template | Must |
| AC-03 | Current branch is `fix/INT-003-di-refactoring` and two `*-INT-003-*.md` files exist (from two separate assessment runs) | `/pr-description` is run | The command lists both candidates and prompts the user to select one before generating output | Must |
| AC-04 | Current branch is `feature/FTR-010-fix-sql-injection` and `FTR-010/feature.md` references `ASSESS-001-INT-001` in its Dependencies/Assumptions section | `/pr-description` is run | The output uses the standard FTR template plus an "Intervention Reference" section linking to the INT-NNN document | Must |
| AC-05 | Current branch is `feature/FTR-010-fix-sql-injection` and `FTR-010/feature.md` contains no INT-NNN reference | `/pr-description` is run | The output is the standard FTR-based description with no Intervention Reference section (existing behaviour, no regression) | Must |
| AC-06 | Current branch is `fix/ASSESS-001-INT-002-god-class` but the expected INT document does not exist on disk | `/pr-description` is run | The command outputs a commits-only description and notes the missing document path; it does not crash | Must |
| AC-07 | Current branch has no `FTR-XXX`, `ASSESS-NNN`, or `INT-NNN` token | `/pr-description` is run | Existing fallback behaviour is unchanged: commits-only output with a note | Must |
| AC-08 | Current branch is `fix/ASSESS-001-INT-002-god-class` and the INT-NNN document is missing the Criticality section | `/pr-description` is run | The Intervention section in the output shows "Criticality: not found in document"; generation continues | Should |
| AC-09 | Current branch contains `ASSESS-001` but no `INT-NNN` token | `/pr-description` is run | The command falls back to commits-only output and notes that no INT-NNN identifier was found in the branch name | Should |

## MVP vs Deferred

### MVP (must ship)

- Detect `ASSESS-NNN` and `INT-NNN` tokens in the branch name (Path A).
- Locate the INT-NNN document under `docs/assessments/` (scoped or global search).
- Handle ambiguous matches (multiple files for the same INT-NNN) by prompting the user.
- Extract Summary, Intervention Area, Criticality, Objective, and Acceptance Criteria from the INT-NNN document.
- Generate the assessment PR description template.
- Fallback to commits-only when the INT-NNN document cannot be found.
- Preserve existing behaviour exactly for all non-assessment branches (no regression).

### Deferred (next iteration)

- Path B (detecting INT-NNN linkage from `feature.md` Dependencies/Assumptions): this is a nice-to-have that requires reading and parsing `feature.md` for an optional field. Not required for the MVP to be useful.
- Support for branches that reference multiple INT-NNN identifiers explicitly (e.g. `fix/ASSESS-001-INT-002-INT-003-batch`).
- A `--intervention <path>` flag to manually point to an INT-NNN document, bypassing auto-detection.
- Reading additional INT-NNN sections beyond the five MVP fields (e.g. Risks, Expected Impacts) for a more detailed PR body.

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | The command currently uses `origin/main` then `origin/master` as the merge base. Assessment-originated branches may be rebased from `develop` (the gitflow integration branch). Should the command also try `origin/develop` as a fallback base, or is this already handled adequately by the existing fallback logic? | Affects commit list completeness in PR descriptions for assessment branches |
| 2 | Path B (FTR feature.md referencing INT-NNN) requires a consistent convention for how INT-NNN identifiers appear in `feature.md`'s Dependencies/Assumptions section. Is there an existing convention, or does one need to be defined? If undefined, Path B should remain deferred. | Implementation feasibility of Path B |

## Dependencies and Assumptions

- FTR-003 (Assessment Scope Reduction) must be completed. The INT-NNN document format and the `docs/assessments/{PREFIX}/` directory structure are defined by FTR-003 and the `intervention-documentation-standard` agent. FTR-006 reads these outputs; it does not produce them.
- The INT-NNN document format follows the 19-section structure defined in `.claude/agents/intervention-documentation-standard.md`. Section headings (e.g. `## Intervention Area`, `## Criticality`) are stable contracts for this feature.
- The `docs/assessments/` directory tree is the canonical location for all assessment run folders. No alternative paths are supported.
- The command does not modify any files. It is safe to run at any time without side effects.
- The existing `/pr-description` behaviour for FTR-XXX branches is a hard non-regression requirement. Any change to that path is out of scope.
- Branch naming for assessment-originated work is not formally enforced by the toolkit. The command must be tolerant of varied patterns (e.g. `fix/`, `feature/`, `refactor/` prefixes) as long as `ASSESS-NNN` or `INT-NNN` tokens appear somewhere in the branch name.
