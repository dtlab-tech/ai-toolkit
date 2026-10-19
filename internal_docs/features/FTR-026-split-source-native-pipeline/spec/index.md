# Technical Specification — Split-Source-Native Work Breakdown Pipeline

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-026 |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |

## 1. Overview

Removes `pm-phase2.js`'s automatic `bridge-requirements-tech-spec` step (FTR-025's transitional
shim) by repointing every one of its own downstream consumers — three deterministic script call
sites, two agent prompts, and the per-task detail worker's Tech-Spec input — at the split `req/`/
`spec/` sources directly. The highest-value change is the per-task detail worker: today it receives
the **entire** assembled Tech-Spec text on every call; this feature replaces that with a
host-computed excerpt of just the component(s) relevant to that task's own Acceptance Criteria,
eliminating the pipeline's single largest structural token cost.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes internal data flow inside one existing workflow script
(`pm-phase2.js`), three existing agent prompts (`gaia-validate-work-breakdown-semantic`,
`gaia-generate-work-breakdown`, `gaia-generate-work-breakdown-task`), and one small, additive,
backward-compatible CLI argument on an existing standalone script (`ac-task-matrix.js`, needed to
keep its output location stable once its Requirements argument changes — see Risks). No new script,
no new command.

### 2.2 Component Diagram

```
Before (today, post-FTR-025):
  pm-phase2.js --bridge step--> assembles+writes {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md
                                     |
                                     +--read by--> wb-skeleton-check.js / wb-validate.js (parseAcTable)
                                     +--read by--> ac-task-matrix.js (parseAcTable + parseFileInventoryEntries)
                                     +--read by--> gaia-validate-work-breakdown-semantic (full Read)
                                     +--read by--> gaia-generate-work-breakdown (full Read, both files)
                                     +--inlined into--> every per-task prompt (full Tech-Spec text)

After (this feature):
  pm-phase2.js --no bridge step, no automatic write-->
                                     |
                                     +--reqIndexPath/specIndexPath--> wb-skeleton-check.js / wb-validate.js / ac-task-matrix.js
                                     +--reqIndexPath--> gaia-validate-work-breakdown-semantic (reads req/index.md)
                                     +--reqIndexPath+specIndexPath--> gaia-generate-work-breakdown (targeted reads)
                                     +--host-computed excerpt--> per-task worker (only relevant spec/components/*.md)

  User --explicitly runs--> assemble-docs.js [req|spec|wbs|all] --> single-file view(s), on demand (unchanged)
```

### 2.3 Sequence Diagrams

**Gate 1 digest re-check (UC-01), at `pm-phase2.js` entry:**
```
pm-phase2.js -> req-assembler.js (subprocess): assemble req/ -> stdout (in-memory only)
pm-phase2.js -> tech-spec-assembler.js (subprocess): assemble spec/ -> stdout (in-memory only)
pm-phase2.js: currentDigest = hash(assembledRequirements + NUL + assembledTechSpec)
pm-phase2.js: compare against Approvals.md's recorded Docs Digest (unchanged logic)
```
A legacy feature (no `req/`/`spec/`) instead reads the existing monolithic files directly, as before.

