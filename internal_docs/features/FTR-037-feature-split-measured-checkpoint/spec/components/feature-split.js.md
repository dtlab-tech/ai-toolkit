# src/claude/scripts/feature-split.js — Modified

Domain: BE
Addresses: AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08, AC-09, AC-10, AC-13, AC-14, AC-15, AC-16, AC-18

## Change

This adds one command, `check-size`, to the existing `feature-split.js` facade from FTR-035. The FTR-035 surface is called, not changed: configuration reads (threshold keys), the new-feature test (FTR-035 D-07), `isOverThreshold` (D-05), the proposal shape (D-08), `apply`, and the registry. The new command measures the four counts from the feature folder (FTR-037 D-01 and D-02), compares each with its threshold, and prints `{ status, counts, thresholds, over, unavailable, proposal }` as one JSON object (D-05). It exits 1 when `status` is `"unavailable"` and 0 otherwise. Measurement is deterministic and makes no LLM calls (NFR-01). Thresholds come from the FTR-035 configuration keys (`useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`), and no numeric value is hardcoded here. Counts are the single component table in `spec/index.md` (D-01), not the union of the New and Modified subtables. Tech-Spec T-2 uses the subtable union, so the Tech-Spec must be aligned to D-01. The build order is read from Tech-Spec Section 11 (D-01, D-02). Tech-Spec T-1 places it in `spec/index.md`, and Requirements BR-06 must record that location.

Each child's `keywords` is emitted as an empty array by `check-size`. The implement-feature main loop fills it in from the child's title, use cases and components (D-09) before presenting the proposal. The proposal the user sees is therefore the object `check-size` printed, with Keywords filled in. Keyword derivation is not part of the deterministic measurement.

**Open gaps (not decided by feature.md; the design does not invent them):**

1. **Depth-0 component mapping (D-07, BR-10, AC-14).** feature.md does not define how a component maps to a build-order item, so the depth-0 component set cannot be computed. Until the mapping is defined, `buildProposal` throws `Unavailable("depth-0 mapping not defined (open gap 1)")`. An over-threshold feature then stops as `unavailable` and never silently passes (BR-03).
2. **Child grouping (D-08, BR-11, AC-10, AC-15).** feature.md does not define which use cases and components go to which child. `groupChildren` throws `Unavailable("child grouping rule not defined (open gap 2)")` until the rule is defined. The same stop applies.
3. **Component table locator.** The heading or header row that identifies the single component table in `spec/index.md` is not specified. The design requires exactly one such table and reports `components` as unavailable if it is missing or empty.

## Algorithm

