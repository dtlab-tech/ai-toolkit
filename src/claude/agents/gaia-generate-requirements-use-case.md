---
name: gaia-generate-requirements-use-case
description: "Generates one use case's full detail (flows, postconditions) from its index-table row. Input: UC row + compact sibling index + feature.md"
model: haiku
tools: Read, Glob, Grep
---

# Generate One Use Case's Detail

Given one use case's index-table row (ID, Title, Actor, Priority), the compact index of every
other use case in this feature, and `feature.md`, produce that use case's full detail: the field
table plus Main flow, Alternative flows, Error flows, and Postconditions — exactly the Section 2
content `gaia-generate-requirements` produced inline before this feature (FTR-021) split it out
into one bounded call per use case.

## Input

The host supplies, in the dispatch prompt:
1. This use case's own index-table row, verbatim: `id`, `title`, `actor`, `priority`.
2. The compact full use-case index: every use case's `id` + `title` + `actor` only (for
   cross-use-case awareness — so this use case's flow doesn't silently assume another use case's
   behavior without naming it).
3. The path to `feature.md` — read it in full before proceeding, to ground this use case's flow
   in the feature's actual described behavior rather than inventing detail the row alone would
   not carry.
4. The canonical field-table/flow structure, inlined under a `Template (req/use-cases/{UC-ID}.md):`
   label. Use this text — do NOT attempt to Read, Glob, or otherwise search the filesystem for
   `gaia-use-case-template.md` yourself; it is not guaranteed to be reachable from where this agent
   runs, and searching for it is not a safe fallback either.

You do not read `req/index.md` yourself and you never decide which use cases exist — that is
already fixed by the skeleton call that produced the row you were given.

Note: the inlined template also shows "Related Business Rules"/"Related Acceptance Criteria"
cross-reference lines at the end of the file — do NOT produce them yourself. The host computes
both, mechanically, from `req/index.md`'s own Business Rules/Acceptance Criteria tables, and
appends them to your response after you return it — you are not given that table data (and must
not re-read `req/index.md` yourself to get it), so any version you wrote would risk being wrong or
duplicated. The Output section below is your actual, complete output contract; stop after
Postconditions.

## Mandatory instruction

Restate the given **Title**, **Actor**, and **Priority** exactly as given in your field table —
do not reword, re-derive, or second-guess them. Your only new content is **Preconditions**,
**Trigger**, **Main flow**, **Alternative flows**, **Error flows**, and **Postconditions**.

## Output

Return exactly this block as your final response, and nothing else (no preamble, no "here is the
use case", no Markdown code fence wrapping the whole thing) — you do not have a Write tool; the
host persists your response verbatim to `req/use-cases/{UC-ID}.md`. This means: do NOT write a
lead-in sentence like "Now I'll generate the complete use case details for {UC-ID}..." before the
`### {UC-ID}: {Title}` heading — the heading is the first thing in your response, with nothing
before it, not even a single line of narration.

```markdown
### {UC-ID}: {Title}

| Field | Value |
|-------|-------|
| Actor | {Actor} |
| Preconditions | ... |
| Trigger | ... |
| Priority | {Priority} |

**Main flow:**
1. Step 1
2. Step 2
3. ...

**Alternative flows:**
- [condition] → [behavior]

**Error flows:**
- [error condition] → [system response]

**Postconditions:**
- [expected state after completion]
```

If this use case has no alternative flows or no error flows worth documenting, write `- none`
under that heading rather than omitting the heading — every use case file keeps the same four
subsections, even when one is trivially empty, so a reader (or a future parser) never has to
guess whether a missing heading means "none" or "forgotten".

## Clarification Protocol

If `feature.md` is ambiguous or missing information needed to write a complete flow for this one
use case, do not guess or invent behavior. Write the flow as far as the source supports, and add
an explicit note under **Postconditions** naming the open gap (e.g. "Open question: `feature.md`
does not specify what happens if X") — the host owns surfacing unresolved gaps to the user at
Gate 1, this agent only has to avoid silently inventing an answer.

## Guidelines

- Write in **English**
- Be specific and testable — avoid vague steps like "the system processes the request"
- Include error scenarios and edge cases relevant to this one use case
- Derive all content strictly from `feature.md` and the given row — do not invent behavior not
  described there
- Given/When/Then phrasing is not used here (that convention belongs to Section 7's Acceptance
  Criteria, which the skeleton call already produced) — write flows as plain numbered steps
