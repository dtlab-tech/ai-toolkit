# src/claude/scripts/feature-split.config.json — New

## Change

This new file is the toolkit default configuration for the feature-split foundation. It holds the four threshold values (`useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`), the three checkpoint-1 definition signals (`minActors`, `minApplications`, `minFlows`) and the scalar `minChildren`, using exactly the key names fixed in D-02. The loader in `feature-split.js` (`loadConfig`, UC-01) reads this file first, then overlays the optional project override `feature-split.config.json` at the project root (D-03). Nothing else in this file is executable: it has no code, no comments, and no logic. Its values are uncalibrated placeholders (D-02), so the loader and the tests treat them as data and never as hard-coded constants (BR-04). The file is installed with the `scripts` category by the existing installer, with no installer change (D-06). The loader's validation rules for non-integer, negative or unknown-key values (D-04) are implemented in `feature-split.js`, not here.

Open gap for the host: the Acceptance Criteria text for AC-01, AC-02 and AC-09 was not included in the excerpt I received. I have derived this design from feature.md D-02, D-03, D-04, D-05 and D-06 only. If those ACs require additional keys, value ranges or a different file location, this design must be revised.

## Data Model

```json
{
  "thresholds": {
    "useCases": 8,
    "acceptanceCriteria": 15,
    "components": 30,
    "estimatedPhases": 6
  },
  "definitionSignals": {
    "minActors": 2,
    "minApplications": 2,
    "minFlows": 3
  },
  "minChildren": 2
}
```

Key contract (fixed by D-02, used unchanged by the loader, the tests and FTR-036/FTR-037):

- `thresholds.*` are checkpoint-2 limits. A count is over its threshold only when it is strictly greater (`isOverThreshold(count, threshold)`, D-05).
- `definitionSignals.*` are checkpoint-1 minimums. Each value is the least count that raises its flag (`meetsMinimum(count, minimum)`, D-05).
- `minChildren` is the lowest number of children a proposal may keep (D-09). It is copied into each proposal (D-08).
- The file must contain exactly these keys. Any extra or missing key is a loader error under D-04, and the project override may contain any subset of them (D-03).

## Tests

Test files this component's change requires:

- `tests/scripts/feature-split.test.js` (loader cases for this file)
  - The default file parses as JSON and its top-level keys are exactly `thresholds`, `definitionSignals` and `minChildren`.
  - `thresholds` has exactly `useCases`, `acceptanceCriteria`, `components` and `estimatedPhases`. `definitionSignals` has exactly `minActors`, `minApplications` and `minFlows`.
  - Every value is a non-negative integer, and the placeholder values match D-02 (8, 15, 30, 6 / 2, 2, 3 / 2).
  - Overlay: a project override containing one subset of keys leaves the remaining keys at their toolkit default values (D-03).
  - A missing project override is not an error (D-03).
  - A missing or unreadable toolkit default stops with `FeatureSplitError` naming the file (D-04).
  - A non-integer, negative or unknown key in the override produces a `FeatureSplitError` with `code`, `key` and `file` set (D-04).
- `tests/scripts/feature-split-install.test.js` (D-06)
  - The file exists at `src/claude/scripts/feature-split.config.json`, the directory the installer copies.
  - `ai-toolkit --local <empty dir>` places the file under `.claude/scripts/` in that directory.

Gap for the host: the test cases above are derived from the feature.md decisions. The AC-to-test mapping for AC-01, AC-02 and AC-09 cannot be confirmed because those ACs were not part of the excerpt provided.