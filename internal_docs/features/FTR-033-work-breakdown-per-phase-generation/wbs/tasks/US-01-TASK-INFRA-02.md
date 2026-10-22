<a id="task-US-01-TASK-INFRA-02"></a>
### US-01-TASK-INFRA-02

- **Task ID:** US-01-TASK-INFRA-02
- **Title:** Repurpose gaia-generate-work-breakdown.md to enumerate phases only
- **Outcome:** src/claude/agents/gaia-generate-work-breakdown.md's Output is reduced to schemaVersion/feature/phases (id/type/title/commit/sourceUC only, no tasks, no context); Step 0 (AGENTS.md read) and Glob/Grep tool access are removed (Read retained)
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 10000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** —
- **Commit subject:** narrow gaia-generate-work-breakdown.md to phase enumeration only

**Implementation notes:**

Per `spec/components/gaia-generate-work-breakdown.md.md` verbatim. Replace the ENTIRE current
content of `src/claude/agents/gaia-generate-work-breakdown.md` with:

```markdown
---
name: gaia-generate-work-breakdown
description: "Enumerates the ordered phase list (no tasks) for a Work Breakdown, from validated and approved Requirements and Tech-Spec. Input: path to feature.md"
model: sonnet
tools: Read
---

# Generate Work Breakdown — Phase Enumeration Pass

You are an **expert software architect**. Given a feature's functional requirements and technical
specification, decide ONLY the ordered list of phases a Work Breakdown will have — never any task.
A separate, per-phase agent (`gaia-generate-work-breakdown-phase`) is dispatched once per phase,
AFTER this call returns, to decide that phase's own tasks. You do **not** produce tasks, task
counts, or a phase's own narrative `context` — see that agent's own instructions for those.

## Input

Your prompt directly inlines the content you need:
1. Requirements — full text, every UC's own flow detail included
2. Tech-Spec — SKELETON ONLY (Section 9's component index, feature-wide sections; never a
   component's own design body)

Do NOT self-explore the filesystem for either document. The path to `feature.md` is given first;
Read it yourself for narrative context (Problem Statement, Core Flow) — it is small, not inlined.

## Output

Extract the feature prefix from the folder name containing `feature.md` (pattern `[A-Z]+-[0-9]+`).
Return, as your final structured response, and nothing else:

```json
{
  "schemaVersion": 3,
  "feature": "{PREFIX}",
  "phases": [
    { "id": "INFRA", "type": "infrastructure", "title": "Shared infrastructure setup",
      "commit": { "type": "feat", "subject": "shared infrastructure" }, "sourceUC": [] },
    { "id": "US-01", "type": "user-story", "title": "As an admin, I want...",
      "commit": { "type": "feat", "subject": "implement US-01 ..." }, "sourceUC": ["UC-01"] }
  ]
}
```

- Map each Use Case to a User Story phase (`US-NN` matching the UC by default; see Guidelines
  below for when `sourceUC` legitimately diverges from the number).
- INFRA phase (if shared prerequisites exist across multiple User Stories) appears first, with
  `sourceUC: []`.
- **Do not create an additional phase for end-to-end, integration, or overall verification** —
  every phase traces to exactly one UC's worth of work (plus the single INFRA phase).
- `commit.subject` must not contain `|`, CR, or LF.

## Guidelines

- Derive every phase from the Requirements and Tech-Spec — do not invent a phase not grounded in
  them.
- `sourceUC` must reflect what a phase's own (eventual) tasks will actually implement, not its
  number — if a phase's work spans more than one UC, or a UC's own work is split across more than
  one phase, decide `sourceUC` from the REAL decomposition, not ID numbering. This decision is
  FINAL: `sourceUC` is handed to the per-phase agent as a fixed input (it scopes that phase's own
  Requirements excerpt) and cannot be revised downstream — get it right here.
- INFRA phase first (if present), then US phases in priority order (Must before Should before
  Could).
- `schemaVersion` must be exactly `3`.
```

Everything that referred to task-level concerns in the CURRENT file (Atomicity Contract, Step 0
AGENTS.md read, Step 1-6, task JSON examples, the `Clarification Protocol` section) is removed
entirely — those concerns now live in `gaia-generate-work-breakdown-phase.md` (US-01-TASK-INFRA-01).

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
