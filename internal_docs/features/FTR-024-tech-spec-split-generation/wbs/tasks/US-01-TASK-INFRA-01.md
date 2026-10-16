<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Repurpose gaia-generate-tech-spec.md to emit the skeleton only
- **Outcome:** src/claude/agents/gaia-generate-tech-spec.md's Output Structure keeps Sections 1, 2, 6, 7, 8, 11, 12 verbatim; Section 9's two File Inventory tables gain a Domain column (BE|FE|DB|DevOps|INFRA|TEST) between Purpose-or-Change and Addresses, and a Spec column after Addresses; Sections 3, 4, 5, 10 are removed from this agent's own output; Process step updated to describe the reduced, skeleton-only scope
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repurpose gaia-generate-tech-spec.md to emit skeleton only

**Implementation notes:**

Edit, don't rewrite — most of the existing agent file (`gaia-generate-tech-spec.md`, 258 lines
pre-this-task) is still correct and must stay:

**Keep unchanged:** Step 0 "Read Project Conventions", the Process steps' overall shape (1-5),
Sections 1, 2, 6, 7, 8, 11, 12 of the Output Structure template verbatim, the Clarification
Protocol, and every existing Guidelines bullet (including FTR-023's `Addresses` bullet).

**Reduce to placeholder headings, do NOT delete entirely:** Section 3 (Backend, lines ~86-134
pre-this-task), Section 4 (Frontend, ~136-170), Section 5 (External Integrations, ~172-178),
Section 10 (Testing Strategy, ~214-218) — their real content moves entirely to the new
per-component agent (`US-03-TASK-INFRA-01`), but **the numbered heading itself must stay
present** in `spec/index.md`, with a one-line placeholder body (e.g. "_Per-component detail — see
Section 9's Components table..._"). This is not optional: `tech-spec-assembler.js`'s
`spliceSectionBody` (`US-05-TASK-BE-01`) locates each section by its own `## {n}. ` heading before
replacing its body — if the heading is missing entirely from the skeleton, the assembler has
nothing to splice into and throws "missing section {n}". (Caught by actually implementing this
task, not assumed from the Tech-Spec's own OQ-1 wording, which said "removed" — correct intent,
imprecise wording; the heading must survive, only the body is deferred.)

**Rewrite Section 9's two tables** (currently, pre-this-task, lines ~200-212: `Path | Purpose`
and `Path | Change description`, each gaining an `Addresses` column in FTR-023):

```markdown
## 9. File Inventory

Complete list of files to create or modify:

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| ... | ... | ... | ... | [components/{fileSlug}](components/{fileSlug}) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| ... | ... | ... | ... | [components/{fileSlug}](components/{fileSlug}) |
```

**Column order matters.** `Addresses` MUST stay the 3rd column: `tech-spec-graph-checks.js`'s
existing, unmodified, positional parser (FTR-023) always reads `cells[2]` as "Addresses" —
inserting `Domain` before it would silently feed the parser a Domain value ("BE") in place of an
AC reference, failing `tech-spec-ac-check` on every skeleton. `Domain` and `Spec` are new
trailing columns, safely ignored by that same positional parser. Do not reorder them.

`Domain` uses the exact same enum Work Breakdown tasks already use
(`BE | FE | DB | DevOps | INFRA | TEST`) — no new taxonomy; cite the existing "Domain → agentType
mapping" conventions already established elsewhere in this codebase's agent files as the model's
reference, rather than restating the enum's meaning from scratch. `Spec` is a placeholder link
the model fills in with `components/{the file's own basename+extension}.md` — remind the model
this is provisional (the host may rewrite it for collision-disambiguation, per
`US-04-TASK-BE-01`), not something downstream code parses as final.

**Update Process step 5** ("Return the complete document..."): *"Your response is the skeleton
only — every section except each file's own Backend/Frontend/External-Integration/Testing
detail. List every file you identify as created or modified in Section 9's two tables, including
its `Domain` and a provisional `Spec` link; a separate, later call produces each file's own full
design from that row. Still make every other architectural decision (Overview, Architecture,
Security, Database, Configuration, Implementation Order, Risks) exactly as before — only the
per-component detail itself is deferred."*

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
