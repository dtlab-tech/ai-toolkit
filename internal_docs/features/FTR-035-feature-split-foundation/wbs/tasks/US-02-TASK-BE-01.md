<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add isNewFeature with marker checks and unreadable-folder error
- **Outcome:** feature-split.js exports isNewFeature(featureDir). It returns { isNew: true, reason } for a missing folder, and { isNew: false, reason } when the folder holds {PREFIX}-Approvals.md, a wbs directory or epic.md. It returns { isNew: true, reason } when no marker is found, ignoring req/ and spec/. It throws FeatureSplitError FEATURE_UNREADABLE for an existing folder that cannot be read.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-10, AC-11, AC-12, AC-13
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add isNewFeature new-feature test

**Implementation notes:**

Modify `src/claude/scripts/feature-split.js`. This file already exists from INFRA-TASK-BE-01 and provides `FeatureSplitError` (fields `code`, `key`, `file`). Add `isNewFeature` as a new function and add it to the existing `module.exports` object. Do not change `FeatureSplitError` or any other existing export. The file must already have `const fs = require('fs')` and `const path = require('path')`. If the skeleton has no `fail` helper, construct `FeatureSplitError` directly with `throw new FeatureSplitError(...)`, as the code below does.

Design (from the Tech-Spec, UC-02 and D-07):
- A missing folder is new. Any other failure to stat or list an existing folder is `FEATURE_UNREADABLE`. Use `try/catch` on `fs.statSync` and `fs.readdirSync` and check `err.code`. Do not use `existsSync`, because it would hide permission errors.
- Markers are checked in this order: `epic.md`, then `<PREFIX>-Approvals.md`, then a `wbs/` directory. `PREFIX` is taken from the folder basename (`FTR-035-name` gives `FTR-035`).
- `req/` and `spec/` are never markers.
- The `reason` strings `not-created`, `epic`, `approvals`, `wbs` and `no-markers` follow the Tech-Spec's design.

Code to add:

```javascript
// UC-02 (D-07): is this feature folder still new, or has it been split or worked on?
function isNewFeature(featureDir) {
  let entries;
  try {
    fs.statSync(featureDir);
    entries = fs.readdirSync(featureDir);
  } catch (err) {
    if (err.code === 'ENOENT') return { isNew: true, reason: 'not-created' };
    throw new FeatureSplitError('FEATURE_UNREADABLE',
      `Cannot read ${featureDir} (${err.code})`, { file: featureDir });
  }
  const prefix = (path.basename(featureDir).match(/^[A-Z]+-\d+/) || [])[0];
  if (entries.includes('epic.md')) return { isNew: false, reason: 'epic' };
  if (prefix && entries.includes(`${prefix}-Approvals.md`)) return { isNew: false, reason: 'approvals' };
  if (entries.includes('wbs')) {
    let isDir;
    try {
      isDir = fs.statSync(path.join(featureDir, 'wbs')).isDirectory();
    } catch (err) {
      throw new FeatureSplitError('FEATURE_UNREADABLE',
        `Cannot read ${featureDir}/wbs (${err.code})`, { file: featureDir });
    }
    if (isDir) return { isNew: false, reason: 'wbs' };
  }
  return { isNew: true, reason: 'no-markers' };   // req/ and spec/ do not count (D-07)
}

module.exports = { ...module.exports, isNewFeature };
```

The `wbs` stat is wrapped so that a permission failure on `wbs/` also reports `FEATURE_UNREADABLE`. This follows the outcome's rule for an existing folder that cannot be read. It is not a new behavior.

Tests for this function belong to US-02-TASK-TEST-01 and US-02-TASK-TEST-02. This task only needs the module to load and the function to behave as described. A quick smoke check is listed in the verification commands below.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const { isNewFeature } = require('./src/claude/scripts/feature-split.js'); const fs = require('fs'), os = require('os'), path = require('path'); const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-')); const f = path.join(d, 'FTR-035-x'); fs.mkdirSync(f); console.log(JSON.stringify(isNewFeature(f))); console.log(JSON.stringify(isNewFeature(path.join(d, 'missing'))));"
```

Expected output: `{"isNew":true,"reason":"no-markers"}` and then `{"isNew":true,"reason":"not-created"}`.

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```