# Tech-Spec Split Generation and Storage

## Feature ID
FTR-024

## Summary
Replaces the single-shot `{PREFIX}-Tech-Spec.md` generation with a skeleton pass
(`spec/index.md` — everything not owned by exactly one file the feature creates/modifies) plus
one generation call per component (`spec/components/{fileSlug}.md`), assembled back into the
unchanged 12-section monolithic document by a new `tech-spec-assembler.js`. This is Phase D of
the traceability-matrix initiative
(`internal_docs/ideas/requirements-techspec-split-and-traceability-matrix.md`), completing the
split-generation architecture across all three planning documents (Work Breakdown — FTR-020,
Requirements — FTR-021, Tech-Spec — this feature). It builds directly on a worked example already
produced during FTR-020's own definition (`internal_docs/features/FTR-020-work-breakdown-split-generation/spec/`
+ `templates/component-template.md`/`tech-spec-index-template.md`), not a from-scratch design —
and on FTR-023's `Addresses` column, which this feature relocates from the monolithic §9 table
into each component's own file rather than reinventing.

## Problem Statement
`gaia-generate-tech-spec` has no `Write` tool; its entire 12-section response is persisted
verbatim by `pm-phase1.js`'s `c.worker()` call in one model turn — the same truncation exposure
FTR-020 fixed for the Work Breakdown and FTR-021 fixed for Requirements, now the last of the three
planning documents still generated this way. The FTR-020 worked example already established,
empirically, that Tech-Spec's natural split axis is **components** (one file the feature
creates/modifies), not Use Cases: the existing §9 "File Inventory" table was already, in effect, a
1:1 component index, and — a genuine finding, not an assumption — §10 "Testing Strategy" (which
looks cross-cutting at first glance) turned out to split entirely per-component with no residue,
since every test-plan bullet already named exactly one component's own test file.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change; the execution path is described below.

1. `pm-phase1.js` resolves Tech-Spec generation exactly as today, up to dispatching
   `gaia-generate-tech-spec`.
