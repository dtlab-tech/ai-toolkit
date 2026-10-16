<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Create req-graph-checks.js with 4 pure self-consistency check functions
- **Outcome:** src/claude/scripts/req-graph-checks.js exists exporting checkUniqueUcIds, checkUcIdFormat, checkUcTableFileParity, and checkCrossReferencesResolve, each taking a plain { ucIds, acTable, businessRules } structure and returning an array of error objects in a consistent shape
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** All 4 checks share the same input shape and output contract and are too small individually to verify in isolation (e.g. `checkUcIdFormat` alone is a single regex test) — grouped the same way FTR-020's `wb-graph-checks.js` grouped its larger set of checks into one module.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add req-graph-checks.js with 4 pure self-consistency check functions

**Implementation notes:**

Pure functions, no file I/O, no `process.exit` — this module never reads `req/index.md` itself
(that parsing happens in `req-skeleton-check.js`, US-05-TASK-BE-01); it only operates on the
already-parsed plain shape:

```js
// { ucIds: string[], acTable: {id, relatedUc}[], businessRules: {id, appliesTo}[] }
const UC_ID_RE = /^UC-\d{2,}$/;

function checkUniqueUcIds({ ucIds }) {
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ucIds) { if (seen.has(id)) duplicates.add(id); else seen.add(id); }
  return [...duplicates].map(id => ({
    category: 'DUPLICATE_UC_ID', severity: 'error', ucId: id,
    message: `Duplicate UC ID "${id}" appears more than once in the use-case index table`,
  }));
}

function checkUcIdFormat({ ucIds }) {
  return ucIds.filter(id => !UC_ID_RE.test(id)).map(id => ({
    category: 'INVALID_UC_ID_FORMAT', severity: 'error', ucId: id,
    message: `UC ID "${id}" does not match the required UC-NN format`,
  }));
}

// Table/directory parity is checked one layer up (US-05-TASK-BE-01 has the directory listing);
// this function only validates INTERNAL consistency of the table itself — every AC/BR reference
// resolves to a row that exists in ucIds. checkUcTableFileParity (below) is given the directory
// listing as a second argument so BOTH directions (table->file, file->table) are checked here,
// keeping all "does X exist" logic in one module instead of splitting it across two.
function checkUcTableFileParity({ ucIds }, existingUcFiles) {
  const idSet = new Set(ucIds);
  const fileSet = new Set(existingUcFiles);
  const missingFiles = ucIds.filter(id => !fileSet.has(id));
  const orphanFiles = existingUcFiles.filter(id => !idSet.has(id));
  return [
    ...missingFiles.map(id => ({ category: 'UC_TABLE_ROW_WITHOUT_FILE', severity: 'error', ucId: id,
      message: `UC "${id}" has a table row but no use-cases/${id}.md file` })),
    ...orphanFiles.map(id => ({ category: 'UC_FILE_WITHOUT_TABLE_ROW', severity: 'error', ucId: id,
      message: `use-cases/${id}.md exists but has no row in the use-case index table` })),
  ];
}

function checkCrossReferencesResolve({ ucIds, acTable, businessRules }) {
  const idSet = new Set(ucIds);
  const errors = [];
  const checkRefs = (rows, idField, refField, category) => {
    for (const row of rows) {
      if (row[refField] === 'All UCs') continue;
      for (const ref of row[refField].split(',').map(s => s.trim())) {
        if (!idSet.has(ref)) errors.push({ category, severity: 'error', id: row[idField], ucId: ref,
          message: `${row[idField]}'s "${refField}" references unknown UC "${ref}"` });
      }
    }
  };
  checkRefs(acTable, 'id', 'relatedUc', 'DANGLING_AC_UC_REFERENCE');
  checkRefs(businessRules, 'id', 'appliesTo', 'DANGLING_BR_UC_REFERENCE');
  return errors;
}

module.exports = { checkUniqueUcIds, checkUcIdFormat, checkUcTableFileParity, checkCrossReferencesResolve };
```

`checkUcTableFileParity`'s second parameter (`existingUcFiles`, a plain array of UC IDs derived
from a directory listing) is supplied by the caller (`req-skeleton-check.js`) — this module
itself does zero filesystem access, consistent with `wb-graph-checks.js`'s own pure-function
convention.

**Verification commands:**

```
node --check src/claude/scripts/req-graph-checks.js
```
