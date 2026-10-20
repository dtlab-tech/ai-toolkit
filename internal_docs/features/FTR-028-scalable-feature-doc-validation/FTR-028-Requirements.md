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

### UC-01: Validate Tech-Spec Coverage Using the Skeleton Only

| Field | Value |
|---|---|
| Actor | `pm-phase1` coordinator / `gaia-validate-feature-docs` |
| Priority | Must |
| Preconditions | `req/index.md` and `spec/index.md` both exist, fresh and structurally complete (`assertCompleteSections` already passed) |
| Trigger | `pm-phase1.js`'s validation step runs (fresh entry, resumed run, or a revision cycle) |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

Today, the validator's prompt is built from `assembledTechSpec` — `tech-spec-assembler.js`'s
`loadTechSpec()` output, with every component's full design body (Change/Algorithm/Schema/Tests
prose) spliced into Sections 3/4/5/10. For a Tech-Spec with few components this is small; for a
realistically-sized one (a real run hit 58 components, 552,863 total prompt tokens) it grows
without bound and the worker can lose track of its own input entirely, ending its turn in
plain-text prose that denies the input was ever provided — with no delimited JSON left to recover.
This use case replaces that one input with the Tech-Spec skeleton, which grows only with component
COUNT (one row each), never with per-component prose length.

1. **Prompt construction.** The one place the validator's prompt is built stops calling
   `assembleTechSpec()` for this purpose. It instead reads `spec/index.md` directly
   (`c.read(specIndexPath)`) — Section 9's own compact component index table (Purpose, Addresses
   [AC-IDs], Domain, Spec-link columns), plus every other feature-wide section (Overview,
   Architecture, Security, Database, Configuration, Implementation Order, Risks) already living in
   that file. Sections 3/4/5/10's per-component body text, which only `loadTechSpec()` ever
   spliced in, is simply never read for this call. Requirements' own input is unchanged
   (`assembleRequirements()`, full UC flow detail included) — no real incident has shown UC count ×
   flow length to pose the same risk.
2. **Agent contract reworded, not redesigned.** `gaia-validate-feature-docs.md`'s Phase 1 (what's
   inlined) and Phase 3's Tech-Spec coverage-check table are updated to describe what the skeleton
   actually contains, instead of implying access to full per-component technical prose. The
   free-prose "every Use Case ID → referenced in Implementation Order" check is removed from this
   agent's own responsibility (superseded by UC-02's deterministic check, which is exact-ID-based
   rather than prose-parsing).
