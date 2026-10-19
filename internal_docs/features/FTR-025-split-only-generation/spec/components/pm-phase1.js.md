# src/claude/workflows/pm-phase1.js — Modified

## Change

Three changes, all inside `generateRequirements()`/`generateTechSpec()` and the top-level
orchestration that calls them. (1) The final `c.writeOutput(file('Requirements'/'Tech-Spec'),
assembled...)` line is removed from both functions — they return without ever touching the
monolithic path. (2) The top-level regen-freshness gates, the truncation check, and
`tech-spec-ac-check`'s Requirements argument are repointed from the assembled file to the split
index file. (3) A new top-level step computes `assembledRequirements`/`assembledTechSpec` via the
same two subprocess calls (unconditionally, every run — cheap and deterministic, no LLM cost) and
uses them only in-memory, for the validator's prompt and `docsDigest`.

## Service Interface

```js
// (1) Inside generateRequirements()/generateTechSpec() — DELETE the final write:
//   const assembled = c.command([...]).stdout
//   c.writeOutput(file('Requirements'), assembled)   <-- removed, no replacement inside this fn
// generateTechSpec() loses its analogous c.writeOutput(file('Tech-Spec'), assembledSpec) the same way.

// (2) Top-level gates — BEFORE:
if (force || !fresh(file('Requirements')) || missingSections(c.read(file('Requirements')), 9).length) {
  await generateRequirements(force)
  if (!c.exists(file('Requirements'))) throw new Error('Requirements output missing')
  assertCompleteSections('Requirements', c.read(file('Requirements')), 9)
  changed = true
}
// AFTER:
if (force || !fresh(reqIndexPath) || missingSections(c.read(reqIndexPath), 9).length) {
  await generateRequirements(force)
  if (!c.exists(reqIndexPath)) throw new Error('Requirements output missing')
  assertCompleteSections('Requirements', c.read(reqIndexPath), 9)
  changed = true
}
// Tech-Spec's analogous gate: fresh(specIndexPath, [featurePath, reqIndexPath]) replaces
// fresh(file('Tech-Spec'), [featurePath, file('Requirements')]); same assertCompleteSections
// swap, reading specIndexPath instead of file('Tech-Spec').

// tech-spec-ac-check's second arg (currently file('Requirements')) becomes reqIndexPath —
// wb-graph-checks.js's parseAcTable needs no change, the AC table already lives in the index.

// (3) New top-level assembly (always runs, never written to disk):
function assembleRequirements() {
  return c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
}
function assembleTechSpec() {
  return c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
}
let assembledRequirements = assembleRequirements()
let assembledTechSpec = assembleTechSpec()

// Validator dispatch — BEFORE: prompt is just featurePath + instructions (agent reads the two
// files itself, by convention). AFTER:
const result = await c.worker(valId,
  `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\n` +
  'Validate only; the host owns the revision loop. Return valid, a findings array ' +
  '(one string per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least ' +
  'one finding implicates that document), and the full validation report content. Do not ' +
  'dispatch other agents.',
  { label: `validation:${cycle}`,
    outputs: [output('Validation-Report', [featurePath, reqIndexPath, specIndexPath])],
    schema: { /* unchanged */ } })

// After a fix cycle, re-assemble whichever document was regenerated, before the next cycle's prompt:
if (result.needsRequirementsFix) { await generateRequirements(true); assembledRequirements = assembleRequirements() }
if (result.needsTechSpecFix) { await generateTechSpec(true); assembledTechSpec = assembleTechSpec() }

// docsDigest — BEFORE: c.hash(c.read(file('Requirements')) + '\u0000' + c.read(file('Tech-Spec')))
// AFTER (same meaning, no file read):
const docsDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)

// Returned result paths — BEFORE: requirements.path = file('Requirements'), tech_spec.path = file('Tech-Spec')
// AFTER: point at the real, always-on-disk split index files:
return {
  // ...
  requirements: { path: reqIndexPath, summary: 'Requirements ready (split; req/index.md + req/use-cases/*.md)' },
  tech_spec: { path: specIndexPath, summary: 'Tech-Spec ready (split; spec/index.md + spec/components/*.md)' },
  // ... validation, docs_digest unchanged in shape
}
```

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component for the full list):
assert no `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file exists on disk after a clean
`pm-phase1` run; assert the regen-freshness/truncation/AC-check gates react to `req/index.md`/
`spec/index.md` mtime and content, not an assembled file that no longer exists; assert the
validator's received prompt contains the inlined Requirements/Tech-Spec text (mock dispatch
inspects `options.prompt`); assert `docs_digest` is unchanged in format
(`/^sha256:[a-f0-9]{64}$/`) and still deterministic/content-sensitive over the split sources; assert
a `needsRequirementsFix`/`needsTechSpecFix` cycle re-assembles before the next validator dispatch
(the second dispatch's inlined text reflects the regenerated content, not the stale first-pass
text).
