# Split-Source-Native Work Breakdown Pipeline

## Feature ID
FTR-026

## Summary
Removes `pm-phase2.js`'s automatic `bridge-requirements-tech-spec` step entirely (added by FTR-025 as a
transitional shim) by making every one of its own downstream consumers — scripts and agents alike — read
the split `req/`/`spec/` sources directly, instead of the assembled `{PREFIX}-Requirements.md`/
`{PREFIX}-Tech-Spec.md` files. This completes the intent FTR-025 started: the assembled monolithic view
becomes purely an optional, on-demand user action (`assemble-docs.js`/`/assemble-docs`), never an automatic
side effect or load-bearing input anywhere in the pipeline. It also directly targets the token/prompt-size
risk FTR-025 deliberately left unaddressed: several call sites currently read or inline the **entire**
assembled Tech-Spec/Requirements text regardless of how much of it a given check or task actually needs,
which scales badly as a feature's Requirements/Tech-Spec grow and can trip "prompt too long" failures on
large features.

## Problem Statement
FTR-025 stopped `pm-phase1.js` from writing the assembled files, but `pm-phase2.js` still needs them for
its own unmodified internals, so it added a bridge step that transparently assembles-and-writes them fresh
from `req/`/`spec/` on every run. This reintroduces the exact automatic-assembly side effect FTR-025 set out
to eliminate — just moved one phase later — and several of the consumers it feeds are more expensive than
they need to be:
- Three script call sites (`wb-skeleton-check.js`, `wb-validate.js`, `ac-task-matrix.js`) pass the assembled
  Requirements/Tech-Spec file path to functions (`parseAcTable`, `parseFileInventoryEntries`) that already
  work correctly against the split `index.md` files directly — proven by `tech-spec-ac-check`'s own
  FTR-025 repointing — but were left on the assembled path because FTR-025 explicitly scoped them out to
  keep that PR's blast radius small.
- Two agents (`gaia-generate-work-breakdown.md`, `gaia-validate-work-breakdown-semantic.md`) are instructed
  to Read the full assembled file(s) from disk via their own Read tool, rather than being pointed at the
  much smaller split index files (drilling into specific per-item files only as needed).
- The per-task detail-generation prompt (`buildTaskPrompt` in `pm-phase2.js`) inlines the **entire**
  assembled Tech-Spec text into **every single task's** worker call — cost scales as
  `task count × full Tech-Spec size`, the single largest structural token cost in the whole Work Breakdown
  pipeline, and the primary motivation for this feature.
- The Gate 1 digest re-check reads both assembled files from disk purely to re-hash them, when the same
  value can be computed in-memory from the split sources, exactly as `pm-phase1.js` already does.

Once every consumer is repointed, the bridge step becomes dead code and can be deleted — eliminating the
last automatic write of a monolithic Requirements/Tech-Spec file anywhere in the pipeline.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change; the execution path is described below, call site by call site inside
`pm-phase2.js` unless otherwise noted.

1. **Gate 1 digest re-check** (currently `c.hash(c.read(file('Requirements.md')) + '\u0000' + c.read(file('Tech-Spec.md')))`)
   is recomputed from the split sources in-memory: the same `req-assembler.js`/`tech-spec-assembler.js`
   subprocess calls `pm-phase1.js` already makes to produce `docsDigest`, run here too, never persisted to
   disk. A legacy feature (monolithic files only, no `req/`/`spec/`) keeps reading the existing files as-is.
2. **`wb-skeleton-check.js`'s and `wb-validate.js`'s Requirements argument** both change from
   `file('Requirements.md')` to `reqIndexPath` — no change to either script's own code or to
   `wb-graph-checks.js`'s `parseAcTable()`, only a different call-site path, identical in spirit to how
   FTR-025 repointed `tech-spec-ac-check`.
3. **`ac-task-matrix.js`'s Requirements/Tech-Spec arguments** change from `file('Requirements.md')`/
   `file('Tech-Spec.md')` to `reqIndexPath`/`specIndexPath` — no change to `parseAcTable()` or
   `parseFileInventoryEntries()`: the Addresses column is positionally the 3rd cell in both the split
   index's 5-column Components table and the assembled legacy 3-column shape, so both parsers already
   tolerate either input unmodified. `ac-task-matrix.js`'s own output also changes, for two reasons
   found/decided while validating this feature's own design against the real script: (a) its output
   path was derived from `path.dirname(requirementsPath)`, which is the feature root today but would
   silently become `req/` once its Requirements argument becomes `reqIndexPath`; (b) the user asked
   for the output to live in a dedicated `coverage-matrix/` subfolder, as a machine-readable
   `index.json` (the full AC↔Task↔Phase↔Tech-Spec-file relation data) plus a human-readable
   `index.md` with summary add-ons, replacing today's single loose `{PREFIX}-AC-Task-Matrix.md` at
   the feature root. `pm-phase2.js`'s call site is told the feature directory explicitly, so the new
   subfolder's location is unaffected by which Requirements path `ac-task-matrix.js` is given.
