# src/claude/workflows/pm-phase2.js — Modified

## Change

UC-01's skeleton-side half: `SKELETON_SCHEMA` no longer requires (or declares) `estimate` per
task. `materializeIndex` needs NO code change — it already spreads whatever fields the skeleton
response contains (`{ ...t, detailFile, status }`); once the model stops being ASKED for
`estimate`, it simply stops appearing in `t`, and the spread naturally omits it from
`index.tasks[taskId]` too. The per-task detail dispatch itself (`c.worker('gaia.agent.planner.
work-breakdown-task', ...)`) is UNCHANGED — no new field, no new prompt text, no schema change
there at all (it has never used `{schema: ...}`; it's a markdown-template-filled response, and its
template already asks for `estimate` today).

## Algorithm

**Edit — `SKELETON_SCHEMA`'s per-task shape** (the `tasks.additionalProperties` block only):

```js
// before:
tasks: { type: 'object', additionalProperties: {
  type: 'object',
  required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
    'acceptanceCriteria', 'estimate', 'outputCount', 'commit'],
  properties: {
    title: { type: 'string' }, outcome: { type: 'string' },
    domain: { enum: ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST'] },
    ['agentType']: { enum: ['developer-backend', 'developer-frontend', 'developer-testing', 'review-solution'] },
    dependsOn: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    estimate: { type: 'object', required: ['agentMinutes', 'tokens'],
      properties: { agentMinutes: { type: 'integer' }, tokens: { type: 'integer' } } },
    outputCount: { type: 'integer' },
    commit: { type: 'object', required: ['type', 'subject'],
      properties: { type: { type: 'string' }, subject: { type: 'string' } } },
  },
} },

// after:
tasks: { type: 'object', additionalProperties: {
  type: 'object',
  required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
    'acceptanceCriteria', 'outputCount', 'commit'],
  properties: {
    title: { type: 'string' }, outcome: { type: 'string' },
    domain: { enum: ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST'] },
    ['agentType']: { enum: ['developer-backend', 'developer-frontend', 'developer-testing', 'review-solution'] },
    dependsOn: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    outputCount: { type: 'integer' },
    commit: { type: 'object', required: ['type', 'subject'],
      properties: { type: { type: 'string' }, subject: { type: 'string' } } },
  },
} },
```

`estimate` is removed from both `required` and `properties` — a schema-required worker call fails
closed on any MISSING required field, never on an EXTRA one, so simply dropping it from both is
sufficient; no `additionalProperties: false` tightening is needed or wanted (none existed before
this change either).

No change to `materializeIndex`, `buildTaskPrompt`, `gaia-task-template.md`, or the per-task
dispatch call itself — all already correct for this feature's needs.

## Tests

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-01, AC-03, AC-04).
