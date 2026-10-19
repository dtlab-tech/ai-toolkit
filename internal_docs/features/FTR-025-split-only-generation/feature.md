# Split-Only Document Generation with On-Demand Assembly

## Feature ID
FTR-025

## Summary
Stops `pm-phase1.js` from automatically assembling `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`
as a by-product of generation. Requirements/Tech-Spec generation produces only the split sources
(`req/`, `spec/` — FTR-021/FTR-024); the monolithic single-file view becomes an explicit, optional,
user-triggered action via a new `assemble-docs.js` script, never an automatic side effect of
generation. Every internal mechanism inside `pm-phase1.js` that currently depends on the assembled
file's existence or mtime (the regen/truncation gates, `tech-spec-ac-check`, the validation worker's
input, `docsDigest`) is repointed at the split sources directly — in-memory assembly is still used
to feed the validator and the digest, it is just never persisted to disk. `pm-phase2.js`'s own
unmodified internals (`wb-skeleton-check.js`, `wb-validate.js`, `ac-task-matrix.js`, the semantic
validator, and `gaia-generate-work-breakdown`, which hard-aborts without these files) still need
the monolithic files to exist; `pm-phase2.js` transparently regenerates them itself at its own
entry point, so the end-to-end pipeline keeps working with zero new required manual steps. Work
Breakdown rendering (`wb-render.js`, already a pure human-facing view nothing automated reads)
becomes user-triggered too, for consistency.

This is a scoped first increment, not the full redesign: WB generation's own prompt-level
consumption of Requirements/Tech-Spec (`gaia-generate-work-breakdown.md`, the per-task prompt's
inlined Tech-Spec text) and the implementation-time developer agents' consumption of Tech-Spec
(`gaia-developer-backend/frontend/testing.md`, pm-phase3/task-executor) are explicitly deferred —
both are higher-risk surfaces (the latter directly shapes code generation quality) that deserve
their own dedicated increment once this one is proven out.

## Problem Statement
Today, `pm-phase1.js` always writes `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` to disk as
an automatic consequence of generation, reconstructed every run from the real split sources via
`req-assembler.js`/`tech-spec-assembler.js`. This monolithic file is not just a convenience: the
generator's own regen/truncation gates, `tech-spec-ac-check`, the Gate 1 validator, and `docsDigest`
all currently read it back, making "assemble into one file" an implicit, load-bearing part of
generation rather than a deliberate choice. The user wants document generation to produce only the
split, per-item source of truth (`req/`, `spec/`, and — already the case since FTR-020 — `wbs/`),
with the decision to view/share a single combined document moved entirely to the user, as an
explicit, on-demand action.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change; the execution path is described below.

1. **`pm-phase1.js` — Requirements/Tech-Spec generation stops assembling to disk.**
   `generateRequirements()`/`generateTechSpec()` keep producing `req/index.md`+`req/use-cases/*.md`
   and `spec/index.md`+`spec/components/*.md` exactly as today (FTR-021/FTR-024, unchanged); the
   final `c.writeOutput(file('Requirements'/'Tech-Spec'), assembled...)` step is removed from both.
2. **Every internal gate inside `pm-phase1.js` that read the assembled file is repointed at the
   split index file instead:**
   - The top-level "does Requirements/Tech-Spec need to (re)generate at all" freshness check moves
     from `fresh(file('Requirements'))`/`fresh(file('Tech-Spec'), ...)` to
     `fresh(reqIndexPath)`/`fresh(specIndexPath, [featurePath, reqIndexPath])` — a tightening, not
     a loosening: the index file is the real, authoritative source the old assembled-file mtime was
     always only a proxy for (the same subtlety FTR-024 found and fixed for its own resume logic).
   - The 9/12-section truncation check (`assertCompleteSections`) runs against
     `c.read(reqIndexPath)`/`c.read(specIndexPath)` — functionally identical, since the skeleton
     already carries every top-level `## N. ` heading (assembly only ever fills content *into*
     them, never adds/removes headings).
   - `tech-spec-ac-check`'s Requirements argument changes from `file('Requirements')` to
     `reqIndexPath` — unaffected: the AC table (Requirements §7) is cross-cutting and already lives
     in the index untouched by the per-UC split (FTR-021), so `wb-graph-checks.js`'s `parseAcTable`
     needs no change, only a different call-site path.
