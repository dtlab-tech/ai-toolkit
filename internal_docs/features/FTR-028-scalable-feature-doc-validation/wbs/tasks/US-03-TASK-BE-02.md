<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Add fileSlug validation, dedup/batching, and drill-down dispatch to the validation cycle
- **Outcome:** pm-phase1.js gains prepareDrillDownBatches/buildDrillDownPrompt/DRILL_DOWN_BATCH_SIZE; needsComponentDetail entries are validated against spec/index.md's own component table, deduplicated by fileSlug, batched at K=8, and dispatched one gaia-validate-tech-spec-component-detail call per batch; the merge logic from US-02 is extended to also fold in drill-down and bad-fileSlug findings
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-03-TASK-BE-01
- **Acceptance criteria:** AC-07, AC-08, AC-09, AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 28
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The batching/dedup/validation logic and the dispatch loop that consumes it are one indivisible unit — batching with nothing to dispatch to, or dispatch without validated/batched input, are each meaningless alone.
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** dispatch batched component-detail drill-down calls and fold their findings into the merge

**Implementation notes:**

In `src/claude/workflows/pm-phase1.js`, add near `computeAcComponentTraceabilityGaps` (from
US-02-TASK-BE-01):

```js
// UC-03: validates each needsComponentDetail entry's fileSlug against the real component table
// (BR-05 — a hallucinated/mistyped reference is dropped and reported, never dispatched),
// deduplicates by fileSlug (BR-06, two claims against the same file collapse into one batch
// slot), and splits the remaining unique components into groups of at most DRILL_DOWN_BATCH_SIZE.
const DRILL_DOWN_BATCH_SIZE = 8 // Open Question 4: fixed constant, not externally configurable
function prepareDrillDownBatches(needsComponentDetail, specIndexContent) {
  const validSlugs = new Set(parseComponentsTable(specIndexContent).map(c => c.fileSlug))
  const extraFindings = []
  const claimsByFileSlug = new Map()
  for (const entry of needsComponentDetail || []) {
    if (!validSlugs.has(entry.fileSlug)) {
      extraFindings.push(`Tech-Spec: component-detail check referenced a non-existent file "${entry.fileSlug}" for claim "${entry.claim}"`)
      continue
    }
    if (!claimsByFileSlug.has(entry.fileSlug)) claimsByFileSlug.set(entry.fileSlug, [])
    claimsByFileSlug.get(entry.fileSlug).push(entry.claim)
  }
  const fileSlugs = [...claimsByFileSlug.keys()]
  const batches = []
  for (let i = 0; i < fileSlugs.length; i += DRILL_DOWN_BATCH_SIZE) {
    batches.push(fileSlugs.slice(i, i + DRILL_DOWN_BATCH_SIZE)
      .map(slug => ({ fileSlug: slug, claims: claimsByFileSlug.get(slug) })))
  }
  return { batches, extraFindings }
}

// specDir is already absolute (derived from c.feature()'s realpath-resolved featureDir), so this
// needs no extra path.resolve — same reasoning that already lets featurePath be handed to agents
// directly elsewhere in this file.
function buildDrillDownPrompt(batch) {
  return batch.map(({ fileSlug, claims }) =>
    claims.map(claim => `Claim: ${claim}\nComponent file: ${specDir}/components/${fileSlug}`).join('\n\n')
  ).join('\n\n')
}

const drillDownId = 'gaia.agent.planner.validate-tech-spec-component-detail'
```

Then, inside the validation cycle (after the `c.worker(valId, ...)` call, before
US-02-TASK-BE-01's `const structuralFindings = ...` line), add the batch dispatch, and extend
US-02's `newFindings` array:

```js
const { batches, extraFindings } = prepareDrillDownBatches(result.needsComponentDetail, specIndexContent)
const drillDownFindings = []
for (let b = 0; b < batches.length; b++) {
  const batchResult = await c.worker(drillDownId, buildDrillDownPrompt(batches[b]),
    { label: `validation:${cycle}:component-detail:${b + 1}`,
      schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'string' } } }, required: ['findings'] } })
  drillDownFindings.push(...batchResult.findings)
}

// extends US-02-TASK-BE-01's own newFindings line from `[...structuralFindings]` to:
const newFindings = [...structuralFindings, ...extraFindings, ...drillDownFindings]
```

Everything after `newFindings` (the merge, contradiction guard, report write, cycle-continue
logic) is already in place from US-02-TASK-BE-01 and needs no further change — it already operates
generically on `newFindings`, regardless of how many sources contributed to it.

**Verification commands:**

```
npm test
```
