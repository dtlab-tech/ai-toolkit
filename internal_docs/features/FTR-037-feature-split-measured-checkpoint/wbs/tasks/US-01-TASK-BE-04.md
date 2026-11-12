<a id="task-US-01-TASK-BE-04"></a>
### US-01-TASK-BE-04

- **Task ID:** US-01-TASK-BE-04
- **Title:** Compute estimated phases from Section 11 build order depth levels
- **Outcome:** check-size parses the Section 11 build order in spec/index.md using the 'N. text — depends on:' format, computes depth levels as greatest depth plus one for estimatedPhases, and marks the count unavailable with a reason on a dangling dependency, a cycle, or an item without a depends on clause.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** compute estimated phases from build order depth in check-size

**Implementation notes:**

This adds the `estimatedPhases` count to the `check-size` command in `src/claude/scripts/feature-split.js`. It is a read-only, deterministic measurement with no LLM call. It depends on the scaffold from BE-01 (command dispatch, `result()` printer, top-level catch). It must not change the `useCases`, `acceptanceCriteria` or `components` measurements from BE-02 and BE-03.

Gap to resolve before or during coding: the excerpt says the build order is in Tech-Spec Section 11 inside `spec/index.md` (T-1), but it does not give the exact Section 11 heading text. The locator below is provisional. Confirm it against a real `spec/index.md` and adjust the regex if needed. If no heading matches, the count becomes unavailable (never a pass), which is the D-04 behaviour.

1. Add the item pattern (FTR-037 D-02 format `N. text — depends on: none` or `N. text — depends on: 1, 2`). The em dash must match exactly:

```js
const ITEM = /^(\d+)\.\s+(.+?)\s+—\s+depends on:\s*(none|\d+(?:\s*,\s*\d+)*)\s*$/;
```

2. Add a section reader (provisional locator; the section runs to the next heading of the same or higher level):

```js
function readSection11(featureDir) {
  const lines = readFileSync(join(featureDir, 'spec/index.md'), 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => /^#{1,6}\s+11[.\s]/.test(l)); // provisional locator
  if (start < 0) throw new Error('Section 11 build order not found in spec/index.md');
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s/);
    if (h && h[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).map(l => l.trim());
}
```

3. Add the parser. A numbered line without a valid `depends on:` clause is a hard error, so the count is unavailable:

```js
function parseBuildOrder(lines) {
  const items = new Map();
  for (const line of lines.filter(l => /^\d+\./.test(l))) {
    const m = ITEM.exec(line);
    if (!m) throw new Error(`build-order item has no valid "depends on:" clause: ${line}`);
    const deps = m[3] === 'none' ? [] : m[3].split(',').map(s => Number(s.trim()));
    items.set(Number(m[1]), deps);
  }
  if (items.size === 0) throw new Error('Section 11 build order is empty');
  return items;
}
```

4. Add the depth computation. Depth is the longest dependency chain, so an item with no dependencies is depth 0. Dangling references and cycles throw with a reason:

```js
function depths(items) {
  const memo = new Map(), visiting = new Set();
  const depth = n => {
    if (memo.has(n)) return memo.get(n);
    if (!items.has(n)) throw new Error(`dangling dependency on build-order item ${n}`);
    if (visiting.has(n)) throw new Error(`cycle through build-order item ${n}`);
    visiting.add(n);
    const deps = items.get(n);
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depth));
    visiting.delete(n);
    memo.set(n, d);
    return d;
  };
  for (const n of items.keys()) depth(n);
  return memo;
}
```

5. Wire the measurement into `checkSize`. If BE-01 left a placeholder for `estimatedPhases`, replace it. Otherwise add this call after the `components` measure. The levels count is greatest depth plus one (D-02), so a single item gives 1, a chain of three gives 3, and a diamond gives 3:

```js
measure('estimatedPhases', () => {
  const items = parseBuildOrder(readSection11(featureDir));
  return Math.max(...depths(items).values()) + 1;
});
```

Behaviour to confirm after coding:
- `measure()` catches the thrown message and records `{ count: 'estimatedPhases', reason }` in `unavailable`. The status becomes `unavailable` with exit 1, and no proposal is produced.
- `estimatedPhases` is included in `COUNT_KEYS` for the `over` comparison only when it is measured.
- The file does not import or call any LLM client (NFR-01).

Do not implement the depth-0 foundation mapping or child grouping here. Those are open gaps 1 and 2 in the Tech-Spec and belong to the proposal tasks.

**Verification commands:**

```
grep -q "function readSection11(" src/claude/scripts/feature-split.js && grep -q "function parseBuildOrder(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npm test
```