<!--
COMPONENT TEMPLATE — spec/components/{component-name}.md

Canonical structure for one component's technical design in the split Tech-Spec format. A
"component" is one file this feature creates or modifies — the granularity is the same as one
row in spec/index.md's "Components" table, not an arbitrary subdivision. Fill in every
placeholder (angle brackets) and delete every HTML comment block (including this one) before
treating the file as finished.

Section order below is a menu, not a mandatory checklist — include only the sections this
component actually needs (a component with no new algorithm has no "Algorithm" section; a
component that doesn't produce/consume a data format has no "Schema"/"Format" section), but keep
whatever sections you do include in this relative order.
-->

# `<real file path, e.g. src/claude/scripts/wb-graph-checks.js>` — <New | Modified>

**Related Open Questions:** <comma-separated OQ-IDs resolved (fully or partly) by this
component's design, each linking back to its entry in [index.md](../index.md), or omit this line
if none>

**Related components:** <comma-separated links to other components/*.md files this one calls,
is called by, or shares a format with — e.g. a module whose function this one requires, or a
schema this one consumes that another produces. Omit this line if this component has no
dependency on any other.>

**Addresses:** <comma-separated AC-IDs from `req/index.md`'s Acceptance Criteria table that this
component's own design satisfies, or "All ACs" if the component is a universal, feature-wide
guarantee (e.g. "no existing module is modified") that doesn't map to one specific AC. NEVER
leave this empty/omitted unless this component genuinely contributes to no AC — that's a sign
either the component is out of scope for this feature, or an AC is missing from req/index.md.
This field is read by the backward half of the feature.md<->req<->spec traceability check (see
[index.md](../index.md)'s own Traceability section): every AC cited here must actually exist in
`req/index.md` — never invent one.>

## Change

<!--
One paragraph: what changes about this file and why, in terms someone could act on without
reading the whole feature's Tech-Spec first — name the specific functions/sections affected, not
just "this file is updated to support the new feature". If this is a **New** file: what it
exports and the shape of its inputs/outputs. If **Modified**: what specifically is added,
replaced, or removed, and what is explicitly left unchanged (call out what does NOT change —
that's often as important as what does, e.g. "renderMarkdown/renderCsv themselves are
unchanged").
-->

<prose>

## Decision: <OQ-ID, if this component is the sole owner of an Open Question's resolution>

<!-- Only include this section if an OQ listed above is OWNED by this component (affects only
     it) — per the index template's splitting rule. If an OQ affects several components, its
     decision lives in index.md instead; just reference it from "Related Open Questions" above. -->

<the actual decision text, moved here verbatim from index.md if this is a later single-component
narrowing of an OQ that originally looked cross-cutting>

## <Algorithm / Control flow / whatever matches this component's own nature>

<!--
Real pseudocode or real code, not a prose description of "what it does". If this component
relocates logic from an existing file, name the exact source file and line ranges (if known) —
same expectation as a Work Breakdown task's Implementation notes. If this component is purely
wiring (e.g. "replace this top-of-file block with that one"), show the literal before/after.
-->

<pseudocode/code + prose explaining non-obvious choices>

## <Schema / Format name>

<!--
Only if this component produces or consumes a data shape another component (or a human) needs to
know exactly — a JSON Schema, a Markdown block format, a CSV column contract. Cross-reference
the canonical template file if one exists (e.g. templates/task-template.md) instead of
restating it; this section is for formats SPECIFIC to this component that don't already have
their own template.
-->

<schema/format definition>

## Tests

<!-- Name the real test file(s) this component's change requires, and the specific cases that
     matter — not a generic "add tests for X". If this component shares a fixture with another
     component's tests, link to index.md's "Shared test fixtures" section instead of describing
     the fixture again here. -->

<prose / bullet list of test file(s) and key cases>
