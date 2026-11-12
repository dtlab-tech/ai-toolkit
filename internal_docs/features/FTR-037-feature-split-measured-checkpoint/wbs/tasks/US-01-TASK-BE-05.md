<a id="task-US-01-TASK-BE-05"></a>
### US-01-TASK-BE-05

- **Task ID:** US-01-TASK-BE-05
- **Title:** Assemble check-size threshold comparison and status precedence
- **Outcome:** check-size compares each available count with its FTR-035 configured threshold through isOverThreshold, lists strictly-over keys in over, returns unavailable (exit 1, no proposal, over still listed) when any count is unavailable, passed when nothing is over, and split-proposed otherwise.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02, US-01-TASK-BE-03, US-01-TASK-BE-04
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-05
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add check-size threshold comparison and status precedence

**Implementation notes:**

This task modifies `src/claude/scripts/feature-split.js` only. It wires the comparison and the status decision into the `checkSize` function that BE-01 scaffolded and that BE-02 to BE-04 fill with `counts` and `unavailable` entries. It does not add the measured `proposal` (that is US-01-TASK-BE-06) and does not change the measurement helpers.

Gaps the excerpt does not settle. Confirm each against the FTR-035 module before writing code:
- The excerpt says `isOverThreshold` (FTR-035 D-05) and the `loadConfig` threshold keys are called, but gives neither signature. This plan assumes `isOverThreshold(count, threshold) → boolean`, true only when `count > threshold` (strictly over, so equality passes). If the real signature differs, adapt the call; do not reimplement the comparison.
- The excerpt does not say what happens when a configured threshold is absent for a measured count. This plan fails closed: that count goes to `unavailable` with a reason, so the check never passes on a missing threshold (BR-03). No numeric default is added.

Shared state. Keep the same `COUNT_KEYS` order as in BE-02 to BE-04 (`useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`) so `over` is deterministic.

Replace the decision block at the end of `checkSize` with this logic (after the existing `measure(...)` calls):

```js
const COUNT_KEYS = ['useCases', 'acceptanceCriteria', 'components', 'estimatedPhases'];

function decide({ counts, thresholds, unavailable }) {
  // over is computed from available counts only; unavailable counts have no value to compare.
  const over = [];
  for (const key of COUNT_KEYS) {
    if (!(key in counts)) continue;                       // unavailable: not compared
    if (!(key in thresholds)) {                           // fail closed (see gap 2)
      unavailable.push({ count: key, reason: `no FTR-035 threshold configured for ${key}` });
      continue;
    }
    if (isOverThreshold(counts[key], thresholds[key])) over.push(key);   // strictly greater
  }
  // Precedence: unavailable beats everything, including over. Never a pass.
  if (unavailable.length) return { status: 'unavailable', over, unavailable };
  if (over.length === 0) return { status: 'passed', over: [], unavailable: [] };
  return { status: 'split-proposed', over, unavailable: [] };
}
```

`checkSize` then calls `decide` and passes the result to `result(status, { counts, thresholds, over, unavailable })`. `result` already sets exit code 1 only for `unavailable` (BE-01). Rules this enforces:
- `over` is listed even when status is `unavailable`, so the reader sees which counts exceeded their thresholds.
- `unavailable` never prints `proposal`. For `split-proposed`, do not add `proposal` here; US-01-TASK-BE-06 adds it. Until BE-06 lands, `split-proposed` prints no `proposal` key.
- `passed` requires `over` to be empty and `unavailable` to be empty. Because the threshold-missing case pushes into `unavailable` before the `over` check, the pass rule is never met with a missing threshold.
- Each `over` entry is a count key, not a number. Thresholds are not hard-coded.

Also use `thresholds` from the FTR-035 config read (`readThresholds`) that BE-01 already calls. Do not read the config file a second time.

Length check: this is a small, bounded change in one function. Testing of these branches belongs to US-01-TASK-TEST-03; this task only needs the module to load and the branches to behave as above.

**Verification commands:**

```
grep -q "function decide(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npm test
```