3. **In-memory assembly still happens, exactly once per validation attempt, but is never written
   to disk.** `pm-phase1.js` invokes the same, unmodified `req-assembler.js`/`tech-spec-assembler.js`
   subprocesses it does today and keeps their stdout as local variables. This text is used for
   exactly two purposes: inlined directly into the Gate 1 validator's prompt (replacing today's
   implicit "go read `{PREFIX}-Requirements.md` yourself" convention — `gaia-validate-feature-docs`
   is told that the document text is supplied in its prompt, not on disk), and as the input to
   `docsDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)` — byte-identical in
   meaning to today's digest, just computed from a value that is never persisted. Re-computed after
   any `needsRequirementsFix`/`needsTechSpecFix` revision cycle, same as today's re-read would have
   been.
4. **`gaia-generate-tech-spec`'s own Requirements traceability read** moves from
   `{PREFIX}-Requirements.md` to `req/index.md` — the exact same content it needs (the AC table and
   UC index) already lives there untouched.
5. **`pm-phase2.js` transparently bridges the gap for its own unmodified internals.** At its own
   entry (after resolving paths, before the Gate 1 approval check), a new step assembles
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` fresh from `req/`/`spec/` (the same two
   subprocess calls, relocated) and writes them — invisible plumbing, not a user-facing deliverable.
   Everything downstream in `pm-phase2.js` (`wb-skeleton-check.js`, `wb-validate.js`, the semantic
   validator prompt, `ac-task-matrix.js`, and `gaia-generate-work-breakdown` — which hard-aborts
   without these files) continues to read them exactly as today, completely unmodified. The Gate 1
   digest re-check still matches: both phases hash the same deterministic assembly of the same
   split sources, so an unchanged `req/`/`spec/` always reproduces the same digest.
6. **A legacy feature** (pre-existing monolithic files, no `req/`/`spec/` directories — generated
   before this feature existed) is unaffected: `pm-phase1.js` has nothing to regenerate; `pm-phase2.js`'s
   new bridge step detects the absence of `req/`/`spec/` and uses the existing monolithic files
   as-is, without attempting to assemble or erroring.
7. **Work Breakdown rendering stops being automatic too.** `pm-phase2.js` no longer calls
   `wb-render.js` on every run — nothing automated reads `{PREFIX}-Work-Breakdown.md`/`.csv` today
   (confirmed: every real consumer already reads `wbs/` via `wbs-assembler.js`'s `loadWorkBreakdown()`),
   so this view becomes user-triggered-only for consistency, with no further consequences inside
   `pm-phase2.js`.
8. **A new `assemble-docs.js` script** (plus a thin `/assemble-docs` command wrapping it) lets a
   user produce any combination of the three single-file views on demand:
   `node .claude/scripts/assemble-docs.js <feature-dir> <prefix> [req|spec|wbs|all]`. It requires
   directly (not via subprocess — this script runs as a plain Node CLI, outside the sandboxed
   workflow runtime) `req-assembler.js`'s `loadRequirements`/`tech-spec-assembler.js`'s
   `loadTechSpec` for `req`/`spec`, and shells out to the existing `wb-render.js` for `wbs` (which
   is CLI-only, writing its own two output files and exiting).
9. **`implement-feature/SKILL.md`'s Gate 1 presentation and `feature-status.md`'s artifact-presence
   check** are updated to reflect the new default artifact set (`req/`, `spec/` — not automatically
   a single `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`), mentioning the new assemble command
   as how to get a combined view.

## Out of Scope
- `gaia-generate-work-breakdown.md`'s own prompt-level consumption of Requirements/Tech-Spec, and
  `pm-phase2.js`'s per-task prompt inlining the full assembled Tech-Spec text
  (`buildTaskPrompt(index, taskId, c.read(file('Tech-Spec.md')))`) — both keep reading the
  transparently-bridged monolithic files this feature's `pm-phase2.js` step still produces. Making
  WB generation itself split-source-aware is a separate, deferred increment.
- `gaia-developer-backend/frontend/testing.md` (pm-phase3/task-executor implementation agents) —
  they keep reading `{PREFIX}-Tech-Spec.md` exactly as today. This is the highest-risk surface
  (directly shapes code-generation quality) and is deferred to its own careful increment.
- Any change to `req-assembler.js`/`tech-spec-assembler.js`/`wb-render.js`/`wbs-assembler.js`'s own
  exported functions or assembled output shape — reused unmodified, only called from different
  places (or not automatically called at all, for `wb-render.js`).
- Any change to `docsDigest`'s hash algorithm or meaning — still `sha256` of
  `Requirements-text + NUL + Tech-Spec-text`, just computed from a value that is no longer
  persisted to disk by `pm-phase1.js`.
- Migrating pre-existing legacy monolithic-only features (no `req/`/`spec/` directory) to the split
  format.
- `ac-task-matrix.js`, `wb-skeleton-check.js`, `wb-validate.js`, `gaia-validate-work-breakdown-semantic.md` —
  unmodified; they keep reading whatever `pm-phase2.js`'s new bridge step writes for them.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| `pm-phase1` resumes with `req/index.md`/`spec/index.md` already fresh and complete, nothing to regenerate | In-memory assembly still runs (cheap, deterministic, no LLM tokens) to feed the validator's prompt and `docsDigest`; no file is written |
| A `needsRequirementsFix`/`needsTechSpecFix` revision cycle regenerates a document | The in-memory assembled text for that document is recomputed before the next validation cycle's prompt is built |
| `gaia-validate-feature-docs` receives empty/missing inlined text for a document (should not happen in practice, but mirrors today's "missing file" fail-closed path) | Records a finding, skips checks requiring it, completes with `valid: false` — same contract as today's missing-file case, different trigger |
| `pm-phase2.js` runs for a feature with real `req/`/`spec/` directories | Its new bridge step assembles and writes fresh `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` before the Gate 1 digest check, every run |
| `pm-phase2.js` runs for a legacy feature (monolithic files only, no `req/`/`spec/`) | Bridge step detects the missing split directories and leaves the existing monolithic files untouched — no assembly attempted, no error |
| A user runs `assemble-docs.js` before Gate 1 approval | Read-only rendering; does not affect any gate, approval, or digest |
| A user runs `assemble-docs.js`, then `pm-phase1 --force` regenerates the split sources | The previously-assembled file is now stale; this is expected and acceptable — it is an explicit point-in-time snapshot the user asked for, not a tracked pipeline artifact |
| `assemble-docs.js wbs` is run for a feature with no `wbs/` directory yet (WB not generated) | Fails closed with a clear "wbs/ not found" error, naming the exact expected path |

## Data Model
N/A — internal/technical feature. No change to `req/`, `spec/`, or `wbs/`'s own on-disk shape
(FTR-020/FTR-021/FTR-024, unchanged); this feature only changes *when* and *by whom* the
single-file view is produced.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | `pm-phase1` generates or resumes Requirements/Tech-Spec | Generation completes | No `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file is written by `pm-phase1.js` itself | Must |
| AC-02 | `req/index.md`/`spec/index.md` exist | `pm-phase1` runs | The regen-freshness, truncation, and `tech-spec-ac-check` gates all operate against these split index files, not an assembled file | Must |
| AC-03 | Gate 1 validation runs | `pm-phase1` dispatches `gaia-validate-feature-docs` | The Requirements/Tech-Spec text is inlined directly into the worker's prompt; the agent does not attempt to read either document from disk | Must |
| AC-04 | A validation cycle completes (clean or after revision) | `docsDigest` is computed | It hashes the in-memory assembled text of both documents, identically in meaning to today's digest, with no intermediate file | Must |
| AC-05 | A feature has real `req/`+`spec/` directories and an approved Gate 1 | `pm-phase2` runs | It transparently assembles and writes fresh `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` from the split sources before its own Gate 1 digest check, with no change to `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js`/the semantic validator/`gaia-generate-work-breakdown` | Must |
| AC-06 | A legacy feature has monolithic files only, no `req/`/`spec/` directories | `pm-phase2` runs | The existing monolithic files are used as-is; no assembly attempted, no error | Must |
| AC-07 | A user wants a single combined document | They run the new `assemble-docs.js` (or `/assemble-docs`) | It produces `{PREFIX}-Requirements.md`, `{PREFIX}-Tech-Spec.md`, and/or `{PREFIX}-Work-Breakdown.md`+`.csv` on demand, individually or all at once, from whichever split sources exist | Must |
| AC-08 | `pm-phase2` completes a run | Work Breakdown rendering is considered | `wb-render.js` is no longer called automatically; `{PREFIX}-Work-Breakdown.md`/`.csv` are produced only via the new assemble command | Must |
| AC-09 | `gaia-generate-tech-spec` needs Requirements traceability context | It runs | It reads `req/index.md`, not `{PREFIX}-Requirements.md` | Must |
| AC-10 | `implement-feature/SKILL.md`'s Gate 1 presentation and `feature-status.md`'s artifact check | A user reaches Gate 1, or runs `/feature-status` | Both reflect the new default artifact set (`req/`, `spec/`) and mention the assemble command, instead of assuming the monolithic files always exist | Must |
| AC-11 | All changes are delivered | `npm test` runs | All tests pass: removed auto-writes, repointed gates, the `pm-phase2` bridge step (both the real-split and legacy-fallback paths), the new `assemble-docs.js` script, and a full-suite regression | Must |

