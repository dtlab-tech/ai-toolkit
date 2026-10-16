# src/claude/workflows/pm-phase2.js — Modified

## Change

Two independent changes. (1) A new bridge step, its own `c.activity('bridge-requirements-tech-spec', ...)`,
added right after path resolution and before the existing Gate 1 approval/digest check: it detects
whether `req/`/`spec/` directories exist for this feature and, if so, assembles and writes
`{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` fresh (same two subprocess calls `pm-phase1.js`
now keeps only in-memory, relocated here because this phase's own unmodified internals still need
the monolithic shape on disk). If no `req/`/`spec/` directory exists, it leaves any pre-existing
legacy monolithic files untouched and does nothing. (2) The automatic `wb-render.js` call
(`c.activity('wb-render', ...)`) is removed entirely — `{PREFIX}-Work-Breakdown.md`/`.csv` are no
longer produced as a side effect of `pm-phase2`; `gate2_payload.renderer_result`/`renderer_failed`
are dropped from the returned payload (nothing downstream reads them — confirmed no other file
references `renderer_result`/`renderer_failed`).

## Service Interface

```js
// (1) New bridge step — inserted before the existing Gate 1 approval check:
const reqDir = `${featureDir}/req`, specDir = `${featureDir}/spec`
await c.activity('bridge-requirements-tech-spec', async () => {
  if (!c.exists(reqDir) && !c.exists(specDir)) return { bridged: false, reason: 'legacy (no split sources)' }
  const assembledRequirements = c.command(['run-asset', 'scripts/req-assembler.js',
    '--project', c.root, '--', reqDir]).stdout
  const assembledTechSpec = c.command(['run-asset', 'scripts/tech-spec-assembler.js',
    '--project', c.root, '--', specDir]).stdout
  c.writeOutput(file('Requirements.md'), assembledRequirements)
  c.writeOutput(file('Tech-Spec.md'), assembledTechSpec)
  return { bridged: true }
})
// Existing Gate 1 approval check (UNCHANGED): reads Approvals.md, extracts the Gate 1 row and
// Docs Digest, re-hashes file('Requirements.md')+file('Tech-Spec.md') (now just-written above, or
// the pre-existing legacy files if the bridge step no-op'd) and compares — byte-identical logic,
// byte-identical digest, since both phases hash the same deterministic assembly of the same
// unchanged split sources.

// (2) Removed entirely:
//   const rendered = await c.activity('wb-render', async () => { ... c.command(['run-asset',
//     'scripts/wb-render.js', ...]) ... })
// and its two keys in the returned gate2_payload:
//   renderer_result: rendered, renderer_failed: false,
```

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component for the full list):
a feature with real `req/`+`spec/` directories and an approved Gate 1 — assert `pm-phase2` writes
fresh `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` before its own digest check, and that
`wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js`/the semantic validator/
`gaia-generate-work-breakdown` all still receive and successfully use them, unmodified; a legacy
feature (monolithic files only, no `req/`/`spec/`) — assert the bridge step is a no-op and the
pre-existing files are used as-is, with no assembly subprocess dispatched; assert `pm-phase2`
no longer calls `wb-render.js` (mock dispatch/command spy never sees it) and
`{PREFIX}-Work-Breakdown.md`/`.csv` are not written as a side effect of a `pm-phase2` run; assert
`gate2_payload` no longer carries `renderer_result`/`renderer_failed`, and no existing assertion
elsewhere depended on those keys being present.