4. **`gaia-validate-work-breakdown-semantic.md`** is rewritten to Read `req/index.md` instead of
   `{PREFIX}-Requirements.md` — the User Story descriptions/Acceptance Criteria text it needs already lives
   in the index's own tables (FTR-021), unaffected by the per-UC split.
5. **`gaia-generate-work-breakdown.md`** (the skeleton-generation agent) is rewritten to Read
   `req/index.md`+`spec/index.md` as its primary entry points, using its own Glob/Grep/Read access to pull
   in specific `req/use-cases/*.md`/`spec/components/*.md` files only where the index's own summary tables
   are insufficient for a given phase/task decision — replacing today's mandatory full-file reads with
   targeted, as-needed ones.
6. **The per-task detail worker prompt (`buildTaskPrompt`)** stops inlining the full assembled Tech-Spec
   text. Instead, the per-task worker (`gaia-generate-work-breakdown-task.md`) is given Read/Glob/Grep
   access to `spec/` directly and told to read `spec/index.md` (small, authoritative Domain/Addresses/Spec
   routing table) plus only the specific `spec/components/*.md` file(s) relevant to its own task (by domain
   and/or by the file paths implicated by its own `acceptanceCriteria`/outcome), rather than being hand-fed
   the entire spec every time. Exact selection mechanism (agent self-navigates via Glob/Grep vs. host
   pre-computes a candidate file list from domain+AC matching and includes it in the prompt) is an open
   design question to resolve in the Tech-Spec phase.
7. **The `bridge-requirements-tech-spec` activity is deleted.** With 1-6 complete, nothing inside
   `pm-phase2.js` or its dispatched agents needs the assembled monolithic files to exist; `pm-phase2.js`
   never writes them. A legacy feature (monolithic-only, no `req/`/`spec/`) is unaffected: its own existing
   files are read wherever a split-aware call site falls back to them (same `hasReq`/`hasSpec`-style
   detection FTR-025 already established, just preserved at each now-split-aware call site instead of
   centralized in one bridge step).
8. **`assemble-docs.js`/`/assemble-docs` remain unchanged** — still the only way a combined
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`/`{PREFIX}-Work-Breakdown.md` view is ever produced,
   now true for `pm-phase2.js` as well as `pm-phase1.js`.

## Out of Scope
- Any change to `req-assembler.js`/`tech-spec-assembler.js`/`wbs-assembler.js`/`assemble-docs.js`'s own
  exported functions or assembled output shape — `assemble-docs.js` remains the sole on-demand assembly
  entry point, unmodified.
- Any change to `wb-graph-checks.js`'s `parseAcTable()` or `tech-spec-graph-checks.js`'s
  `parseFileInventoryEntries()` — both are already split-source-safe; only their callers' arguments change.
- `pm-phase3`/task-executor's and `gaia-developer-backend/frontend/testing.md`'s own consumption of
  Tech-Spec during implementation — unaffected; those agents read whatever `wbs/`/task detail files already
  give them, independent of this feature's scope (Requirements/Tech-Spec generation and Work Breakdown
  generation, not implementation).
- Migrating pre-existing legacy monolithic-only features (no `req/`/`spec/` directories) to the split
  format — the legacy fallback path is preserved at every repointed call site, same precedent as FTR-025.
- Any change to the Gate 1/Gate 2 approval mechanics, `docsDigest`'s hash algorithm, or Approvals.md's
  format — only how/where the hashed content is read from changes.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A feature has real `req/`+`spec/` directories | Every repointed call site (scripts and agents) reads the split sources directly; no monolithic file is ever written by `pm-phase2.js` |
| A legacy feature has monolithic files only, no `req/`/`spec/` | Each repointed call site falls back to the existing monolithic file path, same as before this feature — no assembly attempted, no error |
| A user runs `/assemble-docs` before or after Gate 2 | Read-only rendering; unaffected by anything in this feature, same as FTR-025 |
| The per-task worker's own Read/Glob/Grep navigation of `spec/` fails to find a relevant component for its task | Falls back to reading `spec/index.md`'s own Components table for the full file list rather than guessing — never silently proceeds with zero Tech-Spec context |
| Gate 1 approval was recorded against a `docsDigest` computed from the assembled files (a pre-FTR-026 approval) | The in-memory recomputation from split sources must still produce the identical digest value for an unchanged `req/`/`spec/`, since it is the same two subprocess calls as before, now just not persisted — no spurious re-approval requirement |

## Data Model
N/A — internal/technical feature. No change to `req/`, `spec/`, or `wbs/`'s own on-disk shape; this feature
only changes which call sites read the split sources directly instead of the assembled file, and removes
the bridge step that produced the assembled file as a `pm-phase2.js` side effect.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature has real `req/`+`spec/` directories | `pm-phase2` runs | No `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file is written by `pm-phase2.js` itself | Must |
| AC-02 | `pm-phase2`'s Gate 1 digest re-check runs | Split sources are unchanged since Gate 1 approval | It recomputes the identical digest value in-memory from `req/`/`spec/`, with no file read of an assembled document | Must |
| AC-03 | `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js` run | Called from `pm-phase2.js` | Each is invoked with the split index file path(s) (`reqIndexPath`/`specIndexPath`), not an assembled file path; `wb-skeleton-check.js`/`wb-validate.js` need no code change, `ac-task-matrix.js` is given its feature directory explicitly so its output location doesn't move | Must |
| AC-10 | `ac-task-matrix.js` writes its output | Called from `pm-phase2.js` | It writes `coverage-matrix/index.json` (machine-readable relation data) and `coverage-matrix/index.md` (human-readable, with summary add-ons), not a single loose file at the feature root | Must |
| AC-04 | `gaia-validate-work-breakdown-semantic.md` runs | Semantic WB validation | It reads `req/index.md`, not `{PREFIX}-Requirements.md` | Must |
| AC-05 | `gaia-generate-work-breakdown.md` runs | Skeleton generation | It reads `req/index.md`+`spec/index.md` as primary entry points, drilling into specific per-item files only as needed, never mandated to Read either full assembled file | Must |
| AC-06 | A per-task detail worker runs for a given task | Task detail generation (`buildTaskPrompt`) | It is not handed the entire assembled Tech-Spec text; it obtains only the Tech-Spec content relevant to its own task via the mechanism decided in the Tech-Spec phase | Must |
| AC-07 | A legacy feature has monolithic files only, no `req/`/`spec/` | Any repointed call site (script or agent) runs | It falls back to the existing monolithic file, unchanged from pre-FTR-026 behavior | Must |
| AC-08 | All changes are delivered | `npm test` runs | All tests pass: the `bridge-requirements-tech-spec` step is removed, every repointed call site has a passing unit/integration test for both the split-source and legacy-fallback paths, and a full-suite regression | Must |
| AC-09 | A user wants a single combined document | They run `/assemble-docs` | Behavior is unchanged from FTR-025 — this feature does not touch `assemble-docs.js` | Must |