3. **Everything else about this call is unchanged**: it is still a single worker dispatch per
   cycle, still returns the same `valid`/`findings`/`needsRequirementsFix`/`needsTechSpecFix`/
   `report` fields (plus UC-03's new `needsComponentDetail`), still persists its `report` field to
   `{PREFIX}-Validation-Report.md`, and still participates in the existing 3-cycle revision loop
   exactly as today.
4. **`docsDigest` is computed independently of this call's own input.** It is computed from
   `assembleRequirements()`/`assembleTechSpec()`'s full output exactly as today — Gate 1's approval
   must bind to the real, complete document bytes, not any validator pass's reduced view. This is a
   deliberate asymmetry: the SAME two assembled strings are still computed for the digest; only the
   one string passed into THIS worker call changes.

**Related Business Rules:** BR-01, BR-02, BR-08

**Related Acceptance Criteria:** AC-01, AC-05, AC-13

### UC-02: Enforce AC↔Component Traceability Deterministically

| Field | Value |
|---|---|
| Actor | `pm-phase1` coordinator |
| Priority | Must |
| Preconditions | `req/index.md`'s AC table (Section 7) and `spec/index.md`'s File Inventory (Section 9) both exist and are structurally complete |
| Trigger | `pm-phase1.js`'s validation step runs, after the main validator's worker call returns (every cycle) |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

Today, AC↔component traceability is implicitly the LLM's own responsibility — folded into the same
single pass that is being reduced to a skeleton view (UC-01). This check is, however, 100%
mechanical: every AC-ID and every component's own "Addresses" column are already parsed,
exact-ID strings — no prose judgment is needed to join them. Moving it to a deterministic,
host-only check means it can never be defeated by scale (it costs zero LLM tokens regardless of
component count) and can never be silently skipped by a confused or overloaded model response.

1. **Compute the join.** After the main validator's worker call returns (every cycle, not only on
   a clean run), the host parses `req/index.md`'s AC table (ID column) and `spec/index.md`'s File
   Inventory rows (Addresses column, comma-separated AC-IDs or `—`) using parsers already present in
   `pm-phase1.js` (`parseAcTableRelatedUc`-style table parsing, already duplicated here per this
   file's own "no `require()`" precedent).
2. **Two directions, both checked:**
   - Every AC-ID in Requirements' AC table must be referenced by at least one component's Addresses
     column. An AC referenced by zero components produces one finding:
     `"Tech-Spec: AC-{id} is not addressed by any Tech-Spec component"`.
   - Every AC-ID referenced by a component's Addresses column must actually exist in Requirements'
     own AC table. A reference to a nonexistent AC-ID (a typo, a hallucination) produces one
     finding: `"Tech-Spec: component {path} references nonexistent AC-{id}"`.
3. **Findings format matches the LLM's own convention exactly** — a plain string prefixed
   `"Requirements: "` or `"Tech-Spec: "` — so they merge into the identical `findings` array/report
   structure with no format change for any downstream consumer.
4. **Merge before the contradiction guard.** These findings are added to the main validator's own
   `findings` array; `valid` is recomputed as `false` if this check produced anything;
   `needsTechSpecFix` is recomputed as `true` if any new finding is `"Tech-Spec: ..."`-prefixed
   (always true for both finding types above, since both are closed by a Tech-Spec revision) —
   this happens BEFORE the pre-existing `valid === (findings.length > 0)` contradiction guard runs,
   so a model that returned `valid: true` while this independent check finds a real gap is treated
   the same as any other now-invalid result, not as a contradiction to reject outright (the model
   was never shown this gap — it isn't contradicting itself, it's missing information by design).
5. **Clean case.** If this check finds nothing, it contributes nothing to `findings` and does not
   change `valid`/`needsTechSpecFix` from what the main validator (and UC-03's drill-down, if any)
   already determined.

**Related Business Rules:** BR-03, BR-04, BR-08

**Related Acceptance Criteria:** AC-02, AC-03, AC-04, AC-05

### UC-03: Drill Down on Components for Deep-Technical Claims

| Field | Value |
|---|---|
| Actor | `pm-phase1` coordinator / `gaia-validate-tech-spec-component-detail` (new agent) |
| Priority | Must |
| Preconditions | The main validator's worker call (UC-01) has returned; `spec/index.md`'s component table is available for `fileSlug` existence checks |
| Trigger | The main validator's result includes one or more `needsComponentDetail` entries |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

UC-01 removes per-component design-body prose (exact endpoint shapes, schema fields, error codes)
from the main validator's own view — information genuinely needed for some coverage claims. This
use case recovers that coverage without reintroducing unbounded scale: the main validator names
WHICH claim needs deeper verification and WHICH skeleton row (component) plausibly covers it
(using only the Purpose/Domain/Spec-link columns it already sees); the host then reads — and has a
small, narrow agent read — ONLY those specific files, batched to stay bounded even if many
components are flagged at once.

1. **Main validator's schema gains `needsComponentDetail`.** When a claim genuinely cannot be
   confirmed from the skeleton's Purpose/Addresses/Domain columns alone, the agent does not guess
   and does not silently drop the check. It emits one entry `{ claim, fileSlug }` per such claim,
   naming the specific component (by its skeleton row's own Spec-link `fileSlug`) whose Purpose/
   Domain plausibly covers it. A claim with no plausibly-relevant component at all remains a normal
   missing-coverage finding (unchanged from today) — it is never a drill-down case.
2. **Host validates each `fileSlug` before dispatching anything.** For every `needsComponentDetail`
   entry, the host checks whether that `fileSlug` actually exists in `spec/index.md`'s own
   component table (already parsed for UC-02). An entry naming a nonexistent `fileSlug`
   (hallucinated or mistyped) is dropped and converted into its own finding:
   `"Tech-Spec: component-detail check referenced a non-existent file "{fileSlug}" for claim "{claim}""`
   — it never reaches the drill-down agent.
3. **Deduplicate and batch.** Remaining valid entries are grouped by `fileSlug` (two claims naming
   the same component collapse into one entry with both claims listed). The resulting unique
   `fileSlug` set is split into consecutive groups of at most `K` (default 8, tunable) components
   each. One drill-down worker call is dispatched per group — `ceil(unique fileSlugs / K)` calls
   total, regardless of how many individual claims were originally flagged.
4. **Each drill-down call is narrowly scoped.** The host's prompt for a batch lists, for each
   component in that batch: its claim(s) and its absolute file path under `spec/components/`. The
   agent Reads ONLY those named files (never `feature.md`, never Requirements, never the Tech-Spec
   skeleton, never any component outside its own batch) and returns, for each claim, whether the
   named file's own content satisfies it.
5. **Result shape.** The drill-down agent returns `{ findings: string[] }` — one `"Tech-Spec: ..."`
   string per claim it could NOT confirm from the named file's content; a confirmed claim produces
   no finding at all. This is the same finding-string convention as UC-02's deterministic check and
   the main validator's own `findings` array.
6. **Merge.** Every drill-down batch's findings are appended to the overall `findings` array for
   this cycle (alongside UC-02's own findings); `valid`/`needsTechSpecFix` are recomputed from this
   fully merged set before the existing contradiction guard runs — identical merge mechanics to
   UC-02, just a different finding source.
7. **Clean case.** If the main validator's result has no `needsComponentDetail` entries at all, no
   drill-down call is dispatched for that cycle — zero added cost for a feature where the skeleton
   already answers every claim (expected to be the common case for small/medium features).

**Related Business Rules:** BR-04, BR-05, BR-06, BR-07, BR-08

**Related Acceptance Criteria:** AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12

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
