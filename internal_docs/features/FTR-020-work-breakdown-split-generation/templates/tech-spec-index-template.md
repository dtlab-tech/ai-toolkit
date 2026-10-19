<!--
TECH-SPEC INDEX TEMPLATE — spec/index.md

Canonical structure for the Tech-Spec index in the split format. Holds everything that is NOT
owned by exactly one component — i.e. everything except each component's own design, which gets
its own file under components/{component-name}.md (see component-template.md). Fill in every
placeholder (angle brackets) and delete every HTML comment block (including this one) before
treating the file as finished.

SPLITTING PRINCIPLE — same test as the Requirements index, applied to components instead of Use
Cases: does this content belong to exactly one component (file being created/modified), or does
it reference/apply to several? A schema produced by one module and consumed by another is still
"owned" by its producer — put it in the producer's component file and cross-reference it from
the consumer's. Only content that is genuinely feature-wide (baseline context, a decision that
touches several components, a feature-wide guarantee) stays here.

IMPORTANT, found empirically while splitting FTR-020's own Tech-Spec: a "Test Plan" section that
looks cross-cutting at first glance often isn't — if every bullet in it already names exactly
one component's own test file, it splits per-component with no residue, the same way the old
"New and Modified Files" table turned out to already be a 1:1 component index. Check this before
assuming a Test Plan-shaped section must stay central.

EVERY table in this document (and in every component file) MUST be followed immediately by a
one-line legend (blockquote) explaining each column — someone with no context on this feature
must be able to read any table cold, without having to infer what a column means from its name
alone.
-->

# {PREFIX} — Technical Specification (Index)

## 1. Baseline

<!-- Feature-wide context: what exists today, what this feature builds on, what hard constraints
     (contracts, modules, conventions) are explicitly NOT touched by this feature and why. This
     is read before any component file, so it must stand alone — don't assume the reader has
     already read any component. -->

<prose>

## 2. Resolution of Open Questions

<!--
One subsection per Open Question (carried over from feature.md/Requirements — do not invent new
OQs here that weren't already raised). For each:
- If it affects exactly ONE component: write only a one-line pointer here ("OQ-NN affects only
  {component} and moved to components/{component}.md — see it there, not here") and put the full
  decision in that component's own file.
- If it affects MORE than one component: keep the full decision here, with an explicit "Affects:"
  line listing every component file it touches (same mechanism as a Requirements Business Rule's
  "Applies to" column).
-->

### OQ-{NN}: <short label>

**Affects:** <comma-separated component file names, or a single one with a pointer instead of a
full decision — see guidance above>

**Decision:** <the actual resolution — concrete and specific, not a restatement of the question>

## 3. Components (index)

<!-- One row per file created or modified by this feature. This table must match the
     components/ directory listing exactly — every file here has a component spec, every
     component spec is listed here. "Addresses" is a duplicated-for-convenience projection of
     each component's own `Addresses:` field (see component-template.md) — the component file is
     authoritative, this column is just an at-a-glance summary; keep them in sync. -->

| File | Change | Addresses | Spec |
|---|---|---|---|
| `<real file path>` | <New \| Modified> | <AC-IDs from this component's own `Addresses:` field> | [components/{name}.md](components/{name}.md) |

> **Legend:** **File** — real path of the file this feature creates or modifies. **Change** —
> New or Modified. **Addresses** — which Acceptance Criteria (from `req/index.md`) this
> component's design satisfies; read by the backward half of the traceability check below.
> **Spec** — this component's own design file.

**AC coverage check (forward, manual until a deterministic validator exists):** list every Must
AC from `req/index.md` and mark it ✓/✗ against this table — every Must AC must be addressed by
at least one component before this document is considered complete.

## 4. Traceability

<!--
Standard boilerplate — fill in the actual req/index.md traceability-section anchor, otherwise
keep as-is. This is the spec-side half of the same paragraph req/index.md's template carries —
keep both in sync if the wording changes.
-->

This document is the last link in the three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (Requirements) → `spec/` (this document). The **backward** direction of the bidirectional
check resolves here: every AC a component's `Addresses:` field cites (§3's table, or each
component file directly) must exist in `req/index.md`'s Acceptance Criteria table — a component
may never claim to address an AC that was never approved. The **forward** direction (every Must
AC in `req/` is addressed by ≥1 component — §3's coverage check above) is the other half; see
`req/index.md`'s own Traceability section for the forward-direction description. Only after both
resolve with no errors does content-level (semantic) review of each component's actual design
proceed.

## 5. <Feature-wide guarantees — name this section for what it actually is, e.g. "Legacy
Compatibility", "Backward Compatibility", "Migration Policy">

<!-- A guarantee that spans the whole feature, not owned by one component — e.g. "existing data
     in format X continues to work unmodified", "no breaking change to contract Y". -->

<prose>

## 6. Shared test fixtures

<!-- Only needed if two or more components' test sections reference the SAME fixture (a real
     example, a hand-built directory, a golden file) — describe it once here instead of
     duplicating the description in each component's Tests section. If no fixture is shared,
     delete this section entirely rather than leaving it empty. -->

<prose>

---

## What moved out of this file, and why

<!--
Keep this section in every real index.md — record the splitting decision for THIS Tech-Spec's
specific content, the same way the Requirements index records it. State explicitly which
sections you initially assumed were cross-cutting but turned out, on inspection, to split
per-component with no residue (the Test Plan is the classic case) — and which genuinely stayed
central, and why.
-->

<prose>
