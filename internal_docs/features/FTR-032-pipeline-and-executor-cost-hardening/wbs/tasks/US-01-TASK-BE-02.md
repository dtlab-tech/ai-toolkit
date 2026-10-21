<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Remove the per-task effort estimate from the WBS skeleton schema
- **Outcome:** pm-phase2.js's SKELETON_SCHEMA no longer requires or declares estimate per task; materializeIndex no longer copies it
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-03, AC-04
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase2
- **Commit subject:** drop the per-task effort estimate from the WBS skeleton schema

**Implementation notes:**

Per `spec/components/pm-phase2.js.md`'s Edit — a scoped change to `SKELETON_SCHEMA`'s per-task
`tasks.additionalProperties` block in `src/claude/workflows/pm-phase2.js`:

```js
// before:
required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
  'acceptanceCriteria', 'estimate', 'outputCount', 'commit'],
properties: {
  ...
  estimate: { type: 'object', required: ['agentMinutes', 'tokens'],
    properties: { agentMinutes: { type: 'integer' }, tokens: { type: 'integer' } } },
  ...
},

// after:
required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
  'acceptanceCriteria', 'outputCount', 'commit'],
properties: {
  ...
  // estimate removed entirely
  ...
},
```

Remove `estimate` from BOTH `required` and `properties` — leave every other field in that block
unchanged. `materializeIndex` needs NO code change: it already spreads whatever fields the skeleton
response contains (`{ ...t, detailFile, status }`); once the model stops being asked for
`estimate`, it simply stops appearing in `t`, and the spread naturally omits it. Depends on
US-01-TASK-BE-01 landing first, so the read-back side exists before the write side stops producing
the field — reversing the order would leave a window where NEITHER side produces a usable
`estimate`.

**Verification commands:**

```
npx jest tests/cli/pm-phase2-source.test.js
```
