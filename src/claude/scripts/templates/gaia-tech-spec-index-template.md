<!--
TECH-SPEC INDEX TEMPLATE — spec/index.md

Canonical structure for the Tech-Spec index (skeleton) in the split format (FTR-024). Holds every
section genuinely feature-wide, PLUS the Section 9 Components index table — one row per file the
feature creates or modifies. Each component's own Backend/Frontend/External-Integration/Testing
detail is produced separately, one call per component (see gaia-component-template.md); this
skeleton never contains that per-component content inline.

This is the REAL, currently-implemented 12-section contract — authoritative source:
`src/claude/agents/gaia-generate-tech-spec.md`'s own "Output Structure" section, and
`src/claude/scripts/tech-spec-assembler.js`/`tech-spec-graph-checks.js`. An earlier FTR-020
exploratory draft of this template used a completely different 6-section numbering (Baseline /
Resolution of Open Questions / Components index / Traceability / feature-wide guarantees / Shared
test fixtures) that predates the Tech-Spec split entirely and was never what generation actually
shipped — this file reflects the real, current 12-section format, not that earlier draft.

Fill in every placeholder (angle brackets) and delete every HTML comment block (including this
one) before treating the file as finished.
-->

# Technical Specification — {Feature Title}

## Document Info
| Field | Value |
|-------|-------|
| Feature | {PREFIX and title} |
| Version | 1.0 |
| Date | {today} |
| Status | Draft |

## 1. Overview

<prose: brief technical summary — what is being built, which systems are affected>

## 2. Architecture

### 2.1 System Context

<prose: where this feature sits in the overall architecture>

### 2.2 Component Diagram

<!-- Text-based diagram showing components and their interactions. -->

```
[Component A] --(protocol)--> [Component B]
```

### 2.3 Sequence Diagrams

<!-- For key flows, show the sequence of calls between components (text-based or Mermaid). -->

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

<!-- Authentication & authorization requirements, input validation boundaries, sensitive data
     handling, CORS implications (if applicable). -->

<prose / bullet list>

## 7. Database Changes

<!-- New tables/columns, indexes recommended, seed data, migration strategy. -->

<prose / bullet list>

## 8. Configuration

<!-- New environment variables, app settings changes, feature flags (if applicable). -->

<prose / bullet list>

## 9. File Inventory

Complete list of files to create or modify:

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| {real file path} | {purpose} | {AC-IDs, comma-separated, or —} | {BE \| FE \| DB \| DevOps \| INFRA \| TEST} | [components/{fileSlug}](components/{fileSlug}) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| {real file path} | {change description} | {AC-IDs, comma-separated, or —} | {BE \| FE \| DB \| DevOps \| INFRA \| TEST} | [components/{fileSlug}](components/{fileSlug}) |

<!--
Column order matters: `Addresses` MUST stay the 3rd column (immediately after
`Purpose`/`Change description`) — this is the exact position `tech-spec-graph-checks.js`'s
existing, positional parser reads from, and it reads positionally, not by header name. `Domain`
and `Spec` are new TRAILING columns, safely ignored by that parser. Do not reorder them. `Domain`
is the same enum Work Breakdown tasks already use. `Spec` is a provisional link to this file's own
design file — `components/{the file's own basename, with its extension kept}.md` — the host may
rewrite this link if two files share a basename, so treat it as provisional, not final.
-->

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

<!-- Numbered, dependency-aware sequence of components/tasks. -->

1. {component/task} — depends on: nothing
2. {component/task} — depends on: 1

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| {risk} | {impact} | {mitigation} |

<!--
PARSING CONTRACT — tech-spec-assembler.js's tech-spec-graph-checks.js's parsers require exactly
these 12 numbered `## N. ` headings, in order, to exist (assertCompleteSections's truncation guard
in pm-phase1.js checks the same 12 headings), plus Section 9's two subtables in the exact column
order above. Sections 3/4/5/10 must keep their heading even though their real content is deferred
to per-component generation — the assembler's spliceSectionBody requires the heading to already
exist to splice into.
-->