2. **Skeleton pass (one `c.worker()` call, no declared output — host writes it, mirroring
   FTR-021's Requirements skeleton step):** a modified `gaia-generate-tech-spec` reads
   `feature.md` and `{PREFIX}-Requirements.md`, and returns `spec/index.md`'s full content:
   every section genuinely feature-wide (Overview, Architecture, Security Considerations,
   Database Changes, Configuration, Implementation Order, Risks & Mitigations, any Open Question
   resolution touching more than one component) **plus** the Components index table — one row
   per file the feature creates or modifies, with columns `Path | Purpose-or-Change | Addresses |
   Spec` (the same three-column `Path | Purpose | Addresses` shape FTR-023 already established
   for §9, with one added column linking to that component's own detail file). No component's own
   `Change`/`Algorithm`/`Schema`/`Tests` content is produced in this call.
3. `pm-phase1.js` runs a new structural self-consistency pre-check — reusing
   `tech-spec-graph-checks.js`'s existing `parseFileInventoryEntries`/`checkAddressesResolve`
   **unmodified**, pointed at `spec/index.md` directly instead of the assembled document (its
   parser only reads §9's two subtables; everything else in the file is irrelevant to it) —
   before any per-component call is dispatched. A skeleton whose Components table cites a
   dangling AC, or whose directory listing doesn't match its own table, is rejected and
   regenerated.
4. **Per-component detail pass (one `c.worker()` call per component, in index-table order):** a
   new `gaia-generate-tech-spec-component` agent receives one component's index-table row (path,
   change type, AC list) plus the relevant Requirements/feature.md excerpt and the compact full
   component index (path + change type only, for cross-component awareness — e.g. "does another
   component already define this DTO?"). It returns that component's detail: `Change` (what
   changes and why), whichever of the monolithic template's Backend/Frontend/External-Integration
   subsections actually apply to this one file (real code/schema, not prose), and `Tests` (the
   specific test file(s) and cases for this component — per the confirmed empirical finding,
   every component gets its own Tests section, nothing stays centralized). `pm-phase1.js` writes
   the response to `spec/components/{fileSlug}.md`.
5. Once every component's file exists, **assembly**: a new `tech-spec-assembler.js` reads
   `spec/index.md` + every `components/*.md` file and reconstructs the exact 12-section
   `{PREFIX}-Tech-Spec.md` shape `gaia-generate-tech-spec` already produces today — Section 9
   rebuilt from the skeleton's own Components table (its `Path`/`Purpose-or-Change`/`Addresses`
   columns are authoritative, restated — not re-derived — from each component file, the same
   "skeleton fields are authoritative" rule FTR-020's OQ-03 established for Work Breakdown tasks);
   Sections 3/4/5/10's per-component content concatenated from each component file, in index-table
   order, under the appropriate subsection heading.
6. `pm-phase1.js`'s existing `assertCompleteSections` (12-section truncation check), `docsDigest`
   computation, the 3-cycle validation loop, and FTR-023's `tech-spec-ac-check` all proceed
   exactly as today, reading the now-assembled `{PREFIX}-Tech-Spec.md`. `gaia-generate-work-breakdown`,
   `ac-task-matrix.js`, and every other downstream consumer are unaffected: none of them read
   `spec/` directly, only the assembled file, exactly as before this feature.

## Out of Scope
- Any change to `gaia-generate-work-breakdown`, `wb-validate.js`/`wb-render.js`/`wbs-assembler.js`,
  `ac-task-matrix.js`, or `tech-spec-graph-checks.js`'s own exported functions (reused, not
  modified) — they continue to read the assembled `{PREFIX}-Tech-Spec.md`, or in
  `tech-spec-graph-checks.js`'s case, are pointed at a different input path with no code change.
- Any change to `lib/workflow-control.js`'s `worker()` single-output contract.
- Migrating existing (pre-this-feature) Tech-Spec documents to the split format — only newly
  (re)generated Tech-Specs get a `spec/` directory.
- A generated, machine-readable coverage artifact beyond what `ac-task-matrix.js` (FTR-022/023)
  already produces — this feature does not build a new matrix; it only makes the Tech-Spec side
  of the chain split, matching Requirements and the Work Breakdown.
- Per-component generation parallelism — sequential dispatch, matching FTR-020/021's own MVP
  scope.
- Resolving which exact template subsection(s) (Backend §3 vs Frontend §4 vs External
  Integrations §5) apply to a given component beyond what each component's own `Change Type` and
  Requirements context already imply — this is left to the per-component generation agent's own
  judgment, the same latitude `gaia-generate-tech-spec` already has today for a monolithic
  response.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| The skeleton's Components table cites a dangling AC ID | Rejected before any per-component call, by the reused `tech-spec-graph-checks.js` pre-check (pointed at `spec/index.md`) |
| The skeleton's Components table has a row with no matching `components/*.md` file (pre-dispatch) | Expected, not an error — no component files exist yet before per-component generation runs (same resume-vs-fresh reasoning FTR-021 established for `req/use-cases/`) |
| A per-component call fails or times out | Only that component is retried; components already generated are not regenerated (resume-by-existence, mirroring FTR-021 UC-04) |
| `pm-phase1` is re-run after a partial per-component failure | Components with an existing file are skipped; only missing ones are dispatched |
| `spec/index.md` or a referenced component file is missing or malformed at assembly time | `tech-spec-assembler.js` aborts with a structured error naming the specific path |
| A legacy feature has only a monolithic `{PREFIX}-Tech-Spec.md` and no `spec/` directory | The assembler's file-vs-directory dispatch loads it exactly as today — no behavior change, no forced regeneration |
| The assembled `{PREFIX}-Tech-Spec.md` is still missing one of the 12 sections after assembly | `assertCompleteSections` catches it exactly as it does today for a truncated single-call response |

## Data Model
N/A — internal/technical feature

### `spec/index.md`
Sections 1 (Overview), 2 (Architecture), 6 (Security Considerations), 7 (Database Changes), 8
(Configuration), 11 (Implementation Order), 12 (Risks & Mitigations) of today's single document,
plus Section 9's Components index table (`Path | Purpose-or-Change | Addresses | Spec`) — the
same three data columns FTR-023 already established, with one added column linking to that
component's own detail file.

### `spec/components/{fileSlug}.md`
One file per component (file created/modified): that component's own `Change` description, the
relevant Backend/Frontend/External-Integration subsection content (real schemas/code, not prose
summaries), and its own `Tests` section.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature has `feature.md` and `{PREFIX}-Requirements.md` | `pm-phase1` runs Tech-Spec generation | A skeleton call produces `spec/index.md` containing every feature-wide section and a complete Components index table, with no per-component detail content inline | Must |
| AC-02 | `spec/index.md`'s Components table passes the reused structural pre-check | `pm-phase1` runs | Exactly one `c.worker()` call is dispatched per component, in index-table order, each producing `spec/components/{fileSlug}.md` | Must |
| AC-03 | A per-component call fails or times out | `pm-phase1` is re-run | Only the failed component's call is retried; components already generated are not regenerated or overwritten | Must |
| AC-04 | Every component's detail file exists and parses | `tech-spec-assembler.js` runs | It reconstructs `{PREFIX}-Tech-Spec.md` in the exact 12-section shape `gaia-generate-tech-spec` produces today | Must |
| AC-05 | `spec/index.md` or a referenced component file is missing or malformed | The assembler runs | It aborts with an explicit, structured error identifying the missing/malformed path, before the validation loop proceeds | Must |
| AC-06 | A legacy feature has a monolithic `{PREFIX}-Tech-Spec.md` with no `spec/` directory | `pm-phase1` runs for that feature | It is read exactly as today; no behavior change, no forced regeneration | Must |
| AC-07 | `gaia-generate-work-breakdown`, `wb-validate.js`/`wb-render.js`/`wbs-assembler.js`, `ac-task-matrix.js`, `tech-spec-graph-checks.js`'s exported functions, and `lib/workflow-control.js`'s `worker()` | This feature is implemented | None of these are modified, except `tech-spec-graph-checks.js`'s one new call site (pointed at a different path, same functions) | Must |
| AC-08 | All changes are delivered | `npm test` runs | All tests pass: skeleton/component parsing and assembly, resume-skip-existing-component logic, parity between split-format and legacy-single-file assembled output, and a `pm-phase1.js` regression confirming `assertCompleteSections`/`docsDigest`/`tech-spec-ac-check` all still pass against the assembled document | Must |

## MVP vs Deferred

### MVP (must ship)
- `spec/index.md` (feature-wide sections + Components index table)
- `spec/components/{fileSlug}.md` per-component detail files
- Skeleton-generation agent call (modified `gaia-generate-tech-spec`)
- Per-component detail-generation agent call (new `gaia-generate-tech-spec-component`)
- `pm-phase1.js` orchestration: skeleton call → structural pre-check (reused
  `tech-spec-graph-checks.js`) → per-component calls with resume-by-existence → assembly
  (`tech-spec-assembler.js`) → existing `assertCompleteSections`/validation loop/`tech-spec-ac-check`
- Assembler supporting both the new split format and the legacy single-file format
- Automated tests per AC-08

### Deferred (next iteration)
- Per-component generation parallelism
- Migrating existing legacy monolithic Tech-Specs to the split format
- A generated dependency-ordered "Implementation Order" derived from component relationships
  (today, and in this feature's MVP, it remains hand-authored prose in the skeleton call, the
  same way it is today)

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact mapping of each of the monolithic template's 12 sections to "feature-wide (skeleton)" vs "per-component (detail)" — is it ever not a clean per-item split (e.g. does Architecture's Component Diagram need any per-component input)? | **Open — must be resolved in Tech-Spec** | The FTR-020 worked example already answered this for its own (simplified) Tech-Spec; must be re-validated against the real 12-section canonical template, not assumed to transfer unchanged |
| 2 | Does `tech-spec-graph-checks.js` need any modification to run against `spec/index.md` directly (a skeleton, pre-assembly) instead of the assembled document it reads today, or does it work unmodified? | **Open — must be resolved in Tech-Spec** | `parseFileInventoryEntries` only reads §9's two subtables; if `spec/index.md` preserves that exact heading/table shape, it may require zero changes — must be verified, not assumed |
| 3 | File-slug naming convention for `spec/components/{fileSlug}.md` (the real file path, e.g. `src/claude/scripts/wb-render.js`, is not a valid filename on its own) | **Open — must be resolved in Tech-Spec** | The FTR-020 worked example used the file's own basename (`wb-render.md`); must confirm this is collision-free in practice (two different directories' same-named file) and define the exact slugging rule |

## Dependencies and Assumptions
- FTR-020 (available): proved the skeleton+per-item split architecture; its own worked example
  (`spec/` in its feature folder) is this feature's primary design input, not a fresh design.
- FTR-021 (available): `req-assembler.js`'s assembler pattern (`findSectionRange`/`parseTableRows`,
  now exported) is the direct template for `tech-spec-assembler.js`.
- FTR-022/FTR-023 (available): `ac-task-matrix.js` and `tech-spec-graph-checks.js` must keep
  working unmodified (or with only a new call-site path) against the assembled document.
- `lib/workflow-control.js`'s `worker()` one-output-per-call contract is treated as fixed.
- `npm test` is the only verification command; no separate build step exists.
