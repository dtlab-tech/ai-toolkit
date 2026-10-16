# Requirements/Tech-Spec Split Generation + Cross-Document Traceability Matrix

## Context

FTR-020 (`internal_docs/features/FTR-020-work-breakdown-split-generation/`) fixes the single-shot,
single-file generation of the Work Breakdown. The same root problem — one `worker()` call writing
one large file in one model turn, vulnerable to truncation — also applies to
`{PREFIX}-Requirements.md` and `{PREFIX}-Tech-Spec.md`. There is already direct evidence of this:
`pm-phase1.js` needed an explicit truncation detector for these two documents (commit `0783fe1`),
the same symptom that motivated FTR-020, just mitigated with detection instead of a structural
fix.

## Idea, part 1: split generation for Requirements and Tech-Spec

Apply the same architecture FTR-020 established (bounded "skeleton" pass fixing structure +
IDs up front, smaller per-item passes filling in detail, directory-based storage, an assembler
loader so downstream readers are unaffected) — but **not a direct copy-paste**. Two real
differences from the Work Breakdown case:

- **Work Breakdown tasks are atomic by contract** (Atomicity Contract: one outcome, one domain,
  one agent type) — they decompose cleanly into independent per-item files. Use Cases in
  Requirements, and sections in Tech-Spec, are not: Business Rules, NFRs, Data Requirements, and
  especially the Acceptance Criteria table are genuinely **cross-cutting** — they reference
  multiple UCs at once and aren't naturally "owned" by a single UC the way a task owns its one
  outcome.
- **The AC table is a hard technical dependency today.** `wb-validate.js`'s `parseAcTable` reads
  one contiguous `## 7. Acceptance Criteria` section from one file at a fixed path. Splitting
  Requirements per-UC means either keeping the AC table as one un-split cross-cutting file (like
  FTR-020 kept phase `title`/`commit` lightweight rather than forcing everything into the same
  split shape), or designing a new index-like source for it — the same kind of decision FTR-020
  made for `index.json` vs. per-task files.

So this needs its own "outline pass" design (what's structural/shared vs. what's genuinely
per-UC/per-section), not an assumption that FTR-020's exact field split transfers unchanged.

## Idea, part 2: cross-document traceability matrix

Map, across documents: Requirement (UC/AC) → Tech-Spec section(s) that address it → User Story
(Work Breakdown phase) → Task(s) that implement it. Goal: make "is every requirement actually
implemented, end to end" checkable at a glance, and — since it operates over small, already-split
files rather than re-reading whole documents — cheaper and faster to validate than today.

**Important finding before scoping this as a feature:** part of this traceability **already
exists** in the current schema and costs nothing new to surface:
- Every AC row in the Requirements AC table already declares its own `Related UC` column.
- Every Work Breakdown task already declares a scoped `acceptanceCriteria` list, and
  `wb-validate.js` checks 19–21 already verify AC existence, correct phase scope, and Must-AC
  coverage — structurally enforced today, just not *rendered* as a human-readable matrix.
- An AC↔Task (and therefore, transitively, UC↔US↔Task) matrix could be a **new deterministic
  rendering script**, in the same family as `wb-render.js` — no LLM generation needed, no new data
  to produce, just a new view over data that already exists and is already validated.

**What's genuinely missing:** Tech-Spec has no explicit, ID-based declaration of which UC/AC each
of its sections or decisions addresses — unlike tasks, which already cite `acceptanceCriteria`.
Tying Tech-Spec into the matrix needs that tagging convention introduced first (a real, separate
piece of work), and deciding whether "does this Tech-Spec section really address this AC" needs
semantic (LLM) judgment or can stay a structural ID-reference check like the rest of this family.

## Phasing — DECIDED: multiple incremental FTRs, not one bundled feature

Confirmed 2026-10-15: each phase below ships as its **own FTR**, in this order, following the
same smallest-atomic-increment discipline the FTR-018/020 lineage already applies to tasks —
applied here to the proposal's own scoping, not just to its internal task breakdown.

1. **Phase A — AC↔Task matrix only.** Near-zero-cost: no split-generation work needed, all
   source data already exists and is already validated; "just" a new deterministic render,
   analogous to `wb-render.js`.
2. **Phase B — Tech-Spec section tagging + Tech-Spec↔AC matrix.** Requires introducing the new
   ID-reference convention in Tech-Spec generation first.
3. **Phase C — Requirements split generation.** Analogous to FTR-020, with its own outline-pass
   design for the cross-cutting sections (Business Rules, NFRs, Data Requirements, AC table).
4. **Phase D — Tech-Spec split generation.** Likely the hardest to decompose cleanly (most
   cross-cutting content of the three documents); may split by component/domain rather than by UC.

## Worked example already produced (exploratory, not yet code)