## MVP vs Deferred

### MVP (must ship)
- Gate 1 digest re-check recomputed in-memory from split sources (no file read).
- `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js` call sites repointed to `reqIndexPath`/
  `specIndexPath`.
- `gaia-validate-work-breakdown-semantic.md` repointed to `req/index.md`.
- `gaia-generate-work-breakdown.md` repointed to `req/index.md`+`spec/index.md`, with targeted per-item
  reads.
- Per-task prompt (`buildTaskPrompt`)/`gaia-generate-work-breakdown-task.md` redesigned to avoid inlining
  the full assembled Tech-Spec — exact mechanism resolved as part of the Tech-Spec phase (see Open
  Questions).
- Deletion of the `bridge-requirements-tech-spec` activity once 1-6 above no longer depend on it.
- Automated tests per AC-08.

### Deferred (next iteration)
- Any further reduction of per-task prompt size beyond removing the full-Tech-Spec inline (e.g. trimming
  sibling-task-list verbosity) — out of this feature's motivating problem.
- `pm-phase3`/task-executor and implementation-time developer agents' own Tech-Spec consumption — already
  out of scope (see above), remains a separate, not-yet-scoped future increment.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact mechanism for giving the per-task detail worker only the Tech-Spec content it needs: (a) grant it Read/Glob/Grep on `spec/` and let it self-navigate from `spec/index.md`'s routing table, or (b) host pre-computes a candidate component file list (by domain + acceptanceCriteria-to-Addresses matching) and includes just those files' content in the prompt | **Open — must be resolved in Tech-Spec** | (a) is simpler and mirrors how `gaia-generate-work-breakdown.md` itself will work post-AC-05, but costs an unknown number of extra tool calls per task; (b) is more deterministic and cheaper per-call but requires new host-side matching logic with its own correctness risk (a wrong match silently starves a task of relevant spec content) |
| 2 | Whether the Gate 1 digest recomputation should be its own named `c.activity()` (for ledger/evidence visibility) or inline, mirroring OQ-2 from FTR-025 | **Open — must be resolved in Tech-Spec** | Same precedent question as FTR-025's own OQ-2 |
| 3 | Whether `gaia-generate-work-breakdown.md`'s new targeted-read approach needs any change to its own token/cost estimate guidance, given FTR-025's assumption that reading `spec/index.md`+selected components is cheaper in the common case but could be more expensive for a feature with very many small components each requiring a separate Read call | **Open — must be resolved in Tech-Spec** | Needs a cost comparison against today's single full-file Read, using a real large feature's `spec/` as a reference point |

## Dependencies and Assumptions
- FTR-020/FTR-021/FTR-024/FTR-025 (available): the split-generation architecture, assemblers, and the
  `bridge-requirements-tech-spec` step this feature removes, all reused/modified as described above.
- `parseAcTable()` (`wb-graph-checks.js`) and `parseFileInventoryEntries()` (`tech-spec-graph-checks.js`)
  are already proven split-source-safe (verified by inspection: both only read positionally-stable columns
  present in both the split index's and the assembled file's table shapes) — this feature changes no code
  in either function, only callers' arguments.
- `npm test` is the only verification command; no separate build step exists.
- This is Phase 2 of the informal multi-step effort FTR-025 started (Phase 1: `pm-phase1.js`). A Phase 3
  (implementation-time agents reading `spec/` directly) remains unscoped, per FTR-025's own Deferred section.