## MVP vs Deferred

### MVP (must ship)
- `pm-phase1.js`: stop writing the assembled files; repoint regen/truncation/`tech-spec-ac-check`
  gates at `req/index.md`/`spec/index.md`; in-memory assembly feeding the validator's inlined
  prompt and `docsDigest`.
- `gaia-validate-feature-docs.md`: Phase 1 rewritten for the inlined-prompt contract.
- `gaia-generate-tech-spec.md`: traceability read-step repointed at `req/index.md`.
- `pm-phase2.js`: new bridge step (assemble-and-write Requirements/Tech-Spec from split sources,
  with legacy fallback); removal of the automatic `wb-render.js` call.
- New `src/claude/scripts/assemble-docs.js` + `/assemble-docs` command.
- `implement-feature/SKILL.md` Gate 1 presentation and `feature-status.md` updates.
- Automated tests per AC-11.

### Deferred (next iteration)
- `gaia-generate-work-breakdown.md` and `pm-phase2.js`'s per-task prompt becoming split-source-aware
  (own increment — the WB-generation consumption graph).
- `gaia-developer-backend/frontend/testing.md` (pm-phase3/task-executor) reading `spec/` directly
  during implementation (own increment — highest risk, directly shapes code-generation quality).
- Migrating pre-existing legacy monolithic-only features to the split format.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact `assemble-docs.js` CLI surface (flag-based vs. positional `[req\|spec\|wbs\|all]`, output path conventions, behavior when a requested split source doesn't exist) | **Open — must be resolved in Tech-Spec** | Sketched above as a starting point, not finalized |
| 2 | Whether `pm-phase2.js`'s bridge step should be its own named `c.activity()` (for ledger/evidence visibility) or inline setup before the existing Gate 1 check | **Open — must be resolved in Tech-Spec** | Precedent exists for both styles elsewhere in `pm-phase2.js`; pick whichever keeps the token ledger/evidence trail consistent with the rest of the file |
| 3 | Exact inlined-prompt format for `gaia-validate-feature-docs` (delimiters, ordering, how `featurePath` and the two document bodies are concatenated) | **Open — must be resolved in Tech-Spec** | Must stay consistent with `pm-phase2.js`'s existing `buildTaskPrompt` precedent for inlining Tech-Spec text into a prompt |

## Dependencies and Assumptions
- FTR-020/FTR-021/FTR-024 (available): the split-generation architecture and assemblers
  (`wbs-assembler.js`, `req-assembler.js`, `tech-spec-assembler.js`) this feature builds on,
  reused unmodified.
- `lib/workflow-control.js`'s `worker()`/`c.command()`/`c.hash()` contracts are treated as fixed.
- `npm test` is the only verification command; no separate build step exists.
- This is Phase 1 of a (so far informal, undocumented-as-an-initiative) multi-step effort to make
  split-generation's single-file view fully optional end to end; Phases 2 (WB generation) and 3
  (implementation agents) are not yet scoped as their own features.
