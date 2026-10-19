<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Read req/index.md in the semantic work-breakdown validator
- **Outcome:** gaia-validate-work-breakdown-semantic.md's Step 2 reads req/index.md (falling back to {PREFIX}-Requirements.md for a legacy feature); pm-phase2.js's dispatch call's prompt second line changes from file('Requirements.md') to reqIndexPath
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** read req/index.md in the semantic work-breakdown validator

**Implementation notes:**

Two changes:

1. `src/claude/workflows/pm-phase2.js`'s semantic validator worker call:
```js
// before:
await c.worker('gaia.agent.planner.validate-work-breakdown',
  `${wbsDir}\n${file('Requirements.md')}`, { schema: ... })
// after:
await c.worker('gaia.agent.planner.validate-work-breakdown',
  `${wbsDir}\n${reqIndexPath}`, { schema: ... })
```

2. `src/claude/agents/gaia-validate-work-breakdown-semantic.md`'s Step 2 wording: replace its
reference to reading `{PREFIX}-Requirements.md` for "User Story descriptions and Acceptance Criteria
text" with reading whatever path the prompt names (the split `req/index.md` for a real-split
feature, or the legacy monolithic path — `reqIndexPath` already resolves to the correct one
either way, so the agent's own instructions just say "Read the path given to you in the prompt",
with a one-line note that it may be either shape). Its closing instruction "Use `Read` to load both
files" is unchanged in meaning.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "semantic"
```
