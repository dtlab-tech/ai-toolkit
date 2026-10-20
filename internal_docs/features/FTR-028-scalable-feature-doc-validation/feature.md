# Scalable Feature-Doc Validation

## Feature ID
FTR-028

## Summary
`gaia-validate-feature-docs` validates a feature's Requirements and Tech-Spec against `feature.md`
in a single LLM call, today fed the FULLY ASSEMBLED Tech-Spec — every per-component design body
(Change/Algorithm/Schema/Tests prose, generated separately per FTR-024) spliced into one document
(`tech-spec-assembler.js`'s `loadTechSpec()`). For a Tech-Spec with few components this is small;
for a realistically-sized feature (dozens of components) the assembled document, and the single
prompt built from it (`pm-phase1.js:448-451`), grows without bound — unlike every other per-item
step in this pipeline (FTR-024/025/026/027), which was deliberately designed to stay small
regardless of feature size. This feature caps the main validator's prompt size to the Tech-Spec
**skeleton** (`spec/index.md`'s own compact, one-row-per-component index), independent of how much
per-component design prose a feature produces, and moves the one check that skeleton can answer
mechanically — AC↔component traceability — out of the LLM's hands entirely, onto a new deterministic,
host-only check that cannot be defeated by scale. For the remaining class of checks that genuinely
need a component's own design body (exact endpoint shape, schema fields, error codes — information
the skeleton deliberately excludes), this feature adds a second, narrowly-scoped drill-down pass:
the main validator names which specific claim needs deeper verification and which skeleton row
(component) plausibly covers it, and the host dispatches a small follow-up worker that reads ONLY
those named component files — never the whole Tech-Spec — batched to stay bounded even in the
pathological case where many components are flagged. No coverage capability is traded away for
scalability; only the SHAPE of how that coverage is checked changes.

## Problem Statement
A real production run (`Fincantieri.CommonLibraries.MFExample`, FTR-003, i18n across 3 apps, 58
Tech-Spec components) hit the validator with a single prompt totaling **552,863 tokens**
(`attempts[0].tokens`, evidence file `gaia.agent.planner.validate-feature-docs`). The worker ended
its turn in plain text instead of the required schema-conforming tool call, and — worse than the
already-documented "long multi-phase response ends in plain text" caveat
(`lib/workflow-control.js:224-236`, where the JSON payload is still present in the text and
recoverable via `extractDelimitedStructuredOutput`) — its text explicitly claimed *"the Requirements
and Tech-Spec documents required by the validation protocol were not provided... the prompt
contained labels Requirements: and Tech-Spec: but no document content followed either label."* This
claim is demonstrably false: `assembleRequirements()`/`assembleTechSpec()`
(`pm-phase1.js:396-401`) call the real deterministic assembler scripts and `assertCompleteSections`
(`pm-phase1.js:28-31`) already verified both documents' structural completeness before the
validator was ever invoked — if either had been empty or truncated, the pipeline would have failed
earlier, at a different, already-attributable error. The 552k-token count itself corroborates this:
empty content under those labels could not possibly have produced it. At this scale the model loses
track of (not merely mis-formats) its own input, and there is no delimited JSON left to recover —
the pipeline hard-fails with no actionable fix available to the project the feature belongs to.

This is a genuine scale ceiling in the validator's own design, not a corrupted-item bug like the
three prior incidents from this same run (headless template-Read permission denial, whole-response
fence wrapping, missing `.md` fileSlug suffix — all separately fixed). It blocks Gate 1 for any
feature whose Tech-Spec accumulates enough per-component design prose, regardless of project.

Inspecting what the validator's own Phase 3 checks actually require
(`gaia-validate-feature-docs.md:63-72`) shows most Tech-Spec coverage checks — "every new/modified
file listed in File Inventory", "every Use Case ID referenced" — are answerable from `spec/index.md`
section 9's own index table (`gaia-tech-spec-index-template.md`: Purpose, Addresses [AC-IDs], Domain,
Spec-link columns, one row per component, size bounded by component **count**, not by per-component
design prose **length**) plus `req/index.md`. The per-component bodies spliced into Sections 3/4/5/10
by `loadTechSpec()` are the only unbounded growth driver, and are not actually needed for a
coverage/traceability check — only for the per-component technical-completeness judgment that
`gaia-generate-tech-spec-component.md` is already independently responsible for enforcing when each
component is generated.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change to one validation step; the execution path is described below.

