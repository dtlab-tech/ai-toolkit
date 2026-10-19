<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skeleton-call step with fileSlug collision disambiguation in pm-phase1.js
- **Outcome:** pm-phase1.js's new generateTechSpec(forceAll) dispatches gaia.agent.planner.tech-spec (no declared worker() output) only when spec/index.md is missing, stale relative to feature.md, or forceAll is set; the coordinator deterministically disambiguates any duplicate fileSlug across the skeleton's Components table (prepending path segments until unique) before writing spec/index.md via c.writeOutput
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton-call step with fileSlug disambiguation to pm-phase1.js

**Implementation notes:**

Add, below the existing `reqDir`/`reqIndexPath` constants and helper functions (current lines
39-76), the Tech-Spec equivalents:

```js
const specDir = `${featureDir}/spec`
const specIndexPath = `${specDir}/index.md`

// Deterministic, host-computed — never asks the model to pick unique names. Operates per-LINE,
// not via a global string .replace() over the whole document — a real bug, found by testing two
// colliding entries directly: when both rows share byte-identical Spec text (the whole point of
// a collision), a global .replace() always rewrites the FIRST occurrence, never the specific
// (second, third, ...) row actually being disambiguated.
function disambiguateFileSlugs(skeletonText) {
  const lines = skeletonText.split('\n')
  const seenSlugs = new Set()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim()).filter((_, idx, a) => idx > 0 && idx < a.length - 1)
    if (cells.length < 5) continue
    const filePath = cells[0]
    const m = cells[4].match(/\(components\/([^)]+)\)/)
    if (!m) continue // header/separator row, or a row with no valid Spec link yet
    let slug = m[1]
    if (seenSlugs.has(slug)) {
      const segments = filePath.split('/')
      let depth = 1
      let candidate = slug
      while (seenSlugs.has(candidate)) {
        depth += 1
        candidate = segments.slice(-depth).join('-') + '.md'
      }
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      lines[i] = line.replace(new RegExp(`components/${escaped}`, 'g'), `components/${candidate}`)
      slug = candidate
    }
    seenSlugs.add(slug)
  }
  return lines.join('\n')
}
```

Then, mirroring `generateRequirements`'s exact structure (current lines 86-100):

```js
async function generateTechSpec(forceAll) {
  const skeletonStale = c.exists(specIndexPath) && !fresh(specIndexPath)
  const regenSkeleton = forceAll || skeletonStale || !c.exists(specIndexPath)

  if (regenSkeleton) {
    const skeleton = await c.worker(specId, featurePath)
    c.writeOutput(specIndexPath, disambiguateFileSlugs(skeleton))
  }

  // ... structural pre-check (US-04-TASK-BE-02), per-component loop (BE-03), assembly (BE-04) ...
}
```

`disambiguateFileSlugs`'s exact collision-walk implementation (how many path segments to
prepend, and in what literal format) is this task's own design judgment within the bounds Tech-Spec
§2/OQ-3 already fixed (deterministic, host-side, right-to-left) — the pseudocode above is
illustrative of the approach, not a literal final diff; adjust it once `parseComponentsTable`'s
real return shape (from `US-05-TASK-BE-01`) is available to call against.

`generateTechSpec` is not yet called from anywhere in this task — wiring it into the existing
call sites is `US-04-TASK-BE-04`'s job, once the whole function body exists. The old `techSpec`
binding (current line 37) stays in place, unused by this task's own changes, until BE-04 removes
it.

Note on the empty **Acceptance criteria** field above: `AC-01` is scoped (via its `Related UC` →
`UC-01` → `US-01`) to phase `US-01` alone, so `wb-validate.js` check 20 rejects it if cited by a
task in phase `US-04` — this task's own phase, per its `sourceUC`, realizes mechanics from
`UC-01`/`UC-02`/`UC-03`/`UC-04` all at once, but `wb-graph-checks.js`'s scope check has no
awareness of a phase's `sourceUC` array, only the AC table's single `Related UC` column. This is
the exact, already-documented tension `internal_docs/ideas/work-breakdown-phase-scope-discipline.md`
flags and explicitly defers — not something to solve in this task. Mirrors FTR-020's own real
`US-04` phase, whose every task also has an empty `acceptanceCriteria` list for the same reason.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
