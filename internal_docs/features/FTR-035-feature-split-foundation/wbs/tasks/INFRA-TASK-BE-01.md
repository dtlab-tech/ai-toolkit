# Task detail: INFRA-TASK-BE-01

<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Create feature-split.js skeleton with FeatureSplitError class
- **Outcome:** src/claude/scripts/feature-split.js exists with 'use strict', a FeatureSplitError class exposing code, key (nullable) and file (nullable) and an exports object that includes FeatureSplitError.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split.js skeleton and FeatureSplitError

**Implementation notes:**

This task creates one new file, `src/claude/scripts/feature-split.js`. It has no existing code to relocate or modify. If the file already exists, stop and report it instead of overwriting it.

The Tech-Spec excerpt for this task is the full Components table. The component design file `components/feature-split.js.md` is not in the excerpt, so the constructor signature below is a choice made here. It follows the feature-level facts: error codes are strings from the interface contract (Section 2.3), and `key` and `file` are nullable (Flow A: `CONFIG_INVALID` sets `key` to null and `file` to the override path).

The file must have no side effects on `require`. It defines no `main`, reads no `process.argv`, and writes nothing. The facade and the other helpers are added by later tasks (BE-02 to BE-07).

Shape of the file:

```javascript
'use strict';

class FeatureSplitError extends Error {
  /**
   * @param {string} code     Error code from the FTR-035 interface contract, e.g. 'CONFIG_INVALID'.
   * @param {string} message  Human-readable message.
   * @param {{key?: string|null, file?: string|null}} [details]
   */
  constructor(code, message, { key = null, file = null } = {}) {
    super(message);
    this.name = 'FeatureSplitError';
    this.code = code;
    this.key = key;
    this.file = file;
  }
}

module.exports = {
  FeatureSplitError,
};
```

Checks for this task:
- `key` and `file` default to `null` when omitted, so `new FeatureSplitError('X', 'msg')` yields `key === null` and `file === null`.
- `instanceof Error` holds, so the facade can catch it.
- `module.exports` contains `FeatureSplitError`. Later tasks add their exports to this same object.

**Verification commands:**

```
test -f src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
grep -q "'use strict';" src/claude/scripts/feature-split.js
```

```
node -e "const { FeatureSplitError: E } = require('./src/claude/scripts/feature-split.js'); const e = new E('CONFIG_INVALID', 'bad', { key: 'thresholds.useCases', file: 'feature-split.config.json' }); if (!(e instanceof Error) || e.code !== 'CONFIG_INVALID' || e.key !== 'thresholds.useCases' || e.file !== 'feature-split.config.json' || e.message !== 'bad') process.exit(1); const d = new E('FEATURE_INVALID', 'no details'); if (d.key !== null || d.file !== null) process.exit(1);"
```

```
npm test
```