1. **Tech-Spec input swap.** The one place the validator's prompt is built
   (`pm-phase1.js:448-451`) stops passing `assembledTechSpec` (the fully spliced document) and
   instead passes the raw Tech-Spec skeleton (`c.read(specIndexPath)` — `spec/index.md`,
   unassembled, no per-component body text). Requirements stays unchanged (`assembledRequirements`,
   full UC detail included) — the real incident's evidence implicates Tech-Spec specifically, and
   Requirements' own growth dimension (UC count × flow length) is not shown by any real run to pose
   the same risk.
2. **`gaia-validate-feature-docs.md` reworded, not redesigned.** Phase 1's description of what's
   inlined, and Phase 3's Tech-Spec coverage-check table, are updated to describe what the skeleton
   actually contains (Purpose/Addresses/Domain/File-Inventory columns) instead of implying access to
   full per-component Algorithm/Schema/Tests prose. The free-prose "Every Use Case ID → referenced in
   Implementation Order" bullet is removed from the agent's own responsibility — superseded by step 3.
3. **New deterministic AC↔component traceability check**, host-only, zero LLM cost, computed purely
   from already-parsed `req/index.md` and `spec/index.md` tables (reusing this file's own existing
   `parseAcTableRelatedUc`-style parsers): every AC-ID in Requirements' AC table is referenced by at
   least one Tech-Spec component's File-Inventory "Addresses" column, and every AC-ID referenced by a
   component's "Addresses" column actually exists in Requirements' own AC table (catches a
   hallucinated/typo'd reference in either direction). Findings are formatted as the same
   `"Requirements: ..."`/`"Tech-Spec: ..."` strings the LLM's own `findings` array already uses, so
   they merge into the identical report/routing structure with no format change downstream.
4. **`gaia-validate-feature-docs`'s schema gains a `needsComponentDetail` array**: when a claim
   genuinely needs a component's own design body to verify (an exact endpoint contract, schema
   field, error code — not visible in the skeleton's Purpose/Addresses/Domain columns), the agent
   does not guess and does not silently drop the check. It records one entry
   `{ claim, fileSlug }`, naming the specific skeleton row (component) whose Purpose/Domain plausibly
   covers that claim, using the Spec-link column it already has visibility into. A claim with no
   plausibly-relevant component at all is NOT a drill-down case — it is still a normal missing-
   coverage finding today.
5. **New narrow drill-down agent (`gaia-validate-tech-spec-component-detail`)**, dispatched by the
   host after the main validator call, only when `needsComponentDetail` is non-empty. The host:
   deduplicates entries by `fileSlug`; validates each named `fileSlug` actually exists in
   `spec/index.md`'s own component table (a hallucinated/wrong reference is dropped and turned into
   its own `"Tech-Spec: ..."` finding, never passed through to the drill-down agent); batches the
   remaining unique components into groups of at most `K` (default 8, tunable) and dispatches one
   drill-down worker call per batch. Each call is handed the batch's claims and the ABSOLUTE paths
   of only those components' files — the agent Reads only the named files directly (the same
   established precedent as `gaia-validate-feature-docs` already Reading `feature.md` itself: both
   are in-project paths, never a toolkit-external template, so no host-side inlining is needed here).
   The agent returns which claims it confirmed and which it could not, as the same
   `"Tech-Spec: ..."` finding-string convention.
6. **All findings — the LLM main pass, the deterministic AC↔component check, and any drill-down
   batches — are merged into one result before the existing contradiction guard**
   (`pm-phase1.js:456-458`): the host recomputes `valid`/`needsRequirementsFix`/`needsTechSpecFix` by
   OR-ing in every source's findings before that guard runs, and appends the drill-down and
   deterministic findings to the `report` string the main pass produced, so a structural or deep-
   technical gap the main pass's own reduced input could never have shown it still forces the
   correct revision cycle instead of a false-clean Gate 1 pass.
7. **`docsDigest` (`pm-phase1.js:475`) is unaffected** — it keeps hashing the full, unreduced
   `assembledRequirements`/`assembledTechSpec`, since Gate 1's approval must still bind to the real,
   complete document bytes, not any validator pass's reduced input view.

## Out of Scope
- Any equivalent reduction for the Requirements side of the validator's prompt — no real incident
  has shown UC-count × flow-length to pose the same risk; revisit if one does.
- Any general token-budget/chunking framework for worker prompts — this fix is scoped to the one
  `gaia-validate-feature-docs` call site (plus its new drill-down companion), not a systemic
  mechanism applicable to other workers.
- Any change to `tech-spec-assembler.js`'s `loadTechSpec()`/`assembleTechSpec()` itself — unchanged,
  still used as-is for the digest and any other real consumer (e.g. `assemble-docs` skill output).
- Any change to the 3-cycle revision-loop limit, the per-item resume-validity mechanisms (FTR-027),
  or any other pipeline phase.
