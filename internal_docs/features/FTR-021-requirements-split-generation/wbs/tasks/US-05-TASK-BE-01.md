<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Create req-skeleton-check.js CLI wrapper
- **Outcome:** src/claude/scripts/req-skeleton-check.js exists: parses req/index.md's use-case index table, Acceptance Criteria table, and Business Rules table into the plain shape req-graph-checks.js expects, runs all 4 check functions, prints a JSON report, and exits 0 (clean) / 1 (findings) / 2 (parse failure)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add req-skeleton-check.js structural pre-check CLI

**Implementation notes:**

Mirrors `wb-skeleton-check.js`'s role (a standalone CLI that bridges "pure check functions" and
"the actual on-disk Markdown shape") and its 0/1/2 exit-code convention:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { checkUniqueUcIds, checkUcIdFormat, checkUcTableFileParity, checkCrossReferencesResolve } =
  require('./req-graph-checks');
const { parseUseCaseIndexTable } = require('./req-assembler');

function parseAcTable(indexContent) { /* same "## 7. Acceptance Criteria" table parse as
  parseUseCaseIndexTable's sibling — first table after the heading, columns ID | Criterion |
  Related UC | Priority -> { id, relatedUc } rows */ }

function parseBusinessRulesTable(indexContent) { /* same pattern against "## 3. Business Rules",
  columns ID | Rule | Applies to -> { id, appliesTo } rows */ }

function main() {
  const indexPath = process.argv[2];
  let indexContent;
  try {
    indexContent = fs.readFileSync(indexPath, 'utf8');
  } catch (e) {
    console.log(JSON.stringify({ valid: false, errors: [{ message: `cannot read ${indexPath}: ${e.message}` }] }));
    process.exit(2);
  }

  let ucTable, acTable, businessRules;
  try {
    ucTable = parseUseCaseIndexTable(indexContent);
    acTable = parseAcTable(indexContent);
    businessRules = parseBusinessRulesTable(indexContent);
  } catch (e) {
    console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }));
    process.exit(2);
  }

  const ucIds = ucTable.map(r => r.id);
  const useCasesDir = path.join(path.dirname(indexPath), 'use-cases');
  const existingUcFiles = fs.existsSync(useCasesDir)
    ? fs.readdirSync(useCasesDir).map(f => f.replace(/\.md$/, ''))
    : [];

  const errors = [
    ...checkUniqueUcIds({ ucIds }),
    ...checkUcIdFormat({ ucIds }),
    ...checkUcTableFileParity({ ucIds }, existingUcFiles),
    ...checkCrossReferencesResolve({ ucIds, acTable, businessRules }),
  ];

  console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2));
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
```

`parseAcTable`/`parseBusinessRulesTable` reuse the same "first table after a `## N. ` heading"
convention as `parseUseCaseIndexTable` (`req-assembler.js`, `US-02-TASK-BE-01`) — implement them
as two more small exports of `req-assembler.js` rather than duplicating table-parsing logic a
third time in this file.

**Verification commands:**

```
node --check src/claude/scripts/req-skeleton-check.js
```
