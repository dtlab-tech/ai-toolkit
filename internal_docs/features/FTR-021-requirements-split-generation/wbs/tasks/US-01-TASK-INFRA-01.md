<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Repurpose gaia-generate-requirements.md to emit the skeleton only
- **Outcome:** src/claude/agents/gaia-generate-requirements.md's Output Structure keeps Sections 1, 3, 4, 5, 6, 7, 8, 9 verbatim; Section 2 is reduced to the use-case index table only (UC ID, Title, Actor, Priority, File columns), with no per-UC flow content; Process step 5 updated to describe this reduced scope
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repurpose gaia-generate-requirements.md to emit skeleton only

**Implementation notes:**

Edit, don't rewrite — the file's current Output Structure template (lines 37–142 of the
pre-this-feature `gaia-generate-requirements.md`) is correct for 8 of its 9 sections. Only
Section 2's body changes:

**Keep unchanged:** Section 1 (Introduction, lines ~48–60), Section 3 (Business Rules, ~89–93),
Section 4 (Data Requirements, ~95–105), Section 5 (NFRs, ~107–113), Section 6 (UI Requirements,
~115–123), Section 7 (Acceptance Criteria, ~125–131), Section 8 (Dependencies & Assumptions,
~133–135), Section 9 (Open Questions, ~137–142), the "Clarification Protocol" section, and all
"Guidelines".

**Replace Section 2's template** (currently lines 62–88: the full per-UC field table + Main
flow / Alternative flows / Error flows / Postconditions, repeated "for each use case") with an
index-table-only shape:

```markdown
## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-XX | [Title] | [Actor] | Must / Should / Could | use-cases/UC-XX.md |

> One row per use case you identify. Do NOT write the use case's flow here — a separate call
> generates each use case's full detail (preconditions, trigger, main/alternative/error flows,
> postconditions) from this row.
```

**Update Process step 5** ("Return the complete document...") to say: *"Your response is the
skeleton only — every section except each use case's own flow detail. List every use case you
identify in Section 2's index table; a separate, later call produces each one's full detail from
the row you write here. Still extract actors, business rules, and acceptance criteria exactly as
before — only the per-UC flow body itself is deferred."* This mirrors FTR-020's
`US-01-TASK-INFRA-01` note that a reader must understand this is scope reduction by design, not
an oversight.

Note for Section 7 (Acceptance Criteria): every AC's `Related UC` column must reference a UC ID
that will exist in Section 2's table — since both are produced in this same single call, this is
free (the skeleton already has full visibility into its own UC list), unlike FTR-020 where
AC-to-task assignment had to survive across multiple calls.

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