**Skeleton/validation script call sites (UC-01), at `pm-phase2.js` entry and after skeleton generation:**
```
pm-phase2.js -> wb-skeleton-check.js (subprocess): args = [indexPath, reqIndexPath]
pm-phase2.js -> wb-validate.js (subprocess): args = [wbsDir, reqIndexPath]
pm-phase2.js -> ac-task-matrix.js (subprocess): args = [wbsDir, reqIndexPath, specIndexPath, prefix, featureDir]
ac-task-matrix.js -> writes: {featureDir}/coverage-matrix/index.json, {featureDir}/coverage-matrix/index.md
```
(`wb-skeleton-check.js`/`wb-validate.js` are unchanged internally — `parseAcTable()` already parses
the split index file correctly; only the argument value changes from an assembled file path.
`ac-task-matrix.js` gains the explicit 5th `featureDir` argument and writes both files into a new
`coverage-matrix/` subfolder under it, instead of one `{PREFIX}-AC-Task-Matrix.md` at
`path.dirname(reqIndexPath)` — see Risks and `ac-task-matrix.js`'s own component.)

**Semantic validation (UC-02):**
```
pm-phase2.js -> gaia-validate-work-breakdown-semantic (worker): prompt = `${wbsDir}\n${reqIndexPath}`
gaia-validate-work-breakdown-semantic -> Read(req/index.md): Use Cases/Business Rules/AC tables
gaia-validate-work-breakdown-semantic -> pm-phase2.js: {valid, findings}
```

**Skeleton generation (UC-03):**
```
pm-phase2.js -> gaia-generate-work-breakdown (worker): prompt = featurePath  (unchanged call shape)
gaia-generate-work-breakdown -> Read(req/index.md), Read(spec/index.md)
gaia-generate-work-breakdown -> Read(req/use-cases/{UC}.md) / Read(spec/components/{slug}.md)   -- only as needed
gaia-generate-work-breakdown -> pm-phase2.js: skeleton JSON (unchanged schema)
```

**Per-task Tech-Spec excerpt (UC-04), per task:**
```
pm-phase2.js: components = parseComponentsTable(specIndexContent)   -- reused from tech-spec-assembler.js
pm-phase2.js: relevantFiles = components whose Addresses ∩ task.acceptanceCriteria ≠ ∅
pm-phase2.js: techSpecExcerpt =
    relevantFiles.length
      ? relevantFiles.map(c => `### ${c.filePath}\n\n${readComponentBody(c)}`).join('\n\n')
      : "_No component's Addresses column cites this task's Acceptance Criteria — full Components table below._\n\n" + componentsTableText
pm-phase2.js -> gaia-generate-work-breakdown-task (worker): prompt = buildTaskPrompt(index, taskId, techSpecExcerpt)
```

## 3. Backend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 4. Frontend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 5. External Integrations

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 6. Security Considerations

None — internal toolkit workflow change, no new external surface, no new input validation boundary.
The per-task excerpt computation reads only files already inside the feature's own `spec/` folder,
same trust boundary as every other script in `src/claude/scripts/`.

## 7. Database Changes

None.

## 8. Configuration

None — no new environment variables, app settings, or feature flags.

## 9. File Inventory

### New files
None — this feature adds no new script or command; it only changes existing call sites and prompts.

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/workflows/pm-phase2.js | Repoint Gate 1 digest re-check, `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js` call sites to split index paths; add host-computed per-task Tech-Spec excerpt (Addresses-column matching); remove the `bridge-requirements-tech-spec` activity entirely | AC-01, AC-02, AC-03, AC-06, AC-09 | BE | [components/pm-phase2.js.md](components/pm-phase2.js.md) |
| src/claude/scripts/ac-task-matrix.js | Add an explicit `featureDir` 5th CLI argument; write both a machine-readable `coverage-matrix/index.json` and a human-readable `coverage-matrix/index.md` (with summary add-ons) under it, replacing the single loose `{PREFIX}-AC-Task-Matrix.md` whose location would otherwise silently move once its Requirements argument becomes `reqIndexPath` | AC-03, AC-10 | BE | [components/ac-task-matrix.js.md](components/ac-task-matrix.js.md) |
| src/claude/agents/gaia-validate-work-breakdown-semantic.md | Read `req/index.md` instead of `{PREFIX}-Requirements.md` | AC-04, AC-09 | BE | [components/gaia-validate-work-breakdown-semantic.md.md](components/gaia-validate-work-breakdown-semantic.md.md) |
| src/claude/agents/gaia-generate-work-breakdown.md | Read `req/index.md`+`spec/index.md` as primary entry points; drill into per-item files only as needed, with a full-directory-scan fallback if the index alone is insufficient | AC-05, AC-09 | BE | [components/gaia-generate-work-breakdown.md.md](components/gaia-generate-work-breakdown.md.md) |
| src/claude/agents/gaia-generate-work-breakdown-task.md | Document that the Tech-Spec input it receives is now a host-computed excerpt (relevant component(s) only, or the full Components table as a fallback), not the full assembled Tech-Spec | AC-06, AC-09 | BE | [components/gaia-generate-work-breakdown-task.md.md](components/gaia-generate-work-breakdown-task.md.md) |
| tests/ac-task-matrix.test.js | New test(s) for the `coverage-matrix/index.json`+`index.md` dual output under the given `featureDir` | AC-03, AC-10 | TEST | [components/ac-task-matrix.test.js.md](components/ac-task-matrix.test.js.md) |
| tests/integration/workflow-runtime.test.js | New/updated tests for every repointed call site, the host-computed per-task excerpt (matched and fallback cases), removal of the bridge step, and the legacy-fallback path for each | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |

Column order matters: `Addresses` MUST stay the 3rd column — `tech-spec-graph-checks.js`'s existing,
unmodified, positional parser (FTR-023) always reads `cells[2]` as "Addresses". `Domain` and `Spec`
are trailing columns, safely ignored by that parser. Do not reorder them.

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/scripts/ac-task-matrix.js` — depends on: nothing (additive, backward-compatible CLI
   argument)
2. `src/claude/workflows/pm-phase2.js` — depends on: 1 (its repointed `ac-task-matrix.js` call site
   passes the new required `featureDir` argument)
3. `src/claude/agents/gaia-validate-work-breakdown-semantic.md` — depends on: 2 (its dispatch
   call's prompt/path argument comes from `pm-phase2.js`)
4. `src/claude/agents/gaia-generate-work-breakdown.md` — depends on: nothing (its own dispatch call
   shape — just `featurePath` — is unchanged; only the agent's own internal Read instructions change)
5. `src/claude/agents/gaia-generate-work-breakdown-task.md` — depends on: 2 (the excerpt it receives
   is computed in `pm-phase2.js`)
6. `tests/ac-task-matrix.test.js` — depends on: 1
7. `tests/integration/workflow-runtime.test.js` — depends on: 2, 3, 4, 5

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The host-computed Addresses-based file matching for a task's Tech-Spec excerpt finds zero relevant components (e.g. a purely organizational/glue task whose `acceptanceCriteria` cites an AC no component's Addresses column mentions) | The per-task worker gets insufficient Tech-Spec context | BR-05's explicit fallback: fall back to `spec/index.md`'s full Components table rather than an empty excerpt — never zero context |
| `pm-phase2.js`'s in-memory Gate 1 digest recomputation silently diverges from `pm-phase1.js`'s own assembly if either's subprocess invocation changes independently in the future | False "stale approval" failures, or a digest mismatch that blocks Gate 2 for no real reason | Both reuse the exact same `req-assembler.js`/`tech-spec-assembler.js` subprocess calls, unmodified, with the same arguments shape — same mitigation pattern FTR-025 already established and tested (digest-parity assertion) |
| Removing the `bridge-requirements-tech-spec` activity changes `pm-phase2.js`'s own token-ledger activity list | Any future reporting/ledger code assuming that activity name exists would break | Confirmed by `grep` that no other file in the repository references `'bridge-requirements-tech-spec'` by name — safe to remove outright |
| `gaia-generate-work-breakdown.md`'s new targeted-read pattern costs more total tokens than today's two full-file reads, for a feature with many small per-item files each requiring its own Read call | Net token increase instead of the intended reduction, for an edge-case feature shape | Accepted as a qualitative judgment, not empirically measured (no existing test infrastructure meters real agent token cost — `c.worker()` dispatch is mocked throughout the test suite, same limitation FTR-025 operated under); the index files alone (Use Cases/Components summary tables) are expected to be sufficient for most phase/task decisions without further per-item reads, since that is exactly what FTR-020/FTR-021/FTR-024 designed them to summarize |
| `ac-task-matrix.js`'s output path is derived from `path.dirname(requirementsPath)` — blindly repointing its Requirements argument to `reqIndexPath` (AC-03) would silently relocate `{PREFIX}-AC-Task-Matrix.md` from the feature root into `req/`, found by actually running the script with the intended arguments during this feature's own Tech-Spec validation, not by inspection alone | A Gate 2 artifact a user/downstream tooling expects at the feature root would silently move, breaking anything that reads `gate2_payload.ac_task_matrix_path` or assumes the old location | `ac-task-matrix.js`'s output is redesigned (AC-10, requested directly): a required `featureDir` 5th CLI argument, writing `coverage-matrix/index.json`+`index.md` under it, with `pm-phase2.js` updated to read both new paths and expose them as `ac_task_matrix_json_path`/`ac_task_matrix_md_path` — verified by actually re-running the script end to end against this feature's own fixtures, not just by code review |
| `coverage-matrix/index.json`'s new `generatedAt` timestamp field makes repeated runs non-byte-identical (the `index.md` summary line itself has no timestamp, so this is JSON-only) | A naive test comparing two runs' `index.json` output verbatim would flake | Normalize/strip `generatedAt` before any equality assertion — same precedent `assemble-docs.test.js` already established for `wb-render.js`'s own "Generated" timestamp field |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact mechanism for giving the per-task detail worker only the Tech-Spec content it needs | **Resolved** | Host-computed, not agent-self-navigated: `pm-phase2.js` reuses `tech-spec-assembler.js`'s own `parseComponentsTable()` to get each component's `Addresses` (AC IDs) list, then for a given task includes only the component(s) whose `Addresses` intersects that task's own `acceptanceCriteria` — deterministic, reuses already-existing parsing, no new LLM judgment call, consistent with the project's "host computes anything mechanically derivable" principle. Falls back to the full Components table (not zero content) when the intersection is empty (BR-05) |
| 2 | Whether the Gate 1 digest recomputation should be its own named `c.activity()` or inline | **Resolved** | Inline, not a separate `c.activity()` — unlike FTR-025's bridge step (which performed real file I/O worth tracking in the ledger/evidence trail), this is a pure re-derivation of a value already computed once per Gate 1 cycle by `pm-phase1.js`; no new activity boundary adds meaningful evidence value here |
| 3 | Token-cost comparison for `gaia-generate-work-breakdown.md`'s targeted-read approach vs. today's two full-file reads | **Resolved (qualitative)** | No dedicated token-metering test exists or is added (see Risks row above) — accepted as a reasoned design judgment rather than an empirically measured one, consistent with the limits of the existing test infrastructure |

## Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024/FTR-025 (available): the split-generation architecture, assemblers, and
  the `bridge-requirements-tech-spec` step this feature removes, all reused/modified as described.
- `tech-spec-assembler.js`'s `parseComponentsTable()` is reused, unmodified, to build the
  Addresses-to-component matching used for the per-task excerpt.
- `lib/workflow-control.js`'s `worker()`/`c.command()`/`c.hash()` contracts are fixed.
- `npm test` is the only verification command; no separate build step exists.
