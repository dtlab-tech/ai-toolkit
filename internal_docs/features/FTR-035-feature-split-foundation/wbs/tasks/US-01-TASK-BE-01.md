<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add config file reader and validator helpers
- **Outcome:** feature-split.js has readConfigFile and validateConfig helpers that read a JSON config file and check it against the D-02 shape. They raise FeatureSplitError for a missing or unreadable default, malformed JSON, an unknown key, and a non-integer or negative value. Each error names the key and the file where applicable.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, INFRA-TASK-INFRA-01
- **Acceptance criteria:** AC-04, AC-05, AC-06
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split config reader and validator

**Implementation notes:**

This task edits the existing file `src/claude/scripts/feature-split.js` created by INFRA-TASK-BE-01. Do not overwrite the file. Keep the `'use strict'` header, the `FeatureSplitError` class, and the existing `exports` object unchanged. The constants `CONFIG_NAME`, `DEFAULT_CONFIG`, `SHAPE`, and `TOP_KEYS` are assumed to exist from INFRA-TASK-BE-01 or from the skeleton; if any are missing, add them exactly as in the design:

```javascript
const CONFIG_NAME = 'feature-split.config.json';
const DEFAULT_CONFIG = path.join(__dirname, CONFIG_NAME);
const SHAPE = {                                   // D-02, exact key names
  thresholds: ['useCases', 'acceptanceCriteria', 'components', 'estimatedPhases'],
  definitionSignals: ['minActors', 'minApplications', 'minFlows'],
};
const TOP_KEYS = ['thresholds', 'definitionSignals', 'minChildren'];
```

Add the `fail` one-line helper only if it is not already present:

```javascript
const fail = (code, message, extra) => { throw new FeatureSplitError(code, message, extra); };
```

Then insert the three functions below, after `fail` and before any `loadConfig` code. These are module-scope functions and are not exported by this task. `loadConfig` (US-01-TASK-BE-02) calls them next.

```javascript
// ---------- UC-01 configuration (D-02 to D-05) ----------
function readConfigFile(file, required) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return undefined;      // D-03: missing override is fine
    fail(required ? 'CONFIG_DEFAULT_UNREADABLE' : 'CONFIG_OVERRIDE_UNREADABLE',
      `Cannot read ${file} (${err.code})`, { file });
  }
  try { return JSON.parse(text); }
  catch { fail('CONFIG_INVALID_JSON', `Invalid JSON in ${file}`, { file }); }
}

function checkValue(value, key, file) {
  if (!Number.isInteger(value) || value < 0)
    fail('CONFIG_INVALID_VALUE', `${key} in ${file} must be a non-negative integer`, { key, file });
}

function validateConfig(obj, file, partial) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj))
    fail('CONFIG_INVALID_VALUE', `${file} must contain a JSON object`, { file });
  for (const k of Object.keys(obj))
    if (!TOP_KEYS.includes(k)) fail('CONFIG_UNKNOWN_KEY', `Unknown key ${k} in ${file}`, { key: k, file });
  for (const [section, keys] of Object.entries(SHAPE)) {
    if (obj[section] === undefined) {
      if (partial) continue;
      fail('CONFIG_INVALID_VALUE', `Missing ${section} in ${file}`, { key: section, file });
    }
    if (obj[section] === null || typeof obj[section] !== 'object')
      fail('CONFIG_INVALID_VALUE', `${section} must be an object in ${file}`, { key: section, file });
    for (const k of Object.keys(obj[section]))
      if (!keys.includes(k)) fail('CONFIG_UNKNOWN_KEY', `Unknown key ${section}.${k} in ${file}`, { key: `${section}.${k}`, file });
    for (const k of Object.keys(obj[section])) checkValue(obj[section][k], `${section}.${k}`, file);
    if (!partial) for (const k of keys)
      if (obj[section][k] === undefined) fail('CONFIG_INVALID_VALUE', `Missing ${section}.${k} in ${file}`, { key: `${section}.${k}`, file });
  }
  if (obj.minChildren === undefined) {
    if (!partial) fail('CONFIG_INVALID_VALUE', `Missing minChildren in ${file}`, { key: 'minChildren', file });
  } else checkValue(obj.minChildren, 'minChildren', file);
}
```

Behaviour the code must produce:
- `readConfigFile(file, true)` on a missing or unreadable default throws `CONFIG_DEFAULT_UNREADABLE`, with `file` set.
- `readConfigFile(file, false)` on a missing override returns `undefined` with no error (D-03). An unreadable override (any error other than `ENOENT`) throws `CONFIG_OVERRIDE_UNREADABLE`.
- Invalid JSON in either file throws `CONFIG_INVALID_JSON`, with `file` set. The design resolves this case (D-04 as written in the Change section), so it is not pending.
- `validateConfig` with `partial = false` requires every D-02 key. With `partial = true` (override), absent keys are allowed.
- Unknown top-level keys throw `CONFIG_UNKNOWN_KEY` with `key` set to the key name. Unknown nested keys set `key` to `section.key`.
- A non-integer (`1.5`, `"8"`) or negative value throws `CONFIG_INVALID_VALUE` with `key` set to `section.key` (or `minChildren`).

Known gap to note in review: the section check accepts arrays because `typeof [] === 'object'`. The design does not say what to do with an array section, so this task keeps the design's check. Flag it to the reviewer rather than changing it silently.

No `describe()`/`test()` block is required here, since this task's domain is BE. The unit tests belong to US-01-TASK-TEST-01.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "require('./src/claude/scripts/feature-split.js'); console.log('module loads')"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```