Before committing to the above as real FTRs, a full manual worked example was built directly
inside FTR-020's own folder (`req/`, `spec/`, `coverage-matrix/`, plus four new template pairs
in `templates/`) to decide the real shape of Phases B/C/D and the matrix before writing any
validator code. Concrete outputs and findings from that exercise:

- **Req split** (`req/index.md` + `req/use-cases/*.md`): confirmed the "what's cross-cutting
  stays central" principle transfers; Business Rules/NFRs/Data Requirements/the AC table all
  stayed in the index, only Use Cases split per-item.
- **Tech-Spec split** (`spec/index.md` + `spec/components/*.md`): the natural split axis is
  **components** (one file per created/modified source file), not Use Cases — the old
  "New and Modified Files" table was already a 1:1 component index. Found empirically that a
  "Test Plan" section assumed to be cross-cutting actually splits per-component with no residue.
- **Coverage matrix** (`coverage-matrix/`): built as an AC-centric pivot over data already
  declared elsewhere (`req/`'s `Related UC`, `spec/` components' `Addresses:`, `wbs/index.json`
  phases' new `sourceUC` field). It caught a real assignment error on first use (a WB phase's
  `sourceUC` falsely included a UC it doesn't actually realize) and surfaced that `spec/`'s
  component-based coverage path is more precise than the UC-based path whenever a Use Case
  bundles more than one independent mechanic (e.g. "validate **and** render" in one UC) — full
  reasoning in that file's "Findings" section.
- **New structural field**: `wbs/index.json` phase entries gained `sourceUC` (array, possibly
  empty) — a phase's originating Use Case(s) are now explicit, not inferred from `US-NN`↔`UC-NN`
  numbering, which the matrix exercise showed is not reliably 1:1 (one phase can span several
  UCs; one UC can be realized across several phases).

## Governance decisions (2026-10-15)

- **Validation placement:** the bidirectional feature.md↔req↔spec↔WB check does **not** become a
  new gate. It folds into the existing **Gate 1** (feature.md↔req↔spec coverage) and **Gate 2**
  (req/spec↔WB coverage), each gate running a **coverage check** (deterministic, structural —
  what the matrix demonstrates) followed by a **semantic check** (LLM judgment, same family as
  the existing `gaia-validate-work-breakdown-semantic`) — mirroring the WB's own two-stage
  validation (`wb-validate.js` → semantic validator) one level up.
- **Alignment needed with `work-breakdown-phase-scope-discipline.md`:** both ideas are plausibly
  the same root cause (an LLM given too much to decide at once, losing track of siblings)
  recurring at different granularities — WB task overlap there, UC/AC/component misassignment
  here (the `sourceUC` error the matrix caught is a small instance of exactly this). Not merged
  into one idea, but should be designed with awareness of each other — whichever FTR starts first
  should check the other's findings before finalizing its own design.

## Open questions

- **Partly resolved:** the matrix must be a **generated output, never hand-maintained** — same
  relationship `wb-render.js`'s `.md`/`.csv` already have to their source JSON. Confirmed by
  building `coverage-matrix/` by hand in FTR-020's worked example: it duplicates facts already
  authoritative in `req/`/`spec/`, which is only safe if it's recomputed every time, not edited.
  Still open: generated **once per gate run and frozen** (an approval snapshot, re-run only on
  re-approval) or **regenerated live** on every check during implementation? Leaning toward "once
  per gate run," mirroring how `wb-validate.js`'s report is a point-in-time Gate 2 artifact, not
  continuously recomputed — but not decided.
- Does Phase A alone deliver enough value to ship standalone, or is it only worth building once
  B/C/D exist too?
- For Tech-Spec↔AC (Phase B): ID-reference check (cheap, structural, same family as the rest) or
  semantic coverage judgment (more expensive, more like `gaia-validate-work-breakdown-semantic`)?
- Should "WB phase(s) implementing an AC" become a stored/derived field, or stay something a
  validator computes on demand from `wbs/index.json` + `spec/`'s `Addresses` fields? (see
  `coverage-matrix/`'s own open questions for the detailed version of this)
- Task-level (not just phase-level) AC citation for WB tasks hit a real scope-rule tension during
  the worked example (an AC scoped to one UC can't legally be cited, under today's
  `wb-validate.js` check 20, by a task whose phase's `sourceUC` includes that UC alongside
  others) — unresolved, deferred to whichever FTR implements Phase A.

## Links

- Precondition / sibling design: `internal_docs/features/FTR-020-work-breakdown-split-generation/`
  (split generation architecture, skeleton/detail field-split reasoning, directory-assembler
  pattern this idea would reuse, and now also the `req/`/`spec/`/`coverage-matrix/` worked
  example and the four new template pairs under `templates/`).
- Related, should stay aligned: `internal_docs/ideas/work-breakdown-phase-scope-discipline.md`.
