<!--
COMPONENT TEMPLATE — spec/components/{fileSlug}.md

Canonical structure for one component's technical design in the split Tech-Spec format (FTR-024).
A "component" is one file this feature creates or modifies — the granularity is the same as one
row in spec/index.md's own Section 9 "File Inventory" / Components table, not an arbitrary
subdivision.

This is the REAL, currently-implemented contract — authoritative source:
`src/claude/agents/gaia-generate-tech-spec-component.md`'s own "Output" section, and
`src/claude/scripts/tech-spec-assembler.js`'s `parseComponentDetail`, which requires exactly
`## Change` and `## Tests` to exist, in that relative order, to parse a component file correctly.
An earlier FTR-020 draft of this template (component-template.md) additionally specified
`Related Open Questions`/`Related components`/`Addresses` header lines and a `Decision:` section —
none of those exist in the real, shipped format; this file reflects what is actually generated and
parsed today, not that earlier draft.

Fill in every placeholder (angle brackets) and delete every HTML comment block (including this
one) before treating the file as finished.
-->

# {Path} — {New | Modified}

## Change

<!--
One paragraph: what changes about this file and why — name the specific functions/sections
affected, not just "this file is updated to support the new feature". If New: what it exports and
the shape of its inputs/outputs. If Modified: what specifically is added, replaced, or removed,
and what is explicitly left unchanged.
-->

<prose>

## {Algorithm | Data Model | Service Interface | Component Props | whichever name fits this
component's own real nature — pick one, do not invent multiple competing headings}

<!--
Real pseudocode or real code, not a prose description of "what it does". If this component
relocates logic from an existing file, name the exact source file and line ranges if known.

If this component genuinely needs no design content beyond Change (e.g. a trivial configuration
file), omit this entire middle heading rather than inventing content — Change and Tests are always
required, this one is not.
-->

<pseudocode/code + prose explaining non-obvious choices>

## Tests

<!--
The specific test file(s) this component's change requires, and the key cases that matter — not a
generic "add tests for X".
-->

<prose / bullet list of test file(s) and key cases>

<!--
PARSING CONTRACT — read by tech-spec-assembler.js's parseComponentDetail: `## Change` and
`## Tests` must both exist, in that relative order; everything between them (including the middle
heading above, whatever it's actually called) is this component's own design body, concatenated
verbatim into the assembled Tech-Spec's Section 3 (Backend) / 4 (Frontend) / 5 (External
Integrations), routed by this component's own Domain from spec/index.md's Components table.
-->