- A fully automatic claim→component matcher more sophisticated than "the main validator names a
  plausible fileSlug from data it already sees" — if the main pass's guess is wrong, the host's own
  `fileSlug` existence check catches and reports it; no separate matching/ranking mechanism is
  introduced.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A Tech-Spec with 58 components and large per-component bodies (the real incident) | Main validator prompt size is bounded by component count × one skeleton row, not by per-component prose length; no longer approaches a scale ceiling |
| A component's File-Inventory "Addresses" column references an AC-ID absent from Requirements' AC table | Deterministic finding produced; `needsTechSpecFix` forced true even if the LLM's own findings are empty |
| An AC-ID in Requirements' AC table is referenced by zero Tech-Spec components | Deterministic finding produced; the relevant fix flag forced true |
| The main validator returns `valid: true` with empty `findings`/`needsComponentDetail`, but a deterministic structural gap exists | Merged result is NOT treated as valid; the cycle continues with the correct fix flag set |
| No deterministic structural gaps exist, and the main validator independently returns `valid: true` with no `needsComponentDetail` entries | Merged result is valid — unchanged behavior from today |
| The main validator flags a claim needing component detail, naming a real, existing `fileSlug` | Host dispatches a drill-down call reading only that file; the claim resolves or produces a `"Tech-Spec: ..."` finding depending on the component's actual content |
| The main validator names a `fileSlug` that doesn't exist in `spec/index.md`'s table (hallucinated reference) | Host drops the entry, never dispatches a drill-down call for it, and records its own `"Tech-Spec: ..."` finding about the bad reference |
| `needsComponentDetail` names more unique components than the batch size `K` | Host issues `ceil(N/K)` drill-down calls, each bounded to at most `K` components' bodies — never one call covering all flagged components |
| Two `needsComponentDetail` entries name the same `fileSlug` for two different claims | Host deduplicates by `fileSlug`; the component's file is read once per batch, both claims checked against that single read |
| `docsDigest` computation after a validation cycle | Still hashes the full, unreduced assembled Requirements + Tech-Spec — Gate 1 approval binding is unaffected by either validator pass |
| 3 revision cycles pass with the same structural or drill-down gap recurring | Same existing "Validation gaps remain after 3 cycles" failure as today — unchanged |
| A feature with very few components (today's common case) | No observable behavior change in practice — skeleton and fully-assembled Tech-Spec are close in size, and few or no claims are likely to need drill-down |

## Data Model
N/A — internal/technical feature. No new on-disk artifact; this feature changes what text is fed
into one existing worker call and adds one new deterministic, in-memory check with no persisted
schema of its own (its findings are plain strings merged into the existing Validation-Report format).

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | `spec/index.md` plus N component files with large design bodies | `pm-phase1`'s validation step builds the main validator's prompt | The prompt contains the Tech-Spec skeleton content but none of the per-component Change/Algorithm/Schema/Tests prose | Must |
| AC-02 | A component's Addresses column references an AC-ID absent from `req/index.md`'s AC table | `pm-phase1`'s validation step runs | A deterministic `"Tech-Spec: ..."` finding is produced and `needsTechSpecFix` is forced true | Must |
| AC-03 | An AC-ID in `req/index.md`'s AC table is referenced by zero Tech-Spec components | `pm-phase1`'s validation step runs | A deterministic `"Tech-Spec: ..."` finding is produced and `needsTechSpecFix` is forced true | Must |
| AC-04 | The main validator returns `valid: true` with empty `findings`/`needsComponentDetail`, but AC-02 or AC-03's condition holds | `pm-phase1`'s validation step runs | The merged result is not treated as valid; the correct fix flag is forced true and the revision cycle continues | Must |
| AC-05 | No deterministic structural gaps exist and no `needsComponentDetail` entries are produced | The main validator independently returns `valid: true` | The merged result is valid, unchanged behavior from today | Must |
| AC-06 | A claim needs component-body detail to verify (not visible in Purpose/Addresses/Domain) | The main validator runs | It returns a `needsComponentDetail` entry `{ claim, fileSlug }` naming a real, existing skeleton row, instead of guessing or silently dropping the check | Must |
| AC-07 | A `needsComponentDetail` entry names a `fileSlug` that exists in `spec/index.md`'s table | The host processes the main validator's result | A drill-down worker call is dispatched, Reading only that component's file (and any others batched with it) | Must |
| AC-08 | A `needsComponentDetail` entry names a `fileSlug` absent from `spec/index.md`'s table (hallucinated) | The host processes the main validator's result | The entry is dropped before dispatch; a `"Tech-Spec: ..."` finding about the bad reference is produced instead | Must |
| AC-09 | The drill-down worker reads a named component and confirms the claim is satisfied by its content | The drill-down call completes | No finding is added for that claim | Must |
| AC-10 | The drill-down worker reads a named component and the claim is NOT satisfied by its content | The drill-down call completes | A `"Tech-Spec: ..."` finding is added, merged into the overall result, forcing `needsTechSpecFix` | Must |
| AC-11 | `needsComponentDetail` names more unique components than the batch size `K` | The host dispatches drill-down calls | `ceil(N/K)` batched calls are issued, each bounded to at most `K` components — never one call covering all of them | Must |
| AC-12 | Two `needsComponentDetail` entries name the same `fileSlug` | The host processes the main validator's result | The component is deduplicated to a single read/batch slot, both claims checked against it | Must |
| AC-13 | A validation cycle completes (clean or not), regardless of whether drill-down ran | `docsDigest` is computed | It still hashes the full, unreduced `assembledRequirements`/`assembledTechSpec` content | Must |
| AC-14 | All changes are delivered | `npm test` runs | All tests pass: new regression tests for AC-01 through AC-13, and a full-suite regression | Must |

## Scope

This feature ships as a single, complete unit — no deferred follow-up phase. Everything described in
Core Flow and Acceptance Criteria above (skeleton-only main pass, deterministic AC↔component check,
and the batched component-detail drill-down pass) is in scope for this delivery.

### Explicitly out of scope (see "Out of Scope" above for the full list)
- An equivalent bounded reduction for the Requirements side of the prompt (no evidence of need yet).
- A general token-budget/chunking framework applicable to other worker prompts beyond this call site.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact attribution prefix for an orphan-AC finding — always `"Tech-Spec: ..."` (since the fix is adding coverage), or `"Requirements: ..."` in some cases? | **Open — resolve in Tech-Spec** | Lean toward always `"Tech-Spec: ..."`, consistent with "the gap is closed by a Tech-Spec revision" |
| 2 | Should the deterministic check also flag a File-Inventory row whose Spec link target doesn't exist on disk, as defense-in-depth alongside FTR-027's own component-validity gate? | **Open — resolve in Tech-Spec** | Lean toward yes — cheap, reuses already-parsed data, catches a gap even if FTR-027's own gate were ever bypassed (e.g. `--force`) |
| 3 | Where does the new deterministic-check function live — inline in `pm-phase1.js` (matching `isValidComponentDetail`/`isValidUseCaseFile`'s own placement) or a separate host script? | **Open — resolve in Tech-Spec** | Lean toward inline in `pm-phase1.js`: the sandboxed workflow runtime has no `require()`, and the function only needs data already parsed by functions already living there |
| 4 | Default batch size `K` for the drill-down pass — is 8 the right default, or should it be derived from the component count (e.g. always ≤ 4 batches)? | **Open — resolve in Tech-Spec** | Lean toward a fixed default (8), tunable later with real evidence; avoid speculative tuning now |
| 5 | Should the new `gaia-validate-tech-spec-component-detail` agent also receive `feature.path` for extra context, or only the extracted claim text + component file paths? | **Open — resolve in Tech-Spec** | Lean toward claim text + paths only, mirroring `gaia-generate-tech-spec-component`'s own narrow-input precedent (no re-decomposition of feature.md by a narrow agent) |
| 6 | New agent registration: `gaia-validate-tech-spec-component-detail` needs an `agent-registry` entry and installer/asset-catalog entry — must not repeat the exact FTR-021/FTR-024 bug (a new agent shipped without its registry/catalog entry) | **Open — resolve in Tech-Spec, verify in Work Breakdown** | Treat as a mandatory task, not an afterthought — this exact class of bug has recurred before |

## Dependencies and Assumptions
- FTR-020/FTR-024/FTR-025/FTR-026/FTR-027 (available): the split-generation architecture, skeleton/
  detail separation, and existing per-item validity mechanisms — all reused, none replaced.
- `tech-spec-assembler.js`'s `loadTechSpec()`/`assembleTechSpec()` stay the authoritative full-
  document assembler for every OTHER consumer (digest, `assemble-docs` skill); only the validator
  passes stop using their output for prompt construction.
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced production incident
  (`Fincantieri.CommonLibraries.MFExample`, FTR-003) — not a hypothetical scalability concern.
- The new drill-down agent Reads project-owned paths only (`feature.md`'s own directory tree) —
  never a toolkit-external template path, so the headless-worker permission issue fixed separately
  (commit 35d08e9) does not apply here; no `print-asset`/host-inlining is needed for this agent.
