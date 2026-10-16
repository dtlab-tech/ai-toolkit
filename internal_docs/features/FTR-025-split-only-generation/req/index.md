# FTR-025 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Stop `pm-phase1.js` from automatically assembling `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`
to disk as a by-product of generation. Generation produces only the split sources (`req/`, `spec/`
— FTR-021/FTR-024); the single-file view becomes an explicit, on-demand user action via a new
`assemble-docs.js` script. Every internal mechanism inside `pm-phase1.js` that currently depends on
the assembled file's existence (regen/truncation gates, `tech-spec-ac-check`, the Gate 1 validator,
`docsDigest`) is repointed at the split sources directly; `pm-phase2.js`'s own unmodified internals
(which still need the monolithic shape) are bridged transparently so the end-to-end pipeline keeps
working with no new required manual step.

### 1.2 Scope

In scope: `pm-phase1.js`'s own generation/validation/digest logic; `gaia-validate-feature-docs`'s
input contract; `gaia-generate-tech-spec`'s traceability read-step; a new bridge step in
`pm-phase2.js`; removing `pm-phase2.js`'s automatic `wb-render.js` call; the new `assemble-docs.js`
script and `/assemble-docs` command; `implement-feature/SKILL.md` and `feature-status.md` updates.

Out of scope: `gaia-generate-work-breakdown`'s own prompt-level consumption of Requirements/Tech-Spec
and `pm-phase2.js`'s per-task prompt (still reads the bridged monolithic Tech-Spec, unmodified);
`gaia-developer-backend/frontend/testing.md` (pm-phase3/task-executor implementation-time
consumption); migrating pre-existing legacy monolithic-only features to the split format; any
change to `docsDigest`'s hash algorithm, or to `req-assembler.js`/`tech-spec-assembler.js`/
`wb-render.js`/`wbs-assembler.js`'s own exported functions or output shape.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase1` workflow (coordinator) | Generates split sources only; assembles in-memory for validation/digest, never to disk |
| `gaia-validate-feature-docs` (modified) | Validates against inlined document text, not files it reads itself |
| `gaia-generate-tech-spec` (modified) | Reads `req/index.md` directly for traceability, not the assembled Requirements file |
| `pm-phase2` workflow (modified) | Transparently bridges split sources into the monolithic shape its own unmodified internals still need |
| User (toolkit operator) | Explicitly requests a combined single-file view via the new assemble command, independent of any gate |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Generate Requirements/Tech-Spec Without an Assembled File | Coordinator, `gaia-generate-tech-spec` | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Validate and Digest Against In-Memory Assembled Content | Coordinator, `gaia-validate-feature-docs` | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Bridge Split Sources for Unmodified Downstream Internals | `pm-phase2` coordinator | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |
| UC-04 | Produce a Combined Document On Demand | User (toolkit operator) | Must | [use-cases/UC-04.md](use-cases/UC-04.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | `pm-phase1.js`'s regen-freshness, truncation, and `tech-spec-ac-check` gates operate on `req/index.md`/`spec/index.md`, never on an assembled file | UC-01 |
| BR-02 | In-memory assembly happens on every Gate 1 validation attempt but is never written to disk by `pm-phase1.js`; it is recomputed after any `needsRequirementsFix`/`needsTechSpecFix` revision cycle | UC-02 |
| BR-03 | `pm-phase2.js` transparently regenerates `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` from `req/`/`spec/` at its own entry, before its own Gate 1 digest re-check, so its unmodified internals keep working with no new required manual step | UC-03 |
| BR-04 | A legacy feature (monolithic files only, no `req/`/`spec/` directories) is used as-is by `pm-phase2.js`'s bridge step — no assembly attempted, no error | UC-03 |
| BR-05 | The assemble command is a pure, read-only rendering action — it never affects any gate, approval, or digest | UC-04 |
| BR-06 | `gaia-generate-work-breakdown`, `pm-phase2.js`'s per-task prompt, and `gaia-developer-backend/frontend/testing.md` are not modified by this feature | All UCs |
| BR-07 | `wb-render.js` is no longer called automatically by `pm-phase2.js`; `{PREFIX}-Work-Breakdown.md`/`.csv` are produced only via the new assemble command | UC-04 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

No new persisted data shape. `req/index.md`/`req/use-cases/*.md` and `spec/index.md`/
`spec/components/*.md` (FTR-021/FTR-024) are unchanged by this feature — only *when* and *by whom*
their single-file view is produced changes. The in-memory assembled text `pm-phase1.js` now
computes for validation/digest purposes has no persisted representation at all.

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | The split-index-based regen-freshness/truncation check must not loosen staleness detection compared to today's assembled-file-based check |
| NFR-02 | In-memory assembly adds no LLM token cost — it is a deterministic subprocess call reusing the existing, unmodified assembler scripts |
| NFR-03 | `pm-phase2.js`'s Gate 1 digest re-check must still match an unchanged split source's digest — no false "stale approval" failures introduced by relocating assembly |
| NFR-04 | `assemble-docs.js` fails closed with a structured, path-naming error when a requested split source doesn't exist |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given `pm-phase1` generates or resumes Requirements/Tech-Spec, when generation completes, then no `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file is written by `pm-phase1.js` itself | UC-01 | Must |
| AC-02 | Given `req/index.md`/`spec/index.md` exist, when `pm-phase1` runs, then the regen-freshness, truncation, and `tech-spec-ac-check` gates all operate against these split index files | UC-01 | Must |
| AC-03 | Given Gate 1 validation runs, when `pm-phase1` dispatches `gaia-validate-feature-docs`, then the Requirements/Tech-Spec text is inlined directly into the worker's prompt and the agent does not attempt to read either document from disk | UC-02 | Must |
| AC-04 | Given a validation cycle completes, when `docsDigest` is computed, then it hashes the in-memory assembled text of both documents, identical in meaning to today's digest, with no intermediate file | UC-02 | Must |
| AC-05 | Given a feature has real `req/`+`spec/` directories and an approved Gate 1, when `pm-phase2` runs, then it transparently assembles and writes fresh `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` before its own Gate 1 digest check, with no change to any of its other unmodified internals | UC-03 | Must |
| AC-06 | Given a legacy feature has monolithic files only, no `req/`/`spec/` directories, when `pm-phase2` runs, then the existing monolithic files are used as-is, no assembly attempted, no error | UC-03 | Must |
| AC-07 | Given a user wants a single combined document, when they run the new `assemble-docs.js` (or `/assemble-docs`), then it produces `{PREFIX}-Requirements.md`, `{PREFIX}-Tech-Spec.md`, and/or `{PREFIX}-Work-Breakdown.md`+`.csv` on demand, individually or all at once | UC-04 | Must |
| AC-08 | Given `pm-phase2` completes a run, when Work Breakdown rendering is considered, then `wb-render.js` is no longer called automatically; the rendered files are produced only via the assemble command | UC-04 | Must |
| AC-09 | Given `gaia-generate-tech-spec` needs Requirements traceability context, when it runs, then it reads `req/index.md`, not `{PREFIX}-Requirements.md` | UC-01 | Must |
| AC-10 | Given `implement-feature/SKILL.md`'s Gate 1 presentation and `feature-status.md`'s artifact check, when a user reaches Gate 1 or runs `/feature-status`, then both reflect the new default artifact set (`req/`, `spec/`) and mention the assemble command | All UCs | Must |
| AC-11 | Given all changes are delivered, when `npm test` runs, then all tests pass: removed auto-writes, repointed gates, the `pm-phase2` bridge step (both real-split and legacy-fallback paths), the new `assemble-docs.js` script, and a full-suite regression | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024 (available): the split-generation architecture and assemblers
  (`wbs-assembler.js`, `req-assembler.js`, `tech-spec-assembler.js`) this feature builds on,
  reused unmodified.
- `lib/workflow-control.js`'s `worker()`/`c.command()`/`c.hash()` contracts are treated as fixed.
- `npm test` is the only verification command; no separate build step exists.
- Open Questions 1–3 from `feature.md` (exact `assemble-docs.js` CLI surface, whether `pm-phase2.js`'s
  bridge step is its own `c.activity()`, exact inlined-prompt format) must be closed by the Tech
  Spec before Gate 1.

## 9. Open Questions

Open Questions 1–3 raised in `feature.md` are resolved by the Tech Spec (§2) — see
`FTR-025-Tech-Spec.md`'s Components for the exact decisions.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec resolves all three Open Questions this document's
feature.md left pending.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference multiple
UCs each, the Acceptance Criteria table's `Related UC` column is the same cross-cutting pattern,
and Data Requirements/NFRs/Dependencies are feature-wide by nature.
