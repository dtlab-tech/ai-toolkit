<a id="task-INFRA-TASK-BE-07"></a>
### INFRA-TASK-BE-07

- **Task ID:** INFRA-TASK-BE-07
- **Title:** Add staging leftover scan helper
- **Outcome:** feature-split.js has a helper that scans the features root for .split-staging-* directories and REGISTRY.md.tmp-* files and throws FeatureSplitError STAGING_LEFTOVER listing the exact paths and manual-removal guidance, removing nothing.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split staging leftover scan

**Implementation notes:**

Scope: add one helper to `src/claude/scripts/feature-split.js`. It is read-only. It must not remove, rename, or create anything. Apply step 0 (Flow D) will call it later; wiring it into `apply` is not part of this task.

Gaps in the inputs. The Tech-Spec does not name this helper or fix its signature, and the skeleton does not give the `FeatureSplitError` constructor shape. Both are decided below. The constructor shape must be checked against what INFRA-TASK-BE-01 actually wrote. If it differs, use BE-01's signature and do not change BE-01's class.

Names chosen here:
- `findStagingLeftovers(featuresRoot) -> string[]` (internal, also exported for tests): returns sorted absolute paths.
- `assertNoStagingLeftovers(featuresRoot) -> void` (exported): throws if the list is non-empty.

Matching rules:
- A directory entry whose name starts with `.split-staging-` and which is a directory counts.
- A directory entry whose name starts with `REGISTRY.md.tmp-` and which is a file counts.
- If `featuresRoot` does not exist, return `[]`. A missing root has no leftovers. Do not create it.
- Use `fs.readdirSync(root, { withFileTypes: true })` only. Do not recurse. Do not touch the entries.

Error shape: `code = 'STAGING_LEFTOVER'`, `key = null`, `file = featuresRoot`. The message lists every path, one per line, and says these were not removed automatically. It tells the user to delete them by hand after confirming that no split run is active.

```javascript
const fs = require('fs');
const path = require('path');

function findStagingLeftovers(featuresRoot) {
  if (!fs.existsSync(featuresRoot)) return [];
  const found = [];
  for (const entry of fs.readdirSync(featuresRoot, { withFileTypes: true })) {
    const full = path.join(featuresRoot, entry.name); // entry.name only; never a raw user string
    if (entry.name.startsWith('.split-staging-') && entry.isDirectory()) found.push(full);
    else if (entry.name.startsWith('REGISTRY.md.tmp-') && entry.isFile()) found.push(full);
  }
  return found.sort();
}

function assertNoStagingLeftovers(featuresRoot) {
  const leftovers = findStagingLeftovers(featuresRoot);
  if (leftovers.length === 0) return;
  const message =
    'Staging leftovers found; nothing was written or removed.\n' +
    leftovers.join('\n') + '\n' +
    'Remove these paths manually after confirming that no split run is active.';
  throw new FeatureSplitError('STAGING_LEFTOVER', message, { key: null, file: featuresRoot });
}

module.exports = { ...module.exports, findStagingLeftovers, assertNoStagingLeftovers };
```

Adjust the `FeatureSplitError` call to match BE-01's constructor. Keep `require` calls at the top of the file as BE-01 structured them, and do not duplicate them.

Facade: do not change the facade in this task. If BE-02 runs `main()` on `require`, the module-load behaviour is already BE-02's concern and this task adds no top-level side effects.

Test expectations (for TEST-01 to cover, and for the smoke check below):
- An empty temp root returns `[]` and does not throw.
- A root containing `.split-staging-abc/` and `REGISTRY.md.tmp-abc` throws `STAGING_LEFTOVER`, and the message contains both full paths.
- After the throw, both paths still exist. Nothing was removed.
- A missing root returns `[]`.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const fs=require('fs'),os=require('os'),path=require('path');const d=fs.mkdtempSync(path.join(os.tmpdir(),'fs-leftover-'));const s=path.join(d,'.split-staging-abc');fs.mkdirSync(s);const t=path.join(d,'REGISTRY.md.tmp-abc');fs.writeFileSync(t,'');try{m.assertNoStagingLeftovers(d);process.exit(2)}catch(e){if(e.code!=='STAGING_LEFTOVER'||!e.message.includes(s)||!e.message.includes(t))process.exit(3)}if(!fs.existsSync(s)||!fs.existsSync(t))process.exit(4);console.log('ok')"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```