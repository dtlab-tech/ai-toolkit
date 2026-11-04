<a id="task-INFRA-TASK-BE-05"></a>
### INFRA-TASK-BE-05

- **Task ID:** INFRA-TASK-BE-05
- **Title:** Add registry temp-and-rename write helper
- **Outcome:** feature-split.js has a helper that writes new registry content to REGISTRY.md.tmp-<run id> and renames it over REGISTRY.md, removing the temp file and throwing FeatureSplitError REGISTRY_IO on failure while leaving the previous registry intact.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split registry atomic write helper

**Implementation notes:**

This task adds one new function to `src/claude/scripts/feature-split.js`. It creates no new file and modifies no existing function. The file and the `FeatureSplitError` class come from INFRA-TASK-BE-01. The Tech-Spec does not name this helper, so the name `writeRegistryAtomic` is chosen here. The Tech-Spec excerpt gives the required behaviour (Flow D step 9, Section 6 "Registry integrity", the REGISTRY_IO row of the error table, and the registry rollback rule). It does not give the function's exact signature.

**Assumption to check before coding:** the `FeatureSplitError` constructor argument order is set by INFRA-TASK-BE-01, which is not in this prompt. The snippet below assumes `new FeatureSplitError(code, key, file, message)`. If BE-01 uses a different order or an options object, change only the `throw` line.

Helper to add (after the BE-01 class, before `module.exports`):

```javascript
const fs = require('fs');
const path = require('path');

/**
 * Replace <featuresRoot>/REGISTRY.md with `content` using a temp file and a rename.
 * The previous registry is untouched until the rename succeeds.
 * @param {string} featuresRoot  absolute features root (from resolve-features-root)
 * @param {string} runId         random hex run id, e.g. crypto.randomBytes(4).toString('hex')
 * @param {string} content       complete new registry text (built by the caller)
 * @throws {FeatureSplitError}   code REGISTRY_IO on any write or rename failure
 */
function writeRegistryAtomic(featuresRoot, runId, content) {
  if (!/^[0-9a-f]+$/i.test(String(runId))) {
    throw new FeatureSplitError('REGISTRY_IO', null, null, `Invalid run id for registry temp file: ${runId}`);
  }
  const registryPath = path.join(featuresRoot, 'REGISTRY.md');
  const tempPath = path.join(featuresRoot, `REGISTRY.md.tmp-${runId}`);
  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx' }); // 'wx' fails if the temp already exists
    fs.renameSync(tempPath, registryPath);                                  // replaces REGISTRY.md on the same volume
  } catch (err) {
    try {
      fs.rmSync(tempPath, { force: true });                                 // remove the temp file if it was created
    } catch (_) { /* best effort: the temp file is reported by the leftover scan (BE-07) */ }
    throw new FeatureSplitError('REGISTRY_IO', null, registryPath,
      `Could not write REGISTRY.md (previous registry left unchanged): ${err.message}`);
  }
}
```

Export it by adding `writeRegistryAtomic` to the existing `module.exports` object. Do not change any other export.

Behaviour the code must hold:
- The temp file is written first. `REGISTRY.md` is replaced only by the rename, so a failed write never leaves a half-written registry (Section 6).
- On any failure the temp file is removed and the error is `REGISTRY_IO` with `file` set to the registry path. The caller (Flow D rollback, step 9 and the rollback list) relies on this code.
- The helper does not read the registry or build its content. Building the content is the job of the caller and of INFRA-TASK-BE-04.
- A leftover temp file that the cleanup could not remove is left for the leftover scan (INFRA-TASK-BE-07). This helper never removes files it did not create.
- Windows: `renameSync` over an existing file can fail with EPERM if an editor holds the file (Section 12). That surfaces as `REGISTRY_IO`, and the rollback handles it.

No test file is written here. INFRA-TASK-TEST-01 covers this helper. The check below only confirms that the export exists and that the module parses.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); if(typeof m.writeRegistryAtomic!=='function'){console.error('writeRegistryAtomic not exported');process.exit(1);}"
```

```
npm test
```