<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Add isOverThreshold and meetsMinimum comparison functions
- **Outcome:** feature-split.js exports isOverThreshold(count, threshold), which is true only when count is strictly greater, and meetsMinimum(count, minimum), which is true when count is equal to or greater than the minimum.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 6
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add threshold comparison functions

**Implementation notes:**

This task modifies an existing file. It does not create one. `src/claude/scripts/feature-split.js` is created by INFRA-TASK-BE-01 (with `'use strict'`, `FeatureSplitError`, and a `module.exports` object). US-01-TASK-BE-01 and US-01-TASK-BE-02 may already have added config helpers and `loadConfig` to the same file. Do not remove or reorder anything already there.

The design (D-05) gives two named comparison rules, which every caller must use. Add them as module-level constants in the UC-01 section, after `loadConfig` and before the UC-02 `isNewFeature` block:

```javascript
// D-05: two named comparison rules, used by every caller
const isOverThreshold = (count, threshold) => count > threshold;   // checkpoint 2: strictly greater
const meetsMinimum = (count, minimum) => count >= minimum;         // checkpoint 1: at least N
```

Then add both names to the existing `module.exports` object. Keep the names already exported, and do not add anything else in this task:

```javascript
module.exports = {
  FeatureSplitError, loadConfig, isOverThreshold, meetsMinimum, /* ...existing exports... */
};
```

The Tech-Spec excerpt does not say how non-numeric or `NaN` inputs should behave. This task therefore adds no input validation. It implements only the plain `>` and `>=` comparisons. If validation is needed, that is a separate decision for the host.

The boundary behavior is the point of this task. `isOverThreshold(30, 30)` is `false`, and `isOverThreshold(31, 30)` is `true`. `meetsMinimum(2, 2)` is `true`, and `meetsMinimum(1, 2)` is `false`. The boundary cases are tested by the sibling test task US-01-TASK-TEST-02, so this task only needs to produce the functions and exports.

Duplicate-implementation check: no sibling BE task builds these comparisons. INFRA-TASK-BE-03 is the slug rule, and US-01-TASK-BE-02 is `loadConfig`. US-01-TASK-TEST-02 is the TEST task that exercises this behavior, which is expected.

**Verification commands:**

```
node -e "const m=require('./src/claude/scripts/feature-split.js');if(m.isOverThreshold(30,30)!==false||m.isOverThreshold(31,30)!==true)process.exit(1);if(m.meetsMinimum(2,2)!==true||m.meetsMinimum(1,2)!==false)process.exit(1);"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```