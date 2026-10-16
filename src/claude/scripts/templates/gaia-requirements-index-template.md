<!--
REQUIREMENTS INDEX TEMPLATE — req/index.md

Canonical structure for the Requirements index in the split format (FTR-021). Holds everything
that is NOT naturally owned by a single Use Case — i.e. everything except each Use Case's own flow
body, which gets its own file under use-cases/{UC-ID}.md (see gaia-use-case-template.md).

This is the REAL, currently-implemented 9-section contract — authoritative source:
`src/claude/agents/gaia-generate-requirements.md`'s own "Output Structure" section, and
`src/claude/scripts/req-skeleton-check.js`/`req-assembler.js`, which require exactly these 9
numbered top-level `## N. ` headings, in order, to exist. An earlier FTR-020 exploratory draft of
this template used a different 7-section numbering (no "UI Requirements" or "Open Questions" as
their own sections) that was never what Requirements generation actually shipped — this file
reflects the real, current format, not that earlier draft.

SPLITTING PRINCIPLE (apply this test to any new section before deciding where it goes): does this
content belong to exactly one UC, or does it reference/apply to several? A Business Rule that
applies to 3 UCs, a Data Requirement describing a schema used by the whole feature, an NFR that
constrains the feature as a whole — none of these are owned by one UC any more than a shared setup
module is owned by one Work Breakdown task. Only split out content that is genuinely per-item;
everything cross-cutting stays here, in one place.

EVERY table in this document (and in every use-case file) MUST be followed immediately by a
one-line legend (blockquote) explaining each column.

Fill in every placeholder (angle brackets) and delete every HTML comment block (including this
one) before treating the file as finished.
-->

# {PREFIX} — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

<prose: brief description of what this requirements document covers>

### 1.2 Scope

<prose: what is in scope and out of scope>

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| <actor> | <description> |

## 2. Use Cases

<!-- One row per UC. This table is the single place that lists every UC that exists — the
     use-cases/ directory listing must match it exactly. Title here is a short label, NOT the
     full flow description — that's in the UC's own file (FTR-021: a separate call per UC fills
     in each row's full detail after this skeleton is accepted). -->

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-{NN} | <short title> | <actor(s)> | <Must \| Should \| Could> | [use-cases/UC-{NN}.md](use-cases/UC-{NN}.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-{NN} | <rule statement> | <UC-ID, UC-ID, ... \| All UCs> |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

### 4.1 Entities

<!-- For each entity: fields, types, constraints, relationships. -->

<prose>

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| <field> | <rule> |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-{NN} | <Security \| Performance \| Usability \| ...> | <requirement statement> |

## 6. UI Requirements

<!-- N/A — internal/technical feature; no UI surface is introduced or changed, if that's true for
     this feature — otherwise fill in both subsections below. -->

### 6.1 Pages / Screens

<!-- For each page: purpose, layout description, components, interactions. -->

<prose>

### 6.2 Navigation Flow

<prose: how pages connect and how the user moves between them>

## 7. Acceptance Criteria

<!--
Column contract: first three columns MUST be exactly "ID", "Criterion", "Related UC" in that
order — parsed as-is by wb-graph-checks.js's parseAcTable (do not reinvent the column format).
"Related UC" must be a single UC-ID, a comma-separated list, or the literal "All UCs".
-->

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-{NN} | <Given/When/Then or plain testable statement> | <UC-ID \| UC-ID, UC-ID \| All UCs> | <Must \| Should \| Could> |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable Given/When/Then
> statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs"; machine-parsed by
> `wb-graph-checks.js`'s `parseAcTable`, not just descriptive. **Priority** — MoSCoW; every Must AC
> must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

<!-- External prerequisites, prior features this one builds on, fixed constraints, and anything
     that must be resolved before Gate 1. -->

<prose / bullet list>

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| <N> | <question> | <impact if unresolved> | <suggested resolution, or "open — deferred"> |

<!--
PARSING CONTRACT — req-skeleton-check.js/req-assembler.js require exactly these 9 numbered
`## N. ` headings, in order, to exist (assertCompleteSections's truncation guard in pm-phase1.js
checks the same 9 headings). Section 2's table is the index into use-cases/{UC-ID}.md — never
write a UC's flow body inline here.
-->
