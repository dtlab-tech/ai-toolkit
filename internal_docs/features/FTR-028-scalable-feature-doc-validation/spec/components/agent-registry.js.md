# lib/agent-registry.js — Modified

## Change

Adds one new entry to the registry's existing array, mirroring the shape and placement
(alphabetically/logically next to the other `validation`-type `planner` entries) of the existing
`gaia.agent.planner.validate-feature-docs`/`gaia.agent.planner.validate-work-breakdown` entries
exactly — no new field, no new shape.

## Algorithm

Insert immediately after the existing `gaia.agent.planner.validate-work-breakdown` entry
(currently at `lib/agent-registry.js:249-261`):

```js
{
  agentId:               'gaia.agent.planner.validate-tech-spec-component-detail',
  nativeNames:           { claude: 'gaia-validate-tech-spec-component-detail' },
  relativeInstallPath:   '.claude/agents/gaia-validate-tech-spec-component-detail.md',
  role:                  'planner',
  type:                  'validation',
  authorisedPhases:      ['planning'],
  allowedPipelines:      ['implement-feature'],
  minimumToolkitVersion: '0.13.0',
  deprecated:            false,
  deprecationTarget:     null,
  platforms:             ['claude'],
},
```

`minimumToolkitVersion: '0.13.0'` matches every other entry in this file (the registry's own
introduction version, confirmed by inspection — not a per-feature bump; no entry in this file uses
any other value). No other part of `lib/agent-registry.js` changes: `resolveAgent`/
`validateAgentSet`/`listRegisteredAgents` all operate generically over the array and need no
new logic for this entry.

## Tests

`tests/integration/workflow-runtime.test.js`'s new drill-down tests (see that file's own component)
exercise the real `resolve(id)` path for `gaia.agent.planner.validate-tech-spec-component-detail`
end-to-end (through the same `c.worker()`/registry resolution every other agent in this pipeline
already goes through) — not a mocked registry — so a missing or malformed entry would fail those
tests with an unresolvable-agent error, not silently.
