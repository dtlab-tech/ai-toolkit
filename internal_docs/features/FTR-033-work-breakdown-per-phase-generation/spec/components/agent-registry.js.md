# lib/agent-registry.js — Modified

## Change

New CATALOG entry for the new `gaia-generate-work-breakdown-phase` agent, mirroring the existing
`gaia.agent.planner.work-breakdown`/`gaia.agent.planner.work-breakdown-task` entries exactly —
without it, `c.worker('gaia.agent.planner.work-breakdown-phase', ...)` would fail agent resolution
(a real, previously-made mistake in this lineage — FTR-021's own history notes a missing
agent-registry CATALOG entry as one of 3 real bugs found that session).

## Algorithm

Add a new CATALOG array entry, placed immediately after the existing
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
differ, each naming the new agent consistently.

## Tests

See `components/workflow-runtime.test.js.md` — any test that dispatches
`gaia.agent.planner.work-breakdown-phase` via `c.worker()` would fail agent resolution outright if
this entry were missing or mistyped, so the new per-phase tests themselves are the real coverage
for this change; no dedicated unit test is added purely for the CATALOG entry's own presence.
