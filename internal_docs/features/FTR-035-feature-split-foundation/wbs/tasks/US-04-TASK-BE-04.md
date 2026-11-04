<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Add epic.md renderer with split table
- **Outcome:** feature-split.js has a renderEpic helper that outputs epic.md with a split table (order, ID, name, dependencies, checkpoint, and a shared-foundation row carrying the BR-03 warning or none) and the verbatim original feature text as a trailing section. It does not create epic.json.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-26, AC-27
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add epic record renderer

**Implementation notes:**

Target file: `src/claude/scripts/feature-split.js`. INFRA-TASK-BE-01 creates this file with the `FeatureSplitError` class and the exports object. This task only adds one pure renderer and exports it. It must not touch `apply`, `register`, or the registry code.

Duplicate check: no sibling task renders `epic.md`. US-04-TASK-BE-03 renders child docs, and US-04-TASK-BE-05 parses and inserts late rows. Those are different functions, so there is no conflict.

Two points differ from the design text, and the implementer must handle them:

1. **BR-03 shared-foundation row.** The design's `renderEpic` only sets a per-child `yes`/`no` column. The outcome also requires a final row that carries the BR-03 warning text, or `none`. Keep the per-child column and add the final row. The renderer takes an optional `warnings` array (the output of `foundationWarnings`).
2. **The extra row must not be read as a child.** The design's `lastEpicRows` keeps every `|` row except the header and separator. It would therefore read the foundation row as a child, and late mode would then use it as the default dependency. US-04-TASK-BE-05 (`parseEpicRows`) must skip any row whose first cell is not a number. This task does not change the parser, but the renderer output depends on that rule.

Change: add `renderEpic` in the UC-04 helper section, after `renderChildDoc` and before `rollback`. Add `renderEpic` to `module.exports`. Do not add any `fs` call, and do not use the string `epic.json` anywhere in the file.

```javascript
// Pure: returns epic.md text. Performs no file I/O.
// rows: [{ order, id, name, dir, checkpoint, deps: string[], owner: boolean }]
// warnings: output of foundationWarnings(), may be []
// originalText: the verbatim feature.md text, appended unchanged
function renderEpic({ parentId, title, rows, originalText, warnings = [] }) {
  const foundation = warnings.length
    ? warnings.map(w => w.message.replace(/\|/g, '\\|')).join(' ')
    : 'none';
  return [
    `# ${title} — epic`, '',
    '## Feature ID', parentId, '',
    '## Split table', '',
    '| Order | ID | Name | Dir | Checkpoint | Depends on | Shared foundation |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.order} | ${r.id} | ${r.name} | ${r.dir} | ${r.checkpoint} | ${r.deps.join(', ') || 'none'} | ${r.owner ? 'yes' : 'no'} |`),
    `| — | — | Shared foundation | — | — | — | ${foundation} |`,
    '', '## Original feature text', '', originalText,
  ].join('\n');
}

module.exports = { /* existing exports */, renderEpic };
```

Notes on the code above:
- `title` is supplied by the caller. The renderer does not derive it from the text, so the caller decides the fallback.
- `originalText` is inserted without trimming, so the trailing section is verbatim.
- The function returns a string only. The caller writes it under the staging rules in UC-04.

Verification: run the smoke checks below. They cover the table, the trailing verbatim text, the warning row, and the absence of any `epic.json` reference. Then run `npm test` as the primary check.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const out=m.renderEpic({parentId:'FTR-010',title:'Demo',rows:[{order:1,id:'FTR-011',name:'Auth',dir:'FTR-011-auth',checkpoint:'definition',deps:[],owner:true}],warnings:[],originalText:'# Demo\n\nBody text'});if(!out.includes('## Original feature text')||!out.endsWith('Body text')||!out.includes('| Shared foundation | — | — | — | none |'))process.exit(1);"
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const out=m.renderEpic({parentId:'FTR-010',title:'Demo',rows:[],warnings:[{code:'FOUNDATION_NOT_FIRST',message:'BR-03 is broken'}],originalText:'x'});if(!out.includes('BR-03 is broken'))process.exit(1);"
```

```
! grep -q "epic\.json" src/claude/scripts/feature-split.js
```

```
npm test
```