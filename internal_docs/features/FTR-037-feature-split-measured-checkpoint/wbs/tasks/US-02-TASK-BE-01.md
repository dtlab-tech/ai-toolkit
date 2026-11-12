<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Compute child count and use-case blocks for the measured proposal
- **Outcome:** feature-split.js has a groupChildren step that derives the child count N from the over-threshold useCases, acceptanceCriteria and components counts, floored at minChildren and capped at the number of distinct use cases. It splits the numerically sorted use cases into N contiguous blocks, giving the first U mod N blocks one extra use case. When U is below minChildren it throws an unavailable reason, so check-size reports unavailable.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-06
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add deterministic use-case block grouping to check-size proposal

**Implementation notes:**

Scope: modify only `src/claude/scripts/feature-split.js`. Replace the stub `groupChildren({ featureDir, counts })` (currently `throw Unavailable("child grouping rule not defined (open gap 2)")`) with the block logic below. Keep its name and call site in `buildProposal`. BE-02 fills each child's `components` and other fields, so this task returns `components: []` as a placeholder.

**Formula (Tech-Spec T-6 step 2; recorded in the Requirements as BR-10 and BR-11 by Gate 1 decision 1):** `N = max(minChildren, ceil(count / threshold))` taken over the over-threshold counts among `useCases`, `acceptanceCriteria` and `components` (the maximum of their ratios); `estimatedPhases` does not change N. Then `N = min(N, U)`, where U is the number of distinct use cases. If U < minChildren no split can be formed and the result is `unavailable`. Use exactly this expression in `childCount()`; do not choose another.

Sharing the source rule: refactor `countDistinct` so it calls a new `listDistinct` helper. This keeps the regex and the missing-source/no-match rule in one place.

```js
// Returns sorted distinct IDs; throws when the source is missing or has no matches (same rule as countDistinct).
function listDistinct(files, re, source) {
  const ids = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) ids.add(m[0]);
  if (ids.size === 0) throw new Error(`no matches in ${source}`);
  return [...ids].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));  // numeric, so UC-10 follows UC-09
}

// countDistinct(files, re, source) becomes: listDistinct(files, re, source).length

function childCount({ useCases, acceptanceCriteria, components, thresholds, minChildren }) {
  // T-6 step 2: only the counts over their threshold contribute a ratio
  const ratios = [['useCases', useCases], ['acceptanceCriteria', acceptanceCriteria], ['components', components]]
    .filter(([key, count]) => count > thresholds[key])
    .map(([key, count]) => Math.ceil(count / thresholds[key]));
  return Math.min(Math.max(minChildren, ...ratios), useCases);   // floor at minChildren, then cap at U
}

// Pure helper: N contiguous blocks; the first (U mod N) blocks get one extra item.
function splitBlocks(items, N) {
  const base = Math.floor(items.length / N), extra = items.length % N;
  const blocks = []; let pos = 0;
  for (let k = 0; k < N; k++) {
    const size = base + (k < extra ? 1 : 0);
    blocks.push(items.slice(pos, pos + size));
    pos += size;
  }
  return blocks;
}

function groupChildren({ featureDir, counts, thresholds, minChildren }) {   // thresholds: the loaded config thresholds, passed by the caller (BE-06)
  const ucs = listDistinct(globMd(join(featureDir, 'req/use-cases')), /\bUC-\d+\b/g, 'req/use-cases/*.md');
  const U = ucs.length;
  if (U < minChildren) throw new Unavailable(`fewer use cases (${U}) than minChildren (${minChildren})`);
  const N = childCount({ useCases: U, acceptanceCriteria: counts.acceptanceCriteria,
                         components: counts.components, thresholds, minChildren });
  return splitBlocks(ucs, N).map((blockUcs, k) => ({
    id: `part-${k + 1}`,
    useCases: blockUcs,
    components: []          // filled by US-02-TASK-BE-02
  }));
}
```

Notes:
- `minChildren` comes from the FTR-035 configuration reader. The excerpt does not give its key name, so use the same accessor that `readThresholds` uses and pass it in.
- A throw from `groupChildren` is not caught by `measure`. It reaches the top-level catch in `checkSize`, which reports `status: "unavailable"` with the error message. That is the intended path for BR-03.
- Worked example: U = 7, N = 3 gives sizes 3, 2, 2 (base 2, extra 1, so block 1 gets the extra item).
- Export `splitBlocks` from the module (add it to `module.exports`) so the test can call it directly.

**Verification commands:**

```
grep -q "function groupChildren(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npx jest tests/scripts/feature-split-check-size.test.js
```

```
npm test
```