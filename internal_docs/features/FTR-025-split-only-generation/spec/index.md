# Technical Specification — Split-Only Document Generation with On-Demand Assembly

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-025 |
| Version | 1.0 |
| Date | 2026-10-16 |
| Status | Draft |

## 1. Overview

Stops `pm-phase1.js` from automatically writing `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`
as a by-product of generation. Every internal gate inside `pm-phase1.js` that currently reads the
assembled file (regen-freshness, truncation, `tech-spec-ac-check`, the Gate 1 validator's input,
`docsDigest`) is repointed at the split index files (`req/index.md`, `spec/index.md`); in-memory
assembly still happens (reusing the existing, unmodified `req-assembler.js`/`tech-spec-assembler.js`),
it is just never persisted. `pm-phase2.js` — whose own unmodified internals (including
`gaia-generate-work-breakdown`, which hard-aborts without the monolithic files) still need them —
transparently regenerates them itself at its own entry, so the end-to-end pipeline keeps working
with zero new required manual steps. A new `assemble-docs.js` script gives a user an explicit,
on-demand way to produce any of the three single-file views (Requirements, Tech-Spec, Work
Breakdown) whenever they actually want one.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes internal data flow inside two existing workflow
scripts (`pm-phase1.js`, `pm-phase2.js`) and two existing agent prompts
(`gaia-validate-feature-docs`, `gaia-generate-tech-spec`), and adds one new standalone CLI script
plus a thin command wrapper.

### 2.2 Component Diagram

```
Before (today):
  pm-phase1.js --writes--> {PREFIX}-Requirements.md / {PREFIX}-Tech-Spec.md
                                |
                                +--read by--> gaia-validate-feature-docs (by convention)
                                +--read by--> docsDigest
                                +--read by--> pm-phase2.js's own internals (unchanged downstream)

After (this feature):
  pm-phase1.js --writes--> req/index.md+use-cases/*.md ; spec/index.md+components/*.md  (only)
                                |
                                +--in-memory assembly (never written)--> inlined into
                                |     gaia-validate-feature-docs' prompt, and docsDigest
                                |
  pm-phase2.js (own entry) --assembles from req/+spec/--> {PREFIX}-Requirements.md / {PREFIX}-Tech-Spec.md
                                |                                (transparent bridge, written to disk)
                                +--unchanged--> wb-skeleton-check.js / wb-validate.js /
                                                ac-task-matrix.js / semantic validator /
                                                gaia-generate-work-breakdown

  User --explicitly runs--> assemble-docs.js [req|spec|wbs|all] --> single-file view(s), on demand
```

### 2.3 Sequence Diagrams

**Gate 1 validation (UC-02), per cycle:**
```
pm-phase1.js -> req-assembler.js (subprocess): assemble req/ -> stdout (in-memory only)
pm-phase1.js -> tech-spec-assembler.js (subprocess): assemble spec/ -> stdout (in-memory only)
pm-phase1.js -> gaia-validate-feature-docs (worker): prompt = featurePath + inlined Requirements
                                                      text + inlined Tech-Spec text + instructions
gaia-validate-feature-docs -> pm-phase1.js: {valid, findings, needsRequirementsFix,
                                             needsTechSpecFix, report}
pm-phase1.js: docsDigest = hash(assembledRequirements + NUL + assembledTechSpec)
```

**pm-phase2 bridge (UC-03), at entry:**
```
pm-phase2.js: reqDir/specDir exist?
  yes -> assemble (same two subprocess calls) -> write {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md
  no  -> {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md already exist (legacy)? use as-is : error
pm-phase2.js: Gate 1 digest re-check (unchanged logic) against the just-written/legacy files
pm-phase2.js: wb-skeleton-check.js / wb-validate.js / semantic validator / ac-task-matrix.js /
              gaia-generate-work-breakdown (all unchanged, read the bridged files)
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
boundary. `assemble-docs.js` only reads files already inside the feature's own folder and writes
alongside them, same trust boundary as every other script in `src/claude/scripts/`.

## 7. Database Changes

None.

## 8. Configuration

None — no new environment variables, app settings, or feature flags.

## 9. File Inventory

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| src/claude/scripts/assemble-docs.js | On-demand CLI: assembles req/spec/wbs split sources into single-file views | AC-07, AC-08 | BE | [components/assemble-docs.js.md](components/assemble-docs.js.md) |
| src/claude/commands/assemble-docs.md | Thin `/assemble-docs` slash command wrapping the script above | AC-07 | BE | [components/assemble-docs.md.md](components/assemble-docs.md.md) |
| tests/assemble-docs.test.js | Unit tests for the new script (req/spec/wbs/all, missing-source error paths) | AC-07, AC-11 | TEST | [components/assemble-docs.test.js.md](components/assemble-docs.test.js.md) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/workflows/pm-phase1.js | Stop writing assembled files; repoint regen/truncation/AC-check gates at split index files; in-memory assembly feeding the inlined validator prompt and docsDigest | AC-01, AC-02, AC-03, AC-04 | BE | [components/pm-phase1.js.md](components/pm-phase1.js.md) |
| src/claude/workflows/pm-phase2.js | New bridge step (assemble-and-write Requirements/Tech-Spec from split sources, with legacy fallback); remove automatic wb-render.js call | AC-05, AC-06, AC-08 | BE | [components/pm-phase2.js.md](components/pm-phase2.js.md) |
| src/claude/agents/gaia-validate-feature-docs.md | Phase 1 rewritten: Requirements/Tech-Spec text arrives inlined in the prompt, not read from disk | AC-03 | BE | [components/gaia-validate-feature-docs.md.md](components/gaia-validate-feature-docs.md.md) |
| src/claude/agents/gaia-generate-tech-spec.md | Traceability read-step repointed from `{PREFIX}-Requirements.md` to `req/index.md` | AC-09 | BE | [components/gaia-generate-tech-spec.md.md](components/gaia-generate-tech-spec.md.md) |
| src/claude/skills/implement-feature/SKILL.md | Gate 1 presentation reflects the new default artifact set (`req/`, `spec/`), mentions the assemble command | AC-10 | BE | [components/SKILL.md.md](components/SKILL.md.md) |
| src/claude/commands/feature-status.md | Artifact-presence check updated for the new default artifact set | AC-10 | BE | [components/feature-status.md.md](components/feature-status.md.md) |
| tests/integration/workflow-runtime.test.js | Updated/new tests for the removed auto-writes, repointed gates, the pm-phase2 bridge step (real-split and legacy-fallback), and the removed automatic wb-render.js call | AC-11 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |

Column order matters: `Addresses` MUST stay the 3rd column — `tech-spec-graph-checks.js`'s
existing, unmodified, positional parser (FTR-023) always reads `cells[2]` as "Addresses". `Domain`
and `Spec` are new trailing columns, safely ignored by that parser. Do not reorder them.

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/workflows/pm-phase1.js` — depends on: nothing (the split sources it reads already
   exist from FTR-021/FTR-024)
