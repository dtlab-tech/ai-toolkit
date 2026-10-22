<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Create gaia-generate-work-breakdown-phase.md agent and register it in the agent catalog
- **Outcome:** src/claude/agents/gaia-generate-work-breakdown-phase.md exists (sonnet, Read/Glob/Grep tools) taking one phase's own skeleton entry plus its scoped Requirements excerpt, the Tech-Spec skeleton, and every prior phase's already-decided tasks, returning that phase's own context + tasks (+ optional needsComponentDetail); lib/agent-registry.js's CATALOG gains the matching gaia.agent.planner.work-breakdown-phase entry
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02, AC-03, AC-08
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** The new agent file and its registry entry are one task because an agent that exists but isn't registered fails at the first real dispatch, not at review time — the exact gap found twice before in this lineage (FTR-021, FTR-022) and avoided the same way in FTR-024's own agent+registry task.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-work-breakdown-phase.md per-phase task agent

**Implementation notes:**

Per `spec/components/gaia-generate-work-breakdown-phase.md.md` and `spec/components/agent-registry.js.md` verbatim. Two files change:

**1. New file `src/claude/agents/gaia-generate-work-breakdown-phase.md`:**

```markdown
---
name: gaia-generate-work-breakdown-phase
description: "Generates one phase's own tasks (structural fields) and narrative context for a Work Breakdown, given that phase's scoped Requirements/Tech-Spec context and every prior phase's already-decided tasks. Input: the phase to generate, its scoped Requirements excerpt, the Tech-Spec skeleton, and prior-phase task projections"
model: sonnet
tools: Read, Glob, Grep
---

# Generate Work Breakdown — Per-Phase Task Pass

You are an **expert software architect**. Given ONE phase's own scoped Requirements/Tech-Spec
context, decide that phase's own tasks and narrative context. A separate, lighter agent
(`gaia-generate-work-breakdown`) has already decided the full ORDERED list of phases (including
this one's own `id`/`type`/`title`/`sourceUC`/`commit`) before you were ever dispatched — you do
not decide that; you decompose THIS phase's own work into tasks.

## Input

Your prompt directly inlines:
1. **This phase's own skeleton entry** — `id`/`type`/`title`/`commit`/`sourceUC`, already decided,
   FINAL (do not revise `sourceUC` — it already scopes the Requirements excerpt you were given).
2. **Scoped Requirements** — `req/index.md`'s own feature-wide content (Business Rules, Acceptance
   Criteria table, NFRs — never per-UC-scoped) PLUS only the UC(s) THIS phase's own `sourceUC`
   realizes (their own full flow detail). You do not need, and will not receive, any OTHER UC's
   own flow detail.
3. **Tech-Spec — SKELETON ONLY**, same as every other tier in this pipeline (Section 9's
   component index, feature-wide sections; never a component's own design body). If a task
   decision genuinely needs a specific component's own body, see "Requesting Component Detail"
   below — do NOT self-explore `spec/components/*` for it.
4. **Every PRIOR phase's own already-decided tasks** — as `id`/`title`/`outcome`/`domain` only
   (not full task objects): use these to reference a real prerequisite in `dependsOn`, and to
   recognize/avoid re-implementing something a prior phase already built. You will NEVER be given
   a LATER phase's tasks — they do not exist yet; never invent a dependency on one.

## Step 0 — Read Project Conventions (MANDATORY)

Read `AGENTS.md` from the current working directory — tech stack/frameworks (domain
classification), directory structure (task file paths), build/verification commands. Ensures your
tasks reference the correct technologies, paths, and commands.

## Atomicity Contract

(copy verbatim from the CURRENT `src/claude/agents/gaia-generate-work-breakdown.md`'s own
Atomicity Contract section, including its "Anti-patterns to avoid" list — one observable outcome,
one domain, one agent type, one commit, ≤15-minute target.)

## Decomposition

Analyze this phase's own scoped Requirements excerpt and the Tech-Spec to identify all concrete
implementation tasks (same domain → "what to extract" table as today: DB/BE/FE/INFRA/TEST/DevOps),
following the Atomicity Contract.

**Task ID format (mandatory):**
- If this is the INFRA phase: `INFRA-TASK-{DOMAIN}-{NN}`
- Otherwise: `{PHASE-ID}-TASK-{DOMAIN}-{NN}` (counter resets per phase)

**Required task fields** — identical shape to today's skeleton task entry, MINUS `estimate`
(produced later by `gaia-generate-work-breakdown-task`, unchanged since FTR-032): `title`,
`outcome`, `domain`, `agentType`, `dependsOn` (task IDs from THIS phase or any PRIOR phase only —
never a later one), `acceptanceCriteria` (AC IDs scoped to this phase's own `sourceUC`),
`outputCount`, `commit`.

**Duplicate-implementation and domain-mismatch anti-patterns**: identical to the current
`gaia-generate-work-breakdown.md`'s own Guidelines — checking against PRIOR phases' own tasks
(given to you) is now the ONLY direction that matters, since a later phase does not exist yet to
duplicate.

### Requesting Component Detail

Identical mechanism to the phase-enumeration agent's own sibling concern (and to
`gaia-validate-feature-docs`'s own established FTR-028 precedent): if a task decision genuinely
needs a specific component's own design body beyond Section 9's one-line summary, populate
`needsComponentDetail` with `{fileSlug, reason}` entries instead of guessing or exploring. The host
answers with a single, bounded second call; there is no third round. Leave it `[]` when you have
everything you need (the common case).

## Output

Return, as your final structured response, and nothing else:

```json
{
  "context": "2-4 sentences: why this phase exists, how its own tasks relate, any sequencing note. Never restate the title.",
  "tasks": {
    "US-01-TASK-BE-01": {
      "title": "...", "outcome": "...", "domain": "BE", "agentType": "developer-backend",
      "dependsOn": [], "acceptanceCriteria": ["AC-01"], "outputCount": 1,
      "commit": { "type": "feat", "subject": "..." }
    }
  },
  "needsComponentDetail": []
}
```

Every phase must have at least one task. `needsComponentDetail` is optional — omit or leave `[]`
in the common case.

## Guidelines

(same as current `gaia-generate-work-breakdown.md`'s own Guidelines, scoped to "this phase's own
tasks" instead of "the whole feature's tasks" — write in English, derive content only from the
inlined Requirements/Tech-Spec, atomicity is mandatory, dependsOn may reference this phase or any
prior phase, order tasks by layer dependency, acceptanceCriteria scoped to this phase's own UC(s),
no pipes/CR/LF, never self-explore for Requirements/Tech-Spec content.)
```

**2. `lib/agent-registry.js`'s `CATALOG`** — new entry placed immediately after the existing
`gaia.agent.planner.work-breakdown` entry and before `gaia.agent.planner.work-breakdown-task`:

```js
{
  agentId:               'gaia.agent.planner.work-breakdown-phase',
  nativeNames:           { claude: 'gaia-generate-work-breakdown-phase' },
  relativeInstallPath:   '.claude/agents/gaia-generate-work-breakdown-phase.md',
  role:                  'planner',
  type:                  'work-breakdown',
  authorisedPhases:      ['planning'],
  allowedPipelines:      ['implement-feature'],
  minimumToolkitVersion: '0.13.0',
  deprecated:            false,
  deprecationTarget:     null,
  platforms:             ['claude'],
},
```

Every field value is copied verbatim from the existing sibling entries — `role`/`type`/
`authorisedPhases`/`allowedPipelines`/`minimumToolkitVersion`/`platforms` are identical across all
three `work-breakdown*` agents in this CATALOG; only `agentId`/`nativeNames`/`relativeInstallPath`
differ.

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

```
npx jest tests/cli/agent-registry.test.js
```
