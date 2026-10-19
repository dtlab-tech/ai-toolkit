<!--
USE CASE TEMPLATE — req/use-cases/{UC-ID}.md

Canonical structure for one Use Case file in the split Requirements format. Every UC file has
exactly three parts, in this order: (1) the heading + field table, (2) the flow/description
body, (3) cross-references back to the index (Business Rules and Acceptance Criteria that apply
to this UC). Fill in every placeholder (angle brackets) and delete every HTML comment block
(including this one) before treating the file as finished.
-->

### {UC-ID}: <Title — short, matches the Title column in index.md's Use Cases table exactly>

| Field | Value |
|---|---|
| Actor | <who/what initiates or participates in this use case> |
| Priority | <Must \| Should \| Could> |
| Preconditions | <what must already be true before this use case can start> |
| Trigger | <the event that starts this use case> |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

<!--
The body: describe the actual flow. For a technical/internal feature (most of this toolkit's
own features), this is usually a numbered or prose description of what happens, in enough detail
that someone reading ONLY this file — not the whole Requirements document — understands exactly
what this use case requires, without having to infer it from the Tech-Spec or the Work Breakdown.
Length target: proportional to the use case's real complexity, not padded — a one-paragraph UC is
fine if that's genuinely all there is to say; a multi-step UC can run longer, but if it's
sprawling across unrelated concerns, that's a sign it should be two UCs, not one file trying to
cover both (same atomicity instinct as a Work Breakdown task, just at a coarser grain).
-->

<prose describing the flow>

**Related Business Rules:** <comma-separated BR-IDs that apply to this UC, derived from the
`Applies to` column in [index.md](../index.md#3-business-rules) — include any `All UCs` rule
too, or `—` if none>

**Related Acceptance Criteria:** <comma-separated AC-IDs whose `Related UC` column includes this
UC (always include any `All UCs` AC too), derived from
[index.md](../index.md#6-acceptance-criteria). `—` is only valid if index.md's AC table
genuinely has no AC referencing this UC yet — treat that as a flag worth double-checking, not a
normal/expected state: per the feature.md<->req<->spec bidirectional traceability check (see
[index.md](../index.md#traceability)), every UC should normally trace to at least one AC, or
nothing downstream can verify this UC's Work Breakdown tasks actually satisfy it.

<!--
Both cross-reference lines above are DERIVED data — they must match what index.md's tables
actually say. Don't invent a BR/AC reference here that doesn't exist in the index, and don't let
this line go stale if the index changes later (whatever generates/maintains this file is
responsible for keeping it in sync — this is the same "which side is authoritative" question the
Work Breakdown's skeleton/detail split had to answer: here, index.md's tables are authoritative,
this line is a convenience projection of them, not a second source of truth).
-->
