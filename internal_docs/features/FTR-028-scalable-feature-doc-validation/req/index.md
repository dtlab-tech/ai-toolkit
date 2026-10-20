# FTR-028 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Cap `gaia-validate-feature-docs`'s own prompt size to the Tech-Spec **skeleton**
(`spec/index.md`), independent of how many components a feature has or how much per-component
design prose each one carries, while preserving — not weakening — its coverage of both
mechanical/traceability gaps (moved to a new deterministic, host-only check) and deep-technical
gaps (moved to a new, narrowly-scoped drill-down pass that reads only the specific component files
a claim actually needs).

### 1.2 Scope

In scope: `pm-phase1.js`'s validation step (the one call site building `gaia-validate-feature-docs`'s
prompt and processing its result); `gaia-validate-feature-docs.md`'s own Phase 1/Phase 3/schema
contract; a new deterministic AC↔component traceability check; a new narrow agent
(`gaia-validate-tech-spec-component-detail`) and its `lib/agent-registry.js` entry.

Out of scope: any equivalent reduction for the Requirements side of the same prompt; any general
token-budget/chunking framework for worker prompts beyond this one call site; any change to
`tech-spec-assembler.js`'s `loadTechSpec()`/`assembleTechSpec()` themselves (both remain unmodified,
still used for `docsDigest` and every other real consumer); the 3-cycle revision-loop limit; the
per-item resume-validity mechanisms (FTR-027).

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase1` workflow (coordinator) | Builds the validator's prompt, dispatches the main validator and any drill-down batches, merges every finding source, and owns the revision loop |
| `gaia-validate-feature-docs` (existing agent, reworded) | Performs the main coverage/semantic validation pass against `feature.md`, full Requirements, and the Tech-Spec SKELETON only |
| `gaia-validate-tech-spec-component-detail` (new agent) | Verifies a small, named batch of deep-technical claims against only the specific component files the host tells it to Read |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Validate Tech-Spec Coverage Using the Skeleton Only | `pm-phase1` coordinator / `gaia-validate-feature-docs` | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Enforce AC↔Component Traceability Deterministically | `pm-phase1` coordinator | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Drill Down on Components for Deep-Technical Claims | `pm-phase1` coordinator / `gaia-validate-tech-spec-component-detail` | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | The validator's prompt always uses the raw Tech-Spec skeleton (`c.read(specIndexPath)`), never `assembleTechSpec()`'s fully-spliced output — Requirements' own prompt text is unchanged (`assembleRequirements()`, full UC detail included) | UC-01 |
| BR-02 | `docsDigest` always hashes the full, unreduced `assembleRequirements()`/`assembleTechSpec()` output, regardless of what any validator pass is given to read — Gate 1 approval binds to the real document bytes, never a reduced view | UC-01 |
| BR-03 | The AC↔component traceability check is computed purely from already-parsed `req/index.md` (AC table) and `spec/index.md` (File-Inventory Addresses column) tables — zero LLM calls, zero new parsing contracts invented | UC-02 |
| BR-04 | Every finding source — the main validator's own `findings`, the deterministic traceability check, and any drill-down batch — is merged into one `findings` array, with `valid`/`needsRequirementsFix`/`needsTechSpecFix` recomputed from the MERGED set, before the existing valid/findings contradiction guard runs | UC-02, UC-03 |
| BR-05 | A `needsComponentDetail` entry naming a `fileSlug` absent from `spec/index.md`'s own component table is dropped before dispatch and converted into its own `"Tech-Spec: ..."` finding — never passed through to the drill-down agent | UC-03 |
| BR-06 | Drill-down dispatch deduplicates by `fileSlug` first, then batches the resulting unique components into groups of at most `K` (default 8) per worker call — never one call per claim, never one call covering every flagged component regardless of count | UC-03 |
| BR-07 | The drill-down agent Reads only the component file(s) named in its own prompt for its own batch — never `feature.md`, never Requirements, never any other component, never the Tech-Spec skeleton | UC-03 |
| BR-08 | `--force` and any `needsRequirementsFix`/`needsTechSpecFix` revision cycle are unaffected: each of the 3 cycles re-runs the full sequence (main pass → deterministic check → drill-down batches → merge → guard) exactly as it runs on cycle 1 | All UCs |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

No new persisted data shape or on-disk artifact. `{PREFIX}-Validation-Report.md`'s own persisted
format is unchanged — only its content may include additional findings appended by the host before
the file is written. `needsComponentDetail` is an in-memory structured field on the main
validator's own worker result, never itself persisted.

### 4.1 Entities

N/A — no new entity. The new `needsComponentDetail` array uses two existing concepts: a free-text
claim string, and a `fileSlug` already defined by `spec/index.md`'s own component table (FTR-024).

### 4.2 Validation Rules

| Rule | Enforced by |
|------|-------------|
| A `needsComponentDetail` entry's `fileSlug` must exist in `spec/index.md`'s component table | Host, before dispatching any drill-down batch (BR-05) |
| The merged `valid` must be `false` whenever ANY finding source (main pass, deterministic check, or drill-down) is non-empty | Host, before the existing contradiction guard (BR-04) |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Scalability | The main validator's prompt size must be bounded by Tech-Spec component COUNT (one skeleton row each), never by per-component design-prose length |
| NFR-02 | Scalability | Total drill-down dispatch count per validation cycle must be bounded by `ceil(unique flagged components / K)`, never by the number of flagged claims |
| NFR-03 | Correctness | The merged result must never report `valid: true` while any deterministic or drill-down finding remains unresolved |
| NFR-04 | Correctness | `docsDigest` must remain computed from the full, unreduced assembled documents, regardless of any validator pass's own reduced input |
| NFR-05 | Compatibility | `{PREFIX}-Validation-Report.md`'s persisted shape (a Markdown report, written verbatim) is unchanged; only content may gain additional findings |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given `spec/index.md` plus N component files with large design bodies, when `pm-phase1`'s validation step builds the main validator's prompt, then the prompt contains the Tech-Spec skeleton content but none of the per-component Change/Algorithm/Schema/Tests prose | UC-01 | Must |
| AC-02 | Given a component's Addresses column references an AC-ID absent from `req/index.md`'s AC table, when `pm-phase1`'s validation step runs, then a deterministic `"Tech-Spec: ..."` finding is produced and `needsTechSpecFix` is forced true | UC-02 | Must |
| AC-03 | Given an AC-ID in `req/index.md`'s AC table is referenced by zero Tech-Spec components, when `pm-phase1`'s validation step runs, then a deterministic `"Tech-Spec: ..."` finding is produced and `needsTechSpecFix` is forced true | UC-02 | Must |
| AC-04 | Given the main validator returns `valid: true` with empty `findings`/`needsComponentDetail`, but AC-02 or AC-03's condition holds, when `pm-phase1`'s validation step runs, then the merged result is not treated as valid; the correct fix flag is forced true and the revision cycle continues | UC-02 | Must |
| AC-05 | Given no deterministic structural gaps exist and no `needsComponentDetail` entries are produced, when the main validator independently returns `valid: true`, then the merged result is valid, unchanged behavior from today | UC-01, UC-02 | Must |
| AC-06 | Given a claim needs component-body detail to verify (not visible in Purpose/Addresses/Domain), when the main validator runs, then it returns a `needsComponentDetail` entry `{ claim, fileSlug }` naming a real, existing skeleton row, instead of guessing or silently dropping the check | UC-03 | Must |
| AC-07 | Given a `needsComponentDetail` entry names a `fileSlug` that exists in `spec/index.md`'s table, when the host processes the main validator's result, then a drill-down worker call is dispatched, Reading only that component's file (and any others batched with it) | UC-03 | Must |
| AC-08 | Given a `needsComponentDetail` entry names a `fileSlug` absent from `spec/index.md`'s table, when the host processes the main validator's result, then the entry is dropped before dispatch and a `"Tech-Spec: ..."` finding about the bad reference is produced instead | UC-03 | Must |
| AC-09 | Given the drill-down worker reads a named component and confirms the claim is satisfied by its content, when the drill-down call completes, then no finding is added for that claim | UC-03 | Must |
| AC-10 | Given the drill-down worker reads a named component and the claim is NOT satisfied by its content, when the drill-down call completes, then a `"Tech-Spec: ..."` finding is added, merged into the overall result, forcing `needsTechSpecFix` | UC-03 | Must |
| AC-11 | Given `needsComponentDetail` names more unique components than the batch size `K`, when the host dispatches drill-down calls, then `ceil(N/K)` batched calls are issued, each bounded to at most `K` components — never one call covering all of them | UC-03 | Must |
| AC-12 | Given two `needsComponentDetail` entries name the same `fileSlug`, when the host processes the main validator's result, then the component is deduplicated to a single read/batch slot, both claims checked against it | UC-03 | Must |
| AC-13 | Given a validation cycle completes (clean or not), regardless of whether drill-down ran, when `docsDigest` is computed, then it still hashes the full, unreduced `assembledRequirements`/`assembledTechSpec` content | UC-01 | Must |
| AC-14 | Given all changes are delivered, when `npm test` runs, then all tests pass: new regression tests for AC-01 through AC-13, and a full-suite regression | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020/FTR-024/FTR-025/FTR-026/FTR-027 (available): the split-generation architecture, skeleton/
  detail separation, and existing per-item validity mechanisms — all reused, none replaced.
- `tech-spec-assembler.js`'s `loadTechSpec()`/`assembleTechSpec()` stay the authoritative full-
  document assembler for every OTHER consumer (digest, `assemble-docs` skill); only the validator
  passes stop using their output for prompt construction.
- `lib/agent-registry.js`'s existing per-entry shape (`agentId`, `nativeNames`, `relativeInstallPath`,
  `role`, `type`, `authorisedPhases`, `allowedPipelines`, `minimumToolkitVersion`, `deprecated`,
  `deprecationTarget`, `platforms`) is reused unmodified for the new agent's own entry; every
  existing entry uses `minimumToolkitVersion: '0.13.0'` regardless of when it was actually added
  (the registry's own introduction version, not a per-feature bump) — the new entry follows the
  same precedent.
- `lib/asset-catalog.js` needs NO new entry: agents are installed by directory glob
  (`src/claude/agents` → `.claude/agents`), not by individual file listing — only
  `lib/agent-registry.js` needs the new agent's own entry (this resolves feature.md's Open
  Question #6).
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced production incident
  (`Fincantieri.CommonLibraries.MFExample`, FTR-003) — not a hypothetical scalability concern.

## 9. Open Questions

Open Questions 1–6 raised in `feature.md` are resolved by the Tech Spec — see
`FTR-028-Tech-Spec.md`'s Components for the exact decisions.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec resolves all 6 Open Questions this document's
feature.md left pending.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference multiple
UCs each where relevant, and Data Requirements/NFRs/Dependencies are feature-wide by nature.
