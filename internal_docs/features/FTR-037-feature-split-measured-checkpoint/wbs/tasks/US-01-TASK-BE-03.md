<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Measure component table row count from spec/index.md in check-size
- **Outcome:** check-size computes the components count as the data rows of the single component table in spec/index.md, excluding header and separator rows and rows of other tables, and marks the count unavailable with a reason when the file or table is missing, unreadable or empty.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** measure component table rows in check-size

**Implementation notes:**

Target file: `src/claude/scripts/feature-split.js`. This task adds one function, `countComponentRows`, and one `measure` call. It does not change the scaffold from US-01-TASK-BE-01, the distinct-count helpers from BE-02, or the build-order code from BE-04. The skeleton fixes the single-table basis (D-01). The union of New and Modified subtables (Tech-Spec T-2) is not implemented here. The Tech-Spec T-2 wording therefore conflicts with this task and must be aligned separately.

**Open gap (not decided by the excerpt):** the excerpt does not define how the single component table is located in `spec/index.md` (FTR-037 design open gap 3). The locator below is an assumption, labelled as such in the code. It must be confirmed before the code is merged. If the spec's component table has a different first header cell, change only `isComponentTable`.

Wiring. The `measure` call in the `checkSize` body (already in the Tech-Spec algorithm) is:

```js
measure('components', () => countComponentRows(join(featureDir, 'spec/index.md')));
```

Any throw inside `measure` is recorded as `{ count: 'components', reason: err.message }`, and the status becomes `unavailable`. This task therefore never returns a pass for a missing or unreadable component source.

New functions:

```js
const fs = require('fs'); // already present from BE-01/BE-02; do not add a second require

const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

// Split the file into maximal runs of consecutive lines that start with "|".
function extractPipeTables(text) {
  const tables = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*\|/.test(raw)) {
      if (!cur) cur = [];
      cur.push(raw.trim());
    } else if (cur) {
      tables.push(cur);
      cur = null;
    }
  }
  if (cur) tables.push(cur);
  return tables;
}

// ASSUMED LOCATOR (open gap 3): header row's first cell is "Component".
function isComponentTable(lines) {
  const header = lines[0].split('|').map(c => c.trim()).filter(Boolean);
  return header[0] === 'Component';
}

function countComponentRows(specIndexPath) {
  let text;
  try {
    text = fs.readFileSync(specIndexPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${specIndexPath}: ${err.code || err.message}`); // missing or unreadable
  }
  const found = extractPipeTables(text).filter(isComponentTable);
  if (found.length === 0) throw new Error('component table not found in spec/index.md');
  if (found.length > 1) throw new Error(`expected one component table in spec/index.md, found ${found.length}`);
  const [header, ...rest] = found[0];       // header is line 0; the separator is dropped below
  const rows = rest.filter(l => !SEPARATOR.test(l));
  if (rows.length === 0) throw new Error('component table in spec/index.md has no data rows');
  return rows.length;
}
```

Rules this code enforces:

- Only lines that start with `|` inside one contiguous block count. Rows of other tables are never reached, because a non-pipe line ends the block.
- The header line is removed by `rest`. Separator lines are removed by the `SEPARATOR` test, so a stray separator inside the block is not counted.
- Rows are counted, not de-duplicated by Path. The skeleton asks for data rows only.
- Missing file, unreadable file (any `readFileSync` error), no matching table, more than one matching table, and zero data rows each throw. `measure` turns each throw into an `unavailable` entry with a reason.
- CRLF line endings are handled by the `\r?\n` split.

Before/after: none, because this only adds functions. If BE-01 or BE-02 has already added a `require('fs')` line, reuse it.

Verification in this task checks syntax and that the existing suite stays green. Behavioural coverage (component rows, empty table, missing table, other-table rows) belongs to US-01-TASK-TEST-02, which will exercise this code through the CLI.

**Verification commands:**

```
grep -q "function extractPipeTables(" src/claude/scripts/feature-split.js && grep -q "function isComponentTable(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npm test
```