<a id="task-US-03-TASK-INFRA-01"></a>
### US-03-TASK-INFRA-01

- **Task ID:** US-03-TASK-INFRA-01
- **Title:** Create gaia-generate-requirements-use-case.md agent
- **Outcome:** src/claude/agents/gaia-generate-requirements-use-case.md exists (haiku, no Write tool) taking one UC's index-table row plus the compact full use-case index plus feature.md as input, returning that UC's Section-2 block (field table + Main flow / Alternative flows / Error flows / Postconditions) in the exact format gaia-generate-requirements already produces today
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-requirements-use-case.md per-UC detail agent

**Implementation notes:**

New agent file, frontmatter mirrors `gaia-generate-requirements.md`'s own conventions (`model:
haiku` — same tier, since this call is strictly smaller and simpler than the skeleton call it was
split out of; no `Write` tool):

```markdown
---
name: gaia-generate-requirements-use-case
description: "Generates one use case's full detail (flows, postconditions) from its index-table row. Input: UC row + compact sibling index + feature.md"
model: haiku
tools: Read, Glob, Grep
---
```

**Input contract** (the host/`pm-phase1.js` supplies all of this in the dispatch prompt):
1. The UC's own index-table row verbatim (`id`, `title`, `actor`, `priority`).
2. The compact full use-case index: every UC's `id` + `title` + `actor` only (cross-UC awareness
   — helps avoid flow steps that silently assume another UC's behavior without naming it).
3. `feature.md`, so the agent can ground this UC's flow in the feature's actual described
   behavior rather than inventing detail the skeleton row alone wouldn't carry.

**Mandatory instruction** (same restate-don't-redecide convention as FTR-020's
`gaia-generate-work-breakdown-task.md`): *"Restate the given Title, Actor, and Priority exactly as
given in your field table — do not reword or re-derive them. Your new content is Preconditions,
Trigger, Main flow, Alternative flows, Error flows, and Postconditions."*

**Output** — exactly today's Section-2 per-UC block (reuse `gaia-generate-requirements.md`'s
original template, which this agent inherits unchanged since it never had the field split
applied to it — see US-01-TASK-INFRA-01):

```
### {UC-ID}: {Title}

| Field | Value |
|-------|-------|
| Actor | {actor} |
| Preconditions | ... |
| Trigger | ... |
| Priority | {priority} |

**Main flow:**
1. ...

**Alternative flows:**
- [condition] -> [behavior]

**Error flows:**
- [error condition] -> [system response]

**Postconditions:**
- [expected state after completion]
```

Reuse `gaia-generate-requirements.md`'s existing Guidelines verbatim (Given/When/Then is not used
here — that convention is for Section 7's Acceptance Criteria, which stays in the skeleton; this
agent only ever writes flow prose).

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