2. `src/claude/agents/gaia-validate-feature-docs.md` — depends on: 1 (prompt contract must match
   what `pm-phase1.js` now sends)
3. `src/claude/agents/gaia-generate-tech-spec.md` — depends on: nothing (independent small wording
   change)
4. `src/claude/workflows/pm-phase2.js` — depends on: 1 (the bridge step exists because `pm-phase1.js`
   no longer writes the monolithic files)
5. `src/claude/scripts/assemble-docs.js` — depends on: nothing (reuses existing, unmodified
   assemblers)
6. `src/claude/commands/assemble-docs.md` — depends on: 5
7. `src/claude/skills/implement-feature/SKILL.md` — depends on: 1, 4 (describes the real post-change
   artifact set and pipeline behavior)
8. `src/claude/commands/feature-status.md` — depends on: 1 (checks the new default artifact set)
9. `tests/integration/workflow-runtime.test.js` — depends on: 1, 4 (exercises the changes made there)
10. `tests/assemble-docs.test.js` — depends on: 5

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `pm-phase2.js`'s bridge step silently diverges from `pm-phase1.js`'s own assembly (different subprocess invocation, different error handling) | Gate 1 digest mismatch, or a confusing error at Gate 2 instead of Gate 1 | Both call the exact same `req-assembler.js`/`tech-spec-assembler.js` scripts, unmodified, with the same arguments shape — verified by a test asserting digest parity between the two phases for the same split sources |
| A future change to `req-assembler.js`/`tech-spec-assembler.js` silently changes assembled output shape, breaking the inlined validator prompt or the bridge step without either being touched | Validation false positives/negatives; bridge step produces a subtly wrong monolithic file | Both assemblers already have their own dedicated test suites (`tests/req-assembler.test.js`, `tests/tech-spec-assembler.test.js`) from FTR-021/FTR-024, unaffected by this feature — any future shape change must already update those first |
| `gaia-validate-feature-docs`'s inlined-prompt contract regresses validation quality compared to the agent reading files itself (e.g. losing some Glob/Grep-based cross-reference capability) | Weaker Gate 1 validation | The agent's `tools: Read, Glob, Grep` grant is unchanged — it can still explore the codebase for any OTHER context it needs; only the two specific documents it previously located-and-read-by-convention are now inlined directly, a strict narrowing of *how* it gets that one input, not a removal of its other capabilities |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact `assemble-docs.js` CLI surface | **Resolved** | `node assemble-docs.js <feature-dir> <prefix> [req\|spec\|wbs\|all]` — positional, mirroring every other script in `src/claude/scripts/` (`wb-render.js <wbs-dir> <prefix>`, `ac-task-matrix.js <wbs> <req> <spec> <prefix>`). Missing/invalid `which` prints usage and exits 1; a requested split source directory that doesn't exist exits 2 with a structured error naming the exact path (same `AssemblyError`-style convention `req-assembler.js`/`tech-spec-assembler.js` already use) |
| 2 | Whether `pm-phase2.js`'s bridge step is its own named `c.activity()` or inline setup | **Resolved** | Its own `c.activity('bridge-requirements-tech-spec', ...)`, mirroring the existing `wb-skeleton-check`/`wb-validate`/`wb-render`/`ac-task-matrix` activities in the same file — keeps the token ledger/evidence trail consistent (every meaningful deterministic step in `pm-phase2.js` is already its own named activity) |
| 3 | Exact inlined-prompt format for `gaia-validate-feature-docs` | **Resolved** | `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\nValidate only; ...` — same ordering and `Label:\ncontent` delimiter style `pm-phase2.js`'s existing `buildTaskPrompt` already uses to inline the assembled Tech-Spec text into the per-task prompt (`` `Tech-Spec:\n${techSpecText}` ``), so this feature introduces no new prompt-construction convention |

## Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024 (available): the split-generation architecture and assemblers
  (`wbs-assembler.js`, `req-assembler.js`, `tech-spec-assembler.js`) this feature builds on,
  reused unmodified.
- `lib/workflow-control.js`'s `worker()`/`c.command()`/`c.hash()` contracts are fixed.
- `npm test` is the only verification command; no separate build step exists.
