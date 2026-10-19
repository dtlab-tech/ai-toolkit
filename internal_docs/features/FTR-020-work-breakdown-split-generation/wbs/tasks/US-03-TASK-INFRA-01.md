<a id="task-US-03-TASK-INFRA-01"></a>
### US-03-TASK-INFRA-01

- **Task ID:** US-03-TASK-INFRA-01
- **Title:** Create gaia-generate-work-breakdown-task.md agent
- **Outcome:** src/claude/agents/gaia-generate-work-breakdown-task.md exists (sonnet, no Write tool) taking one skeleton task entry + relevant Tech-Spec section + compact full-skeleton task list as input, returning that task's detail block in the existing rendered format (field lines + fenced verification commands), instructed to restate skeleton-owned fields verbatim and supply only verification commands and groupingRationale as new content
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-work-breakdown-task.md per-task detail agent

**Implementation notes:**

New agent file, frontmatter mirrors `gaia-generate-work-breakdown.md`'s conventions
(`model: sonnet`, no `tools: ... Write`):

```markdown
---
name: gaia-generate-work-breakdown-task
description: "Generates one task's detail block (verification commands, grouping rationale) from its skeleton entry. Input: skeleton task entry + Tech-Spec excerpt + compact sibling task list"
model: sonnet
tools: Read, Glob, Grep
---
```

**Input contract** (the host/`pm-phase2.js` supplies all of this in the dispatch prompt — this
agent never reads `feature.md`/`Requirements.md`/`Tech-Spec.md` itself):
1. The task's own skeleton entry verbatim (`id`, `title`, `outcome`, `domain`, `agentType`,
   `dependsOn`, `acceptanceCriteria`, `estimate`, `outputCount`, `commit`).
2. The Tech-Spec section(s) relevant to this task's domain (host extracts; this agent does not
   search the whole Tech-Spec itself — keeps the call small, per this feature's whole point).
3. The compact full-skeleton task list: every task's `id` + `title` + `outcome` only (for
   duplicate-implementation awareness — "has another task already built this?").

**Mandatory instruction** (this is the core of OQ-03's resolution — state it explicitly, don't
leave it implicit): *"Restate every given field (`title`, `outcome`, `domain`, `agentType`,
`dependsOn`, `acceptanceCriteria`, `estimate`, `outputCount`, `commit`) exactly as given — do not
reword, re-estimate, or re-derive them. Your only new content is the verification commands and,
if `outputCount > 1`, the grouping rationale."*

**Output** — exactly the block format from Tech-Spec §5 (same shape as
`INFRA-TASK-BE-02`'s `renderTaskDetailBlock` produces, so this agent's free-text response must be
byte-compatible with what that function would generate from the same data):
```
<a id="task-{taskId}"></a>
### {taskId}

- **Task ID:** {taskId}
- **Title:** {title}
...
- **Commit subject:** {commit.subject}

**Verification commands:**

{one fenced code block per command}
```
Reuse `gaia-generate-work-breakdown.md`'s existing "Verification Commands" guidance section
(command examples, the directory-only-task `.gitkeep`/`git ls-files` rule) **verbatim** — moved
here, not duplicated-and-diverged, since that agent no longer needs it (US-01-TASK-INFRA-01
removes it from there).

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
