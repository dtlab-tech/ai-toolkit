<!--
REQUIREMENTS INDEX TEMPLATE — req/index.md

Canonical structure for the Requirements index in the split format. Holds everything that is
NOT naturally owned by a single Use Case — i.e. everything except the Use Case bodies
themselves, which each get their own file under use-cases/{UC-ID}.md (see
use-case-template.md). Fill in every placeholder (angle brackets) and delete every HTML comment
block (including this one) before treating the file as finished.

SPLITTING PRINCIPLE (apply this test to any new section before deciding where it goes): does
this content belong to exactly one UC, or does it reference/apply to several? A Business Rule
that applies to 3 UCs, a Data Requirement that describes a schema used by the whole feature, an
NFR that constrains the feature as a whole — none of these are owned by one UC any more than a
shared setup module is owned by one Work Breakdown task. Only split out content that is
genuinely per-item; everything cross-cutting stays here, in one place, so it's never duplicated
or arbitrarily assigned to one UC among several that reference it.

EVERY table in this document (and in every UC file) MUST be followed immediately by a one-line
legend (blockquote) explaining each column — someone with no context on this feature must be
able to read any table cold, without having to infer what a column means from its name alone.
-->

# {PREFIX} — Functional Requirements (Index)

## 1. Purpose and scope

<!-- Feature-wide: what this feature replaces/adds, what's explicitly in scope, what's
     explicitly out of scope, and who the actors are. One paragraph each, not a UC-by-UC list. -->

<prose>

## 2. Use Cases (index)

<!-- One row per UC. This table is the single place that lists every UC that exists — the
     use-cases/ directory listing must match it exactly (every UC-ID here has a file, every file
     has a row here). Title here is a short label, NOT the full flow description — that's in the
     UC's own file. -->

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| {UC-ID} | <short title> | <actor(s)> | <Must \| Should \| Could> | [use-cases/{UC-ID}.md](use-cases/{UC-ID}.md) |

<!-- Every table in this document (and in every component/task/UC file) MUST be followed by a
     one-line legend explaining each column — someone with no context on this feature must be
     able to read the table cold. Keep the legend immediately below its table, as a blockquote. -->

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

<!-- A rule that constrains behavior across one or more UCs. "Applies to" lists every UC it
     constrains, or "All UCs" if it's universal (e.g. a cross-cutting invariant like "no
     automatic push to remote" in FTR-018's style). Do NOT duplicate a rule into a UC file just
     because it applies there — the UC file cross-references it by ID instead (see
     use-case-template.md's "Related Business Rules"). -->

| ID | Rule | Applies to |
|---|---|---|
| BR-{NN} | <rule statement> | <UC-ID, UC-ID, ... \| All UCs> |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

<!-- Entities, schemas, or data contracts the feature introduces or depends on. Feature-wide by
     nature — reference which UCs read/write this data in prose if useful, but the data
     requirement itself lives here once. -->

<prose>

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-{NN} | <requirement statement> |

> **Legend:** **ID** — unique identifier. **Requirement** — a property/constraint the whole
> feature must satisfy; feature-wide by nature, so (unlike Business Rules/AC) there is no
> `Applies to`/`Related UC` column.

## 6. Acceptance Criteria

<!--
MUST be a real, first-class table — never a "see feature.md" pointer/deferral, even when
feature.md already has its own AC table. This table is both (a) what every Work Breakdown task
cites via its own `acceptanceCriteria` field, already checked by wb-validate.js/
wb-graph-checks.js checks 19-21, and (b) the anchor for the feature.md<->req<->spec bidirectional
traceability check (see "Traceability" below) — that check needs a real table on this side to
diff against feature.md's, a pointer gives it nothing to check. If this content is identical in
substance to feature.md's own AC table, that's expected — this is a reformatting into the parser
contract below, not a redecision, and the two must stay in substantive sync.

Column contract: first three columns MUST be exactly "ID", "Criterion", "Related UC" in that
order — parsed as-is by wb-graph-checks.js's parseAcTable (do not reinvent the column format). A
"Priority" fourth column is conventional (matches FTR-018's Requirements.md) but not required by
the parser, which derives an AC's effective priority from its Related UC's own priority instead.
"Related UC" must be a single UC-ID, a comma-separated list, or the literal "All UCs".
-->

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-{NN} | <Given/When/Then or plain testable statement> | <UC-ID \| UC-ID, UC-ID \| All UCs> | <Must \| Should \| Could> |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain (cited by WB tasks via
> `acceptanceCriteria`, by `spec/` components via `Addresses:`). **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs";
> machine-parsed by `wb-graph-checks.js`'s `parseAcTable`, not just descriptive. **Priority** —
> MoSCoW; every Must AC must be covered by ≥1 WB task and ≥1 `spec/` component.

## 7. Dependencies and Assumptions

<!-- External prerequisites, prior features this one builds on, fixed constraints (e.g. "no
     separate build step exists"), and anything that must be resolved before Gate 1 (open
     questions that block approval — call these out explicitly, don't bury them in prose). -->

<prose / bullet list>

## Traceability

<!--
Standard boilerplate — fill in {PREFIX} and the actual spec/index.md traceability-section anchor,
otherwise keep as-is. This paragraph is what makes the bidirectional check legible to a human
reading this file in isolation, not just to whatever script eventually automates it.
-->

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → `spec/` (Tech-Spec). Validation of that chain is bidirectional:
**forward** — every `feature.md` AC must appear here, and every Must AC here must be addressed
by at least one `spec/components/*.md` (via its `Addresses:` field) — catches omissions;
**backward** — every AC a `spec/` component claims to address must actually exist in this table,
and every AC here must trace back to `feature.md` — catches drift/invented requirements. Only
after both directions resolve with no errors does content-level (semantic) review proceed. See
`spec/index.md`'s own "Traceability" section for the other half of the chain.

---

## What moved out of this file, and why

<!--
Keep this section in every real index.md — it is not boilerplate, it is the record of the
splitting decision for THIS feature's specific content, since "what's cross-cutting" can be
judgment-dependent at the margins. State explicitly which sections you considered splitting
further and why you didn't (or did).
-->

<prose>
