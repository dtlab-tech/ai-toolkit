<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Add child feature.md renderer
- **Outcome:** feature-split.js has a renderChildDoc helper that outputs a child feature.md with title, summary from the purpose line, parent epic ID, dependency position, sibling dependencies (none for the first child) and assigned parts. The shared-foundation section is included only for the foundation owner.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-28
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add child feature document renderer

**Implementation notes:**

Target file: `src/claude/scripts/feature-split.js`. INFRA-TASK-BE-01 creates this file as a skeleton with `'use strict'`, `FeatureSplitError`, and the exports object. If the file or the `FeatureSplitError` class is missing, stop and report it. Do not create the file here.

Add one new internal function, `renderChildDoc(p, ctx)`, in the UC-04 apply section. Place it immediately before `function renderEpic(...)`. Keep it unexported. The design's export list does not include it, and the tests reach it only through `apply`.

Inputs:
- `p` is one entry of the apply `plan`. It has `p.id` (for example `FTR-012`), `p.name`, `p.summary`, `p.deps` (sibling IDs, empty for the first child), `p.assigned`, and `p.owner` (true only for the shared-foundation owner).
- `p.summary` is set by `normaliseChild` to the child's purpose line (D-11). The renderer uses `p.summary` and does not re-derive it.
- `ctx` is `{ parentId, position, total, foundationNote }`. `apply` computes `position` and `total` (1-based position in dependency order, and the total number of children including earlier late rows in late mode).

Code (the design's implementation, unchanged in behavior):

```javascript
function renderChildDoc(p, ctx) {                          // D-15
  return [
    `# ${p.name}`, '',
    '## Feature ID', p.id, '',
    '## Parent epic', `${ctx.parentId}. Position ${ctx.position} of ${ctx.total} in the dependency order.`, '',
    '## Summary', p.summary, '',
    '## Dependencies', `Depends on: ${p.deps.length ? p.deps.join(', ') : 'none'}`, '',
    '## Assigned parts', p.assigned, '',
    ...(p.owner ? ['## Shared foundation', ctx.foundationNote, ''] : []),
  ].join('\n');
}
```

Behavior to confirm when reading the code:
- The first child has `p.deps` equal to `[]`, so the Dependencies section reads `Depends on: none`.
- The `## Shared foundation` section is added only when `p.owner` is true. Non-owner children have no such heading at all, not an empty one.
- The output ends with a single trailing newline, because the last array element is `''`.
- The function is pure. It does no file I/O and does not touch `ctx` or `p`.

Do not change the child document's heading names. Downstream readers (the `epic.md` and registry tests) depend on them.

No other function in the file changes in this task.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const s=require('fs').readFileSync('src/claude/scripts/feature-split.js','utf8'); if(!/^function renderChildDoc\(p, ctx\)/m.test(s)) { console.error('renderChildDoc missing'); process.exit(1); } if(!/\.\.\.\(p\.owner \? \['## Shared foundation'/.test(s)) { console.error('shared-foundation guard missing'); process.exit(1); }"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```