```js
const COUNT_KEYS = ['useCases', 'acceptanceCriteria', 'components', 'estimatedPhases']; // FTR-035 D-02 key names
const ITEM = /^(\d+)\.\s+(.+?)\s+—\s+depends on:\s*(none|\d+(?:\s*,\s*\d+)*)\s*$/; // FTR-037 D-02

function checkSize({ featureDir, prefix }) {
  if (!isNewFeature(featureDir, prefix)) return result('skipped');       // FTR-035 D-07

  const thresholds = readThresholds();                                    // FTR-035 config keys
  const counts = {}, unavailable = [];
  const measure = (key, fn) => {
    try { counts[key] = fn(); }
    catch (err) { unavailable.push({ count: key, reason: err.message }); } // D-04: never a pass
  };

  measure('useCases', () => countDistinct(
    globMd(join(featureDir, 'req/use-cases')), /\bUC-\d+\b/g, 'req/use-cases/*.md'));
  measure('acceptanceCriteria', () => countDistinct(
    [join(featureDir, 'req/index.md')], /\bAC-\d+\b/g, 'req/index.md'));
  measure('components', () => countComponentRows(join(featureDir, 'spec/index.md')));
  measure('estimatedPhases', () => {
    const items = parseBuildOrder(readSection11(featureDir));
    return Math.max(...depths(items).values()) + 1;                      // levels = max depth + 1
  });

  // countDistinct throws when the source is missing or has no matches (D-04).
  // countComponentRows counts data rows only, excluding the header and separator rows.

  const over = COUNT_KEYS.filter(k => k in counts && isOverThreshold(counts[k], thresholds[k])); // D-03
  if (unavailable.length) return result('unavailable', { counts, thresholds, over, unavailable }); // BR-03, exit 1
  if (over.length === 0) return result('passed', { counts, thresholds });
  return result('split-proposed', { counts, thresholds, over, proposal: buildProposal({ featureDir, counts, over }) });
}

function parseBuildOrder(lines) {
  const items = new Map();
  for (const line of lines.filter(l => /^\d+\./.test(l.trim()))) {
    const m = ITEM.exec(line.trim());
    if (!m) throw new Error(`build-order item has no valid "depends on:" clause: ${line.trim()}`);
    const deps = m[3] === 'none' ? [] : m[3].split(',').map(s => Number(s.trim()));
    items.set(Number(m[1]), deps);
  }
  if (items.size === 0) throw new Error('Section 11 build order is empty');
  return items;
}

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

function buildProposal({ featureDir, counts, over }) {
  const children = groupChildren({ featureDir, counts });                 // open gap 2: throws until defined
  const depth0 = depth0Components({ featureDir });                        // open gap 1: throws until defined
  const foundationChild = depth0.length
    ? children.find(c => c.components.some(p => depth0.includes(p)))?.id ?? null
    : null;                                                               // D-07: first child holding depth-0
  return {
    source: 'measured',                                                   // FTR-035 D-08 shape otherwise unchanged
    overCounts: over,
    children: children.map(c => ({ ...c, keywords: [] })),                // D-09: filled by main loop
    foundation: foundationChild,
    foundationNote: foundationChild ? undefined : 'no distinct depth-0 level; no shared foundation assigned'
  };
}
```

`result(status, extra)` returns `{ status, counts: {}, thresholds: {}, over: [], unavailable: [], ...extra }`, prints it as the only stdout content, and sets the exit code. Failures in the command itself are caught at the top level and reported as `status: "unavailable"` with the error message, so the hook never receives non-JSON output (BR-04).

## Tests

Test file: `tests/scripts/feature-split-check-size.test.js` (the index already lists it). Fixtures are small feature folders built in a temp directory.

- **Skipped:** a folder that is not new returns `status: "skipped"` with no counts and exit 0.
- **Use cases:** `UC-NN` IDs repeated across several `req/use-cases/*.md` files are counted once each.
- **Acceptance criteria:** distinct `AC-NN` IDs in `req/index.md` are counted, with repeats removed.
- **Components:** only data rows of the component table are counted. The header and separator rows are excluded, and a second table is not added.
- **Phases:** the build order with `depends on: none` and chained dependencies gives the expected number of levels, and the formula is `max depth + 1`.
- **Threshold boundary:** a count equal to its threshold passes. A count one above it is over.
- **Unavailable:** a missing `req/use-cases/` directory, an empty `req/index.md`, or a missing component table each marks only that count unavailable. The status is `unavailable` and the exit code is 1, even when the other counts are measured.
- **Build-order errors:** an item without a `depends on:` clause, a dangling dependency, and a cycle each make `estimatedPhases` unavailable with the matching reason.
- **Precedence:** when one count is unavailable and another is over, the status is `unavailable` and no `proposal` is printed (BR-03).
- **Gaps:** while open gaps 1 and 2 are unresolved, an over-threshold feature returns `unavailable` with the gap reason and never `passed`. This test is removed when the gaps are closed.
- **Proposal shape:** `proposal` is present only for `split-proposed`, has `source: "measured"`, and every child has `keywords: []`.
- **No LLM:** static check that the module does not import or call any LLM client.
- **Output:** stdout contains exactly one JSON object.