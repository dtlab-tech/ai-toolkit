# Technical Specification — Resume-Safe Per-Item Generation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-027 |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |

## 1. Overview

Hardens the existing resume-by-existence (`pm-phase1.js`) and resume-by-status (`pm-phase2.js`)
mechanisms so each one also checks structural validity, not just file presence, before treating a
per-item file as already-done. Three item types, three already-authoritative validity definitions
reused unmodified: Tech-Spec components (`tech-spec-assembler.js`'s `parseComponentDetail`),
Requirements use cases (a new, minimal `### {UC-ID}: ` heading-match invariant — no stricter
contract exists to reuse for this intentionally free-form document type), and Work Breakdown tasks
(`wbs-assembler.js`'s `parseTaskDetailBlock`, checking for a non-empty `verificationCommands`
array). Directly motivated by a reproduced production incident where a single malformed component
file caused every retry of a ~56-component Tech-Spec generation to fail identically, with no way
for the pipeline to recover on its own.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes internal decision logic inside two existing workflow
scripts (`pm-phase1.js`, `pm-phase2.js`) and adds/updates tests in three existing test files plus
one shared test helper — no new script, no new command, no new agent.

### 2.2 Component Diagram

```
Before (today):
  pm-phase1.js: outer gate checks anyUcFileMissing/anyComponentFileMissing (presence only)
  pm-phase1.js: per-item loops check c.exists(path) (presence only)
  pm-phase2.js: per-task loop checks status === 'generated' && c.exists(path) (presence only)
                |
                +--a structurally invalid-but-present file is skipped forever, never regenerated

After (this feature):
  pm-phase1.js: anyComponentFileMissing  -> also tries parseComponentDetail(); throws counts as missing
  pm-phase1.js: anyUcFileMissing         -> also checks the ### {UC-ID}: heading; mismatch counts as missing
  pm-phase1.js: per-component loop       -> same parseComponentDetail() check before skipping
  pm-phase1.js: per-use-case loop        -> same heading check before skipping
  pm-phase2.js: per-task loop            -> also requires parseTaskDetailBlock().verificationCommands.length > 0
                |
                +--an invalid-but-present file is treated exactly like a missing one: regenerated
```

### 2.3 Sequence Diagrams

**Tech-Spec component resume (UC-01), per `pm-phase1.js` entry:**
```
pm-phase1.js: specIndexPath fresh and complete? (unchanged skeletonStale check)
pm-phase1.js: for each component row -> parseComponentDetail(read(compPath)) throws OR file missing?
  any true -> regenSkeleton-independent outer gate treats Tech-Spec generation as needed
pm-phase1.js: generateTechSpec() per-component loop -> same per-row check -> dispatch only invalid/missing rows
```

**Requirements use-case resume (UC-02), per `pm-phase1.js` entry:**
```
pm-phase1.js: for each UC row -> read(ucPath) starts with "### {UC-ID}: "? OR file missing?
  any false -> outer gate treats Requirements generation as needed
pm-phase1.js: generateRequirements() per-use-case loop -> same per-row check -> dispatch only invalid/missing rows
```

**Work Breakdown task resume (UC-03), per `pm-phase2.js` per-task loop:**
```
pm-phase2.js: for each task -> status === 'generated' AND exists(detailPath) AND
              parseTaskDetailBlock(read(detailPath)).verificationCommands.length > 0 ?
  all true  -> skip, no dispatch
  any false -> dispatch (regenerate)
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

None — internal toolkit workflow change, no new external surface, no new input validation
boundary. Every validity check reads only files already inside the feature's own folder.

## 7. Database Changes

None.

## 8. Configuration

None — no new environment variables, app settings, or feature flags.

## 9. File Inventory

### New files
None — this feature only changes existing decision logic and its existing tests.

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/workflows/pm-phase1.js | Add `parseComponentDetail`-based validity check to the Tech-Spec per-component loop and `anyComponentFileMissing` outer gate; add a new `### {UC-ID}: ` heading-match validity check to the Requirements per-use-case loop and `anyUcFileMissing` outer gate | AC-01, AC-02, AC-03, AC-04, AC-05, AC-08 | BE | [components/pm-phase1.js.md](components/pm-phase1.js.md) |
| src/claude/workflows/pm-phase2.js | Add a `parseTaskDetailBlock`-based validity check (non-empty `verificationCommands`) to the per-task resume-by-status loop | AC-06, AC-07, AC-08 | BE | [components/pm-phase2.js.md](components/pm-phase2.js.md) |
| tests/pm-phase1-req-resume.test.js | Update the mirror predicate and source-text guard for the new use-case validity condition | AC-04, AC-05, AC-09 | TEST | [components/pm-phase1-req-resume.test.js.md](components/pm-phase1-req-resume.test.js.md) |
| tests/helpers/pm-phase2-flow.js | Update `selectPendingTaskIds`'s mirror predicate to accept and apply a validity check | AC-06, AC-07, AC-09 | TEST | [components/pm-phase2-flow.js.md](components/pm-phase2-flow.js.md) |
| tests/pm-phase2-wbs-resume.test.js | Update the source-text guard and call site for the new task validity condition | AC-06, AC-07, AC-09 | TEST | [components/pm-phase2-wbs-resume.test.js.md](components/pm-phase2-wbs-resume.test.js.md) |
| tests/integration/workflow-runtime.test.js | New end-to-end tests: an invalid-but-present component/use-case/task file is regenerated on resume; a valid one is still skipped; the outer gate reacts to an invalid component/use-case file the same way it already reacts to a missing one | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |

Column order matters: `Addresses` MUST stay the 3rd column — `tech-spec-graph-checks.js`'s
existing, unmodified, positional parser (FTR-023) always reads `cells[2]` as "Addresses". `Domain`
and `Spec` are trailing columns, safely ignored by that parser. Do not reorder them.

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/workflows/pm-phase1.js` — depends on: nothing (reuses `tech-spec-assembler.js`'s
   `parseComponentDetail`, already unmodified and available)
2. `src/claude/workflows/pm-phase2.js` — depends on: nothing (reuses `wbs-assembler.js`'s
   `parseTaskDetailBlock`, already unmodified and available; independent of 1)
3. `tests/pm-phase1-req-resume.test.js` — depends on: 1 (mirrors its new condition)
4. `tests/helpers/pm-phase2-flow.js` — depends on: 2 (mirrors its new condition)
5. `tests/pm-phase2-wbs-resume.test.js` — depends on: 2, 4
6. `tests/integration/workflow-runtime.test.js` — depends on: 1, 2

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The component/task validity checks run `parseComponentDetail()`/`parseTaskDetailBlock()` against every existing file on every single pipeline entry (not just once) — a cost concern for a large feature (~56 components) | Repeated re-parsing on every resume attempt, though still zero-LLM-cost and cheap relative to a worker dispatch | Accepted: each parse is a local, synchronous, in-memory string operation on an already-small file (a few KB) — negligible next to the cost of even one avoided LLM re-dispatch, which is the entire point of this feature |
| The use-case heading-match check could reject a use-case file whose title legitimately differs from the skeleton's own Title column (e.g. the agent rephrased it slightly) | A false "invalid" regeneration, wasting one dispatch even though the file was fine | The check only compares the ID fragment (`### {UC-ID}: `), never the free-text title after the colon — exactly designed to avoid this false positive (BR-03) |
| `parseComponentDetail()` throwing is used as a boolean signal (valid/invalid) inside a hot per-item loop/outer gate, where today's code never needed try/catch around this call | A real parsing error unrelated to this feature (e.g. a corrupted `spec/index.md` that `parseComponentsTable` itself would already have failed on, upstream of this check) could be silently reinterpreted as "just regenerate this one component" instead of surfacing as a distinct upstream problem | Not a real risk in practice: `parseComponentDetail()` only ever parses one already-resolved component FILE's content (never `spec/index.md` itself), and its only two failure modes are exactly "missing ## Change" / "missing ## Tests" — both of which this feature explicitly wants to treat as "regenerate" |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Should the outer regen gate's `anyComponentFileMissing`/`anyUcFileMissing` helpers be renamed to reflect that they now also check validity? | **Resolved** | Keep the existing names unchanged — "missing" is treated as the general concept of "not currently available to skip regenerating", and renaming would touch every existing call site for a purely cosmetic reason; a code comment at each definition documents the expanded meaning instead |
| 2 | Exact scope of the use-case heading-match check — ID-only, or tolerant of title variation? | **Resolved** | ID-only, per BR-03/the Risks row above: `/^###\s+{UC-ID}:\s/` (escaped for regex) matched against the file's own leading content, never comparing the title text that follows |

## Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024/FTR-025/FTR-026 (available): the split-generation architecture and its
  existing resume-by-existence/resume-by-status mechanisms, reused and extended, never replaced.
- `tech-spec-assembler.js`'s `parseComponentDetail` and `wbs-assembler.js`'s `parseTaskDetailBlock`
  are treated as fixed, authoritative validity definitions for their respective item types — this
  feature imports/requires neither (both scripts' functions are already reachable the same way
  `pm-phase1.js`/`pm-phase2.js` already duplicate other primitives from them, per this codebase's
  own "sandboxed runtime has no `require`" precedent — these checks are implemented as local,
  duplicated logic matching each function's own algorithm, not an actual cross-file call).
- `npm test` is the only verification command; no separate build step exists.
