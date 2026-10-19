<a id="task-US-03-TASK-INFRA-01"></a>
### US-03-TASK-INFRA-01

- **Task ID:** US-03-TASK-INFRA-01
- **Title:** Create gaia-generate-tech-spec-component.md agent and register it in the agent catalog
- **Outcome:** src/claude/agents/gaia-generate-tech-spec-component.md exists (haiku, no Write tool) taking one component's index-table row plus the compact full component index plus the relevant Requirements/feature.md excerpt as input, returning that component's Change/Algorithm-or-Schema/Tests detail in the component-template.md shape; lib/agent-registry.js's CATALOG gains the matching gaia.agent.planner.tech-spec-component entry
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** The new agent file and its registry entry are one task because an agent that exists but isn't registered fails at the first real dispatch, not at review time — treating them as separable risks shipping one without the other, exactly the gap found twice before in this lineage (FTR-021, FTR-022).
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-tech-spec-component.md per-component detail agent

**Implementation notes:**

Step 1 — new agent file, frontmatter mirrors `gaia-generate-requirements-use-case.md`'s
conventions (`model: haiku`, no `tools: ... Write`):

```markdown
---
name: gaia-generate-tech-spec-component
description: "Generates one component's full technical design (Change, Algorithm/Schema, Tests) from its index-table row. Input: component row + compact sibling index + feature.md/Requirements excerpt"
model: haiku
tools: Read, Glob, Grep
---
```

**Input contract** (the host/`pm-phase1.js` supplies all of this in the dispatch prompt — this
agent never reads `feature.md`/`Requirements.md` in full itself beyond what's handed to it):
1. This component's own index-table row verbatim (`Path`, `Domain`, `Addresses`).
2. The compact full component index: every component's `Path` + `Domain` only (cross-component
   awareness — "does another component already define this DTO?").
3. The relevant excerpt of `feature.md`/`{PREFIX}-Requirements.md` (host-selected — the full
   documents, not re-searched by this agent).

**Mandatory instruction** (same restate-don't-redecide convention every per-item agent in this
lineage already uses): *"Restate the given Path, Domain, and Addresses exactly as given — do not
reword or re-derive them. Your new content is this component's own `Change` description, its
actual design (data model / DTO / service / endpoint / component / page, whichever matches this
one file's real nature — real code/schema, not prose), and its own `Tests` section."*

**Output** — exactly `templates/component-template.md`'s shape, reused verbatim from the
FTR-020 worked example (do not re-derive this format):

```markdown
# {Path} — {New | Modified}

## Change

<prose: what changes and why>

## {Algorithm / Schema / whichever name fits this component}

<real code/schema>

## Tests

<specific test file(s) and cases for this component>
```

Omit `Related Open Questions`/`Related components` fields from `component-template.md` — those
are split-source-only navigation aids; `tech-spec-assembler.js` never reads them back into the
assembled document (Tech-Spec §4), so there is no reason for a generation agent to produce them.

Step 2 — `lib/agent-registry.js`'s `CATALOG`, new entry alongside the existing
`gaia.agent.planner.requirements-use-case`/`gaia.agent.planner.work-breakdown-task` entries:

```js
{
  agentId:               'gaia.agent.planner.tech-spec-component',
  nativeNames:           { claude: 'gaia-generate-tech-spec-component' },
  relativeInstallPath:   '.claude/agents/gaia-generate-tech-spec-component.md',
  role:                  'planner',
  type:                  'tech-spec',
  authorisedPhases:      ['planning'],
  allowedPipelines:      ['implement-feature'],
  minimumToolkitVersion: '0.13.0',
  deprecated:            false,
  deprecationTarget:     null,
  platforms:             ['claude'],
},
```

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
