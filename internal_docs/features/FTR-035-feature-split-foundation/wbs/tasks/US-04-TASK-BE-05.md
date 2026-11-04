<a id="task-US-04-TASK-BE-05"></a>
### US-04-TASK-BE-05

- **Task ID:** US-04-TASK-BE-05
- **Title:** Add epic.md row parser and late row insertion
- **Outcome:** feature-split.js has a parseEpicRows helper that reads the child rows from an existing epic.md split table. It also has an insertLateRow helper that returns epic.md text with one new late row after the last child row, leaving the existing rows, the foundation row and the original text unchanged.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** AC-34
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add epic row parser and late row insert

**Implementation notes:**

This task modifies `src/claude/scripts/feature-split.js`, which BE-04 creates. Add two helpers next to `renderEpic`. Do not change `renderEpic` or any other function. The row shape matches the one `renderEpic` writes, so a row round-trips through parse and insert unchanged.

The Tech-Spec excerpt gives the table format from `renderEpic`: a header `| Order | ID | Name | Dir | Checkpoint | Depends on | Shared foundation |`, a separator `|---|...|`, then one line per child. The original feature text follows a `## Original feature text` heading. The Tech-Spec does not say how the owner column is written for a late row. This plan writes `no`, because a late child never owns the foundation (D-16).

Shared line predicate and the parser. Cut the text at the `## Original feature text` heading first, so table-like lines inside the original text are never read as rows. The existing design's `lastEpicRows` has the same body; if it is already in the file, keep it as an alias of `parseEpicRows`.

```javascript
// A child row starts with a numeric Order cell. The header (Order), the separator (|---) and the
// foundation row (| — | — | Shared foundation | … |, added by renderEpic) do not, so they are never read as children.
const isChildRow = (l) => /^\|\s*\d+\s*\|/.test(l);
const ORIGINAL_HEADING = /^## Original feature text\s*$/m;

function parseEpicRows(epicText) {
  const head = epicText.split(ORIGINAL_HEADING)[0];
  return head.split(/\r?\n/).filter(isChildRow).map((l) => {
    const c = l.split('|').slice(1, -1).map((s) => s.trim());
    return {
      order: Number(c[0]), id: c[1], name: c[2], dir: c[3], checkpoint: c[4],
      deps: c[5] === 'none' ? [] : c[5].split(',').map((s) => s.trim()),
      owner: c[6] === 'yes',
    };
  });
}
```

Late row insertion. Work on lines, not a regex on the whole text. A regex replacement that targets the blank line before the heading drops that blank line. Preserve the file's line ending. The new row's order is the largest existing order plus one. The caller supplies `{ id, name, dir, checkpoint, deps, owner }`. If the table has no child rows, fail rather than guess where to insert.

```javascript
function insertLateRow(epicText, row) {
  const eol = epicText.includes('\r\n') ? '\r\n' : '\n';
  const lines = epicText.split(/\r?\n/);
  const headingAt = lines.findIndex((l) => ORIGINAL_HEADING.test(l));
  const limit = headingAt === -1 ? lines.length : headingAt;
  let lastRow = -1;
  for (let i = 0; i < limit; i++) if (isChildRow(lines[i])) lastRow = i;
  if (lastRow === -1) fail('EPIC_TABLE_MISSING', 'epic.md has no child rows to insert after');
  const rows = parseEpicRows(epicText);
  const order = Math.max(...rows.map((r) => r.order)) + 1;
  const line = `| ${order} | ${row.id} | ${row.name} | ${row.dir} | ${row.checkpoint} `
    + `| ${row.deps.join(', ') || 'none'} | ${row.owner ? 'yes' : 'no'} |`;
  return [...lines.slice(0, lastRow + 1), line, ...lines.slice(lastRow + 1)].join(eol);
}
```

Behaviour that must hold:
- Existing rows, including the `yes` child and the separate `| — | — | Shared foundation | … |` line, are unchanged. The new line is inserted directly after the last numbered child row, so it lands before the foundation line, and its default dependency is the last numbered child and never `—`.
- Everything from the `## Original feature text` heading onward is byte-identical.
- `EPIC_TABLE_MISSING` is a choice this plan makes; the Tech-Spec does not name an error for this case.

Export both helpers from `module.exports`. The Tech-Spec export list does not include them, so this is an additive change the verification below needs. Note for BE-11: the late branch of `apply` should call `insertLateRow` instead of its inline regex replacement, because the inline version drops the blank line before the heading.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const {parseEpicRows,insertLateRow}=require('./src/claude/scripts/feature-split.js'); const e='## Split table\n\n| Order | ID | Name | Dir | Checkpoint | Depends on | Shared foundation |\n|---|---|---|---|---|---|---|\n| 1 | FTR-002 | Auth | FTR-002-auth | definition | none | yes |\n| 2 | FTR-003 | Billing | FTR-003-billing | definition | FTR-002 | no |\n\n## Original feature text\n\n| 9 | FTR-999 | x | y | z | none | no |\n'; const r=parseEpicRows(e); if(r.length!==2||r[1].id!=='FTR-003'||r[0].owner!==true) throw new Error('parse'); const o=insertLateRow(e,{id:'FTR-004',name:'Reports',dir:'FTR-004-reports',checkpoint:'late',deps:['FTR-003'],owner:false}); if(!o.includes('| 3 | FTR-004 | Reports | FTR-004-reports | late | FTR-003 | no |\n\n## Original feature text')) throw new Error('insert'); if(!o.endsWith('| 9 | FTR-999 | x | y | z | none | no |\n')) throw new Error('original text changed'); console.log('ok')"
```

```
node -e "const {parseEpicRows,insertLateRow}=require('./src/claude/scripts/feature-split.js'); const e='## Split table\n\n| Order | ID | Name | Dir | Checkpoint | Depends on | Shared foundation |\n|---|---|---|---|---|---|---|\n| 1 | FTR-002 | Auth | FTR-002-auth | definition | none | yes |\n| 2 | FTR-003 | Billing | FTR-003-billing | definition | FTR-002 | no |\n| — | — | Shared foundation | — | — | — | Auth |\n\n## Original feature text\n\nx\n'; const rows=parseEpicRows(e); if (rows.length!==2||rows.some(r=>!Number.isInteger(r.order)||r.id==='—')) process.exit(1); const out=insertLateRow(e,{order:3,id:'FTR-004',name:'Late',dir:'FTR-004-late',checkpoint:'late',deps:['FTR-003'],owner:false}); const lines=out.split('\n'); const late=lines.findIndex(l=>l.includes('FTR-004')); const found=lines.findIndex(l=>l.startsWith('| —')); if (late<0||found<0||late>found) process.exit(1)"
```

```
npm test
```