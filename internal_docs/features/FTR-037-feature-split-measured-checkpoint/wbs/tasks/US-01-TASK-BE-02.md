<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Measure distinct use case and acceptance criteria counts in check-size
- **Outcome:** check-size computes the useCases count as distinct UC-NN identifiers across req/use-cases/*.md and the acceptanceCriteria count as distinct AC-NN identifiers in req/index.md, and marks a count unavailable with a reason when its source is missing or has no matches.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** measure use case and acceptance criteria counts in check-size

**Implementation notes:**

This task modifies `src/claude/scripts/feature-split.js`, which BE-01 creates or extends with the `check-size` command scaffold. The Tech-Spec excerpt does not give current line numbers for that file, and I did not open it. The implementer should locate the `check-size` handler that BE-01 added, not a line range. Only the two counts below belong to this task. Do not implement `components` (BE-03) or `estimatedPhases` (BE-04) here.

1. **Measurement wrapper.** If BE-01 did not already add it, add the `measure` helper from the Tech-Spec algorithm. Failures go to `unavailable` and never to a pass. The `counts` object is keyed by the FTR-035 D-02 names (`useCases`, `acceptanceCriteria`).

```js
const counts = {}, unavailable = [];
const measure = (key, fn) => {
  try { counts[key] = fn(); }
  catch (err) { unavailable.push({ count: key, reason: err.message }); }
};
```

2. **Helpers.** Add these functions near the other measurement helpers.

```js
function globMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => join(dir, f));
}

function countDistinct(files, re, label) {
  if (files.length === 0) throw new Error(`${label}: no source files found`);
  const seen = new Set();
  for (const f of files) {
    if (!existsSync(f)) throw new Error(`${label}: missing file ${basename(f)}`);
    for (const m of readFileSync(f, 'utf8').matchAll(re)) seen.add(m[0]);
  }
  if (seen.size === 0) throw new Error(`${label}: no identifiers matched`);
  return seen.size;
}
```

`readFileSync` errors on an unreadable file are caught by `measure` and reported as the reason. Read with `'utf8'`, and keep the `g` flag on the regex, because `matchAll` requires it.

3. **Wire the two counts** inside the `checkSize` flow, after the new-feature test and before the threshold comparison:

```js
measure('useCases', () => countDistinct(
  globMd(join(featureDir, 'req', 'use-cases')), /\bUC-\d+\b/g, 'req/use-cases/*.md'));
measure('acceptanceCriteria', () => countDistinct(
  [join(featureDir, 'req', 'index.md')], /\bAC-\d+\b/g, 'req/index.md'));
```

Behaviour this produces:
- A UC listed in two files is counted once, because the identifiers go into one `Set`.
- Text that is not a `UC-NN` / `AC-NN` ID is ignored by the regex.
- A missing `req/use-cases/` directory gives zero files, so `countDistinct` throws and `useCases` is unavailable with reason `req/use-cases/*.md: no source files found`.
- A missing `req/index.md`, or one with no AC IDs, marks `acceptanceCriteria` unavailable with a reason.

4. **Threshold keys.** The `over` computation already uses `k in counts`, so an unmeasured key is skipped. Do not change the precedence logic. That belongs to BE-05.

5. **Config location.** The fixture in TEST-01 assumes `feature-split.config.json` at the project root with a `thresholds` object. This placement is a placeholder. Confirm it against FTR-035 before relying on the smoke command below. If the config path differs, use the FTR-035 path in the smoke command.

**Verification commands:**

```
grep -q "function globMd(" src/claude/scripts/feature-split.js && grep -q "function countDistinct(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
ROOT="$PWD/.verify-check-size"; F="$ROOT/internal_docs/features/FTR-900-fixture"; mkdir -p "$F/req/use-cases" && printf '{"thresholds":{"useCases":10,"acceptanceCriteria":10,"components":10,"estimatedPhases":10}}' > "$ROOT/feature-split.config.json" && printf 'UC-01 UC-02\n' > "$F/req/use-cases/a.md" && printf 'UC-02\n' > "$F/req/use-cases/b.md" && printf 'AC-01 AC-01 AC-02\n' > "$F/req/index.md" && node src/claude/scripts/feature-split.js --project "$ROOT" check-size --feature-dir "$F" --prefix FTR-900 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);if(o.counts.useCases!==2||o.counts.acceptanceCriteria!==2){console.error(JSON.stringify(o));process.exit(1)}})"; rm -rf "$ROOT"
```

```
npm test
```