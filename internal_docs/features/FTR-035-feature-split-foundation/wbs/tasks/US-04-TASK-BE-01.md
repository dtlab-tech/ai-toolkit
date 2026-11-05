<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Add registry render and field edit helpers
- **Outcome:** feature-split.js has helpers to render a registry entry in the '## FTR-NNN — Title' format with Parent and Depends on lines and a Detail link, to find an entry by ID, to read a field, to set or insert a field in place, and to render the whole registry. Untouched entries stay byte-identical.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-04
- **Acceptance criteria:** AC-29, AC-30, AC-39
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add registry entry render and field edit helpers

**Implementation notes:**

Scope. This task adds five helpers to `src/claude/scripts/feature-split.js`: `renderEntry`, `findBlock`, `fieldOf`, `setField` and `renderRegistry`. It also adds them to the module's `exports` object. It does not write the parser. `parseRegistry` belongs to INFRA-TASK-BE-04, which this task depends on. The helpers operate on the registry shape the design defines: `{ eol, head, blocks: [{ id, lines }] }`, where `lines` is the verbatim array of lines for one `## FTR-NNN` block. Keeping `lines` verbatim is what makes untouched entries byte-identical. If INFRA-TASK-BE-04 returns a different shape (for example parsed fields without `lines`, or `---`-separated records that drop the original text), stop and report it. This task cannot meet the byte-identical requirement on that shape.

Two format points must be settled before this code is final (Tech-Spec gap 1, blocking):
1. **Heading separator.** The skeleton outcome and the component index use an em dash (`## FTR-NNN — Title`). The design body's code uses a colon (`## FTR-NNN: Title`). This plan follows the outcome: em dash. The heading is built in one place (`renderEntry`) and matched in one place (INFRA-TASK-BE-04's parser), so changing it later is a one-line edit.
2. **Detail line.** The index names the link `→ [Detail](...)`. The design code writes `**Detail:** [label](path)`. This plan uses the design form, because it is the detailed spec, and the line is produced only in `renderEntry`. Both forms must be checked against the live `REGISTRY.md` at Gate 1.

Code to add (replace nothing already present except the `setField` stub):

```javascript
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds the lines of one registry entry. The caller adds the blank separator line before it.
function renderEntry(e) {
  const lines = [
    `## ${e.id} — ${e.title}`, '',
    `**Keywords:** ${e.keywords.join(', ')}`,
    `**Status:** ${e.status}`,
    `**Summary:** ${e.summary}`,
    `**Detail:** [${e.detailLabel}](${e.detail})`,
  ];
  if (e.parent) {
    const deps = e.dependsOn ?? [];
    lines.push(`**Parent:** ${e.parent}`, `**Depends on:** ${deps.length ? deps.join(', ') : 'none'}`);
  }
  return lines;
}

const findBlock = (r, id) => r.blocks.find(b => b.id === id);

// Returns the trimmed value of the first "**Key:**" line in the block, or null.
function fieldOf(block, key) {
  const re = new RegExp(`^\\*\\*${escapeRe(key)}:\\*\\*\\s*(.*)$`);
  for (const line of block.lines) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

// Replaces the first matching "**Key:**" line in place. If none exists, inserts one
// after the block's last "**Key:**" line. Mutates and returns the block.
function setField(block, key, value) {
  const line = `**${key}:** ${value}`.trimEnd();
  const re = new RegExp(`^\\*\\*${escapeRe(key)}:\\*\\*`);
  const at = block.lines.findIndex(l => re.test(l));
  if (at !== -1) { block.lines[at] = line; return block; }
  let last = -1;
  block.lines.forEach((l, i) => { if (/^\*\*[^*]+:\*\*/.test(l)) last = i; });
  block.lines.splice(last !== -1 ? last + 1 : 1, 0, line);   // no key lines: right after the heading
  return block;
}

// Joins the preserved head and every block's verbatim lines using the detected EOL.
const renderRegistry = (r) => [...r.head, ...r.blocks.flatMap(b => b.lines)].join(r.eol);

module.exports = Object.assign(module.exports, {
  renderEntry, findBlock, fieldOf, setField, renderRegistry,
});
```

Notes on the behaviour:
- `renderRegistry` never re-renders a block it did not touch. Its `lines` are emitted exactly as parsed, so a status such as `weird` survives unchanged.
- `setField` only changes the one line it targets. Other lines and blank separators are not touched.
- `renderEntry` returns lines without a leading blank separator. `apply` adds `''` before each new entry, as the design does.
- Mixed line endings are not preserved per line. `eol` is whole-file, so byte identity holds for files that use one EOL style. That is the case for `REGISTRY.md` unless the live file says otherwise.
- The helpers never throw. Missing blocks or fields return `undefined` or `null`, and callers decide what that means.

Tests: the project test pattern (jest, `describe`/`test`/`expect`, per the AGENTS.md conventions) is for the TEST tasks, not this one. The verification below is a direct node assertion of the byte-identical and in-place-edit behaviour, which is what this BE task must prove.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const D='\u2014';const r={eol:'\n',head:['# Registry',''],blocks:[{id:'FTR-001',lines:['## FTR-001 '+D+' A','','**Status:** weird','']},{id:'FTR-002',lines:['## FTR-002 '+D+' B','','**Status:** defined']}]};const b=m.findBlock(r,'FTR-002');m.setField(b,'Status','epic');m.setField(b,'Parent','FTR-000');if(m.fieldOf(b,'Status')!=='epic'||m.fieldOf(b,'Parent')!=='FTR-000')process.exit(1);const want=['# Registry','','## FTR-001 '+D+' A','','**Status:** weird','','## FTR-002 '+D+' B','','**Status:** epic','**Parent:** FTR-000'].join('\n');if(m.renderRegistry(r)!==want)process.exit(1)"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```