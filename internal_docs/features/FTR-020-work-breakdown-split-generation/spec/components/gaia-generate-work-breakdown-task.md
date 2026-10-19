# `src/claude/agents/gaia-generate-work-breakdown-task.md` — New

**Related Open Questions:** OQ-03 (see [index.md](../index.md#2-resolution-of-open-questions))
**Related components:** [pm-phase2.md](pm-phase2.md)

**Addresses:** AC-02, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

One-task-scoped sonnet agent: input is one skeleton task entry + relevant Tech-Spec section +
the compact full-skeleton task list; output is one task detail block in the existing rendered
format (below). No Write tool — same host-writes-the-response convention as every other
`worker()`-dispatched agent.

## Per-task call — no schema (plain-text response, same convention as today's full generator)

Output is the existing rendered block, unchanged format:
```
<a id="task-{taskId}"></a>
### {taskId}

- **Task ID:** {taskId}
- **Title:** {title}
- **Outcome:** {outcome}
- **Domain:** {domain}
- **Agent type:** {agentType}
- **Dependencies:** {dependsOn joined or —}
- **Acceptance criteria:** {acceptanceCriteria joined or —}
- **Estimate — agent minutes:** {agentMinutes}
- **Estimate — tokens:** {tokens}
- **Output count:** {outputCount}
- **Grouping rationale:** {groupingRationale or —}
- **Commit type:** {commit.type}
- **Commit scope:** {commit.scope or —}
- **Commit subject:** {commit.subject}

**Verification commands:**

{one fenced block per command}
```
The per-task agent is given its skeleton entry pre-filled for every field except
`groupingRationale` and the verification commands section, and is instructed to restate the
given values verbatim (not re-derive them) — see OQ-03 in [index.md](../index.md).

Canonical template: `templates/task-template.md` — including its parsing-contract note (an
example of this same format inside the agent's own output must never be mistaken for the real
fields by `wbs-assembler.js`'s parser).

## Tests

No dedicated new test file — this is a prompt-only change with no new executable code. Verified
by the existing `tests/frontmatter` structural suite; behavioral correctness of the detail block
it produces is covered downstream by [pm-phase2.md](pm-phase2.md)'s and
[wbs-assembler.md](wbs-assembler.md)'s own tests, not here.
