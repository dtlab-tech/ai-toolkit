<a id="task-INFRA-TASK-BE-03"></a>
### INFRA-TASK-BE-03

- **Task ID:** INFRA-TASK-BE-03
- **Title:** Add folder slug rule function
- **Outcome:** feature-split.js exports a slug function that turns a child name into a valid folder slug and rejects empty names, path separators, '..' and Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) by throwing FeatureSplitError INVALID_NAME.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split slug rule

**Implementation notes:**

Scope: add one pure function, `slug(name)`, to `src/claude/scripts/feature-split.js` and add it to the existing `exports` object. Do not change the `FeatureSplitError` class, the facade, or any other export. The Tech-Spec excerpt given to this task does not state the `FeatureSplitError` constructor signature. This note assumes the signature that INFRA-TASK-BE-01 established. If BE-01 used a different shape, adapt the `throw` lines below to match it and nothing else.

Why this rule exists (Tech-Spec §6, D-12, AC-15): only the slug is ever joined into a path under the features root, and the raw name never is. The slug function is therefore the single gate against path traversal and Windows device-name folders.

Algorithm, in order:
1. Trim the input. If it is not a string or is empty after trimming, throw `INVALID_NAME`.
2. If the trimmed name contains `/` or `\`, throw `INVALID_NAME`.
3. If the trimmed name contains `..`, throw `INVALID_NAME`.
4. Take the stem (the text before the first `.`), uppercase it, and if it is one of the reserved device names, throw `INVALID_NAME`. Checking the stem also catches `CON.txt`, which Windows treats as reserved too.
5. Lowercase the name, replace each run of characters outside `a-z0-9` with a single `-`, and strip leading and trailing `-`. If the result is empty (for example `"!!!"`), throw `INVALID_NAME`.
6. Return the slug.

```javascript
const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

function invalidName(message) {
  // Constructor shape assumed from INFRA-TASK-BE-01; adapt if it differs.
  return new FeatureSplitError('INVALID_NAME', message, { key: null, file: null });
}

function slug(name) {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (raw === '') throw invalidName('child name is empty');
  if (/[\/\\]/.test(raw)) throw invalidName('child name contains a path separator');
  if (raw.includes('..')) throw invalidName('child name contains ".."');
  const stem = raw.split('.')[0].toUpperCase();
  if (RESERVED_DEVICE_NAMES.has(stem)) {
    throw invalidName(`child name "${raw}" is a reserved Windows device name`);
  }
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s === '') throw invalidName('child name has no ASCII letters or digits');
  return s;
}
```

Add `slug` to the existing `module.exports` object alongside `FeatureSplitError`. Do not export `RESERVED_DEVICE_NAMES`.

Design choices to keep:
- The slug is ASCII-only, so non-ASCII letters are dropped. That is a deliberate, conservative choice. The spec sets no length limit, so none is added.
- The reserved check is applied to the stem and not only to the whole name, because Windows treats `CON.anything` as the device.
- The function is pure. It writes nothing and touches no file, so it needs no temp directory in tests.

Nothing in the given excerpt is insufficient for this task. No other task builds a slug function (the sibling outcomes are the error class, facade, registry read and write, first-sentence helper and staging scan), so there is no duplicate implementation.

**Verification commands:**

```
node -e "const { slug } = require('./src/claude/scripts/feature-split.js'); if (slug('Login Flow') !== 'login-flow') process.exit(1); if (slug('  Billing & Invoices!  ') !== 'billing-invoices') process.exit(1);"
```

```
node -e "const { slug } = require('./src/claude/scripts/feature-split.js'); for (const n of ['', '   ', 'a/b', 'a' + String.fromCharCode(92) + 'b', '..', 'x..y', 'CON', 'nul', 'COM1', 'lpt9', 'AUX.txt', '!!!']) { let threw = false; try { slug(n); } catch (e) { threw = e.code === 'INVALID_NAME'; } if (!threw) { console.error('not rejected: ' + JSON.stringify(n)); process.exit(1); } }"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```